'use strict'
/**
 * task-schedule.js — scheduling rules for scheduled tasks.
 *
 * Extracted verbatim from server.js (2026-11-11) so the rules can be unit-tested:
 * the file's only callers were taskNextDue itself and the /api/tasks listing.
 */

/** SQLite stamps arrive as "YYYY-MM-DD HH:MM:SS" in UTC; ISO strings pass through. */
function sqlDateMs(v) {
  if (!v) return 0
  const s = String(v)
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z'
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) ? ms : 0
}

/**
 * When should this task run next? `now` is a Date (or ms value).
 * - daily_at ("HH:MM", local time of the server) wins over an interval;
 * - otherwise interval_min counts from the last run, else from creation;
 * - a task with neither is manual and never becomes due.
 */
function taskNextDue(t, now) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now)
  if (t.daily_at && /^\d{1,2}:\d{2}$/.test(String(t.daily_at))) {
    const parts = String(t.daily_at).split(':')
    const today = new Date(nowMs)
    today.setHours(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, 0, 0)
    const slot = today.getTime()
    const last = sqlDateMs(t.last_run_at)
    // 2026-11-11 — the old rule returned *tomorrow* whenever now was before today slot, so a
    // daily task created in the morning was deferred for ever and never fired.
    if (nowMs < slot) return slot
    if (!last || last < slot) return slot
    return slot + 86400000
  }
  if (Number(t.interval_min) > 0) {
    const base = sqlDateMs(t.last_run_at) || sqlDateMs(t.created_at) || nowMs
    return base + Number(t.interval_min) * 60000
  }
  return null
}

module.exports = { sqlDateMs, taskNextDue }
