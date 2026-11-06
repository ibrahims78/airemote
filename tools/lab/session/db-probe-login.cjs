#!/usr/bin/env node
'use strict'
/** db-probe-login.cjs — why does a *valid* login 500? Try each statement the success path runs. */
const path = require('path')
const os = require('os')
const ROOT = path.join(__dirname, '..', '..', '..')
const D = require(path.join(ROOT, 'node_modules', '.pnpm', 'better-sqlite3@9.6.0', 'node_modules', 'better-sqlite3'))
const crypto = require('crypto')
const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
const db = new D(path.join(appData, 'AiRemote-Server', 'airemote.db'))

for (const t of ['refresh_tokens', 'audit_log']) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(t)
  console.log('--- ' + t + ' ---')
  console.log(row ? row.sql : '(missing)')
  const trig = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name=?").all(t)
  for (const g of trig) console.log('TRIGGER ' + g.name + ': ' + g.sql)
}

const user = db.prepare("SELECT id, email FROM users WHERE email='lab-probe@local'").get()
console.log('user=' + (user && user.email))
try {
  const info = db.prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)')
    .run(crypto.randomUUID(), user.id, crypto.createHash('sha256').update('probe').digest('hex'), new Date(Date.now() + 3600000).toISOString())
  console.log('refresh insert ok, rowid=' + info.lastInsertRowid)
  db.prepare('DELETE FROM refresh_tokens WHERE token_hash=?').run(crypto.createHash('sha256').update('probe').digest('hex'))
  console.log('cleanup ok')
} catch (e) { console.log('refresh insert FAILED: ' + e.message) }
try {
  db.prepare('INSERT INTO audit_log (user_id, user_email, device_id, action, details, ip_address) VALUES (?,?,?,?,?,?)')
    .run(user.id, user.email, null, 'probe', null, '127.0.0.1')
  console.log('audit insert ok')
} catch (e) { console.log('audit insert FAILED: ' + e.message) }
db.close()
