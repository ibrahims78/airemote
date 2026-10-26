/**
 * E2E test — desktop server (server.js): late-joiner full-frame replay.
 *
 * Closes the coverage gap left after v3.7.2: the web server (@airemote/server)
 * had an automated keyframe test, the Electron desktop server — which is the
 * one that actually runs on Win11 — did not.
 *
 * What it proves:
 *   A) a viewer that connects to an ALREADY RUNNING capture receives the last
 *      full frame immediately (otherwise the standalone window stays 300x150
 *      black behind the buffering overlay);
 *   B) joining does NOT restart the agent capture;
 *   C) the replayed frame is the last FULL frame, not a later delta;
 *   D) after the session closes the cache is cleared — no stale replay.
 *
 * Run:  node packages/server-desktop/test/e2e-screen-keyframe-desktop.test.cjs
 *       (under Electron: ELECTRON_RUN_AS_NODE=1 + electron.exe)
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
  Database = require('better-sqlite3')
  const probe = new Database(':memory:'); probe.close()
} catch (e) {
  console.log('SKIP: better-sqlite3 is not usable in this process (' + e.message + ')')
  console.log('      Run under the Electron binary with ELECTRON_RUN_AS_NODE=1.')
  process.exit(0)
}
const jwt = require('jsonwebtoken')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3997
const SECRET = 'k'.repeat(96)
const BASE = 'http://127.0.0.1:' + PORT

let failed = false
let passed = 0
function check(desc, cond, detail) {
  if (cond) { passed++; console.log('PASS: ' + desc + (detail ? '  — ' + detail : '')) }
  else { failed = true; console.error('FAIL: ' + desc + (detail ? '  — ' + detail : '')) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(arr, pred, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const hit = arr.find(pred)
    if (hit) return hit
    await sleep(80)
  }
  return null
}

function fullFrameHeader(sessionId, w, h, seq) {
  const hdr = Buffer.alloc(50)
  hdr[0] = 0x01
  const sid = Buffer.alloc(36, 0)
  Buffer.from(String(sessionId).slice(0, 36), 'utf8').copy(sid)
  sid.copy(hdr, 1)
  hdr.writeUInt32BE(w, 37); hdr.writeUInt32BE(h, 41); hdr.writeUInt32BE(seq, 45)
  hdr[49] = 0            // no delta bit => full frame
  return hdr
}
function deltaFrameHeader(sessionId, w, h, seq, dx, dy) {
  const hdr = Buffer.alloc(58)
  hdr[0] = 0x01
  const sid = Buffer.alloc(36, 0)
  Buffer.from(String(sessionId).slice(0, 36), 'utf8').copy(sid)
  sid.copy(hdr, 1)
  hdr.writeUInt32BE(w, 37); hdr.writeUInt32BE(h, 41); hdr.writeUInt32BE(seq, 45)
  hdr[49] = 0x02         // delta bit
  hdr.writeUInt32BE(dx, 50); hdr.writeUInt32BE(dy, 54)
  return hdr
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-kf-'))
  const dbPath = path.join(tmpDir, 'sd.db')

  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger, desktopCallbacks: {}, tls: false })
  check('desktop server boots', true)

  const dbc = new Database(dbPath)
  const userId = crypto.randomUUID()
  const devId = crypto.randomUUID()
  const devToken = crypto.randomUUID() + '-' + crypto.randomUUID()
  dbc.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(userId, 'kf@local', 'KF', 'admin', 'x')
  dbc.prepare('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)').run(devId, 'kf-device', devToken, userId)
  dbc.close()

  const jwtToken = jwt.sign({ userId, email: 'kf@local', role: 'admin' }, SECRET, { expiresIn: '1h' })
  const ticket1 = (await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: { Authorization: 'Bearer ' + jwtToken } }).then(r => r.json())).ticket
  const ticket2 = (await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: { Authorization: 'Bearer ' + jwtToken } }).then(r => r.json())).ticket
  const ticket3 = (await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: { Authorization: 'Bearer ' + jwtToken } }).then(r => r.json())).ticket
  check('ws tickets issued', !!ticket1 && !!ticket2 && !!ticket3)

  // ── fake agent ───────────────────────────────────────────────────────────
  const agent = new WebSocket('ws://127.0.0.1:' + PORT + '/ws')
  const agentMsgs = []
  agent.on('message', (d) => { let m; try { m = JSON.parse(d.toString()) } catch { return } agentMsgs.push(m) })
  await new Promise((res, rej) => { agent.on('open', res); agent.on('error', rej) })
  agent.send(JSON.stringify({ type: 'agent:register', payload: { token: devToken, info: {}, capabilities: {} }, timestamp: Date.now() }))
  const reg = await waitFor(agentMsgs, m => m.type === 'server:registered', 8000)
  check('agent registered', !!reg, reg && reg.payload.deviceId === devId)

  // ── viewer #1 starts the capture ─────────────────────────────────────────
  const v1 = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + ticket1 + '&fps=5')
  const v1msgs = []
  v1.on('message', (d, isBin) => { if (isBin) v1msgs.push({ type: '__binary', data: Buffer.from(d) }); else { try { v1msgs.push(JSON.parse(d.toString())) } catch {} } })
  await new Promise((res, rej) => { v1.on('open', res); v1.on('error', rej) })

  const startMsg = await waitFor(agentMsgs, m => m.type === 'server:screen_start', 6000)
  check('viewer #1 starts capture', !!startMsg)
  const sid = startMsg && startMsg.payload.sessionId

  const FULL = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x11, 0x22, 0x33, 0x44, 0x55])
  agent.send(Buffer.concat([fullFrameHeader(sid, 1600, 900, 1), FULL]))
  const gotFull = await waitFor(v1msgs, m => m.type === '__binary' && m.data.length === 13 + FULL.length, 5000)
  check('viewer #1 receives the full frame 1600x900',
    !!gotFull && gotFull.data.readUInt32BE(0) === 1600 && gotFull.data.readUInt32BE(4) === 900,
    gotFull ? gotFull.data.readUInt32BE(0) + 'x' + gotFull.data.readUInt32BE(4) : 'none')

  const DELTA = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x99, 0x88, 0x77, 0x66])
  agent.send(Buffer.concat([deltaFrameHeader(sid, 1600, 900, 2, 40, 60), DELTA]))
  const gotDelta = await waitFor(v1msgs, m => m.type === '__binary' && m.data.length === 21 + DELTA.length, 5000)
  check('viewer #1 receives the delta frame (21-byte header)',
    !!gotDelta && gotDelta.data[12] === 0x02 && gotDelta.data.readUInt32BE(13) === 40 && gotDelta.data.readUInt32BE(17) === 60)

  const startsBefore = agentMsgs.filter(m => m.type === 'server:screen_start').length

  // ── viewer #2 joins while the capture is already running ─────────────────
  const v2 = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + ticket2 + '&fps=5')
  const v2msgs = []
  v2.on('message', (d, isBin) => { if (isBin) v2msgs.push({ type: '__binary', data: Buffer.from(d) }); else { try { v2msgs.push(JSON.parse(d.toString())) } catch {} } })
  await new Promise((res, rej) => { v2.on('open', res); v2.on('error', rej) })

  const replayed = await waitFor(v2msgs, m => m.type === '__binary', 5000)
  check('late viewer receives a frame immediately without agent activity', !!replayed)
  check('replayed frame carries the real screen size 1600x900 (canvas would stay 300x150 otherwise)',
    !!replayed && replayed.data.readUInt32BE(0) === 1600 && replayed.data.readUInt32BE(4) === 900,
    replayed ? replayed.data.readUInt32BE(0) + 'x' + replayed.data.readUInt32BE(4) : 'none')
  check('replayed frame is the last FULL frame, not the newer delta',
    !!replayed && replayed.data.length === 13 + FULL.length &&
    Buffer.compare(replayed.data.slice(13), FULL) === 0 &&
    replayed.data[12] === 0,
    replayed ? 'len=' + replayed.data.length + ' flags=' + replayed.data[12] : 'none')

  await sleep(400)
  const startsAfter = agentMsgs.filter(m => m.type === 'server:screen_start').length
  check('joining does NOT restart the agent capture', startsAfter === startsBefore, startsBefore + ' -> ' + startsAfter)

  // deltas keep flowing to the late viewer too
  const DELTA2 = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x01, 0x02])
  agent.send(Buffer.concat([deltaFrameHeader(sid, 1600, 900, 3, 5, 6), DELTA2]))
  const delta2 = await waitFor(v2msgs, m => m.type === '__binary' && m.data.length === 21 + DELTA2.length, 5000)
  check('late viewer joins the live delta stream', !!delta2)

  // ── negative control: after close, nothing is replayed ───────────────────
  agent.send(JSON.stringify({ type: 'agent:screen_closed', payload: { sessionId: sid }, timestamp: Date.now() }))
  await sleep(500)
  const v3 = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + ticket3 + '&fps=5')
  const v3msgs = []
  v3.on('message', (d, isBin) => { if (isBin) v3msgs.push({ type: '__binary', data: Buffer.from(d) }); else { try { v3msgs.push(JSON.parse(d.toString())) } catch {} } })
  await new Promise((res, rej) => { v3.on('open', res); v3.on('error', rej) })
  const start2 = await waitFor(agentMsgs, m => m.type === 'server:screen_start' && m.payload.sessionId !== sid, 6000)
  check('after close a new viewer starts a NEW capture', !!start2)
  await sleep(600)
  check('no stale frame replayed after the session closed (negative control)', v3msgs.filter(m => m.type === '__binary').length === 0,
    'frames=' + v3msgs.filter(m => m.type === '__binary').length)

  try { v1.close(); v2.close(); v3.close(); agent.close() } catch {}
  await srv.stop()
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}

  console.log('\n' + (failed ? 'FAILED' : 'ALL PASSED') + ' — ' + passed + ' checks passed')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('HARNESS ERROR: ' + (e.stack || e.message)); process.exit(1) })