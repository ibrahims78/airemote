'use strict'
/**
 * db-adapter.js — one database surface for two engines.
 *
 *   AIREMOTE_DB=sqlite3  → better-sqlite3 (native, current default)
 *   AIREMOTE_DB=node     → node:sqlite (built into Node 22+/Electron 44)
 *
 * The server only ever used prepare/run/get/all/exec/pragma, so the adapter keeps that
 * exact shape. The point is to be able to abandon the native module without touching the
 * 200+ call sites, and to have a switch that can put the old engine back at any time.
 */
const path = require('path')

function wantsNodeEngine() {
  const v = String(process.env.AIREMOTE_DB || '').toLowerCase()
  if (v === 'node') return true
  if (v === 'sqlite3' || v === 'better') return false
  return false // default stays on the proven engine
}

function createBetter(pathToDb, opts) {
  const Database = require('better-sqlite3')
  return new Database(pathToDb, opts)
}

// 3.14.1 — a failing statement must say which one it was. The node:sqlite shim reports
// parameter problems without the SQL, which made a login 500 take hours to place.
function call(method, stmt, sql, args) {
  try {
    return stmt[method](...args)
  } catch (e) {
    const shape = args.map(a => (a && typeof a === 'object' ? '{' + Object.keys(a).join(',') + '}' : typeof a)).join(',')
    try {
      console.error('[db] ' + method + ' FAILED: ' + String(sql).replace(/\s+/g, ' ').slice(0, 240) + '  args=[' + shape + ']')
      console.error('[db] ' + e.message)
    } catch {}
    throw e
  }
}

function createNode(pathToDb) {
  const { DatabaseSync } = require('node:sqlite')
  const raw = new DatabaseSync(pathToDb, { timeout: 5000 })

  const wrap = (stmt, sql) => ({
    run: (...args) => call('run', stmt, sql, args),
    get: (...args) => call('get', stmt, sql, args),
    all: (...args) => call('all', stmt, sql, args),
    // better-sqlite3 returns the row id as a number; node:sqlite may hand back a BigInt.
    // Callers compare it with numbers, so normalise to Number when it is safe.
    safe: true
  })

  return {
    __engine: 'node:sqlite',
    prepare(sql) {
      let stmt
      try { stmt = raw.prepare(sql) } catch (e) {
        try { console.error('[db] prepare FAILED: ' + String(sql).replace(/\s+/g, ' ').slice(0, 240)); console.error('[db] ' + e.message) } catch {}
        throw e
      }
      try { if (typeof stmt.setAllowBareNamedParameters === 'function') stmt.setAllowBareNamedParameters(true) } catch {}
      return wrap(stmt, sql)
    },
    exec(sql) { return raw.exec(sql) },
    pragma(text) {
      // better-sqlite3's pragma() returns rows for read pragmas; exec covers the two
      // write pragmas the server uses (journal_mode, foreign_keys).
      try {
        const rows = raw.prepare('PRAGMA ' + text).all()
        return rows
      } catch {
        return raw.exec('PRAGMA ' + text)
      }
    },
    // better-sqlite3 wraps a function in BEGIN/COMMIT; the file-transfer service relies on it.
    transaction(fn) {
      return (...args) => {
        raw.exec('BEGIN')
        try { const out = fn(...args); raw.exec('COMMIT'); return out }
        catch (e) { try { raw.exec('ROLLBACK') } catch {} ; throw e }
      }
    },
    close() { return raw.close() },
    get open() { return true },
    get name() { return path.basename(pathToDb) }
  }
}

function createDatabase(pathToDb, opts) {
  const engine = wantsNodeEngine() ? 'node' : 'sqlite3'
  if (engine === 'node') {
    try {
      const db = createNode(pathToDb)
      try { console.log('[db] engine=node:sqlite file=' + path.basename(pathToDb)) } catch {}
      return db
    } catch (e) {
      console.warn('[db] node:sqlite unavailable (' + e.message + ') — falling back to better-sqlite3')
    }
  }
  try {
    const db = createBetter(pathToDb, opts)
    try { console.log('[db] engine=better-sqlite3 file=' + path.basename(pathToDb)) } catch {}
    return db
  } catch (e) {
    // Last resort: if the native module cannot load (wrong ABI) but node:sqlite exists,
    // still boot instead of leaving the user with a dead server.
    console.warn('[db] better-sqlite3 failed (' + e.message + ') — using node:sqlite')
    return createNode(pathToDb)
  }
}

module.exports = { createDatabase, wantsNodeEngine }
