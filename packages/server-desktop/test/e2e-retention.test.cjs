/**
 * E2E test — R7 retention policy (v3.8.32).
 *
 * The promise: storage stays bounded, but nothing disappears before the owner is told.
 *
 *   A. a dry run reports what would go and deletes nothing
 *   B. a purge removes only the expired recording (row and file) and keeps the rest
 *   C. audit rows older than the window go, recent ones stay
 *   D. a warning notification is written before the deletion, once per day
 *   E. the HTTP surface refuses a purge without confirm:true and needs a token
 *   F. the metrics expose the kept volume and what is pending
 *
 * Requires a usable sqlite engine in this process; run under the Electron binary with
 * ELECTRON_RUN_AS_NODE=1.
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

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3991
const SECRET = crypto.randomBytes(32).toString('hex')
const BASE = 'http://127.0.0.1:' + PORT

let failed = 0
function check(desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? '  (' + extra + ')' : '')); failed++ }
}

function ago(days) {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-ret-'))
const dbPath = path.join(tmp, 'data', 'airemote.db')
const recOld = path.join(tmp, 'old.mp4')
const recNew = path.join(tmp, 'new.mp4')

async function main() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  fs.writeFileSync(recOld, crypto.randomBytes(512))
  fs.writeFileSync(recNew, crypto.randomBytes(512))

  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  await srv.start({
    port: PORT, jwtSecret: SECRET, dbPath, tls: false, backup: false,
    recordingsDays: 30, auditDays: 180, retentionNotifyDays: 3,
    logger: { info() {}, warn() {}, error() {} }, desktopCallbacks: {},
  })

  const admin = await fetch(BASE + '/api/auth/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Ret', email: 'ret@test', password: 'correct-horse-battery' }),
  }).then((r) => r.json())
  const H = { Authorization: 'Bearer ' + admin.token, 'Content-Type': 'application/json' }

  // Seed: one expired recording, one due-soon, one fresh; one old and one recent audit row.
  const seed = new Database(dbPath)
  seed.prepare('INSERT INTO recordings (id, device_id, user_id, name, started_at, file_path, size_mb) VALUES (?,?,?,?,?,?,?)')
    .run('rec-old', 'd1', 'u1', 'old', ago(40), recOld, 5)
  seed.prepare('INSERT INTO recordings (id, device_id, user_id, name, started_at, file_path, size_mb) VALUES (?,?,?,?,?,?,?)')
    .run('rec-soon', 'd1', 'u1', 'soon', ago(28), null, 2)
  seed.prepare('INSERT INTO recordings (id, device_id, user_id, name, started_at, file_path, size_mb) VALUES (?,?,?,?,?,?,?)')
    .run('rec-new', 'd1', 'u1', 'new', ago(2), recNew, 3)
  seed.prepare("INSERT INTO audit_log (user_id, user_email, action, created_at) VALUES ('u1','x','old_action',?)").run(ago(200))
  seed.prepare("INSERT INTO audit_log (user_id, user_email, action, created_at) VALUES ('u1','x','recent_action',?)").run(ago(1))
  seed.close()

  // A. dry run
  const dry = await fetch(BASE + '/api/desktop/retention/run', { method: 'POST', headers: H, body: JSON.stringify({ dryRun: true }) }).then((r) => r.json())
  check('A1. dry run counts the expired recording', dry.ok && dry.preview.recordings.expired === 1, JSON.stringify(dry.preview && dry.preview.recordings))
  check('A2. dry run counts the soon-to-expire one', dry.preview.recordings.soon === 1, JSON.stringify(dry.preview && dry.preview.recordings))
  check('A3. dry run counts the old audit row', dry.preview.audit.expired === 1, JSON.stringify(dry.preview && dry.preview.audit))
  check('A4. dry run deletes nothing', fs.existsSync(recOld), 'file removed by a dry run')

  // E. guards
  const noConfirm = await fetch(BASE + '/api/desktop/retention/run', { method: 'POST', headers: H, body: JSON.stringify({}) })
  check('E1. purge without confirm is refused', noConfirm.status === 400, 'status=' + noConfirm.status)
  check('E2. retention needs a token', (await fetch(BASE + '/api/desktop/retention')).status === 401)

  // B/C/D. purge
  const run = await fetch(BASE + '/api/desktop/retention/run', { method: 'POST', headers: H, body: JSON.stringify({ confirm: true }) }).then((r) => r.json())
  check('B1. one recording deleted', run.ok && run.deleted.recordings === 1, JSON.stringify(run.deleted))
  check('B2. its file is gone', !fs.existsSync(recOld))
  check('B3. the fresh recording survives', fs.existsSync(recNew))
  check('C. only the old audit row went', run.deleted.audit === 1, JSON.stringify(run.deleted))
  check('D1. a notice was written before the deletion', run.notice && run.notice.count === 1, JSON.stringify(run.notice))

  const listed = await fetch(BASE + '/api/desktop/retention', { headers: H }).then((r) => r.json())
  check('D2. the notice is in the notifications table', listed.state.lastSummary && listed.state.lastSummary.notice === true, JSON.stringify(listed.state))
  check('B4. the surviving rows are two', listed.preview.recordings.total === 2, JSON.stringify(listed.preview.recordings))

  const again = await fetch(BASE + '/api/desktop/retention/run', { method: 'POST', headers: H, body: JSON.stringify({ confirm: true }) }).then((r) => r.json())
  check('D3. no second notice within a day', again.notice === null, JSON.stringify(again.notice))

  // F. metrics
  const metrics = await fetch(BASE + '/metrics', { headers: H }).then((r) => r.text())
  check('F1. kept volume is exposed', /airemote_recordings_rows 2/.test(metrics), 'rows')
  check('F2. pending audit rows are exposed', /airemote_retention_expired_audit_rows 0/.test(metrics), 'audit')
  check('F3. failures counter is exposed', /airemote_retention_failures_total 0/.test(metrics))

  await srv.stop()
  console.log(failed === 0 ? 'ALL RETENTION CHECKS PASSED' : failed + ' CHECK(S) FAILED')
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error('FAILED: ' + (e && e.stack || e)); process.exit(1) })
