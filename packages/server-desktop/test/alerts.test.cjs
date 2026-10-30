/**
 * Unit test — failure alerting (v3.8.33).
 *
 * A counter nobody watches is not monitoring. The contract:
 *   A. client errors (4xx) never raise a burst alert
 *   B. fewer than `threshold` failures in the window stay silent
 *   C. reaching it raises exactly one notification
 *   D. a flood during the cooldown raises nothing new
 *   E. after the cooldown, a fresh burst raises again
 *   F. failures older than the window do not count towards the next burst
 *   G. the alert row actually lands in the notifications table
 *
 * Requires a usable sqlite engine in this process; run under the Electron binary with
 * ELECTRON_RUN_AS_NODE=1.
 */
'use strict'

const path = require('path')

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

const { createFailureAlerter } = require(path.resolve(__dirname, '..', 'lib', 'alerts'))

let failed = 0
function check(desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? '  (' + extra + ')' : '')); failed++ }
}

const db = new Database(':memory:')
db.exec(`CREATE TABLE notifications (
  id TEXT PRIMARY KEY, user_id TEXT, device_id TEXT, type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'info', read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`)

let clock = Date.parse('2026-10-30T10:00:00Z')
const alerter = createFailureAlerter({
  db,
  windowMs: 5 * 60 * 1000,
  threshold: 10,
  cooldownMs: 30 * 60 * 1000,
  now: () => clock,
  uuid: (() => { let n = 0; return () => 'id-' + (++n) })(),
})

const rows = () => db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE type='server_errors'").get().c

// A. client errors
for (let i = 0; i < 50; i++) alerter.record(401)
check('A. 4xx responses never raise an alert', rows() === 0 && alerter.state().recent === 0, String(rows()))

// B. below threshold
for (let i = 0; i < 9; i++) alerter.record(500)
check('B. nine failures stay silent', rows() === 0, String(rows()))

// C. threshold reached
const first = alerter.record(500)
check('C1. the tenth failure raises one alert', !!first && first.count === 10, JSON.stringify(first))
check('C2. the notification row exists', rows() === 1, String(rows()))
check('C3. it is a danger-severity row', db.prepare("SELECT severity FROM notifications WHERE type='server_errors'").get().severity === 'danger')

// D. cooldown
clock += 60 * 1000
for (let i = 0; i < 40; i++) alerter.record(500)
check('D. a flood inside the cooldown adds no alert', rows() === 1, String(rows()))

// E. after cooldown
clock += 31 * 60 * 1000
let second = null
for (let i = 0; i < 9; i++) alerter.record(500)
check('E0. one stray failure after the cooldown is still silent', rows() === 1, 'rows=' + rows())
for (let i = 0; i < 9; i++) second = alerter.record(500) || second
check('E. a fresh burst after the cooldown alerts again', !!second && rows() === 2, 'rows=' + rows())

// F. window expiry
clock += 10 * 60 * 1000            // everything older than 5 minutes is gone
const calm = alerter.record(500)
check('F1. old failures do not count after the window', calm === null && alerter.state().recent === 1, JSON.stringify(alerter.state()))
clock += 31 * 60 * 1000            // cooldown over, and that single stamp has expired too
for (let i = 0; i < 9; i++) alerter.record(500)
check('F2. nine fresh failures are still below the threshold', rows() === 2, String(rows()))
alerter.record(500)
check('F3. the tenth in the new window alerts', rows() === 3, String(rows()))

// G. payload
const row = db.prepare("SELECT title, message FROM notifications WHERE type='server_errors' LIMIT 1").get()
check('G. the alert message names the count and the window', row.message.includes('10') && row.message.includes('5'), row.message.slice(0, 80))

console.log(failed === 0 ? 'ALL ALERT CHECKS PASSED' : failed + ' CHECK(S) FAILED')
process.exit(failed === 0 ? 0 : 1)
