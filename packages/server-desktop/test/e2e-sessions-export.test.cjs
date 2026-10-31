/**
 * E2E — desktop server (server.js): searchable session log + CSV export (R8.3).
 *
 *  A) /api/sessions filters by q / type / status / date range in SQL;
 *  B) /api/sessions/export returns UTF-8 CSV (BOM, CRLF) with quoted fields;
 *  C) a manager gets their whole filtered set; a viewer role is refused (403);
 *  D) the export is audited.
 *
 * Run: node packages/server-desktop/test/e2e-sessions-export.test.cjs
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
const PORT = 3995
const SECRET = 'e2e-sessions-secret'
const BASE = 'http://127.0.0.1:' + PORT

let failed = false
function check(desc, cond) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc); failed = true }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-sess-'))
const dbPath = path.join(tmpDir, 'sess.db')

async function main() {
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger, desktopCallbacks: {}, tls: false })

  const db = new Database(dbPath)
  const adminId = crypto.randomUUID()
  const managerId = crypto.randomUUID()
  const viewerId = crypto.randomUUID()
  const devA = crypto.randomUUID()
  const devB = crypto.randomUUID()
  db.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(adminId, 'admin@local', 'Admin', 'admin', 'x')
  db.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(managerId, 'mgr@local', 'Mgr', 'manager', 'x')
  db.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(viewerId, 'view@local', 'View', 'viewer', 'x')
  db.prepare('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)').run(devA, 'TECNO-KL4', 't1', adminId)
  db.prepare('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)').run(devB, 'Desk, "quoted" PC', 't2', adminId)

  const rows = [
    [crypto.randomUUID(), devA, adminId, 'screen', '2026-10-01T10:00:00.000Z', '2026-10-01T10:05:00.000Z', 300],
    [crypto.randomUUID(), devA, adminId, 'screen', '2026-10-15T09:00:00.000Z', null, null],
    [crypto.randomUUID(), devB, managerId, 'ssh', '2026-10-20T12:00:00.000Z', '2026-10-20T12:30:00.000Z', 1800],
    [crypto.randomUUID(), devB, managerId, 'file', '2026-10-25T08:00:00.000Z', '2026-10-25T08:01:00.000Z', 60]
  ]
  for (const r of rows) {
    db.prepare('INSERT INTO sessions (id, device_id, user_id, type, started_at, ended_at, duration_sec) VALUES (?,?,?,?,?,?,?)').run(...r)
  }
  db.close()

  const adminTok = jwt.sign({ userId: adminId, email: 'admin@local', role: 'admin' }, SECRET, { expiresIn: '1h' })
  const viewerTok = jwt.sign({ userId: viewerId, email: 'view@local', role: 'viewer' }, SECRET, { expiresIn: '1h' })
  const auth = (t) => ({ Authorization: 'Bearer ' + t })

  // A) filters
  const all = await fetch(BASE + '/api/sessions', { headers: auth(adminTok) }).then(r => r.json())
  check('all rows visible to admin', Array.isArray(all) && all.length === 4)

  const byQ = await fetch(BASE + '/api/sessions?q=quoted', { headers: auth(adminTok) }).then(r => r.json())
  check('q searches the device name', byQ.length === 2 && byQ.every(r => (r.deviceName || '').includes('quoted')))

  const byType = await fetch(BASE + '/api/sessions?type=ssh', { headers: auth(adminTok) }).then(r => r.json())
  check('type filter', byType.length === 1 && byType[0].type === 'ssh')

  const active = await fetch(BASE + '/api/sessions?status=active', { headers: auth(adminTok) }).then(r => r.json())
  check('status=active filter', active.length === 1 && !active[0].endedAt)

  const ranged = await fetch(BASE + '/api/sessions?from=2026-10-14&to=2026-10-21T23:59:59', { headers: auth(adminTok) }).then(r => r.json())
  check('date range filter', ranged.length === 2)

  const viewerRows = await fetch(BASE + '/api/sessions', { headers: auth(viewerTok) }).then(r => r.json())
  check('viewer sees only their own rows', Array.isArray(viewerRows) && viewerRows.length === 0)

  // B) CSV
  const res = await fetch(BASE + '/api/sessions/export', { headers: auth(adminTok) })
  // Response.text() strips a leading BOM, so the bytes are inspected instead.
  const buf = Buffer.from(await res.arrayBuffer())
  const text = buf.toString('utf8')
  check('export returns 200', res.status === 200)
  check('content-type is csv', /text\/csv/.test(res.headers.get('content-type') || ''))
  check('has a download filename', /attachment; filename="airemote-sessions-/.test(res.headers.get('content-disposition') || ''))
  check('starts with a UTF-8 BOM', buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF)
  const lines = text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean)
  check('header row', lines[0] === 'id,type,started_at,ended_at,duration_sec,duration_min,device_id,device,user,status')
  check('one line per row', lines.length === 5)
  check('comma + quote in a device name are escaped', /"Desk, ""quoted"" PC"/.test(text))
  check('durations are rendered in minutes', lines.some(l => l.includes(',30.0,')))
  check('active rows are marked', lines.some(l => l.endsWith(',active')))

  const filteredCsv = await fetch(BASE + '/api/sessions/export?type=ssh', { headers: auth(adminTok) }).then(r => r.text())
  check('export honours filters', filteredCsv.split('\r\n').filter(Boolean).length === 2)

  // C) RBAC
  const forbidden = await fetch(BASE + '/api/sessions/export', { headers: auth(viewerTok) })
  check('viewer role is refused (403)', forbidden.status === 403)

  // D) audit
  const db2 = new Database(dbPath)
  const audit = db2.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action='sessions_export'").get()
  db2.close()
  check('export is audited', Number(audit.c) >= 1)

  await srv.stop()
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  console.log('')
  if (failed) { console.error('SESSIONS EXPORT TEST FAILED'); process.exit(1) }
  console.log('SESSIONS EXPORT TEST PASSED')
  process.exit(0)
}

main().catch(e => { console.error('TEST ERROR:', e && e.stack || e); process.exit(1) })
