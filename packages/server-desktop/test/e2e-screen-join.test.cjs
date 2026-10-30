/**
 * E2E test — desktop server (packages/server-desktop/server.js): LATE VIEWER JOIN.
 *
 * This covers the gap the 3.7.2 fix left open: the keyframe replay existed only
 * in the Electron/hardware checks, never in an automated test against
 * server-desktop itself (packages/server had its own test).
 *
 * Behaviour under test (v3.7.2 "black standalone window"):
 *   the agent only emits DELTA frames once a capture is running, so a viewer
 *   that joins an already-live session never learns the screen size and paints
 *   nothing. The server keeps the last FULL frame per device and replays it to
 *   every late joiner.
 *
 * Checks:
 *   A. first viewer starts capture (server:screen_start)
 *   B. full binary frame (50B agent header) reaches that viewer as a 13B packet
 *   C. a late joiner receives the cached full frame WITHOUT any agent traffic
 *   D. that replay is byte-identical to the frame the first viewer saw
 *   E. delta frames are forwarded as 21B packets (geometry preserved)
 *   F. joining does not restart the agent capture loop
 *   G. a third viewer gets a FULL frame, not the delta that followed it
 *   H. the cache still holds the original keyframe (deltas never overwrite it)
 *   I. the JSON frame path (agent:screen_frame) is replayed too
 *   J. agent:screen_closed clears the cache (no stale frame for the next viewer)
 *
 * Requires: better-sqlite3 built for Electron; run with the Electron binary and
 *           ELECTRON_RUN_AS_NODE=1.
 * Run: "packages\server-desktop\node_modules\electron\dist\electron.exe" packages/server-desktop/test/e2e-screen-join.test.cjs
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
const PORT = 3997
const SECRET = 'e2e-late-viewer-secret-at-least-32-characters-long'
const BASE = 'http://127.0.0.1:' + PORT

let failed = false
const results = []
function check(desc, cond, extra) {
  const ok = !!cond
  results.push({ desc: desc, ok: ok })
  if (ok) console.log('PASS: ' + desc)
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-join-'))
const dbPath = path.join(tmpDir, 'join.db')

function collect(ws, list) {
  ws.on('message', (data, isBinary) => {
    if (isBinary) list.push({ kind: 'binary', data: Buffer.from(data) })
    else { try { list.push({ kind: 'json', msg: JSON.parse(data.toString()) }) } catch {} }
  })
}
function open(ws) { return new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) }) }
function closeQuiet(ws) { try { ws.close() } catch {} }

/** Build the agent's 50-byte binary header + payload. */
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
const JPEG_DELTA = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0xAA, 0xBB, 0xCC, 0xFF, 0xD9])
const JPEG_JSON = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x77, 0x88, 0x99, 0xFF, 0xD9])

async function main() {
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger, desktopCallbacks: {}, tls: false })

  const health = await fetch(BASE + '/api/health').then((r) => r.json())
  check('desktop server boots (/api/health ok)', health.status === 'ok', JSON.stringify(health).slice(0, 80))

  // ── seed user + device directly in the DB ────────────────────────────────
  const dbc = new Database(dbPath)
  const userId = crypto.randomUUID()
  const devId = crypto.randomUUID()
  const devToken = crypto.randomUUID() + '-' + crypto.randomUUID()
  dbc.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)')
    .run(userId, 'join@local', 'Join', 'admin', 'x')
  dbc.prepare('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)')
    .run(devId, 'join-device', devToken, userId)
  dbc.close()

  const jwtToken = jwt.sign({ userId, email: 'join@local', role: 'admin' }, SECRET, { expiresIn: '1h' })
  async function ticket() {
    const r = await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: { Authorization: 'Bearer ' + jwtToken } }).then((x) => x.json())
    return r.ticket
  }

  // ── fake agent ───────────────────────────────────────────────────────────
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

  // ── A: first viewer starts the capture ───────────────────────────────────
  const v1msgs = []
  const viewer1 = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + (await ticket()) + '&fps=10&quality=80&maxWidth=1280')
  collect(viewer1, v1msgs)
  await open(viewer1)
  const start = await waitFor(agentMsgs, (m) => m.type === 'server:screen_start', 6000)
  const sid = start && start.payload.sessionId
  check('A. first viewer starts capture (server:screen_start)', !!sid)
  const startsAfterFirst = agentMsgs.filter((m) => m.type === 'server:screen_start').length

  // ── B: full frame reaches viewer #1 ──────────────────────────────────────
  agent.send(agentBinaryFrame(sid, 640, 480, 7, JPEG_FULL, false))
  const live = await waitFor(v1msgs, (x) => x.kind === 'binary' && x.data.length === 13 + JPEG_FULL.length, 5000)
  check('B. full frame → 13B packet', !!live &&
    live.data.readUInt32BE(0) === 640 && live.data.readUInt32BE(4) === 480 && live.data.readUInt32BE(8) === 7 && live.data[12] === 0)
  const liveTail = live ? live.data.slice(13) : Buffer.alloc(0)

  // ── C/D: late joiner gets the cached frame with no agent traffic ─────────
  const v2msgs = []
  const viewer2 = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + (await ticket()))
  collect(viewer2, v2msgs)
  await open(viewer2)
  const replay = await waitFor(v2msgs, (x) => x.kind === 'binary' && x.data.length >= 13, 4000)
  check('C. late joiner receives a full frame without any agent traffic', !!replay)
  check('D. replay is byte-identical to the live frame', !!replay && live &&
    replay.data.readUInt32BE(0) === 640 && replay.data.readUInt32BE(4) === 480 &&
    replay.data.readUInt32BE(8) === 7 && replay.data[12] === 0 &&
    Buffer.compare(replay.data.slice(13), liveTail) === 0)
  const vc = await waitFor(v2msgs, (x) => x.kind === 'json' && x.msg.type === 'screen:viewer_count' && x.msg.payload.count === 2, 4000)
  check('A2. viewer_count reaches 2', !!vc)

  // ── E: delta frames keep their geometry ──────────────────────────────────
  agent.send(agentBinaryFrame(sid, 640, 480, 8, JPEG_DELTA, true))
  const delta1 = await waitFor(v1msgs, (x) => x.kind === 'binary' && x.data.length === 21 + JPEG_DELTA.length, 5000)
  check('E. delta frame → 21B packet with dx/dy', !!delta1 &&
    delta1.data.readUInt32BE(8) === 8 && (delta1.data[12] & 2) !== 0 &&
    delta1.data.readUInt32BE(13) === 16 && delta1.data.readUInt32BE(17) === 24)

  // ── F: joining must not restart the capture ──────────────────────────────
  await sleep(400)
  const startsNow = agentMsgs.filter((m) => m.type === 'server:screen_start').length
  check('F. late joins do not restart the agent capture', startsNow === startsAfterFirst, startsNow + ' vs ' + startsAfterFirst)

  // ── G/H: a third viewer gets the keyframe, not the delta ─────────────────
  const v3msgs = []
  const viewer3 = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + (await ticket()))
  collect(viewer3, v3msgs)
  await open(viewer3)
  const replay3 = await waitFor(v3msgs, (x) => x.kind === 'binary' && x.data.length >= 13, 4000)
  check('G. third viewer receives a FULL frame (13B), not the delta', !!replay3 && replay3.data.length === 13 + JPEG_FULL.length)
  check('H. deltas never overwrite the cached keyframe (seq still 7)', !!replay3 &&
    replay3.data.readUInt32BE(8) === 7 && Buffer.compare(replay3.data.slice(13), JPEG_FULL) === 0)

  // ── I: JSON frame path replay ────────────────────────────────────────────
  agent.send(JSON.stringify({
    type: 'agent:screen_frame',
    payload: { sessionId: sid, data: JPEG_JSON.toString('base64'), width: 320, height: 200, seq: 9, keyframe: true },
    timestamp: Date.now()
  }))
  await waitFor(v1msgs, (x) => x.kind === 'json' && x.msg.type === 'screen:frame' && x.msg.payload.seq === 9, 4000)
  const v4msgs = []
  const viewer4 = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + (await ticket()))
  collect(viewer4, v4msgs)
  await open(viewer4)
  const replay4 = await waitFor(v4msgs, (x) => x.kind === 'json' && x.msg.type === 'screen:frame', 4000)
  check('I. JSON keyframe replayed to a late joiner (320x200)', !!replay4 &&
    replay4.msg.payload.width === 320 && replay4.msg.payload.height === 200 && replay4.msg.payload.seq === 9)

  // ── J: cache invalidation when the agent closes the screen ───────────────
  agent.send(JSON.stringify({ type: 'agent:screen_closed', payload: { sessionId: sid }, timestamp: Date.now() }))
  const closed = await waitFor(v1msgs, (x) => x.kind === 'json' && x.msg.type === 'screen:closed', 4000)
  check('J1. screen:closed relayed to viewers', !!closed)

  const startsBeforeNew = agentMsgs.filter((m) => m.type === 'server:screen_start').length
  const v5msgs = []
  const viewer5 = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + (await ticket()))
  collect(viewer5, v5msgs)
  await open(viewer5)
  await sleep(900)
  const startsAfterNew = agentMsgs.filter((m) => m.type === 'server:screen_start').length
  check('J2. next viewer starts a NEW capture (cache was cleared)', startsAfterNew > startsBeforeNew, startsBeforeNew + ' -> ' + startsAfterNew)
  const stale = v5msgs.find((x) => x.kind === 'binary' || (x.kind === 'json' && x.msg.type === 'screen:frame'))
  check('J3. no stale frame from the previous session is replayed', !stale)
  const err = v5msgs.find((x) => x.kind === 'json' && x.msg.type === 'screen:error')
  check('K. no screen:error for any late joiner', !err)

  // ── cleanup ──────────────────────────────────────────────────────────────
  for (const w of [viewer1, viewer2, viewer3, viewer4, viewer5, agent]) closeQuiet(w)
  await sleep(300)
  try { await srv.stop() } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}

  const total = results.length
  const passed = results.filter((r) => r.ok).length
  console.log('\n' + passed + '/' + total + ' checks passed')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('FATAL: ' + (e.stack || e.message)); process.exit(1) })