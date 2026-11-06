'use strict'
/**
 * config-store — persistent agent settings with crash-safe writes.
 *
 * Why this module exists:
 * the previous inline implementation (main.js loadConfig/saveConfig) used a bare
 * writeFileSync and swallowed every error. One truncated write (power loss, or
 * Stop-Process during a save) leaves invalid JSON; the next launch parses it as
 * "no config" and falls back to defaults, and the following window-bounds save
 * persists those defaults over the file — losing serverUrl/token/autoStart for
 * good. That is the owner-reported "WIN10 agent forgets its settings after
 * reboot" defect.
 *
 * Guarantees:
 *   1) writes are atomic (tmp + rename) — a reader never sees a half file;
 *   2) an unparseable file is preserved as <name>.corrupt-<timestamp> before
 *      anything else is written, so pairing data stays recoverable;
 *   3) a live config that has no pairing is seeded once from the legacy
 *      userData folder (installs that predate the app-identity change).
 */
const fs = require('fs')
const path = require('path')

const SEED_KEYS = ['serverUrl', 'token', 'controlAuthMode', 'controlPasswordSalt', 'controlPasswordHash']

function defaultConfig () {
  return { serverUrl: '', token: '', autoStart: false, startMinimized: false, runAtStartup: null, _winBounds: null }
}

function readJsonObject (file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('config root is not an object')
  }
  return parsed
}

function writeJsonAtomic (file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp-' + process.pid
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
    fs.renameSync(tmp, file)
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch {}
    throw e
  }
}

function quarantine (file, err, log) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const bad = file + '.corrupt-' + stamp
  try {
    fs.renameSync(file, bad)
    log('config unreadable (' + err.message + ') — preserved as ' + path.basename(bad))
    return bad
  } catch (e2) {
    log('config unreadable (' + err.message + ') and could not be preserved: ' + e2.message)
    return null
  }
}

function missing (cfg, key) {
  const v = cfg ? cfg[key] : undefined
  if (key === 'serverUrl' || key === 'token') return !String(v || '').trim()
  return v === undefined || v === null || v === ''
}

function createConfigStore (opts) {
  const file = opts.file
  const legacyFile = opts.legacyFile || null
  const log = typeof opts.log === 'function' ? opts.log : () => {}
  const state = { recovered: false, quarantined: null, seeded: false }

  let config = load()

  function load () {
    let loaded = null
    const present = !!(file && fs.existsSync(file))
    if (present) {
      try {
        loaded = readJsonObject(file)
      } catch (e) {
        state.recovered = true
        state.quarantined = quarantine(file, e, log)
        loaded = null
      }
    }

    let cfg = { ...defaultConfig(), ...(loaded || {}) }

    // One-time seed from the legacy folder. Only keys the live config lacks are
    // copied; autoStart is only inherited when the live file was absent or had
    // to be quarantined, so an explicit "off" is never overridden.
    if (legacyFile && legacyFile !== file && fs.existsSync(legacyFile) && (missing(cfg, 'serverUrl') || missing(cfg, 'token'))) {
      let legacy = null
      try { legacy = readJsonObject(legacyFile) } catch (e) { log('legacy config unreadable: ' + e.message) }
      if (legacy && (!missing(legacy, 'serverUrl') || !missing(legacy, 'token'))) {
        const seed = {}
        for (const k of SEED_KEYS) {
          if (missing(cfg, k) && !missing(legacy, k)) seed[k] = legacy[k]
        }
        if ((!present || state.recovered) && legacy.autoStart === true) seed.autoStart = true
        if (Object.keys(seed).length) {
          cfg = { ...cfg, ...seed }
          state.seeded = true
          try {
            writeJsonAtomic(file, cfg)
            log('config seeded from legacy userData: ' + Object.keys(seed).join(','))
          } catch (e) {
            log('config seed could not be persisted: ' + e.message)
          }
        }
      }
    }
    return cfg
  }

  function save (updates) {
    if (updates && typeof updates === 'object') config = { ...config, ...updates }
    try {
      writeJsonAtomic(file, config)
      return true
    } catch (e) {
      log('config save FAILED: ' + e.message)
      return false
    }
  }

  return {
    file,
    state,
    get config () { return config },
    save
  }
}

module.exports = { createConfigStore, defaultConfig, SEED_KEYS }
