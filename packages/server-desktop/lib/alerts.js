'use strict'
/**
 * alerts.js — tell somebody when the server keeps failing (R7).
 *
 * The gap this closes: /metrics exposes an error counter, but nobody watches a counter at
 * 3 a.m. A burst of 5xx responses now produces one notification (in the dashboard bell)
 * instead of nothing.
 *
 * Deliberately simple and bounded:
 *   - only 5xx responses count (a 401 flood is a client problem, not a server one);
 *   - a rolling window of `windowMs` with a `threshold`;
 *   - one alert per `cooldownMs`, whatever the flood size, so the bell stays readable.
 */
function createFailureAlerter(opts) {
  const db = opts.db
  const windowMs = Math.max(1000, opts.windowMs || 5 * 60 * 1000)
  const threshold = Math.max(1, opts.threshold || 10)
  const cooldownMs = Math.max(1000, opts.cooldownMs || 30 * 60 * 1000)
  const log = opts.log || { warn() {} }
  const uuid = opts.uuid || (() => require('crypto').randomUUID())
  const now = opts.now || (() => Date.now())

  let stamps = []
  let lastAlertAt = 0
  let alerts = 0

  function trim(t) {
    const cut = t - windowMs
    while (stamps.length && stamps[0] < cut) stamps.shift()
  }

  /** Records one response; returns the alert when one was raised, else null. */
  function record(statusCode) {
    const t = now()
    if (Number(statusCode) < 500) { trim(t); return null }
    stamps.push(t)
    trim(t)
    if (stamps.length < threshold) return null
    if (lastAlertAt && t - lastAlertAt < cooldownMs) return null
    lastAlertAt = t
    alerts++
    const id = uuid()
    const windowMinutes = Math.round(windowMs / 60000)
    const title = 'أخطاء متكررة في السيرفر'
    const message = `${stamps.length} استجابة خطأ (5xx) خلال ${windowMinutes} دقيقة. راجع /metrics و/ready قبل أن يتفاقم.`
    try {
      db.prepare('INSERT INTO notifications (id, user_id, device_id, type, title, message, severity) VALUES (?,?,?,?,?,?,?)')
        .run(id, null, null, 'server_errors', title, message, 'danger')
      log.warn('alerts', message)
      return { id, count: stamps.length, at: t }
    } catch (e) {
      log.warn('alerts', 'notification failed: ' + e.message)
      return { id: null, count: stamps.length, at: t, error: e.message }
    }
  }

  return {
    record,
    state: () => ({
      windowSeconds: Math.round(windowMs / 1000),
      threshold,
      cooldownSeconds: Math.round(cooldownMs / 1000),
      recent: (trim(now()), stamps.length),
      lastAlertAt: lastAlertAt ? new Date(lastAlertAt).toISOString() : null,
      alerts,
    }),
  }
}

module.exports = { createFailureAlerter }
