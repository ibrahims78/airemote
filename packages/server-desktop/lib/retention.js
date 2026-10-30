'use strict'
/**
 * retention.js — bounded storage for recordings and the audit log (R7).
 *
 * Two rules shape this file:
 *   1. nothing is deleted before the owner has been told about it (a notification lands
 *      `notifyBeforeDays` before the cutoff), and
 *   2. a dry run must be able to answer "what would go" without touching a row or a file.
 *
 * The policy is deliberately conservative: recordings 30 days, audit 180 days, notice 3
 * days before. Both windows are configurable, and `enabled:false` turns the whole thing off.
 */
const fs = require('fs')
const path = require('path')

function isoCutoff(days, now) {
  return new Date((now || Date.now()) - days * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
}

function createRetention(opts) {
  const db = opts.db
  const log = opts.log || { info() {}, warn() {} }
  const enabled = opts.enabled !== false
  const recordingsDays = Math.max(1, parseInt(opts.recordingsDays || 30, 10))
  const auditDays = Math.max(7, parseInt(opts.auditDays || 180, 10))
  const notifyBeforeDays = Math.max(0, parseInt(opts.notifyBeforeDays || 3, 10))
  const state = { lastRunAt: null, lastDeleted: 0, lastSummary: null, failures: 0 }

  const policy = () => ({
    enabled, recordingsDays, auditDays, notifyBeforeDays,
  })

  /** Read-only: what is expiring, what is about to expire, what is on disk. */
  function preview(now) {
    const recCut = isoCutoff(recordingsDays, now)
    const recSoon = isoCutoff(recordingsDays - notifyBeforeDays, now)
    const audCut = isoCutoff(auditDays, now)
    const expired = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(size_mb),0) AS mb FROM recordings WHERE started_at < ?').get(recCut)
    const soon = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(size_mb),0) AS mb FROM recordings WHERE started_at >= ? AND started_at < ?').get(recCut, recSoon)
    const audit = db.prepare('SELECT COUNT(*) AS c FROM audit_log WHERE created_at < ?').get(audCut)
    const total = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(size_mb),0) AS mb FROM recordings').get()
    return {
      cutoffs: { recordings: recCut, soon: recSoon, audit: audCut },
      recordings: { expired: expired.c, expiredMb: Math.round((expired.mb || 0) * 10) / 10, soon: soon.c, soonMb: Math.round((soon.mb || 0) * 10) / 10, total: total.c, totalMb: Math.round((total.mb || 0) * 10) / 10 },
      audit: { expired: audit.c },
    }
  }

  function notifySoon(count, mb, now) {
    if (!count) return null
    // one notice per day is enough; the query is cheap and keeps the bell readable
    const since = new Date((now || Date.now()) - 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
    const recent = db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE type='retention' AND created_at >= ?").get(since).c
    if (recent > 0) return null
    const id = opts.uuid ? opts.uuid() : require('crypto').randomUUID()
    const title = 'تسجيلات على وشك الحذف'
    const message = `سيُحذف ${count} تسجيلاً (${Math.round((mb || 0) * 10) / 10} MB) بعد ${notifyBeforeDays} يوم حسب سياسة الاحتفاظ (${recordingsDays} يوماً).`
    try {
      db.prepare('INSERT INTO notifications (id, user_id, device_id, type, title, message, severity) VALUES (?,?,?,?,?,?,?)')
        .run(id, null, null, 'retention', title, message, 'warning')
      return { id, count }
    } catch (e) { log.warn('retention', 'notification failed: ' + e.message); return null }
  }

  /**
   * Deletes expired rows and their files. Files are removed best-effort: a missing file is
   * not a failure (the row still goes), because keeping an orphan row helps nobody.
   */
  function run(opts2) {
    const o = opts2 || {}
    if (!enabled) return { ok: true, skipped: 'disabled', policy: policy() }
    const p = preview(o.now)
    if (o.dryRun) return { ok: true, dryRun: true, policy: policy(), preview: p }

    let notice = null
    let deletedRecordings = 0
    let deletedBytes = 0
    let missingFiles = 0
    let deletedAudit = 0
    try {
      notice = notifySoon(p.recordings.soon, p.recordings.soonMb, o.now)
      const rows = db.prepare('SELECT id, file_path, size_mb FROM recordings WHERE started_at < ?').all(p.cutoffs.recordings)
      for (const r of rows) {
        if (r.file_path) {
          const f = path.isAbsolute(r.file_path) ? r.file_path : path.join(o.dataDir || '.', r.file_path)
          try { fs.unlinkSync(f) } catch (e) { if (e.code === 'ENOENT') missingFiles++ }
        }
        db.prepare('DELETE FROM recordings WHERE id=?').run(r.id)
        deletedRecordings++
        deletedBytes += Number(r.size_mb) || 0
      }
      const aud = db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(p.cutoffs.audit)
      deletedAudit = Number(aud.changes) || 0
      state.lastRunAt = Date.now()
      state.lastDeleted = deletedRecordings
      state.lastSummary = { deletedRecordings, deletedAudit, missingFiles, notice: !!notice }
      log.info('retention', 'removed ' + deletedRecordings + ' recordings (' + (Math.round(deletedBytes * 10) / 10) + ' MB) and ' + deletedAudit + ' audit rows' + (notice ? ', notice sent' : ''))
      return { ok: true, policy: policy(), preview: p, deleted: { recordings: deletedRecordings, mb: Math.round(deletedBytes * 10) / 10, audit: deletedAudit, missingFiles }, notice }
    } catch (e) {
      state.failures++
      log.warn('retention', 'failed: ' + e.message)
      return { ok: false, error: e.message, preview: p }
    }
  }

  let timer = null
  function start() {
    if (!enabled) return
    const tick = () => { try { run({ dataDir: opts.dataDir }) } catch (e) { log.warn('retention', 'tick: ' + e.message) } }
    timer = setInterval(tick, 6 * 3600 * 1000)
    if (timer.unref) timer.unref()
    const boot = setTimeout(tick, 10 * 60 * 1000)
    if (boot.unref) boot.unref()
  }
  function stop() { if (timer) clearInterval(timer); timer = null }

  return {
    policy, preview, run, start, stop,
    state: () => ({
      policy: policy(),
      lastRunAt: state.lastRunAt ? new Date(state.lastRunAt).toISOString() : null,
      lastDeleted: state.lastDeleted,
      lastSummary: state.lastSummary,
      failures: state.failures,
    }),
  }
}

module.exports = { createRetention, isoCutoff }
