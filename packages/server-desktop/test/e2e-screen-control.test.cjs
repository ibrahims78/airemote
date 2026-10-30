/**
 * E2E test — desktop server (server.js): interactive screen-control relay.
 *
 * Covers the fix for the dead remote-control path on the desktop server:
 *  A) agents connect with a PLAIN /ws URL (compat fallback) and register;
 *  B) viewer connect auto-starts capture with the viewer's fps/quality/maxWidth;
 *  C) mouse / keyboard / clipboard / monitors / control-consent messages are
 *     relayed to the agent with the session id, and agent responses are
 *     relayed back to the viewer;
 *  D) binary frames (50-byte agent header) are transformed to the 13-byte
 *     dashboard packet and delivered;
 *  E) multi-viewer join (no capture restart) and leave-flow (stop only on the
 *     last viewer);
 *  F) Round 8 — device authorization isolation: a non-owner user is denied on
 *     REST (devices / fs / wol / stats), WS screen + pty, and client:command,
 *     while admins keep full access.
 *
 * No real input is injected — a fake agent records what it receives.
 *
 * Requires: pnpm install --prod --filter "airemote-server-desktop"
 * Run:      node packages/server-desktop/test/e2e-screen-control.test.cjs
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
const SECRET = 'e2e-sdc-secret'
const BASE = 'http://127.0.0.1:' + PORT

let failed = false
function check(desc, cond) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc); failed = true }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(arr, pred, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const hit = arr.find(pred)
    if (hit) return hit
    await sleep(100)
  }
  return null
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-sdc-'))
const dbPath = path.join(tmpDir, 'sd.db')

let srv = null

async function wsTicketFor(token) {
  const r = await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' }).then((x) => x.json())
  return r.ticket
}

async function main() {
  srv = require(path.resolve(SERVER_DIR, 'server.js'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger, desktopCallbacks: {}, tls: false })

  const health = await fetch(BASE + '/api/health').then((r) => r.json())
  check('desktop server boots (/api/health ok)', health.status === 'ok')

  // ── seed user + device directly in the DB ─────────────────────────────────
  const dbc = new Database(dbPath)
  const userId = crypto.randomUUID()
  const devId = crypto.randomUUID()
  const devToken = crypto.randomUUID() + '-' + crypto.randomUUID()
  dbc.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(userId, 'e2e@local', 'E2E', 'admin', 'x')
  dbc.prepare('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)').run(devId, 'e2e-device', devToken, userId)
  dbc.close()

  const jwtToken = jwt.sign({ userId, email: 'e2e@local', role: 'admin' }, SECRET, { expiresIn: '1h' })
  const ticketRes = await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: { Authorization: 'Bearer ' + jwtToken } }).then((r) => r.json())
  check('ws-ticket issued', !!ticketRes.ticket)

  // ── fake agent (plain /ws URL — exercises the compatibility fallback) ─────
  const agent = new WebSocket('ws://127.0.0.1:' + PORT + '/ws')
  const agentMsgs = []
  agent.on('message', (data) => {
    let m; try { m = JSON.parse(data.toString()) } catch { return }
    agentMsgs.push(m)
    if (m.type === 'server:ping') agent.send(JSON.stringify({ type: 'agent:pong', payload: {}, timestamp: Date.now() }))
  })
  await new Promise((res, rej) => { agent.on('open', res); agent.on('error', rej) })
  agent.send(JSON.stringify({ type: 'agent:register', payload: { token: devToken, info: {}, capabilities: {} }, timestamp: Date.now() }))
  const reg = await waitFor(agentMsgs, (m) => m.type === 'server:registered', 8000)
  check('agent registered via plain /ws (compat fallback)', !!reg && reg.payload.deviceId === devId)

  // ── viewer #1 ─────────────────────────────────────────────────────────────
  const viewer1 = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + ticketRes.ticket + '&fps=5&quality=70&maxWidth=800')
  const v1msgs = []
  viewer1.on('message', (data, isBinary) => {
    if (isBinary) v1msgs.push({ type: '__binary', data: Buffer.from(data) })
    else { try { v1msgs.push(JSON.parse(data.toString())) } catch {} }
  })
  await new Promise((res, rej) => { viewer1.on('open', res); viewer1.on('error', rej) })

  const start = await waitFor(agentMsgs, (m) => m.type === 'server:screen_start', 5000)
  check('viewer connect auto-starts capture (server:screen_start)', !!start)
  const sid = start && start.payload.sessionId
  check('screen_start carries viewer params (fps=5, quality=70, maxWidth=800)',
    !!start && start.payload.fps === 5 && start.payload.quality === 70 && start.payload.maxWidth === 800)

  viewer1.send(JSON.stringify({ type: 'screen:mouse_event', payload: { type: 'move', x: 0.25, y: 0.5, button: 0 } }))
  const mouse = await waitFor(agentMsgs, (m) => m.type === 'server:screen_mouse', 4000)
  check('screen:mouse_event → server:screen_mouse + sessionId', !!mouse && mouse.payload.sessionId === sid && mouse.payload.x === 0.25)

  viewer1.send(JSON.stringify({ type: 'screen:key_event', payload: { type: 'press', key: 'م' } }))
  const key = await waitFor(agentMsgs, (m) => m.type === 'server:screen_key', 4000)
  check('screen:key_event → server:screen_key (Unicode preserved)', !!key && key.payload.sessionId === sid && key.payload.key === 'م')

  viewer1.send(JSON.stringify({ type: 'screen:request_control', payload: { requestId: 'req-1' } }))
  const req = await waitFor(agentMsgs, (m) => m.type === 'server:screen_control_request', 4000)
  check('control request relayed with requester identity', !!req && req.payload.requestId === 'req-1' && req.payload.requesterName === 'e2e@local')
  agent.send(JSON.stringify({ type: 'agent:screen_control_granted', payload: { sessionId: sid, requestId: 'req-1' }, timestamp: Date.now() }))
  const granted = await waitFor(v1msgs, (m) => m.type === 'screen:control_granted', 4000)
  check('consent grant relayed back to viewer', !!granted && granted.payload.requestId === 'req-1')

  viewer1.send(JSON.stringify({ type: 'screen:get_monitors', payload: {} }))
  const gm = await waitFor(agentMsgs, (m) => m.type === 'server:screen_get_monitors', 4000)
  check('monitors request relayed', !!gm)
  agent.send(JSON.stringify({ type: 'agent:screen_monitors', payload: { sessionId: sid, monitors: [{ id: 0, width: 1920, height: 1080 }] }, timestamp: Date.now() }))
  const mon = await waitFor(v1msgs, (m) => m.type === 'screen:monitors', 4000)
  check('monitors list relayed to viewer', !!mon && mon.payload.monitors.length === 1)

  // ── binary frame transform (50B → 13B) ────────────────────────────────────
  const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4, 5])
  const sidBuf = Buffer.alloc(36, 0)
  Buffer.from(sid, 'utf8').copy(sidBuf)
  const hdr = Buffer.alloc(50)
  hdr[0] = 0x01
  sidBuf.copy(hdr, 1)
  hdr.writeUInt32BE(640, 37); hdr.writeUInt32BE(480, 41); hdr.writeUInt32BE(7, 45); hdr[49] = 0
  agent.send(Buffer.concat([hdr, jpeg]))
  const bin = await waitFor(v1msgs, (m) => m.type === '__binary' && m.data.length === 13 + jpeg.length, 4000)
  const okBin = !!bin &&
    bin.data.readUInt32BE(0) === 640 && bin.data.readUInt32BE(4) === 480 &&
    bin.data.readUInt32BE(8) === 7 && bin.data[12] === 0 &&
    Buffer.compare(bin.data.slice(13), jpeg) === 0
  check('binary frame parsed (50B agent header) → forwarded as 13B dashboard packet', okBin)

  agent.send(JSON.stringify({ type: 'agent:screen_frame', payload: { sessionId: sid, data: 'AAAA', width: 320, height: 200, seq: 1, keyframe: true }, timestamp: Date.now() }))
  const jfr = await waitFor(v1msgs, (m) => m.type === 'screen:frame', 4000)
  check('JSON frame relayed with dimensions (320x200)', !!jfr && jfr.payload.width === 320 && jfr.payload.height === 200)

  viewer1.send(JSON.stringify({ type: 'screen:clipboard_read', payload: {} }))
  const cr = await waitFor(agentMsgs, (m) => m.type === 'server:screen_clipboard_read', 4000)
  check('clipboard read relayed', !!cr)
  agent.send(JSON.stringify({ type: 'agent:screen_clipboard', payload: { sessionId: sid, text: 'hello-clip' }, timestamp: Date.now() }))
  const clip = await waitFor(v1msgs, (m) => m.type === 'screen:clipboard', 4000)
  check('clipboard content relayed to viewer', !!clip && clip.payload.text === 'hello-clip')

  viewer1.send(JSON.stringify({ type: 'screen:ping', payload: { ts: 111 } }))
  const pong = await waitFor(v1msgs, (m) => m.type === 'screen:pong', 4000)
  check('screen:ping → screen:pong with clientTs', !!pong && pong.payload.clientTs === 111)

  // ── viewer #2 joins the same session ──────────────────────────────────────
  const t2 = await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: { Authorization: 'Bearer ' + jwtToken } }).then((r) => r.json())
  const viewer2 = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + t2.ticket)
  const v2msgs = []
  viewer2.on('message', (data, isBinary) => { if (!isBinary) { try { v2msgs.push(JSON.parse(data.toString())) } catch {} } })
  await new Promise((res, rej) => { viewer2.on('open', res); viewer2.on('error', rej) })
  const vc = await waitFor(v2msgs, (m) => m.type === 'screen:viewer_count' && m.payload.count === 2, 4000)
  check('second viewer joins existing session (viewer_count=2)', !!vc)
  const startsBefore = agentMsgs.filter((m) => m.type === 'server:screen_start').length
  await sleep(500)
  const startsAfter = agentMsgs.filter((m) => m.type === 'server:screen_start').length
  check('joining does NOT restart the agent capture loop', startsAfter === startsBefore)

  // ── leave flow ────────────────────────────────────────────────────────────
  viewer1.send(JSON.stringify({ type: 'screen:stop', payload: {} }))
  await sleep(600)
  const stopsAfterV1 = agentMsgs.filter((m) => m.type === 'server:screen_stop').length
  check('no capture stop while another viewer remains', stopsAfterV1 === 0)
  viewer2.close()
  // server keeps a 6s grace period before stopping capture (Android consent reuse) — wait longer
  const stop = await waitFor(agentMsgs, (m) => m.type === 'server:screen_stop' && m.payload.sessionId === sid, 12000)
  check('last viewer leaving stops the agent capture (sessionId match)', !!stop)

  agent.close()
  await sleep(300)

  // ── Round 8: device authorization isolation ───────────────────────────────
  const strangerId = crypto.randomUUID()
  const dbc2 = new Database(dbPath)
  dbc2.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(strangerId, 'stranger@local', 'Stranger', 'viewer', 'x')
  dbc2.close()
  const strangerJwt = jwt.sign({ userId: strangerId, email: 'stranger@local', role: 'viewer' }, SECRET, { expiresIn: '1h' })
  const HA = { Authorization: 'Bearer ' + jwtToken }
  const HS = { Authorization: 'Bearer ' + strangerJwt }

  const sList = await fetch(BASE + '/api/devices', { headers: HS }).then((r) => r.json())
  check('stranger device list excludes the admin device', Array.isArray(sList) && !sList.some((d) => d.id === devId))
  const aList = await fetch(BASE + '/api/devices', { headers: HA }).then((r) => r.json())
  check('admin device list includes the device', Array.isArray(aList) && aList.some((d) => d.id === devId))

  const sGet = await fetch(BASE + '/api/devices/' + devId, { headers: HS })
  check('stranger GET device → 403', sGet.status === 403)
  const aGet = await fetch(BASE + '/api/devices/' + devId, { headers: HA })
  check('admin GET device → 200', aGet.status === 200)

  const sFs = await fetch(BASE + '/api/devices/' + devId + '/fs?path=/', { headers: HS })
  check('stranger fs relay → 403', sFs.status === 403)
  const aFs = await fetch(BASE + '/api/devices/' + devId + '/fs?path=/', { headers: HA })
  check('admin fs relay passes gate (device offline → 502, not 403)', aFs.status !== 403 && aFs.status !== 200)

  const sWol = await fetch(BASE + '/api/devices/' + devId + '/wol', { method: 'POST', headers: HS })
  check('stranger WoL → 403', sWol.status === 403)
  const sHist = await fetch(BASE + '/api/devices/' + devId + '/stats/history', { headers: HS })
  check('stranger stats history → 403', sHist.status === 403)

  // WS — screen gate (stranger rejected before any capture session)
  const stk = await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: HS }).then((r) => r.json())
  const sScr = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + stk.ticket)
  const sScrMsgs = []
  sScr.on('message', (data, isBinary) => { if (!isBinary) { try { sScrMsgs.push(JSON.parse(data.toString())) } catch {} } })
  await new Promise((res) => { sScr.on('open', res); sScr.on('error', () => res()); sScr.on('close', () => res()) })
  const sErr = await waitFor(sScrMsgs, (m) => m.type === 'screen:error', 6000)
  check('stranger desktop /screen rejected (forbidden)', !!sErr && String(sErr.payload.message).indexOf('مصرح') !== -1)

  // WS — pty gate (socket closed, no session)
  const ptk = await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: HS }).then((r) => r.json())
  const sPty = new WebSocket('ws://127.0.0.1:' + PORT + '/pty?deviceId=' + devId + '&ticket=' + ptk.ticket)
  const sPtyClosed = await new Promise((res) => {
    const t = setTimeout(() => res(false), 5000)
    sPty.on('close', () => { clearTimeout(t); res(true) })
    sPty.on('error', () => { clearTimeout(t); res(true) })
  })
  check('stranger desktop /pty closed by gate', sPtyClosed)

  // WS — client snapshot filter + command gate
  const sCl = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?ticket=' + (await wsTicketFor(strangerJwt)))
  const sClMsgs = []
  sCl.on('message', (data) => { try { sClMsgs.push(JSON.parse(data.toString())) } catch {} })
  const sSnap = await waitFor(sClMsgs, (m) => m.type === 'server:snapshot', 6000)
  check('stranger snapshot excludes the admin device', !!sSnap && !(sSnap.payload.devices || []).some((d) => d.id === devId))
  sCl.send(JSON.stringify({ type: 'client:command', payload: { deviceId: devId, commandId: 'st-1', command: 'whoami' } }))
  // NOTE: the desktop server generates its own commandId for relays, so match on the error text
  const sDeny = await waitFor(sClMsgs, (m) => m.type === 'agent:command_result' && String(m.payload.error || '').indexOf('مصرح') !== -1, 6000)
  check('stranger desktop client:command denied', !!sDeny && String(sDeny.payload.error).indexOf('مصرح') !== -1)
  sCl.close()

  // WS — admin snapshot still includes the device
  const aCl = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?ticket=' + (await wsTicketFor(jwtToken)))
  const aClMsgs = []
  aCl.on('message', (data) => { try { aClMsgs.push(JSON.parse(data.toString())) } catch {} })
  const aSnap = await waitFor(aClMsgs, (m) => m.type === 'server:snapshot', 6000)
  check('admin snapshot includes the device', !!aSnap && (aSnap.payload.devices || []).some((d) => d.id === devId))
  aCl.close()

  await srv.stop()
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}

  if (failed) { console.error('DESKTOP-SERVER E2E FAILED'); process.exit(1) }
  console.log('ALL DESKTOP-SERVER E2E TESTS PASSED')
  process.exit(0) // fastify/rate-limit timers keep the loop alive otherwise
}

main().catch(async (err) => {
  console.error('harness error:', err && err.message)
  try { if (srv) await srv.stop() } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  process.exit(1)
})
