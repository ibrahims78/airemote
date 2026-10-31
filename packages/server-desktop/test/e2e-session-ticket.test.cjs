/**
 * E2E — 3.9.0: session view tickets (device→device)
 * Proves: no ticket before accept, ticket bound to session/device/access,
 * one-time for /screen, reuse rejected, wrong device rejected, close revokes.
 * Run with ELECTRON_RUN_AS_NODE=1 electron.
 */
'use strict'
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

let Database
try { Database = require('better-sqlite3'); new Database(':memory:').close() }
catch {
  try {
    const { createDatabase } = require(path.join(__dirname, '..', 'lib', 'db-adapter'))
    Database = function (p, o) { return createDatabase(p, o) }
    new Database(':memory:').close()
  } catch { console.log('SKIP: no sqlite'); process.exit(0) }
}
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

function loadWs () {
  try { return require('ws') } catch {}
  const base = path.resolve(__dirname, '..', '..', '..', 'node_modules', '.pnpm')
  try {
    for (const d of fs.readdirSync(base).filter(x => /^ws@/.test(x))) {
      try { return require(path.join(base, d, 'node_modules', 'ws')) } catch {}
    }
  } catch {}
  return null
}
const WebSocket = loadWs()
if (!WebSocket) { console.log('SKIP: ws'); process.exit(0) }

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3998
const SECRET = 'ticket-test-secret'
const BASE = 'http://127.0.0.1:' + PORT
process.env.SESSION_VIEW_TTL_MS = '1500'
process.env.RELAY_OFFER_TTL_MS = '4000'
process.env.RELAY_MAX_SESSIONS = '20'

let failed = 0
const check = (d, c, x) => { if (c) console.log('PASS: ' + d); else { console.error('FAIL: ' + d + (x ? '  (' + x + ')' : '')); failed++ } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function mkClient (ws) {
  const queue = []
  const waiters = []
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()) } catch { return }
    const i = waiters.findIndex(w => w.type === m.type)
    if (i >= 0) { const w = waiters.splice(i, 1)[0]; clearTimeout(w.t); w.resolve(m) } else queue.push(m)
  })
  return {
    ws, queue,
    send(o) { ws.send(JSON.stringify(o)) },
    next(type, ms = 5000) {
      const i = queue.findIndex(m => m.type === type)
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0])
      return new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), ms)
        waiters.push({ type, resolve, t })
      })
    },
    count(type) { return queue.filter(m => m.type === type).length }
  }
}

function connectAgent () {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?agent=1')
    ws.on('open', () => resolve(mkClient(ws)))
    ws.on('error', reject)
  })
}

async function openScreen (deviceId, rt) {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + encodeURIComponent(deviceId) + '&rt=' + encodeURIComponent(rt))
  let closed = false
  ws.on('close', () => { closed = true })
  ws.on('error', () => {})
  await Promise.race([
    new Promise(r => ws.on('open', r)),
    sleep(2000),
  ])
  await sleep(350)
  return { ws, closed: () => closed, close() { try { ws.close() } catch {} } }
}

;(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-ticket-'))
  const dbPath = path.join(tmp, 'test.db')
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger: { info() {}, warn() {}, error() {}, debug() {} }, desktopCallbacks: {}, tls: false })

  const ownerId = crypto.randomUUID()
  const strangerId = crypto.randomUUID()
  const devA = crypto.randomUUID(), devB = crypto.randomUUID(), devC = crypto.randomUUID()
  const tok = {}
  {
    const db = new Database(dbPath)
    const hash = bcrypt.hashSync('pw', 4)
    db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(ownerId, 'owner@t', 'Owner', 'manager', hash)
    db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(strangerId, 'stranger@t', 'Stranger', 'manager', hash)
    const ins = db.prepare('INSERT INTO devices (id,name,token,owner_id) VALUES (?,?,?,?)')
    for (const [id, name] of [[devA, 'requester-A'], [devB, 'target-B'], [devC, 'third-C']]) {
      tok[id] = crypto.randomUUID(); ins.run(id, name, tok[id], ownerId)
    }
    db.close()
  }

  const cA = await connectAgent()
  const cB = await connectAgent()
  for (const [c, id] of [[cA, devA], [cB, devB]]) {
    c.send({ type: 'agent:register', payload: { token: tok[id], info: { platform: 'windows' }, capabilities: {} } })
    await c.next('server:registered')
  }

  const req = (deviceToken, body) => fetch(BASE + '/api/relay/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': deviceToken },
    body: JSON.stringify(body),
  })
  const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) })
  const getSession = (t, id) => fetch(BASE + '/api/relay/' + id, { headers: { Authorization: 'Bearer ' + t } }).then(r => r.json())
  const tokOwner = jwt.sign({ userId: ownerId, email: 'owner@t', role: 'manager' }, SECRET, { expiresIn: '1h' })

  // T2a — deny: no ticket
  let r = await j(await req(tok[devA], { targetDeviceId: devB, access: 'view', requesterDeviceId: devA }))
  check('T2a. device-token request accepted (201)', r.status === 201 && r.body.state === 'requested', JSON.stringify(r.body))
  const offer = await cB.next('session:offer')
  check('T2b. offer carries accessLabel + passwordMode', !!offer && offer.payload.accessLabel === 'عرض فقط' && offer.payload.passwordMode === false, offer && JSON.stringify(offer.payload))
  check('T2c. no session:ticket before accept', cA.count('session:ticket') === 0)
  cB.send({ type: 'session:deny', payload: { sessionId: r.body.sessionId, reason: 'nope' } })
  const denied = await cA.next('session:denied')
  check('T2d. deny reaches requester', !!denied && denied.payload.sessionId === r.body.sessionId)
  check('T2e. no ticket after deny', cA.count('session:ticket') === 0)

  // T1 — accept → ticket
  r = await j(await req(tok[devA], { targetDeviceId: devB, access: 'view', requesterDeviceId: devA }))
  const sid = r.body.sessionId
  await cB.next('session:offer')
  cB.send({ type: 'session:accept', payload: { sessionId: sid } })
  const ticketMsg = await cA.next('session:ticket')
  check('T1a. accept issues session:ticket to requester', !!ticketMsg && ticketMsg.payload.sessionId === sid, JSON.stringify(ticketMsg && ticketMsg.payload))
  const rt = ticketMsg && ticketMsg.payload.ticket
  check('T1b. ticket is 64 hex', /^[0-9a-f]{64}$/.test(String(rt)))
  check('T1c. viewUrl points at /view/<target>?rt=', !!ticketMsg && ticketMsg.payload.viewUrl.startsWith('/view/' + devB + '?rt='))

  // T5/T6 — one-time + wrong device
  const s1 = await openScreen(devB, rt)
  check('T5a. first /screen with ticket opens', !s1.closed(), 'closed=' + s1.closed())
  s1.close()
  await sleep(250)
  const s2 = await openScreen(devB, rt)
  check('T5b. reused ticket is refused', s2.closed(), 'closed=' + s2.closed())
  s2.close()

  // fresh ticket for wrong-device test
  const vt = await fetch(BASE + '/api/relay/' + sid + '/view-ticket', { method: 'POST', headers: { 'X-Device-Token': tok[devA] } }).then(r => r.json())
  const s3 = await openScreen(devC, vt.ticket)
  check('T6. ticket bound to device (wrong device refused)', s3.closed(), 'closed=' + s3.closed())
  s3.close()

  // requester mismatch
  const mismatch = await j(await req(tok[devA], { targetDeviceId: devB, access: 'view', requesterDeviceId: devC }))
  check('T6b. requesterDeviceId mismatch refused', mismatch.status === 403 && mismatch.body.code === 'requester_mismatch', JSON.stringify(mismatch.body))

  // close revokes a fresh ticket
  const vt2 = await fetch(BASE + '/api/relay/' + sid + '/view-ticket', { method: 'POST', headers: { 'X-Device-Token': tok[devA] } }).then(r => r.json())
  await fetch(BASE + '/api/relay/' + sid + '/close', { method: 'POST', headers: { Authorization: 'Bearer ' + tokOwner, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'test' }) })
  await sleep(150)
  const s4 = await openScreen(devB, vt2.ticket)
  check('T5c. close revokes ticket', s4.closed(), 'closed=' + s4.closed())
  s4.close()

  // audit rows exist for issue/open/deny
  {
    const db = new Database(dbPath)
    const actions = db.prepare("SELECT action, COUNT(*) n FROM audit_log WHERE action LIKE 'session_view%' GROUP BY action").all()
    db.close()
    const map = Object.fromEntries(actions.map(x => [x.action, x.n]))
    check('T1d. ticket issued is audited', (map.session_view_ticket_issued || 0) >= 2, JSON.stringify(map))
    check('T1e. view opened is audited', (map.session_view_opened || 0) >= 1, JSON.stringify(map))
    check('T5d. denied/refused access is audited', (map.session_view_denied || 0) >= 2, JSON.stringify(map))
  }

  console.log(failed === 0 ? '\nALL SESSION TICKET CHECKS PASSED' : '\nFAILED: ' + failed)
  try { await srv.stop() } catch {}
  process.exit(failed === 0 ? 0 : 1)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
