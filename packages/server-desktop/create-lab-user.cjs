/**
 * Creates (or refreshes) a temporary lab admin on the LOCAL desktop server so a
 * headless harness can log in. Prints the credentials as JSON. Run under
 * Electron-as-node because better-sqlite3 is built for the Electron ABI.
 */
const path = require('path')
const crypto = require('crypto')
const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')

const DB = process.env.LAB_DB || path.join(process.env.APPDATA || '', 'AiRemote-Server', 'airemote.db')
const EMAIL = process.env.LAB_USER || 'lab-probe@local'
const PW = process.env.LAB_PASS || ('Lab-' + crypto.randomBytes(6).toString('hex'))

const db = new Database(DB)
const exists = db.prepare('SELECT id FROM users WHERE email=?').get(EMAIL)
const hash = bcrypt.hashSync(PW, 10)
if (exists) {
  db.prepare('UPDATE users SET password_hash=?, role=?, name=? WHERE email=?').run(hash, 'admin', 'Lab Probe', EMAIL)
} else {
  db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)')
    .run(crypto.randomUUID(), EMAIL, 'Lab Probe', 'admin', hash)
}
const row = db.prepare('SELECT id,email,role FROM users WHERE email=?').get(EMAIL)
db.close()
const OUT = process.env.LAB_OUT || path.join(process.env.APPDATA || '', 'AiRemote', 'lab-probe.json')
require('fs').mkdirSync(path.dirname(OUT), { recursive: true })
require('fs').writeFileSync(OUT, JSON.stringify({ email: row.email, role: row.role, password: PW }), 'utf8')
console.log(JSON.stringify({ email: row.email, role: row.role, written: OUT }))
