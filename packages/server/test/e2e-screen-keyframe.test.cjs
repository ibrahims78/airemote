/**
 * e2e-screen-keyframe.test.cjs — a viewer that joins a RUNNING capture must
 * still get a full frame.
 *
 * Regression this guards (2026-10-26): the standalone window (/view/:id) opened
 * while the dashboard tile was already streaming stayed black — the joining
 * socket received delta frames only, so it never learned the screen size and the
 * canvas kept its default 300x150 backing store behind the buffering overlay.
 *
 * Method: real server (dist), one fake agent, two real /screen viewers.
 *   1. viewer A connects  -> new capture -> agent gets server:screen_start
 *   2. agent sends one full frame + deltas
 *   3. viewer B connects  -> joins the SAME session
 *   4. agent then sends NOTHING                       <-- key detail
 *   5. B must still receive a full frame (w/h real) within the timeout.
 *      Because no agent traffic follows, the only possible source is the
 *      server's keyframe replay. Remove that replay and this test fails.
 *
 * Run: node packages/server/test/e2e-screen-keyframe.test.cjs
 * Requires packages/server built (tsc) first.
 */
'use strict'

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const WebSocket = require('ws')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3998
const BASE = 'http://127.0.0.1:' + PORT
const WS_BASE = 'ws://127.0.0.1:' + PORT

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-kf-'))
const dbPath = path.join(tmpDir, 'kf.db')

const W = 1024
const H = 768
const FULL_BODY = Buffer.from([0xff, 0xd8, 0x11, 0x22, 0x33, 0xff, 0xd9])
const DELTA_BODY = Buffer.concat([Buffer.from([0, 0, 0, 16, 0, 0, 0, 24]), FULL_BODY])

let failed = false
function check(desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? ' — ' + extra : '')); failed = true }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJson(url, opts) {
  const res = await fetch(url, opts)
  let body = null
  try { body = await res.json() } catch {}
  return { status: res.status, body }
}

/** Agent -> server binary frame: [0x01][sessionId 36B][w][h][seq][flags][body] */
function agentFrame(sessionId, seq, flags, body) {
  const head = Buffer.alloc(50)
  head[0] = 0x01
  Buffer.from(sessionId, 'utf8').copy(head, 1, 0, 36)
  head.writeUInt32BE(W, 37)
  head.writeUInt32BE(H, 41)
  head.writeUInt32BE(seq, 45)
  head[49] = flags
  return Buffer.concat([head, body])
}

/** Viewer -> server binary frame: [w][h][seq][flags][body] */
function parseViewerFrame(buf) {
  if (buf.length < 13) return null
  return {
    w: buf.readUInt32BE(0),
    h: buf.readUInt32BE(4),
    seq: buf.readUInt32BE(8),
    flags: buf[12],
    full: (buf[12] & 2) === 0,
    bytes: buf.length
  }
}

let serverProc = null
let serverLog = ''

function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, ['dist/index.js'], {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: String(PORT), JWT_SECRET: 'e2e-keyframe-secret-0123456789abcdef', DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    serverProc.stdout.on('data', (d) => { serverLog += d.toString() })
    serverProc.stderr.on('data', (d) => { serverLog += d.toString() })
    serverProc.on('exit', (code) => { if (code && code !== 0) console.error('server exited ' + code) })

    const t0 = Date.now()
    const poll = async () => {
      try {
        const r = await fetchJson(BASE + '/health')
        if (r.status === 200) return resolve()
      } catch {}
      if (Date.now() - t0 > 25000) return reject(new Error('server did not become healthy'))
      setTimeout(poll, 300)
    }
    poll()
  })
}

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

async function ticket(adminToken) {
  const r = await fetchJson(BASE + '/api/auth/ws-ticket', {
    method: 'POST',
    body: '{}',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken }
  })
  return r.body && r.body.ticket
}

async function main() {
  await startServer()

  const setup = await fetchJson(BASE + '/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@e2e.local', password: 'E2e!Passw0rd-Kf', name: 'E2E Admin' })
  })
  const adminToken = setup.body && setup.body.token
  check('admin setup returns a token', !!adminToken, 'status ' + setup.status)

  const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken }
  const dev = await fetchJson(BASE + '/api/devices', {
    method: 'POST', headers: auth, body: JSON.stringify({ name: 'e2e-keyframe-device' })
  })
  const deviceId = dev.body && dev.body.id
  const deviceToken = dev.body && dev.body.token
  check('device created with id + token', !!deviceId && !!deviceToken)

  // ── fake agent ────────────────────────────────────────────────────────────
  const agent = await openWs(WS_BASE + '/ws')
  const agentMsgs = []
  agent.on('message', (raw) => {
    try { agentMsgs.push(JSON.parse(raw.toString())) } catch {}
  })
  agent.send(JSON.stringify({
    type: 'agent:register',
    payload: { token: deviceToken, info: { platform: 'win32', hostname: 'fake' }, stats: null, tunnelLayer: 'relay', capabilities: {} }
  }))

  // ── viewer A: opens the capture ───────────────────────────────────────────
  const wsA = await openWs(WS_BASE + '/screen?ticket=' + encodeURIComponent(await ticket(adminToken)) +
    '&deviceId=' + encodeURIComponent(deviceId) + '&fps=15&quality=60&maxWidth=1280')
  const framesA = []
  wsA.on('message', (raw, isBinary) => { if (isBinary) { const f = parseViewerFrame(raw); if (f) framesA.push(f) } })

  let sessionId = null
  for (let i = 0; i < 60 && !sessionId; i++) {
    const start = agentMsgs.find((m) => m.type === 'server:screen_start')
    if (start && start.payload && start.payload.sessionId) sessionId = start.payload.sessionId
    else await sleep(200)
  }
  check('agent received server:screen_start', !!sessionId)
  if (!sessionId) throw new Error('no capture session')

  agent.send(agentFrame(sessionId, 0, 0, FULL_BODY))          // full frame
  await sleep(120)
  agent.send(agentFrame(sessionId, 1, 2, DELTA_BODY))          // delta
  agent.send(agentFrame(sessionId, 2, 2, DELTA_BODY))          // delta
  await sleep(400)

  check('viewer A received frames', framesA.length >= 3, 'got ' + framesA.length)
  check('viewer A first frame is a full frame', framesA.length > 0 && framesA[0].full,
    framesA[0] ? 'flags=' + framesA[0].flags : 'none')

  // ── viewer B: joins the session that is already running ───────────────────
  const framesB = []
  const wsB = await openWs(WS_BASE + '/screen?ticket=' + encodeURIComponent(await ticket(adminToken)) +
    '&deviceId=' + encodeURIComponent(deviceId) + '&fps=15&quality=60&maxWidth=1280')
  wsB.on('message', (raw, isBinary) => { if (isBinary) { const f = parseViewerFrame(raw); if (f) framesB.push(f) } })

  // Deliberately send nothing from the agent from here on.
  const deadline = Date.now() + 4000
  while (Date.now() < deadline && framesB.length === 0) await sleep(100)

  check('viewer B received a frame with no further agent traffic (replay)', framesB.length > 0,
    'got ' + framesB.length)
  if (framesB.length) {
    check('viewer B frame is a FULL frame', framesB[0].full, 'flags=' + framesB[0].flags)
    check('viewer B learned the real screen size', framesB[0].w === W && framesB[0].h === H,
      framesB[0].w + 'x' + framesB[0].h)
  }

  // A second joining viewer must also be served, and the capture must not restart.
  const startsBefore = agentMsgs.filter((m) => m.type === 'server:screen_start').length
  const framesC = []
  const wsC = await openWs(WS_BASE + '/screen?ticket=' + encodeURIComponent(await ticket(adminToken)) +
    '&deviceId=' + encodeURIComponent(deviceId) + '&fps=15&quality=60&maxWidth=1280')
  wsC.on('message', (raw, isBinary) => { if (isBinary) { const f = parseViewerFrame(raw); if (f) framesC.push(f) } })
  const deadlineC = Date.now() + 4000
  while (Date.now() < deadlineC && framesC.length === 0) await sleep(100)
  check('a third viewer is also served the full frame', framesC.length > 0 && framesC[0].full)
  check('the capture was not restarted for late joiners',
    agentMsgs.filter((m) => m.type === 'server:screen_start').length === startsBefore)

  try { wsA.close() } catch {}
  try { wsB.close() } catch {}
  try { wsC.close() } catch {}
  try { agent.close() } catch {}
}

main()
  .then(() => { if (serverProc) serverProc.kill(); setTimeout(() => process.exit(failed ? 1 : 0), 300) })
  .catch((e) => {
    console.error('ERROR: ' + (e && e.message ? e.message : e))
    if (serverLog) console.error('--- server log tail ---\n' + serverLog.split('\n').slice(-25).join('\n'))
    if (serverProc) serverProc.kill()
    setTimeout(() => process.exit(1), 300)
  })
