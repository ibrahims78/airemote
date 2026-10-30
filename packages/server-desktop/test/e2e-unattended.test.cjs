/**
 * E2E — R3 (الشريحة الثانية): الوصول غير المراقب بكلمة مرور لكل جهاز.
 *
 * يثبت:
 *   A. تهيئة الجداول على قاعدة قديمة (بلا device_unattended/device_permissions)
 *   B. تعيين كلمة مرور للمالك فقط، بلا تسريب البصمة في الرد
 *   C. رفض كلمة مرور قصيرة، ورفض غير المالك
 *   D. 5 محاولات خاطئة ← قفل مؤقت (429 + Retry-After) وتدقيق unattended_locked
 *   E. القفل يمنع كلمة المرور الصحيحة أيضاً (لا تجاوز)
 *   F. بعد انتهاء القفل: كلمة المرور الصحيحة تُصدر رمزاً مقيَّداً بجهاز واحد
 *   G. الرمز يعمل على جهازه فقط، ولا يملك عمليات الإدارة
 *   H. تعطيل الوصول ← 403 unattended_disabled، والتدقيق يسجّل ذلك
 *
 * Run: ELECTRON_RUN_AS_NODE=1 "packages\\server-desktop\\node_modules\\electron\\dist\\electron.exe" packages/server-desktop/test/e2e-unattended.test.cjs
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
    const { createDatabase } = require(require('path').join(__dirname, '..', 'lib', 'db-adapter'))
    Database = function (p, o) { return createDatabase(p, o) }
    new Database(':memory:').close()
  } catch { console.log('SKIP: no sqlite engine'); process.exit(0) }
}
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3995
const SECRET = 'unattended-test-secret'
const BASE = 'http://127.0.0.1:' + PORT
const MAX_FAILURES = 5

process.env.UNATTENDED_MAX_FAILURES = String(MAX_FAILURES)
process.env.UNATTENDED_LOCK_MS = '60000'

let failed = 0
const check = (d, c, x) => { if (c) console.log('PASS: ' + d); else { console.error('FAIL: ' + d + (x ? '  (' + x + ')' : '')); failed++ } }

;(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-unattended-'))
  const dbPath = path.join(tmp, 'legacy.db')

  // ── قاعدة "قديمة": devices + users فقط، بلا جداول R3-2 ──────────────────────
  const ownerId = crypto.randomUUID()
  const otherId = crypto.randomUUID()
  const devA = crypto.randomUUID()
  const devB = crypto.randomUUID()
  {
    const db = new Database(dbPath)
    db.exec(`CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer',
      password_hash TEXT NOT NULL, totp_enabled INTEGER NOT NULL DEFAULT 0, totp_secret TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    db.exec(`CREATE TABLE devices (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT UNIQUE NOT NULL, owner_id TEXT NOT NULL,
      info TEXT, status TEXT NOT NULL DEFAULT 'offline', tags TEXT NOT NULL DEFAULT '[]',
      capabilities TEXT NOT NULL DEFAULT '{}', last_seen TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    const hash = bcrypt.hashSync('pw', 4)
    const u = db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)')
    u.run(ownerId, 'owner@u', 'Owner', 'manager', hash)
    u.run(otherId, 'other@u', 'Other', 'manager', hash)
    const d = db.prepare('INSERT INTO devices (id,name,token,owner_id) VALUES (?,?,?,?)')
    d.run(devA, 'device-A', crypto.randomUUID(), ownerId)
    d.run(devB, 'device-B', crypto.randomUUID(), ownerId)
    db.close()
  }

  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger: { info() {}, warn() {}, error() {}, debug() {} }, desktopCallbacks: {}, tls: false })

  const H = (t) => ({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' })
  const tokOwner = jwt.sign({ userId: ownerId, email: 'owner@u', role: 'manager' }, SECRET, { expiresIn: '1h' })
  const tokOther = jwt.sign({ userId: otherId, email: 'other@u', role: 'manager' }, SECRET, { expiresIn: '1h' })

  // ── A. schema bootstrap ─────────────────────────────────────────────────────
  const db1 = new Database(dbPath)
  const tables = db1.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
  db1.close()
  check('A1. device_unattended created on a legacy db', tables.includes('device_unattended'), tables.join(','))
  check('A2. device_permissions created on a legacy db', tables.includes('device_permissions'), tables.join(','))

  // ── B. owner sets the password ──────────────────────────────────────────────
  const set = await fetch(BASE + '/api/devices/' + devA + '/access', {
    method: 'POST', headers: H(tokOwner), body: JSON.stringify({ password: 'lab-device-pass-1' }),
  })
  const setBody = await set.json()
  check('B1. owner sets a device password (200)', set.status === 200, 'status=' + set.status)
  check('B2. status reports hasPassword + enabled', setBody.hasPassword === true && setBody.enabled === true, JSON.stringify(setBody))
  check('B3. response never leaks the hash', !JSON.stringify(setBody).includes('$2'), JSON.stringify(setBody).slice(0, 120))

  const statusResp = await fetch(BASE + '/api/devices/' + devA + '/access', { headers: H(tokOwner) }).then(r => r.json())
  check('B4. GET access returns the same status', statusResp.hasPassword === true && statusResp.enabled === true)

  // ── C. policy ───────────────────────────────────────────────────────────────
  const shortPw = await fetch(BASE + '/api/devices/' + devA + '/access', {
    method: 'POST', headers: H(tokOwner), body: JSON.stringify({ password: 'short' }),
  })
  check('C1. short password rejected (400)', shortPw.status === 400, 'status=' + shortPw.status)

  const byOther = await fetch(BASE + '/api/devices/' + devA + '/access', {
    method: 'POST', headers: H(tokOther), body: JSON.stringify({ password: 'lab-device-pass-2' }),
  })
  check('C2. non-owner cannot set it (403 owner_required)', byOther.status === 403, 'status=' + byOther.status)

  // ── D. wrong password × 5 → lock ────────────────────────────────────────────
  const codes = []
  for (let i = 0; i < MAX_FAILURES; i++) {
    const r = await fetch(BASE + '/api/access/unattended', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: devA, password: 'wrong-password-' + i }),
    })
    codes.push(r.status)
  }
  check('D1. first four attempts are 401', codes.slice(0, 4).every(c => c === 401), codes.join(','))
  check('D2. fifth attempt returns 429 (locked)', codes[4] === 429, codes.join(','))

  const lockResp = await fetch(BASE + '/api/access/unattended', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: devA, password: 'lab-device-pass-1' }),
  })
  const lockBody = await lockResp.json()
  check('E1. correct password is refused while locked (429)', lockResp.status === 429, 'status=' + lockResp.status)
  check('E2. lock response carries Retry-After', !!lockResp.headers.get('retry-after'), String(lockResp.headers.get('retry-after')))
  check('E3. lock response code is unattended_locked', lockBody.code === 'unattended_locked', JSON.stringify(lockBody))

  // ── F. unlock by moving the lock into the past ──────────────────────────────
  const db2 = new Database(dbPath)
  db2.prepare("UPDATE device_unattended SET locked_until=? WHERE device_id=?").run(new Date(Date.now() - 1000).toISOString(), devA)
  db2.close()

  const good = await fetch(BASE + '/api/access/unattended', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: devA, password: 'lab-device-pass-1' }),
  })
  const goodBody = await good.json()
  check('F1. correct password after lock expiry issues a token', good.status === 200 && !!goodBody.accessToken, 'status=' + good.status)
  check('F2. token is device-scoped (role=unattended + device)', goodBody.role === 'unattended' && !!goodBody.device && goodBody.device.id === devA, JSON.stringify(goodBody.device))
  check('F3. token payload is bound to the device', (() => {
    try { const p = jwt.verify(goodBody.accessToken, SECRET); return p.role === 'unattended' && p.deviceId === devA } catch { return false }
  })())

  // ── G. the token is scoped ──────────────────────────────────────────────────
  const devSelf = await fetch(BASE + '/api/devices/' + devA, { headers: H(goodBody.accessToken) })
  const devOther = await fetch(BASE + '/api/devices/' + devB, { headers: H(goodBody.accessToken) })
  const list = await fetch(BASE + '/api/devices', { headers: H(goodBody.accessToken) }).then(r => r.json())
  check('G1. scoped token reads its own device (200)', devSelf.status === 200, 'status=' + devSelf.status)
  check('G2. scoped token cannot read another device (403)', devOther.status === 403, 'status=' + devOther.status)
  check('G3. device list contains exactly its own device', Array.isArray(list) && list.length === 1 && list[0].id === devA, 'len=' + (Array.isArray(list) ? list.length : '?'))

  const manageDenied = await fetch(BASE + '/api/devices/' + devA + '/access', {
    method: 'POST', headers: H(goodBody.accessToken), body: JSON.stringify({ password: 'another-pass-123' }),
  })
  const deleteDenied = await fetch(BASE + '/api/devices/' + devA, { method: 'DELETE', headers: H(goodBody.accessToken) })
  const usersDenied = await fetch(BASE + '/api/users', { headers: H(goodBody.accessToken) })
  check('G4. scoped token cannot set an admin password (403)', manageDenied.status === 403, 'status=' + manageDenied.status)
  check('G5. scoped token cannot delete the device (403)', deleteDenied.status === 403, 'status=' + deleteDenied.status)
  check('G6. scoped token is not an admin (403 on /api/users)', usersDenied.status === 403, 'status=' + usersDenied.status)

  // ── H. disable + audit ──────────────────────────────────────────────────────
  const disable = await fetch(BASE + '/api/devices/' + devA + '/access', {
    method: 'POST', headers: H(tokOwner), body: JSON.stringify({ enabled: false }),
  }).then(r => r.json())
  check('H1. owner disables unattended access', disable.enabled === false && disable.hasPassword === true, JSON.stringify(disable))

  const afterDisable = await fetch(BASE + '/api/access/unattended', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: devA, password: 'lab-device-pass-1' }),
  })
  check('H2. disabled device refuses the login (403)', afterDisable.status === 403, 'status=' + afterDisable.status)

  const noPasswordDevice = await fetch(BASE + '/api/access/unattended', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: devB, password: 'whatever-123' }),
  })
  check('H3. device without a password refuses (403)', noPasswordDevice.status === 403, 'status=' + noPasswordDevice.status)

  const unknown = await fetch(BASE + '/api/access/unattended', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '000000000', password: 'whatever-123' }),
  })
  check('H4. unknown device code is 404', unknown.status === 404, 'status=' + unknown.status)

  const db3 = new Database(dbPath)
  const count = (a) => db3.prepare('SELECT COUNT(*) c FROM audit_log WHERE action=?').get(a).c
  const n = { set: count('unattended_set'), failed: count('unattended_login_failed'), locked: count('unattended_locked'), login: count('unattended_login'), cleared: count('unattended_cleared'), denied: count('unattended_denied') }
  const hashRows = db3.prepare('SELECT password_hash FROM device_unattended').all()
  db3.close()
  check('H5. unattended_set audited', n.set >= 1, 'rows=' + n.set)
  check('H6. failed attempts audited', n.failed >= 4, 'rows=' + n.failed)
  check('H7. lock audited', n.locked >= 1, 'rows=' + n.locked)
  check('H8. successful login audited', n.login >= 1, 'rows=' + n.login)
  check('H9. disable audited', n.cleared >= 1, 'rows=' + n.cleared)
  check('H10. disabled attempts audited', n.denied >= 1, 'rows=' + n.denied)
  check('H11. stored password is a bcrypt hash (cost 10)', hashRows.length === 1 && /^\$2[aby]\$10\$/.test(hashRows[0].password_hash), 'rows=' + hashRows.length)
  check('H12. no plaintext password stored anywhere', !fs.readFileSync(dbPath).toString('latin1').includes('lab-device-pass-1'))

  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL UNATTENDED CHECKS PASSED')
  process.exit(failed ? 1 : 0)
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2) })
