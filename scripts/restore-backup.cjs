#!/usr/bin/env node
'use strict'
/**
 * restore-backup.cjs — put a snapshot back on disk, after proving it is usable (R7).
 *
 * usage: node scripts/restore-backup.cjs <backup.db> <targetDir> [--force]
 *
 * The target is <targetDir>/airemote.db. It refuses to overwrite an existing database
 * unless --force is given, and it never touches secret.key: stored credentials are
 * encrypted with that file, so a restore that also needs decryptable secrets must copy
 * it from the same data directory. The script says so instead of guessing.
 */
const fs = require('fs')
const path = require('path')

function openProbe(file) {
  const { createDatabase } = require(path.resolve(__dirname, '..', 'packages', 'server-desktop', 'lib', 'db-adapter'))
  return createDatabase(file)
}

function inspect(file) {
  if (!fs.existsSync(file)) throw new Error('backup not found: ' + file)
  const db = openProbe(file)
  try {
    const row = db.prepare('PRAGMA integrity_check').get() || {}
    const verdict = row.integrity_check || row['integrity_check'] || Object.values(row)[0]
    if (String(verdict || '').toLowerCase() !== 'ok') throw new Error('integrity_check -> ' + verdict)
    return {
      users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
      devices: db.prepare('SELECT COUNT(*) AS c FROM devices').get().c,
      sessions: db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c,
      audit: db.prepare('SELECT COUNT(*) AS c FROM audit_log').get().c,
    }
  } finally { try { db.close() } catch {} }
}

function restore(backup, targetDir, opts) {
  const force = !!(opts && opts.force)
  const counts = inspect(backup)
  fs.mkdirSync(targetDir, { recursive: true })
  const dest = path.join(targetDir, 'airemote.db')
  if (fs.existsSync(dest) && !force) {
    throw new Error('refusing to overwrite ' + dest + ' (pass --force)')
  }
  fs.copyFileSync(backup, dest)
  // SQLite auxiliary files from the previous database must not survive next to the copy.
  for (const suffix of ['-wal', '-shm']) {
    const side = dest + suffix
    if (fs.existsSync(side)) fs.rmSync(side, { force: true })
  }
  return { dest, counts }
}

if (require.main === module) {
  const [backup, targetDir, ...rest] = process.argv.slice(2)
  if (!backup || !targetDir) {
    console.error('usage: node scripts/restore-backup.cjs <backup.db> <targetDir> [--force]')
    process.exit(2)
  }
  try {
    const r = restore(backup, targetDir, { force: rest.includes('--force') })
    console.log('RESTORED ' + r.dest)
    console.log('COUNTS ' + JSON.stringify(r.counts))
    console.log('NOTE secret.key is not part of a database snapshot: copy it from the source')
    console.log('     data directory if stored credentials must stay decryptable.')
    process.exit(0)
  } catch (e) {
    console.error('RESTORE FAILED: ' + e.message)
    process.exit(1)
  }
}

module.exports = { restore, inspect }
