/**
 * E2E — P0-2 / P0-3 (3.14.4): بوابتا الدور على SFTP ومخزن الاعتمادات.
 *
 * يثبت:
 *   A. viewer لا يفتح اتصال SFTP (403 role_too_low) ويُسجَّل الرفض في التدقيق
 *   B. manager يمرّ من البوابة (لا 403) على مضيف مسموح
 *   C. مضيف خارج القائمة ⇒ 403 host_not_allowed + سطر تدقيق
 *   D. viewer لا يقرأ ولا يكتب مخزن الاعتمادات (403)
 *   E. manager يقرأ ويكتب، ولكل قراءة سطر تدقيق
 *
 * Run: "<electron>" packages/server-desktop/test/e2e-p0-authz.test.cjs
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

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
    console.log('      Run under the Electron binary with ELECTRON_RUN_AS_NODE=1.')
    process.exit(0)
  }
}

const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3900 + Math.floor(Math.random() * 90)
const BASE = 'http://127.0.0.1:' + PORT
const SECRET = 'p0-authz-secret'

let failed = 0
function check(desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? '  (' + extra + ')' : '')); failed++ }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-p0-'))
const dbPath = path.join(tmpDir, 'p0.db')

async function main() {
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger, desktopCallbacks: {}, tls: false })

  const hash = bcrypt.hashSync('correct-horse', 4)
  const dbc = new Database(dbPath)
  const adminId = crypto.randomUUID()
  const managerId = crypto.randomUUID()
  const viewerId = crypto.randomUUID()
  const mgrDevice = crypto.randomUUID()
  dbc.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(adminId, 'admin@p0', 'Admin', 'admin', hash)
  dbc.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(managerId, 'manager@p0', 'Manager', 'manager', hash)
  dbc.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(viewerId, 'viewer@p0', 'Viewer', 'viewer', hash)
  // الجهاز يحمل عنوانه في info — هو مصدر المضيف المسموح
  dbc.prepare('INSERT INTO devices (id, name, token, owner_id, info) VALUES (?,?,?,?,?)')
    .run(mgrDevice, 'p0-device', crypto.randomUUID(), managerId, JSON.stringify({ hostname: 'p0', ipLocal: '127.0.0.1' }))
  dbc.close()

  const adminTok = jwt.sign({ userId: adminId, email: 'admin@p0', role: 'admin' }, SECRET, { expiresIn: '1h' })
  const mgrTok = jwt.sign({ userId: managerId, email: 'manager@p0', role: 'manager' }, SECRET, { expiresIn: '1h' })
  const viewTok = jwt.sign({ userId: viewerId, email: 'viewer@p0', role: 'viewer' }, SECRET, { expiresIn: '1h' })
  const H = (t) => ({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' })

  const auditRows = (action) => {
    const d = new Database(dbPath, { readonly: true })
    try { return d.prepare('SELECT * FROM audit_log WHERE action=?').all(action) } finally { d.close() }
  }

  // ── A. viewer لا يفتح SSH باسم السيرفر ────────────────────────────────────
  const a1 = await fetch(BASE + '/api/sftp/connect', {
    method: 'POST', headers: H(viewTok),
    body: JSON.stringify({ host: '127.0.0.1', username: 'u', password: 'p' }),
  })
  const a1j = await a1.json().catch(() => ({}))
  check('A1. viewer SFTP connect → 403', a1.status === 403, 'status=' + a1.status)
  check('A2. the refusal carries role_too_low', a1j.code === 'role_too_low', JSON.stringify(a1j))
  check('A3. refused connect is audited', auditRows('sftp_denied_role').length > 0, 'no sftp_denied_role row')

  // ── B. manager يمرّ على مضيف مسموح (لا خادم SSH ⇒ 502 لا 403) ─────────────
  const b1 = await fetch(BASE + '/api/sftp/connect', {
    method: 'POST', headers: H(mgrTok),
    body: JSON.stringify({ host: '127.0.0.1', username: 'u', password: 'p' }),
  })
  check('B1. manager passes the role gate on an allowed host', b1.status !== 403, 'status=' + b1.status)
  check('B2. the allowed host attempt is audited', auditRows('sftp_connect').length > 0, 'no sftp_connect row')

  // ── C. مضيف خارج القائمة ──────────────────────────────────────────────────
  const c1 = await fetch(BASE + '/api/sftp/connect', {
    method: 'POST', headers: H(mgrTok),
    body: JSON.stringify({ host: '203.0.113.7', username: 'u', password: 'p' }),
  })
  const c1j = await c1.json().catch(() => ({}))
  check('C1. manager + unknown host → 403', c1.status === 403, 'status=' + c1.status)
  check('C2. the refusal is host_not_allowed', c1j.code === 'host_not_allowed', JSON.stringify(c1j))
  check('C3. refused host is audited', auditRows('sftp_denied_host').length > 0, 'no sftp_denied_host row')

  // ── D. مخزن الاعتمادات: viewer مرفوض قراءةً وكتابةً ──────────────────────
  const d1 = await fetch(BASE + '/api/credentials', { headers: H(viewTok) })
  check('D1. viewer cannot list credentials', d1.status === 403, 'status=' + d1.status)
  const d2 = await fetch(BASE + '/api/credentials', {
    method: 'POST', headers: H(viewTok),
    body: JSON.stringify({ deviceId: mgrDevice, label: 'x', sshHost: '127.0.0.1', sshUsername: 'u', secret: 'p' }),
  })
  check('D2. viewer cannot write a credential', d2.status === 403, 'status=' + d2.status)

  // ── E. manager يعمل، ولكل قراءة تدقيق ────────────────────────────────────
  const e1 = await fetch(BASE + '/api/credentials', { headers: H(mgrTok) })
  check('E1. manager can list credentials', e1.status === 200, 'status=' + e1.status)
  const e2 = await fetch(BASE + '/api/credentials', {
    method: 'POST', headers: H(mgrTok),
    body: JSON.stringify({ deviceId: mgrDevice, label: 'p0 cred', sshHost: '127.0.0.1', sshUsername: 'u', secret: 'p' }),
  })
  check('E2. manager can write a credential', e2.status === 201, 'status=' + e2.status)
  check('E3. the read is audited', auditRows('credentials_list').length > 0, 'no credentials_list row')
  check('E4. the write is audited', auditRows('credential_create').length > 0, 'no credential_create row')
  const e5 = await fetch(BASE + '/api/audit?action=credentials_list', { headers: H(adminTok) })
  const e5j = await e5.json().catch(() => ({}))
  check('E5. audit is queryable through the admin API', e5.status === 200 && (e5j.total || 0) > 0, 'status=' + e5.status)

  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL P0 AUTHORIZATION CHECKS PASSED')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2) })
