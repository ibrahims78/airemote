#!/usr/bin/env node
'use strict'
// Parity harness: run the same representative queries through whichever engine
// AIREMOTE_DB selects and print deterministic JSON so the two outputs can be diffed.
// usage: AIREMOTE_DB=node electron -e ... | node scripts/db-parity.cjs <dbCopy> <out.json>
const fs = require('fs')
const path = require('path')
const { createDatabase } = require(path.resolve(__dirname, '..', 'packages', 'server-desktop', 'lib', 'db-adapter'))

const dbPath = process.argv[2]
const outPath = process.argv[3]
if (!dbPath || !fs.existsSync(dbPath)) { console.error('missing db ' + dbPath); process.exit(2) }

const db = createDatabase(dbPath)
const out = { engine: db.__engine || 'better-sqlite3', results: [] }

function q(name, fn) {
  try { out.results.push({ name, value: fn() }) }
  catch (e) { out.results.push({ name, error: String(e.message || e) }) }
}

const tables = ['users', 'devices', 'sessions', 'recordings', 'audit_log', 'notifications', 'alerts', 'contacts']
for (const t of tables) {
  q('count:' + t, () => {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()
    return Number(r && r.n)
  })
}

q('journal_mode', () => {
  const rows = db.prepare('PRAGMA journal_mode').all()
  return rows && rows[0]
})

q('devices:shape', () => db.prepare('SELECT id, name, status, code FROM devices ORDER BY name').all())

q('named-param', () => {
  const first = db.prepare('SELECT id FROM devices ORDER BY name LIMIT 1').get()
  if (!first) return null
  return db.prepare('SELECT name FROM devices WHERE id = @id').get({ id: first.id })
})

q('join:sessions', () => db.prepare(
  'SELECT s.id, s.state, d.name FROM sessions s LEFT JOIN devices d ON d.id = s.device_id ORDER BY s.id DESC LIMIT 5'
).all())

q('aggregate:recordings', () => db.prepare(
  'SELECT COUNT(*) AS n, COALESCE(SUM(size_mb), 0) AS mb FROM recordings'
).get())

q('types', () => {
  const r = db.prepare('SELECT 1 AS i, 1.5 AS f, NULL AS z').get()
  return { i: typeof r.i, f: typeof r.f, z: r.z === null ? 'null' : typeof r.z }
})

q('like-and-order', () => db.prepare(
  "SELECT name FROM devices WHERE name LIKE '%WIN%' ORDER BY name"
).all())

q('insert-read-delete', () => {
  db.exec('CREATE TABLE IF NOT EXISTS __parity(x INTEGER, y TEXT)')
  db.prepare('DELETE FROM __parity').run()
  const ins = db.prepare('INSERT INTO __parity(x, y) VALUES (?, ?)').run(42, 'abc')
  const row = db.prepare('SELECT x, y FROM __parity WHERE x = ?').get(42)
  db.prepare('DELETE FROM __parity WHERE x = ?').run(42)
  return { changes: Number(ins.changes), id: Number(ins.lastInsertRowid), row }
})

db.close()
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
console.log('PARITY_WRITTEN ' + out.engine + ' -> ' + outPath)
