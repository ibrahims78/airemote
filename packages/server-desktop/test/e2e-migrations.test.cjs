/**
 * E2E test — R7 schema migrations (v3.8.30).
 *
 * The gap: 17 `CREATE TABLE IF NOT EXISTS` statements and no version, so an upgrade could
 * only add tables and a rollback had no path. This test pins the new contract:
 *
 *   A. a fresh database boots at the latest version with the indexes in place
 *   B. the HTTP status endpoint reports version, latest and no pending steps
 *   C. `down` removes exactly what `up` added and keeps the rows
 *   D. `up` restores it again (reversible, not one-way)
 *   E. a legacy 3.8.x database (tables + rows, user_version 0) is adopted at the baseline
 *      and upgraded without touching its data
 *   F. the CLI reports the same status and refuses to guess a database path
 *
 * Requires a usable sqlite engine in this process; run under the Electron binary with
 * ELECTRON_RUN_AS_NODE=1.
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

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
const ROOT = path.resolve(SERVER_DIR, '..', '..')
const migrations = require(path.resolve(SERVER_DIR, 'lib', 'migrations'))
const PORT = 3993
const SECRET = crypto.randomBytes(32).toString('hex')
const BASE = 'http://127.0.0.1:' + PORT

let failed = 0
function check(desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? '  (' + extra + ')' : '')); failed++ }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-mig-'))
const dbPath = path.join(tmp, 'data', 'airemote.db')

const indexes = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name").all().map((r) => r.name)
// the schema ships about twenty of its own idx_* names, so the assertions must name the
// four this migration owns instead of counting every index in the file
const MIGRATION_INDEXES = ['idx_audit_log_created', 'idx_audit_log_device', 'idx_sessions_device_started', 'idx_sessions_user_started']
const migrationIndexes = (db) => { const names = indexes(db); return MIGRATION_INDEXES.filter((n) => names.includes(n)) }
const version = (db) => Number((db.prepare('PRAGMA user_version').get() || {}).user_version || 0)

async function main() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  // A. fresh boot
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, tls: false, backup: false,
    logger: { info() {}, warn() {}, error() {} }, desktopCallbacks: {} })

  const admin = await fetch(BASE + '/api/auth/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Mig', email: 'mig@test', password: 'correct-horse-battery' }),
  }).then((r) => r.json())
  const H = { Authorization: 'Bearer ' + admin.token, 'Content-Type': 'application/json' }

  const live = new Database(dbPath)
  check('A1. fresh database is at the latest version', version(live) === migrations.LATEST, 'v' + version(live))
  check('A2. the four migration indexes exist', migrationIndexes(live).length === 4, migrationIndexes(live).join(','))
  live.close()

  // B. status over HTTP
  const st = await fetch(BASE + '/api/desktop/schema', { headers: H }).then((r) => r.json())
  check('B1. status reports version and latest', st.version === migrations.LATEST && st.latest === migrations.LATEST, JSON.stringify(st))
  check('B2. nothing pending', Array.isArray(st.pendingUp) && st.pendingUp.length === 0)
  check('B3. status needs a token', (await fetch(BASE + '/api/desktop/schema')).status === 401)

  await srv.stop()

  // C/D. reversible
  const firstUser = new Database(dbPath)
  const before = firstUser.prepare('SELECT COUNT(*) AS c FROM users').get().c
  const down1 = migrations.run(firstUser, { direction: 'down', once: true, log: () => {} })
  check('C1. down moves one step back', down1.version === migrations.LATEST - 1, JSON.stringify(down1))
  // 3.9.0 — the latest step is session-view-tickets; the query indexes go one step later.
  const ticketTable = firstUser.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='session_view_tickets'").get().c
  check('C2. session_view_tickets is gone after its down', ticketTable === 0, 'table=' + ticketTable)
  const down2 = migrations.run(firstUser, { direction: 'down', once: true, log: () => {} })
  check('C2b. the query indexes are gone after the second down', migrationIndexes(firstUser).length === 0, migrationIndexes(firstUser).join(','))
  check('C3. rows survive the down', firstUser.prepare('SELECT COUNT(*) AS c FROM users').get().c === before)
  const up1 = migrations.run(firstUser, { once: true, log: () => {} })
  check('D1. up moves one step forward', up1.version === migrations.LATEST - 1, JSON.stringify(up1))
  const up2 = migrations.run(firstUser, { once: true, log: () => {} })
  check('D1b. up restores the latest version', up2.version === migrations.LATEST, JSON.stringify(up2))
  const ticketBack = firstUser.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='session_view_tickets'").get().c
  check('D1c. session_view_tickets is back', ticketBack === 1, 'table=' + ticketBack)
  check('D2. the migration indexes are back', migrationIndexes(firstUser).length === 4, migrationIndexes(firstUser).join(','))
  check('D3. rows survive the up', firstUser.prepare('SELECT COUNT(*) AS c FROM users').get().c === before)
  firstUser.close()

  // E. legacy database: tables and rows, user_version 0
  const legacyPath = path.join(tmp, 'legacy', 'airemote.db')
  fs.mkdirSync(path.dirname(legacyPath), { recursive: true })
  const legacy = new Database(legacyPath)
  legacy.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT, password_hash TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE devices (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, device_id TEXT, user_id TEXT, started_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, device_id TEXT, action TEXT, created_at TEXT DEFAULT (datetime('now')));
    PRAGMA user_version = 0;
  `)
  legacy.prepare("INSERT INTO users (id,email,name,role,password_hash) VALUES ('u1','legacy@x','Legacy','admin','h')").run()
  legacy.prepare("INSERT INTO devices (id,name) VALUES ('d1','legacy-device')").run()
  check('E0. legacy database starts at user_version 0', version(legacy) === 0)
  const adopted = migrations.adoptBaseline(legacy, () => {})
  check('E1. baseline adopted without DDL', adopted === true && version(legacy) === 1, 'v' + version(legacy))
  const legacyUp = migrations.run(legacy, { log: () => {} })
  check('E2. legacy database upgrades to latest', legacyUp.version === migrations.LATEST, JSON.stringify(legacyUp))
  check('E3. legacy rows intact after upgrade',
    legacy.prepare('SELECT COUNT(*) AS c FROM users').get().c === 1 &&
    legacy.prepare('SELECT COUNT(*) AS c FROM devices').get().c === 1)
  check('E4. migration indexes were created on the legacy database', migrationIndexes(legacy).length === 4, migrationIndexes(legacy).join(','))
  legacy.close()

  // F. CLI
  const cli = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate.cjs'), '--db', dbPath, '--status'], { encoding: 'utf8' })
  check('F1. CLI prints the status', cli.status === 0 && /"version":\s*2/.test(cli.stdout || ''), (cli.stdout || '').slice(0, 120))
  const noDb = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate.cjs'), '--up'], { encoding: 'utf8' })
  check('F2. CLI refuses without --db', noDb.status !== 0)

  console.log(failed === 0 ? 'ALL MIGRATION CHECKS PASSED' : failed + ' CHECK(S) FAILED')
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error('FAILED: ' + (e && e.stack || e)); process.exit(1) })
