#!/usr/bin/env node
'use strict'
/**
 * migrate.cjs — inspect or move the desktop schema by hand (R7).
 *
 * usage:
 *   node scripts/migrate.cjs --db <path> --status
 *   node scripts/migrate.cjs --db <path> --up [--once] [--to <version>]
 *   node scripts/migrate.cjs --db <path> --down [--once] [--to <version>]
 *
 * --db is mandatory on purpose: an accidental run against the live database is exactly
 * the mistake this tool must not make easy. The server applies migrations itself on boot;
 * this is for staged upgrades, forensics and the rollback drill.
 */
const fs = require('fs')
const path = require('path')

const { createDatabase } = require(path.resolve(__dirname, '..', 'packages', 'server-desktop', 'lib', 'db-adapter'))
const migrations = require(path.resolve(__dirname, '..', 'packages', 'server-desktop', 'lib', 'migrations'))

function parse(argv) {
  const out = { direction: null, once: false, to: undefined, db: null, status: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--up') out.direction = 'up'
    else if (a === '--down') out.direction = 'down'
    else if (a === '--once') out.once = true
    else if (a === '--status') out.status = true
    else if (a === '--db') out.db = argv[++i]
    else if (a === '--to') out.to = parseInt(argv[++i], 10)
  }
  return out
}

function main() {
  const o = parse(process.argv.slice(2))
  if (!o.db) {
    console.error('usage: node scripts/migrate.cjs --db <path> --status|--up|--down [--once] [--to N]')
    process.exit(2)
  }
  if (!fs.existsSync(o.db)) {
    console.error('database not found: ' + o.db)
    process.exit(2)
  }
  const log = (scope, msg) => console.log('[' + scope + '] ' + msg)
  const db = createDatabase(o.db)
  try {
    db.exec("PRAGMA journal_mode = WAL")
    if (o.status || !o.direction) {
      console.log(JSON.stringify(migrations.status(db), null, 2))
      process.exit(0)
    }
    migrations.adoptBaseline(db, log)
    const r = migrations.run(db, { direction: o.direction, once: o.once, to: o.to, log })
    console.log('RESULT ' + JSON.stringify(r))
    console.log('STATUS ' + JSON.stringify(migrations.status(db)))
    process.exit(0)
  } finally {
    try { db.close() } catch {}
  }
}

main()
