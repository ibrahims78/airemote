/**
 * E2E — R3: معرّف الجهاز القصير ودفتر العناوين.
 *
 * يثبت:
 *   A. هجرة قاعدة قديمة: إضافة عمود code وتعبئته لجهاز قائم (9 أرقام)
 *   B. معرّف الجهاز فريد الشكل ويُحلّ لمالكه فقط (الغريب 404)
 *   C. إنشاء جهة اتصال بمعرّف الجهاز + ظهورها مع بياناته
 *   D. عزل الملكية: مستخدم آخر لا يراها ولا يعدّلها ولا يحذفها
 *   E. تعديل (مفضلة/مجموعة) يعمل
 *   F. الإنشاء برمز 9 أرقام يعمل ويربط الجهاز عند معرفته
 *   G. رمز غير صالح (أقل من 9) → 400
 *   H. حذف + تدقيق contact_created/contact_deleted
 *
 * Run: ELECTRON_RUN_AS_NODE=1 "packages\\server-desktop\\node_modules\\electron\\dist\\electron.exe" packages/server-desktop/test/e2e-contacts.test.cjs
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
const PORT = 3994
const SECRET = 'test-secret-contacts'
const BASE = 'http://127.0.0.1:' + PORT

let failed = 0
const check = (d, c, x) => { if (c) console.log('PASS: ' + d); else { console.error('FAIL: ' + d + (x ? '  (' + x + ')' : '')); failed++ } }

;(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-contacts-'))
  const dbPath = path.join(tmp, 'legacy.db')

  // ── قاعدة "قديمة": جدول devices بلا عمود code ──────────────────────────────
  const legacyId = crypto.randomUUID()
  const legacyOwner = crypto.randomUUID()
  {
    const db = new Database(dbPath)
    db.exec(`CREATE TABLE devices (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT UNIQUE NOT NULL, owner_id TEXT NOT NULL,
      info TEXT, status TEXT NOT NULL DEFAULT 'offline', tags TEXT NOT NULL DEFAULT '[]',
      capabilities TEXT NOT NULL DEFAULT '{}', last_seen TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    db.prepare('INSERT INTO devices (id,name,token,owner_id) VALUES (?,?,?,?)').run(legacyId, 'legacy-device', crypto.randomUUID(), legacyOwner)
    db.close()
  }

  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger: { info() {}, warn() {}, error() {}, debug() {} }, desktopCallbacks: {}, tls: false })

  // ── A. migration ────────────────────────────────────────────────────────────
  const db1 = new Database(dbPath)
  const cols = db1.prepare('PRAGMA table_info(devices)').all().map(c => c.name)
  const legacyRow = db1.prepare('SELECT code FROM devices WHERE id=?').get(legacyId)
  db1.close()
  check('A1. legacy devices table gained a code column', cols.includes('code'), cols.join(','))
  check('A2. existing device backfilled with a 9-digit code', /^\d{9}$/.test(String(legacyRow.code || '')), 'code=' + legacyRow.code)

  // ── seed users ──────────────────────────────────────────────────────────────
  const hash = bcrypt.hashSync('pw', 4)
  const uA = crypto.randomUUID(), uB = crypto.randomUUID()
  const db2 = new Database(dbPath)
  db2.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(uA, 'a@c', 'A', 'manager', hash)
  db2.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(uB, 'b@c', 'B', 'manager', hash)
  const devA = crypto.randomUUID()
  db2.prepare('INSERT INTO devices (id,name,token,owner_id) VALUES (?,?,?,?)').run(devA, 'device-A', crypto.randomUUID(), uA)
  db2.close()

  const tokA = jwt.sign({ userId: uA, email: 'a@c', role: 'manager' }, SECRET, { expiresIn: '1h' })
  const tokB = jwt.sign({ userId: uB, email: 'b@c', role: 'manager' }, SECRET, { expiresIn: '1h' })
  const H = (t) => ({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' })

  // ── B. device code resolution ───────────────────────────────────────────────
  const listA = await fetch(BASE + '/api/devices', { headers: H(tokA) }).then(r => r.json())
  const devArow = Array.isArray(listA) ? listA.find(d => d.id === devA) : null
  check('B1. device list exposes a 9-digit code', !!devArow && /^\d{9}$/.test(String(devArow.code)), 'code=' + (devArow && devArow.code))

  const byCodeA = await fetch(BASE + '/api/devices/by-code/' + devArow.code, { headers: H(tokA) })
  const byCodeB = await fetch(BASE + '/api/devices/by-code/' + devArow.code, { headers: H(tokB) })
  check('B2. owner resolves the code', byCodeA.status === 200, 'status=' + byCodeA.status)
  check('B3. stranger cannot resolve it (404)', byCodeB.status === 404, 'status=' + byCodeB.status)

  // ── C. create contact by deviceId ───────────────────────────────────────────
  const created = await fetch(BASE + '/api/contacts', {
    method: 'POST', headers: H(tokA), body: JSON.stringify({ displayName: 'مكتب دمشق', deviceId: devA, group: 'عمل', favorite: true }),
  }).then(r => r.json())
  check('C1. contact created', created.ok === true && !!created.id)

  const list1 = await fetch(BASE + '/api/contacts', { headers: H(tokA) }).then(r => r.json())
  const c1 = Array.isArray(list1) ? list1.find(c => c.id === created.id) : null
  check('C2. contact appears with device data', !!c1 && c1.device && c1.device.id === devA && c1.deviceCode === devArow.code, JSON.stringify(c1 && c1.device))
  check('C3. favorite flag persisted', !!c1 && c1.favorite === true)

  // ── D. isolation ────────────────────────────────────────────────────────────
  const listB = await fetch(BASE + '/api/contacts', { headers: H(tokB) }).then(r => r.json())
  check('D1. other user does not see it', Array.isArray(listB) && !listB.some(c => c.id === created.id), 'count=' + (Array.isArray(listB) ? listB.length : '?'))
  const patchB = await fetch(BASE + '/api/contacts/' + created.id, { method: 'PATCH', headers: H(tokB), body: JSON.stringify({ favorite: false }) })
  check('D2. other user cannot patch it (404)', patchB.status === 404, 'status=' + patchB.status)
  const delB = await fetch(BASE + '/api/contacts/' + created.id, { method: 'DELETE', headers: H(tokB) })
  check('D3. other user cannot delete it (404)', delB.status === 404, 'status=' + delB.status)

  // ── E. patch ────────────────────────────────────────────────────────────────
  const patchA = await fetch(BASE + '/api/contacts/' + created.id, { method: 'PATCH', headers: H(tokA), body: JSON.stringify({ favorite: false, group: 'شخصي' }) })
  const list2 = await fetch(BASE + '/api/contacts', { headers: H(tokA) }).then(r => r.json())
  const c2 = list2.find(c => c.id === created.id)
  check('E. patch updates favorite and group', patchA.status === 200 && c2 && c2.favorite === false && c2.group === 'شخصي', 'status=' + patchA.status)

  // ── F/G. create by code ─────────────────────────────────────────────────────
  const byCodeCreate = await fetch(BASE + '/api/contacts', {
    method: 'POST', headers: H(tokA), body: JSON.stringify({ displayName: 'بالرمز', deviceCode: devArow.code }),
  }).then(r => r.json())
  check('F. create by 9-digit code links the device', byCodeCreate.ok === true)
  const list3 = await fetch(BASE + '/api/contacts', { headers: H(tokA) }).then(r => r.json())
  const c3 = list3.find(c => c.id === byCodeCreate.id)
  check('F2. linked device resolved from code', !!c3 && c3.deviceId === devA, 'deviceId=' + (c3 && c3.deviceId))

  const badCode = await fetch(BASE + '/api/contacts', { method: 'POST', headers: H(tokA), body: JSON.stringify({ displayName: 'خطأ', deviceCode: '123' }) })
  check('G. short code rejected (400)', badCode.status === 400, 'status=' + badCode.status)

  // ── H. delete + audit ───────────────────────────────────────────────────────
  const delA = await fetch(BASE + '/api/contacts/' + created.id, { method: 'DELETE', headers: H(tokA) })
  const list4 = await fetch(BASE + '/api/contacts', { headers: H(tokA) }).then(r => r.json())
  check('H1. owner deletes the contact', delA.status === 200 && !list4.some(c => c.id === created.id))
  const db3 = new Database(dbPath)
  const createdN = db3.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='contact_created'").get().c
  const deletedN = db3.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='contact_deleted'").get().c
  db3.close()
  check('H2. contact_created audited', createdN >= 2, 'rows=' + createdN)
  check('H3. contact_deleted audited', deletedN >= 1, 'rows=' + deletedN)

  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CONTACT CHECKS PASSED')
  process.exit(failed ? 1 : 0)
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2) })
