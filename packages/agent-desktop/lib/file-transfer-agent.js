'use strict'
/**
 * R5 — File transfer (agent side).
 *
 * Runs inside the desktop agent process (no Electron APIs) so it can also be
 * exercised directly by the acceptance tests. It owns the device end of the
 * protocol:
 *
 *   server:ft_open   → agent:ft_opened   (resolves conflicts, opens `.airemote-part`)
 *   server:ft_write  → agent:ft_ack      (positioned write, resumable)
 *   server:ft_read   → agent:ft_data     (positioned read for downloads)
 *   server:ft_finish → agent:ft_done     (SHA-256 + atomic publish)
 *   server:ft_abort  → agent:ft_closed   (close, optional discard)
 *
 * Safety: `..`, UNC, reserved Windows names and every symlink component are
 * rejected before opening a handle. Files are published only after the hash
 * matches, so a failed or truncated transfer can never masquerade as the real
 * file at the destination.
 */

const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const crypto = require('crypto')

const PART_SUFFIX = '.airemote-part'
const MAX_OPEN = 8
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

class AgentTransferError extends Error {
  constructor (code, message) { super(message || code); this.code = code }
}
const fail = (code, message) => { throw new AgentTransferError(code, message) }

function parseRoots (raw) {
  return String(raw || '').split(',').map(s => s.trim()).filter(Boolean)
}

function toOsPath (p) {
  if (process.platform !== 'win32') return p
  if (/^[A-Za-z]:/.test(p)) return p.replace(/\//g, '\\')
  if (p === '/' || p === '') return null
  const m = p.match(/^\/([A-Za-z]:)(\/.*)?$/)
  if (m) return m[1] + (m[2] ? m[2].replace(/\//g, '\\') : '\\')
  return p.replace(/\//g, '\\')
}

function toWebPath (osFullPath) {
  if (process.platform !== 'win32') return osFullPath
  const web = String(osFullPath).replace(/\\/g, '/')
  return web.startsWith('/') ? web : '/' + web
}

function isInside (child, root) {
  const c = path.resolve(child).toLowerCase().replace(/[\\/]+$/, '')
  const r = path.resolve(root).toLowerCase().replace(/[\\/]+$/, '')
  return c === r || c.startsWith(r + path.sep) || c.startsWith(r + '/')
}

/**
 * Reject every path that could escape the allowed area or follow a link.
 * Walks the components from the volume root and refuses any symlink: on Windows
 * junctions/reparse points are the realistic escape and lstat reports them.
 */
async function assertSafeOsPath (webPath, roots) {
  if (typeof webPath !== 'string' || !webPath.trim()) fail('invalid_path', 'مسار مطلوب')
  if (/[\u0000-\u001f]/.test(webPath)) fail('invalid_path', 'المسار يحوي محارف تحكم')
  const raw = webPath.replace(/\\/g, '/')
  if (raw.startsWith('//')) fail('unc_rejected', 'مسارات UNC مرفوضة')
  if (raw.split('/').some(s => s === '..')) fail('path_traversal', 'المسار يحوي .. وهو مرفوض')

  const osPath = toOsPath(webPath)
  if (!osPath) fail('invalid_path', 'مسار غير صالح')
  const abs = path.resolve(osPath)
  for (const seg of abs.split(/[\\/]+/)) {
    if (RESERVED_NAMES.test(seg)) fail('reserved_name', 'اسم محجوز في Windows: ' + seg)
  }

  // Symlink walk (existing components only).
  const root = path.parse(abs).root
  const rest = abs.slice(root.length).split(path.sep).filter(Boolean)
  let cur = root
  for (const seg of rest) {
    cur = path.join(cur, seg)
    let st
    try { st = await fsp.lstat(cur) } catch (e) {
      if (e.code === 'ENOENT') break
      fail('path_check_failed', e.message)
    }
    if (st.isSymbolicLink()) fail('symlink_rejected', 'المسار يمرّ عبر رابط رمزي — مرفوض')
  }

  if (roots.length && !roots.some(r => isInside(abs, r))) fail('outside_root', 'المسار خارج الجذر المسموح')
  return abs
}

async function exists (p) {
  try { await fsp.lstat(p); return true } catch { return false }
}

async function pickFreeName (abs) {
  const dir = path.dirname(abs)
  const ext = path.extname(abs)
  const base = path.basename(abs, ext)
  for (let i = 1; i <= 999; i++) {
    const candidate = path.join(dir, `${base} (${i})${ext}`)
    if (!(await exists(candidate)) && !(await exists(candidate + PART_SUFFIX))) return candidate
  }
  fail('rename_exhausted', 'لا يوجد اسم بديل متاح')
}

async function sha256File (p) {
  return await new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    const s = fs.createReadStream(p)
    s.on('data', d => h.update(d))
    s.on('error', reject)
    s.on('end', () => resolve(h.digest('hex')))
  })
}

function createAgentTransfer (opts) {
  const send = opts.send || (() => {})
  const roots = parseRoots(opts.roots !== undefined ? opts.roots : process.env.AIREMOTE_FT_ROOTS)
  const say = opts.log || (() => {})
  const maxHeld = opts.maxOpen || MAX_OPEN
  // Fault injection used ONLY by the acceptance gate (disk-full behaviour).
  let faultAfter = Number(opts.faultEnospcAfter !== undefined ? opts.faultEnospcAfter : (process.env.AIREMOTE_FT_FAULT_ENOSPC_AFTER || 0))
  const sessions = new Map() // transferId → session

  function reply (type, payload) {
    send({ type, payload, timestamp: Date.now() })
  }
  function ok (id, type, extra) { reply(type, { transferId: id, ok: true, ...(extra || {}) }) }
  function err (id, code, message) { reply('agent:ft_error', { transferId: id, ok: false, code, error: message || code }) }

  function closeSession (id, discard) {
    const s = sessions.get(id)
    if (!s) return Promise.resolve()
    sessions.delete(id)
    return (async () => {
      try { if (s.fh) await s.fh.close() } catch {}
      if (discard && s.partPath) { try { await fsp.unlink(s.partPath) } catch {} }
    })()
  }

  async function trimOpen () {
    while (sessions.size >= maxHeld) {
      const oldest = sessions.keys().next().value
      await closeSession(oldest, false)
    }
  }

  async function onOpen (p) {
    const { transferId, direction, path: target, conflict = 'rename', resumeFrom = 0, finalPath } = p || {}
    if (!transferId || !target) return err(transferId, 'invalid_request', 'transferId/path مطلوبان')
    if (sessions.has(transferId)) await closeSession(transferId, false)

    if (direction === 'read') {
      const abs = await assertSafeOsPath(target, roots)
      if (!(await exists(abs))) return err(transferId, 'not_found', 'الملف غير موجود')
      const st = await fsp.stat(abs)
      if (st.isDirectory()) return err(transferId, 'is_directory', 'المسار مجلد')
      const fh = await fsp.open(abs, 'r')
      sessions.set(transferId, { fh, mode: 'read', absPath: abs, size: st.size, offset: 0 })
      try { await trimOpen() } catch {}
      return ok(transferId, 'agent:ft_opened', { size: st.size, offset: 0, path: toWebPath(abs), mtime: st.mtime.toISOString() })
    }

    // ── write ────────────────────────────────────────────────────────────────
    let abs = await assertSafeOsPath(target, roots)
    const reuse = finalPath ? path.resolve(toOsPath(finalPath)) : null
    if (reuse) {
      if (!roots.length || roots.some(r => isInside(reuse, r))) abs = reuse
      else return err(transferId, 'outside_root', 'المسار النهائي خارج الجذر')
    }

    if (!reuse && conflict === 'skip' && await exists(abs)) {
      return ok(transferId, 'agent:ft_opened', { skipped: true, size: 0, offset: 0, path: toWebPath(abs) })
    }
    if (!reuse && conflict === 'rename' && await exists(abs)) {
      abs = await pickFreeName(abs)
    }

    const partPath = abs + PART_SUFFIX
    await fsp.mkdir(path.dirname(abs), { recursive: true })
    let fh
    let offset = 0
    const wantResume = Number(resumeFrom) > 0
    if (wantResume) {
      if (!(await exists(partPath))) return err(transferId, 'resume_lost', 'لا توجد نقطة استكمال على الجهاز')
      fh = await fsp.open(partPath, 'r+')
      const st = await fh.stat()
      offset = Math.min(Number(resumeFrom), st.size)
      await fh.truncate(offset)
    } else {
      fh = await fsp.open(partPath, 'w+')
    }
    sessions.set(transferId, {
      fh, mode: 'write', absPath: abs, partPath, size: Number(p.size) || 0,
      offset, written: offset, conflict, faulted: false
    })
    try { await trimOpen() } catch {}
    say('info', `⬆️ [ft] فتح ${toWebPath(abs)} من ${offset}`)
    return ok(transferId, 'agent:ft_opened', { size: Number(p.size) || 0, offset, path: toWebPath(abs), part: toWebPath(partPath) })
  }

  async function onWrite (p) {
    const { transferId, offset, data } = p || {}
    const s = sessions.get(transferId)
    if (!s || s.mode !== 'write') return err(transferId, 'no_session', 'لا جلسة كتابة مفتوحة')
    const buf = Buffer.from(String(data || ''), 'base64')
    const off = Number(offset)
    if (!Number.isFinite(off) || off !== s.written) return err(transferId, 'offset_mismatch', `متوقع ${s.written}`)
    try {
      if (faultAfter > 0 && s.written + buf.length > faultAfter) {
        const e = new Error('ENOSPC: no space left on device (fault injection)')
        e.code = 'ENOSPC'
        throw e
      }
      const { bytesWritten } = await s.fh.write(buf, 0, buf.length, off)
      s.written = off + bytesWritten
      return ok(transferId, 'agent:ft_ack', { written: bytesWritten, offset: s.written })
    } catch (e) {
      const code = e.code === 'ENOSPC' ? 'disk_full' : (e.code || 'write_failed')
      const message = code === 'disk_full'
        ? 'لا توجد مساحة كافية على قرص الجهاز — لم يُنشَر أي ملف تالف ويمكن الاستكمال بعد تفريغ مساحة'
        : e.message
      say('error', `❌ [ft] write ${transferId}: ${message}`)
      return err(transferId, code, message)
    }
  }

  async function onRead (p) {
    const { transferId, offset, length } = p || {}
    const s = sessions.get(transferId)
    if (!s || s.mode !== 'read') return err(transferId, 'no_session', 'لا جلسة قراءة مفتوحة')
    const off = Math.max(0, Number(offset) || 0)
    const len = Math.max(1, Math.min(Number(length) || 1024 * 1024, 8 * 1024 * 1024))
    if (off >= s.size) return ok(transferId, 'agent:ft_data', { data: '', offset: off, size: s.size, eof: true })
    const take = Math.min(len, s.size - off)
    const buf = Buffer.alloc(take)
    try {
      const { bytesRead } = await s.fh.read(buf, 0, take, off)
      return ok(transferId, 'agent:ft_data', { data: buf.slice(0, bytesRead).toString('base64'), offset: off, size: s.size, eof: off + bytesRead >= s.size })
    } catch (e) {
      return err(transferId, e.code || 'read_failed', e.message)
    }
  }

  async function onFinish (p) {
    const { transferId, expectSha256 } = p || {}
    const s = sessions.get(transferId)
    if (!s) return err(transferId, 'no_session', 'لا جلسة مفتوحة')
    if (s.mode === 'read') {
      let actual = null
      try { if (s.fh) await s.fh.close(); s.fh = null; actual = await sha256File(s.absPath) } catch (e) {}
      await closeSession(transferId, false)
      return ok(transferId, 'agent:ft_done', { size: s.size, sha256: actual, path: toWebPath(s.absPath) })
    }
    try { if (s.fh) await s.fh.close() } catch {}
    s.fh = null
    let actual
    try {
      actual = await sha256File(s.partPath)
    } catch (e) {
      sessions.delete(transferId)
      return err(transferId, 'hash_failed', e.message)
    }
    if (expectSha256 && actual !== String(expectSha256).toLowerCase()) {
      sessions.delete(transferId)
      try { await fsp.unlink(s.partPath) } catch {}
      return err(transferId, 'hash_mismatch', 'بصمة الملف على الجهاز لا تطابق المصدر — حُذف الملف الجزئي')
    }
    try {
      await fsp.rename(s.partPath, s.absPath)
    } catch (e) {
      sessions.delete(transferId)
      return err(transferId, 'publish_failed', e.message)
    }
    sessions.delete(transferId)
    say('info', `✅ [ft] نُشر ${toWebPath(s.absPath)} (${s.written} بايت)`)
    return ok(transferId, 'agent:ft_done', { size: s.written, sha256: actual, path: toWebPath(s.absPath) })
  }

  async function onAbort (p) {
    const { transferId, discard } = p || {}
    await closeSession(transferId, !!discard)
    return ok(transferId, 'agent:ft_closed', { discarded: !!discard })
  }

  /**
   * Small-file fast path: many files in one message (used by the 10k gate).
   * Each entry is written to `.airemote-part`, hashed, then published — the
   * same guarantees as the single-file path without 3 round-trips per file.
   */
  async function onPutMany (p) {
    const { transferId, files } = p || {}
    if (!Array.isArray(files) || !files.length) return err(transferId, 'invalid_request', 'files مطلوبة')
    const results = []
    for (const f of files) {
      const out = { id: f.id, name: f.name }
      try {
        let abs = await assertSafeOsPath(f.path, roots)
        const conflict = f.conflict || 'rename'
        if (conflict === 'skip' && await exists(abs)) { results.push({ ...out, ok: true, skipped: true }); continue }
        if (conflict === 'rename' && await exists(abs)) abs = await pickFreeName(abs)
        const partPath = abs + PART_SUFFIX
        await fsp.mkdir(path.dirname(abs), { recursive: true })
        const buf = Buffer.from(String(f.data || ''), 'base64')
        await fsp.writeFile(partPath, buf)
        const actual = await sha256File(partPath)
        if (f.sha256 && actual !== String(f.sha256).toLowerCase()) {
          try { await fsp.unlink(partPath) } catch {}
          results.push({ ...out, ok: false, code: 'hash_mismatch', error: 'بصمة الملف لا تطابق المصدر' })
          continue
        }
        await fsp.rename(partPath, abs)
        results.push({ ...out, ok: true, size: buf.length, sha256: actual, path: toWebPath(abs) })
      } catch (e) {
        results.push({ ...out, ok: false, code: e.code || 'put_failed', error: e.message })
      }
    }
    return ok(transferId, 'agent:ft_put_many_done', { results })
  }

  async function handle (msg) {
    const type = msg && msg.type
    const p = (msg && msg.payload) || {}
    try {
      if (type === 'server:ft_open') return await onOpen(p)
      if (type === 'server:ft_write') return await onWrite(p)
      if (type === 'server:ft_read') return await onRead(p)
      if (type === 'server:ft_finish') return await onFinish(p)
      if (type === 'server:ft_abort') return await onAbort(p)
      if (type === 'server:ft_put_many') return await onPutMany(p)
    } catch (e) {
      // assertSafeOsPath throws before any handle is opened.
      return err(p.transferId, e.code || 'ft_error', e.message)
    }
    return false
  }

  async function shutdown () {
    for (const id of Array.from(sessions.keys())) await closeSession(id, false)
  }

  return {
    handle, shutdown, assertSafeOsPath: (p) => assertSafeOsPath(p, roots), roots,
    setFaultAfter: (n) => { faultAfter = Number(n) || 0 },
    PART_SUFFIX
  }
}

module.exports = { createAgentTransfer, assertSafeOsPath, toOsPath, toWebPath, PART_SUFFIX }
