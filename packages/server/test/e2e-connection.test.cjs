/**
 * End-to-end connection-hardening test (Phase 0–1 evidence).
 *
 * Test A — server race over the real WS + REST stack:
 *   A late/abrupt close of a REPLACED agent socket must NOT remove the newer
 *   registration (guards the "device offline while connected" regression).
 *
 * Test B — real agent recovery:
 *   When the server rejects the agent's heartbeat (its socket was replaced),
 *   the real agent binary must re-register automatically.
 *
 * Test C — production secret policy:
 *   NODE_ENV=production without JWT_SECRET  -> server refuses to start.
 *   NODE_ENV=production with JWT_SECRET     -> server boots (health OK).
 *
 * Requires: packages/server + packages/agent built (dist/).
 * Run:      node packages/server/test/e2e-connection.test.cjs
 */
'use strict'

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const WebSocket = require('ws')

const SERVER_DIR = path.resolve(__dirname, '..')
const AGENT_DIR = path.resolve(__dirname, '../../agent')
const PORT = 3997
const BASE = 'http://127.0.0.1:' + PORT
const WS_URL = 'ws://127.0.0.1:' + PORT + '/ws'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-e2e-'))
const dbPath = path.join(tmpDir, 'e2e.db')

let failed = false
function check(desc, cond) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc); failed = true }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJson(url, opts) {
  const res = await fetch(url, opts)
  let body = null
  try { body = await res.json() } catch {}
  return { status: res.status, body }
}

let serverProc = null
let serverLog = ''

function startServer(extraEnv) {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, ['dist/index.js'], {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: String(PORT), JWT_SECRET: 'e2e-test-secret', DB_PATH: dbPath, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    serverProc.stdout.on('data', (d) => { serverLog += d.toString() })
    serverProc.stderr.on('data', (d) => { serverLog += d.toString() })
    serverProc.on('error', reject)
    const startedAt = Date.now()
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > 25000) { clearInterval(timer); reject(new Error('server did not become healthy in time')); return }
      try { const r = await fetch(BASE + '/health'); if (r.ok) { clearInterval(timer); resolve() } } catch {}
    }, 300)
  })
}

function stopServer() {
  if (serverProc) { try { serverProc.kill() } catch {} ; serverProc = null }
}

function wsConnect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

function waitFor(ws, predicate, timeoutMs) {
  timeoutMs = timeoutMs || 8000
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.removeListener('message', onMsg); reject(new Error('waitFor timeout')) }, timeoutMs)
    function onMsg(data) {
      let msg
      try { msg = JSON.parse(data.toString()) } catch { return }
      if (predicate(msg)) { clearTimeout(timer); ws.removeListener('message', onMsg); resolve(msg) }
    }
    ws.on('message', onMsg)
  })
}

const register = (ws, token) => ws.send(JSON.stringify({
  type: 'agent:register',
  payload: { token, info: {}, stats: null, tunnelLayer: 'relay', capabilities: {} },
  timestamp: Date.now(),
}))

async function main() {
  console.log('--- starting server (port ' + PORT + ', db=' + dbPath + ') ---')
  await startServer({})
  check('server boots with /health', true)

  // ── setup: admin + devices ────────────────────────────────────────────────
  const setup = await fetchJson(BASE + '/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'e2e@test.local', name: 'E2E', password: 'Test-Password-2026' }),
  })
  const adminToken = setup.body && setup.body.token
  check('admin setup returns token', !!adminToken)

  const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken }
  const devRes = await fetchJson(BASE + '/api/devices', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'e2e-device-1' }) })
  const devId = devRes.body && devRes.body.id
  const devToken = devRes.body && devRes.body.token
  check('device created with token', !!devId && !!devToken)

  async function isOnline(id) {
    const r = await fetchJson(BASE + '/api/devices', { headers: { Authorization: 'Bearer ' + adminToken } })
    const d = (r.body || []).find((x) => x.id === id)
    return !!(d && d.online)
  }

  // ── Test A: registration race, real protocol ──────────────────────────────
  const ITER = 15
  let raceFails = 0
  for (let i = 0; i < ITER; i++) {
    const A = await wsConnect()
    register(A, devToken)
    await waitFor(A, (m) => m.type === 'server:registered')
    const B = await wsConnect()
    register(B, devToken)
    await waitFor(B, (m) => m.type === 'server:registered')

    A.terminate()                       // abrupt death of the replaced socket
    await sleep(300)
    if (!(await isOnline(devId))) raceFails++

    B.terminate()                       // current socket closes
    await sleep(300)
    if (await isOnline(devId)) raceFails++
  }
  check('race loop: ' + ITER + ' iterations kept the device state consistent', raceFails === 0)

  // ── Test B: real agent re-registers after heartbeat rejection ─────────────
  const dev2Res = await fetchJson(BASE + '/api/devices', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'e2e-device-2' }) })
  const dev2Id = dev2Res.body.id
  const dev2Token = dev2Res.body.token

  const agentProc = spawn(process.execPath, ['dist/index.js'], {
    cwd: AGENT_DIR,
    env: { ...process.env, SERVER_URL: WS_URL, DEVICE_TOKEN: dev2Token, DEVICE_NAME: 'e2e-agent' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let agentLog = ''
  agentProc.stdout.on('data', (d) => { agentLog += d.toString() })
  agentProc.stderr.on('data', (d) => { agentLog += d.toString() })

  const waitUntil = async (cond, timeoutMs, label) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (await cond()) return true
      await sleep(400)
    }
    console.error('waitUntil timeout: ' + label)
    return false
  }

  check('real agent registered (device online)', await waitUntil(() => isOnline(dev2Id), 20000, 'agent online'))

  const countRegistrations = () => serverLog.split('id=' + dev2Id).length - 1
  const before = countRegistrations()
  check('server logged the registration', before >= 1)

  // Replace the agent's connection with a fake socket -> its heartbeats get rejected
  const C = await wsConnect()
  register(C, dev2Token)
  await waitFor(C, (m) => m.type === 'server:registered')

  const recovered = await waitUntil(() => countRegistrations() >= before + 1, 35000, 'agent auto re-register')
  check('real agent re-registered after heartbeat rejection', recovered)
  check('device online after recovery', await isOnline(dev2Id))

  agentProc.kill()
  try { C.terminate() } catch {}
  await sleep(600)

  // ── Test C: production secret policy ──────────────────────────────────────
  stopServer()
  serverLog = ''
  const badEnv = await new Promise((resolve) => {
    const p = spawn(process.execPath, ['dist/index.js'], {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: String(PORT), DB_PATH: dbPath, NODE_ENV: 'production', JWT_SECRET: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    p.stdout.on('data', (d) => { out += d.toString() })
    p.stderr.on('data', (d) => { out += d.toString() })
    const timer = setTimeout(() => { try { p.kill() } catch {} ; resolve({ code: null, out }) }, 8000)
    p.on('exit', (code) => { clearTimeout(timer); resolve({ code, out }) })
  })
  check('production without JWT_SECRET refuses to start (FATAL)', badEnv.code !== 0 && badEnv.out.includes('FATAL'))

  // v3.7.0 — strong secrets but no TLS must still refuse to boot
  const strongJwt = 'a'.repeat(48)
  const strongCreds = 'b'.repeat(48)
  const noTls = await new Promise((resolve) => {
    const p = spawn(process.execPath, ['dist/index.js'], {
      cwd: SERVER_DIR,
      env: {
        ...process.env, PORT: String(PORT), DB_PATH: dbPath, NODE_ENV: 'production',
        JWT_SECRET: strongJwt, CREDENTIALS_KEY: strongCreds, ALLOW_INSECURE_HTTP: ''
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    p.stdout.on('data', (d) => { out += d.toString() })
    p.stderr.on('data', (d) => { out += d.toString() })
    const timer = setTimeout(() => { try { p.kill() } catch {} ; resolve({ code: 0, out }) }, 5000)
    p.on('exit', (code) => { clearTimeout(timer); resolve({ code, out }) })
  })
  check('production without TLS refuses to start (FATAL)', noTls.code !== 0 && noTls.out.includes('TLS'))

  await startServer({ NODE_ENV: 'production', JWT_SECRET: strongJwt, CREDENTIALS_KEY: strongCreds, ALLOW_INSECURE_HTTP: '1' })
  check('production with strong secrets + explicit HTTP override boots (health OK)', true)
  stopServer()

  // ── cleanup + summary ─────────────────────────────────────────────────────
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  console.log('--- agent log tail ---')
  console.log(agentLog.split('\n').filter(Boolean).slice(-6).join('\n'))

  if (failed) { console.error('E2E CONNECTION TEST FAILED'); process.exit(1) }
  console.log('ALL E2E TESTS PASSED')
}

main().catch((err) => {
  console.error('E2E harness error:', err && err.message)
  console.error('--- server log tail ---')
  console.log(serverLog.split('\n').slice(-25).join('\n'))
  try { serverProc && serverProc.kill() } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  process.exit(1)
})
