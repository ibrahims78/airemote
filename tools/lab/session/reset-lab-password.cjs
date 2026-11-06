#!/usr/bin/env node
'use strict'
/**
 * reset-lab-password.cjs — reset the password of the LAB account only (lab-probe@local).
 *
 * Why: the credentials stored in lab-credentials.txt no longer match the account, so the
 * dashboard cannot be exercised (visual state proofs, the 277-button audit). The owner's
 * accounts (admin@airemote.local, admin@airemote.io) are never touched.
 *
 * The new password is written to %TEMP%\airemote-lab-probe.txt, never to outputs/.
 * Run under Electron's node (better-sqlite3 ABI):
 *   set ELECTRON_RUN_AS_NODE=1 && electron.exe tools\lab\session\reset-lab-password.cjs
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const ROOT = path.join(__dirname, '..', '..', '..')
const D = require(path.join(ROOT, 'node_modules', '.pnpm', 'better-sqlite3@9.6.0', 'node_modules', 'better-sqlite3'))
const bcrypt = require(path.join(ROOT, 'node_modules', '.pnpm', 'bcryptjs@2.4.3', 'node_modules', 'bcryptjs'))

const EMAIL = 'lab-probe@local'
const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
const file = path.join(appData, 'AiRemote-Server', 'airemote.db')
const pass = 'LabProbe-' + require('crypto').randomBytes(9).toString('base64url')
const hash = bcrypt.hashSync(pass, 12)

const db = new D(file)
const row = db.prepare('SELECT id, email FROM users WHERE email=?').get(EMAIL)
if (!row) { console.error('lab account not found: ' + EMAIL); process.exit(1) }
db.prepare('UPDATE users SET password_hash=? WHERE email=?').run(hash, EMAIL)
const after = db.prepare('SELECT length(password_hash) AS n FROM users WHERE email=?').get(EMAIL)
db.close()

const out = path.join(process.env.TEMP || os.tmpdir(), 'airemote-lab-probe.txt')
fs.writeFileSync(out, EMAIL + '\n' + pass + '\n', 'utf8')
console.log('reset ' + EMAIL + ' (hash len ' + after.n + ')')
console.log('password written to ' + out)
