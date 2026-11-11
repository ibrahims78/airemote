'use strict'
/**
 * Unit tests for lib/task-schedule.js (debt: runTask/taskNextDue had no tests).
 * Pure functions, no database, no clock — `now` is passed in.
 */
const { sqlDateMs, taskNextDue } = require('../lib/task-schedule')

let failed = 0
function check(desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? '  (' + extra + ')' : '')); failed++ }
}

// A. sqlDateMs
check('A1. SQLite UTC stamp is parsed as UTC', sqlDateMs('2026-11-11 08:00:00') === Date.parse('2026-11-11T08:00:00Z'))
check('A2. ISO string passes through', sqlDateMs('2026-11-11T08:00:00Z') === Date.parse('2026-11-11T08:00:00Z'))
check('A3. empty and garbage are zero', sqlDateMs('') === 0 && sqlDateMs('not-a-date') === 0)
check('A4. null is zero', sqlDateMs(null) === 0 && sqlDateMs(undefined) === 0)

// B. interval tasks
const now = new Date('2026-11-11T12:00:00Z')
check('B1. no schedule means never due', taskNextDue({ interval_min: 0, daily_at: null }, now) === null)
check(
  'B2. interval counts from the last run',
  taskNextDue({ interval_min: 30, last_run_at: '2026-11-11 11:00:00', created_at: '2026-11-11 09:00:00' }, now) === Date.parse('2026-11-11T11:30:00Z')
)
check(
  'B3. without a last run it counts from creation',
  taskNextDue({ interval_min: 30, last_run_at: null, created_at: '2026-11-11 11:45:00' }, now) === Date.parse('2026-11-11T12:15:00Z')
)
check(
  'B4. without either stamp it counts from now',
  taskNextDue({ interval_min: 15, last_run_at: null, created_at: null }, now) === now.getTime() + 15 * 60000
)

// C. daily tasks (server-local time; the test builds the expectation the same way)
function localToday(hhmm, base) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}
check(
  'C1. before today time and never run: today',
  taskNextDue({ daily_at: '23:59', interval_min: 0, last_run_at: null }, now) === localToday('23:59', now)
)
check(
  'C2. a missed slot today is due immediately',
  taskNextDue({ daily_at: '00:01', interval_min: 0, last_run_at: null }, new Date('2026-11-11T23:00:00')) === localToday('00:01', new Date('2026-11-11T23:00:00'))
)
check(
  'C3. already ran today: tomorrow',
  taskNextDue({ daily_at: '09:00', interval_min: 0, last_run_at: new Date(localToday('09:00', now) + 60000).toISOString() }, now) === localToday('09:00', now) + 86400000
)
check('C4. one-digit hour is accepted', taskNextDue({ daily_at: '9:05', interval_min: 0, last_run_at: null }, now) !== null)
check('C5. malformed daily falls back to the interval', taskNextDue({ daily_at: '25', interval_min: 10, last_run_at: null, created_at: '2026-11-11 11:55:00' }, now) === Date.parse('2026-11-11T12:05:00Z'))

if (failed) { console.error('\n' + failed + ' check(s) FAILED'); process.exit(1) }
console.log('\nall task-schedule checks passed')
