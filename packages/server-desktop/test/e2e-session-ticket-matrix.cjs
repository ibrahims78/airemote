/**
 * 3.9.1 — session view ticket/key matrix (one process per case).
 *
 * Usage: electron test/e2e-session-ticket-matrix.cjs --case=<name>
 *   reuse           one-time ticket (T5) + resume key reopens after consumption (A1)
 *   third-device    ticket AND resume key are bound to the target device
 *   password-lock   5 wrong device passwords → 429 lock + audit
 *   expiry          expired ticket / expired resume key are refused
 *   view-no-control access=view cannot inject control messages
 *   revoke-on-close closing the session kills ticket and resume key
 *
 * Run with ELECTRON_RUN_AS_NODE=1 electron (better-sqlite3 ABI).
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

const CASE = (process.argv.find(a => a.startsWith('--case=')) || '').split('=')[1] || ''
const CASES = ['reuse', 'third-device', 'password-lock', 'expiry', 'view-no-control', 'revoke-on-close']
if (!CASES.includes(CASE)) { console.error('unknown --case, expected one of ' + CASES.join(', ')); process.exit(2) }

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3960 + CASES.indexOf(CASE)
const SECRET = 'matrix-secret-' + CASE
const BASE = 'http://127.0.0.1:' + PORT
process.env.SESSION_VIEW_TTL_MS = '60000'
process.env.RELAY_OFFER_TTL_MS = '8000'

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

async function openScreen (deviceId, cred) {
  const q = new URLSearchParams({ deviceId })
  if (cred.rt) q.set('rt', cred.rt)
  if (cred.rk) q.set('rk', cred.rk)
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?' + q.toString())
  let closed = false
  const messages = []
  ws.on('close', () => { closed = true })
  ws.on('message', (raw) => { try { messages.push(JSON.parse(raw.toString())) } catch {} })
  ws.on('error', () => {})
  await Promise.race([new Promise(r => ws.on('open', r)), sleep(2000)])
  await sleep(350)
  return { ws, messages, closed: () => closed, close() { try { ws.close() } catch {} } }
}

;(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-matrix-'))
  const dbPath = path.join(tmp, 'test.db')
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger: { info() {}, warn() {}, error() {}, debug() {} }, desktopCallbacks: {}, tls: false })

  const ownerId = crypto.randomUUID()
  const devA = crypto.randomUUID(), devB = crypto.randomUUID(), devC = crypto.randomUUID()
  const tok = {}
  {
    const db = new Database(dbPath)
    const hash = bcrypt.hashSync('pw', 4)
    db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(ownerId, 'owner@t', 'Owner', 'manager', hash)
    const ins = db.prepare('INSERT INTO devices (id,name,token,owner_id) VALUES (?,?,?,?)')
    for (const [id, name] of [[devA, 'requester-A'], [devB, 'target-B'], [devC, 'third-C']]) {
      tok[id] = crypto.randomUUID(); ins.run(id, name, tok[id], ownerId)
    }
    if (CASE === 'password-lock') {
      db.prepare('INSERT INTO device_unattended (device_id,password_hash,enabled) VALUES (?,?,1)').run(devB, bcrypt.hashSync('correct-horse', 6))
    }
    db.close()
  }

  const cA = await connectAgent()
  const cB = await connectAgent()
  for (const [c, id] of [[cA, devA], [cB, devB]]) {
    c.send({ type: 'agent:register', payload: { token: tok[id], info: { platform: 'windows' }, capabilities: {} } })
    await c.next('server:registered')
  }

  const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) })
  const request = (deviceToken, body) => fetch(BASE + '/api/relay/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': deviceToken },
    body: JSON.stringify(body),
  })
  const tokOwner = jwt.sign({ userId: ownerId, email: 'owner@t', role: 'manager' }, SECRET, { expiresIn: '1h' })
  const closeSession = (sid) => fetch(BASE + '/api/relay/' + sid + '/close', {
    method: 'POST', headers: { Authorization: 'Bearer ' + tokOwner, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'matrix' }),
  })
  const freshGrant = (sid) => fetch(BASE + '/api/relay/' + sid + '/view-ticket', { method: 'POST', headers: { 'X-Device-Token': tok[devA] } }).then(r => r.json())
  const audit = (action) => {
    const db = new Database(dbPath)
    const rows = db.prepare('SELECT details FROM audit_log WHERE action=? ORDER BY id DESC').all(action)
    db.close()
    return rows.map(r => String(r.details || ''))
  }
  async function acceptSession (access, extra) {
    const body = Object.assign({ targetDeviceId: devB, access, requesterDeviceId: devA }, extra || {})
    const r = await j(await request(tok[devA], body))
    if (r.status !== 201) return { error: r }
    await cB.next('session:offer')
    cB.send({ type: 'session:accept', payload: { sessionId: r.body.sessionId } })
    const t = await cA.next('session:ticket')
    return { sid: r.body.sessionId, ticket: t && t.payload.ticket, resumeKey: t && t.payload.resumeKey, viewUrl: t && t.payload.viewUrl, raw: r.body }
  }

  if (CASE === 'reuse') {
    const s = await acceptSession('view')
    check('reuse/1. accept issues ticket + resume key', !!s.ticket && /^[0-9a-f]{64}$/.test(String(s.resumeKey)), JSON.stringify({ t: !!s.ticket, k: !!s.resumeKey }))
    check('reuse/2. viewUrl carries rt and rk', /[?&]rt=/.test(String(s.viewUrl)) && /[?&]rk=/.test(String(s.viewUrl)), String(s.viewUrl).slice(0, 40) + '…')
    const first = await openScreen(devB, { rt: s.ticket, rk: s.resumeKey })
    check('reuse/3. first open (ticket) succeeds', !first.closed(), 'closed=' + first.closed())
    first.close(); await sleep(250)
    const again = await openScreen(devB, { rt: s.ticket })
    check('reuse/4. consumed ticket alone is refused (T5 preserved)', again.closed(), 'closed=' + again.closed())
    again.close()
    const resumed = await openScreen(devB, { rk: s.resumeKey })
    check('reuse/5. resume key reopens the same window', !resumed.closed(), 'closed=' + resumed.closed())
    resumed.close()
    check('reuse/6. reopen is audited as session_view_reopened', audit('session_view_reopened').length >= 1, 'rows=' + audit('session_view_reopened').length)
    check('reuse/7. opening is audited exactly once', audit('session_view_opened').length === 1, 'rows=' + audit('session_view_opened').length)
  }

  if (CASE === 'third-device') {
    const s = await acceptSession('view')
    const wrongTicket = await openScreen(devC, { rt: s.ticket, rk: s.resumeKey })
    check('third-device/1. third device refused', wrongTicket.closed(), 'closed=' + wrongTicket.closed())
    wrongTicket.close(); await sleep(150)
    const keyOnly = await openScreen(devC, { rk: s.resumeKey })
    check('third-device/2. resume key refused on a third device', keyOnly.closed(), 'closed=' + keyOnly.closed())
    keyOnly.close(); await sleep(150)
    const right = await openScreen(devB, { rk: s.resumeKey })
    check('third-device/3. correct device still resumes', !right.closed(), 'closed=' + right.closed())
    right.close()
  }

  if (CASE === 'password-lock') {
    const codes = []
    for (let i = 0; i < 4; i++) {
      const r = await j(await request(tok[devA], { targetDeviceId: devB, access: 'view', requesterDeviceId: devA, password: 'wrong-' + i }))
      codes.push(r.status + ':' + r.body.code + ':' + (r.body.attemptsLeft === undefined ? '-' : r.body.attemptsLeft))
      check('password-lock/' + (i + 1) + '. wrong password refused with attemptsLeft', r.status === 403 && r.body.code === 'bad_password' && r.body.attemptsLeft === 4 - i, JSON.stringify(r.body))
    }
    const fifth = await j(await request(tok[devA], { targetDeviceId: devB, access: 'view', requesterDeviceId: devA, password: 'wrong-5' }))
    check('password-lock/5. fifth failure locks (429 password_locked)', fifth.status === 429 && fifth.body.code === 'password_locked', JSON.stringify(fifth.body))
    const good = await j(await request(tok[devA], { targetDeviceId: devB, access: 'view', requesterDeviceId: devA, password: 'correct-horse' }))
    check('password-lock/6. correct password still refused while locked', good.status === 429 && good.body.code === 'password_locked', JSON.stringify(good.body))
    check('password-lock/7. lock is audited', audit('session_password_locked').length >= 1, 'rows=' + audit('session_password_locked').length)
    check('password-lock/8. failures are audited', audit('session_password_failed').length >= 4, 'rows=' + audit('session_password_failed').length)
  }

  if (CASE === 'expiry') {
    const s = await acceptSession('view')
    {
      const db = new Database(dbPath)
      const past = new Date(Date.now() - 60000).toISOString()
      db.prepare('UPDATE session_view_tickets SET expires_at=? WHERE session_id=?').run(past, s.sid)
      db.prepare('UPDATE session_view_keys SET expires_at=? WHERE session_id=?').run(past, s.sid)
      db.close()
    }
    const t = await openScreen(devB, { rt: s.ticket })
    check('expiry/1. expired ticket is refused', t.closed(), 'closed=' + t.closed())
    t.close(); await sleep(150)
    const k = await openScreen(devB, { rk: s.resumeKey })
    check('expiry/2. expired resume key is refused', k.closed(), 'closed=' + k.closed())
    k.close(); await sleep(150)
    const details = audit('session_view_denied').join(' | ')
    check('expiry/3. denial records ticket_expired', /ticket_expired/.test(details), details.slice(0, 120))
    check('expiry/4. denial records resume_expired', /resume_expired/.test(details), details.slice(0, 120))
  }

  if (CASE === 'view-no-control') {
    const s = await acceptSession('view')
    const v = await openScreen(devB, { rt: s.ticket, rk: s.resumeKey })
    check('view-no-control/1. viewer window opens', !v.closed(), 'closed=' + v.closed())
    const before = cB.count('server:screen_mouse')
    v.ws.send(JSON.stringify({ type: 'screen:mouse_event', payload: { x: 10, y: 10, action: 'click' } }))
    await sleep(500)
    check('view-no-control/2. control message rejected with access_denied', v.messages.some(m => m.type === 'screen:error' && m.payload && m.payload.code === 'access_denied'), JSON.stringify(v.messages.slice(-2)))
    check('view-no-control/3. agent never received the mouse event', cB.count('server:screen_mouse') === before, 'before=' + before + ' after=' + cB.count('server:screen_mouse'))
    check('view-no-control/4. attempt is audited', audit('session_view_denied').some(d => /screen:mouse_event/.test(d)), audit('session_view_denied').join('|').slice(0, 120))
    v.close()
  }

  if (CASE === 'revoke-on-close') {
    const s = await acceptSession('view')
    const grant = await freshGrant(s.sid)
    check('revoke-on-close/1. fresh grant carries ticket + key', !!grant.ticket && !!grant.resumeKey, JSON.stringify({ t: !!grant.ticket, k: !!grant.resumeKey }))
    await closeSession(s.sid)
    await sleep(200)
    const t = await openScreen(devB, { rt: grant.ticket })
    check('revoke-on-close/2. ticket dead after close', t.closed(), 'closed=' + t.closed())
    t.close(); await sleep(150)
    const k = await openScreen(devB, { rk: grant.resumeKey })
    check('revoke-on-close/3. resume key dead after close', k.closed(), 'closed=' + k.closed())
    k.close()
  }

  console.log(failed === 0 ? 'MATRIX CASE ' + CASE + ': PASS' : 'MATRIX CASE ' + CASE + ': FAILED ' + failed)
  try { await srv.stop() } catch {}
  process.exit(failed === 0 ? 0 : 1)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
