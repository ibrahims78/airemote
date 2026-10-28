'use strict'
/**
 * R5 — File transfer engine (server side).
 *
 * Design goals
 *  - Chunked, resumable transfers (1 MiB default) driven over the existing agent
 *    WebSocket; no inbound port on the device.
 *  - Durable checkpoint: `file_transfers.next_offset` survives client pause,
 *    agent disconnect and server restart.
 *  - Integrity: the AGENT hashes the finished file with SHA-256 and refuses to
 *    publish a mismatch; the destination only appears after the hash matches
 *    (atomic publish from `<name>.airemote-part`).
 *  - Path safety: `..`, UNC, reserved device names and (agent side) symlinks are
 *    rejected before a single byte is written.
 *  - Conflict policy: skip | rename | replace (default rename).
 *
 * The module owns the DB table and the agent RPC, but no HTTP routes: server.js
 * mounts them so auth/permissions stay in one place.
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const DEFAULT_CHUNK = 1024 * 1024
const CONFLICT_POLICIES = new Set(['skip', 'rename', 'replace'])
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

class TransferError extends Error {
  constructor (code, message, extra) {
    super(message || code)
    this.code = code
    if (extra) Object.assign(this, extra)
  }
}

function ftErr (code, message, extra) { return new TransferError(code, message, extra) }

/** Normalise an OS path to the lower-case web form used for comparisons. */
function normForCompare (p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * Validate a device-side path before any RPC.
 * @param {string} input web path (`/C:/dir/file`) or OS path (`C:\dir\file`)
 * @param {string[]} roots allowed roots (OS or web form); empty = all drives
 * @returns {string} normalised web path (`/C:/dir/file`)
 */
function assertSafeWebPath (input, roots) {
  if (typeof input !== 'string' || !input.trim()) throw ftErr('invalid_path', 'المسار مطلوب')
  if (input.length > 4096) throw ftErr('invalid_path', 'المسار أطول من 4096 حرفاً')
  if (/[\u0000-\u001f]/.test(input)) throw ftErr('invalid_path', 'المسار يحوي محارف تحكم')

  let p = input.trim().replace(/\\/g, '/')
  if (p.startsWith('//')) throw ftErr('unc_rejected', 'مسارات UNC غير مسموحة')

  // Accept `C:/x` as `/C:/x`
  if (/^[A-Za-z]:\//.test(p)) p = '/' + p
  if (!p.startsWith('/')) throw ftErr('invalid_path', 'المسار يجب أن يكون مطلقاً')

  const segs = p.split('/').filter(s => s !== '' && s !== '.')
  for (const s of segs) {
    if (s === '..') throw ftErr('path_traversal', 'المسار يحوي .. وهو مرفوض')
    if (RESERVED_NAMES.test(s)) throw ftErr('reserved_name', 'اسم محجوز في Windows: ' + s)
  }
  const web = '/' + segs.join('/')
  if (web === '/') throw ftErr('invalid_path', 'لا يمكن النقل إلى جذر قرص')

  if (roots && roots.length) {
    const target = normForCompare(web.replace(/^\//, ''))
    const inside = roots.some(r => {
      const root = normForCompare(r).replace(/^\/+/, '')
      return target === root || target.startsWith(root + '/')
    })
    if (!inside) throw ftErr('outside_root', 'المسار خارج الجذر المسموح')
  }
  return web
}

function webToOs (web) {
  const s = String(web || '').replace(/^\//, '')
  return process.platform === 'win32' ? s.replace(/\//g, '\\') : '/' + s
}

function sha256Buf (buf) { return crypto.createHash('sha256').update(buf).digest('hex') }

function parseRoots (raw) {
  return String(raw || '').split(',').map(s => s.trim()).filter(Boolean)
}

function createFileTransferManager (opts) {
  const { db, log, getSocket, sendJson, notify, audit } = opts
  const roots = parseRoots(opts.roots !== undefined ? opts.roots : process.env.AIREMOTE_FT_ROOTS)
  const chunkSize = Math.max(64 * 1024, Math.min(8 * 1024 * 1024, opts.chunkSize || DEFAULT_CHUNK))
  const rpcTimeout = opts.rpcTimeoutMs || 30000
  const pending = new Map()   // transferId → { type, resolve, reject, timer }
  const lastProgress = new Map()
  const say = (level, msg) => { try { (log && log[level] ? log[level] : console.log)(msg) } catch {} }

  function emit (row, extra) {
    if (!notify) return
    const now = Date.now()
    const last = lastProgress.get(row.id) || 0
    const done = row.state === 'completed' || row.state === 'failed' || row.state === 'cancelled' || row.state === 'skipped'
    if (!done && now - last < 250) return
    lastProgress.set(row.id, now)
    const pct = row.size > 0 ? Math.min(100, Math.round((row.bytes_done / row.size) * 1000) / 10) : null
    try {
      notify(row.user_id, {
        type: 'ft:progress',
        payload: {
          id: row.id, batchId: row.batch_id, deviceId: row.device_id, direction: row.direction,
          state: row.state, size: row.size, bytesDone: row.bytes_done, percent: pct,
          finalPath: row.final_path, error: row.error || null, errorCode: row.error_code || null
        }
      })
    } catch {}
  }

  function init () {
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_transfers (
        id               TEXT PRIMARY KEY,
        batch_id         TEXT,
        user_id          TEXT NOT NULL,
        device_id        TEXT NOT NULL,
        direction        TEXT NOT NULL,
        source_path      TEXT,
        dest_path        TEXT NOT NULL,
        final_path       TEXT,
        size             INTEGER NOT NULL DEFAULT 0,
        bytes_done       INTEGER NOT NULL DEFAULT 0,
        next_offset      INTEGER NOT NULL DEFAULT 0,
        chunk_size       INTEGER NOT NULL DEFAULT ${chunkSize},
        expected_sha256  TEXT,
        actual_sha256    TEXT,
        state            TEXT NOT NULL DEFAULT 'queued',
        conflict         TEXT NOT NULL DEFAULT 'rename',
        error_code       TEXT,
        error            TEXT,
        speed_limit_kbps INTEGER NOT NULL DEFAULT 0,
        attempts         INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_ft_user   ON file_transfers(user_id);
      CREATE INDEX IF NOT EXISTS idx_ft_device ON file_transfers(device_id);
      CREATE INDEX IF NOT EXISTS idx_ft_state  ON file_transfers(state);
      CREATE INDEX IF NOT EXISTS idx_ft_batch  ON file_transfers(batch_id);
    `)
    // A transfer that was running when the server died keeps its checkpoint and
    // becomes resumable instead of silently "disappearing".
    try {
      const n = db.prepare("UPDATE file_transfers SET state='paused', error_code='server_restart', error='توقّف السيرفر — يمكن الاستكمال', updated_at=datetime('now') WHERE state IN ('running','opening')").run().changes
      if (n) say('warn', `[ft] ${n} transfer(s) marked paused after restart`)
    } catch (e) { say('warn', '[ft] restart sweep failed: ' + e.message) }
    return true
  }

  const getRow = (id) => db.prepare('SELECT * FROM file_transfers WHERE id=?').get(id)

  function canControl (user, row) {
    if (!user || !row) return false
    return row.user_id === user.userId || user.role === 'admin'
  }

  function publicRow (r) {
    if (!r) return null
    return {
      id: r.id, batchId: r.batch_id, deviceId: r.device_id, direction: r.direction,
      sourcePath: r.source_path, destPath: r.dest_path, finalPath: r.final_path,
      size: r.size, bytesDone: r.bytes_done, nextOffset: r.next_offset, chunkSize: r.chunk_size,
      sha256: r.expected_sha256, actualSha256: r.actual_sha256,
      state: r.state, conflict: r.conflict, error: r.error, errorCode: r.error_code,
      speedLimitKbps: r.speed_limit_kbps, attempts: r.attempts,
      percent: r.size > 0 ? Math.min(100, Math.round((r.bytes_done / r.size) * 1000) / 10) : null,
      createdAt: r.created_at, updatedAt: r.updated_at
    }
  }

  function requireOnline (deviceId) {
    const rec = getSocket(deviceId)
    if (!rec || !rec.ws) throw ftErr('device_offline', 'الجهاز غير متصل')
    return rec
  }

  function rpc (transferId, rec, message, expectType, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (pending.has(transferId)) { reject(ftErr('busy', 'عملية أخرى جارية على هذا النقل')); return }
      const timer = setTimeout(() => {
        pending.delete(transferId)
        reject(ftErr('timeout', 'انتهت مهلة الوكيل'))
      }, timeoutMs || rpcTimeout)
      pending.set(transferId, { type: expectType, resolve, reject, timer })
      try { sendJson(rec.ws, message) } catch (e) {
        clearTimeout(timer); pending.delete(transferId); reject(e)
      }
    })
  }

  function settle (transferId, type, payload) {
    const w = pending.get(transferId)
    if (!w) return false
    // Errors arrive as `agent:ft_error` whatever operation was in flight.
    if (type !== 'agent:ft_error' && w.type && type !== w.type) return false
    clearTimeout(w.timer)
    pending.delete(transferId)
    if (payload && payload.ok === false) w.reject(ftErr(payload.code || 'agent_error', payload.error || 'فشل الوكيل', { payload }))
    else w.resolve(payload || {})
    return true
  }

  function rejectAllForDevice (deviceId) {
    for (const [id, w] of pending) {
      const row = getRow(id)
      if (row && row.device_id === deviceId) {
        clearTimeout(w.timer); pending.delete(id)
        w.reject(ftErr('device_offline', 'انقطع اتصال الجهاز'))
      }
    }
  }

  function setState (id, state, patch) {
    const sets = ["state=?", "updated_at=datetime('now')"]
    const vals = [state]
    for (const [k, v] of Object.entries(patch || {})) { sets.push(k + '=?'); vals.push(v) }
    db.prepare(`UPDATE file_transfers SET ${sets.join(', ')} WHERE id=?`).run(...vals, id)
    return getRow(id)
  }

  function createTransfer (args) {
    const {
      user, deviceId, direction, path: devicePath, size, sha256,
      conflict, speedLimitKbps, name, batchId
    } = args
    if (direction !== 'upload' && direction !== 'download') throw ftErr('invalid_direction', 'اتجاه غير معروف')
    if (!CONFLICT_POLICIES.has(conflict || 'rename')) throw ftErr('invalid_conflict', 'سياسة تعارض غير معروفة')
    let web
    try {
      web = assertSafeWebPath(devicePath, roots)
    } catch (e) {
      try { audit && audit('file_transfer_denied', deviceId, { path: devicePath, code: e.code }) } catch {}
      throw e
    }
    if (size != null && (!Number.isFinite(Number(size)) || Number(size) < 0)) throw ftErr('invalid_size', 'حجم غير صالح')
    const id = crypto.randomUUID()
    const sourcePath = direction === 'download' ? web : (name || null)
    const destPath = direction === 'upload' ? web : (name || web.split('/').pop())
    db.prepare(`INSERT INTO file_transfers
      (id, batch_id, user_id, device_id, direction, source_path, dest_path, size, expected_sha256, conflict, speed_limit_kbps, chunk_size, state)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'queued')`)
      .run(id, batchId || null, user.userId, deviceId, direction, sourcePath, destPath,
        Math.max(0, Number(size) || 0), sha256 ? String(sha256).toLowerCase() : null,
        conflict || 'rename', Math.max(0, Number(speedLimitKbps) || 0), chunkSize)
    const row = getRow(id)
    try { audit && audit('file_transfer_created', deviceId, { id, direction, path: destPath, size: row.size, conflict: row.conflict }) } catch {}
    emit(row)
    return row
  }

  async function openOnAgent (row) {
    const rec = requireOnline(row.device_id)
    const payload = {
      transferId: row.id,
      direction: row.direction === 'upload' ? 'write' : 'read',
      path: row.direction === 'upload' ? row.dest_path : row.source_path,
      conflict: row.conflict,
      size: row.size || null,
      resumeFrom: row.next_offset || 0,
      finalPath: row.final_path || null,
      chunkSize: row.chunk_size
    }
    const res = await rpc(row.id, rec, { type: 'server:ft_open', payload }, 'agent:ft_opened', 60000)
    if (res.skipped) {
      const done = setState(row.id, 'skipped', { error_code: 'exists', error: 'الملف موجود — سياسة التخطّي' })
      emit(done)
      return done
    }
    const offset = Math.max(0, Number(res.offset) || 0)
    const size = Number(res.size) || row.size || 0
    const patch = { size, next_offset: offset, bytes_done: offset, attempts: (row.attempts || 0) + 1 }
    if (res.path) patch.final_path = res.path
    return setState(row.id, 'running', patch)
  }

  async function start (id, user) {
    const row = getRow(id)
    if (!row) throw ftErr('not_found', 'النقل غير موجود', { status: 404 })
    if (!canControl(user, row)) throw ftErr('forbidden', 'النقل يخص مستخدماً آخر', { status: 403 })
    if (row.state === 'completed' || row.state === 'cancelled') throw ftErr('invalid_state', 'النقل منتهٍ')
    if (row.state === 'running') return row
    try {
      const opened = await openOnAgent(row)
      emit(opened)
      return opened
    } catch (e) {
      const failed = setState(row.id, 'failed', { error_code: e.code || 'agent_error', error: e.message })
      try { audit && audit('file_transfer_failed', row.device_id, { id, code: e.code, error: e.message }) } catch {}
      emit(failed)
      throw e
    }
  }

  async function writeChunk (id, user, offset, buf) {
    const row = getRow(id)
    if (!row) throw ftErr('not_found', 'النقل غير موجود', { status: 404 })
    if (!canControl(user, row)) throw ftErr('forbidden', 'النقل يخص مستخدماً آخر', { status: 403 })
    if (row.direction !== 'upload') throw ftErr('invalid_direction', 'هذا النقل ليس رفعاً')
    if (row.state !== 'running') throw ftErr('invalid_state', 'النقل ليس جارياً (' + row.state + ')')
    if (!Buffer.isBuffer(buf) || !buf.length) throw ftErr('empty_chunk', 'مقطع فارغ')
    if (buf.length > row.chunk_size) throw ftErr('chunk_too_large', 'المقطع أكبر من الحجم المسموح')
    const off = Number(offset)
    if (!Number.isFinite(off) || off !== row.next_offset) {
      throw ftErr('offset_mismatch', `الإزاحة غير متوقعة: متوقع ${row.next_offset}`, { expected: row.next_offset })
    }
    const rec = requireOnline(row.device_id)
    let res
    try {
      res = await rpc(row.id, rec, {
        type: 'server:ft_write',
        payload: { transferId: row.id, offset: off, data: buf.toString('base64'), length: buf.length }
      }, 'agent:ft_ack', 60000)
    } catch (e) {
      const failed = setState(row.id, 'failed', { error_code: e.code || 'write_failed', error: e.message })
      try { audit && audit('file_transfer_failed', row.device_id, { id: row.id, code: e.code, error: e.message }) } catch {}
      emit(failed)
      throw e
    }
    const written = Number(res.written) || buf.length
    const next = off + written
    const updated = setState(row.id, 'running', {
      bytes_done: next,
      next_offset: next,
      size: row.size || next
    })
    emit(updated)
    // Optional per-transfer pacing: keep the observed rate near the cap.
    const kbps = row.speed_limit_kbps
    if (kbps > 0) {
      const targetMs = Math.ceil((written / (kbps * 1024)) * 1000)
      const spent = Date.now() - (row.updated_at ? Date.parse(row.updated_at + 'Z') : Date.now())
      const wait = targetMs - (Number.isFinite(spent) ? spent : 0)
      if (wait > 0) await new Promise(r => setTimeout(r, Math.min(wait, 1000)))
    }
    return updated
  }

  async function finish (id, user, sha256) {
    const row = getRow(id)
    if (!row) throw ftErr('not_found', 'النقل غير موجود', { status: 404 })
    if (!canControl(user, row)) throw ftErr('forbidden', 'النقل يخص مستخدماً آخر', { status: 403 })
    if (row.state === 'completed') return row
    if (row.state !== 'running') throw ftErr('invalid_state', 'النقل ليس جارياً (' + row.state + ')')
    const rec = requireOnline(row.device_id)
    let res
    try {
      res = await rpc(row.id, rec, {
        type: 'server:ft_finish',
        payload: { transferId: row.id, expectSha256: sha256 || row.expected_sha256 || null, size: row.size || row.bytes_done }
      }, 'agent:ft_done', 300000)
    } catch (e) {
      const failed = setState(row.id, 'failed', { error_code: e.code || 'hash_mismatch', error: e.message })
      try { audit && audit('file_transfer_failed', row.device_id, { id, code: e.code, error: e.message }) } catch {}
      emit(failed)
      throw e
    }
    const actual = res.sha256 ? String(res.sha256).toLowerCase() : null
    const expected = (sha256 || row.expected_sha256 || '').toLowerCase() || null
    if (expected && actual && expected !== actual) {
      const failed = setState(row.id, 'failed', { error_code: 'hash_mismatch', error: 'بصمة SHA-256 لا تطابق المصدر', actual_sha256: actual })
      emit(failed)
      throw ftErr('hash_mismatch', 'بصمة SHA-256 لا تطابق المصدر', { actual })
    }
    const done = setState(row.id, 'completed', {
      bytes_done: res.size != null ? Number(res.size) : row.bytes_done,
      next_offset: res.size != null ? Number(res.size) : row.bytes_done,
      size: res.size != null ? Number(res.size) : row.size,
      actual_sha256: actual,
      final_path: res.path || row.final_path,
      error: null, error_code: null
    })
    try { audit && audit('file_transfer_completed', row.device_id, { id, size: done.size, sha256: actual }) } catch {}
    emit(done)
    return done
  }

  async function readChunk (id, user, offset, length) {
    const row = getRow(id)
    if (!row) throw ftErr('not_found', 'النقل غير موجود', { status: 404 })
    if (!canControl(user, row)) throw ftErr('forbidden', 'النقل يخص مستخدماً آخر', { status: 403 })
    if (row.direction !== 'download') throw ftErr('invalid_direction', 'هذا النقل ليس تنزيلاً')
    if (row.state === 'queued') await start(id, user)
    const cur = getRow(id)
    if (cur.state !== 'running' && cur.state !== 'completed') throw ftErr('invalid_state', 'النقل ليس جارياً (' + cur.state + ')')
    const off = Number(offset)
    if (!Number.isFinite(off) || off < 0) throw ftErr('invalid_offset', 'إزاحة غير صالحة')
    if (off < cur.next_offset) {
      // Re-reading an earlier range is allowed (HTTP Range retry) but must not
      // move the durable checkpoint backwards.
    }
    const rec = requireOnline(cur.device_id)
    const len = Math.max(1, Math.min(Number(length) || cur.chunk_size, cur.chunk_size))
    const res = await rpc(cur.id, rec, {
      type: 'server:ft_read',
      payload: { transferId: cur.id, offset: off, length: len }
    }, 'agent:ft_data', 60000)
    const data = Buffer.from(String(res.data || ''), 'base64')
    const next = off + data.length
    if (next > cur.next_offset) {
      const updated = setState(cur.id, 'running', {
        bytes_done: next, next_offset: next, size: Math.max(cur.size, Number(res.size) || 0)
      })
      emit(updated)
    }
    const size = Number(res.size) || cur.size
    return { data, size, eof: res.eof === true || (size > 0 && next >= size) }
  }

  async function pause (id, user, reason) {
    const row = getRow(id)
    if (!row) throw ftErr('not_found', 'النقل غير موجود', { status: 404 })
    if (!canControl(user, row)) throw ftErr('forbidden', 'النقل يخص مستخدماً آخر', { status: 403 })
    if (row.state !== 'running' && row.state !== 'opening' && row.state !== 'queued') {
      throw ftErr('invalid_state', 'لا يمكن الإيقاف من الحالة ' + row.state)
    }
    const rec = getSocket(row.device_id)
    if (rec && rec.ws) {
      try { await rpc(row.id, rec, { type: 'server:ft_abort', payload: { transferId: row.id, close: true } }, 'agent:ft_closed', 8000) } catch {}
    }
    const paused = setState(row.id, 'paused', { error: reason || null, error_code: reason || null })
    emit(paused)
    return paused
  }

  async function resume (id, user) {
    const row = getRow(id)
    if (!row) throw ftErr('not_found', 'النقل غير موجود', { status: 404 })
    if (!canControl(user, row)) throw ftErr('forbidden', 'النقل يخص مستخدماً آخر', { status: 403 })
    if (row.state !== 'paused' && row.state !== 'failed') throw ftErr('invalid_state', 'لا يمكن الاستكمال من الحالة ' + row.state)
    const queued = setState(row.id, 'queued', { error: null, error_code: null })
    try {
      const opened = await openOnAgent(queued)
      emit(opened)
      return opened
    } catch (e) {
      const failed = setState(row.id, 'failed', { error_code: e.code || 'resume_failed', error: e.message })
      emit(failed)
      throw e
    }
  }

  async function cancel (id, user, reason) {
    const row = getRow(id)
    if (!row) throw ftErr('not_found', 'النقل غير موجود', { status: 404 })
    if (!canControl(user, row)) throw ftErr('forbidden', 'النقل يخص مستخدماً آخر', { status: 403 })
    if (row.state === 'completed') throw ftErr('invalid_state', 'النقل مكتمل')
    const rec = getSocket(row.device_id)
    if (rec && rec.ws) {
      try { await rpc(row.id, rec, { type: 'server:ft_abort', payload: { transferId: row.id, discard: true, close: true } }, 'agent:ft_closed', 8000) } catch {}
    }
    const cancelled = setState(row.id, 'cancelled', { error: reason || 'أُلغي بواسطة المستخدم', error_code: 'cancelled' })
    try { audit && audit('file_transfer_cancelled', row.device_id, { id }) } catch {}
    emit(cancelled)
    return cancelled
  }

  function list (user, filter) {
    const where = []
    const vals = []
    if (!user || user.role !== 'admin') { where.push('user_id=?'); vals.push(user.userId) }
    if (filter && filter.deviceId) { where.push('device_id=?'); vals.push(filter.deviceId) }
    if (filter && filter.batchId) { where.push('batch_id=?'); vals.push(filter.batchId) }
    if (filter && filter.state) { where.push('state=?'); vals.push(filter.state) }
    const limit = Math.max(1, Math.min(500, Number(filter && filter.limit) || 100))
    const sql = 'SELECT * FROM file_transfers' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY created_at DESC LIMIT ?'
    return db.prepare(sql).all(...vals, limit).map(publicRow)
  }

  function get (id, user) {
    const row = getRow(id)
    if (!row) throw ftErr('not_found', 'النقل غير موجود', { status: 404 })
    if (!canControl(user, row)) throw ftErr('forbidden', 'النقل يخص مستخدماً آخر', { status: 403 })
    return publicRow(row)
  }

  /**
   * 10k-small-files path: one manifest, one round-trip per file server-side.
   * Each file gets its own row so progress/resume stay per-file.
   */
  async function createBatch (args) {
    const { user, deviceId, destDir, files, conflict, speedLimitKbps } = args
    if (!Array.isArray(files) || !files.length) throw ftErr('empty_batch', 'لا ملفات في الدفعة')
    if (files.length > 20000) throw ftErr('batch_too_large', 'حد الدفعة 20,000 ملف')
    const dir = assertSafeWebPath(destDir, roots)
    requireOnline(deviceId)
    const batchId = crypto.randomUUID()
    const rows = []
    const insert = db.prepare(`INSERT INTO file_transfers
      (id, batch_id, user_id, device_id, direction, source_path, dest_path, size, expected_sha256, conflict, speed_limit_kbps, chunk_size, state)
      VALUES (?,?,?,?, 'upload', ?,?,?,?,?,?,?, 'queued')`)
    const tx = db.transaction(() => {
      for (const f of files) {
        const name = String(f.name || '').trim()
        if (!name || /[\\/]/.test(name) || name === '.' || name === '..') throw ftErr('invalid_name', 'اسم ملف غير صالح: ' + name)
        const buf = Buffer.from(String(f.data || ''), 'base64')
        const id = crypto.randomUUID()
        insert.run(id, batchId, user.userId, deviceId, name, dir + '/' + name, buf.length,
          f.sha256 ? String(f.sha256).toLowerCase() : null, conflict || 'rename',
          Math.max(0, Number(speedLimitKbps) || 0), chunkSize)
        rows.push({ id, name, buf })
      }
    })
    tx()
    const started = Date.now()
    const results = []
    const rec = getSocket(deviceId)
    const SMALL_MAX = 1024 * 1024
    const GROUP = 400
    const small = rows.filter(r => r.buf.length <= SMALL_MAX)
    const large = rows.filter(r => r.buf.length > SMALL_MAX)

    // Small files: one message per group — the 10k gate does ~25 round-trips
    // instead of 30,000, while each file keeps its own row and hash check.
    for (let i = 0; i < small.length; i += GROUP) {
      const group = small.slice(i, i + GROUP)
      const key = batchId + ':' + i
      let res
      try {
        res = await rpc(key, rec, {
          type: 'server:ft_put_many',
          payload: {
            transferId: key,
            files: group.map(g => ({
              id: g.id, name: g.name, path: dir + '/' + g.name,
              data: g.buf.toString('base64'), sha256: sha256Buf(g.buf), conflict: conflict || 'rename'
            }))
          }
        }, 'agent:ft_put_many_done', 300000)
      } catch (e) {
        for (const g of group) {
          const failed = setState(g.id, 'failed', { error_code: e.code || 'agent_error', error: e.message })
          emit(failed)
          results.push({ name: g.name, state: 'failed', error: e.message })
        }
        continue
      }
      const byId = new Map((res.results || []).map(r => [r.id, r]))
      for (const g of group) {
        const r = byId.get(g.id) || {}
        if (r.ok && r.skipped) {
          const row = setState(g.id, 'skipped', { error_code: 'exists', error: 'الملف موجود — سياسة التخطّي' })
          emit(row)
          results.push({ name: g.name, state: 'skipped' })
        } else if (r.ok) {
          const row = setState(g.id, 'completed', {
            bytes_done: g.buf.length, next_offset: g.buf.length, size: g.buf.length,
            actual_sha256: r.sha256 || null, final_path: r.path || null, error: null, error_code: null
          })
          emit(row)
          results.push({ name: g.name, state: 'completed', bytes: g.buf.length })
        } else {
          const row = setState(g.id, 'failed', { error_code: r.code || 'put_failed', error: r.error || 'فشل' })
          emit(row)
          results.push({ name: g.name, state: 'failed', error: r.error || 'فشل' })
        }
      }
    }

    // Files above one chunk go through the streaming path (open/write/finish).
    for (const item of large) {
      try {
        let row = getRow(item.id)
        row = await openOnAgent(row)
        if (row.state === 'skipped') { results.push({ name: item.name, state: 'skipped' }); continue }
        const off = row.next_offset || 0
        await rpc(row.id, rec, {
          type: 'server:ft_write',
          payload: { transferId: row.id, offset: off, data: item.buf.toString('base64'), length: item.buf.length }
        }, 'agent:ft_ack', 120000)
        row = setState(row.id, 'running', { bytes_done: off + item.buf.length, next_offset: off + item.buf.length, size: off + item.buf.length })
        const done = await rpc(row.id, rec, {
          type: 'server:ft_finish',
          payload: { transferId: row.id, expectSha256: sha256Buf(item.buf), size: item.buf.length }
        }, 'agent:ft_done', 120000)
        const final = setState(row.id, 'completed', {
          bytes_done: item.buf.length, next_offset: item.buf.length, size: item.buf.length,
          actual_sha256: done.sha256 || null, final_path: done.path || null, error: null, error_code: null
        })
        emit(final)
        results.push({ name: item.name, state: 'completed', bytes: item.buf.length })
      } catch (e) {
        const failed = setState(item.id, 'failed', { error_code: e.code || 'agent_error', error: e.message })
        emit(failed)
        results.push({ name: item.name, state: 'failed', error: e.message })
      }
    }

    const ok = results.filter(r => r.state === 'completed' || r.state === 'skipped').length
    try { audit && audit('file_transfer_batch', deviceId, { batchId, files: rows.length, ok }) } catch {}
    return {
      batchId, total: rows.length, completed: ok, failed: rows.length - ok,
      bytes: rows.reduce((a, r) => a + r.buf.length, 0), elapsedMs: Date.now() - started, results
    }
  }

  function handleAgentMessage (type, payload, deviceId) {
    if (!type.startsWith('agent:ft_')) return false
    const id = payload && payload.transferId
    if (!id) return true
    settle(id, type, payload)
    return true
  }

  function onDeviceOffline (deviceId) {
    rejectAllForDevice(deviceId)
    try {
      const rows = db.prepare("SELECT id FROM file_transfers WHERE device_id=? AND state='running'").all(deviceId)
      for (const r of rows) {
        const row = setState(r.id, 'paused', { error_code: 'network', error: 'انقطع اتصال الجهاز — يمكن الاستكمال' })
        emit(row)
      }
    } catch {}
  }

  return {
    init, createTransfer, start, writeChunk, finish, readChunk, pause, resume, cancel,
    list, get, createBatch, handleAgentMessage, onDeviceOffline,
    publicRow, getRow, canControl, assertSafeWebPath: (p) => assertSafeWebPath(p, roots),
    chunkSize, roots
  }
}

module.exports = {
  createFileTransferManager,
  assertSafeWebPath,
  webToOs,
  sha256Buf,
  TransferError,
  CONFLICT_POLICIES,
  DEFAULT_CHUNK
}
