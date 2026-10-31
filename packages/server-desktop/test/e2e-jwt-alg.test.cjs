/**
 * E2E — R9.2 regression: the server must only accept HS256 tokens.
 *
 * A token signed with another HMAC algorithm (e.g. HS512) using the same secret
 * must be rejected with 401, so a future refactor cannot silently widen the
 * accepted algorithms again.
 *
 * Run: node packages/server-desktop/test/e2e-jwt-alg.test.cjs
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

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
    process.exit(0)
  }
}
const jwt = require('jsonwebtoken')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3994
const SECRET = 'jwt-alg-secret-' + crypto.randomBytes(8).toString('hex')
const BASE = 'http://127.0.0.1:' + PORT

let failed = false
const check = (d, c) => { if (c) console.log('PASS: ' + d); else { console.error('FAIL: ' + d); failed = true } }

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-jwt-'))
  const dbPath = path.join(tmpDir, 'jwt.db')
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger, desktopCallbacks: {}, tls: false })

  const db = new Database(dbPath)
  const userId = crypto.randomUUID()
  db.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)').run(userId, 'alg@local', 'Alg', 'admin', 'x')
  db.close()

  const payload = { userId, email: 'alg@local', role: 'admin' }
  const hs256 = jwt.sign(payload, SECRET, { expiresIn: '1h', algorithm: 'HS256' })
  const hs512 = jwt.sign(payload, SECRET, { expiresIn: '1h', algorithm: 'HS512' })
  const hs384 = jwt.sign(payload, SECRET, { expiresIn: '1h', algorithm: 'HS384' })

  const ok = await fetch(BASE + '/api/devices', { headers: { Authorization: 'Bearer ' + hs256 } })
  check('HS256 token accepted (200)', ok.status === 200)

  const bad512 = await fetch(BASE + '/api/devices', { headers: { Authorization: 'Bearer ' + hs512 } })
  check('HS512 token rejected (401)', bad512.status === 401)

  const bad384 = await fetch(BASE + '/api/devices', { headers: { Authorization: 'Bearer ' + hs384 } })
  check('HS384 token rejected (401)', bad384.status === 401)

  const none = await fetch(BASE + '/api/devices', { headers: { Authorization: 'Bearer ' + 'x.y.z' } })
  check('garbage token rejected (401)', none.status === 401)

  await srv.stop()
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  console.log('')
  if (failed) { console.error('JWT ALGORITHM TEST FAILED'); process.exit(1) }
  console.log('JWT ALGORITHM TEST PASSED')
  process.exit(0)
}

main().catch(e => { console.error('TEST ERROR:', e && e.stack || e); process.exit(1) })
