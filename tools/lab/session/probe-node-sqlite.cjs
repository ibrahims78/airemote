#!/usr/bin/env node
'use strict'
/**
 * probe-node-sqlite.cjs — reproduce the login 500 on a COPY of the DB using the same
 * adapter the packaged server uses (node:sqlite), and print which statement throws.
 *
 * Run under the server's Electron (it carries node:sqlite):
 *   set ELECTRON_RUN_AS_NODE=1 && packages\server-desktop\node_modules\electron\dist\electron.exe tools\lab\session\probe-node-sqlite.cjs
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const ROOT = path.join(__dirname, '..', '..', '..')
const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
const real = path.join(appData, 'AiRemote-Server', 'airemote.db')
const copy = path.join(os.tmpdir(), 'airemote-probe-' + Date.now() + '.db')
fs.copyFileSync(real, copy)
for (const suffix of ['-wal', '-shm']) {
  if (fs.existsSync(real + suffix)) fs.copyFileSync(real + suffix, copy + suffix)
}

process.env.AIREMOTE_DB = 'node'
const { createDatabase } = require(path.join(ROOT, 'packages', 'server-desktop', 'lib', 'db-adapter.js'))
const db = createDatabase(copy, {})

function step (label, fn) {
  try { const out = fn(); console.log('ok   ' + label + (out === undefined ? '' : ' -> ' + JSON.stringify(out).slice(0, 80))) }
  catch (e) { console.log('FAIL ' + label + '\n     ' + e.message + '\n     ' + String(e.stack || '').split('\n').slice(1, 4).join('\n     ')) }
}

const user = db.prepare('SELECT * FROM users WHERE email=?').get('lab-probe@local')
console.log('user=' + (user && user.email))

const crypto = require('crypto')
const tok = crypto.createHash('sha256').update('probe').digest('hex')
step('refresh_tokens insert', () => db.prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)')
  .run(crypto.randomUUID(), user.id, tok, new Date(Date.now() + 3600000).toISOString()))
step('refresh_tokens cleanup', () => db.prepare('DELETE FROM refresh_tokens WHERE token_hash=?').run(tok))
step('audit_log insert', () => db.prepare('INSERT INTO audit_log (user_id, user_email, device_id, action, details, ip_address) VALUES (?,?,?,?,?,?)')
  .run(user.id, user.email, null, 'probe', null, '127.0.0.1'))

// statements the login path touches on the way in
step('devices token lookup', () => db.prepare('SELECT * FROM devices WHERE token=?').get('nope'))
step('settings read', () => db.prepare('SELECT value FROM settings WHERE key=?').get('jwt_secret'))
step('settings read bare-named', () => db.prepare('SELECT value FROM settings WHERE key = :key').get({ key: 'jwt_secret' }))
step('settings upsert', () => db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('probe_key', 'v'))

db.close()
try { fs.unlinkSync(copy) } catch {}
