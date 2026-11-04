'use strict'
/**
 * updater.js — update from an internal folder, verified by the signed release manifest (R7).
 *
 * The plan defers package signing (§2.2), so trust comes from what already exists:
 * the Ed25519-signed manifest in releases/, its per-artifact SHA-256, and a fixed public
 * key shipped inside this module. An update is only ever staged after BOTH the signature
 * and the hash check pass; anything else is reported and left alone.
 *
 * Nothing here downloads from the internet: the source is a folder (a share, a synced
 * directory, a USB copy). That matches the owner decision of 2026-10-30.
 *
 * The apply step cannot run inside the server process: NSIS must replace files that the
 * running executable holds. `apply()` therefore writes a small detached helper next to the
 * data directory and starts it with the Electron binary in Node mode; the helper stops the
 * server, installs, restarts, waits for /health to report the target version, and re-installs
 * the previous package when it does not.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')

const SERVER_PUBLIC_KEY = [
  '-----BEGIN PUBLIC KEY-----',
  'MCowBQYDK2VwAyEAtTK9a8CsaZO0bM/x+y5v9hWepTS2uMw2nsp2yQ9c0O4=',
  '-----END PUBLIC KEY-----',
  '',
].join('\n')

const SETUP_RE = /^server-windows\/AiRemote-Server-Setup-v(.+)-x64\.exe$/

function parseVersion(v) {
  const m = String(v || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b)
  if (!x || !y) return 0
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  return 0
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    const s = fs.createReadStream(file)
    s.on('error', reject)
    s.on('data', (d) => h.update(d))
    s.on('end', () => resolve(h.digest('hex')))
  })
}

/** Reads and cryptographically verifies <dir>/manifest.json against <dir>/manifest.sig. */
function readSignedManifest(dir) {
  const mPath = path.join(dir, 'manifest.json')
  const sPath = path.join(dir, 'manifest.sig')
  if (!fs.existsSync(mPath)) return { ok: false, reason: 'manifest-missing', detail: mPath }
  if (!fs.existsSync(sPath)) return { ok: false, reason: 'signature-missing', detail: sPath }
  const body = fs.readFileSync(mPath)
  const sig = Buffer.from(fs.readFileSync(sPath, 'utf8').trim(), 'base64')
  let valid = false
  try { valid = crypto.verify(null, body, SERVER_PUBLIC_KEY, sig) } catch { valid = false }
  if (!valid) return { ok: false, reason: 'signature-invalid' }
  let manifest = null
  try { manifest = JSON.parse(body.toString('utf8')) } catch (e) { return { ok: false, reason: 'manifest-unparsable', detail: e.message } }
  return { ok: true, manifest, body }
}

/**
 * Full check against the folder. Returns a verdict the caller can show as-is:
 *   available  – a newer, verified package is there
 *   current    – nothing newer (or the same version)
 *   blocked    – something newer exists but failed verification (reason says what)
 */
async function check(opts) {
  const dir = opts && opts.sourceDir
  const current = (opts && opts.currentVersion) || '0.0.0'
  const out = { ok: false, sourceDir: dir, current, latest: null, available: false, verified: false }
  if (!dir) return Object.assign(out, { reason: 'source-not-configured' })
  if (!fs.existsSync(dir)) return Object.assign(out, { reason: 'source-missing', detail: dir })

  const signed = readSignedManifest(dir)
  if (!signed.ok) return Object.assign(out, { reason: signed.reason, detail: signed.detail })
  const manifest = signed.manifest
  out.latest = manifest.version
  out.generatedAt = manifest.generatedAt || null
  if (!parseVersion(manifest.version)) return Object.assign(out, { reason: 'manifest-version-invalid' })

  if (compareVersions(manifest.version, current) <= 0) {
    return Object.assign(out, { ok: true, available: false, verified: true, reason: 'up-to-date' })
  }

  const entry = (manifest.artifacts || []).find((a) => SETUP_RE.test(String(a.name || '')))
  if (!entry) return Object.assign(out, { reason: 'server-package-missing-in-manifest' })
  const file = path.join(dir, entry.name.split('/').join(path.sep))
  if (!fs.existsSync(file)) return Object.assign(out, { reason: 'package-file-missing', detail: file })

  const size = fs.statSync(file).size
  if (Number(entry.size) && size !== Number(entry.size)) {
    return Object.assign(out, { reason: 'package-size-mismatch', detail: size + ' != ' + entry.size })
  }
  const digest = await sha256File(file)
  if (digest.toLowerCase() !== String(entry.sha256).toLowerCase()) {
    return Object.assign(out, { reason: 'package-hash-mismatch', detail: digest.slice(0, 16) })
  }

  out.ok = true
  out.available = true
  out.verified = true
  out.artifact = { name: entry.name, path: file, size, sha256: digest }
  return out
}

/**
 * Copies a verified package into the staging area; returns the staged path.
 *
 * 3.13.1 — the old version copied the package unconditionally on every apply, and kept
 * every copy. A retried update therefore wrote a fresh 223MB file per attempt and never
 * removed one. Staging is now idempotent (same size => reuse) and the directory is pruned
 * to a single package before writing.
 */
function stage(result, dataDir) {
  if (!result || !result.verified || !result.artifact) throw new Error('nothing verified to stage')
  const dir = path.join(dataDir, 'updates', 'staged')
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, path.basename(result.artifact.path))
  const want = Number(result.artifact.size) || 0
  let reused = false
  try {
    if (want && fs.existsSync(dest) && fs.statSync(dest).size === want) reused = true
  } catch {}
  if (!reused) {
    for (const f of fs.readdirSync(dir)) {
      if (f === path.basename(dest)) continue
      try { fs.unlinkSync(path.join(dir, f)) } catch {}
    }
    const tmp = dest + '.part'
    fs.copyFileSync(result.artifact.path, tmp)
    fs.renameSync(tmp, dest)
  }
  return { path: dest, bytes: fs.statSync(dest).size, reused }
}

// ── 3.13.1 — سجل محاولات + تنظيف + قفل: كانت كل محاولة تحديث تنسخ ~223MB وتبقيها للأبد.
const ATTEMPTS_FILE = 'attempts.json'

function updDir (dataDir) { return path.join(dataDir, 'updates') }

function readAttempts (dataDir) {
  try {
    const raw = fs.readFileSync(path.join(updDir(dataDir), ATTEMPTS_FILE), 'utf8')
    const parsed = JSON.parse(raw)
    return { items: Array.isArray(parsed.items) ? parsed.items : [] }
  } catch { return { items: [] } }
}

function recordAttempt (dataDir, rec) {
  try {
    fs.mkdirSync(updDir(dataDir), { recursive: true })
    const all = readAttempts(dataDir)
    all.items = all.items.concat([rec]).slice(-60)
    fs.writeFileSync(path.join(updDir(dataDir), ATTEMPTS_FILE), JSON.stringify(all, null, 2), 'utf8')
  } catch {}
}

/** Returns the last attempt for this exact package, if it is still inside the cooldown. */
function recentAttempt (dataDir, target, sha, cooldownMs) {
  const all = readAttempts(dataDir)
  const now = Date.now()
  for (let i = all.items.length - 1; i >= 0; i--) {
    const it = all.items[i]
    if (String(it.target) !== String(target)) continue
    if (sha && it.sha && String(it.sha) !== String(sha)) continue
    const at = Date.parse(it.at || 0)
    if (!at) continue
    if (now - at <= (cooldownMs || 6 * 3600 * 1000)) return it
    return null
  }
  return null
}

/** Removes staged packages, half copies and installer temp dumps left behind by failures. */
function cleanup (dataDir, opts) {
  const keep = (opts && opts.keepPath) || null
  const removed = []
  const staged = path.join(updDir(dataDir), 'staged')
  try {
    for (const f of fs.readdirSync(staged)) {
      const full = path.join(staged, f)
      if (keep && path.resolve(full) === path.resolve(keep)) continue
      try { fs.unlinkSync(full); removed.push(full) } catch {}
    }
  } catch {}
  // NSIS extracts its payload to %TEMP%\nsXXXX.tmp; a killed install leaves it behind.
  const cutoff = Date.now() - (opts && opts.tempAgeMs ? opts.tempAgeMs : 2 * 3600 * 1000)
  for (const root of [process.env.TEMP, process.env.TMP]) {
    if (!root) continue
    let entries = []
    try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (!e.isDirectory() || !/^ns[A-Za-z0-9_]+.tmp$/i.test(e.name)) continue
      const full = path.join(root, e.name)
      try {
        const st = fs.statSync(full)
        if (st.mtimeMs > cutoff) continue
        let big = 0
        for (const f of fs.readdirSync(full)) {
          try { big = Math.max(big, fs.statSync(path.join(full, f)).size) } catch {}
        }
        if (big < 20 * 1024 * 1024) continue
        fs.rmSync(full, { recursive: true, force: true })
        removed.push(full)
      } catch {}
    }
  }
  return { ok: true, removed }
}

// ── apply lock: two applies must never overlap (a crash loop must not stack copies).
function lockPath (dataDir) { return path.join(updDir(dataDir), 'apply.lock') }

function acquireLock (dataDir, ttlMs) {
  const p = lockPath(dataDir)
  try { fs.mkdirSync(updDir(dataDir), { recursive: true }) } catch {}
  try {
    const st = fs.statSync(p)
    if (Date.now() - st.mtimeMs < (ttlMs || 15 * 60 * 1000)) return { ok: false, reason: 'locked', since: new Date(st.mtimeMs).toISOString() }
  } catch {}
  try { fs.writeFileSync(p, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), 'utf8') } catch (e) { return { ok: false, reason: 'lock-write-failed', detail: e.message } }
  return { ok: true }
}

function releaseLock (dataDir) { try { fs.unlinkSync(lockPath(dataDir)) } catch {} }

const HELPER_SOURCE = String.raw`'use strict'
// apply-update.cjs — written by lib/updater.js at apply time. Runs detached from the server
// because NSIS cannot replace files that the running process holds open.
const fs = require('fs')
const path = require('path')
const { spawnSync, spawn } = require('child_process')

// The health probe talks to 127.0.0.1 with the self-signed server certificate. The first
// live drill failed exactly here: fetch rejected the certificate, every probe returned "",
// and a perfectly good install was declared unhealthy.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const planPath = process.argv[2]
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))
const resultPath = plan.resultPath
const logPath = plan.logPath
const logLines = []
function say(msg) { logLines.push(new Date().toISOString() + ' ' + msg); try { fs.writeFileSync(logPath, logLines.join('\n')) } catch {} }
function result(state, extra) { try { fs.writeFileSync(resultPath, JSON.stringify(Object.assign({ state, at: new Date().toISOString() }, extra || {}), null, 2)) } catch {} }
const fake = process.env.AIREMOTE_UPDATE_FAKE_HEALTH || ''
const skipProcess = process.env.AIREMOTE_UPDATE_SKIP_PROCESS === '1'
const installCmd = process.env.AIREMOTE_UPDATE_INSTALL_CMD || ''

// The helper itself runs with ELECTRON_RUN_AS_NODE=1. Inheriting that into the product's
// own executable makes Electron start as plain Node and exit at once - the app "started"
// and never answered /health in the second live drill. Strip it for the children that are
// supposed to be the real application.
function appEnv() {
  const env = Object.assign({}, process.env)
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

function runInstaller(file, label) {
  const cmd = installCmd || file
  say('install ' + label + ': ' + cmd)
  if (installCmd) return spawnSync(cmd, [], { shell: true, encoding: 'utf8' })
  return spawnSync(cmd, ['/S'], { encoding: 'utf8', timeout: 10 * 60 * 1000 })
}

async function healthVersion() {
  if (fake) return fake
  try {
    const r = await fetch(plan.healthUrl, { headers: { 'cache-control': 'no-store' } })
    const j = await r.json()
    return j.version || ''
  } catch { return '' }
}

async function waitForVersion(target, seconds) {
  const until = Date.now() + seconds * 1000
  while (Date.now() < until) {
    const v = await healthVersion()
    if (v === target) return true
    await new Promise((r) => setTimeout(r, 2000))
  }
  return false
}

;(async () => {
  result('running', { target: plan.target })
  try {
    if (!skipProcess) {
      say('stopping the running server')
      spawnSync('taskkill', ['/F', '/IM', 'AiRemote Server.exe'], { encoding: 'utf8' })
      await new Promise((r) => setTimeout(r, 3000))
    }
    const inst = runInstaller(plan.installer, 'target ' + plan.target)
    say('installer exit ' + (inst && inst.status))
    if (inst && inst.status !== 0) {
      result('failed', { stage: 'install', exit: inst.status, stderr: String(inst.stderr || '').slice(0, 400) })
      return
    }
    if (!skipProcess) {
      say('starting ' + plan.appExe)
      // spawnSync would wait for the app to exit; the app must outlive this helper.
      spawn(plan.appExe, [], { detached: true, stdio: 'ignore', env: appEnv() }).unref()
    }
    const healthy = await waitForVersion(plan.target, plan.timeoutSeconds || 90)
    if (healthy) { say('target version is live'); result('success', { version: plan.target }); return }

    const seen = await healthVersion()
    say('target version did not answer (saw "' + seen + '"); rolling back')
    if (plan.previousInstaller && fs.existsSync(plan.previousInstaller)) {
      if (!skipProcess) spawnSync('taskkill', ['/F', '/IM', 'AiRemote Server.exe'], { encoding: 'utf8' })
      const back = runInstaller(plan.previousInstaller, 'rollback')
      say('rollback installer exit ' + (back && back.status))
      if (!skipProcess) spawn(plan.appExe, [], { detached: true, stdio: 'ignore', env: appEnv() }).unref()
      result('rolled-back', { version: seen || null, rollbackExit: back && back.status })
    } else {
      result('failed', { stage: 'health', seen: seen || null, reason: 'no previous installer to roll back to' })
    }
  } catch (e) {
    result('failed', { stage: 'exception', error: e.message })
  }
})()
`

/**
 * Makes sure a Node-capable binary with a NEUTRAL image name exists.
 *
 * The first live drill failed for a reason worth writing down: the helper was started with
 * the product's own executable, so its image name was "AiRemote Server.exe" - and the first
 * thing the helper does is `taskkill /IM "AiRemote Server.exe"`, which killed the helper
 * itself before the installer ever ran. Copying the same binary under a different name keeps
 * the kill precise and lets the installer proceed.
 */
function ensureHelperBinary(dataDir) {
  const dir = path.join(dataDir, 'updates')
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, 'updater.exe')
  const src = process.execPath
  try {
    const s = fs.statSync(src)
    const fresh = fs.existsSync(dest) && fs.statSync(dest).size === s.size && fs.statSync(dest).mtimeMs >= s.mtimeMs
    if (!fresh) {
      fs.copyFileSync(src, dest)
      try { fs.chmodSync(dest, 0o755) } catch {}
    }
  } catch (e) {
    // If the copy fails we still return the path: spawn will fail loudly instead of silently
    // installing nothing.
  }
  return dest
}

/** Writes the helper where the data directory can keep it, and returns its path. */
function writeHelper(dataDir) {
  const dir = path.join(dataDir, 'updates')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'apply-update.cjs')
  fs.writeFileSync(file, HELPER_SOURCE, 'utf8')
  ensureHelperBinary(dataDir)
  return file
}

/**
 * Starts the detached helper. Returns immediately: the caller's process is about to be
 * killed by the installer, so nothing here can wait for the outcome.
 */
function apply(opts) {
  const dataDir = opts.dataDir
  const staged = opts.stagedPath
  const previousInstaller = opts.previousInstaller || null
  if (!fs.existsSync(staged)) throw new Error('staged package missing: ' + staged)
  const helper = writeHelper(dataDir)
  const planPath = path.join(dataDir, 'updates', 'plan.json')
  const plan = {
    target: opts.target,
    installer: staged,
    previousInstaller,
    appExe: opts.appExe,
    healthUrl: opts.healthUrl || 'https://127.0.0.1:3001/health',
    timeoutSeconds: opts.timeoutSeconds || 90,
    resultPath: path.join(dataDir, 'updates', 'result.json'),
    logPath: path.join(dataDir, 'updates', 'apply.log'),
  }
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8')
  try { fs.unlinkSync(plan.resultPath) } catch {}
  const runner = ensureHelperBinary(dataDir)
  const child = spawn(runner, [helper, planPath], {
    detached: true,
    stdio: 'ignore',
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }),
  })
  child.unref()
  return { started: true, pid: child.pid, plan: planPath, result: plan.resultPath, log: plan.logPath }
}

function readResult(dataDir) {
  const p = path.join(dataDir, 'updates', 'result.json')
  if (!fs.existsSync(p)) return null
  try {
    const r = JSON.parse(fs.readFileSync(p, 'utf8'))
    // A helper killed mid-flight leaves state "running" behind. After fifteen minutes that
    // is not progress any more, and reporting it as running would hide a failed update.
    if (r && r.state === 'running' && Date.now() - Date.parse(r.at || 0) > 15 * 60 * 1000) {
      return Object.assign({}, r, { state: 'stalled', stalledAfterMinutes: 15 })
    }
    return r
  } catch { return null }
}

module.exports = {
  check, stage, apply, readResult, writeHelper, ensureHelperBinary, readSignedManifest,
  compareVersions, parseVersion, sha256File, SERVER_PUBLIC_KEY,
  readAttempts, recordAttempt, recentAttempt, cleanup, acquireLock, releaseLock,
}
