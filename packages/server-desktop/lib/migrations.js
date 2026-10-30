'use strict'
/**
 * migrations.js — ordered, reversible schema migrations for the desktop server (R7).
 *
 * The schema used to be 17 `CREATE TABLE IF NOT EXISTS` statements with no version at
 * all, so an upgrade could only ever add tables: changing one, or rolling a release back,
 * had no supported path. SQLite already ships the version primitive (`PRAGMA user_version`),
 * so this module uses it and nothing else — no extra bookkeeping table to get out of sync.
 *
 * Rules:
 *   - the current schema is BASELINE = 1; a database from 3.8.x is adopted at 1 without
 *     any DDL, because `initDb` guarantees those tables already exist;
 *   - every step runs inside a transaction and bumps user_version with it, so a crash
 *     leaves either the old or the new version, never a mixture;
 *   - `down` must be as real as `up`: a rollback that cannot remove its own change is a
 *     migration that should not exist.
 */

const MIGRATIONS = [
  {
    version: 1,
    name: 'baseline (3.8.x schema)',
    up() { /* adopted, never applied */ },
    // A 3.8.x database already ships idx_sessions_device, so this migration must never
    // reuse a name it did not create: down would then delete somebody else's index.
    down() { /* cannot go below the baseline */ },
  },
  {
    version: 2,
    name: 'query-indexes',
    up(db) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_audit_log_created        ON audit_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_log_device         ON audit_log(device_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_device_started  ON sessions(device_id, started_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_started    ON sessions(user_id, started_at);
      `)
    },
    down(db) {
      db.exec(`
        DROP INDEX IF EXISTS idx_sessions_user_started;
        DROP INDEX IF EXISTS idx_sessions_device_started;
        DROP INDEX IF EXISTS idx_audit_log_device;
        DROP INDEX IF EXISTS idx_audit_log_created;
      `)
    },
  },
]

const BASELINE = 1
const LATEST = MIGRATIONS.reduce((m, x) => Math.max(m, x.version), 0)

function currentVersion(db) {
  const row = db.prepare('PRAGMA user_version').get() || {}
  const v = row.user_version !== undefined ? row.user_version : Object.values(row)[0]
  return Number(v) || 0
}

function setVersion(db, version) {
  // PRAGMA cannot take a bound parameter; the value is an integer we computed ourselves.
  db.exec('PRAGMA user_version = ' + (Number(version) | 0))
}

/** A 3.8.x database (or a fresh one) is already at the baseline schema. */
function adoptBaseline(db, log) {
  if (currentVersion(db) !== 0) return false
  setVersion(db, BASELINE)
  if (log) log('schema', 'adopted baseline v' + BASELINE)
  return true
}

function pending(db, direction) {
  const v = currentVersion(db)
  if (direction === 'down') {
    return MIGRATIONS.filter((m) => m.version <= v && m.version > BASELINE).sort((a, b) => b.version - a.version)
  }
  return MIGRATIONS.filter((m) => m.version > v).sort((a, b) => a.version - b.version)
}

function apply(db, migration, direction, log) {
  const before = currentVersion(db)
  const next = direction === 'down' ? migration.version - 1 : migration.version
  db.exec('BEGIN')
  try {
    if (direction === 'down') migration.down(db)
    else migration.up(db)
    setVersion(db, next)
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch {}
    throw new Error('migration v' + migration.version + ' (' + migration.name + ') ' + direction + ' failed: ' + e.message)
  }
  if (log) log('schema', direction + ' v' + migration.version + ' ' + migration.name + ' (' + before + ' -> ' + next + ')')
  return next
}

/**
 * Runs every pending step (or a single step when `once` is true).
 * to: stop at this version (optional). direction: 'up' (default) or 'down'.
 */
function run(db, opts) {
  const o = opts || {}
  const direction = o.direction === 'down' ? 'down' : 'up'
  const list = pending(db, direction)
  const applied = []
  for (const m of list) {
    if (o.to !== undefined && (direction === 'up' ? m.version > o.to : m.version - 1 < o.to)) break
    apply(db, m, direction, o.log)
    applied.push(m.version)
    if (o.once) break
  }
  return { from: currentVersion(db), direction, applied, version: currentVersion(db) }
}

function status(db) {
  const version = currentVersion(db)
  return {
    version,
    baseline: BASELINE,
    latest: LATEST,
    pendingUp: pending(db, 'up').map((m) => m.version),
    pendingDown: pending(db, 'down').map((m) => m.version),
    steps: MIGRATIONS.map((m) => ({ version: m.version, name: m.name })),
  }
}

module.exports = { MIGRATIONS, BASELINE, LATEST, currentVersion, setVersion, adoptBaseline, pending, run, status }
