#!/usr/bin/env node
'use strict'
/** db-users.cjs — read-only look at the local server DB (run under Electron's node: better-sqlite3 ABI). */
const path = require('path')
const os = require('os')
const D = require(path.join(__dirname, '..', '..', '..', 'node_modules', '.pnpm', 'better-sqlite3@9.6.0', 'node_modules', 'better-sqlite3'))
const file = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'AiRemote-Server', 'airemote.db')
const db = new D(file, { readonly: true })
const users = db.prepare('SELECT id, email, name, role, password_hash, totp_enabled, created_at FROM users').all()
console.log('DB=' + file)
for (const u of users) {
  const h = String(u.password_hash || '')
  const scheme = h.includes('$') ? h.split('$')[0] : (h.startsWith('$2') ? 'bcrypt' : 'unknown')
  console.log([u.id.slice(0, 8), u.email, u.role, 'scheme=' + scheme, 'len=' + h.length, 'totp=' + u.totp_enabled, u.created_at].join(' | '))
}
const count = db.prepare('SELECT COUNT(*) AS n FROM devices').get()
console.log('devices=' + count.n)
db.close()
