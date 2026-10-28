/**
 * E2E security test — server-desktop (R2)
 *
 * يثبت أو يكشف:
 *   A. login محدود المحاولات (429 بعد 5/دقيقة)
 *   B. verify-totp محدود المحاولات
 *   C. refresh محدود المحاولات
 *   D. ws-ticket: رمز أحادي الاستخدام فعلاً
 *   E. ws-ticket: محدود المحاولات
 *   F. مصفوفة الصلاحيات: viewer لا يصل /api/audit ولا /api/users
 *   G. مصفوفة الصلاحيات: admin يصل
 *   H. التدقيق يسجّل فشل الدخول ونجاحه
 *
 * Run: ELECTRON_RUN_AS_NODE=1 "packages\\server-desktop\\node_modules\\electron\\dist\\electron.exe" packages/server-desktop/test/e2e-security.test.cjs
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
  console.log('SKIP: better-sqlite3 is not usable under Node in this checkout (built for Electron).')
  process.exit(0)
}
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3996
const SECRET = 'test-secret-security'
const BASE = 'http://127.0.0.1:' + PORT

let failed = 0
function check(desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? '  (' + extra + ')' : '')); failed++ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-sec-'))
const dbPath = path.join(tmpDir, 'sec.db')

async function main() {
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger, desktopCallbacks: {}, tls: false })

  const hash = bcrypt.hashSync('correct-horse', 4)
  const dbc = new Database(dbPath)
  const adminId = crypto.randomUUID()
  const viewerId = crypto.randomUUID()
  const devId = crypto.randomUUID()
  dbc.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(adminId, 'admin@sec', 'Admin', 'admin', hash)
  dbc.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(viewerId, 'viewer@sec', 'Viewer', 'viewer', hash)
  dbc.prepare('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)').run(devId, 'sec-device', crypto.randomUUID(), adminId)
  const devV = crypto.randomUUID()
  const devA2 = crypto.randomUUID()
  dbc.prepare('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)').run(devV, 'viewer-device', crypto.randomUUID(), viewerId)
  dbc.prepare('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)').run(devA2, 'admin-device-2', crypto.randomUUID(), adminId)
  dbc.close()

  const adminTok = jwt.sign({ userId: adminId, email: 'admin@sec', role: 'admin' }, SECRET, { expiresIn: '1h' })
  const viewerTok = jwt.sign({ userId: viewerId, email: 'viewer@sec', role: 'viewer' }, SECRET, { expiresIn: '1h' })
  const H = (t) => ({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' })

  // ── A0. تسجيل دخول ناجح واحد (يلزم لإثبات تدقيق النجاح) ─────────────────────
  const okLogin = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@sec', password: 'correct-horse' }),
  })
  check('A0. valid credentials accepted', okLogin.status === 200, 'status=' + okLogin.status)

  // ── A. login rate limit ────────────────────────────────────────────────────
  const codes = []
  for (let i = 0; i < 8; i++) {
    const r = await fetch(BASE + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@sec', password: 'wrong-' + i }),
    })
    codes.push(r.status)
    await sleep(50)
  }
  check('A. login limited to 5/min (429 appears)', codes.includes(429), 'codes=' + codes.join(','))

  // ── B. verify-totp rate limit ──────────────────────────────────────────────
  const totpCodes = []
  for (let i = 0; i < 14; i++) {
    const r = await fetch(BASE + '/api/auth/login/verify-totp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totpToken: 'x', code: '000000' }),
    })
    totpCodes.push(r.status)
    await sleep(30)
  }
  check('B. verify-totp limited (429 appears)', totpCodes.includes(429), 'codes=' + totpCodes.slice(0, 6).join(',') + '…')

  // ── C. refresh rate limit ──────────────────────────────────────────────────
  const refCodes = []
  for (let i = 0; i < 24; i++) {
    const r = await fetch(BASE + '/api/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'nope-' + i }),
    })
    refCodes.push(r.status)
    await sleep(30)
  }
  check('C. refresh limited (429 appears)', refCodes.includes(429), 'codes=' + refCodes.slice(0, 6).join(',') + '…')

  // ── D. ws-ticket single use ────────────────────────────────────────────────
  const mint = async () => (await fetch(BASE + '/api/auth/ws-ticket', {
    method: 'POST', headers: H(adminTok), body: '{}',
  }).then((r) => r.json())).ticket
  const t1 = await mint()
  const outcome = (ticket) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/screen?binary=1&ticket=${ticket}&deviceId=${devId}`)
    let settled = false
    const done = (v) => { if (!settled) { settled = true; try { ws.close() } catch {} ; resolve(v) } }
    ws.on('open', () => { /* upgrade accepted; the ticket was consumed */ })
    ws.on('message', (d, isBinary) => { if (!isBinary) { try { const m = JSON.parse(d.toString()); if (m.type) done('msg:' + m.type) } catch {} } })
    ws.on('error', () => done('error'))
    ws.on('close', () => done('closed'))
    setTimeout(() => done('timeout'), 2500)
  })
  const first = await outcome(t1)
  await sleep(200)
  const second = await outcome(t1)
  check('D. ws-ticket is single-use (first accepted, second rejected)', first === 'msg:screen:error' && second !== 'msg:screen:error', 'first=' + first + ' second=' + second)

  // ── I. denied screen access is audited (before the ticket limiter is exhausted) ──
  const viewerTicket = (await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: H(viewerTok), body: '{}' }).then((r) => r.json())).ticket
  await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/screen?binary=1&ticket=${viewerTicket}&deviceId=${devId}`)
    ws.on('message', () => {})
    ws.on('close', resolve)
    ws.on('error', resolve)
    setTimeout(resolve, 2000)
  })

  // ── E. ws-ticket rate limit ────────────────────────────────────────────────
  const ticketCodes = []
  for (let i = 0; i < 40; i++) {
    const r = await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: H(adminTok), body: '{}' })
    ticketCodes.push(r.status)
  }
  check('E. ws-ticket limited (429 appears)', ticketCodes.includes(429), 'max=' + Math.max(...ticketCodes) + ' n=' + ticketCodes.length)

  // ── F/G. permission matrix ─────────────────────────────────────────────────
  const auditAsViewer = await fetch(BASE + '/api/audit', { headers: H(viewerTok) })
  check('F1. viewer denied /api/audit', auditAsViewer.status === 403 || auditAsViewer.status === 401, 'status=' + auditAsViewer.status)
  const usersAsViewer = await fetch(BASE + '/api/users', { headers: H(viewerTok) })
  check('F2. viewer denied /api/users', usersAsViewer.status === 403 || usersAsViewer.status === 401, 'status=' + usersAsViewer.status)
  const auditAsAdmin = await fetch(BASE + '/api/audit', { headers: H(adminTok) })
  check('G1. admin allowed /api/audit', auditAsAdmin.status === 200, 'status=' + auditAsAdmin.status)

  // ── J. role matrix: viewer owns a device but must not operate it ───────────
  const jDelete = await fetch(BASE + '/api/devices/' + devV, { method: 'DELETE', headers: H(viewerTok) })
  check('J1. viewer cannot delete own device', jDelete.status === 403, 'status=' + jDelete.status)
  const jBlock = await fetch(BASE + '/api/devices/' + devV + '/block', { method: 'POST', headers: H(viewerTok), body: '{}' })
  check('J2. viewer cannot block own device', jBlock.status === 403, 'status=' + jBlock.status)
  const jFs = await fetch(BASE + '/api/devices/' + devV + '/fs/delete', {
    method: 'POST', headers: H(viewerTok), body: JSON.stringify({ path: 'C:/x' }),
  })
  check('J3. viewer cannot delete files', jFs.status === 403, 'status=' + jFs.status)
  const jCtl = await fetch(BASE + '/api/devices/' + devV + '/control', {
    method: 'POST', headers: H(viewerTok), body: JSON.stringify({ action: 'click' }),
  })
  check('J4. viewer cannot send control input', jCtl.status === 403, 'status=' + jCtl.status)
  const jList = await fetch(BASE + '/api/devices/' + devV + '/fs/list?path=C%3A%2F', { headers: H(viewerTok) })
  const jListBody = await jList.text()
  check('J5. viewer can read own device (device offline -> 502, never role_too_low)',
    jList.status === 502 && !/role_too_low/.test(jListBody), 'status=' + jList.status + ' body=' + jListBody.slice(0, 60))
  const jDev = await fetch(BASE + '/api/devices', { headers: H(viewerTok) })
  const jDevBody = await jDev.json().catch(() => null)
  check('J7. viewer sees own device in the list', Array.isArray(jDevBody) && jDevBody.some((d) => d.id === devV),
    'count=' + (Array.isArray(jDevBody) ? jDevBody.length : 'not-array'))

  // admin must still pass the guard (not 403)
  const aDel = await fetch(BASE + '/api/devices/' + devA2, { method: 'DELETE', headers: H(adminTok) })
  check('J6. admin passes the destructive guard', aDel.status !== 403, 'status=' + aDel.status)

  // ── H. audit rows ──────────────────────────────────────────────────────────
  const db2 = new Database(dbPath)
  const failedRows = db2.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='login_failed'").get().c
  const okRows = db2.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='login_success'").get().c
  const deniedRows = db2.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='screen_denied'").get().c
  db2.close()
  check('H1. login_failed audited', failedRows > 0, 'rows=' + failedRows)
  check('H2. login_success audited', okRows > 0, 'rows=' + okRows)
  check('I. denied screen access audited', deniedRows > 0, 'rows=' + deniedRows)

  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL SECURITY CHECKS PASSED')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2) })
