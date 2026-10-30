/**
 * E2E test — server-desktop: FORCE KEYFRAME ON LATE JOIN (v3.8.12 / R1)
 *
 * السبب: بعد إصلاح R1 صار سطح المكتب الساكن لا يُرسل إطارات، والإطار الكامل
 * الدوري صار كل 15 ثانية. لذلك يجب أن يطلب السيرفر إطاراً كاملاً فورياً عند
 * التحاق مشاهد جديد، وإلا بقي المشاهد على صورة قديمة حتى الدوري.
 *
 * Checks:
 *   A. first viewer starts capture (server:screen_start reaches the agent)
 *   B. agent full frame reaches viewer A as a 13B binary packet
 *   C. late joiner B receives the cached full frame immediately
 *   D. the server asks the agent for a FRESH keyframe (server:force_keyframe)
 *   E. the request carries the SAME sessionId as the running session
 *   F. joining does not restart capture (no second server:screen_start)
 *
 * Requires: better-sqlite3 built for Electron; run with the Electron binary and
 *           ELECTRON_RUN_AS_NODE=1.
 * Run: "packages\\server-desktop\\node_modules\\electron\\dist\\electron.exe" packages/server-desktop/test/e2e-force-keyframe.test.cjs
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

function loadWs() {
  try { return require('ws') } catch {}
  return require(path.resolve(__dirname, '../../server/node_modules/ws'))
}
const WebSocket = loadWs()

let Database
try {
  Database = require(path.resolve(__dirname, '..', 'node_modules', 'better-sqlite3'))
  new Database(':memory:').close()
} catch (e) {
  // v3.8.26 - the server can now run on node:sqlite (Electron 44+). If the native module
  // cannot load in this process, fall back to the adapter instead of skipping the test.
  try {
    const { createDatabase } = require(path.resolve(__dirname, '..', 'lib', 'db-adapter'))
    Database = function (p, o) { return createDatabase(p, o) }
    new Database(':memory:').close()
  } catch (e2) {
    console.log('SKIP: no usable sqlite engine in this process (' + e.message + ' / ' + e2.message + ')')
    console.log('      Run under the Electron binary with ELECTRON_RUN_AS_NODE=1.')
    process.exit(0)
  }
}
const jwt = require('jsonwebtoken')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3998
const SECRET = 'test-secret-force-keyframe'
const BASE = 'http://127.0.0.1:' + PORT

let failed = false
function check(desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? '  (' + extra + ')' : '')); failed = true }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(arr, pred, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const hit = arr.find(pred)
    if (hit) return hit
    await sleep(50)
  }
  return null
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-fk-'))
const dbPath = path.join(tmpDir, 'fk.db')

function open(ws) { return new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) }) }
function closeQuiet(ws) { try { ws.close() } catch {} }

function agentBinaryFrame(sessionId, width, height, seq, jpeg, delta) {
  const hdr = Buffer.alloc(delta ? 58 : 50)
  hdr[0] = 0x01
  Buffer.from(String(sessionId), 'utf8').copy(hdr, 1)
  hdr.writeUInt32BE(width, 37)
  hdr.writeUInt32BE(height, 41)
  hdr.writeUInt32BE(seq, 45)
  hdr[49] = delta ? 0x02 : 0x00
  if (delta) { hdr.writeUInt32BE(16, 50); hdr.writeUInt32BE(24, 54) }
  return Buffer.concat([hdr, jpeg])
}

const JPEG_FULL = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x10, 0x20, 0x30, 0x40, 0x50, 0xFF, 0xD9])

async function main() {
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger, desktopCallbacks: {}, tls: false })

  const health = await fetch(BASE + '/api/health').then((r) => r.json())
  check('desktop server boots (/api/health ok)', health.status === 'ok', JSON.stringify(health).slice(0, 80))

  const dbc = new Database(dbPath)
  const userId = crypto.randomUUID()
  const devId = crypto.randomUUID()
  const devToken = crypto.randomUUID() + '-' + crypto.randomUUID()
  dbc.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)')
    .run(userId, 'fk@local', 'FK', 'admin', 'x')
  dbc.prepare('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)')
    .run(devId, 'fk-device', devToken, userId)
  dbc.close()

  const jwtToken = jwt.sign({ userId, email: 'fk@local', role: 'admin' }, SECRET, { expiresIn: '1h' })
  async function ticket() {
    const r = await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: { Authorization: 'Bearer ' + jwtToken } }).then((x) => x.json())
    return r.ticket
  }

  // ── fake agent ─────────────────────────────────────────────────────────────
  const agentMsgs = []
  const agent = new WebSocket('ws://127.0.0.1:' + PORT + '/ws')
  agent.on('message', (data, isBinary) => {
    if (isBinary) return
    let m; try { m = JSON.parse(data.toString()) } catch { return }
    agentMsgs.push(m)
    if (m.type === 'server:ping') agent.send(JSON.stringify({ type: 'agent:pong', payload: {}, timestamp: Date.now() }))
  })
  await open(agent)
  agent.send(JSON.stringify({ type: 'agent:register', payload: { token: devToken, info: {}, capabilities: {} }, timestamp: Date.now() }))
  const reg = await waitFor(agentMsgs, (m) => m.type === 'server:registered', 8000)
  check('agent registered', !!reg && reg.payload.deviceId === devId)

  // ── viewer A starts the capture ────────────────────────────────────────────
  const aFrames = []
  const a = new WebSocket(`ws://127.0.0.1:${PORT}/screen?binary=1&ticket=${await ticket()}&deviceId=${devId}`)
  a.on('message', (data, isBinary) => { if (isBinary) aFrames.push(Buffer.from(data)) })
  await open(a)
  const start = await waitFor(agentMsgs, (m) => m.type === 'server:screen_start', 8000)
  check('A. first viewer starts capture (server:screen_start)', !!start)
  const sessionId = start && start.payload && start.payload.sessionId

  agent.send(agentBinaryFrame(sessionId, 1600, 900, 1, JPEG_FULL, false))
  const aFirst = await waitFor(aFrames, (b) => b.length >= 13, 6000)
  check('B. agent full frame reaches viewer A as 13B packet', !!aFirst && aFirst.length === 13 + JPEG_FULL.length, aFirst ? 'len=' + aFirst.length : 'none')

  // ── viewer B joins late ────────────────────────────────────────────────────
  const bFrames = []
  const b = new WebSocket(`ws://127.0.0.1:${PORT}/screen?binary=1&ticket=${await ticket()}&deviceId=${devId}`)
  b.on('message', (data, isBinary) => { if (isBinary) bFrames.push(Buffer.from(data)) })
  await open(b)

  const inlineReplay = await waitFor(bFrames, () => true, 2000)
  check('C. late joiner B receives the cached full frame immediately', !!inlineReplay)

  const fk = await waitFor(agentMsgs, (m) => m.type === 'server:force_keyframe', 3000)
  check('D. server asks agent for a fresh keyframe (server:force_keyframe)', !!fk)
  check('E. request carries the running sessionId', !!fk && fk.payload && fk.payload.sessionId === sessionId, fk ? String(fk.payload && fk.payload.sessionId).slice(0, 8) : 'none')

  await sleep(500)
  const starts = agentMsgs.filter((m) => m.type === 'server:screen_start')
  check('F. joining does not restart capture', starts.length === 1, 'starts=' + starts.length)

  closeQuiet(a); closeQuiet(b); closeQuiet(agent)
  await sleep(200)

  console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL FORCE-KEYFRAME CHECKS PASSED')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1) })
