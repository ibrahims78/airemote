/**
 * E2E — R3 (الشريحة الثانية): جدول device_permissions واحترامه على السيرفر.
 *
 * يثبت مصفوفة (مستخدم × جهاز × قدرة):
 *   A. مستخدم بلا منح لا يرى الجهاز ولا يصله
 *   B. منح control فقط: تحكم مسموح، ملفات/تسجيل مرفوضان بـ403 مع تدقيق
 *   C. إضافة files: الملفات تُسمح ويبقى التسجيل مرفوضاً
 *   D. إضافة record: بدء التسجيل يُسمح
 *   E. PUT يستبدل المجموعة (سحب files يعيد 403)
 *   F. سحب كل الصلاحيات يعيد العزل الكامل
 *   G. غير المالك لا يقرأ ولا يمنح الصلاحيات
 *   H. المالك/المدير يريان المنح؛ منح المالك مرفوض؛ مستخدم مجهول 404
 *   I. المدير (admin) يرى كل الأجهزة بلا منح
 *   J. التدقيق: permission_granted / permission_revoked / capability_denied
 *
 * Run: ELECTRON_RUN_AS_NODE=1 "packages\\server-desktop\\node_modules\\electron\\dist\\electron.exe" packages/server-desktop/test/e2e-device-permissions.test.cjs
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

let Database
try { Database = require('better-sqlite3'); new Database(':memory:').close() } catch { console.log('SKIP'); process.exit(0) }
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3996
const SECRET = 'permissions-test-secret'
const BASE = 'http://127.0.0.1:' + PORT

let failed = 0
const check = (d, c, x) => { if (c) console.log('PASS: ' + d); else { console.error('FAIL: ' + d + (x ? '  (' + x + ')' : '')); failed++ } }

;(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-perms-'))
  const dbPath = path.join(tmp, 'test.db')

  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger: { info() {}, warn() {}, error() {}, debug() {} }, desktopCallbacks: {}, tls: false })

  const hash = bcrypt.hashSync('pw', 4)
  const ownerId = crypto.randomUUID()
  const granteeId = crypto.randomUUID()
  const strangerId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const devA = crypto.randomUUID()
  {
    const db = new Database(dbPath)
    const u = db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)')
    u.run(ownerId, 'owner@p', 'Owner', 'manager', hash)
    u.run(granteeId, 'grantee@p', 'Grantee', 'manager', hash)
    u.run(strangerId, 'stranger@p', 'Stranger', 'manager', hash)
    u.run(adminId, 'admin@p', 'Admin', 'admin', hash)
    db.prepare('INSERT INTO devices (id,name,token,owner_id) VALUES (?,?,?,?)').run(devA, 'device-A', crypto.randomUUID(), ownerId)
    db.close()
  }

  const H = (t) => ({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' })
  const tokOwner = jwt.sign({ userId: ownerId, email: 'owner@p', role: 'manager' }, SECRET, { expiresIn: '1h' })
  const tokGrantee = jwt.sign({ userId: granteeId, email: 'grantee@p', role: 'manager' }, SECRET, { expiresIn: '1h' })
  const tokStranger = jwt.sign({ userId: strangerId, email: 'stranger@p', role: 'manager' }, SECRET, { expiresIn: '1h' })
  const tokAdmin = jwt.sign({ userId: adminId, email: 'admin@p', role: 'admin' }, SECRET, { expiresIn: '1h' })

  const listOf = async (t) => fetch(BASE + '/api/devices', { headers: H(t) }).then(r => r.json())
  const grant = (caps) => fetch(BASE + '/api/devices/' + devA + '/permissions/' + granteeId, {
    method: 'PUT', headers: H(tokOwner), body: JSON.stringify(caps),
  })
  // 403 = منع بالقدرة، 502 = مرّ من الحارس ثم فشل الاتصال بالجهاز (غير متصل)
  const control = (t) => fetch(BASE + '/api/devices/' + devA + '/control', { method: 'POST', headers: H(t), body: JSON.stringify({ action: 'move', x: 10, y: 10 }) })
  const files = (t) => fetch(BASE + '/api/devices/' + devA + '/fs?path=/', { headers: H(t) })
  const record = (t) => fetch(BASE + '/api/recordings', { method: 'POST', headers: H(t), body: JSON.stringify({ deviceId: devA, name: 'r' }) })

  // ── A. no grant → no access ─────────────────────────────────────────────────
  const listA = await listOf(tokGrantee)
  check('A1. grantee sees no device before a grant', Array.isArray(listA) && listA.length === 0, 'len=' + (Array.isArray(listA) ? listA.length : '?'))
  const devA0 = await fetch(BASE + '/api/devices/' + devA, { headers: H(tokGrantee) })
  check('A2. direct read is 403 without a grant', devA0.status === 403, 'status=' + devA0.status)
  const ctl0 = await control(tokGrantee)
  check('A3. control is 403 without a grant', ctl0.status === 403, 'status=' + ctl0.status)

  // ── B. control only ────────────────────────────────────────────────────────
  const g1 = await grant({ control: true })
  const g1Body = await g1.json()
  check('B1. owner grants control (200)', g1.status === 200 && g1Body.capabilities.length === 1 && g1Body.capabilities[0] === 'control', JSON.stringify(g1Body))
  const listB = await listOf(tokGrantee)
  check('B2. granted device appears in the list', Array.isArray(listB) && listB.length === 1 && listB[0].id === devA, 'len=' + (Array.isArray(listB) ? listB.length : '?'))
  const devB = await fetch(BASE + '/api/devices/' + devA, { headers: H(tokGrantee) })
  check('B3. granted device is readable (200)', devB.status === 200, 'status=' + devB.status)
  const ctlB = await control(tokGrantee)
  check('B4. control passes the guard (device offline → 502)', ctlB.status === 502, 'status=' + ctlB.status)
  const fsB = await files(tokGrantee)
  check('B5. files are refused without the capability (403)', fsB.status === 403, 'status=' + fsB.status)
  const fsBBody = await fsB.json()
  check('B6. refusal carries capability_denied + capability name', fsBBody.code === 'capability_denied' && fsBBody.capability === 'files', JSON.stringify(fsBBody))
  const recB = await record(tokGrantee)
  check('B7. recording refused without the capability (403)', recB.status === 403, 'status=' + recB.status)

  // ── C. + files ─────────────────────────────────────────────────────────────
  const g2 = await grant({ control: true, files: true })
  const g2Body = await g2.json()
  check('C1. grants are replaced, not duplicated', g2Body.capabilities.length === 2 && g2Body.capabilities.includes('files'), JSON.stringify(g2Body.capabilities))
  const fsC = await files(tokGrantee)
  check('C2. files pass the guard (offline → 502)', fsC.status === 502, 'status=' + fsC.status)
  const recC = await record(tokGrantee)
  check('C3. recording still refused (403)', recC.status === 403, 'status=' + recC.status)

  // ── D. + record ────────────────────────────────────────────────────────────
  await grant({ control: true, files: true, record: true })
  const recD = await record(tokGrantee)
  check('D1. recording allowed with the capability (201)', recD.status === 201, 'status=' + recD.status)

  // ── E. replace semantics ───────────────────────────────────────────────────
  await grant({ record: true })
  const fsE = await files(tokGrantee)
  const ctlE = await control(tokGrantee)
  check('E1. dropping files revokes fs access (403)', fsE.status === 403, 'status=' + fsE.status)
  check('E2. dropping control revokes control (403)', ctlE.status === 403, 'status=' + ctlE.status)
  const recE = await record(tokGrantee)
  check('E3. the remaining capability still works (201)', recE.status === 201, 'status=' + recE.status)

  // ── F. revoke everything ───────────────────────────────────────────────────
  const rev = await fetch(BASE + '/api/devices/' + devA + '/permissions/' + granteeId, { method: 'DELETE', headers: H(tokOwner) })
  const revBody = await rev.json()
  check('F1. revoke removes all capabilities', rev.status === 200 && revBody.removed === 1, JSON.stringify(revBody))
  const listF = await listOf(tokGrantee)
  check('F2. device disappears from the list', Array.isArray(listF) && listF.length === 0, 'len=' + (Array.isArray(listF) ? listF.length : '?'))
  const recF = await record(tokGrantee)
  check('F3. recording is refused again (403)', recF.status === 403, 'status=' + recF.status)

  // ── G. only the owner manages grants ───────────────────────────────────────
  const grantByStranger = await fetch(BASE + '/api/devices/' + devA + '/permissions/' + strangerId, {
    method: 'PUT', headers: H(tokStranger), body: JSON.stringify({ control: true }),
  })
  check('G1. stranger cannot grant (403)', grantByStranger.status === 403, 'status=' + grantByStranger.status)
  const readByStranger = await fetch(BASE + '/api/devices/' + devA + '/permissions', { headers: H(tokStranger) })
  check('G2. stranger cannot read the grant list (403)', readByStranger.status === 403, 'status=' + readByStranger.status)
  const revokeByStranger = await fetch(BASE + '/api/devices/' + devA + '/permissions/' + granteeId, { method: 'DELETE', headers: H(tokStranger) })
  check('G3. stranger cannot revoke (403)', revokeByStranger.status === 403, 'status=' + revokeByStranger.status)

  // ── H. owner view + validation ─────────────────────────────────────────────
  await grant({ control: true, record: true })
  const perms = await fetch(BASE + '/api/devices/' + devA + '/permissions', { headers: H(tokOwner) }).then(r => r.json())
  const gRow = (perms.grants || []).find(g => g.userId === granteeId)
  check('H1. owner reads the grant matrix', !!gRow && gRow.capabilities.length === 2 && gRow.email === 'grantee@p', JSON.stringify(gRow))
  check('H2. response declares the capability vocabulary', Array.isArray(perms.capabilities) && perms.capabilities.join(',') === 'control,files,record', JSON.stringify(perms.capabilities))
  const toOwner = await fetch(BASE + '/api/devices/' + devA + '/permissions/' + ownerId, {
    method: 'PUT', headers: H(tokOwner), body: JSON.stringify({ control: true }),
  })
  check('H3. granting to the owner is rejected (400)', toOwner.status === 400, 'status=' + toOwner.status)
  const unknownUser = await fetch(BASE + '/api/devices/' + devA + '/permissions/' + crypto.randomUUID(), {
    method: 'PUT', headers: H(tokOwner), body: JSON.stringify({ control: true }),
  })
  check('H4. unknown user is 404', unknownUser.status === 404, 'status=' + unknownUser.status)

  // ── I. admin sees everything ───────────────────────────────────────────────
  const listAdmin = await listOf(tokAdmin)
  check('I1. admin sees the device without a grant', Array.isArray(listAdmin) && listAdmin.some(d => d.id === devA), 'len=' + (Array.isArray(listAdmin) ? listAdmin.length : '?'))

  // ── J. audit trail ─────────────────────────────────────────────────────────
  const db = new Database(dbPath)
  const count = (a) => db.prepare('SELECT COUNT(*) c FROM audit_log WHERE action=?').get(a).c
  const deniedRow = db.prepare("SELECT details FROM audit_log WHERE action='capability_denied' ORDER BY id DESC LIMIT 1").get()
  const nGranted = count('permission_granted')
  const nRevoked = count('permission_revoked')
  const nDenied = count('capability_denied')
  const grantRows = db.prepare('SELECT COUNT(*) c FROM device_permissions').get().c
  db.close()
  check('J1. permission_granted audited', nGranted >= 4, 'rows=' + nGranted)
  check('J2. permission_revoked audited', nRevoked >= 1, 'rows=' + nRevoked)
  check('J3. capability_denied audited', nDenied >= 4, 'rows=' + nDenied)
  check('J4. denial audit names the capability', !!deniedRow && /"capability":"(files|record|control)"/.test(deniedRow.details), deniedRow && deniedRow.details)
  check('J5. final grant matrix has 2 rows for the grantee', grantRows === 2, 'rows=' + grantRows)

  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL DEVICE PERMISSION CHECKS PASSED')
  process.exit(failed ? 1 : 0)
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2) })
