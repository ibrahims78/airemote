/**
 * DB upgrade test — 3.6.0 database  ->  3.7.6 desktop server (better-sqlite3).
 *
 * Why: the Win11 install of 3.7.x started from an EMPTY database, so the
 * upgrade path over real 3.6.0 data was never exercised. This harness
 * manufactures a genuine 3.6.0 database (created by the 3.6.0 code itself,
 * taken from git) and then boots the current server on top of it.
 *
 * What it proves:
 *   1. schema parity  — no table/column needed by 3.7.6 is missing after upgrade
 *   2. login          — 3.6.0 bcrypt hashes still verify
 *   3. secrets        — SSH credentials sealed with the 3.6.0 JWT-derived key
 *                       still decrypt (config.json preserved across upgrade)
 *   4. data           — devices / settings / AI conversations survive
 *   5. housekeeping   — startup cleanup behaves exactly as in 3.6.0
 *
 * Negative control: same DB with a DIFFERENT jwtSecret (i.e. config.json lost)
 * must fail to decrypt — documented, not silently ignored.
 *
 * Run:  "packages\server-desktop\node_modules\electron\dist\electron.exe" scripts/test-db-upgrade.cjs
 *       (ELECTRON_RUN_AS_NODE=1 must be set — better-sqlite3 is built for Electron)
 * Flags: --verbose   print every check
 *        --keep      keep the temp directory
 * Env:   BASE_REF    git ref holding the 3.6.0 tree (default 32a9d6a)
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const net = require('net')
const http = require('http')
const cp = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const BASE_REF = process.env.BASE_REF || '32a9d6a'
const VERBOSE = process.argv.includes('--verbose')
const KEEP = process.argv.includes('--keep')
const SECRET = 'a'.repeat(96)          // stands in for the persisted config.json jwtSecret
const OTHER_SECRET = 'b'.repeat(96)    // negative control
const ADMIN = { email: 'admin@lab.local', password: 'Legacy-Pass-3.6.0', name: 'Admin' }
const AI_KEY = 'sk-legacy-3.6.0-key'
const SSH_SECRET = 'legacy-ssh-password-3.6.0'

const results = []
let pass = 0, fail = 0

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) })
  if (ok) { pass++; if (VERBOSE) console.log('  ok   ' + name + (detail ? '  — ' + detail : '')) }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  — ' + detail : '')) }
  return ok
}
function section(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 66 - t.length))) }
function silentLogger() {
  const noop = () => {}
  return { info: noop, warn: noop, error: noop, debug: noop, success: noop, log: noop, getRecent: () => [] }
}

let Database
try {
  Database = require(path.join(ROOT, 'packages', 'server-desktop', 'node_modules', 'better-sqlite3'))
  new Database(':memory:').close()
} catch (e) {
  console.log('SKIP: better-sqlite3 is not usable in this process (' + e.message + ')')
  console.log('      Run under the Electron binary with ELECTRON_RUN_AS_NODE=1.')
  process.exit(0)
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.unref()
    s.on('error', reject)
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
  })
}

function request(port, method, urlPath, body, token) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8')
    const headers = {}
    if (data) { headers['content-type'] = 'application/json'; headers['content-length'] = data.length }
    if (token) headers.authorization = 'Bearer ' + token
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers, timeout: 15000 }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(text) } catch {}
        resolve({ status: res.statusCode, json, text })
      })
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', (e) => resolve({ status: 0, json: null, text: 'REQUEST_ERROR: ' + e.message }))
    if (data) req.write(data)
    req.end()
  })
}

function withDb(dbFile, fn) {
  const db = new Database(dbFile)
  try { return fn(db) } finally { db.close() }
}

function snapshot(dbFile) {
  return withDb(dbFile, (db) => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name)
    const schema = {}
    const counts = {}
    for (const t of tables) {
      schema[t] = db.prepare('PRAGMA table_info(' + JSON.stringify(t) + ')').all().map(c => c.name + ':' + c.type + (c.notnull ? '!' : '') + (c.dflt_value ? '=' + c.dflt_value : ''))
      counts[t] = db.prepare('SELECT COUNT(*) c FROM "' + t + '"').get().c
    }
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name)
    return { tables, schema, counts, indexes }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase A — manufacture a genuine 3.6.0 database
// ─────────────────────────────────────────────────────────────────────────────
function extractOldServer() {
  const cacheDir = path.join(ROOT, 'packages', 'server-desktop', 'node_modules', '.cache', 'db-upgrade')
  fs.mkdirSync(cacheDir, { recursive: true })
  const modPath = path.join(cacheDir, 'server-3.6.0.cjs')
  const src = cp.execSync('git show ' + BASE_REF + ':packages/server-desktop/server.js',
    { cwd: ROOT, maxBuffer: 128 * 1024 * 1024 }).toString('utf8')
  if (!src || src.length < 100000) throw new Error('git show returned ' + (src ? src.length : 0) + ' bytes for ' + BASE_REF)
  fs.writeFileSync(modPath, src, 'utf8')
  return { modPath, bytes: src.length }
}

async function phaseA_manufacture(dbFile) {
  section('Phase A — build a 3.6.0 database with 3.6.0 code')

  const { modPath, bytes } = extractOldServer()
  check('extracted 3.6.0 server.js from ' + BASE_REF, bytes > 100000, bytes + ' bytes')

  const old = require(modPath)
  const port = await freePort()
  await old.start({ port, jwtSecret: SECRET, dbPath: dbFile, tls: false, logger: silentLogger(), desktopCallbacks: {} })
  check('3.6.0 server booted on a fresh database', true, 'port ' + port)

  let health = await request(port, 'GET', '/api/health'); if (health.status !== 200) health = await request(port, 'GET', '/health')
  const oldVersion = health.json && (health.json.version || health.json.agentVersion)
  check('3.6.0 reports its own version', oldVersion === '3.6.0', '/api/health version=' + oldVersion)

  // admin account — created by 3.6.0 (bcrypt cost 12)
  let setup = await request(port, 'POST', '/api/auth/setup', ADMIN)
  if (setup.status !== 200 && setup.status !== 201) setup = await request(port, 'POST', '/api/setup/init', ADMIN)
  check('3.6.0 created the admin account', setup.status === 200 || setup.status === 201, 'status ' + setup.status + ' ' + String(setup.text).slice(0, 120))

  const login = await request(port, 'POST', '/api/auth/login', { email: ADMIN.email, password: ADMIN.password })
  const token = login.json && (login.json.accessToken || login.json.token)
  check('3.6.0 admin can log in', login.status === 200 && !!token, 'status ' + login.status)

  const me = await request(port, 'GET', '/api/auth/me', undefined, token)
  const adminId = me.json && (me.json.id || me.json.userId || (me.json.user && me.json.user.id))
  check('3.6.0 exposes the admin user id', !!adminId, String(adminId))
  check('3.6.0 admin role is admin (no post-upgrade lockout)', me.json && me.json.role === 'admin', me.json && me.json.role)

  // device registered straight into the 3.6.0 schema (what an agent insert produces)
  const deviceId = 'dev-legacy-3-6-0'
  withDb(dbFile, (db) => {
    db.prepare("INSERT INTO devices (id, name, token, owner_id, info, status, tags, capabilities, last_seen) VALUES (?,?,?,?,?,?,?,?,datetime('now'))")
      .run(deviceId, 'LAB-WIN10-legacy', 'legacy-agent-token-3.6.0', adminId,
        JSON.stringify({ os: 'Windows 10', hostname: 'LAB-WIN10', arch: 'x64' }), 'offline', '[]', '{}')

    db.prepare("INSERT INTO ai_conversations (id, device_id, user_id, title, messages) VALUES (?,?,?,?,?)")
      .run('conv-legacy-1', deviceId, adminId, 'Legacy thread',
        JSON.stringify([{ role: 'user', content: 'hello from 3.6.0' }, { role: 'assistant', content: 'reply from 3.6.0' }]))

    const insAudit = db.prepare("INSERT INTO audit_log (user_id, user_email, device_id, action, details, ip_address, status_code, created_at) VALUES (?,?,?,?,?,?,?,?)")
    insAudit.run(adminId, ADMIN.email, deviceId, 'login', 'legacy recent', '10.0.0.5', 200, new Date().toISOString())
    insAudit.run(adminId, ADMIN.email, deviceId, 'screen.start', 'legacy 30d', '10.0.0.5', 200, new Date(Date.now() - 30 * 864e5).toISOString())
    insAudit.run(adminId, ADMIN.email, deviceId, 'device.update', 'legacy 120d', '10.0.0.5', 200, new Date(Date.now() - 120 * 864e5).toISOString())

    const insStats = db.prepare("INSERT INTO stats_history (device_id, cpu_percent, ram_percent, disk_percent, net_in_kb, net_out_kb, recorded_at) VALUES (?,?,?,?,?,?,?)")
    insStats.run(deviceId, 12.5, 40.1, 55.0, 10, 20, new Date().toISOString())
    insStats.run(deviceId, 15.0, 41.0, 55.0, 11, 21, new Date(Date.now() - 3 * 864e5).toISOString())
    insStats.run(deviceId, 18.0, 42.0, 55.0, 12, 22, new Date(Date.now() - 10 * 864e5).toISOString())

    const insSess = db.prepare("INSERT INTO sessions (id, device_id, user_id, type, started_at, ended_at, duration_sec, metadata) VALUES (?,?,?,?,?,?,?,?)")
    insSess.run('sess-legacy-closed', deviceId, adminId, 'shell', new Date(Date.now() - 2 * 864e5).toISOString(), new Date(Date.now() - 2 * 864e5 + 60000).toISOString(), 60, '{}')
    insSess.run('sess-legacy-open', deviceId, adminId, 'screen', new Date(Date.now() - 3600e3).toISOString(), null, null, '{}')
  })
  check('seeded device / conversation / audit / stats / sessions in the 3.6.0 schema', true)

  // user settings through the 3.6.0 handler (provider key stored the 3.6.0 way)
  const putSettings = await request(port, 'PUT', '/api/settings', {
    aiProvider: 'openai', aiModel: 'gpt-4o', aiApiKey: AI_KEY, ollamaUrl: ''
  }, token)
  check('3.6.0 stored AI settings', putSettings.status === 200 || putSettings.status === 204, 'status ' + putSettings.status)

  // SSH credential through the 3.6.0 handler (AES-256-CBC, key derived from jwtSecret)
  const cred = await request(port, 'POST', '/api/credentials', {
    deviceId, label: 'legacy-ssh', sshHost: '127.0.0.1', sshPort: 1, sshUsername: 'root',
    secretType: 'password', secret: SSH_SECRET
  }, token)
  const credId = cred.json && cred.json.id
  check('3.6.0 encrypted an SSH credential', cred.status === 201 && !!credId, 'status ' + cred.status + ' id=' + credId)

  const before = snapshot(dbFile)
  check('3.6.0 database contains 13 tables', before.tables.length === 13, before.tables.join(','))
  check('3.6.0 settings row is plain text (no enc1: sealing)', (() => {
    const rows = withDb(dbFile, (db) => db.prepare("SELECT key, value FROM settings WHERE value LIKE '%' || ? || '%'").all(AI_KEY))
    return rows.length > 0 && rows.every(r => !r.value.includes('enc1:'))
  })(), 'plain text in 3.6.0 (desktop never seals provider keys)')

  await old.stop()
  check('3.6.0 server stopped cleanly', true)

  return { before, adminId, deviceId, credId }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase B — boot 3.7.6 on that database
// ─────────────────────────────────────────────────────────────────────────────
async function phaseB_upgrade(dbFile, ctx) {
  section('Phase B — boot 3.7.6 on the 3.6.0 database')

  const srv = require(path.join(ROOT, 'packages', 'server-desktop', 'server.js'))
  const port = await freePort()
  let bootErr = null
  try {
    await srv.start({ port, jwtSecret: SECRET, dbPath: dbFile, tls: false, logger: silentLogger(), desktopCallbacks: {} })
  } catch (e) { bootErr = e }
  if (!check('3.7.6 boots on the 3.6.0 database', !bootErr, bootErr ? (bootErr.stack || bootErr.message) : 'no throw')) {
    return { fatal: true }
  }

  let health = await request(port, 'GET', '/health')
  if (health.status !== 200) health = await request(port, 'GET', '/api/health')
  check('/health responds 200', health.status === 200, 'status ' + health.status)
  check('/health reports version 3.7.6', health.json && health.json.version === '3.7.6',
    health.json ? JSON.stringify(health.json).slice(0, 160) : String(health.text).slice(0, 120))

  // 1) login with the 3.6.0 password hash
  const login = await request(port, 'POST', '/api/auth/login', { email: ADMIN.email, password: ADMIN.password })
  const token = login.json && (login.json.accessToken || login.json.token)
  check('legacy 3.6.0 password still authenticates', login.status === 200 && !!token, 'status ' + login.status)

  // 2) schema parity
  const after = snapshot(dbFile)
  check('table count unchanged after upgrade', after.tables.length === ctx.before.tables.length,
    ctx.before.tables.length + ' -> ' + after.tables.length)
  const missing = []
  for (const t of ctx.before.tables) {
    if (!after.schema[t]) { missing.push('TABLE ' + t); continue }
    const lost = ctx.before.schema[t].filter(c => !after.schema[t].includes(c))
    if (lost.length) missing.push(t + ':' + lost.join('+'))
  }
  check('no column lost or missing after upgrade', missing.length === 0, missing.join(', '))
  const added = []
  for (const t of Object.keys(after.schema)) {
    const isNew = (ctx.before.schema[t] || []).length === 0
    if (isNew && !ctx.before.schema[t]) continue
    const extra = after.schema[t].filter(c => !(ctx.before.schema[t] || []).includes(c))
    if (extra.length) added.push(t + ':' + extra.join('+'))
  }
  check('no unexpected schema drift introduced', added.length === 0, added.join(', ') || 'none')

  // 3) data survival
  check('devices survive', after.counts.devices === ctx.before.counts.devices, ctx.before.counts.devices + ' -> ' + after.counts.devices)
  check('AI conversations survive', after.counts.ai_conversations >= 1 && after.counts.ai_conversations === ctx.before.counts.ai_conversations,
    ctx.before.counts.ai_conversations + ' -> ' + after.counts.ai_conversations)
  check('settings row survives', after.counts.settings === ctx.before.counts.settings, ctx.before.counts.settings + ' -> ' + after.counts.settings)

  const msg = withDb(dbFile, (db) => (db.prepare("SELECT messages FROM ai_conversations WHERE id='conv-legacy-1'").get() || {}).messages || '')
  check('legacy conversation payload readable', msg.includes('hello from 3.6.0'), msg.slice(0, 80))

  // 4) secrets — provider key
  const settings = await request(port, 'GET', '/api/settings', undefined, token)
  check('3.6.0 AI provider key readable after upgrade', String(settings.text).includes(AI_KEY),
    'status ' + settings.status + ' ' + String(settings.text).slice(0, 120))

  // 5) secrets — SSH credential sealed with the 3.6.0 JWT-derived key
  const creds = await request(port, 'GET', '/api/credentials?deviceId=' + ctx.deviceId, undefined, token)
  check('credential listed after upgrade', String(creds.text).includes('legacy-ssh'), 'status ' + creds.status)

  const probe = await request(port, 'POST', '/api/sftp/connect', { credentialId: ctx.credId }, token)
  const decryptFailed = probe.status === 500 || /bad decrypt|Invalid encrypted|unsupported|wrong final block/i.test(probe.text)
  const reachedNetwork = /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ETIMEDOUT|connect/i.test(probe.text) && probe.status !== 500
  check('3.6.0 SSH secret still decrypts (fails on network, not on crypto)', !decryptFailed && (reachedNetwork || probe.status === 502),
    'status ' + probe.status + ' ' + String(probe.text).slice(0, 140))

  // 6) housekeeping parity
  const oldAudit = withDb(dbFile, (db) => db.prepare("SELECT COUNT(*) c FROM audit_log WHERE details='legacy 120d'").get().c)
  check('old audit rows are NOT deleted by the desktop upgrade', oldAudit === 1, '120-day row count ' + oldAudit)
  const oldStats = withDb(dbFile, (db) => db.prepare("SELECT COUNT(*) c FROM stats_history WHERE recorded_at < datetime('now','-7 days')").get().c)
  check('7-day stats pruning behaves as in 3.6.0 (pre-existing rule)', oldStats === 0, '10-day rows left: ' + oldStats)
  const openSession = withDb(dbFile, (db) => db.prepare("SELECT ended_at FROM sessions WHERE id='sess-legacy-open'").get() || {})
  check('session left open by 3.6.0 is closed on upgrade', !!openSession.ended_at, String(openSession.ended_at))

  const integrity = withDb(dbFile, (db) => db.prepare('PRAGMA integrity_check').get())
  check('database integrity_check passes', integrity && integrity.integrity_check === 'ok', integrity && integrity.integrity_check)

  const refresh = await request(port, 'POST', '/api/auth/refresh', { refreshToken: (login.json && login.json.refreshToken) || '' })
  check('refresh token issued by 3.7.6 works', refresh.status === 200, 'status ' + refresh.status)

  await srv.stop()
  check('3.7.6 stopped cleanly', true)

  return { fatal: false, after, health, port }
}

// ─────────────────────────────────────────────────────────────────────────────
// Negative control — what happens if config.json (jwtSecret) is lost
// ─────────────────────────────────────────────────────────────────────────────
async function negativeControl(dbFile, ctx) {
  section('Negative control — same DB, different jwtSecret')

  const dir = path.dirname(dbFile)
  const copyDir = path.join(dir, 'negcontrol')
  fs.mkdirSync(copyDir, { recursive: true })
  const copyFile = path.join(copyDir, 'airemote.db')
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(dbFile + suffix)) fs.copyFileSync(dbFile + suffix, copyFile + suffix)
  }

  const srv = require(path.join(ROOT, 'packages', 'server-desktop', 'server.js'))
  const port = await freePort()
  let bootErr = null
  try {
    await srv.start({ port, jwtSecret: OTHER_SECRET, dbPath: copyFile, tls: false, logger: silentLogger(), desktopCallbacks: {} })
  } catch (e) { bootErr = e }
  if (!check('3.7.6 still boots with a rotated jwtSecret', !bootErr, bootErr ? bootErr.message : '')) return

  const login = await request(port, 'POST', '/api/auth/login', { email: ADMIN.email, password: ADMIN.password })
  const token = login.json && (login.json.accessToken || login.json.token)
  check('login still works after secret rotation (bcrypt is secret-independent)', login.status === 200 && !!token, 'status ' + login.status)

  const probe = await request(port, 'POST', '/api/sftp/connect', { credentialId: ctx.credId }, token)
  check('storage: stored SSH secret becomes UNDECRYPTABLE when jwtSecret changes (documented risk)',
    probe.status === 500 || /bad decrypt/i.test(probe.text),
    'status ' + probe.status + ' ' + String(probe.text).slice(0, 140))

  await srv.stop()
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-dbup-'))
  const dbFile = path.join(workDir, 'airemote.db')

  console.log('AiRemote DB upgrade test — ' + BASE_REF + ' (3.6.0)  ->  working tree (3.7.6)')
  console.log('temp dir: ' + workDir)

  let ctx, phaseB
  try {
    ctx = await phaseA_manufacture(dbFile)
    phaseB = await phaseB_upgrade(dbFile, ctx)
    if (!phaseB.fatal) await negativeControl(dbFile, ctx)
  } catch (e) {
    console.log('\nHARNESS ERROR: ' + (e.stack || e.message))
    fail++
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseRef: BASE_REF,
    runtime: { node: process.versions.node, electron: process.versions.electron || null },
    dbFile,
    totals: { pass, fail },
    checks: results,
    snapshotBefore: ctx ? ctx.before : null,
    snapshotAfter: phaseB && phaseB.after ? phaseB.after : null
  }
  const outDir = path.join(ROOT, 'outputs', 'db-upgrade-3.7.6')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'upgrade-report-' + stamp + '.json')
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8')

  section('Summary')
  console.log('passed: ' + pass + '   failed: ' + fail)
  console.log('report: ' + outFile)

  if (!KEEP) {
    try { fs.rmSync(workDir, { recursive: true, force: true }) } catch {}
  } else {
    console.log('kept  : ' + workDir)
  }

  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.log('FATAL: ' + (e.stack || e.message)); process.exit(1) })
