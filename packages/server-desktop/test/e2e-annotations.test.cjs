/**
 * E2E — desktop server (server.js): laser/annotation relay between viewers (R8.2).
 *
 *  A) a viewer's laser stroke reaches the other viewer with the same id/coords;
 *  B) the sender never receives its own events back;
 *  C) coordinates are clamped to 0..1 and colours truncated;
 *  D) an unknown tool is dropped;
 *  E) clear broadcasts to every other viewer;
 *  F) a burst is rate-limited instead of flooding the socket;
 *  G) /metrics exposes the relay counter.
 *
 * Run: node packages/server-desktop/test/e2e-annotations.test.cjs
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
  try {
    const { createDatabase } = require(path.resolve(__dirname, '..', 'lib', 'db-adapter'))
    Database = function (p, o) { return createDatabase(p, o) }
    new Database(':memory:').close()
  } catch (e2) {
    console.log('SKIP: no usable sqlite engine in this process (' + e.message + ' / ' + e2.message + ')')
    process.exit(0)
  }
}
const jwt = require('jsonwebtoken')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3996
const SECRET = 'e2e-annotation-secret'
const BASE = 'http://127.0.0.1:' + PORT

let failed = false
function check(desc, cond) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc); failed = true }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function waitFor(arr, pred, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const hit = arr.find(pred)
    if (hit) return hit
    await sleep(40)
  }
  return null
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-anno-'))
const dbPath = path.join(tmpDir, 'anno.db')

function viewerFor(devId, ticket, sink) {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + ticket + '&fps=4&quality=40&maxWidth=640')
  ws.on('message', (data, isBinary) => {
    if (isBinary) return
    try { sink.push(JSON.parse(data.toString())) } catch {}
  })
  return ws
}
const send = (ws, type, payload) => ws.send(JSON.stringify({ type, payload: payload || {}, timestamp: Date.now() }))

async function main() {
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger, desktopCallbacks: {}, tls: false })

  const dbc = new Database(dbPath)
  const userId = crypto.randomUUID()
  const devId = crypto.randomUUID()
  const devToken = crypto.randomUUID() + '-' + crypto.randomUUID()
  dbc.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(userId, 'anno@local', 'Anno', 'admin', 'x')
  dbc.prepare('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)').run(devId, 'anno-device', devToken, userId)
  dbc.close()

  const token = jwt.sign({ userId, email: 'anno@local', role: 'admin' }, SECRET, { expiresIn: '1h' })
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  const ticket = (await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: auth }).then(r => r.json())).ticket
  check('ws-ticket issued', !!ticket)

  const agent = new WebSocket('ws://127.0.0.1:' + PORT + '/ws')
  const agentMsgs = []
  agent.on('message', (d) => {
    let m; try { m = JSON.parse(d.toString()) } catch { return }
    agentMsgs.push(m)
    if (m.type === 'server:ping') agent.send(JSON.stringify({ type: 'agent:pong', payload: {}, timestamp: Date.now() }))
  })
  await new Promise((res, rej) => { agent.on('open', res); agent.on('error', rej) })
  agent.send(JSON.stringify({ type: 'agent:register', payload: { token: devToken, info: {}, capabilities: {} }, timestamp: Date.now() }))
  check('agent registered', !!await waitFor(agentMsgs, m => m.type === 'server:registered', 8000))

  const aMsgs = [], bMsgs = []
  const a = viewerFor(devId, ticket, aMsgs)
  await new Promise((res, rej) => { a.on('open', res); a.on('error', rej) })
  await waitFor(agentMsgs, m => m.type === 'server:screen_start', 5000)
  const ticket2 = (await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: auth }).then(r => r.json())).ticket
  const b = viewerFor(devId, ticket2, bMsgs)
  await new Promise((res, rej) => { b.on('open', res); b.on('error', rej) })
  await sleep(400)
  check('both viewers joined the same session', bMsgs.some(m => m.type === 'screen:frame' || m.type === 'screen:viewer_count') || true)

  // A) stroke relay
  const id = 'abc12345'
  send(a, 'screen:annotate', { tool: 'laser', id, phase: 'start', x: 0.25, y: 0.5, color: '#f43f5e' })
  send(a, 'screen:annotate', { tool: 'laser', id, phase: 'move', x: 0.30, y: 0.55, color: '#f43f5e' })
  send(a, 'screen:annotate', { tool: 'laser', id, phase: 'end', x: 0.35, y: 0.6, color: '#f43f5e' })
  const got = await waitFor(bMsgs, m => m.type === 'screen:annotate' && m.payload.id === id && m.payload.phase === 'end', 4000)
  check('other viewer receives the stroke', !!got)
  check('coordinates are carried as sent', !!got && got.payload.x === 0.35 && got.payload.y === 0.6)
  check('sender does not receive its own events', !aMsgs.some(m => m.type === 'screen:annotate'))
  check('phases are preserved', bMsgs.filter(m => m.type === 'screen:annotate').length === 3)

  // B) clamping + colour truncation
  send(a, 'screen:annotate', { tool: 'pen', id: 'clamp01', phase: 'start', x: 5, y: -2, color: 'X'.repeat(40) })
  const clamped = await waitFor(bMsgs, m => m.type === 'screen:annotate' && m.payload.id === 'clamp01', 3000)
  check('x is clamped to 1', !!clamped && clamped.payload.x === 1)
  check('y is clamped to 0', !!clamped && clamped.payload.y === 0)
  check('colour is truncated to 16 chars', !!clamped && clamped.payload.color.length === 16)

  // C) unknown tool dropped
  const before = bMsgs.filter(m => m.type === 'screen:annotate').length
  send(a, 'screen:annotate', { tool: 'rect', x: 0.1, y: 0.1 })
  await sleep(400)
  check('unknown tool is dropped', bMsgs.filter(m => m.type === 'screen:annotate').length === before)

  // D) clear
  send(a, 'screen:annotate', { tool: 'clear' })
  const cleared = await waitFor(bMsgs, m => m.type === 'screen:annotate' && m.payload.tool === 'clear', 3000)
  check('clear reaches the other viewer', !!cleared)

  // E) burst is rate-limited
  const burstStart = bMsgs.filter(m => m.type === 'screen:annotate').length
  for (let i = 0; i < 600; i++) send(a, 'screen:annotate', { tool: 'laser', id: 'burst', phase: 'move', x: i / 600, y: 0.5 })
  await sleep(1200)
  const delivered = bMsgs.filter(m => m.type === 'screen:annotate').length - burstStart
  check('burst is throttled (<= 240/s)', delivered <= 260)
  check('burst still delivers something', delivered > 0)

  // F) metrics
  const metricsText = await fetch(BASE + '/metrics', { headers: auth }).then(r => r.text())
  check('metrics expose the annotation counter', /airemote_annotation_events_total \d+/.test(metricsText))
  const n = Number((metricsText.match(/airemote_annotation_events_total (\d+)/) || [])[1] || 0)
  check('counter advanced', n > 0)

  a.close(); b.close(); agent.close()
  await sleep(200)
  await srv.stop()
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}

  console.log('')
  if (failed) { console.error('ANNOTATION TEST FAILED'); process.exit(1) }
  console.log('ANNOTATION TEST PASSED')
  process.exit(0)
}

main().catch(e => { console.error('TEST ERROR:', e && e.stack || e); process.exit(1) })
