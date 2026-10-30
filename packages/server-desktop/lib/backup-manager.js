'use strict'
/**
 * backup-manager.js — consistent SQLite snapshots for the desktop server (R7).
 *
 * Why not the old ZIP export: copying a live SQLite file (plus WAL) can capture a torn
 * state, and extracting with PowerShell is not a restore path you want to test at 3 a.m.
 * `VACUUM INTO` builds a standalone, defragmented database from the live connection in
 * one statement, and the copy is verified before it is published under its final name.
 *
 * Layout: <dataDir>/backups/airemote-YYYYMMDD-HHmmss[-reason].db
 * Policy: keep the newest N (default 7), one snapshot per interval (default 24h),
 * a failed verification never replaces the previous good snapshot.
 */
const fs = require('fs')
const path = require('path')

const TICK_MS = 30 * 60 * 1000          // check twice an hour, act once a day

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
}

function q(value) { return "'" + String(value).replace(/'/g, "''") + "'" }

function createBackupManager(opts) {
  const database = opts.db
  const dbPath = opts.dbPath
  const log = opts.log || { info() {}, warn() {}, error() {} }
  const dir = opts.dir || path.join(path.dirname(dbPath || '.'), 'backups')
  const keep = Math.max(1, parseInt(opts.keep || process.env.AIREMOTE_BACKUP_KEEP || '7', 10) || 7)
  const intervalMs = Math.max(60 * 1000,
    parseInt(opts.intervalHours || process.env.AIREMOTE_BACKUP_INTERVAL_HOURS || '24', 10) * 3600 * 1000)
  const disabled = opts.disabled !== undefined
    ? !!opts.disabled
    : String(process.env.AIREMOTE_BACKUP_DISABLE || '') === '1'

  const state = { lastOkAt: null, lastPath: null, lastBytes: 0, lastError: null, runs: 0, failures: 0 }
  let timer = null

  function ensureDir() {
    fs.mkdirSync(dir, { recursive: true })
  }

  function list() {
    try {
      ensureDir()
      return fs.readdirSync(dir)
        .filter((f) => /^airemote-\d{8}-\d{6}.*\.db$/.test(f))
        .map((f) => {
          const full = path.join(dir, f)
          const st = fs.statSync(full)
          return { name: f, path: full, bytes: st.size, mtime: st.mtime.toISOString() }
        })
        .sort((a, b) => (a.name < b.name ? 1 : -1))
    } catch (e) { log.warn('backup', 'list failed: ' + e.message); return [] }
  }

  function prune() {
    const files = list()
    let removed = 0
    for (const f of files.slice(keep)) {
      try { fs.unlinkSync(f.path); removed++ } catch (e) { log.warn('backup', 'prune failed: ' + e.message) }
    }
    return removed
  }

  /** Opens the snapshot with the same engine and proves it is a usable database. */
  function verify(file) {
    let probe = null
    try {
      const { createDatabase } = require('./db-adapter')
      probe = createDatabase(file)
      const row = probe.prepare('PRAGMA integrity_check').get() || {}
      const verdict = row.integrity_check || row['integrity_check'] || Object.values(row)[0]
      if (String(verdict || '').toLowerCase() !== 'ok') throw new Error('integrity_check -> ' + verdict)
      const counts = {
        users: probe.prepare('SELECT COUNT(*) AS c FROM users').get().c,
        devices: probe.prepare('SELECT COUNT(*) AS c FROM devices').get().c,
        sessions: probe.prepare('SELECT COUNT(*) AS c FROM sessions').get().c,
      }
      return { ok: true, counts }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      try { if (probe) probe.close() } catch {}
    }
  }

  function create(reason) {
    if (disabled) return { ok: false, skipped: 'disabled' }
    ensureDir()
    const name = 'airemote-' + stamp(new Date()) + (reason ? '-' + String(reason).replace(/[^a-z0-9_-]/gi, '') : '') + '.db'
    const finalPath = path.join(dir, name)
    const tmpPath = finalPath + '.part'
    state.runs++
    try {
      try { fs.unlinkSync(tmpPath) } catch {}
      database.exec('VACUUM INTO ' + q(tmpPath))
      const check = verify(tmpPath)
      if (!check.ok) throw new Error('snapshot verification failed: ' + check.error)
      fs.renameSync(tmpPath, finalPath)
      state.lastOkAt = Date.now()
      state.lastPath = finalPath
      state.lastBytes = fs.statSync(finalPath).size
      state.lastError = null
      const removed = prune()
      log.info('backup', 'snapshot ' + name + ' (' + (state.lastBytes / 1048576).toFixed(1) + ' MB) counts=' +
        JSON.stringify(check.counts) + (removed ? ' pruned=' + removed : ''))
      return { ok: true, path: finalPath, bytes: state.lastBytes, counts: check.counts, pruned: removed }
    } catch (e) {
      state.failures++
      state.lastError = e.message
      try { fs.unlinkSync(tmpPath) } catch {}
      log.error('backup', 'failed: ' + e.message)
      return { ok: false, error: e.message }
    }
  }

  function due() {
    if (disabled) return false
    if (!state.lastOkAt) {
      const files = list()
      if (!files.length) return true
      return Date.now() - Date.parse(files[0].mtime) >= intervalMs
    }
    return Date.now() - state.lastOkAt >= intervalMs
  }

  function tick() {
    if (!due()) return null
    return create('auto')
  }

  function start() {
    if (disabled) { log.info('backup', 'disabled by AIREMOTE_BACKUP_DISABLE=1'); return }
    ensureDir()
    // adopt the newest existing snapshot so a restart does not create a duplicate
    const files = list()
    if (files.length) {
      state.lastPath = files[0].path
      state.lastBytes = files[0].bytes
      state.lastOkAt = Date.parse(files[0].mtime)
    }
    timer = setInterval(() => { try { tick() } catch (e) { log.error('backup', 'tick: ' + e.message) } }, TICK_MS)
    if (timer.unref) timer.unref()
    const boot = setTimeout(() => { try { tick() } catch {} }, 60 * 1000)
    if (boot.unref) boot.unref()
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
  }

  return {
    create, list, start, stop, tick, due, verify,
    get dir() { return dir },
    get keep() { return keep },
    get disabled() { return disabled },
    state() {
      return {
        dir, keep, disabled, intervalHours: Math.round(intervalMs / 3600000),
        lastOkAt: state.lastOkAt ? new Date(state.lastOkAt).toISOString() : null,
        ageSeconds: state.lastOkAt ? Math.round((Date.now() - state.lastOkAt) / 1000) : null,
        lastPath: state.lastPath, lastBytes: state.lastBytes,
        lastError: state.lastError, runs: state.runs, failures: state.failures,
        files: list().length,
      }
    },
  }
}

module.exports = { createBackupManager }
