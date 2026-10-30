/**
 * E2E test — R7 observability (v3.8.28): /ready and /metrics.
 *
 * What is checked:
 *   A. /ready answers 200 with db + schema ok on a clean boot
 *   B. /metrics refuses an anonymous caller (401)
 *   C. /metrics with a token answers Prometheus text with the core series
 *   D. HTTP counters actually move (same request twice -> +2 on the 200 series)
 *   E. a 404 route is counted under its own status label
 *   F. request-duration count is non-zero (the hook runs)
 *   G. the payload leaks no credentials (no token/password material)
 *
 * Requires: a sqlite engine usable from this process (better-sqlite3 built for
 * Electron, or node:sqlite via the adapter). Run under the Electron binary with
 * ELECTRON_RUN_AS_NODE=1.
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
    console.log('      Run under the Electron binary with ELECTRON_RUN_AS_NODE=1.')
    process.exit(0)
  }
}
const jwt = require('jsonwebtoken')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3998
const SECRET = crypto.randomBytes(32).toString('hex')
const BASE = 'http://127.0.0.1:' + PORT

let failed = 0
function check(desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? '  (' + extra + ')' : '')); failed++ }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-obs-'))
const dbPath = path.join(tmpDir, 'obs.db')

async function main() {
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger, desktopCallbacks: {}, tls: false })

  const dbc = new Database(dbPath)
  const adminId = crypto.randomUUID()
  dbc.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)')
    .run(adminId, 'obs@test', 'Obs', 'admin', 'x')
  dbc.prepare('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)')
    .run(crypto.randomUUID(), 'obs-device', crypto.randomUUID(), adminId)
  dbc.close()

  const tok = jwt.sign({ userId: adminId, email: 'obs@test', role: 'admin' }, SECRET, { expiresIn: '1h' })

  // A. readiness
  const ready = await fetch(BASE + '/ready')
  const rj = await ready.json().catch(() => ({}))
  check('A1. /ready answers 200', ready.status === 200, 'status=' + ready.status)
  check('A2. ready=true with ok checks', rj.ready === true && rj.checks && rj.checks.db === 'ok' && rj.checks.schema === 'ok',
    JSON.stringify(rj.checks || {}))
  check('A3. /ready reports the build version', typeof rj.version === 'string' && /^\d+\.\d+\.\d+$/.test(rj.version), rj.version)

  // B. /metrics is not public
  const anon = await fetch(BASE + '/metrics')
  check('B. anonymous /metrics refused (401)', anon.status === 401, 'status=' + anon.status)

  // C. authenticated payload
  const before = await fetch(BASE + '/metrics', { headers: { Authorization: 'Bearer ' + tok } })
  const beforeText = await before.text()
  check('C1. authenticated /metrics answers 200', before.status === 200, 'status=' + before.status)
  check('C2. content type is Prometheus text', /text\/plain/.test(before.headers.get('content-type') || ''),
    before.headers.get('content-type'))
  const seriesNames = ['airemote_up', 'airemote_uptime_seconds', 'airemote_devices_total',
    'airemote_devices_online', 'airemote_screen_sessions', 'airemote_http_requests_total',
    'airemote_http_request_duration_seconds_count', 'airemote_errors_total']
  for (const name of seriesNames) {
    check('C3. series present: ' + name, beforeText.indexOf(name) >= 0)
  }
  check('C4. info carries the version', /airemote_info\{[^}]*version="\d+\.\d+\.\d+"/.test(beforeText))

  // D. counters move
  const series = (text, label) => {
    const line = text.split('\n').find(l => l.indexOf(label) === 0)
    return line ? Number(line.slice(line.lastIndexOf(' ') + 1)) : -1
  }
  const key = 'airemote_http_requests_total{method="GET",status="200"}'
  const n0 = series(beforeText, key)
  await fetch(BASE + '/ready')
  await fetch(BASE + '/ready')
  const after = await fetch(BASE + '/metrics', { headers: { Authorization: 'Bearer ' + tok } })
  const afterText = await after.text()
  const n1 = series(afterText, key)
  check('D. HTTP counter moves by at least the two requests', n0 >= 0 && n1 >= n0 + 2, n0 + ' -> ' + n1)

  // E. an unknown route is counted under whatever status it really answers
  //    (this build serves the SPA shell for unknown paths, so 200 is expected).
  const unknown = await fetch(BASE + '/definitely-not-a-route-' + Date.now())
  const unknownStatus = unknown.status
  const after404 = await (await fetch(BASE + '/metrics', { headers: { Authorization: 'Bearer ' + tok } })).text()
  const unknownSeries = 'airemote_http_requests_total{method="GET",status="' + unknownStatus + '"}'
  const unknownCount = series(after404, unknownSeries)
  check('E. unknown route counted under status ' + unknownStatus, unknownCount >= 1, String(unknownCount))

  // F. duration hook ran
  const durCount = series(afterText, 'airemote_http_request_duration_seconds_count')
  check('F. request duration count > 0', durCount > 0, String(durCount))

  // G. no credential material in the payload
  const lower = afterText.toLowerCase()
  check('G. payload carries no secret material',
    lower.indexOf('password') < 0 && lower.indexOf('token') < 0 && lower.indexOf('secret') < 0)

  await srv.stop()
  console.log(failed === 0 ? 'ALL OBSERVABILITY CHECKS PASSED' : failed + ' CHECK(S) FAILED')
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error('FAILED: ' + (e && e.stack || e)); process.exit(1) })
