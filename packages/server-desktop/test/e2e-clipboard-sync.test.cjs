/**
 * E2E test — desktop server (server.js): one-way clipboard sync (R8).
 *
 * Covers the contract added in v3.8.36:
 *  A) sync is off by default and can only be turned on by a manager;
 *  B) "to-device" pushes viewer clipboard changes to the agent, one write each,
 *     duplicates are skipped by the SHA-256 echo guard;
 *  C) while pushing, a device-side change is dropped and counted (one-way);
 *  D) the reverse key flips the direction and the agent is told;
 *  E) while pulling, viewer changes are dropped and device changes reach the
 *     viewer as screen:clipboard_apply;
 *  F) turning sync off stops the agent watcher and stops forwarding;
 *  G) /metrics exposes the sync counters.
 *
 * No real clipboard is read: a fake agent records what it receives.
 *
 * Run: node packages/server-desktop/test/e2e-clipboard-sync.test.cjs
 *      (the battery runs it under the Electron binary — see scripts/verify.js)
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
const PORT = 3997
const SECRET = 'e2e-clipboard-secret'
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
    await sleep(40)
  }
  return null
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-clip-'))
const dbPath = path.join(tmpDir, 'clip.db')
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex')

async function main() {
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger, desktopCallbacks: {}, tls: false })

  const health = await fetch(BASE + '/api/health').then((r) => r.json())
  check('desktop server boots (/api/health ok)', health.status === 'ok')

  const dbc = new Database(dbPath)
  const userId = crypto.randomUUID()
  const devId = crypto.randomUUID()
  const devToken = crypto.randomUUID() + '-' + crypto.randomUUID()
  dbc.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(userId, 'clip@local', 'Clip', 'admin', 'x')
  dbc.prepare('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)').run(devId, 'clip-device', devToken, userId)
  dbc.close()

  const token = jwt.sign({ userId, email: 'clip@local', role: 'admin' }, SECRET, { expiresIn: '1h' })
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  const ticket = await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: auth }).then((r) => r.json())
  check('ws-ticket issued', !!ticket.ticket)

  // ── fake agent ─────────────────────────────────────────────────────────────
  const agent = new WebSocket('ws://127.0.0.1:' + PORT + '/ws')
  const agentMsgs = []
  agent.on('message', (data) => {
    let m; try { m = JSON.parse(data.toString()) } catch { return }
    agentMsgs.push(m)
    if (m.type === 'server:ping') agent.send(JSON.stringify({ type: 'agent:pong', payload: {}, timestamp: Date.now() }))
    if (m.type === 'server:screen_clipboard_watch') {
      // Real agents answer with the consent-aware ack.
      agent.send(JSON.stringify({
        type: 'agent:screen_clipboard_watch_ack',
        payload: { sessionId: m.payload.sessionId, watching: !!m.payload.enabled, direction: m.payload.direction },
        timestamp: Date.now()
      }))
    }
  })
  await new Promise((res, rej) => { agent.on('open', res); agent.on('error', rej) })
  agent.send(JSON.stringify({ type: 'agent:register', payload: { token: devToken, info: {}, capabilities: {} }, timestamp: Date.now() }))
  const reg = await waitFor(agentMsgs, (m) => m.type === 'server:registered', 8000)
  check('agent registered', !!reg)

  // ── viewer ─────────────────────────────────────────────────────────────────
  const viewer = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + devId + '&ticket=' + ticket.ticket + '&fps=4&quality=40&maxWidth=640')
  const vmsgs = []
  viewer.on('message', (data, isBinary) => {
    if (isBinary) return
    try { vmsgs.push(JSON.parse(data.toString())) } catch {}
  })
  await new Promise((res, rej) => { viewer.on('open', res); viewer.on('error', rej) })
  const sendV = (type, payload) => viewer.send(JSON.stringify({ type, payload: payload || {}, timestamp: Date.now() }))
  const sendA = (type, payload) => agent.send(JSON.stringify({ type, payload: payload || {}, timestamp: Date.now() }))

  await waitFor(agentMsgs, (m) => m.type === 'server:screen_start', 5000)
  check('capture session started', true)

  // ── A) default state ───────────────────────────────────────────────────────
  sendV('screen:clipboard_sync_state')
  const initialState = await waitFor(vmsgs, (m) => m.type === 'screen:clipboard_sync', 4000)
  check('sync is off by default', !!initialState && initialState.payload.enabled === false)
  check('default direction is to-device', initialState && initialState.payload.direction === 'to-device')

  const restOff = await fetch(BASE + '/api/devices/' + devId + '/clipboard-sync', { headers: auth }).then((r) => r.json())
  check('REST state endpoint answers', restOff.ok === true && restOff.enabled === false)

  const badDir = await fetch(BASE + '/api/devices/' + devId + '/clipboard-sync', {
    method: 'POST', headers: auth, body: JSON.stringify({ direction: 'sideways' })
  })
  check('REST rejects an unknown direction (400)', badDir.status === 400)

  // ── B) enable from REST, push from the viewer ─────────────────────────────
  const enabled = await fetch(BASE + '/api/devices/' + devId + '/clipboard-sync', {
    method: 'POST', headers: auth, body: JSON.stringify({ enabled: true })
  }).then((r) => r.json())
  check('REST enables sync', enabled.ok === true && enabled.enabled === true)

  const watch1 = await waitFor(agentMsgs, (m) => m.type === 'server:screen_clipboard_watch' && m.payload.enabled, 4000)
  check('agent is told to watch (to-device)', !!watch1 && watch1.payload.direction === 'to-device')

  const acked = await waitFor(vmsgs, (m) => m.type === 'screen:clipboard_sync' && m.payload.agentWatching === true, 4000)
  check('viewer sees agentWatching=true', !!acked)

  const push1 = 'clip-one-way-' + crypto.randomUUID()
  sendV('screen:clipboard_local', { text: push1 })
  const write1 = await waitFor(agentMsgs, (m) => m.type === 'server:screen_clipboard_write', 4000)
  check('push reaches the device with the same bytes', !!write1 && write1.payload.text === push1)

  // duplicate push (same text) → echo guard, no second write
  const beforeDup = agentMsgs.filter((m) => m.type === 'server:screen_clipboard_write').length
  sendV('screen:clipboard_local', { text: push1 })
  await sleep(400)
  const afterDup = agentMsgs.filter((m) => m.type === 'server:screen_clipboard_write').length
  check('identical text is not written twice', afterDup === beforeDup)

  // ── C) one-way: a device change while pushing is dropped ────────────────
  const applyBefore = vmsgs.filter((m) => m.type === 'screen:clipboard_apply').length
  sendA('agent:screen_clipboard_change', { text: 'device-side-' + crypto.randomUUID(), hash: sha('device-side-x'), at: Date.now() })
  await sleep(400)
  const applyAfter = vmsgs.filter((m) => m.type === 'screen:clipboard_apply').length
  check('device change is NOT forwarded while pushing', applyAfter === applyBefore)

  const blockedState = await fetch(BASE + '/api/devices/' + devId + '/clipboard-sync', { headers: auth }).then((r) => r.json())
  check('dropped change is counted', blockedState.blocked >= 1)
  check('push was counted once', blockedState.sent === 1)

  // ── D) reverse key ────────────────────────────────────────────────────────
  sendV('screen:clipboard_sync_reverse')
  const reversedState = await waitFor(vmsgs, (m) => m.type === 'screen:clipboard_sync' && m.payload.direction === 'to-viewer', 4000)
  check('reverse key flips the direction', !!reversedState)
  const watch2 = await waitFor(agentMsgs, (m) => m.type === 'server:screen_clipboard_watch' && m.payload.direction === 'to-viewer', 4000)
  check('agent is told to pull', !!watch2)

  // ── E) pull delivers, local changes are dropped ──────────────────────────
  const pullText = 'from-device-' + crypto.randomUUID()
  sendA('agent:screen_clipboard_change', { text: pullText, hash: sha(pullText), at: Date.now() })
  const applied = await waitFor(vmsgs, (m) => m.type === 'screen:clipboard_apply', 4000)
  check('device change reaches the viewer when pulling', !!applied && applied.payload.text === pullText)
  check('apply carries a short hash and a length', !!applied && applied.payload.hash.length === 12 && applied.payload.len === pullText.length)

  const writesBefore = agentMsgs.filter((m) => m.type === 'server:screen_clipboard_write').length
  sendV('screen:clipboard_local', { text: 'should-not-travel-' + crypto.randomUUID() })
  await sleep(400)
  const writesAfter = agentMsgs.filter((m) => m.type === 'server:screen_clipboard_write').length
  check('viewer change is NOT written while pulling', writesAfter === writesBefore)

  const pullState = await fetch(BASE + '/api/devices/' + devId + '/clipboard-sync', { headers: auth }).then((r) => r.json())
  check('pull was counted once', pullState.received === 1)
  check('blocked local change is counted', pullState.blocked >= 2)

  // ── F) disable ────────────────────────────────────────────────────────────
  sendV('screen:clipboard_sync_enable', { enabled: false })
  const watch3 = await waitFor(agentMsgs, (m) => m.type === 'server:screen_clipboard_watch' && m.payload.enabled === false, 4000)
  check('agent watcher is stopped on disable', !!watch3)

  const writesBeforeOff = agentMsgs.filter((m) => m.type === 'server:screen_clipboard_write').length
  sendV('screen:clipboard_local', { text: 'while-off-' + crypto.randomUUID() })
  await sleep(400)
  const writesAfterOff = agentMsgs.filter((m) => m.type === 'server:screen_clipboard_write').length
  check('nothing is written while sync is off', writesAfterOff === writesBeforeOff)

  // ── G) metrics ────────────────────────────────────────────────────────────
  const metricsText = await fetch(BASE + '/metrics', { headers: { Authorization: 'Bearer ' + token } }).then((r) => r.text())
  check('metrics expose the sync gauges', /airemote_clipboard_sync_enabled/.test(metricsText))
  check('metrics expose transfers and drops',
    /airemote_clipboard_sync_events_total/.test(metricsText) &&
    /airemote_clipboard_sync_blocked_total/.test(metricsText) &&
    /airemote_clipboard_sync_duplicates_total/.test(metricsText))

  // ── audit trail ───────────────────────────────────────────────────────────
  sendV('screen:clipboard_sync_enable', { enabled: true })
  await sleep(300)
  const dbc2 = new Database(dbPath)
  const audit = dbc2.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action LIKE 'clipboard_sync%'").get()
  dbc2.close()
  check('direction/enable changes are audited', Number(audit.c) >= 3)

  viewer.close()
  agent.close()
  await sleep(200)
  await srv.stop()
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}

  console.log('')
  if (failed) { console.error('CLIPBOARD SYNC TEST FAILED'); process.exit(1) }
  console.log('CLIPBOARD SYNC TEST PASSED')
  process.exit(0)
}

main().catch((e) => { console.error('TEST ERROR:', e && e.stack || e); process.exit(1) })
