/**
 * E2E test — R7 backup and restore (v3.8.29).
 *
 * The R7 gate says: a restore on a clean machine brings back every device and session.
 * This test goes as close to that as a single process can:
 *
 *   A. a snapshot is created through the product API and verified on disk (integrity
 *      check + row counts read from the snapshot itself)
 *   B. retention keeps only the newest N snapshots
 *   C. the admin listing reports state (age, size, failures)
 *   D. /metrics exposes the backup series
 *   E. the CLI restores the snapshot into an empty directory
 *   F. the restored database boots a real server and still lists the device
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
const PORT = 3995
const SECRET = crypto.randomBytes(32).toString('hex')
const BASE = 'http://127.0.0.1:' + PORT

let failed = 0
function check(desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? '  (' + extra + ')' : '')); failed++ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-bk-'))
const dbPath = path.join(tmp, 'data', 'airemote.db')
const backupDir = path.join(tmp, 'backups')

async function main() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  await srv.start({
    port: PORT, jwtSecret: SECRET, dbPath, tls: false,
    backupDir, backupKeep: 2, backupIntervalHours: 9999,
    logger: { info() {}, warn() {}, error() {} }, desktopCallbacks: {},
  })

  // A. an account and a device exist to be restored
  const setup = await fetch(BASE + '/api/auth/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Backup Admin', email: 'bk@test', password: 'correct-horse-battery' }),
  }).then((r) => r.json())
  const token = setup.token
  check('A0. admin account created', !!token)
  const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  const device = await fetch(BASE + '/api/devices', {
    method: 'POST', headers: H, body: JSON.stringify({ name: 'restore-target' }),
  }).then((r) => r.json())
  check('A1. device created', !!(device && device.id), JSON.stringify(device).slice(0, 120))

  // A. three snapshots; keep=2 so retention must prune one
  const made = []
  for (let i = 0; i < 3; i++) {
    const r = await fetch(BASE + '/api/desktop/backup', { method: 'POST', headers: H }).then((r) => r.json())
    made.push(r)
    await sleep(1100) // snapshot names carry a second-resolution timestamp
  }
  const last = made[made.length - 1]
  check('A2. snapshot created through the API', !!(last && last.ok && last.path), JSON.stringify(last).slice(0, 160))
  check('A3. snapshot file exists and is not empty', last && fs.existsSync(last.path) && fs.statSync(last.path).size > 0)
  check('A4. snapshot reports the row counts', last && last.counts && last.counts.users === 1 && last.counts.devices === 1,
    JSON.stringify(last && last.counts))

  // A. the snapshot is a real database, not a byte copy of a torn file
  const probe = new Database(last.path)
  const integrity = probe.prepare('PRAGMA integrity_check').get() || {}
  const verdict = integrity.integrity_check || integrity['integrity_check'] || Object.values(integrity)[0]
  const names = probe.prepare('SELECT name FROM devices').all().map((r) => r.name)
  probe.close()
  check('A5. snapshot passes integrity_check', String(verdict).toLowerCase() === 'ok', String(verdict))
  check('A6. the device survives in the snapshot', names.includes('restore-target'), names.join(','))

  // B. retention
  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'))
  check('B. retention keeps only the newest 2', files.length === 2, files.length + ' files')
  check('B2. no .part files left behind', fs.readdirSync(backupDir).filter((f) => f.endsWith('.part')).length === 0)

  // C. listing endpoint
  const listed = await fetch(BASE + '/api/desktop/backups', { headers: H }).then((r) => r.json())
  check('C1. listing answers with state and files', !!(listed.state && Array.isArray(listed.files)), JSON.stringify(listed).slice(0, 120))
  check('C2. state reports a fresh snapshot', listed.state && listed.state.ageSeconds !== null && listed.state.ageSeconds < 300,
    JSON.stringify(listed.state && listed.state.ageSeconds))
  check('C3. listing needs a token', (await fetch(BASE + '/api/desktop/backups')).status === 401)

  // D. metrics
  const metrics = await fetch(BASE + '/metrics', { headers: H }).then((r) => r.text())
  check('D1. backup files gauge present', /airemote_backup_files 2/.test(metrics))
  check('D2. backup age gauge is a number', /airemote_backup_age_seconds \d+/.test(metrics))
  check('D3. backup failures counter present', /airemote_backup_failures_total 0/.test(metrics))

  await srv.stop()

  // E. CLI restore into an empty directory
  const restoredDir = path.join(tmp, 'restored')
  const cli = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'restore-backup.cjs'), last.path, restoredDir,
  ], { encoding: 'utf8', env: { ...process.env } })
  check('E1. restore CLI exits 0', cli.status === 0, (cli.stdout || '') + (cli.stderr || ''))
  check('E2. restored database exists', fs.existsSync(path.join(restoredDir, 'airemote.db')))

  // E2. a second restore over the same target refuses without --force
  const cli2 = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'restore-backup.cjs'), last.path, restoredDir,
  ], { encoding: 'utf8', env: { ...process.env } })
  check('E3. overwrite refused without --force', cli2.status !== 0)

  // F. the restored database boots a real server and still has the device
  const boot = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'boot-check.cjs')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BOOT_DB: path.join(restoredDir, 'airemote.db'),
      BOOT_PORT: '3994', BOOT_SCHEME: 'http',
      BOOT_EMAIL: 'bk@test', BOOT_PASS: 'correct-horse-battery',
    },
  })
  const out = (boot.stdout || '') + (boot.stderr || '')
  check('F1. restored server boots', /HEALTH \{.*"status":"ok"/.test(out), out.split('\n').slice(-4).join(' | '))
  check('F2. login works on the restored copy', /LOGIN ok/.test(out), out.split('\n').slice(-3).join(' | '))
  check('F3. the device is listed after restore', /DEVICES 1 -> restore-target/.test(out), out.split('\n').slice(-2).join(' | '))

  console.log(failed === 0 ? 'ALL BACKUP CHECKS PASSED' : failed + ' CHECK(S) FAILED')
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error('FAILED: ' + (e && e.stack || e)); process.exit(1) })
