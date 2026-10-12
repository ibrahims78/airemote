/**
 * E2E test — device authorization isolation (Round 8 hardening).
 *
 * Policy under test: admins may access every device; regular users may access
 * only the devices they own. Applies to REST (fs relay) and WS (screen / pty /
 * ssh / client:command / client:subscribe registry).
 *
 * Scenarios:
 *  A) REST fs endpoints — stranger → 403; owner/admin pass the gate (503/500).
 *  B) With the device ONLINE (fake agent): stranger /screen + /pty + /ssh are
 *     rejected with the forbidden error BEFORE any session is created.
 *  C) client:subscribe initial registry is filtered; client:command from a
 *     stranger is denied; the owner's command reaches the agent.
 *  D) Owner /screen passes the gate and the agent receives screen_start.
 *
 * Requires: packages/server built (dist/). No real input is injected.
 * Run:      node packages/server/test/e2e-authz.test.cjs
 */
'use strict'

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const WebSocket = require('ws')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3996
const BASE = 'http://127.0.0.1:' + PORT
const WSB = 'ws://127.0.0.1:' + PORT

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-authz-'))
const dbPath = path.join(tmpDir, 'authz.db')

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

function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, ['dist/index.js'], {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: String(PORT), JWT_SECRET: 'authz-e2e-secret-123', DB_PATH: dbPath, LOG_LEVEL: 'warn' },
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

function waitFor(ws, predicate, timeoutMs) {
  timeoutMs = timeoutMs || 8000
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.removeListener('message', onMsg); reject(new Error('waitFor timeout')) }, timeoutMs)
    function onMsg(data, isBinary) {
      if (isBinary) return
      let msg
      try { msg = JSON.parse(data.toString()) } catch { return }
      if (predicate(msg)) { clearTimeout(timer); ws.removeListener('message', onMsg); resolve(msg) }
    }
    ws.on('message', onMsg)
  })
}

function waitForArr(arr, predicate, timeoutMs) {
  const t0 = Date.now()
  return (async () => {
    while (Date.now() - t0 < timeoutMs) {
      const hit = arr.find(predicate)
      if (hit) return hit
      await sleep(100)
    }
    return null
  })()
}

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

const J = (t) => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + t })

async function main() {
  console.log('--- starting server (port ' + PORT + ', db=' + dbPath + ') ---')
  await startServer()
  check('server boots with /health', true)

  // ── bootstrap: admin, owner, stranger ─────────────────────────────────────
  const setup = await fetchJson(BASE + '/api/auth/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@authz.local', name: 'Admin', password: 'password123' }),
  })
  const adminToken = setup.body && setup.body.token
  check('admin setup returns token', !!adminToken)

  for (const [email, name] of [['owner@authz.local', 'Owner'], ['stranger@authz.local', 'Stranger']]) {
    const u = await fetchJson(BASE + '/api/users', {
      method: 'POST', headers: J(adminToken),
      body: JSON.stringify({ email, name, password: 'password123', role: 'viewer' }),
    })
    check('user created: ' + email, u.status === 201 && !!u.body.id)
  }

  const ownerLogin = await fetchJson(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@authz.local', password: 'password123' }),
  })
  const ownerToken = ownerLogin.body && ownerLogin.body.token
  const strangerLogin = await fetchJson(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'stranger@authz.local', password: 'password123' }),
  })
  const strangerToken = strangerLogin.body && strangerLogin.body.token
  check('owner login ok (role viewer)', !!ownerToken)
  check('stranger login ok (role viewer)', !!strangerToken)

  const devRes = await fetchJson(BASE + '/api/devices', { method: 'POST', headers: J(ownerToken), body: JSON.stringify({ name: 'authz-device-1' }) })
  const devId = devRes.body && devRes.body.id
  const devToken = devRes.body && devRes.body.token
  check('owner created a device', !!devId && !!devToken)

  // ── A) REST fs gates (device OFFLINE) ─────────────────────────────────────
  const fsList = (token) => fetchJson(BASE + '/api/devices/' + devId + '/fs/list?path=/', { headers: J(token) })
  const g1 = await fsList(strangerToken)
  check('stranger fs/list → 403', g1.status === 403)
  const g2 = await fsList(ownerToken)
  check('owner fs/list passes gate (503 offline, not 403)', g2.status === 503)
  const g3 = await fsList(adminToken)
  check('admin fs/list passes gate (503 offline, not 403)', g3.status === 503)

  const sDl = await fetchJson(BASE + '/api/devices/' + devId + '/fs/download?path=/etc/hosts', { headers: J(strangerToken) })
  check('stranger fs/download → 403', sDl.status === 403)
  const sMk = await fetchJson(BASE + '/api/devices/' + devId + '/fs/mkdir', { method: 'POST', headers: J(strangerToken), body: JSON.stringify({ path: '/tmp/x' }) })
  check('stranger fs/mkdir → 403', sMk.status === 403)
  const sRn = await fetchJson(BASE + '/api/devices/' + devId + '/fs/rename', { method: 'POST', headers: J(strangerToken), body: JSON.stringify({ oldPath: '/a', newPath: '/b' }) })
  check('stranger fs/rename → 403', sRn.status === 403)
  const sDel = await fetchJson(BASE + '/api/devices/' + devId + '/fs/delete', { method: 'POST', headers: J(strangerToken), body: JSON.stringify({ path: '/a' }) })
  check('stranger fs/delete → 403', sDel.status === 403)

  // ── B) bring the device ONLINE with a fake agent ──────────────────────────
  const agent = await wsConnect(WSB + '/ws')
  const agentMsgs = []
  agent.on('message', (data, isBinary) => {
    if (isBinary) return
    let m; try { m = JSON.parse(data.toString()) } catch { return }
    agentMsgs.push(m)
    if (m.type === 'server:ping') agent.send(JSON.stringify({ type: 'agent:pong', payload: {}, timestamp: Date.now() }))
  })
  agent.send(JSON.stringify({ type: 'agent:register', payload: { token: devToken, info: {}, stats: null, tunnelLayer: 'relay', capabilities: {} }, timestamp: Date.now() }))
  const reg = await waitFor(agent, (m) => m.type === 'server:registered', 8000)
  check('fake agent registered (device online)', !!reg && reg.payload.deviceId === devId)

  // ── B2) stranger screen / pty / ssh rejected BEFORE session creation ──────
  const st1 = await fetchJson(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: J(strangerToken), body: '{}' })
  const sScreen = new WebSocket(WSB + '/screen?deviceId=' + devId + '&ticket=' + st1.body.ticket)
  const sScrMsgs = []
  sScreen.on('message', (data, isBinary) => { if (!isBinary) { try { sScrMsgs.push(JSON.parse(data.toString())) } catch {} } })
  sScreen.on('close', (code, reason) => { sScrMsgs.push({ type: '__close', code, reason: String(reason) }) })
  await new Promise((res) => { sScreen.on('open', res); sScreen.on('error', () => res()); sScreen.on('close', () => res()) })
  const sErr = await waitForArr(sScrMsgs, (m) => m.type === 'screen:error', 6000)
  if (!sErr) console.log('DEBUG sScreen msgs:', JSON.stringify(sScrMsgs))
  check('stranger /screen rejected with forbidden (device is ONLINE)', !!sErr && String(sErr.payload.message).includes('مصرح'))
  await sleep(200)
  check('stranger /screen produced NO capture start for the agent',
    agentMsgs.filter((m) => m.type === 'server:screen_start').length === 0)

  const sPty = await wsConnect(WSB + '/pty?token=' + encodeURIComponent(strangerToken))
  sPty.send(JSON.stringify({ type: 'pty:connect', payload: { deviceId: devId, rows: 24, cols: 80 } }))
  const pErr = await waitFor(sPty, (m) => m.type === 'pty:error', 6000).catch(() => null)
  check('stranger /pty rejected with forbidden', !!pErr && String(pErr.payload.message).includes('مصرح'))

  const sSsh = await wsConnect(WSB + '/ssh?token=' + encodeURIComponent(strangerToken))
  sSsh.send(JSON.stringify({ type: 'ssh:connect', payload: { deviceId: devId, host: '10.0.0.1', username: 'root' } }))
  const sshErr = await waitFor(sSsh, (m) => m.type === 'ssh:error', 6000).catch(() => null)
  check('stranger /ssh rejected with forbidden', !!sshErr && String(sshErr.payload.message).includes('مصرح'))

  // ── C) client registry + command gates ────────────────────────────────────
  const sCl = await wsConnect(WSB + '/ws?token=' + encodeURIComponent(strangerToken))
  const sClMsgs = []
  sCl.on('message', (data, isBinary) => { if (!isBinary) { try { sClMsgs.push(JSON.parse(data.toString())) } catch {} } })
  sCl.send(JSON.stringify({ type: 'client:subscribe', payload: { userId: 'ignored', deviceIds: [devId] }, timestamp: Date.now() }))
  const sReg = await waitForArr(sClMsgs, (m) => m.type === 'server:registered', 6000)
  check('stranger subscribe: onlineDevices filtered (device absent)', !!sReg && !(sReg.payload.onlineDevices || []).includes(devId))
  sCl.send(JSON.stringify({ type: 'client:command', payload: { deviceId: devId, commandId: 'st-1', command: 'whoami' }, timestamp: Date.now() }))
  const sDeny = await waitForArr(sClMsgs, (m) => m.type === 'server:error' && m.payload.commandId === 'st-1', 6000)
  check('stranger client:command denied (Forbidden)', !!sDeny && String(sDeny.payload.message).includes('Forbidden'))
  check('stranger command never reached the agent', agentMsgs.filter((m) => m.type === 'server:command').length === 0)
  sCl.close()

  const aCl = await wsConnect(WSB + '/ws?token=' + encodeURIComponent(adminToken))
  const aClMsgs = []
  aCl.on('message', (data, isBinary) => { if (!isBinary) { try { aClMsgs.push(JSON.parse(data.toString())) } catch {} } })
  aCl.send(JSON.stringify({ type: 'client:subscribe', payload: {}, timestamp: Date.now() }))
  const aReg = await waitForArr(aClMsgs, (m) => m.type === 'server:registered', 6000)
  check('admin subscribe: onlineDevices includes the device', !!aReg && (aReg.payload.onlineDevices || []).includes(devId))
  aCl.close()

  // Owner command passes the gate and reaches the agent
  const oCl = await wsConnect(WSB + '/ws?token=' + encodeURIComponent(ownerToken))
  const oClMsgs = []
  oCl.on('message', (data, isBinary) => { if (!isBinary) { try { oClMsgs.push(JSON.parse(data.toString())) } catch {} } })
  oCl.send(JSON.stringify({ type: 'client:subscribe', payload: {}, timestamp: Date.now() }))
  await waitForArr(oClMsgs, (m) => m.type === 'server:registered', 6000)
  oCl.send(JSON.stringify({ type: 'client:command', payload: { deviceId: devId, commandId: 'own-1', command: 'whoami' }, timestamp: Date.now() }))
  const relayed = await waitFor(agent, (m) => m.type === 'server:command' && m.payload.commandId === 'own-1', 6000).catch(() => null)
  check('owner client:command reaches the agent (gate passed)', !!relayed)
  oCl.close()

  // ── D) owner /screen passes the gate and starts capture ───────────────────
  const ot = await fetchJson(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: J(ownerToken), body: '{}' })
  const oScreen = new WebSocket(WSB + '/screen?deviceId=' + devId + '&ticket=' + ot.body.ticket)
  const oScrMsgs = []
  oScreen.on('message', (data, isBinary) => { if (!isBinary) { try { oScrMsgs.push(JSON.parse(data.toString())) } catch {} } })
  oScreen.on('close', (code, reason) => { oScrMsgs.push({ type: '__close', code, reason: String(reason) }) })
  await new Promise((res) => { oScreen.on('open', res); oScreen.on('error', () => res()); oScreen.on('close', () => res()) })
  const start = await waitForArr(agentMsgs, (m) => m.type === 'server:screen_start', 6000)
  if (!start) console.log('DEBUG oScreen msgs:', JSON.stringify(oScrMsgs), 'agentMsgs tail:', JSON.stringify(agentMsgs.slice(-4)))
  check('owner /screen passes gate → agent receives screen_start', !!start)
  oScreen.close()

  // ── cleanup ───────────────────────────────────────────────────────────────
  try { sScreen.close() } catch {}
  try { sPty.close() } catch {}
  try { sSsh.close() } catch {}
  try { agent.close() } catch {}
  stopServer()
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}

  if (failed) { console.error('E2E AUTHZ TEST FAILED'); process.exit(1) }
  console.log('ALL E2E AUTHZ TESTS PASSED')
}

main().catch((err) => {
  console.error('E2E harness error:', err && err.message)
  console.error('--- server log tail ---')
  console.log(serverLog.split('\n').slice(-25).join('\n'))
  try { serverProc && serverProc.kill() } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  process.exit(1)
})
