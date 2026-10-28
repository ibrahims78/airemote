/**
 * E2E — desktop server: binary / WebP / delta screen path (v3.8.2 → v3.8.5).
 *
 * What this proves (all through the real server, real sockets, no GUI):
 *  A) a viewer that asks for ?binary=1 makes the server negotiate binary:true
 *     with the agent;
 *  B) agent binary frames (0x01 + session + w/h/seq/flags + image) are relayed
 *     to that viewer as the compact 13-byte packet, payload byte-identical;
 *  C) delta frames carry the 21-byte header with dx/dy;
 *  D) the WebP flag (bit2) survives the relay, so the dashboard picks image/webp;
 *  E) a legacy viewer (no ?binary=1) still receives JSON + base64, now with
 *     webp:true and deltaRegion — older dashboards keep working;
 *  F) a late binary viewer gets the cached full frame as a BINARY packet and a
 *     late legacy viewer gets it as JSON (regression: the binary flag used to be
 *     set after the replay, so late binary viewers received text);
 *  G) frames from an unknown session are dropped;
 *  H) recording turns delta off on the agent and back on when it stops.
 *
 * Run (better-sqlite3 is built for Electron):
 *   $env:ELECTRON_RUN_AS_NODE=1
 *   node_modules\.pnpm\electron@28.3.3\node_modules\electron\dist\electron.exe packages\server-desktop\test\e2e-binary-frames.test.cjs
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
  console.log('SKIP: better-sqlite3 is not usable in this runtime: ' + e.message)
  process.exit(0)
}
const jwt = require('jsonwebtoken')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3997
const SECRET = 'e2e-binary-' + 'x'.repeat(30)
const BASE = 'http://127.0.0.1:' + PORT

let failed = 0
function check(desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? '  [' + extra + ']' : '')); failed++ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-bin-'))
const dbPath = path.join(tmpDir, 'bin.db')
let srv = null
const sockets = []

function track(ws) { sockets.push(ws); return ws }

async function waitUntil(fn, ms) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50) }
  return false
}

const W = 1280, H = 720
const KEYFRAME = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from('keyframe-body-0001')])
const DELTA = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from('delta-body-0002')])
const JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 9, 8, 7, 6, 5, 4])

function agentFrame(sid, seq, flags, payload, dx, dy) {
  const isDelta = (flags & 2) !== 0
  const head = Buffer.alloc(isDelta ? 58 : 50)
  head[0] = 0x01
  Buffer.from(sid, 'utf8').copy(head, 1, 0, 36)
  head.writeUInt32BE(W, 37)
  head.writeUInt32BE(H, 41)
  head.writeUInt32BE(seq, 45)
  head[49] = flags
  if (isDelta) { head.writeUInt32BE(dx, 50); head.writeUInt32BE(dy, 54) }
  return Buffer.concat([head, payload])
}

async function freshTicket(jwtToken) {
  const r = await fetch(BASE + '/api/auth/ws-ticket', {
    method: 'POST', headers: { Authorization: 'Bearer ' + jwtToken, 'Content-Type': 'application/json' }, body: '{}'
  }).then((x) => x.json())
  if (!r.ticket) throw new Error('no ws ticket')
  return r.ticket
}

function openViewer(devId, ticket, mode) {
  const extra = mode === 'legacy' ? '&binary=0' : (mode === 'binary' ? '&binary=1' : '')
  const url = 'ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + ticket + '&fps=5&quality=60&maxWidth=1280' + extra
  const ws = track(new WebSocket(url))
  ws.bin = []
  ws.json = []
  ws.on('message', (data, isBinary) => {
    if (isBinary) ws.bin.push(Buffer.from(data))
    else { try { ws.json.push(JSON.parse(data.toString())) } catch {} }
  })
  return new Promise((res, rej) => { ws.on('open', () => res(ws)); ws.on('error', rej) })
}

async function main() {
  srv = require(path.resolve(SERVER_DIR, 'server.js'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger, desktopCallbacks: {}, tls: false })

  const health = await fetch(BASE + '/api/health').then((r) => r.json())
  check('server boots and reports a version', health.status === 'ok' && !!health.version, JSON.stringify(health))

  // ── seed one admin + one device ────────────────────────────────────────────
  const dbc = new Database(dbPath)
  const userId = crypto.randomUUID()
  const devId = crypto.randomUUID()
  const devToken = crypto.randomUUID() + '-' + crypto.randomUUID()
  dbc.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(userId, 'bin@local', 'Bin', 'admin', 'x')
  dbc.prepare('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)').run(devId, 'bin-device', devToken, userId)
  dbc.close()

  const jwtToken = jwt.sign({ userId, email: 'bin@local', role: 'admin' }, SECRET, { expiresIn: '1h' })
  const ticket = (await fetch(BASE + '/api/auth/ws-ticket', {
    method: 'POST', headers: { Authorization: 'Bearer ' + jwtToken, 'Content-Type': 'application/json' }, body: '{}'
  }).then((r) => r.json())).ticket
  check('ws-ticket issued', !!ticket)

  // ── fake agent ─────────────────────────────────────────────────────────────
  const agent = track(new WebSocket('ws://127.0.0.1:' + PORT + '/ws'))
  const agentMsgs = []
  agent.on('message', (data, isBinary) => {
    if (isBinary) return
    let m; try { m = JSON.parse(data.toString()) } catch { return }
    agentMsgs.push(m)
    if (m.type === 'server:ping') agent.send(JSON.stringify({ type: 'agent:pong', payload: {} }))
  })
  await new Promise((res, rej) => { agent.on('open', res); agent.on('error', rej) })
  agent.send(JSON.stringify({ type: 'agent:register', payload: { token: devToken, info: { platform: 'Android', agentVersion: '3.8.5-android' }, capabilities: { android: true } } }))
  check('agent registered', await waitUntil(() => agentMsgs.some((m) => m.type === 'server:registered'), 8000))

  // ── viewers: one binary, one legacy ───────────────────────────────────────
  const vA = await openViewer(devId, await freshTicket(jwtToken), 'binary')
  await sleep(150)
  const vB = await openViewer(devId, await freshTicket(jwtToken), 'legacy')
  await sleep(150)

  const start = agentMsgs.find((m) => m.type === 'server:screen_start')
  check('viewer connect starts capture', !!start)
  check('screen_start negotiates binary:true with the agent', !!start && start.payload.binary === true, start && JSON.stringify(start.payload))
  const SID = start.payload.sessionId

  // ── 1. WebP keyframe ──────────────────────────────────────────────────────
  agent.send(agentFrame(SID, 1, 1 | 4, KEYFRAME))
  await sleep(300)

  const a1 = vA.bin[0]
  check('binary viewer got a binary frame', !!a1, 'bin=' + vA.bin.length + ' json=' + vA.json.length)
  check('binary packet header is 13 bytes + payload', !!a1 && a1.length === 13 + KEYFRAME.length, a1 && a1.length)
  check('binary packet carries w/h/seq', !!a1 && a1.readUInt32BE(0) === W && a1.readUInt32BE(4) === H && a1.readUInt32BE(8) === 1)
  check('keyframe + WebP flags preserved (0x05)', !!a1 && a1[12] === 0x05, a1 && '0x' + a1[12].toString(16))
  check('binary payload is byte-identical', !!a1 && a1.slice(13).equals(KEYFRAME))

  const b1 = vB.json.find((m) => m.type === 'screen:frame')
  check('legacy viewer got JSON screen:frame', !!b1, 'json=' + vB.json.length)
  check('legacy JSON marks webp:true', !!b1 && b1.payload.webp === true)
  check('legacy JSON base64 payload matches', !!b1 && Buffer.from(b1.payload.data, 'base64').equals(KEYFRAME))

  // ── 2. WebP delta with a changed rectangle ────────────────────────────────
  const beforeA = vA.bin.length
  agent.send(agentFrame(SID, 2, 2 | 4, DELTA, 16, 24))
  await sleep(300)

  const a2 = vA.bin[beforeA]
  check('binary viewer got the delta frame', !!a2, 'bin=' + vA.bin.length)
  check('delta packet header is 21 bytes', !!a2 && a2.length === 21 + DELTA.length, a2 && a2.length)
  check('delta flags preserved (0x06)', !!a2 && a2[12] === 0x06)
  check('delta rectangle carried (16,24)', !!a2 && a2.readUInt32BE(13) === 16 && a2.readUInt32BE(17) === 24)
  check('delta payload is byte-identical', !!a2 && a2.slice(21).equals(DELTA))

  const b2 = vB.json.filter((m) => m.type === 'screen:frame')[1]
  check('legacy JSON reports the delta region', !!b2 && b2.payload.deltaRegion && b2.payload.deltaRegion.x === 16 && b2.payload.deltaRegion.y === 24, b2 && JSON.stringify(b2.payload.deltaRegion))
  check('legacy JSON keeps webp:true on the delta', !!b2 && b2.payload.webp === true)

  // ── 3. JPEG keyframe (bit2 clear) ─────────────────────────────────────────
  const beforeA3 = vA.bin.length
  agent.send(agentFrame(SID, 3, 1, JPEG))
  await sleep(300)
  const a3 = vA.bin[beforeA3]
  check('JPEG keyframe flags are 0x01', !!a3 && a3[12] === 0x01, a3 && '0x' + a3[12].toString(16))
  const b3 = vB.json.filter((m) => m.type === 'screen:frame')[2]
  check('legacy JSON marks webp:false for JPEG', !!b3 && b3.payload.webp === false)


  // ── 5. late viewers get the cached full frame in their own format ────────
  const vC = await openViewer(devId, await freshTicket(jwtToken), 'binary')
  await sleep(350)
  check('late BINARY viewer got a binary replay', vC.bin.length === 1, 'bin=' + vC.bin.length + ' json=' + vC.json.length)
  check('late binary replay is the last full frame', vC.bin.length === 1 && vC.bin[0].length === 13 + JPEG.length && vC.bin[0].readUInt32BE(8) === 3)

  const vD = await openViewer(devId, await freshTicket(jwtToken), 'legacy')
  await sleep(350)
  check('late LEGACY viewer got a JSON replay', vD.json.some((m) => m.type === 'screen:frame'), 'json=' + vD.json.length)
  const d1 = vD.json.find((m) => m.type === 'screen:frame')
  check('late legacy replay is the last full frame', !!d1 && d1.payload.seq === 3 && d1.payload.webp === false)

  // ── 5b. a viewer with no format parameter keeps the historical default ───
  const vE = await openViewer(devId, await freshTicket(jwtToken), 'default')
  await sleep(350)
  check('viewer without ?binary keeps getting binary packets (back-compat)', vE.bin.length === 1, 'bin=' + vE.bin.length + ' json=' + vE.json.length)

  // ── 6. unknown session id falls back to the active session (compat) ──────
  const countA = vA.bin.length
  agent.send(agentFrame('00000000-0000-0000-0000-000000000000', 9, 2 | 4, DELTA, 8, 8))
  await sleep(250)
  check('unknown session id falls back to the active session', vA.bin.length === countA + 1, 'bin=' + vA.bin.length)

  // ── 7. recording turns delta off, then back on ───────────────────────────
  const beforeRec = agentMsgs.length
  vA.send(JSON.stringify({ type: 'screen:record_start', payload: {} }))
  const off = await (async () => { await waitUntil(() => agentMsgs.slice(beforeRec).some((m) => m.type === 'server:screen_set_delta'), 4000); return agentMsgs.slice(beforeRec).find((m) => m.type === 'server:screen_set_delta') })()
  check('record_start tells the agent to stop sending deltas', !!off && off.payload.delta === false, off && JSON.stringify(off.payload))
  const beforeStop = agentMsgs.length
  vA.send(JSON.stringify({ type: 'screen:record_stop', payload: {} }))
  const on = await (async () => { await waitUntil(() => agentMsgs.slice(beforeStop).some((m) => m.type === 'server:screen_set_delta'), 4000); return agentMsgs.slice(beforeStop).find((m) => m.type === 'server:screen_set_delta') })()
  check('record_stop restores deltas', !!on && on.payload.delta === true, on && JSON.stringify(on.payload))

  return { version: health.version }
}

async function cleanup() {
  for (const ws of sockets) { try { ws.close() } catch {} }
  try { if (srv && srv.stop) await srv.stop() } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
}

main()
  .then(async (info) => {
    await cleanup()
    console.log('\nRESULT ' + JSON.stringify({ failures: failed, version: info && info.version }))
    process.exit(failed ? 1 : 0)
  })
  .catch(async (e) => {
    console.error('ERROR ' + (e && e.stack || e))
    await cleanup()
    process.exit(1)
  })
