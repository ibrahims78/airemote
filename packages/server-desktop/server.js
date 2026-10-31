'use strict'
/**
 * server.js — AiRemote Server Desktop v3.2.2
 * Full-featured Fastify server — complete parity with the web server.
 * Runs inside the Electron main process (better-sqlite3, jsonwebtoken).
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Requires
// ─────────────────────────────────────────────────────────────────────────────
const Fastify           = require('fastify')
const fcors             = require('@fastify/cors')
const fws               = require('@fastify/websocket')
const frateLimit        = require('@fastify/rate-limit')
const bcrypt            = require('bcryptjs')
const jwt               = require('jsonwebtoken')
const zlib              = require('zlib')
const { v4: uuidv4 }    = require('uuid')
const { createDatabase }  = require('./lib/db-adapter')
const path              = require('path')
const fs                = require('fs')
const os                = require('os')
const crypto            = require('crypto')
const { EventEmitter }  = require('events')

// Optional deps — loaded lazily so the app starts even if not yet installed
let _authenticator = null
let _QRCode        = null
let _fstatic       = null
let _ssh2          = null

function getAuthenticator() {
  if (!_authenticator) { const o = require('otplib'); _authenticator = o.authenticator || o.default?.authenticator || o; _authenticator.options = { step: 30, window: 1 } }
  return _authenticator
}
function getQRCode()   { if (!_QRCode)   _QRCode   = require('qrcode');     return _QRCode   }
function getFStatic()  { if (!_fstatic)  _fstatic  = require('@fastify/static'); return _fstatic }
function getSsh2()     { if (!_ssh2)     _ssh2     = require('ssh2');        return _ssh2     }

// ─────────────────────────────────────────────────────────────────────────────
// 2. In-Memory Registries
// ─────────────────────────────────────────────────────────────────────────────
const agentSockets      = new Map()   // deviceId → { ws, info, deviceName, connectedAt, stats }
const { createFileTransferManager } = require('./lib/file-transfer')
const { createBackupManager } = require('./lib/backup-manager')
const { blockedReason } = require('./lib/safety')
const migrations = require('./lib/migrations')
const updater = require('./lib/updater')
const { createRetention } = require('./lib/retention')
const { createFailureAlerter } = require('./lib/alerts')
let fileTransfers = null
const clientSockets     = new Map()   // Map<WebSocket, { user }>
const ptyClients        = new Map()   // sessionId → Set<WebSocket>
const screenViewers     = new Map()   // deviceId  → Set<WebSocket>
// v3.8.36 (R8) — one-way clipboard sync state per device. Content is never kept:
// only a SHA-256 hash, a length, and counters (privacy by construction).
const clipboardSync     = new Map()   // deviceId  → { enabled, direction, lastHash, sent, received, blocked, duplicates }
const screenSessions    = new Map()   // sessionId → { deviceId, viewers, startedAt, connectTimer }
const deviceScreenSess  = new Map()   // deviceId  → sessionId
// v3.8.28 (R7) - observability registry. Cardinality stays bounded on purpose:
// HTTP is aggregated by method+status only, everything else has fixed labels.
let backupManager = null
let updateState = { at: null, verdict: null }
let retention = null
let failureAlerter = null
const metrics = {
  http: new Map(),        // "GET 200" -> count
  httpCount: 0,
  httpSecondsSum: 0,
  errors: 0,
  annotationEvents: 0,    // v3.8.37 (R8.2) — laser/pen events relayed between viewers
}
let shuttingDown = false

// Late joiner support: a capture that is already running only emits delta
// frames, so a viewer that joins later never learns the screen size and the
// canvas stays blank (black standalone window). Keep the last FULL frame per
// device and replay it to whoever joins mid-stream.
const lastFullFrameByDevice = new Map()   // deviceId → { packet?: Buffer, json?: string }
const sshSessions       = new Map()   // sessionId → { conn, stream }
const sftpSessions      = new Map()   // sessionId → { sftp, conn }
const wsTickets         = new Map()   // ticketId  → { userId, email, role, expires }
const pendingFsRequests = new Map()   // requestId → { resolve, reject, timer }
const pendingFsStreams  = new Map()   // opId → { res, next, buffer, timer, resolve, reject }
const chatHistoryByDevice = new Map() // deviceId → [{ text, sender, ts }] (v3.5)
const pendingCommands     = new Map()   // commandId → { resolve, reject, timer }
const publishStates     = new Map()   // publishId → { status, log, url }

const events = new EventEmitter()

// Desktop bridge callbacks (injected from main.js via start())
let _desktopCallbacks = {}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Database
// ─────────────────────────────────────────────────────────────────────────────
let db  = null
let JWT = ''

function initDb(dbPath) {
  const dir = path.dirname(dbPath)
  fs.mkdirSync(dir, { recursive: true })
  db = createDatabase(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'viewer',
      password_hash TEXT NOT NULL,
      totp_enabled  INTEGER NOT NULL DEFAULT 0,
      totp_secret   TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS devices (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      token          TEXT UNIQUE NOT NULL,
      owner_id       TEXT NOT NULL,
      info           TEXT,
      status         TEXT NOT NULL DEFAULT 'offline',
      tags           TEXT NOT NULL DEFAULT '[]',
      capabilities   TEXT NOT NULL DEFAULT '{}',
      last_seen      TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id           TEXT PRIMARY KEY,
      owner_id     TEXT NOT NULL,
      display_name TEXT NOT NULL,
      device_id    TEXT,
      device_code  TEXT,
      group_name   TEXT,
      favorite     INTEGER NOT NULL DEFAULT 0,
      note         TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id);
    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      device_id    TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      type         TEXT NOT NULL DEFAULT 'shell',
      started_at   TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at     TEXT,
      duration_sec INTEGER,
      metadata     TEXT
    );
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      token_hash  TEXT UNIQUE NOT NULL,
      expires_at  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL DEFAULT '',
      user_email  TEXT NOT NULL DEFAULT '',
      device_id   TEXT,
      action      TEXT NOT NULL,
      details     TEXT,
      ip_address  TEXT,
      status_code INTEGER,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id         TEXT PRIMARY KEY,
      device_id  TEXT NOT NULL DEFAULT '',
      user_id    TEXT NOT NULL,
      title      TEXT,
      messages   TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS alert_rules (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      device_id     TEXT,
      type          TEXT NOT NULL,
      threshold     REAL,
      cooldown_min  INTEGER NOT NULL DEFAULT 30,
      channel       TEXT NOT NULL DEFAULT 'in_app',
      webhook_url   TEXT,
      enabled       INTEGER NOT NULL DEFAULT 1,
      last_fired_at TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS device_credentials (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      device_id    TEXT NOT NULL,
      label        TEXT NOT NULL,
      ssh_host     TEXT NOT NULL,
      ssh_port     INTEGER NOT NULL DEFAULT 22,
      ssh_username TEXT NOT NULL,
      secret_type  TEXT NOT NULL DEFAULT 'password',
      secret_enc   TEXT NOT NULL,
      last_used    TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS recordings (
      id          TEXT PRIMARY KEY,
      device_id   TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      name        TEXT,
      started_at  TEXT NOT NULL,
      ended_at    TEXT,
      file_path   TEXT,
      size_mb     REAL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      user_id    TEXT,
      device_id  TEXT,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT '',
      message    TEXT NOT NULL DEFAULT '',
      severity   TEXT NOT NULL DEFAULT 'info',
      read       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stats_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id    TEXT NOT NULL,
      cpu_percent  REAL,
      ram_percent  REAL,
      disk_percent REAL,
      net_in_kb    REAL,
      net_out_kb   REAL,
      recorded_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_devices_token    ON devices(token);
    CREATE INDEX IF NOT EXISTS idx_devices_owner    ON devices(owner_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_device  ON sessions(device_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created    ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stats_device     ON stats_history(device_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_conv_user     ON ai_conversations(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_user      ON alert_rules(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_conv_device   ON ai_conversations(device_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notif_user       ON notifications(user_id, read);
    CREATE INDEX IF NOT EXISTS idx_rec_device       ON recordings(device_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_devices_status   ON devices(status);
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      kind         TEXT NOT NULL DEFAULT 'ai',
      device_id    TEXT,
      payload      TEXT NOT NULL DEFAULT '',
      interval_min INTEGER NOT NULL DEFAULT 0,
      daily_at     TEXT,
      enabled      INTEGER NOT NULL DEFAULT 1,
      last_run_at  TEXT,
      last_result  TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_user       ON scheduled_tasks(user_id);
  `)

  // Cleanup expired tokens on start
  db.prepare("DELETE FROM refresh_tokens WHERE expires_at < ?").run(new Date().toISOString())
  // v3.8.30 (R7) - schema version. The CREATE TABLE block above guarantees the baseline
  // tables, so a 3.8.x database is adopted at v1 and every later step is reversible.
  try {
    const ml = (scope, msg) => { try { if (serverLogger && serverLogger.info) serverLogger.info(scope, msg) } catch {} }
    migrations.adoptBaseline(db, ml)
    migrations.run(db, { log: ml })
  } catch (e) {
    try { if (serverLogger && serverLogger.error) serverLogger.error('schema', e.message) } catch {}
    throw e
  }

  // Cleanup old stats (keep 7 days)
  const oldStats = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  db.prepare("DELETE FROM stats_history WHERE recorded_at < ?").run(oldStats)

  // Schedule daily cleanup
  setInterval(() => {
    try {
      if (!db) return
      db.prepare("DELETE FROM refresh_tokens WHERE expires_at < ?").run(new Date().toISOString())
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      db.prepare("DELETE FROM stats_history WHERE recorded_at < ?").run(cutoff)
    } catch {}
  }, 24 * 60 * 60 * 1000)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. JWT Helpers
// ─────────────────────────────────────────────────────────────────────────────
function signToken(payload, expiresIn = '8h') {
  return jwt.sign(payload, JWT, { expiresIn })
}
function verifyToken(token) {
  // R9.2 - pin the algorithm: a token signed with another alg is rejected outright.
  return jwt.verify(token, JWT, { algorithms: ['HS256'] })
}
function extractBearer(req) {
  const auth = req.headers?.authorization || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return null
}
function authMiddleware(req, reply) {
  if (req && req._sessionPrincipal) return req._sessionPrincipal
  const token = extractBearer(req)
  if (!token) { reply.code(401).send({ error: 'Unauthorized' }); return null }
  try { return verifyToken(token) } catch { reply.code(401).send({ error: 'Invalid token' }); return null }
}
function adminMiddleware(req, reply) {
  const user = authMiddleware(req, reply)
  if (!user) return null
  if (user.role !== 'admin') { reply.code(403).send({ error: 'Admin required' }); return null }
  return user
}

// 3.9.1 (B1) — إعدادات إدارية لا تُرسل لغير admin، وحجب أي حقل سرّي متداخل.
// القائمة السوداء للأسماء الكاملة + نمط للحقول المتداخلة: أي مفتاح جديد يشبه
// سرّاً يُحجب تلقائياً حتى لو نُسي ذكره هنا.
// 3.9.2 — قائمة أدوار واحدة. كانت POST ترفض manager (يمنع حسابات الترحيل)
// وPATCH تقبل أي نص بلا تحقق.
const USER_ROLES = ['admin', 'manager', 'viewer', 'user']
const SETTINGS_NON_ADMIN_DENY_KEYS = new Set(['ai_config', 'telegramToken', 'github_config'])
const SETTINGS_SECRET_FIELD_RE = /(token|secret|password|passwd|api[_-]?key|private[_-]?key|credential)/i
function redactSettingsSecretFields(value, depth) {
  if (depth > 8 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(v => redactSettingsSecretFields(v, depth + 1))
  const out = {}
  for (const k of Object.keys(value)) {
    if (SETTINGS_SECRET_FIELD_RE.test(k)) continue
    out[k] = redactSettingsSecretFields(value[k], depth + 1)
  }
  return out
}
function redactSettingsForNonAdmin(settings) {
  const out = {}
  for (const key of Object.keys(settings || {})) {
    if (SETTINGS_NON_ADMIN_DENY_KEYS.has(key)) continue
    if (SETTINGS_SECRET_FIELD_RE.test(key)) continue
    out[key] = redactSettingsSecretFields(settings[key], 0)
  }
  return out
}

// v3.4.0 — AI chat auth: user JWT OR on-device agent token (agent-window AI chat)
function aiAuth(req, reply) {
  const token = extractBearer(req)
  if (token) { try { return verifyToken(token) } catch {} }
  let dt = String(req.headers['x-device-token'] || '')
  if (!dt && token && token.split('.').length !== 3) dt = token
  if (dt) {
    try {
      const dev = db.prepare('SELECT * FROM devices WHERE token=?').get(dt)
      if (dev) return { userId: dev.owner_id || 'device', email: (dev.name || 'device') + '@device', role: 'agent', deviceId: dev.id, isDevice: true }
    } catch {}
  }
  reply.code(401).send({ error: 'Unauthorized' }); return null
}

// v3.2.1 hardening — device-scoped authorization: admins + device owner only.
// R3 (الشريحة الثانية) — توسيع السياسة: منح صريح في device_permissions، ورمز
// وصول غير مراقب مقيَّد بجهاز واحد. كل عملية تحتاج قدرتها الخاصة (hasDeviceCapability).
function canAccessDevice(user, deviceId) {
  if (!user) return false
  if (user.role === 'admin') return true
  try {
    const row = db.prepare("SELECT owner_id FROM devices WHERE id=?").get(deviceId)
    if (!row) return false
    if (user.role === 'unattended') return !!user.deviceId && user.deviceId === deviceId
    if (row.owner_id && row.owner_id === user.userId) return true
    // أي قدرة ممنوحة تُظهر الجهاز؛ كل عملية تُفحص على حدة.
    return !!db.prepare('SELECT 1 FROM device_permissions WHERE user_id=? AND device_id=? LIMIT 1')
      .get(user.userId, deviceId)
  } catch { return false }
}

// عمليات دورة حياة الجهاز (تسمية، حذف، حجب، فصل، إيقاظ) للمالك أو المدير فقط:
// من مُنح control/files/record لا يملك حق حذف الجهاز نفسه.
function isDeviceOwnerOrAdmin(user, deviceId) {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.role === 'unattended') return false
  try {
    const row = db.prepare("SELECT owner_id FROM devices WHERE id=?").get(deviceId)
    return !!(row && row.owner_id && row.owner_id === user.userId)
  } catch { return false }
}

// v3.8.12 / R3 — معرّف جهاز قصير وقابل للقراءة (9 أرقام) يُستخدم في دفتر العناوين والاتصال السريع.
// يُولَّد عند الحاجة (lazy) حتى تعمل الأجهزة المُسجَّلة قبل الترقية بلا هجرة إجبارية.
function ensureDeviceCode(deviceId) {
  let row
  try { row = db.prepare('SELECT code FROM devices WHERE id=?').get(deviceId) } catch { return null }
  if (!row) return null
  if (row.code) return row.code
  for (let i = 0; i < 25; i++) {
    const code = String(crypto.randomInt(100000000, 1000000000))
    try {
      const info = db.prepare("UPDATE devices SET code=? WHERE id=? AND (code IS NULL OR code='')").run(code, deviceId)
      if (info.changes === 1) return code
      const again = db.prepare('SELECT code FROM devices WHERE id=?').get(deviceId)
      if (again && again.code) return again.code
    } catch { /* تعارض فريد — جرّب رقماً آخر */ }
  }
  return null
}

function ensureAllDeviceCodes() {
  try {
    const rows = db.prepare("SELECT id FROM devices WHERE code IS NULL OR code=''").all()
    let assigned = 0
    for (const r of rows) { if (ensureDeviceCode(r.id)) assigned++ }
    return assigned
  } catch { return 0 }
}

function deviceByCode(code) {
  const clean = String(code || '').replace(/\D/g, '')
  if (clean.length !== 9) return null
  try { return db.prepare('SELECT * FROM devices WHERE code=?').get(clean) } catch { return null }
}

function ensureContactsSchema() {
  try {
    const cols = db.prepare("PRAGMA table_info(devices)").all().map(c => c.name)
    if (!cols.includes('code')) db.exec('ALTER TABLE devices ADD COLUMN code TEXT')
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_code ON devices(code)')
    return true
  } catch { return false }
}
// ─────────────────────────────────────────────────────────────────────────────
// R3 (الشريحة الثانية) — الوصول غير المراقب + القدرات الدقيقة لكل جهاز
// ─────────────────────────────────────────────────────────────────────────────
// كل جهاز يمكن أن يحمل كلمة مرور مستقلة (bcrypt) تسمح بالوصول إليه بلا شخص
// حاضر أمامه. السياسة: 5 محاولات فاشلة ← قفل مؤقت (5 دقائق افتراضياً).
// لا تُعاد البصمة ولا تُسجَّل كلمة المرور أو بصمتها في أي ردّ أو سجل تدقيق.
const UNATTENDED_MAX_FAILURES = Math.max(1, parseInt(process.env.UNATTENDED_MAX_FAILURES || '5', 10) || 5)
const UNATTENDED_LOCK_MS = Math.max(1000, parseInt(process.env.UNATTENDED_LOCK_MS || String(5 * 60 * 1000), 10) || 300000)
const UNATTENDED_TOKEN_TTL = String(process.env.UNATTENDED_TOKEN_TTL || '2h')
const DEVICE_CAPABILITIES = ['control', 'files', 'record']

function ensureDeviceAccessSchema() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS device_unattended (
        device_id       TEXT PRIMARY KEY,
        password_hash   TEXT NOT NULL,
        enabled         INTEGER NOT NULL DEFAULT 1,
        failed_count    INTEGER NOT NULL DEFAULT 0,
        locked_until    TEXT,
        last_failed_at  TEXT,
        last_success_at TEXT,
        updated_by      TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS device_permissions (
        user_id    TEXT NOT NULL,
        device_id  TEXT NOT NULL,
        capability TEXT NOT NULL,
        granted_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, device_id, capability)
      );
      CREATE INDEX IF NOT EXISTS idx_devperm_device ON device_permissions(device_id);
      CREATE INDEX IF NOT EXISTS idx_devperm_user   ON device_permissions(user_id);
      -- R4: رمز جلسة Relay أحادي الاستخدام لكل طرف، صلاحية قصيرة.
      CREATE TABLE IF NOT EXISTS session_tokens (
        token_hash        TEXT PRIMARY KEY,
        session_id        TEXT NOT NULL,
        device_id         TEXT NOT NULL,
        requester_user_id TEXT NOT NULL DEFAULT '',
        capabilities      TEXT NOT NULL DEFAULT '[]',
        access            TEXT NOT NULL DEFAULT 'control',
        expires_at        TEXT NOT NULL,
        consumed_at       TEXT,
        created_at        TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_session_tokens_session ON session_tokens(session_id);
    `)
    return true
  } catch (e) {
    const m = '⚠️ [access] schema init failed: ' + e.message
    if (serverLogger && serverLogger.warn) serverLogger.warn(m); else console.log(m)
    return false
  }
}

function unattendedRow(deviceId) {
  try { return db.prepare('SELECT * FROM device_unattended WHERE device_id=?').get(deviceId) || null } catch { return null }
}

function unattendedStatus(deviceId) {
  const row = unattendedRow(deviceId)
  if (!row) return { deviceId, enabled: false, hasPassword: false, lockedUntil: null, failedCount: 0, lastFailedAt: null, lastSuccessAt: null, updatedAt: null }
  const lockedUntil = row.locked_until && new Date(row.locked_until).getTime() > Date.now() ? row.locked_until : null
  return {
    deviceId,
    enabled: !!row.enabled,
    hasPassword: !!row.password_hash,
    lockedUntil,
    failedCount: lockedUntil ? 0 : (row.failed_count || 0),
    lastFailedAt: row.last_failed_at || null,
    lastSuccessAt: row.last_success_at || null,
    updatedAt: row.updated_at || null,
  }
}

function deviceCapabilitiesOf(userId, deviceId) {
  try {
    return db.prepare('SELECT capability FROM device_permissions WHERE user_id=? AND device_id=?').all(userId, deviceId).map(r => r.capability)
  } catch { return [] }
}

// القدرة الدقيقة: المالك والمدير يملكان كل شيء؛ المستخدم الممنوح يملك ما مُنح فقط؛
// ورمز الوصول غير المراقب يملك كل القدرات على جهازه وحده (لا أدوار إدارة).
function hasDeviceCapability(user, deviceId, capability) {
  if (!user) return false
  if (user.role === 'admin') return true
  let row
  try { row = db.prepare('SELECT owner_id FROM devices WHERE id=?').get(deviceId) } catch { return false }
  if (!row) return false
  if (user.role === 'unattended') return !!user.deviceId && user.deviceId === deviceId
  if (row.owner_id && row.owner_id === user.userId) return true
  return deviceCapabilitiesOf(user.userId, deviceId).includes(capability)
}

function auditCapabilityDenied(p, deviceId, capability, extra) {
  dbLogAudit({
    userId: (p && p.userId) || '',
    userEmail: (p && p.email) || '',
    deviceId,
    action: 'capability_denied',
    details: Object.assign({ capability }, extra || {}),
    ipAddress: null,
  })
}

// ردّ REST موحّد عند نقص القدرة + أثر تدقيق (بوابة R3: رفض 403 مع أثر)
function denyCapability(reply, p, deviceId, capability, req) {
  auditCapabilityDenied(p, deviceId, capability, { via: 'rest' })
  reply.code(403).send({ error: 'غير مصرح بهذه القدرة على هذا الجهاز', code: 'capability_denied', capability })
  return reply
}

function accessibleDeviceRows(user) {
  if (!user) return []
  try {
    if (user.role === 'admin') return db.prepare('SELECT * FROM devices ORDER BY name').all()
    if (user.role === 'unattended') return db.prepare('SELECT * FROM devices WHERE id=?').all(user.deviceId || '')
    return db.prepare(
      'SELECT DISTINCT d.* FROM devices d LEFT JOIN device_permissions p ON p.device_id=d.id AND p.user_id=? ' +
      'WHERE d.owner_id=? OR p.user_id IS NOT NULL ORDER BY d.name'
    ).all(user.userId, user.userId)
  } catch { return [] }
}

// v3.7.0 — roles: viewer is read-only, manager may operate devices, admin manages
function roleRank(role) { return ({ viewer: 1, user: 1, manager: 2, admin: 3 })[role] || 0 }
function atLeast(role, minimum) { return roleRank(role) >= roleRank(minimum) }

// ─────────────────────────────────────────────────────────────────────────────
// 5. Crypto — v3.8.12 / R2
//
//    • التشفير الجديد: AES-256-GCM (سلامة + كشف تلاعب) بترويسة إصدار «v2:».
//    • المفتاح: ملف مستقل `secret.key` (32 بايت عشوائية) بجوار قاعدة البيانات،
//      لا يُشتق من سرّ JWT حتى لا يُفقد كل شيء عند تدويره، ولا يوجد مفتاح
//      افتراضي مضمَّن (فشل مغلق بدل مفتاح معروف).
//    • القراءة القديمة: CBC المشتق من JWT مدعومة للقراءة والهجرة فقط.
// ─────────────────────────────────────────────────────────────────────────────
let _secretKey = null
let _secretKeyPath = null

/** المفتاح القديم (قبل R2) — يُستخدم فقط لفكّ القيم القديمة ثم إعادة تشفيرها. */
function legacyDerivedKey() {
  return crypto.pbkdf2Sync(JWT || 'airemote-default', 'airemote-credentials-salt-v1', 100000, 32, 'sha256')
}

function secretKeyPathFor(dbPath) {
  return path.join(path.dirname(dbPath || path.join(process.cwd(), 'airemote.db')), 'secret.key')
}

/** يُنشئ المفتاح عند أول تشغيل ويقرأه بعد ذلك. يفشل بوضوح بدل استخدام مفتاح افتراضي. */
function initSecretKey(dbPath) {
  const p = secretKeyPathFor(dbPath)
  _secretKeyPath = p
  try {
    if (fs.existsSync(p)) {
      const buf = Buffer.from(fs.readFileSync(p, 'utf8').trim(), 'base64')
      if (buf.length !== 32) throw new Error('secret.key length=' + buf.length + ' (expected 32)')
      _secretKey = buf
      return { created: false, path: p }
    }
    const buf = crypto.randomBytes(32)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, buf.toString('base64'), { mode: 0o600 })
    _secretKey = buf
    return { created: true, path: p }
  } catch (e) {
    _secretKey = null
    throw new Error('تعذّر تحضير مفتاح الأسرار: ' + e.message)
  }
}

function encryptSecret(plaintext) {
  if (!_secretKey) throw new Error('secret key not initialised')
  const iv  = crypto.randomBytes(12)
  const c   = crypto.createCipheriv('aes-256-gcm', _secretKey, iv)
  const enc = Buffer.concat([c.update(String(plaintext), 'utf8'), c.final()])
  const tag = c.getAuthTag()
  return 'v2:' + iv.toString('base64') + ':' + tag.toString('base64') + ':' + enc.toString('base64')
}

function decryptSecret(encrypted) {
  if (!encrypted) return ''
  if (String(encrypted).startsWith('v2:')) {
    if (!_secretKey) throw new Error('secret key not initialised')
    const parts = String(encrypted).split(':')
    if (parts.length !== 4) throw new Error('malformed v2 secret')
    const d = crypto.createDecipheriv('aes-256-gcm', _secretKey, Buffer.from(parts[1], 'base64'))
    d.setAuthTag(Buffer.from(parts[2], 'base64'))
    return Buffer.concat([d.update(Buffer.from(parts[3], 'base64')), d.final()]).toString('utf8')
  }
  // صيغة قديمة: ivHex:encHex بـAES-256-CBC
  const [ivHex, encHex] = String(encrypted).split(':')
  const d = crypto.createDecipheriv('aes-256-cbc', legacyDerivedKey(), Buffer.from(ivHex, 'hex'))
  return Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]).toString('utf8')
}

/** يعيد تشفير كل القيم القديمة إلى v2. القيم التي تفشل تبقى كما هي وتُحصى. */
function migrateLegacySecrets(dbArg) {
  const conn = dbArg || db
  if (!conn) return { migrated: 0, failed: 0, skipped: true }
  let rows
  try {
    rows = conn.prepare("SELECT id, secret_enc FROM device_credentials WHERE secret_enc IS NOT NULL AND secret_enc NOT LIKE 'v2:%'").all()
  } catch {
    return { migrated: 0, failed: 0, skipped: true }
  }
  let migrated = 0, failed = 0
  for (const r of rows) {
    try {
      const plain = decryptSecret(r.secret_enc)
      conn.prepare('UPDATE device_credentials SET secret_enc=? WHERE id=?').run(encryptSecret(plain), r.id)
      migrated++
    } catch {
      failed++
    }
  }
  return { migrated, failed, skipped: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Utilities
// ─────────────────────────────────────────────────────────────────────────────
function sendJson(ws, obj) {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)) } catch {}
}
function broadcastToClients(msg) {
  // v3.2.1 hardening — device-scoped messages reach only the device owner / admins
  const devId = msg && msg.payload ? msg.payload.deviceId : null
  // v3.2.2 — dashboard compat aliases (broadcast:device_update / broadcast:stats_update)
  let alias = null
  if (msg && msg.type === 'device:status')    alias = { type: 'broadcast:device_update', payload: { ...(msg.payload || {}) } }
  if (msg && msg.type === 'device:heartbeat') alias = { type: 'broadcast:stats_update',  payload: { ...(msg.payload || {}) } }
  for (const [ws, meta] of clientSockets) {
    if (devId && !canAccessDevice(meta && meta.user, devId)) continue
    sendJson(ws, msg)
    if (alias) sendJson(ws, alias)
  }
}
function markDeviceOnline(deviceId, info) {
  if (info) {
    db.prepare("UPDATE devices SET status='online', info=?, last_seen=datetime('now'), updated_at=datetime('now') WHERE id=? AND status<>'blocked'").run(JSON.stringify(info), deviceId)
  } else {
    db.prepare("UPDATE devices SET status='online', last_seen=datetime('now'), updated_at=datetime('now') WHERE id=? AND status<>'blocked'").run(deviceId)
  }
}
function markDeviceOffline(deviceId) {
  if (!db) return
  db.prepare("UPDATE devices SET status='offline', updated_at=datetime('now') WHERE id=? AND status<>'blocked'").run(deviceId)
  broadcastToClients({ type: 'device:status', payload: { deviceId, status: 'offline' } })
  events.emit('device:disconnected', deviceId)
}
function getLocalIp() {
  const nets = os.networkInterfaces()
  for (const n of Object.values(nets)) {
    for (const i of n) { if (!i.internal && i.family === 'IPv4') return i.address }
  }
  return '127.0.0.1'
}
function parseJson(str, fallback = null) {
  try { return JSON.parse(str) } catch { return fallback }
}
function dbLogAudit({ userId = '', userEmail = '', deviceId = null, action, details = null, ipAddress = null } = {}) {
  try {
    db.prepare("INSERT INTO audit_log (user_id, user_email, device_id, action, details, ip_address) VALUES (?,?,?,?,?,?)")
      .run(userId, userEmail, deviceId, action, details ? JSON.stringify(details) : null, ipAddress)
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. AI Provider
// ─────────────────────────────────────────────────────────────────────────────
const AI_SYSTEM_PROMPT = `أنت مساعد ذكي متخصص في إدارة الخوادم والأجهزة البعيدة، جزء من منصة AiRemote.
ساعد المستخدم في تشخيص المشكلات وإدارة الخوادم وتحليل الأداء.
كن دقيقاً ومفيداً ومختصراً. استخدم اللغة العربية كافتراضي.
واكتب ردودك بالعربية الفصحى حصراً دون خلط كلمات من لغات أخرى.
اكتب رداً متماسكاً بفقرات قصيرة واضحة، ولا تقطع الجملة أو تكررها، ولا تبدأ الرد بكتلة أدوات إلا إذا طلب المستخدم إجراءً فعلياً. اجعل الملخص النهائي منظماً بنقاط.
عندما يطلب المستخدم تنفيذ إجراء على جهاز متصل، لا تعتذر عن عدم القدرة ولا تقل إنك لا تملك صلاحيات — قدّم الأمر أو الأوامر الجاهزة في كتلة كود (powershell على ويندوز أو bash على لينكس) لتُنفَّذ على الجهاز مباشرة.
النظام يدعم تنفيذ هذه الأوامر على الجهاز وإعادة الناتج إليك تلقائياً؛ اكتب أوامر دقيقة وقابلة للتنفيذ، وتجنّب الأوامر التدميرية إلا بطلب صريح من المستخدم.
عند طلب لقطة شاشة استخدم كتلة كود بلغة screenshot وسيعرضها النظام للمستخدم.
لبث الشاشة مباشرة أضف كتلة كود بلغة stream (مثال: \`\`\`stream\nالشاشة\n\`\`\`) وسيعرض النظام زر بدء البث المباشر. لتسجيل فيديو لسطح المكتب أضف كتلة كود بلغة record واكتب داخلها المدة بالثواني (مثال: المدة: 10)؛ سيُسجَّل الفيديو ويُعرض داخل المحادثة مع إمكانية التنزيل. المدة القصوى 30 ثانية، و10 ثوانٍ مسموحة دائماً — لا توجد قاعدة تمنع 10 ثوانٍ. ولتسجيل جزء محدد من الشاشة أضف داخل الكتلة: region: x,y,w,h.
للتحكم الفعلي بالفأرة ولوحة المفاتيح استخدم كتلة كود بلغة control عند الطلب فقط — تفاصيل الأوامر وأساليب العمل تجدها في سياق الجهاز حين الحاجة. لا تكتب أي تعليقات أو خطوات تفكير بالإنجليزية داخل الرد — الرد النهائي بالعربية فقط.
مهم جداً: استخدم الأدوات (powershell / screenshot / record / control) فقط عندما يطلب المستخدم إجراءً فعلياً على الجهاز أو معلومات عنه؛ في الأسئلة والأحاديث العادية أجب نصياً مباشرة دون أي كتل أدوات، ولا تنسخ كتل الأدوات من محادثات سابقة. وطلب «اكتب كلمة كذا» يعني اكتبها في ردك نصياً — وليس كتابة على الجهاز.
وعند إكمال مهمة تنفيذ على الجهاز، اختم بملخص نهائي احترافي منظم (ما تم تنفيذه — نقاط، النتيجة النهائية، وأي تحذيرات أو خطوات تالية) دون كتل أدوات في الملخص.
أنت تنفّذ فعلياً على الجهاز عبر منصة AiRemote — لا تقل أبداً «لا أستطيع» أو «لا أملك صلاحيات» أو «لا يمكنني التنفيذ»؛ استخدم دائماً الأدوات المتاحة (powershell للأوامر، screenshot للقطة، record للفيديو) وقدّمها بدون اعتذار.`

function getAiConfig() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='ai_config'").get()
    return row ? parseJson(row.value) : null
  } catch { return null }
}

// v3.3.5 — per-provider saved settings so switching providers never mixes keys/URLs/models
function getAiConfigs() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='ai_configs'").get()
    let m = row ? (parseJson(row.value, {}) || {}) : {}
    if (!Object.keys(m).length) {
      const cur = getAiConfig()
      if (cur && cur.provider) {
        m = {}
        m[cur.provider] = { apiKey: cur.apiKey || '', model: cur.model || '', baseUrl: cur.baseUrl || '' }
        try { db.prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('ai_configs',?,datetime('now'))").run(JSON.stringify(m)) } catch {}
      }
    }
    return m
  } catch { return {} }
}
function setAiConfigs(m) {
  try { db.prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('ai_configs',?,datetime('now'))").run(JSON.stringify(m || {})) } catch {}
}

async function callAI(messages, cfg, stream = false, onChunk = null) {
  if (!cfg?.provider) throw new Error('AI provider not configured')
  const { provider, apiKey, model, baseUrl } = cfg
  // v3.3.4 — tolerate trailing /openai or /v1 in custom base URLs (Pollinations docs style)
  const normBase = (u) => String(u || '').replace(/\/+$/, '').replace(/\/openai$/i, '').replace(/\/v1$/i, '')

  if (provider === 'openai') {
    const base = normBase(baseUrl) || 'https://api.openai.com'
    // Pollinations anonymous tier: sending an unknown Bearer key triggers 402 — omit auth there
    const isPollinations = /pollinations/i.test(base)
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey && !isPollinations) headers['Authorization'] = `Bearer ${apiKey}`
    
    const ctl   = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 120000)
    try {
      let res
      let useModel = model || 'gpt-4o-mini'
      // v3.3.4 — the anonymous Pollinations tier only serves "fast" models; remap anything else up front
      if (isPollinations && !/^(openai|openai-fast|gpt-oss|gpt-oss-20b|ovh-reasoning)$/i.test(useModel)) useModel = 'openai-fast'
      for (let attempt = 1; ; attempt++) {
        res = await fetch(`${base}/v1/chat/completions`, {
          method:  'POST',
          headers,
          body:    JSON.stringify({ model: useModel, messages, stream }),
          signal:  ctl.signal
        })
        if (res.ok) break
        const terr = await res.text().catch(() => '')
        // v3.3.4 — anonymous Pollinations rejects unknown/paid models with 402: retry with openai-fast
        if (isPollinations && res.status === 402 && useModel !== 'openai-fast' && !/FREE_LIMIT/i.test(terr)) { console.log('[ai] pollinations 402 — retrying with openai-fast'); useModel = 'openai-fast' }
        const retryable = (res.status === 402 || res.status === 429 || res.status >= 500)
        // v3.3.5 — anonymous Pollinations allows ~1 reply / 30s per IP (FREE_LIMIT):
        // wait the full window (or the Retry-After hint) instead of a short backoff
        let waitMs = attempt * 1500
        let maxAttempts = 3
        if (isPollinations && res.status === 402) {
          const rm = /retry after (\d+)\s*s/i.exec(terr || '')
          waitMs = Math.max(rm ? (parseInt(rm[1], 10) * 1000 + 1200) : 0, 31000)
          maxAttempts = 4
        }
        if (retryable && attempt <= maxAttempts) { await new Promise(r => setTimeout(r, waitMs)); continue }
        throw new Error(`OpenAI ${res.status}: ${terr.slice(0, 200)}`)
      }
      if (stream && onChunk && res.body) {
        const reader = res.body.getReader(); const dec = new TextDecoder(); let full = ''; let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() || ''
          for (let line of lines) {
            line = line.trim()
            if (!line.startsWith('data: ')) continue
            if (line.includes('[DONE]')) continue
            try { const obj = JSON.parse(line.slice(6)); const delta = obj.choices?.[0]?.delta?.content || ''; if (delta) { full += delta; onChunk(delta) } } catch {}
          }
        }
        return full
      }
      const data = await res.json()
      return data.choices?.[0]?.message?.content || ''
    } finally { clearTimeout(timer) }
  }

  if (provider === 'zai') {
    // Z.ai (GLM) - OpenAI-compatible API
    // v3.3.5 — only honor a z.ai-looking baseUrl; stored configs may still point at another provider's URL
    const base = /z\.ai/i.test(String(baseUrl || '')) ? normBase(baseUrl) : 'https://api.z.ai/api/paas/v4'
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    const ctl   = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 120000)
    try {
      let res
      const useModel = model || 'glm-4.7-flash'
      for (let attempt = 1; ; attempt++) {
        res = await fetch(`${base}/chat/completions`, {
          method:  'POST',
          headers,
          body:    JSON.stringify({ model: useModel, messages, stream }),
          signal:  ctl.signal
        })
        if (res.ok) break
        const terr = await res.text().catch(() => '')
        const retryable = (res.status === 429 || res.status >= 500)
        if (retryable && attempt <= 3) { await new Promise(r => setTimeout(r, attempt * 1500)); continue }
        throw new Error(`Z.ai ${res.status}: ${terr.slice(0, 200)}`)
      }
      if (stream && onChunk && res.body) {
        const reader = res.body.getReader(); const dec = new TextDecoder(); let full = ''; let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() || ''
          for (let line of lines) {
            line = line.trim()
            if (!line.startsWith('data: ')) continue
            if (line.includes('[DONE]')) continue
            try { const obj = JSON.parse(line.slice(6)); const delta = obj.choices?.[0]?.delta?.content || ''; if (delta) { full += delta; onChunk(delta) } } catch {}
          }
        }
        return full
      }
      const data = await res.json()
      return data.choices?.[0]?.message?.content || ''
    } finally { clearTimeout(timer) }
  }

  if (provider === 'gemini') {
    const gemModel = model || 'gemini-1.5-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${gemModel}:generateContent?key=${apiKey}`
    const gemMsgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    const body    = { contents: gemMsgs }
    const sysmsg  = messages.find(m => m.role === 'system')
    if (sysmsg) body.system_instruction = { parts: [{ text: sysmsg.content }] }
    const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`) }
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  if (provider === 'ollama') {
    const base = (baseUrl || 'http://localhost:11434').replace(/\/$/, '')
    const res  = await fetch(`${base}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({ model: model || 'llama3.2', messages, stream: false })
    })
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Ollama ${res.status}: ${t.slice(0, 200)}`) }
    const data = await res.json()
    return data.message?.content || ''
  }

  throw new Error(`Unknown AI provider: ${provider}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Alert Engine
// ─────────────────────────────────────────────────────────────────────────────
function checkAlerts(deviceId, stats) {
  if (!stats || !db) return
  try {
    const rules = db.prepare("SELECT * FROM alert_rules WHERE enabled=1 AND (device_id IS NULL OR device_id=?)").all(deviceId)
    const now   = new Date().toISOString()
    for (const rule of rules) {
      let triggered = false; let value = null
      if (rule.type === 'cpu_high'  && stats.cpuPercent  != null) { triggered = stats.cpuPercent  >= rule.threshold; value = Math.round(stats.cpuPercent)  }
      if (rule.type === 'ram_high'  && stats.ramPercent  != null) { triggered = stats.ramPercent  >= rule.threshold; value = Math.round(stats.ramPercent)  }
      if (rule.type === 'disk_high' && stats.diskPercent != null) { triggered = stats.diskPercent >= rule.threshold; value = Math.round(stats.diskPercent) }
      if (!triggered) continue
      if (rule.last_fired_at && Date.now() - new Date(rule.last_fired_at).getTime() < rule.cooldown_min * 60000) continue
      db.prepare("UPDATE alert_rules SET last_fired_at=? WHERE id=?").run(now, rule.id)
      const device     = db.prepare("SELECT name FROM devices WHERE id=?").get(deviceId)
      const deviceName = device?.name || deviceId
      const alertMsg   = `🚨 ${deviceName}: ${rule.type} = ${value}% (حد: ${rule.threshold}%)`
      broadcastToClients({ type: 'alert:triggered', payload: { ruleId: rule.id, deviceId, deviceName, type: rule.type, value, threshold: rule.threshold, message: alertMsg } })
      addNotification({ userId: rule.user_id, deviceId, type: rule.type, title: deviceName + ' — ' + rule.type, message: alertMsg, severity: value >= 90 ? 'critical' : 'warning' })
      if (rule.channel === 'webhook' && rule.webhook_url) {
        fetch(rule.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: alertMsg, device: deviceName, type: rule.type, value, threshold: rule.threshold, timestamp: now }) }).catch(() => {})
      }
    }
  } catch {}
}

function fireOfflineAlerts(deviceId) {
  if (!db) return
  try {
    const rules = db.prepare("SELECT * FROM alert_rules WHERE enabled=1 AND type='device_offline' AND (device_id IS NULL OR device_id=?)").all(deviceId)
    const now = new Date().toISOString()
    const device = db.prepare("SELECT name FROM devices WHERE id=?").get(deviceId)
    const deviceName = device?.name || deviceId
    for (const rule of rules) {
      if (rule.last_fired_at && Date.now() - new Date(rule.last_fired_at).getTime() < rule.cooldown_min * 60000) continue
      db.prepare("UPDATE alert_rules SET last_fired_at=? WHERE id=?").run(now, rule.id)
      const msg = `📴 جهاز غير متصل: ${deviceName}`
            try { telegramEvent('offline', msg) } catch {}
broadcastToClients({ type: 'alert:triggered', payload: { ruleId: rule.id, deviceId, deviceName, type: 'device_offline', message: msg } })
      addNotification({ userId: rule.user_id, deviceId, type: 'device_offline', title: deviceName, message: msg, severity: 'warning' })
      if (rule.channel === 'webhook' && rule.webhook_url) {
        fetch(rule.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: msg, device: deviceName, type: 'device_offline', timestamp: now }) }).catch(() => {})
      }
    }
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
function fireOnlineAlerts(deviceId) {
  if (!db) return
  try {
    const rules = db.prepare("SELECT * FROM alert_rules WHERE enabled=1 AND type='device_online' AND (device_id IS NULL OR device_id=?)").all(deviceId)
    const now = new Date().toISOString()
    const device = db.prepare("SELECT name FROM devices WHERE id=?").get(deviceId)
    const deviceName = (device && device.name) || deviceId
    for (const rule of rules) {
      if (rule.last_fired_at && Date.now() - new Date(rule.last_fired_at).getTime() < rule.cooldown_min * 60000) continue
      db.prepare("UPDATE alert_rules SET last_fired_at=? WHERE id=?").run(now, rule.id)
      const msg = '✅ جهاز متصل: ' + deviceName
            try { telegramEvent('online', msg) } catch {}
broadcastToClients({ type: 'alert:triggered', payload: { ruleId: rule.id, deviceId, deviceName, type: 'device_online', message: msg } })
      addNotification({ userId: rule.user_id, deviceId, type: 'device_online', title: deviceName, message: msg, severity: 'info' })
    }
  } catch {}
}

// ── Telegram notifications (v3.3.0) ─────────────────────────────────────────
function getTelegramConfig() {
  try {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('telegramToken','telegramChatId','telegramEnabled','telegramEvents')").all()
    const m = {}
    for (const r of rows) m[r.key] = parseJson(r.value, r.value)
    const enabled = (m.telegramEnabled === true || m.telegramEnabled === 'true' || m.telegramEnabled === 1 || m.telegramEnabled === '1')
    return {
      token: String(m.telegramToken || ''),
      chatId: String(m.telegramChatId || ''),
      enabled,
      events: (m.telegramEvents && typeof m.telegramEvents === 'object') ? m.telegramEvents : { online: true, offline: true, chat: true }
    }
  } catch { return { token: '', chatId: '', enabled: false, events: {} } }
}
async function sendTelegramRaw(token, chatId, text) {
  try {
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3900), disable_web_page_preview: true })
    })
    return res.ok
  } catch { return false }
}
async function telegramEvent(kind, text) {
  try {
    const c = getTelegramConfig()
    if (!c.enabled || !c.token || !c.chatId) return false
    if (c.events && c.events[kind] === false) return false
    return sendTelegramRaw(c.token, c.chatId, text)
  } catch { return false }
}

// 8b. Screen session management — interactive relay (v3.2 dashboard protocol)
// ─────────────────────────────────────────────────────────────────────────────
// Screen video is deliberately sent as "latest frame wins". Android/JPEG
// capture can produce frames faster than a browser can decode (especially at
// 1600x720 / 30 fps), and naively calling ws.send() for every frame makes the
// TCP buffer grow without bound. That is what turns a short network hiccup into
// 10+ seconds of drift. A per-viewer frame pump bounds the queue and preserves
// current video instead of replaying stale frames.
const SCREEN_FRAME_INTERVAL_MS = 33
const SCREEN_FRAME_MAX_BUFFER = 512 * 1024

function flushScreenFrame(vws, st) {
  st.timer = null
  if (!st.packet || !vws || vws.readyState !== 1) { st.packet = null; return }
  if (vws.bufferedAmount > SCREEN_FRAME_MAX_BUFFER) {
    st.timer = setTimeout(() => flushScreenFrame(vws, st), 50)
    return
  }
  const packet = st.packet
  st.packet = null
  st.pendingFull = false
  st.lastSent = Date.now()
  try { vws.send(packet) } catch {}
}

// 3.9.2 — إطار كامل (flags bit0) معلّق لا يُستبدل بدلتا أحدث: الأبعاد والمفتاح
// كانا يُفقدان عند التدوير فتبقى اللوحة بمقاسها القديم (شاشة سوداء).
function isFullFramePacket(packet) {
  try { if (Buffer.isBuffer(packet) && packet.length >= 13) return (packet[12] & 1) !== 0 } catch {}
  return false
}

function queueScreenFrame(vws, packet) {
  if (!vws || vws.readyState !== 1) return
  let st = vws._screenFrameState
  if (!st) { st = { packet: null, timer: null, lastSent: 0, pendingFull: false }; vws._screenFrameState = st }
  const full = isFullFramePacket(packet)
  // انتظار إطار كامل قيد الإرسال: أسقط الدلتا، ولا تُسقط الإطار الكامل.
  if (st.packet && st.pendingFull && !full) return
  st.packet = packet
  st.pendingFull = full
  if (st.timer) return
  const wait = Math.max(0, SCREEN_FRAME_INTERVAL_MS - (Date.now() - st.lastSent))
  st.timer = setTimeout(() => flushScreenFrame(vws, st), wait)
}

function clearScreenFrameState(vws) {
  const st = vws && vws._screenFrameState
  if (!st) return
  if (st.timer) clearTimeout(st.timer)
  st.timer = null; st.packet = null; st.pendingFull = false
  try { delete vws._screenFrameState } catch {}
}

// v3.8.2 - viewers that asked for JSON (?binary=0) still need the frame as
// JSON+base64. Re-encode it from the compact binary packet on demand.
function screenFrameJsonFromPacket(packet) {
  try {
    const flags   = packet[12]
    const isDelta = (flags & 2) !== 0
    const width   = packet.readUInt32BE(0)
    const height  = packet.readUInt32BE(4)
    const seq     = packet.readUInt32BE(8)
    const dx      = isDelta ? packet.readUInt32BE(13) : 0
    const dy      = isDelta ? packet.readUInt32BE(17) : 0
    const img     = packet.slice(isDelta ? 21 : 13)
    return JSON.stringify({
      type: 'screen:frame',
      payload: {
        data: img.toString('base64'),
        width, height, seq,
        keyframe: (flags & 1) !== 0,
        webp: (flags & 4) !== 0,
        deltaRegion: isDelta ? { x: dx, y: dy } : null,
        rxTs: Date.now()
      },
      timestamp: Date.now()
    })
  } catch { return null }
}

function sendToScreenViewers(deviceId, obj) {
  const viewers = screenViewers.get(deviceId)
  if (!viewers) return
  const s = JSON.stringify(obj)
  const isFrame = obj && obj.type === 'screen:frame'
  for (const vws of viewers) {
    try {
      if (vws.readyState !== 1) continue
      if (isFrame) queueScreenFrame(vws, s)
      else vws.send(s)
    } catch {}
  }
}

// ── v3.8.36 (R8) — clipboard sync, one direction at a time ─────────────────
// "to-device" pushes what the viewer copies to the remote machine. "to-viewer"
// pulls remote clipboard changes to the viewer. The reverse key flips it; the
// opposite direction is dropped and counted, so a session can never leak both ways.
const CLIPBOARD_SYNC_MAX = 64 * 1024

function clipboardState(deviceId) {
  let s = clipboardSync.get(deviceId)
  if (!s) {
    s = {
      enabled: false, direction: 'to-device', lastHash: '', lastLen: 0, lastAt: 0,
      sent: 0, received: 0, blocked: 0, duplicates: 0, updatedAt: 0, by: '', agentWatching: false,
      lastReason: ''
    }
    clipboardSync.set(deviceId, s)
  }
  return s
}

function clipboardPublic(s) {
  return {
    enabled: !!s.enabled,
    direction: s.direction === 'to-viewer' ? 'to-viewer' : 'to-device',
    lastHash: s.lastHash ? s.lastHash.slice(0, 12) : '',
    lastLen: s.lastLen || 0,
    lastAt: s.lastAt || 0,
    sent: s.sent || 0,
    received: s.received || 0,
    blocked: s.blocked || 0,
    duplicates: s.duplicates || 0,
    agentWatching: !!s.agentWatching,
    lastReason: s.lastReason || '',
    updatedAt: s.updatedAt || 0,
    by: s.by || ''
  }
}

function clipboardHash(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex')
}

function clipboardBroadcast(deviceId, extra) {
  const payload = clipboardPublic(clipboardState(deviceId))
  sendToScreenViewers(deviceId, { type: 'screen:clipboard_sync', payload: extra ? Object.assign(payload, extra) : payload })
}

function clipboardTellAgent(deviceId) {
  const s = clipboardState(deviceId)
  const rec = agentSockets.get(deviceId)
  if (!rec) { s.agentWatching = false; return false }
  sendJson(rec.ws, {
    type: 'server:screen_clipboard_watch',
    payload: { sessionId: deviceScreenSess.get(deviceId) || '', enabled: !!s.enabled, direction: s.direction },
    timestamp: Date.now()
  })
  return true
}

function clipboardSet(deviceId, patch, actor) {
  const s = clipboardState(deviceId)
  const prevEnabled = !!s.enabled
  const prevDirection = s.direction
  if (patch && patch.enabled !== undefined) s.enabled = !!patch.enabled
  if (patch && (patch.direction === 'to-device' || patch.direction === 'to-viewer')) s.direction = patch.direction
  // A new direction (or a fresh enable) starts with a clean slate: the first
  // change the agent reports is the current clipboard, not an echo of our write.
  if (!prevEnabled || prevDirection !== s.direction) { s.lastHash = ''; s.lastLen = 0; s.duplicates = s.duplicates || 0 }
  if (!s.enabled) { s.lastHash = ''; s.lastLen = 0; s.agentWatching = false; s.lastReason = '' }
  s.updatedAt = Date.now()
  s.by = String(actor || '').slice(0, 120)
  clipboardTellAgent(deviceId)
  clipboardBroadcast(deviceId)
  return s
}

function clipboardStop(deviceId, reason) {
  const s = clipboardState(deviceId)
  if (!s.enabled && !s.agentWatching) return
  s.enabled = false
  s.lastHash = ''
  s.lastLen = 0
  s.agentWatching = false
  s.updatedAt = Date.now()
  s.by = String(reason || 'session-ended').slice(0, 120)
  clipboardTellAgent(deviceId)
  clipboardBroadcast(deviceId)
}

function pushChatHistory(deviceId, msg) {
  if (!deviceId || !msg || !msg.text) return
  if (!chatHistoryByDevice.has(deviceId)) chatHistoryByDevice.set(deviceId, [])
  const arr = chatHistoryByDevice.get(deviceId)
  arr.push(msg)
  if (arr.length > 300) arr.splice(0, arr.length - 300)
}

function broadcastViewerCount(session) {
  const s = JSON.stringify({ type: 'screen:viewer_count', payload: { count: session.viewers.size } })
  for (const vws of session.viewers) { try { if (vws.readyState === 1) vws.send(s) } catch {} }
}

function clearConnectTimer(session) {
  if (session && session.connectTimer) { clearTimeout(session.connectTimer); session.connectTimer = null }
}

// Resolve an agent-reported session id to a live server-side session.
// v3.2.x agents can report a stale id — fall back to the device’s active session.
function resolveScreenSession(deviceId, key) {
  let sid     = key || null
  let session = sid ? screenSessions.get(sid) : null
  if (!session) {
    const active = deviceScreenSess.get(deviceId)
    if (active) { sid = active; session = screenSessions.get(sid) }
  }
  return { sid, session }
}

function leaveScreenSession(sessionId, socket) {
  const session = screenSessions.get(sessionId)
  if (!session) return
  if (socket) session.viewers.delete(socket)
  else session.viewers.clear()

  const set = screenViewers.get(session.deviceId)
  if (set) {
    if (socket) { set.delete(socket); clearScreenFrameState(socket) }
    else { for (const vws of set) clearScreenFrameState(vws); set.clear() }
    if (!set.size) screenViewers.delete(session.deviceId)
  }

  if (session.viewers.size === 0) {
    // v3.5 — grace period: opening a standalone window or reconnecting creates
    // a short gap with zero viewers. Do not kill MediaProjection (Android's
    // consent token is single-use) on the first gap.
    clearConnectTimer(session)
    if (session.stopTimer) clearTimeout(session.stopTimer)
    session.stopTimer = setTimeout(() => {
      const s2 = screenSessions.get(sessionId)
      if (!s2 || s2.viewers.size > 0) return
      const rec = agentSockets.get(s2.deviceId)
      if (rec) sendJson(rec.ws, { type: 'server:screen_stop', payload: { sessionId }, timestamp: Date.now() })
      try { dbLogSessionEnd(s2.dbId) } catch {}
      try { finalizeScreenRecording(s2.deviceId) } catch {}
      try { clipboardStop(s2.deviceId, 'session-ended') } catch {}
      screenSessions.delete(sessionId)
      if (deviceScreenSess.get(s2.deviceId) === sessionId) deviceScreenSess.delete(s2.deviceId)
    }, 6000)
  } else {
    broadcastViewerCount(session)
  }
}

function closeScreenSession(sessionId, errMsg) {
  const session = screenSessions.get(sessionId)
  if (!session) return
  clearConnectTimer(session)
  if (session.stopTimer) { clearTimeout(session.stopTimer); session.stopTimer = null }
  for (const vws of session.viewers) {
    clearScreenFrameState(vws)
    try {
      if (vws.readyState === 1) {
        if (errMsg) vws.send(JSON.stringify({ type: 'screen:error', payload: { message: errMsg } }))
        vws.close()
      }
    } catch {}
  }
  try { dbLogSessionEnd(session.dbId) } catch {}
  try { finalizeScreenRecording(session.deviceId) } catch {}
  try { clipboardStop(session.deviceId, 'session-closed') } catch {}
  screenSessions.delete(sessionId)
  if (deviceScreenSess.get(session.deviceId) === sessionId) deviceScreenSess.delete(session.deviceId)
  screenViewers.delete(session.deviceId)
  lastFullFrameByDevice.delete(session.deviceId)
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. WebSocket — Agent
// ─────────────────────────────────────────────────────────────────────────────
function handleAgentWs(socket) {
  let deviceId   = null
  let registered = false
  let hbCount    = 0

  const PING_MS = 15000; const PONG_MS = 12000
  let pingTimer = null; let pongTimer = null
  // Sockets that never register (e.g. unauthenticated probes) are dropped.
  const regTimer = setTimeout(() => { if (!registered) { try { socket.close() } catch {} } }, 10000)

  function schedulePing() {
    clearTimeout(pingTimer)
    pingTimer = setTimeout(() => {
      if (socket.readyState !== 1) return
      pongTimer = setTimeout(() => { socket.terminate() }, PONG_MS)
      try { socket.ping() } catch {}
      sendJson(socket, { type: 'server:ping', payload: {}, timestamp: Date.now() })
    }, PING_MS)
  }

  socket.on('pong', () => { clearTimeout(pongTimer); pongTimer = null; schedulePing() })

  socket.on('message', (raw, isBinary) => {
    if (isBinary) {
      if (!deviceId) return
      // v3.1+ binary frame from the agent:
      //   [0x01][sessionId:36B][width:4B][height:4B][seq:4B][flags:1B][JPEG...]
      // Forwarded to dashboard viewers as:
      //   [width:4B][height:4B][seq:4B][flags:1B][JPEG...]
      try {
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
        if (buf.length < 50 || buf[0] !== 0x01) return

        const embeddedId = buf.slice(1, 37).toString('utf8').replace(/\0/g, '')
        const width  = buf.readUInt32BE(37)
        const height = buf.readUInt32BE(41)
        const seq    = buf.readUInt32BE(45)
        const flags  = buf[49]
        // v3.3.2 — delta frames: flags bit1 set, x/y stored after the 50-byte base header
        const isDelta = ((flags & 2) !== 0) && buf.length >= 58
        const dx = isDelta ? buf.readUInt32BE(50) : 0
        const dy = isDelta ? buf.readUInt32BE(54) : 0
        const jpeg = buf.slice(isDelta ? 58 : 50)

        const { session } = resolveScreenSession(deviceId, embeddedId)
        if (!session) return
        clearConnectTimer(session)

        const header = Buffer.allocUnsafe(isDelta ? 21 : 13)
        header.writeUInt32BE(width,  0)
        header.writeUInt32BE(height, 4)
        header.writeUInt32BE(seq,    8)
        header[12] = flags
        if (isDelta) { header.writeUInt32BE(dx, 13); header.writeUInt32BE(dy, 17) }
        if (!isDelta) { try { recordScreenFrame(deviceId, jpeg) } catch {} }   // v3.3.2: record full frames only
        if (!isDelta) lastFullFrameByDevice.set(deviceId, { packet: Buffer.concat([header, jpeg]) })
        const packet  = Buffer.concat([header, jpeg])
        const viewers = screenViewers.get(deviceId)
        if (viewers) {
          let legacyJson = null
          for (const vws of viewers) {
            try {
              if (vws.readyState !== 1) continue
              if (vws._binaryFrames) {
                queueScreenFrame(vws, packet)
              } else {
                if (!legacyJson) legacyJson = screenFrameJsonFromPacket(packet)
                if (legacyJson) queueScreenFrame(vws, legacyJson)
              }
            } catch {}
          }
        }
      } catch {}
      return
    }

    let msg; try { msg = JSON.parse(raw) } catch { return }
    const { type, payload = {} } = msg
    clearTimeout(pongTimer); pongTimer = null
    schedulePing()

    if (type === 'agent:register') {
      const { token, info, capabilities } = payload
      const device = db.prepare("SELECT * FROM devices WHERE token=?").get(token)
      if (!device) { sendJson(socket, { type: 'server:error', payload: { message: 'Invalid token' } }); socket.close(); return }
      if (device.status === 'blocked') { sendJson(socket, { type: 'server:error', payload: { message: 'Device blocked by administrator' } }); socket.close(); return }
      deviceId = device.id; registered = true
      clearTimeout(regTimer)
      const prevDeviceStatus = device.status
      markDeviceOnline(deviceId, info)
      if (prevDeviceStatus !== 'online') fireOnlineAlerts(deviceId)
      if (capabilities) db.prepare("UPDATE devices SET capabilities=? WHERE id=?").run(JSON.stringify(capabilities), deviceId)
      const prevAgent = agentSockets.get(deviceId)
      if (prevAgent && prevAgent.ws && prevAgent.ws !== socket) {
        try { prevAgent.ws.close(4000, 'replaced by newer agent connection') } catch {}
      }
      agentSockets.set(deviceId, { ws: socket, info, deviceName: device.name, connectedAt: Date.now(), stats: null })
      // R4 — عودة الوكيل داخل مهلة السماح تُستأنف بها جلسته بدل إغلاقها.
      try { relayResumeForDevice(deviceId) } catch {}
      try {
        const plat = (info && info.platform) || 'unknown'
        const addr = (socket._socket && socket._socket.remoteAddress) || '?'
        console.log(`🟢 [agent] connected name="${device.name}" platform=${plat} ip=${addr} id=${String(deviceId).slice(0, 8)}`)
        serverLogger?.info('agent', `connected name="${device.name}" platform=${plat} ip=${addr} id=${String(deviceId).slice(0, 8)}`)
      } catch {}
      sendJson(socket, { type: 'server:registered', payload: { deviceId, name: device.name } })
      broadcastToClients({ type: 'device:status', payload: { deviceId, status: 'online', name: device.name, info } })
      events.emit('device:connected', deviceId, device.name)
      schedulePing()
      return
    }

    if (!registered) { socket.close(); return }

    // ── R4 — Relay: قرار الطرف الهدف، ثم hello وتمرير الحزم ──────────────────
    if (type === 'session:accept' || type === 'session:deny') {
      const s = relayGet(payload.sessionId)
      if (!s || s.target.deviceId !== deviceId) {
        sendJson(socket, { type: 'session:error', payload: { sessionId: payload.sessionId, code: 'not_target' } })
        return
      }
      const res = relayDecide(s, type === 'session:accept', payload.reason, 'device:' + String(deviceId).slice(0, 8))
      if (!res.ok) {
        sendJson(socket, { type: 'session:error', payload: { sessionId: payload.sessionId, code: res.code, state: res.state } })
      } else {
        sendJson(socket, { type: 'session:decision_result', payload: { sessionId: s.id, state: res.state, tokenExpiresAt: res.tokenExpiresAt || null } })
      }
      return
    }

    if (type === 'relay:hello') {
      const s = relayGet(payload.sessionId)
      const res = relayHello(s, deviceId, payload.token)
      if (!res.ok) {
        sendJson(socket, { type: 'session:error', payload: { sessionId: payload.sessionId, code: res.code, state: res.state } })
        return
      }
      const peerId = s.requester.deviceId === deviceId ? s.target.deviceId : s.requester.deviceId
      sendJson(socket, { type: 'session:ready', payload: { sessionId: s.id, access: s.access, channels: RELAY_CHANNELS.slice(), peerDeviceId: peerId, peerOnline: agentSockets.has(peerId) } })
      return
    }

    if (type === 'relay:data') {
      const s = relayGet(payload.sessionId)
      const res = relayForward(s, deviceId, String(payload.channel || 'control'), payload.data)
      if (!res.ok) sendJson(socket, { type: 'session:error', payload: { sessionId: payload.sessionId, code: res.code } })
      return
    }

    if (type === 'session:close' || type === 'relay:close') {
      const s = relayGet(payload.sessionId)
      if (!s || (s.requester.deviceId !== deviceId && s.target.deviceId !== deviceId)) {
        sendJson(socket, { type: 'session:error', payload: { sessionId: payload.sessionId, code: 'not_party' } })
        return
      }
      relayCloseSession(s, payload.reason || 'user')
      return
    }


    if (type === 'agent:capabilities_update') {
      try {
        if (payload.capabilities) db.prepare("UPDATE devices SET capabilities=? WHERE id=?").run(JSON.stringify(payload.capabilities), deviceId)
      } catch {}
      return
    }

    if (type === 'agent:heartbeat') {
      // v3.8.21 - an Android agent in Doze can be slow to answer a protocol ping, but it
      // still sends heartbeats. Treat a heartbeat as proof of life: otherwise the socket
      // is terminated 12s after the first missed pong, which is the "disconnects when I
      // stop using it" symptom.
      clearTimeout(pongTimer); pongTimer = null; schedulePing()
      const { stats } = payload
      markDeviceOnline(deviceId, null)
      const rec = agentSockets.get(deviceId)
      // Ignore heartbeats from a replaced connection; otherwise stale stats can overwrite live stats.
      if (rec && rec.ws === socket && stats) rec.stats = stats
      sendJson(socket, { type: 'server:pong', payload: {} })
      broadcastToClients({ type: 'device:heartbeat', payload: { deviceId, stats } })
      if (stats) {
        hbCount++
        if (hbCount % 3 === 0) {
          try {
            db.prepare("INSERT INTO stats_history (device_id, cpu_percent, ram_percent, disk_percent, net_in_kb, net_out_kb) VALUES (?,?,?,?,?,?)")
              .run(deviceId, stats.cpuPercent || 0, stats.ramPercent || 0, stats.diskPercent || 0, stats.netInKb || 0, stats.netOutKb || 0)
          } catch {}
        }
        checkAlerts(deviceId, stats)
      }
      return
    }

    if (type === 'agent:pong') { clearTimeout(pongTimer); pongTimer = null; schedulePing(); return }

    if (type === 'agent:command_result') {
      const cp = payload && payload.commandId ? pendingCommands.get(payload.commandId) : null
      if (cp) { clearTimeout(cp.timer); pendingCommands.delete(payload.commandId); cp.resolve(payload) }
      broadcastToClients({ type: 'agent:command_result', payload: { ...payload, deviceId } })
      return
    }

    if (type === 'agent:pty_output') {
      const { sessionId, data } = payload
      broadcastToClients({ type: 'agent:pty_output', payload: { deviceId, sessionId, data } })
      const set = ptyClients.get(sessionId)
      if (set) for (const vws of set) { sendJson(vws, { type: 'pty_output', data }); sendJson(vws, { type: 'pty:data', payload: { data } }) }
      return
    }

    if (type === 'agent:pty_opened') {
      const set = ptyClients.get(payload.sessionId)
      if (set) for (const vws of set) sendJson(vws, { type: 'pty:connected', payload: { sessionId: payload.sessionId } })
      return
    }

    if (type === 'agent:pty_closed') {
      const set = ptyClients.get(payload.sessionId)
      if (set) for (const vws of set) sendJson(vws, { type: 'pty:closed', payload: { sessionId: payload.sessionId } })
      return
    }

    if (type === 'agent:audio_chunk') {
      const data = Buffer.from(String(payload.data || ''), 'base64')
      if (data.length) {
        sendToScreenViewers(deviceId, {
          type: 'screen:audio',
          payload: { data: payload.data, seq: payload.seq || 0, format: payload.format || 'webm', sampleRate: payload.sampleRate || 0, channels: payload.channels || 0 },
          timestamp: Date.now()
        })
        recordAudioChunk(deviceId, data, payload.format || 'webm')
      }
      return
    }

    if (type === 'agent:audio_status') {
      sendToScreenViewers(deviceId, { type: 'screen:audio_status', payload, timestamp: Date.now() })
      return
    }

    if (type === 'agent:screen_frame') {
      const { session } = resolveScreenSession(deviceId, payload.sessionId)
      if (!session) return
      clearConnectTimer(session)
      if (!payload.deltaRegion) { try { recordScreenFrame(deviceId, Buffer.from(String(payload.data || ''), 'base64')) } catch {} }
      const frameObj = {
        type: 'screen:frame',
        payload: {
          data:        payload.data,
          width:       payload.width,
          height:      payload.height,
          seq:         payload.seq,
          keyframe:    payload.keyframe,
          quality:     payload.quality,
          deltaRegion: payload.deltaRegion,
          ts: payload.ts,
          rxTs: Date.now()
        },
        timestamp: Date.now()
      }
      if (!payload.deltaRegion) lastFullFrameByDevice.set(deviceId, { json: JSON.stringify(frameObj) })
      sendToScreenViewers(deviceId, frameObj)
      return
    }

    if (type === 'agent:screen_closed') {
      const { sid, session } = resolveScreenSession(deviceId, payload.sessionId)
      if (session) {
        sendToScreenViewers(deviceId, { type: 'screen:closed', payload: {} })
        clearConnectTimer(session)
        screenSessions.delete(sid)
        if (deviceScreenSess.get(deviceId) === sid) deviceScreenSess.delete(deviceId)
        lastFullFrameByDevice.delete(deviceId)
      }
      return
    }

    if (type === 'agent:screen_error' || type === 'agent:screen_unavailable') {
      const { sid, session } = resolveScreenSession(deviceId, payload.sessionId)
      if (session) {
        sendToScreenViewers(deviceId, {
          type:  type === 'agent:screen_error' ? 'screen:error' : 'screen:unavailable',
          payload: { message: payload.message || '' }
        })
        closeScreenSession(sid, null)
      }
      return
    }

    if (type === 'agent:screen_control_granted' || type === 'agent:screen_control_denied') {
      sendToScreenViewers(deviceId, {
        type:    type === 'agent:screen_control_granted' ? 'screen:control_granted' : 'screen:control_denied',
        payload: { requestId: payload.requestId, reason: payload.reason || undefined },
        timestamp: Date.now()
      })
      return
    }

    if (type === 'agent:screen_brightness_status') {
      sendToScreenViewers(deviceId, { type: 'screen:brightness_status', payload, timestamp: Date.now() })
      return
    }

    if (type === 'agent:screen_display_state') {
      sendToScreenViewers(deviceId, { type: 'screen:display_state', payload, timestamp: Date.now() })
      return
    }

    if (type === 'agent:screen_rotate_result') {
      sendToScreenViewers(deviceId, { type: 'screen:rotate_result', payload, timestamp: Date.now() })
      return
    }

    if (type === 'agent:screen_rotate_status') {
      sendToScreenViewers(deviceId, { type: 'screen:rotate_status', payload, timestamp: Date.now() })
      return
    }

    if (type === 'agent:screen_state') {
      sendToScreenViewers(deviceId, { type: 'screen:state', payload, timestamp: Date.now() })
      return
    }

    if (type === 'agent:screen_resolutions') {
      sendToScreenViewers(deviceId, { type: 'screen:resolutions', payload: { modes: payload.modes || [], current: payload.current || '', error: payload.error || '' }, timestamp: Date.now() })
      return
    }

    if (type === 'agent:screen_resolution_applied') {
      sendToScreenViewers(deviceId, { type: 'screen:resolution_applied', payload: { ok: !!payload.ok, width: payload.width, height: payload.height, current: payload.current || '', result: payload.result || '', error: payload.error || '' }, timestamp: Date.now() })
      return
    }

    if (type === 'agent:screen_monitors') {
      sendToScreenViewers(deviceId, { type: 'screen:monitors', payload: { monitors: payload.monitors } })
      return
    }

    if (type === 'agent:screen_clipboard_watch_ack') {
      const s = clipboardState(deviceId)
      s.agentWatching = !!payload.watching
      s.lastReason = s.agentWatching ? '' : String(payload.reason || 'unknown').slice(0, 40)
      if (payload.direction === 'to-device' || payload.direction === 'to-viewer') s.direction = payload.direction
      clipboardBroadcast(deviceId)
      return
    }

    if (type === 'agent:screen_clipboard_change') {
      const s = clipboardState(deviceId)
      const clipText = typeof payload.text === 'string' ? payload.text : ''
      const hash = payload.hash || clipboardHash(clipText)
      if (!s.enabled || s.direction !== 'to-viewer') {
        s.blocked++
        return
      }
      if (!clipText || hash === s.lastHash) { s.duplicates++; return }
      s.lastHash = hash
      s.lastLen = clipText.length
      s.lastAt = Date.now()
      s.received++
      sendToScreenViewers(deviceId, { type: 'screen:clipboard_apply', payload: { text: clipText, hash: hash.slice(0, 12), len: clipText.length, at: s.lastAt } })
      clipboardBroadcast(deviceId)
      return
    }

    if (type === 'agent:screen_clipboard') {
      sendToScreenViewers(deviceId, { type: 'screen:clipboard', payload: { text: payload.text } })
      return
    }

    if (type === 'agent:screen_chat') {
      try {
        const agName = (agentSockets.get(deviceId) || {}).deviceName || deviceId
        telegramEvent('chat', 'رسالة من ' + agName + ': ' + String(payload.text || '').slice(0, 300))
      } catch {}
      const chatMsg = { text: payload.text, sender: payload.sender || 'host', ts: payload.ts || Date.now() }
      pushChatHistory(deviceId, chatMsg)
      sendToScreenViewers(deviceId, { type: 'screen:chat', payload: chatMsg })
      return
    }

    if (type && type.startsWith('agent:ft_')) {
      try { fileTransfers && fileTransfers.handleAgentMessage(type, payload, deviceId) } catch {}
      return
    }

    if (type === 'agent:fs_chunk') {
      const st = pendingFsStreams.get(payload.opId)
      if (!st) return
      try {
        const seq = Number(payload.seq) || 0
        if (payload.data) st.buffer.set(seq, Buffer.from(String(payload.data), 'base64'))
        while (st.buffer.has(st.next)) {
          const buf = st.buffer.get(st.next)
          st.buffer.delete(st.next)
          st.next++
          if (buf.length) st.res.write(buf)
        }
        if (payload.done) {
          clearTimeout(st.timer)
          pendingFsStreams.delete(payload.opId)
          st.res.end()
          st.resolve({ ok: true, bytes: st.bytes })
        }
      } catch (e) {
        clearTimeout(st.timer)
        pendingFsStreams.delete(payload.opId)
        try { st.res.destroy() } catch {}
        st.reject(e)
      }
      return
    }

    if (type === 'agent:fs_response') {
      const { requestId, data, error } = payload
      const pending = pendingFsRequests.get(requestId)
      if (pending) { clearTimeout(pending.timer); pendingFsRequests.delete(requestId); error ? pending.reject(new Error(error)) : pending.resolve(data) }
      const st = pendingFsStreams.get(requestId)
      if (st) {
        clearTimeout(st.timer)
        pendingFsStreams.delete(requestId)
        try { st.res.destroy() } catch {}
        if (error) st.reject(new Error(error)); else st.resolve({ ok: true })
      }
      return
    }
  })

  socket.on('close', () => {
    clearTimeout(pingTimer); clearTimeout(pongTimer); clearTimeout(regTimer)
    if (deviceId) {
      const sid = deviceScreenSess.get(deviceId)
      if (sid) closeScreenSession(sid, 'الجهاز انقطع اتصاله / Device disconnected')
      try {
        const rec = agentSockets.get(deviceId)
        const up = rec ? Math.round((Date.now() - rec.connectedAt) / 1000) : -1
        console.log(`🔴 [agent] disconnected name="${rec ? rec.deviceName : String(deviceId).slice(0, 8)}" after=${up}s`)
        serverLogger?.warn('agent', `disconnected name="${rec ? rec.deviceName : String(deviceId).slice(0, 8)}" after=${up}s`)
      } catch {}
      agentSockets.delete(deviceId); markDeviceOffline(deviceId); fireOfflineAlerts(deviceId)
      try { fileTransfers && fileTransfers.onDeviceOffline(deviceId) } catch {}
      // R4 — لا تُغلق فوراً: مهلة سماح واحدة ثم إغلاق بسبب network.
      try { relaySuspendForDevice(deviceId) } catch {}
    }
  })
  socket.on('error', () => {})
}

// ─────────────────────────────────────────────────────────────────────────────
// R4 — جلسات وكيل‑بوكيل عبر Relay (سيرفر وسيط، بلا منفذ وارد)
// ─────────────────────────────────────────────────────────────────────────────
// آلة الحالة: requested → accepted → active → closed، ومسارات رفض/انتهاء:
// requested → denied | expired. لا انتقال ضمني: كل انتقال يمرّ بدالة واحدة.
const RELAY_MAX_SESSIONS   = Math.max(1, parseInt(process.env.RELAY_MAX_SESSIONS || '20', 10) || 20)
const RELAY_OFFER_TTL_MS   = Math.max(5000, parseInt(process.env.RELAY_OFFER_TTL_MS || '60000', 10) || 60000)
const RELAY_TOKEN_TTL_MS   = Math.max(5000, parseInt(process.env.RELAY_TOKEN_TTL_MS || '90000', 10) || 90000)
const RELAY_SESSION_KBPS   = Math.max(16, parseInt(process.env.RELAY_SESSION_KBPS || '2048', 10) || 2048)
const RELAY_CHANNELS       = ['screen', 'control', 'files', 'chat']
const RELAY_ACCESS_CAPABILITY = { view: null, control: 'control', files: 'files' }
const SESSION_VIEW_TTL_MS = Math.max(10000, parseInt(process.env.SESSION_VIEW_TTL_MS || '60000', 10) || 60000)
// 3.9.1 — مفتاح إعادة الاتصال يعيش عمر الجلسة (12h سقفاً)، ويُبطل عند الإغلاق.
const SESSION_VIEW_KEY_TTL_MS = Math.max(60000, parseInt(process.env.SESSION_VIEW_KEY_TTL_MS || '43200000', 10) || 43200000)
const SESSION_VIEW_ACCESS_LABEL = { view: 'عرض فقط', control: 'تحكم كامل', files: 'ملفات' }
const RELAY_ACTIVE_STATES  = ['requested', 'accepted', 'active', 'suspended']
const RELAY_RECONNECT_GRACE_MS = Math.max(0, parseInt(process.env.RELAY_RECONNECT_GRACE_MS || '15000', 10) || 0)
const relaySessions = new Map()   // sessionId → session object (ذاكرة؛ الحالة الدائمة في sessions/audit_log)

function relayGet(sessionId) { return sessionId ? (relaySessions.get(String(sessionId)) || null) : null }

function relayActiveCount() {
  let n = 0
  for (const s of relaySessions.values()) if (RELAY_ACTIVE_STATES.includes(s.state)) n++
  return n
}

function relaySendToDevice(deviceId, obj) {
  if (!deviceId) return false
  const rec = agentSockets.get(deviceId)
  if (!rec || !rec.ws || rec.ws.readyState !== 1) return false
  try { sendJson(rec.ws, obj); return true } catch { return false }
}

function relayBroadcastState(session) {
  try {
    broadcastToClients({
      type: 'session:state',
      payload: {
        sessionId: session.id, state: session.state, access: session.access,
        targetDeviceId: session.target.deviceId, targetName: session.target.name,
        requesterDeviceId: session.requester.deviceId, requesterName: session.requester.name,
        reason: session.reason || null, createdAt: session.createdAt,
      },
    })
  } catch {}
}

function relayPruneLater(session, ms) {
  const t = setTimeout(() => { if (relaySessions.get(session.id) === session) relaySessions.delete(session.id) }, ms)
  if (t.unref) t.unref()
}

// إغلاق واحد لكل الأسباب: طرف، مهلة، شبكة، أو سياسة.
function relayCloseSession(session, reason, actorUserId) {
  if (!session || session.state === 'closed') return false
  // الجلسة المعلّقة (suspended) أُسِّست فعلاً: إغلاقها يبلّغ الطرفين ويُدقَّق.
  const wasEstablished = session.state === 'active' || session.state === 'suspended'
  const wasPending = session.state === 'requested' || session.state === 'accepted'
  session.state = 'closed'
  session.closedAt = Date.now()
  session.reason = String(reason || 'user')
  try { sessionViewRevoke(session.id) } catch {}
  if (session.offerTimer) { clearTimeout(session.offerTimer); session.offerTimer = null }
  if (session.suspendTimer) { clearTimeout(session.suspendTimer); session.suspendTimer = null }
  if (wasEstablished || wasPending) {
    relaySendToDevice(session.requester.deviceId, { type: 'session:close', payload: { sessionId: session.id, reason: session.reason } })
    relaySendToDevice(session.target.deviceId, { type: 'session:close', payload: { sessionId: session.id, reason: session.reason } })
  }
  if (wasEstablished) {
    try {
      db.prepare("UPDATE sessions SET ended_at=datetime('now'), duration_sec=CAST((julianday('now')-julianday(started_at))*86400 AS INTEGER), metadata=? WHERE id=?")
        .run(JSON.stringify({ state: 'closed', reason: session.reason, access: session.access, bytesIn: session.bytesIn, bytesOut: session.bytesOut }), session.id)
    } catch {}
    dbLogAudit({
      userId: actorUserId || session.requester.userId || '', userEmail: session.requester.email || '',
      deviceId: session.target.deviceId, action: 'session_closed',
      details: { sessionId: session.id, reason: session.reason, durationMs: session.closedAt - (session.acceptedAt || session.createdAt), bytesIn: session.bytesIn, bytesOut: session.bytesOut },
      ipAddress: null,
    })
  }
  relayBroadcastState(session)
  relayPruneLater(session, 5 * 60 * 1000)
  return true
}

// 3.9.2 (H2) — إغلاق كل جلسات طرف أُزيل (مستخدم محذوف/دوره تغيّر، أو جهاز محذوف).
function relayCloseForPrincipal(target) {
  const t = target || {}
  let closed = 0
  for (const s of relaySessions.values()) {
    if (!RELAY_ACTIVE_STATES.includes(s.state)) continue
    const byDevice = t.deviceId && (s.target.deviceId === t.deviceId || s.requester.deviceId === t.deviceId)
    const byUser = t.userId && (s.requester.userId === t.userId || s.target.ownerId === t.userId)
    if (!byDevice && !byUser) continue
    try { relayCloseSession(s, 'principal_removed', t.actorUserId || 'system'); closed++ } catch {}
  }
  return closed
}

// ── 3.9.0 — تذكرة عرض الجلسة (view ticket) ──────────────────────────────────
// 32 bytes, hash-only storage, one-time for /screen, bound to (session, device, access).
function sessionViewIssue(session, deviceId, access) {
  const raw = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const expiresAt = new Date(Date.now() + SESSION_VIEW_TTL_MS).toISOString()
  const id = uuidv4()
  db.prepare('INSERT INTO session_view_tickets (id, session_id, device_id, access, token_hash, expires_at) VALUES (?,?,?,?,?,?)')
    .run(id, session.id, deviceId, access, hash, expiresAt)
  const viewUrl = '/view/' + session.target.deviceId + '?rt=' + raw + '&access=' + encodeURIComponent(access)
  dbLogAudit({
    userId: session.requester.userId || '', userEmail: session.requester.email || '',
    deviceId: session.target.deviceId, action: 'session_view_ticket_issued',
    details: { sessionId: session.id, ticketId: id, access }, ipAddress: null,
  })
  return { ticketId: id, ticket: raw, viewUrl, expiresAt }
}

// 3.9.1 — مفتاح إعادة الاتصال (resume key): مستقل عن تذكرة الفتح الأولى،
// مخزّن مجزّأً (SHA-256 فقط)، صالح لعمر الجلسة، مقيّد بـ(session, device, access).
function sessionViewIssueKey(session, deviceId, access) {
  const raw = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const id = uuidv4()
  const expiresAt = new Date(Date.now() + SESSION_VIEW_KEY_TTL_MS).toISOString()
  // مفتاح نشط واحد لكل جلسة: إبطال السابق يمنع تراكم مفاتيح صالحة.
  try { db.prepare('UPDATE session_view_keys SET revoked_at=? WHERE session_id=? AND revoked_at IS NULL').run(new Date().toISOString(), session.id) } catch {}
  db.prepare('INSERT INTO session_view_keys (id, session_id, device_id, access, token_hash, expires_at) VALUES (?,?,?,?,?,?)')
    .run(id, session.id, deviceId, access, hash, expiresAt)
  dbLogAudit({
    userId: session.requester.userId || '', userEmail: session.requester.email || '',
    deviceId: session.target.deviceId, action: 'session_view_key_issued',
    details: { sessionId: session.id, keyId: id, access }, ipAddress: null,
  })
  return { keyId: id, resumeKey: raw, keyExpiresAt: expiresAt }
}

// يُصدر التذكرة (مرة واحدة) + مفتاح الإعادة معاً، ويعيد رابطاً واحداً يحملهما.
function sessionViewGrant(session, deviceId, access) {
  const ticket = sessionViewIssue(session, deviceId, access)
  const key = sessionViewIssueKey(session, deviceId, access)
  // 3.9.2 (H1) — مفتاح الإعادة في fragment: لا يُرسل إلى السيرفر ولا يظهر في سجلاته.
  const viewUrl = '/view/' + session.target.deviceId + '?rt=' + ticket.ticket + '&access=' + encodeURIComponent(access) + '#rk=' + key.resumeKey
  return { ...ticket, ...key, viewUrl }
}

function sessionViewResolveKey(raw, opts) {
  const options = opts || {}
  const value = String(raw || '')
  if (!value) return { ok: false, code: 'resume_required' }
  const hash = crypto.createHash('sha256').update(value).digest('hex')
  let row = null
  try { row = db.prepare('SELECT * FROM session_view_keys WHERE token_hash=?').get(hash) } catch { row = null }
  if (!row) return { ok: false, code: 'resume_invalid' }
  try {
    const a = Buffer.from(hash, 'hex'); const b = Buffer.from(String(row.token_hash), 'hex')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, code: 'resume_invalid' }
  } catch { return { ok: false, code: 'resume_invalid' } }
  if (row.revoked_at) return { ok: false, code: 'resume_revoked', row }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return { ok: false, code: 'resume_expired', row }
  if (options.deviceId && String(row.device_id) !== String(options.deviceId)) return { ok: false, code: 'resume_wrong_device', row }
  const session = relayGet(row.session_id)
  if (!session || (session.state !== 'active' && session.state !== 'suspended')) return { ok: false, code: 'session_not_active', row }
  try { db.prepare('UPDATE session_view_keys SET last_used_at=?, uses=uses+1 WHERE id=?').run(new Date().toISOString(), row.id) } catch {}
  return { ok: true, row, session }
}

// مسار /screen الموحّد: تذكرة الفتح أولاً (تُستهلك مرة واحدة)، ثم مفتاح الإعادة.
function sessionViewAuthorize(q) {
  const query = q || {}
  const rt = String(query.rt || '')
  const rk = String(query.rk || '')
  if (!rt && !rk) return { ok: false, code: 'ticket_required' }
  let first = null
  if (rt) {
    first = sessionViewResolve(rt, { forWs: true, deviceId: query.deviceId })
    if (first.ok) return { ok: true, mode: 'ticket', row: first.row, session: first.session }
  }
  if (rk) {
    const resumed = sessionViewResolveKey(rk, { deviceId: query.deviceId })
    if (resumed.ok) return { ok: true, mode: 'resume', row: resumed.row, session: resumed.session }
    return { ok: false, code: resumed.code, row: resumed.row, session: null, firstCode: first ? first.code : null }
  }
  return { ok: false, code: first ? first.code : 'ticket_required', row: first && first.row, session: first && first.session }
}

function sessionViewResolve(raw, opts) {
  const options = opts || {}
  const value = String(raw || '')
  if (!value) return { ok: false, code: 'ticket_required' }
  const hash = crypto.createHash('sha256').update(value).digest('hex')
  let row = null
  try { row = db.prepare('SELECT * FROM session_view_tickets WHERE token_hash=?').get(hash) } catch { row = null }
  if (!row) return { ok: false, code: 'ticket_invalid' }
  try {
    const a = Buffer.from(hash, 'hex'); const b = Buffer.from(String(row.token_hash), 'hex')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, code: 'ticket_invalid' }
  } catch { return { ok: false, code: 'ticket_invalid' } }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return { ok: false, code: 'ticket_expired', row }
  if (options.forWs && row.consumed_at) return { ok: false, code: 'ticket_reused', row }
  if (options.deviceId && String(row.device_id) !== String(options.deviceId)) return { ok: false, code: 'ticket_wrong_device', row }
  const session = relayGet(row.session_id)
  if (!session || (session.state !== 'active' && session.state !== 'suspended')) return { ok: false, code: 'session_not_active', row }
  if (String(session.target.deviceId) !== String(row.device_id) && options.expectDevice && String(options.expectDevice) !== String(row.device_id)) {
    return { ok: false, code: 'ticket_wrong_device', row }
  }
  return { ok: true, row, session }
}

function sessionViewConsume(row) {
  try { db.prepare('UPDATE session_view_tickets SET consumed_at=? WHERE id=? AND consumed_at IS NULL').run(new Date().toISOString(), row.id) } catch {}
}

function sessionViewRevoke(sessionId) {
  try { db.prepare('UPDATE session_view_tickets SET expires_at=? WHERE session_id=?').run(new Date(0).toISOString(), sessionId) } catch {}
  // 3.9.1 — إغلاق الجلسة يُبطل مفتاح الإعادة أيضاً (لا فتح بعد الإغلاق).
  try { db.prepare('UPDATE session_view_keys SET revoked_at=? WHERE session_id=? AND revoked_at IS NULL').run(new Date().toISOString(), sessionId) } catch {}
}

// جهاز مصادق بـX-Device-Token (بدل JWT) — principal مقصور على مالك الجهاز.
function devicePrincipal(req) {
  const dt = String((req.headers && req.headers['x-device-token']) || '')
  if (!dt) return null
  try {
    const dev = db.prepare('SELECT * FROM devices WHERE token=?').get(dt)
    if (!dev) return null
    if (dev.status === 'blocked') return null
    return {
      userId: dev.owner_id || 'device', email: (dev.name || 'device') + '@device',
      role: 'device', deviceId: dev.id, ownerId: dev.owner_id || null, isDevice: true,
    }
  } catch { return null }
}

function relayAuth(req, reply) {
  const token = extractBearer(req)
  if (token) {
    try { return verifyToken(token) } catch { reply.code(401).send({ error: 'Invalid token' }); return null }
  }
  const dev = devicePrincipal(req)
  if (dev) return dev
  reply.code(401).send({ error: 'Unauthorized' })
  return null
}

function sessionPasswordCheck(target, rawPassword) {
  const row = unattendedRow(target.id)
  if (!row || !row.enabled) return { required: false, ok: true }
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return { required: true, ok: false, code: 'password_locked', retryAfterMs: new Date(row.locked_until).getTime() - Date.now() }
  }
  const password = String(rawPassword || '')
  if (!password) return { required: true, ok: false, code: 'password_required' }
  let valid = false
  try { valid = bcrypt.compareSync(password, String(row.password_hash || '')) } catch { valid = false }
  if (valid) {
    try { db.prepare('UPDATE device_unattended SET failed_count=0, locked_until=NULL, last_success_at=?, updated_at=datetime(\'now\') WHERE device_id=?').run(new Date().toISOString(), target.id) } catch {}
    return { required: true, ok: true }
  }
  const failed = (Number(row.failed_count) || 0) + 1
  if (failed >= 5) {
    const until = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    try { db.prepare('UPDATE device_unattended SET failed_count=?, locked_until=?, last_failed_at=?, updated_at=datetime(\'now\') WHERE device_id=?').run(failed, until, new Date().toISOString(), target.id) } catch {}
    dbLogAudit({ deviceId: target.id, action: 'session_password_locked', details: { attempts: failed, lockMs: 300000 }, ipAddress: null })
    return { required: true, ok: false, code: 'password_locked', retryAfterMs: 300000 }
  }
  try { db.prepare('UPDATE device_unattended SET failed_count=?, last_failed_at=?, updated_at=datetime(\'now\') WHERE device_id=?').run(failed, new Date().toISOString(), target.id) } catch {}
  dbLogAudit({ deviceId: target.id, action: 'session_password_failed', details: { attempts: failed }, ipAddress: null })
  return { required: true, ok: false, code: 'bad_password', attemptsLeft: 5 - failed }
}

function relayIssueToken(session) {
  const raw = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const expiresAt = new Date(Date.now() + RELAY_TOKEN_TTL_MS).toISOString()
  try {
    db.prepare('INSERT INTO session_tokens (token_hash, session_id, device_id, requester_user_id, capabilities, access, expires_at) VALUES (?,?,?,?,?,?,?)')
      .run(hash, session.id, session.target.deviceId, session.requester.userId || '', JSON.stringify(session.capabilities), session.access, expiresAt)
  } catch {}
  session.tokenHash = hash
  session.tokenExpiresAt = expiresAt
  session.tokenUses = {}
  return raw
}

// قرار الطرف الهدف: accept يصدر الرمز وينقل الحالة إلى active، وdeny يغلق الطلب.
function relayDecide(session, accept, reason, decider) {
  if (!session) return { ok: false, code: 'unknown_session' }
  if (session.state !== 'requested') return { ok: false, code: 'not_pending', state: session.state }
  if (session.offerTimer) { clearTimeout(session.offerTimer); session.offerTimer = null }
  if (!accept) {
    session.state = 'denied'
    session.reason = String(reason || 'denied')
    relaySendToDevice(session.requester.deviceId, { type: 'session:denied', payload: { sessionId: session.id, reason: session.reason } })
    dbLogAudit({
      userId: session.requester.userId || '', userEmail: session.requester.email || '',
      deviceId: session.target.deviceId, action: 'session_denied',
      details: { sessionId: session.id, reason: session.reason, decider: decider || null }, ipAddress: null,
    })
    relayBroadcastState(session)
    relayPruneLater(session, 60000)
    return { ok: true, state: 'denied', reason: session.reason }
  }
  const token = relayIssueToken(session)
  session.state = 'active'
  session.acceptedAt = Date.now()
  try {
    db.prepare('INSERT INTO sessions (id, device_id, user_id, type, metadata) VALUES (?,?,?,?,?)')
      .run(session.id, session.target.deviceId, session.requester.userId || '', 'relay', JSON.stringify({ access: session.access, requesterDeviceId: session.requester.deviceId, state: 'active' }))
  } catch {}
  const payload = {
    sessionId: session.id, access: session.access, token, tokenExpiresAt: session.tokenExpiresAt,
    requesterDeviceId: session.requester.deviceId, targetDeviceId: session.target.deviceId, channels: RELAY_CHANNELS.slice(),
  }
  relaySendToDevice(session.target.deviceId, { type: 'session:token', payload })
  relaySendToDevice(session.requester.deviceId, { type: 'session:token', payload })
  // 3.9.0 — تذكرة العرض تُصدر بعد accept فقط، وتُرسل للطالب.
  if (session.requester.deviceId) {
    try {
      const vt = sessionViewGrant(session, session.target.deviceId, session.access)
      session.viewTicket = vt
      relaySendToDevice(session.requester.deviceId, {
        type: 'session:ticket',
        payload: { sessionId: session.id, viewUrl: vt.viewUrl, ticket: vt.ticket, expiresAt: vt.expiresAt, access: session.access, resumeKey: vt.resumeKey, resumeUrl: vt.viewUrl, keyExpiresAt: vt.keyExpiresAt },
      })
    } catch (e) {
      dbLogAudit({ userId: session.requester.userId || '', userEmail: session.requester.email || '', deviceId: session.target.deviceId, action: 'session_view_ticket_failed', details: { sessionId: session.id, error: String(e && e.message || e) }, ipAddress: null })
    }
  }
  dbLogAudit({
    userId: session.requester.userId || '', userEmail: session.requester.email || '',
    deviceId: session.target.deviceId, action: 'session_accepted',
    details: { sessionId: session.id, access: session.access, decider: decider || null }, ipAddress: null,
  })
  relayBroadcastState(session)
  return { ok: true, state: 'active', token, tokenExpiresAt: session.tokenExpiresAt }
}

// hello: يربط المقبس بالجلسة. الرمز يُستهلك مرة واحدة لكل طرف، ويُرفض من أي طرف ثالث.
function relayHello(session, deviceId, rawToken) {
  if (!session) return { ok: false, code: 'unknown_session' }
  if (session.state !== 'active') return { ok: false, code: 'not_active', state: session.state }
  if (deviceId !== session.requester.deviceId && deviceId !== session.target.deviceId) return { ok: false, code: 'not_party' }
  if (session.tokenUses && session.tokenUses[deviceId]) {
    return { ok: true, rejoin: true }
  }
  const raw = String(rawToken || '')
  if (!raw) return { ok: false, code: 'token_required' }
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  if (hash !== session.tokenHash) {
    dbLogAudit({ userId: session.requester.userId || '', userEmail: session.requester.email || '', deviceId: session.target.deviceId, action: 'session_token_rejected', details: { sessionId: session.id, reason: 'mismatch', by: deviceId }, ipAddress: null })
    return { ok: false, code: 'bad_token' }
  }
  if (!session.tokenExpiresAt || new Date(session.tokenExpiresAt).getTime() < Date.now()) {
    dbLogAudit({ userId: session.requester.userId || '', userEmail: session.requester.email || '', deviceId: session.target.deviceId, action: 'session_token_rejected', details: { sessionId: session.id, reason: 'expired', by: deviceId }, ipAddress: null })
    return { ok: false, code: 'token_expired' }
  }
  const uses = Object.keys(session.tokenUses || {})
  if (uses.length >= 2 && !session.tokenUses[deviceId]) {
    dbLogAudit({ userId: session.requester.userId || '', userEmail: session.requester.email || '', deviceId: session.target.deviceId, action: 'session_token_rejected', details: { sessionId: session.id, reason: 'consumed', by: deviceId }, ipAddress: null })
    return { ok: false, code: 'token_consumed' }
  }
  session.tokenUses = session.tokenUses || {}
  session.tokenUses[deviceId] = Date.now()
  try { db.prepare('UPDATE session_tokens SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL').run(new Date().toISOString(), hash) } catch {}
  return { ok: true, firstUse: true }
}

// حارس نطاق لكل جلسة: نافذة ثانية متحركة.
function relayChargeBandwidth(session, bytes) {
  const now = Date.now()
  if (now - session.windowStart >= 1000) { session.windowStart = now; session.windowBytes = 0 }
  session.windowBytes += bytes
  if (session.windowBytes > RELAY_SESSION_KBPS * 1024) {
    session.droppedBytes = (session.droppedBytes || 0) + bytes
    if (now - (session.throttleAt || 0) > 1000) {
      session.throttleAt = now
      relaySendToDevice(session.requester.deviceId, { type: 'session:throttled', payload: { sessionId: session.id, limitKbps: RELAY_SESSION_KBPS } })
      relaySendToDevice(session.target.deviceId, { type: 'session:throttled', payload: { sessionId: session.id, limitKbps: RELAY_SESSION_KBPS } })
    }
    return false
  }
  return true
}

function relayForward(session, fromDeviceId, channel, data) {
  if (!session || session.state !== 'active') return { ok: false, code: 'not_active' }
  const isRequester = fromDeviceId === session.requester.deviceId
  const isTarget = fromDeviceId === session.target.deviceId
  if (!isRequester && !isTarget) return { ok: false, code: 'not_party' }
  if (!session.tokenUses || !session.tokenUses[fromDeviceId]) return { ok: false, code: 'hello_required' }
  if (!RELAY_CHANNELS.includes(channel)) return { ok: false, code: 'bad_channel' }
  const text = typeof data === 'string' ? data : JSON.stringify(data == null ? null : data)
  const bytes = Buffer.byteLength(text, 'utf8')
  if (!relayChargeBandwidth(session, bytes)) return { ok: false, code: 'throttled' }
  const toDeviceId = isRequester ? session.target.deviceId : session.requester.deviceId
  if (isRequester) session.bytesIn += bytes; else session.bytesOut += bytes
  const delivered = relaySendToDevice(toDeviceId, {
    type: 'relay:data',
    payload: { sessionId: session.id, channel, from: fromDeviceId, data },
    timestamp: Date.now(),
  })
  if (!delivered) { session.droppedBytes = (session.droppedBytes || 0) + bytes; return { ok: false, code: 'peer_offline' } }
  return { ok: true, delivered: true, bytes }
}


function relayCloseForDevice(deviceId, reason) {
  if (!deviceId) return 0
  let n = 0
  for (const s of relaySessions.values()) {
    if (s.state === 'closed') continue
    if (s.requester.deviceId === deviceId || s.target.deviceId === deviceId) {
      if (relayCloseSession(s, reason)) n++
    }
  }
  return n
}
// ── R4 (تكملة) — مهلة سماح للانقطاع العابر (`suspended`) ─────────────────────
// عند سقوط مقبس أحد الطرفين لا تُغلق الجلسة فوراً: تنتقل إلى `suspended` لمهلة
// واحدة، فإن عاد الوكيل بنفس الجهاز استُؤنفت الجلسة برمز جديد؛ وإلا أُغلقت بـnetwork.
function relaySuspendForDevice(deviceId) {
  if (!deviceId) return 0
  let n = 0
  for (const s of relaySessions.values()) {
    if (s.requester.deviceId !== deviceId && s.target.deviceId !== deviceId) continue
    if (s.state === 'requested' || s.state === 'accepted') { relayCloseSession(s, 'network'); n++; continue }
    if (s.state !== 'active') continue
    s.state = 'suspended'
    s.suspendedAt = Date.now()
    const peerId = s.requester.deviceId === deviceId ? s.target.deviceId : s.requester.deviceId
    relaySendToDevice(peerId, { type: 'session:suspended', payload: { sessionId: s.id, reason: 'network', graceMs: RELAY_RECONNECT_GRACE_MS } })
    dbLogAudit({
      userId: s.requester.userId || '', userEmail: s.requester.email || '', deviceId: s.target.deviceId,
      action: 'session_suspended', details: { sessionId: s.id, graceMs: RELAY_RECONNECT_GRACE_MS, lost: deviceId }, ipAddress: null,
    })
    relayBroadcastState(s)
    if (s.suspendTimer) clearTimeout(s.suspendTimer)
    const snap = s
    s.suspendTimer = setTimeout(() => {
      if (snap.state !== 'suspended') return
      snap.suspendTimer = null
      relayCloseSession(snap, 'network')
    }, RELAY_RECONNECT_GRACE_MS)
    if (s.suspendTimer && s.suspendTimer.unref) s.suspendTimer.unref()
    n++
  }
  return n
}

function relayResumeForDevice(deviceId) {
  if (!deviceId) return 0
  let n = 0
  for (const s of relaySessions.values()) {
    if (s.state !== 'suspended') continue
    if (s.requester.deviceId !== deviceId && s.target.deviceId !== deviceId) continue
    if (s.suspendTimer) { clearTimeout(s.suspendTimer); s.suspendTimer = null }
    s.state = 'active'
    s.resumedAt = Date.now()
    // الرمز القديم قد يكون انتهت صلاحيته أثناء الغياب — يُصدر رمز جديد للطرفين.
    const token = relayIssueToken(s)
    const payload = {
      sessionId: s.id, access: s.access, token, tokenExpiresAt: s.tokenExpiresAt,
      requesterDeviceId: s.requester.deviceId, targetDeviceId: s.target.deviceId,
      channels: RELAY_CHANNELS.slice(), resumed: true,
    }
    relaySendToDevice(s.requester.deviceId, { type: 'session:token', payload })
    relaySendToDevice(s.target.deviceId, { type: 'session:token', payload })
    relaySendToDevice(s.requester.deviceId, { type: 'session:resumed', payload: { sessionId: s.id } })
    relaySendToDevice(s.target.deviceId, { type: 'session:resumed', payload: { sessionId: s.id } })
    dbLogAudit({
      userId: s.requester.userId || '', userEmail: s.requester.email || '', deviceId: s.target.deviceId,
      action: 'session_resumed', details: { sessionId: s.id, suspendedMs: Date.now() - (s.suspendedAt || Date.now()) }, ipAddress: null,
    })
    relayBroadcastState(s)
    n++
  }
  return n
}

// 10. WebSocket — Dashboard Client
// ─────────────────────────────────────────────────────────────────────────────
function handleClientWs(socket, user) {
  clientSockets.set(socket, { user })

  // v3.2.1 hardening — non-admins only receive their own devices
  // R3-2 — الأجهزة المرئية: المملوكة + الممنوحة بقدرة + جهاز الرمز غير المراقب
  const devices = accessibleDeviceRows(user)
  const snapshot = devices.map(d => ({
    ...d, info: parseJson(d.info), tags: parseJson(d.tags, []),
    capabilities: parseJson(d.capabilities, {}), isOnline: agentSockets.has(d.id),
    stats: agentSockets.get(d.id)?.stats || null,
  }))
  sendJson(socket, { type: 'server:snapshot', payload: { devices: snapshot } })

  socket.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw) } catch { return }
    const { type, payload = {} } = msg

    if (type === 'client:command') {
      const { deviceId, command, cmdType = 'shell', sessionId } = payload
      const commandId = uuidv4()
      if (!hasDeviceCapability(user, deviceId, 'control')) { auditCapabilityDenied(user, deviceId, 'control', { via: 'ws' }); sendJson(socket, { type: 'agent:command_result', payload: { commandId, deviceId, error: 'غير مصرح بالوصول لهذا الجهاز' } }); return }
      const rec = agentSockets.get(deviceId)
      if (!rec) { sendJson(socket, { type: 'agent:command_result', payload: { commandId, deviceId, error: 'Device offline' } }); return }
      sendJson(rec.ws, { type: 'server:command', payload: { commandId, type: cmdType, command, sessionId } })
      return
    }
    if (type === 'client:screen_start') {
      const { deviceId, fps = 10, quality = 60, maxWidth = 1280, sessionId } = payload
      if (!hasDeviceCapability(user, deviceId, 'control')) { auditCapabilityDenied(user, deviceId, 'control', { via: 'ws' }); sendJson(socket, { type: 'screen:error', payload: { message: 'غير مصرح بالوصول لهذا الجهاز' } }); return }
      const rec = agentSockets.get(deviceId)
      if (rec) sendJson(rec.ws, { type: 'server:screen_start', payload: { sessionId: sessionId || uuidv4(), fps, quality, maxWidth, binary: true } })
      return
    }
    if (type === 'client:screen_stop') {
      const { deviceId, sessionId } = payload
      if (!hasDeviceCapability(user, deviceId, 'control')) { auditCapabilityDenied(user, deviceId, 'control', { via: 'ws' }); return }
      const rec = agentSockets.get(deviceId)
      if (rec) sendJson(rec.ws, { type: 'server:screen_stop', payload: { sessionId } })
      return
    }
    if (type === 'client:screen_control') {
      const { deviceId, action, x, y, button, key, sessionId } = payload
      if (!hasDeviceCapability(user, deviceId, 'control')) { auditCapabilityDenied(user, deviceId, 'control', { via: 'ws' }); return }
      const rec = agentSockets.get(deviceId)
      if (rec) sendJson(rec.ws, { type: 'server:screen_control', payload: { action, x, y, button, key, sessionId } })
      return
    }
  })

  socket.on('close', () => { clientSockets.delete(socket) })
  socket.on('error', () => { clientSockets.delete(socket) })
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. WebSocket — PTY Terminal
// ─────────────────────────────────────────────────────────────────────────────
function handlePtyWs(socket, request, user) {
  const query     = request.query || {}
  let deviceId    = query.deviceId || null
  let sessionId   = query.sessionId || uuidv4()
  let started     = false
  let ptyDbId     = null

  function begin(dId, shellHint, rows, cols) {
    if (!dId) { try { socket.close() } catch {}; return }
    if (!hasDeviceCapability(user, dId, 'control')) { auditCapabilityDenied(user, dId, 'control', { via: 'pty' }); try { socket.close() } catch {}; return }
    if (started) return
    started = true; deviceId = dId
    if (!ptyClients.has(sessionId)) ptyClients.set(sessionId, new Set())
    ptyClients.get(sessionId).add(socket)
    try { ptyDbId = dbLogSessionStart((user && user.userId) || '', deviceId, 'shell') } catch {}
    const agentRec = agentSockets.get(deviceId)
    if (agentRec) {
      sendJson(agentRec.ws, { type: 'server:pty_start', payload: { sessionId, cols: cols || 80, rows: rows || 24, shell: shellHint || 'auto' } })
      if (rows || cols) sendJson(agentRec.ws, { type: 'server:pty_resize', payload: { sessionId, cols: cols || 80, rows: rows || 24 } })
      sendJson(socket, { type: 'pty_ready', sessionId })
      sendJson(socket, { type: 'pty:connected', payload: { sessionId } })
    } else {
      sendJson(socket, { type: 'pty:error', payload: { message: 'Device offline' } })
      sendJson(socket, { type: 'pty_error', error: 'Device offline' })
    }
  }

  function cleanup() {
    const set = ptyClients.get(sessionId)
    let last = false
    if (set) { set.delete(socket); if (!set.size) { ptyClients.delete(sessionId); last = true } }
    const rec = deviceId ? agentSockets.get(deviceId) : null
    if (rec && last) sendJson(rec.ws, { type: 'server:pty_stop', payload: { sessionId } })
    try { dbLogSessionEnd(ptyDbId) } catch {}
    ptyDbId = null
  }

  const connectTimeout = setTimeout(() => { if (!started) { try { socket.close() } catch {} } }, 15000)

  if (deviceId) { clearTimeout(connectTimeout); begin(deviceId, query.shell || 'auto', parseInt(query.rows) || 24, parseInt(query.cols) || 80) }

  socket.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw) } catch { return }
    const payload = msg.payload || {}

    if (msg.type === 'pty:connect' || msg.type === 'pty_connect') {
      clearTimeout(connectTimeout)
      if (payload.sessionId) sessionId = payload.sessionId
      begin(payload.deviceId || msg.deviceId || deviceId, payload.shell || msg.shell || 'auto', parseInt(payload.rows || msg.rows) || 24, parseInt(payload.cols || msg.cols) || 80)
      return
    }
    if (!started || !deviceId) return
    const rec = agentSockets.get(deviceId)
    if (!rec) {
      sendJson(socket, { type: 'pty:error', payload: { message: 'Device offline' } })
      sendJson(socket, { type: 'pty_error', error: 'Device offline' })
      return
    }
    if (msg.type === 'pty:data' || msg.type === 'pty:input' || msg.type === 'pty_input') {
      let data = (payload.data !== undefined ? payload.data : msg.data) || ''
      if (msg.type === 'pty:data') { try { data = Buffer.from(String(data), 'base64').toString('utf8') } catch {} }
      sendJson(rec.ws, { type: 'server:command', payload: { type: 'pty_input', data, sessionId } })
      return
    }
    if (msg.type === 'pty:resize') {
      const cols = parseInt(payload.cols || msg.cols) || 80
      const rows = parseInt(payload.rows || msg.rows) || 24
      sendJson(rec.ws, { type: 'server:pty_resize', payload: { sessionId, cols, rows } })
      return
    }
    if (msg.type === 'pty:disconnect' || msg.type === 'pty:stop') { cleanup(); try { socket.close() } catch {} }
  })

  socket.on('close', () => { clearTimeout(connectTimeout); cleanup() })
  socket.on('error', () => {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. WebSocket — Screen Viewer
// ─────────────────────────────────────────────────────────────────────────────
function handleScreenWs(socket, request, user) {
  const query    = request.query || {}
  const deviceId = query.deviceId
  if (!deviceId) { socket.close(); return }

  if (!(user && user.sessionId) && !hasDeviceCapability(user, deviceId, 'control')) {
    // v3.8.12 / R2 — كل محاولة وصول مرفوضة تُدقَّق (الخطة §9)
    dbLogAudit({
      userId: (user && user.userId) || '',
      userEmail: (user && user.email) || '',
      deviceId,
      action: 'screen_denied',
      details: { reason: 'not_authorized', capability: 'control' },
      ipAddress: request && request.socket ? request.socket.remoteAddress : null,
    })
    try { socket.send(JSON.stringify({ type: 'screen:error', payload: { message: 'غير مصرح بالوصول لهذا الجهاز' } })) } catch {}
    socket.close()
    return
  }

  const clamp = (n, lo, hi, dflt) => {
    const v = parseInt(n)
    return isNaN(v) ? dflt : Math.min(hi, Math.max(lo, v))
  }
  const fps      = clamp(query.fps,      1,   30,   20)
  const quality  = clamp(query.quality,  10,  95,   65)
  const maxWidth = clamp(query.maxWidth, 320, 1920, 1280)

  // v3.8.5 - binary packets stay the default (every dashboard before 3.8.2
  // expects the 13/21-byte header); ?binary=0 opts into JSON+base64 for callers
  // that cannot read binary frames. Resolved BEFORE the join branch: a late
  // viewer is served from the cached full frame, in the format it asked for.
  socket._binaryFrames = String(query.binary || '1') !== '0'

  if (!agentSockets.get(deviceId)) {
    try { socket.send(JSON.stringify({ type: 'screen:error', payload: { message: 'الجهاز غير متصل / Device is offline' } })) } catch {}
    socket.close()
    return
  }

  // ── Join an existing capture session, or start a new one ─────────────────
  let sessionId = deviceScreenSess.get(deviceId)
  let session   = sessionId ? screenSessions.get(sessionId) : null

  if (session) {
    if (session.stopTimer) { clearTimeout(session.stopTimer); session.stopTimer = null }
    session.viewers.add(socket)

    // The agent is already streaming and only sends deltas, so send this viewer
    // the last full frame now — otherwise it renders nothing (300x150 default
    // canvas) behind the buffering overlay.
    const cachedFrame = lastFullFrameByDevice.get(deviceId)
    if (cachedFrame && socket.readyState === 1) {
      try {
        if (cachedFrame.packet) {
          socket.send(socket._binaryFrames ? cachedFrame.packet : screenFrameJsonFromPacket(cachedFrame.packet))
        } else if (cachedFrame.json) socket.send(cachedFrame.json)
        console.log('🖥️  [screen] replayed full frame to late viewer device=' + String(deviceId).slice(0, 8))
      } catch {}
    }

    // v3.8.12 — الإطار المخزَّن قد يكون قديماً؛ نطلب من الوكيل إطاراً كاملاً فورياً.
    // بدونه يصبح الإطار الكامل الدوري (15s) مصدر الصورة الوحيد للملتحق الجديد.
    {
      const recAg = agentSockets.get(deviceId)
      if (recAg) {
        try {
          sendJson(recAg.ws, { type: 'server:force_keyframe', payload: { sessionId }, timestamp: Date.now() })
          console.log('🖥️  [screen] requested fresh keyframe for late viewer device=' + String(deviceId).slice(0, 8))
        } catch {}
      }
    }
  } else {
    sessionId = uuidv4()
    session   = { deviceId, viewers: new Set([socket]), startedAt: Date.now(), connectTimer: null, stopTimer: null, userId: (user && user.userId) || null, dbId: null }
    try { session.dbId = dbLogSessionStart((user && user.userId) || '', deviceId, 'screen') } catch {}
    screenSessions.set(sessionId, session)
    deviceScreenSess.set(deviceId, sessionId)

    const rec = agentSockets.get(deviceId)
    if (rec) sendJson(rec.ws, { type: 'server:screen_start', payload: { sessionId, fps, quality, maxWidth, binary: true }, timestamp: Date.now() })

    session.connectTimer = setTimeout(() => {
      try { if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'screen:error', payload: { message: 'Agent did not start screen capture — make sure the agent is v2.0.0+' } })) } catch {}
      leaveScreenSession(sessionId, socket)
    }, 60000)
  }

  // v3.8.2 - frame format flag; resolved above, before the join branch.
  if (!screenViewers.has(deviceId)) screenViewers.set(deviceId, new Set())
  screenViewers.get(deviceId).add(socket)

  // v3.5 — replay in-session chat so reopening the panel/window shows old messages
  try {
    const hist = chatHistoryByDevice.get(deviceId) || []
    if (hist.length) socket.send(JSON.stringify({ type: 'screen:chat_history', payload: { messages: hist.slice(-200) } }))
  } catch {}

  if (session.viewers.size > 1) {
    try { socket.send(JSON.stringify({ type: 'screen:viewer_count', payload: { count: session.viewers.size } })) } catch {}
  }
  broadcastViewerCount(session)

  // ── Keep-alive (protocol ping) ───────────────────────────────────────────
  const keepAlive = setInterval(() => {
    try { if (socket.readyState === 1) socket.ping() } catch {}
  }, 15000)

  // ── Dashboard → agent relay ──────────────────────────────────────────────
  socket.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw) } catch { return }
    const payload = msg.payload || {}
    const rec = agentSockets.get(deviceId)
    if (!rec) return

    // v3.7.0 — viewer may watch, only manager/admin may act on the device
    const CONTROL = new Set(['screen:mouse_event', 'screen:key_event', 'screen:clipboard_write',
      'screen:clipboard_read', 'screen:privacy', 'screen:control_request', 'screen:rotate',
      'screen:rotate_auto', 'screen:brightness', 'screen:audio_control', 'screen:set_quality', 'screen:set_monitor',
      'screen:clipboard_sync_enable', 'screen:clipboard_sync_direction', 'screen:clipboard_sync_reverse', 'screen:clipboard_local'])
    if (CONTROL.has(msg.type) && user && user.sessionId && user.sessionAccess !== 'control') {
      try { socket.send(JSON.stringify({ type: 'screen:error', payload: { code: 'access_denied', message: 'هذه الجلسة للعرض فقط' } })) } catch {}
      dbLogAudit({ userId: (user && user.userId) || '', userEmail: (user && user.email) || '', deviceId, action: 'session_view_denied', details: { sessionId: user.sessionId, access: user.sessionAccess, attempted: msg.type }, ipAddress: null })
      return
    }
    if (CONTROL.has(msg.type) && !atLeast(user && user.role, 'manager')) {
      try { socket.send(JSON.stringify({ type: 'screen:error', payload: { message: 'صلاحية تحكم مطلوبة (manager) لهذا الإجراء' } })) } catch {}
      return
    }

    switch (msg.type) {
      case 'screen:mouse_event':
        sendJson(rec.ws, { type: 'server:screen_mouse', payload: { ...payload, sessionId }, timestamp: Date.now() })
        break
      case 'screen:key_event':
        sendJson(rec.ws, { type: 'server:screen_key', payload: { ...payload, sessionId }, timestamp: Date.now() })
        break
      case 'screen:set_quality':
        sendJson(rec.ws, {
          type: 'server:screen_start',
          payload: {
            sessionId,
            fps:      clamp(payload.fps,      1,   30,   fps),
            quality:  clamp(payload.quality,  10,  95,   quality),
            maxWidth: clamp(payload.maxWidth, 320, 1920, maxWidth),
            binary: true,
            monitorId: payload.monitorId || 0
          },
          timestamp: Date.now()
        })
        break
      case 'screen:set_monitor':
        sendJson(rec.ws, { type: 'server:screen_set_monitor', payload: { sessionId, monitorId: payload.monitorId || 0 }, timestamp: Date.now() })
        sendJson(rec.ws, { type: 'server:screen_start', payload: { sessionId, fps, quality, maxWidth, binary: true, monitorId: payload.monitorId || 0 }, timestamp: Date.now() })
        break
      case 'screen:get_resolutions':
        sendJson(rec.ws, { type: 'server:screen_get_resolutions', payload: { sessionId }, timestamp: Date.now() })
        break
      case 'screen:set_resolution':
        sendJson(rec.ws, { type: 'server:screen_set_resolution', payload: { sessionId, width: payload.width, height: payload.height }, timestamp: Date.now() })
        break
      case 'screen:get_monitors':
        sendJson(rec.ws, { type: 'server:screen_get_monitors', payload: { sessionId }, timestamp: Date.now() })
        break
      case 'screen:clipboard_read':
        sendJson(rec.ws, { type: 'server:screen_clipboard_read', payload: { sessionId }, timestamp: Date.now() })
        break
      case 'screen:clipboard_write': {
        const manualText = String(payload.text || '').slice(0, 100000)
        sendJson(rec.ws, { type: 'server:screen_clipboard_write', payload: { sessionId, text: manualText }, timestamp: Date.now() })
        const ms = clipboardState(deviceId)
        ms.lastHash = clipboardHash(manualText)
        ms.lastLen = manualText.length
        ms.lastAt = Date.now()
        break
      }

      case 'screen:clipboard_sync_state':
        sendJson(socket, { type: 'screen:clipboard_sync', payload: clipboardPublic(clipboardState(deviceId)) })
        break

      case 'screen:clipboard_sync_enable': {
        const want = !!payload.enabled
        if (want && !agentSockets.get(deviceId)) {
          sendJson(socket, { type: 'screen:error', payload: { message: 'الجهاز غير متصل' } })
          break
        }
        const s = clipboardSet(deviceId, { enabled: want }, (user && user.email) || '')
        dbLogAudit({ userId: (user && user.userId) || '', userEmail: (user && user.email) || '', deviceId, action: 'clipboard_sync_set', details: { enabled: s.enabled, direction: s.direction, via: 'ws' } })
        break
      }

      case 'screen:clipboard_sync_direction': {
        const dir = payload.direction === 'to-viewer' ? 'to-viewer' : 'to-device'
        const s = clipboardSet(deviceId, { direction: dir }, (user && user.email) || '')
        dbLogAudit({ userId: (user && user.userId) || '', userEmail: (user && user.email) || '', deviceId, action: 'clipboard_sync_direction', details: { direction: s.direction } })
        break
      }

      case 'screen:clipboard_sync_reverse': {
        const cur = clipboardState(deviceId).direction === 'to-viewer' ? 'to-device' : 'to-viewer'
        const s = clipboardSet(deviceId, { direction: cur }, (user && user.email) || '')
        dbLogAudit({ userId: (user && user.userId) || '', userEmail: (user && user.email) || '', deviceId, action: 'clipboard_sync_reverse', details: { direction: s.direction } })
        break
      }

      case 'screen:clipboard_local': {
        const s2 = clipboardState(deviceId)
        const localText = typeof payload.text === 'string' ? payload.text.slice(0, CLIPBOARD_SYNC_MAX) : ''
        if (!localText) break
        const localHash = clipboardHash(localText)
        if (!s2.enabled || s2.direction !== 'to-device') { s2.blocked++; clipboardBroadcast(deviceId, { lastBlocked: 'direction' }); break }
        if (!s2.agentWatching) { s2.blocked++; clipboardBroadcast(deviceId, { lastBlocked: 'no-consent' }); break }
        if (localHash === s2.lastHash) { s2.duplicates++; break }
        const rec2 = agentSockets.get(deviceId)
        if (!rec2) { s2.blocked++; break }
        s2.lastHash = localHash
        s2.lastLen = localText.length
        s2.lastAt = Date.now()
        s2.sent++
        sendJson(rec2.ws, { type: 'server:screen_clipboard_write', payload: { sessionId, text: localText }, timestamp: Date.now() })
        clipboardBroadcast(deviceId)
        break
      }
      case 'screen:privacy':
        sendJson(rec.ws, { type: 'server:screen_privacy', payload: { enable: !!payload.enable }, timestamp: Date.now() })
        break
      case 'screen:brightness':
        sendJson(rec.ws, { type: 'server:screen_brightness', payload: { sessionId, value: Math.max(0, Math.min(255, Number(payload.value) || 0)) }, timestamp: Date.now() })
        break
      case 'screen:display':
        sendJson(rec.ws, { type: 'server:screen_display', payload: { sessionId, off: !!payload.off }, timestamp: Date.now() })
        break
      case 'screen:rotate':
        sendJson(rec.ws, { type: 'server:screen_rotate', payload: { sessionId }, timestamp: Date.now() })
        break
      case 'screen:rotate_auto':
        sendJson(rec.ws, { type: 'server:screen_rotate_auto', payload: { sessionId, enabled: !!payload.enabled }, timestamp: Date.now() })
        break
      case 'screen:audio_control':
        sendJson(rec.ws, { type: 'server:audio_control', payload: { sessionId, enabled: !!payload.enabled }, timestamp: Date.now() })
        break
      case 'screen:request_control':
        sendJson(rec.ws, {
          type: 'server:screen_control_request',
          payload: { sessionId, requestId: payload.requestId || uuidv4(), requesterName: (user && user.email) || 'viewer', password: typeof payload.password === 'string' ? payload.password.slice(0, 128) : undefined },
          timestamp: Date.now()
        })
        break
      // ── v3.8.37 (R8.2) — laser / annotations ──────────────────────────────
      // Pure viewer-to-viewer relay: the agent is never involved, the remote
      // machine never sees a mark, and coordinates travel normalised (0..1) so
      // two viewers at different sizes draw on the same spot.
      case 'screen:annotate': {
        const tool = String(payload.tool || '').toLowerCase()
        if (tool !== 'laser' && tool !== 'pen' && tool !== 'clear') break
        const now = Date.now()
        if (!socket.__annoWin || now - socket.__annoWin > 1000) { socket.__annoWin = now; socket.__annoCount = 0 }
        if (++socket.__annoCount > 240) break
        const clamp01 = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0 }
        const phase = (payload.phase === 'start' || payload.phase === 'end') ? payload.phase : 'move'
        const out = tool === 'clear'
          ? { type: 'screen:annotate', payload: { tool: 'clear', at: now } }
          : {
              type: 'screen:annotate',
              payload: {
                tool, phase,
                id: typeof payload.id === 'string' ? payload.id.slice(0, 40) : '',
                x: clamp01(payload.x), y: clamp01(payload.y),
                color: typeof payload.color === 'string' ? payload.color.slice(0, 16) : '',
                at: now
              }
            }
        const encoded = JSON.stringify(out)
        try {
          for (const vws of session.viewers) {
            if (vws === socket) continue
            if (vws.readyState === 1) vws.send(encoded)
          }
        } catch {}
        metrics.annotationEvents++
        break
      }

      case 'screen:chat': {
        const chatMsg = { text: String(payload.text || '').slice(0, 2000), sender: 'viewer', ts: Date.now() }
        pushChatHistory(deviceId, chatMsg)
        sendJson(rec.ws, { type: 'server:screen_chat', payload: { sessionId, ...chatMsg }, timestamp: Date.now() })
        for (const vws of session.viewers) {
          if (vws === socket) continue
          try { if (vws.readyState === 1) vws.send(JSON.stringify({ type: 'screen:chat', payload: chatMsg })) } catch {}
        }
        break
      }
      case 'screen:record_start': {
        const recId = uuidv4()
        const nowIso = new Date().toISOString()
        // v3.8.14 - 0 means "no frame cap": long sessions are limited by disk, not RAM.
        const maxFrames = Math.min(Math.max(parseInt(payload.maxFrames) || 0, 0), 200000)
        db.prepare("INSERT INTO recordings (id, device_id, user_id, name, started_at) VALUES (?,?,?,?,?)").run(recId, deviceId, user.userId, 'تسجيل شاشة ' + nowIso.slice(0, 19), nowIso)
        // v3.8.14 - frames are streamed to disk as they arrive. Holding them in RAM
        // capped a long recording at ~250MB and silently froze the picture while the
        // timer kept running, so the MP4 came out at 1fps or never at all.
        const recFrameDir = path.join(path.dirname(_config.dbPath || '.'), 'recordings', 'frames-' + recId)
        try { fs.mkdirSync(recFrameDir, { recursive: true }) } catch {}
        screenRecorders.set(deviceId, {
          recId, userId: user.userId, frames: [], frameFiles: [], frameDir: recFrameDir,
          audio: [], bytes: 0, audioBytes: 0, maxFrames, startedAt: Date.now(),
          writeChain: Promise.resolve(), capped: false
        })
        // v3.8.3 - recordings need complete frames, so turn delta encoding off while recording
        const recAgentStart = agentSockets.get(deviceId)
        if (recAgentStart) sendJson(recAgentStart.ws, { type: 'server:screen_set_delta', payload: { delta: false }, timestamp: Date.now() })
        // v3.8.18 - the desktop agent has no screen_set_delta handler and keeps sending
        // region deltas, which the recorder skips ("full frames only"), so a 90s clip
        // stored 31 frames and the video collapsed to 25s while audio ran 90s. The agent
        // does honour force_keyframe, so ask for a full frame at capture cadence.
        try {
          const recKf = agentSockets.get(deviceId)
          if (recKf) {
            const entry = screenRecorders.get(deviceId)
            if (entry) {
              entry.keyframeTimer = setInterval(() => {
                try { if (recKf.ws && recKf.ws.readyState === 1) sendJson(recKf.ws, { type: 'server:force_keyframe', payload: {}, timestamp: Date.now() }) } catch {}
              }, 120)
              sendJson(recKf.ws, { type: 'server:force_keyframe', payload: {}, timestamp: Date.now() })
            }
          }
        } catch {}
        // v3.8.8 - a recording without sound is half a recording: ask the agent for PCM
        // audio for the duration of the recording (16 kHz mono, same path as live listen).
        // NB: no sessionId here — the agent compares it with the STREAM session and
        // would drop the message (that is why recordings had zero audio chunks).
        if (recAgentStart) sendJson(recAgentStart.ws, { type: 'server:audio_control', payload: { enabled: true }, timestamp: Date.now() })
        sendJson(socket, { type: 'screen:record_status', payload: { recording: true, meta: { sessionId: recId, startedAt: nowIso, maxFrames } } })
        break
      }
      case 'screen:record_stop': {
        const stopping = screenRecorders.get(deviceId)
        const stopRecId = stopping ? stopping.recId : null
        const recAgentStop = agentSockets.get(deviceId)
        if (recAgentStop) sendJson(recAgentStop.ws, { type: 'server:screen_set_delta', payload: { delta: true }, timestamp: Date.now() })
        if (recAgentStop) sendJson(recAgentStop.ws, { type: 'server:audio_control', payload: { enabled: false }, timestamp: Date.now() })
        // v3.8.14 - flush frames, then mux; the reply must not wait for ffmpeg.
        if (stopping && stopping.keyframeTimer) { try { clearInterval(stopping.keyframeTimer) } catch {} }
        if (stopRecId) muxingRecordings.add(stopRecId)
        sendJson(socket, {
          type: 'screen:record_status',
          payload: { recording: false, meta: { sessionId: stopRecId, mp4Pending: true, capped: !!(stopping && stopping.capped) } }
        })
        finalizeScreenRecording(deviceId).catch(() => {})
        break
      }
      case 'screen:ping':
        try { if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'screen:pong', payload: { clientTs: payload.ts, serverTs: Date.now() }, timestamp: Date.now() })) } catch {}
        break
      case 'screen:stop':
        leaveScreenSession(sessionId, socket)
        try { socket.close() } catch {}
        break

      // ── Legacy protocol (older dashboards / clients) ─────────────────────
      case 'screen_start':
        sendJson(rec.ws, { type: 'server:screen_start', payload: { sessionId: uuidv4(), fps: msg.fps || 10, quality: msg.quality || 60, maxWidth: msg.maxWidth || 1280, binary: true } })
        break
      case 'screen_stop':
        sendJson(rec.ws, { type: 'server:screen_stop', payload: { sessionId: msg.sessionId } })
        break
      case 'screen_control':
        sendJson(rec.ws, { type: 'server:screen_control', payload: msg })
        break
    }
  })

  socket.on('close', () => {
    clearInterval(keepAlive)
    leaveScreenSession(sessionId, socket)
  })
  socket.on('error', () => {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. WebSocket — Direct SSH
// ─────────────────────────────────────────────────────────────────────────────
function handleSshWs(socket, user) {
  let conn = null; let stream = null; const sessionId = uuidv4()
  let sshDbId = null
  sendJson(socket, { type: 'ssh_connected', sessionId })

  const sendErr = (message) => {
    sendJson(socket, { type: 'ssh:error', payload: { message } })
    sendJson(socket, { type: 'ssh_error', error: message })
  }

  socket.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw) } catch { return }
    const payload = msg.payload || {}

    if (msg.type === 'ssh:connect' || msg.type === 'ssh_connect') {
      const host       = payload.host || msg.host
      const port       = parseInt(payload.port || msg.port) || 22
      const username   = payload.username || msg.username
      const password   = payload.password || msg.password
      const privateKey = payload.privateKey || msg.privateKey
      const rows       = parseInt(payload.rows || msg.rows) || 24
      const cols       = parseInt(payload.cols || msg.cols) || 80
      const deviceId   = payload.deviceId || msg.deviceId || null
      if (!host || !username) { sendErr('host and username required'); return }
      try {
        const { Client } = getSsh2()
        conn = new Client()
        const authConf = { host, port, username }
        if (privateKey) authConf.privateKey = privateKey; else authConf.password = password

        conn.on('ready', () => {
          conn.shell({ term: 'xterm-256color', cols, rows }, (err, sh) => {
            if (err) { sendErr(err.message); conn.end(); return }
            stream = sh
            sshSessions.set(sessionId, { conn, stream })
            if (deviceId) { try { sshDbId = dbLogSessionStart((user && user.userId) || '', deviceId, 'ssh') } catch {} }
            sendJson(socket, { type: 'ssh_ready' })
            sendJson(socket, { type: 'ssh:connected', payload: { sessionId } })
            sh.on('data', d  => { sendJson(socket, { type: 'ssh_output', data: d.toString('utf8') }); sendJson(socket, { type: 'ssh:data', payload: { data: Buffer.from(d).toString('base64') } }) })
            sh.stderr?.on('data', d => { sendJson(socket, { type: 'ssh_output', data: d.toString('utf8') }); sendJson(socket, { type: 'ssh:data', payload: { data: Buffer.from(d).toString('base64') } }) })
            sh.on('close', () => { sendJson(socket, { type: 'ssh_closed' }); sendJson(socket, { type: 'ssh:closed' }); try { socket.close() } catch {} })
          })
        })
        conn.on('error', err => sendErr(err.message))
        conn.connect(authConf)
      } catch (e) { sendErr(e.message) }
      return
    }
    if ((msg.type === 'ssh:data' || msg.type === 'ssh_input') && stream) {
      let data = payload.data !== undefined ? payload.data : msg.data
      if (msg.type === 'ssh:data') { try { data = Buffer.from(String(data || ''), 'base64').toString('utf8') } catch {} }
      try { stream.write(String(data || '')) } catch {}
      return
    }
    if (msg.type === 'ssh:resize' && stream) {
      const rows = parseInt(payload.rows || msg.rows) || 24
      const cols = parseInt(payload.cols || msg.cols) || 80
      try { stream.setWindow(rows, cols) } catch {}
      return
    }
    if (msg.type === 'ssh:disconnect') {
      try { if (stream) stream.close() } catch {}
      try { if (conn) conn.end() } catch {}
      try { socket.close() } catch {}
      return
    }
  })

  socket.on('close', () => {
    try { dbLogSessionEnd(sshDbId) } catch {}
    if (stream) try { stream.close() } catch {}
    if (conn)   try { conn.end()     } catch {}
    sshSessions.delete(sessionId)
  })
  socket.on('error', () => {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. Agent FS Request Helper
// ─────────────────────────────────────────────────────────────────────────────
function agentFsStream(deviceId, fsPath, res, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const rec = agentSockets.get(deviceId)
    if (!rec) return reject(new Error('Device offline'))
    const opId = uuidv4()
    const st = { res, next: 0, buffer: new Map(), bytes: 0, resolve, reject }
    st.timer = setTimeout(() => { pendingFsStreams.delete(opId); try { res.destroy() } catch {} ; reject(new Error('File stream timeout')) }, timeoutMs)
    pendingFsStreams.set(opId, st)
    sendJson(rec.ws, { type: 'server:fs_request', payload: { requestId: opId, action: 'read_chunked', path: fsPath } })
  })
}

function agentFsRequest(deviceId, action, params, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const rec = agentSockets.get(deviceId)
    if (!rec) return reject(new Error('Device offline'))
    const requestId = uuidv4()
    const timer = setTimeout(() => { pendingFsRequests.delete(requestId); reject(new Error('FS request timeout')) }, timeoutMs)
    pendingFsRequests.set(requestId, { resolve, reject, timer })
    sendJson(rec.ws, { type: 'server:fs_request', payload: { requestId, action, ...params } })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// 14b. v3.2.2 — Production helpers (sessions / notifications / users / recording)
// ─────────────────────────────────────────────────────────────────────────────
function mapSessionRow(s) {
  return { ...s, deviceId: s.device_id, userId: s.user_id, deviceName: s.device_name || '', userEmail: s.user_email || '', startedAt: s.started_at, endedAt: s.ended_at || null, durationSec: s.duration_sec != null ? s.duration_sec : null }
}
function dbLogSessionStart(userId, deviceId, type, metadata) {
  try {
    if (!db || !deviceId) return null
    const id = uuidv4(); const now = new Date().toISOString()
    db.prepare("INSERT INTO sessions (id, device_id, user_id, type, started_at, metadata) VALUES (?,?,?,?,?,?)").run(id, deviceId, userId || '', type || 'shell', now, metadata ? JSON.stringify(metadata) : null)
    return id
  } catch { return null }
}
function dbLogSessionEnd(sessionRowId) {
  try {
    if (!db || !sessionRowId) return
    const row = db.prepare("SELECT started_at FROM sessions WHERE id=?").get(sessionRowId)
    const now = new Date().toISOString()
    const dur = row ? Math.max(0, Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000)) : null
    db.prepare("UPDATE sessions SET ended_at=?, duration_sec=? WHERE id=?").run(now, dur, sessionRowId)
  } catch {}
}
function sendToUser(userId, msg) {
  try {
    if (!userId) { broadcastToClients(msg); return }
    for (const [ws, meta] of clientSockets) {
      const u = meta && meta.user
      if (u && (u.userId === userId || u.role === 'admin')) sendJson(ws, msg)
    }
  } catch {}
}
async function execOnDevice(deviceId, command, timeoutMs) {
  const rec = agentSockets.get(deviceId)
  if (!rec) throw new Error('Device offline')
  // v3.8.41 (R9.2/F2) — the agent cannot see the original text: this route wraps
  // the command in a PowerShell -EncodedCommand before it leaves the server.
  const blockedInternal = blockedReason(command)
  if (blockedInternal) throw new Error('Command blocked by policy: ' + blockedInternal)
  const commandId = uuidv4()
  const tOut = Math.min(Math.max(parseInt(timeoutMs) || 60000, 1000), 300000)
  let runCommand = command
  try {
    const devRow  = db.prepare('SELECT info FROM devices WHERE id=?').get(deviceId)
    const devInfo = parseJson((devRow && devRow.info) || '', {})
    if (String(devInfo.platform || '').toLowerCase().includes('windows') && command.length <= 1800) {
      const psCmd = "$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " + command + "; if (-not $?) { exit 1 }"
      runCommand = 'powershell -NoProfile -NonInteractive -EncodedCommand ' + Buffer.from(psCmd, 'utf16le').toString('base64')
    }
  } catch {}
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pendingCommands.delete(commandId); reject(new Error('command timeout')) }, tOut + 5000)
    pendingCommands.set(commandId, { resolve, reject, timer })
    sendJson(rec.ws, { type: 'server:command', payload: { commandId, type: 'shell', command: runCommand } })
  })
}

function addNotification(n) {
  try {
    const id = uuidv4(); const now = new Date().toISOString()
    db.prepare("INSERT INTO notifications (id, user_id, device_id, type, title, message, severity, read, created_at) VALUES (?,?,?,?,?,?,?,0,?)").run(id, n.userId || '', n.deviceId || null, n.type || 'info', n.title || '', n.message || '', n.severity || 'info', now)
    const row = { id, user_id: n.userId || '', device_id: n.deviceId || null, type: n.type || 'info', title: n.title || '', message: n.message || '', severity: n.severity || 'info', read: 0, created_at: now }
    sendToUser(n.userId, { type: 'broadcast:notification', payload: row, timestamp: Date.now() })
  } catch {}
}
function resolveAiConfig(body) {
  try {
    const c = body && body.config
    if (c && c.provider) {
      // v3.3.5 — provider-aware merge: prefer the client value, then THIS provider's saved
      // config, then the stored active config only if it belongs to the same provider.
      const stored = getAiConfig() || {}
      const cfgMap = getAiConfigs()
      const saved  = cfgMap[c.provider] || {}
      const same   = (stored.provider || '') === c.provider ? stored : {}
      return {
        provider: c.provider,
        apiKey:   c.apiKey || saved.apiKey || same.apiKey || '',
        model:    c.model || saved.model || same.model || '',
        baseUrl:  (c.baseUrl !== undefined && c.baseUrl !== null && c.baseUrl !== '') ? c.baseUrl : (saved.baseUrl || same.baseUrl || '')
      }
    }
    return getAiConfig()
  } catch { return getAiConfig() }
}

// v3.3.2 — device context for AI chats so the assistant can identify the target device
function buildDeviceAiContext(deviceId) {
  try {
    if (!deviceId) return ''
    const d = db.prepare('SELECT * FROM devices WHERE id=?').get(deviceId)
    if (!d) return ''
    const sock  = agentSockets.get(deviceId)
    const online = !!(sock && sock.ws && sock.ws.readyState === 1)
    const info  = parseJson(d.info, {})
    const stats = (sock && sock.stats) || null
    const L = []
    L.push('سياق الجهاز الحالي (الجهاز الذي يتحدث عنه المستخدم — استخدم هذه البيانات في ردك):')
    L.push('- الاسم: ' + (d.name || 'غير معروف'))
    L.push('- الحالة: ' + (online ? 'متصل بالسيرفر الآن' : 'غير متصل'))
    if (info.hostname)     L.push('- اسم المضيف: ' + info.hostname)
    if (info.platform)     L.push('- النظام: ' + info.platform + ' ' + (info.arch || '') + (info.osVersion ? ' (' + info.osVersion + ')' : ''))
    if (info.agentVersion) L.push('- إصدار الوكيل: ' + info.agentVersion)
    if (info.ipLocal)      L.push('- IP المحلي: ' + info.ipLocal)
    if (d.last_seen)       L.push('- آخر ظهور: ' + d.last_seen)
    if (stats) {
      L.push('- الموارد الآن: CPU ' + (stats.cpuPercent != null ? stats.cpuPercent + '%' : '?') +
             ' | RAM ' + (stats.ramPercent != null ? stats.ramPercent + '%' : '?') +
             ' (' + (stats.ramUsedMb || '?') + '/' + (stats.ramTotalMb || '?') + ' MB)' +
             ' | القرص ' + (stats.diskPercent != null ? stats.diskPercent + '%' : '?'))
    }
    L.push('مهم: إذا طلب المستخدم شيئاً على هذا الجهاز فأنت تتحدث عنه تحديداً (لا تقل إنك لا تعرف الجهاز). وعندما يكون الحل أمراً قابلاً للتنفيذ، اعرضه في كتلة كود واحدة جاهزة.')
    L.push('قاعدة الاتصال: إن كانت رسالة المستخدم سؤالاً أو حديثاً عادياً (بدون طلب إجراء على الجهاز) فاجب نصياً مباشرة دون أي كتل أدوات. لا تدرج أوامر أو كتل أدوات من تلقاء نفسك ولا تنسخها من محادثات سابقة.')
    L.push('لديك ذاكرة تلقائية لأحدث المحادثات مع هذا الجهاز (حتى 10) — استفد منها للاستمرارية ولا تطلب من المستخدم إعادة ما قيل سابقاً.')
    L.push('- أدوات الجهاز — تُستخدم فقط عند طلب المستخدم إجراءً فعلياً على الجهاز أو معلومة عنه. تنبيه مهم: طلب «اكتب كلمة/جملة كذا» يعني أن تكتبها في ردك نصياً (إجابة عادية) وليس كتابة على الجهاز؛ الكتابة على الجهاز تكون فقط عند ذكر نافذة أو تطبيق أو الجهاز صراحة (مثل: اكتب في المفكرة، اكتب داخل المتصفح). الأدوات: powershell لتنفيذ أوامر، screenshot للقطة شاشة، record لفيديو قصير (داخلها «المدة: N»)، control للتحكم بالفأرة ولوحة المفاتيح (أوامر إنجليزية مفردة: click x y، clickname النص — للنقر على عنصر باسمه مثل Play أو عنوان نتيجة، wait ثوانٍ، type النص، key مثل CTRL+S، focus عنوان-نافذة، scroll N، drag، move، info). لمهمة طويلة (مثل: افتح يوتيوب وشغّل نتيجة): استخدم powershell لفتح رابط البحث مباشرة، ثم wait، ثم focus المتصفح، ثم clickname بعنوان النتيجة، ثم لقطة تحقق، وأخيراً كتلة record إن طلب تسجيلاً. تابِع خطوة بخطوة عبر الحلقات حتى تكتمل المهمة. قاعدة صارمة: لا تخلط الأدوات — كتلة powershell تحوي أوامر PowerShell فقط (بدون أسطر تبدأ بـ control أو wait أو record)، وأوامر click/clickname/wait/focus/type/key/scroll/info توضع فقط داخل كتلة control، والمدة فقط داخل كتلة record. لا تكتب أبداً أسطر control داخل كتلة powershell. أسماء الكتل يجب أن تكون حرفياً: powershell و control و screenshot و record — لا تستخدم الاسم text أو أي اسم آخر لكتل الأوامر.')
    L.push('لأخذ لقطة شاشة أضف كتلة كود بلغة screenshot في ردك (يمكن كتابة وصف قصير داخلها)؛ لا حاجة لأوامر التقاط يدوية.')
    L.push('- إمكانية التنفيذ عن بُعد: متاحة — حين يطلب المستخدم إجراءً على الجهاز نفّذه فوراً بكتلة كود مناسبة، وعندها لا تقل إنك لا تستطيع.')
    L.push('عند طلب إجراء على الجهاز (تشغيل برنامج، فتح موقع، لقطة، فيديو، نقر/كتابة) اختر الأداة المناسبة واكتبها في كتلة الكود الخاصة بها؛ سينفذها النظام ويعيد لك النتيجة للتحليل والاستمرار.')
    return L.join('\n')
  } catch { return '' }
}
// v3.3.4 — AI memory: compact recap of the last 10 conversations for this user+device
function buildAiMemory(userId, deviceId, currentConvId) {
  try {
    const rows = db.prepare('SELECT id, title, messages, updated_at FROM ai_conversations WHERE user_id=? AND device_id=? AND id<>? ORDER BY updated_at DESC LIMIT 14').all(userId, deviceId || '', currentConvId || '')
    // v3.3.5 — skip tool-execution conversations: their titles/examples mislead small models
    const toolWords = ['المفكرة', 'لقطة', 'فيديو', 'control', 'screenshot', 'record', 'نفذ', 'شغل', 'افتح', 'انقر', 'سجّل', 'notepad']
    const rows2 = rows.filter(r => { const s = String(r.title || '').toLowerCase(); return !toolWords.some(x => s.includes(x.toLowerCase())) }).slice(0, 10)
    if (!rows2.length) return ''
    const L = ['ذاكرة المحادثات السابقة (آخر ' + rows2.length + ' محادثة مع هذا الجهاز — الأحدث أولاً؛ استخدمها لفهم السياق والاستمرارية):']
    for (const r of rows2) {
      const msgs = parseJson(r.messages, [])
      const tail = msgs.slice(-2)
      const parts = tail.map(m => (m.role === 'user' ? 'المستخدم: ' : 'المساعد: ') + String(m.content || '').replace(/```[\s\S]*?```/g, '[أداة]').replace(/\s+/g, ' ').slice(0, 160))
      L.push('- [' + String(r.updated_at || '').slice(0, 16) + '] ' + String(r.title || '').replace(/\s+/g, ' ').slice(0, 80) + ' :: ' + parts.join(' || '))
    }
    return L.join('\n')
  } catch { return '' }
}
// — v3.2.2 server-side screen recording (JPEG frames → ZIP) —
const screenRecorders = new Map()   // deviceId → { recId, userId, frameFiles, frameDir, bytes, maxFrames, startedAt }
// v3.8.14 - recordings whose MP4 is still being muxed: the download route answers 202
// instead of silently handing out the ZIP while ffmpeg is working.
const muxingRecordings = new Set()
function crc32(buf) {
  if (!crc32.table) { crc32.table = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc32.table[n] = c >>> 0 } }
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = crc32.table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}
function buildZipStore(files) {
  const parts = [], central = []; let offset = 0
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8')
    const crc = crc32(f.data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12)
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(f.data.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28)
    parts.push(lh, nameBuf, f.data)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14)
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(f.data.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42)
    central.push(ch, nameBuf)
    offset += lh.length + nameBuf.length + f.data.length
  }
  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10); eocd.writeUInt32LE(centralBuf.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...parts, centralBuf, eocd])
}
function recordAudioChunk(deviceId, buf, format = 'webm') {
  try {
    const r = screenRecorders.get(deviceId)
    if (!r || !buf || !buf.length) return
    if ((r.audioBytes || 0) > 64 * 1024 * 1024) return
    if (!r.audio) r.audio = []
    if (!r.audioStartTs) r.audioStartTs = Date.now()
    if (!r.audioFormat) r.audioFormat = format
    r.audio.push(Buffer.from(buf))
    r.audioBytes = (r.audioBytes || 0) + buf.length
  } catch {}
}
function recordScreenFrame(deviceId, jpegBuf) {
  try {
    const r = screenRecorders.get(deviceId)
    if (!r || !jpegBuf || !jpegBuf.length) return
    if (r.capped) return
    const n = (r.frameFiles || []).length
    if (r.maxFrames && n >= r.maxFrames) {
      r.capped = true
      try { serverLogger && serverLogger.warn('recording', 'frame cap reached rec=' + String(r.recId).slice(0, 8) + ' frames=' + n) } catch {}
      return
    }
    const buf = Buffer.from(jpegBuf)
    const isWebp = buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP'
    const isJpeg = buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8
    const name = 'frame-' + String(n).padStart(6, '0') + (isWebp ? '.webp' : (isJpeg ? '.jpg' : '.bin'))
    if (!r.frameFiles) r.frameFiles = []
    r.frameFiles.push({ name, size: buf.length, ts: Date.now() })
    r.bytes = (r.bytes || 0) + buf.length
    const dir = r.frameDir
    r.writeChain = (r.writeChain || Promise.resolve())
      .then(() => fs.promises.writeFile(path.join(dir, name), buf))
      .catch(() => {})
  } catch {}
}
// v3.8.8 - a recording should be a video, not a folder of stills. The ZIP stays as the
// lossless fallback (and is the only output when ffmpeg is absent); the MP4 is built
// asynchronously so stopping a recording never blocks the server.
function findFfmpeg() {
  // v3.8.10 - the installer ships ffmpeg next to the app (extraResources), so a
  // packaged server never depends on something the user installed by hand.
  const bundled = [
    process.resourcesPath ? path.join(process.resourcesPath, 'ffmpeg.exe') : null,
    path.join(__dirname, 'bin', 'ffmpeg.exe')
  ].filter(Boolean)
  const cands = [process.env.AIREMOTE_FFMPEG].concat(bundled, ['C:\\ffmpeg\\bin\\ffmpeg.exe']).filter(Boolean)
  for (const c of cands) { try { if (fs.existsSync(c)) return c } catch {} }
  return null
}

function exportRecordingMp4(r, dir) {
  const ff = findFfmpeg()
  const frames = r.frameFiles || []
  if (!ff || !frames.length) {
    muxingRecordings.delete(r.recId)
    try { if (r.frameDir) fs.rmSync(r.frameDir, { recursive: true, force: true }) } catch {}
    try { serverLogger && serverLogger.warn('recording', 'mp4 skipped ' + String(r.recId).slice(0, 8) + (ff ? ' (no frames)' : ' (ffmpeg missing)')) } catch {}
    return
  }
  const tmp = path.join(dir, 'tmp-' + r.recId)
  try {
    fs.mkdirSync(tmp, { recursive: true })
    const durationSec = Math.max(1, (Date.now() - r.startedAt) / 1000)
    let fps = Math.min(30, Math.max(1, Math.round(frames.length / durationSec)))
    let perFrame = 1 / fps

    // v3.8.11 - a recording can mix WebP and JPEG frames (the agent falls back to
    // JPEG when WebP is slow). Writing them all with the first frame's extension
    // made ffmpeg stop at the first mismatch (a 9s clip became 1s), so every frame
    // keeps its real extension and the concat demuxer carries the timing.
    // v3.8.14 - frames already live in r.frameDir (written while recording), so the
    // muxer only writes the concat list: no second full copy of the session in RAM.
    // v3.8.15 - the agent alternates WebP and JPEG, and a mislabelled frame makes the
    // concat demuxer abort with "missing RIFF tag" (exit 69, a 5-minute clip became
    // 32 seconds). Every frame is re-sniffed here and renamed to its real extension.
    // v3.8.16 - the agent alternates WebP and JPEG. The concat demuxer restarts the
    // timeline whenever the codec changes, so a 3-minute clip was muxed to 69 seconds.
    // Frames are sniffed, relabelled to their real extension, and only the dominant
    // format is kept so the demuxer sees one uniform stream; fps is derived from the
    // frames that actually survive.
    const sniffed = []
    for (const f of frames) {
      if (!f || !f.name) continue
      const abs = path.join(r.frameDir, f.name)
      let head = null
      try { head = fs.readFileSync(abs).subarray(0, 16) } catch { continue }
      if (!head || head.length < 12) continue
      const isWebp = head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP'
      const isJpeg = head[0] === 0xFF && head[1] === 0xD8
      const isPng = head[0] === 0x89 && head[1] === 0x50
      const kind = isWebp ? '.webp' : isJpeg ? '.jpg' : isPng ? '.png' : '.bin'
      const want = f.name.replace(/\.[^.]+$/, kind)
      if (want !== f.name) {
        try { fs.renameSync(abs, path.join(r.frameDir, want)); f.name = want } catch { continue }
      }
      if (kind !== '.bin') sniffed.push({ name: f.name, kind })
    }
    const byKind = {}
    for (const f of sniffed) byKind[f.kind] = (byKind[f.kind] || 0) + 1
    const dominant = Object.keys(byKind).sort((a, b) => byKind[b] - byKind[a])[0] || ''
    const kept = sniffed.filter(f => f.kind === dominant)
    frames.length = 0
    for (const f of kept) frames.push(f)
    if (sniffed.length !== kept.length) {
      try { serverLogger && serverLogger.info('recording', 'uniform mux kept=' + kept.length + '/' + sniffed.length + ' format=' + dominant) } catch {}
    }
    if (!frames.length) {
      muxingRecordings.delete(r.recId)
      try { if (r.frameDir) fs.rmSync(r.frameDir, { recursive: true, force: true }) } catch {}
      try { serverLogger && serverLogger.warn('recording', 'no usable frames rec=' + String(r.recId).slice(0, 8)) } catch {}
      return
    }
    fps = Math.min(30, Math.max(1, Math.round(frames.length / durationSec)))
    perFrame = 1 / fps

    // v3.8.17 - A/V sync: every frame carries its arrival time, so each concat entry gets
    // the real gap that followed it instead of a uniform 1/fps. A uniform grid drifted
    // from the PCM clock whenever the agent delivered frames in bursts.
    const useTs = frames.length > 2 && frames[0].ts && frames[frames.length - 1].ts
    const deltas = []
    if (useTs) {
      for (let i = 0; i < frames.length - 1; i++) {
        const dt = (frames[i + 1].ts - frames[i].ts) / 1000
        deltas.push(Math.min(10.0, Math.max(0.01, dt)))
      }
      deltas.sort((a, b) => a - b)
    }
    const medianDelta = deltas.length ? deltas[Math.floor(deltas.length / 2)] : perFrame

    const list = ['ffconcat version 1.0']
    for (let i = 0; i < frames.length; i++) {
      const name = frames[i].name
      if (!name || name.endsWith('.bin')) continue
      try { fs.accessSync(path.join(r.frameDir, name)) } catch { continue }
      list.push("file '" + path.join(r.frameDir, name).replace(/\\/g, '/') + "'")
      let dur = perFrame
      if (useTs) {
        const next = frames[i + 1]
        dur = next && next.ts ? Math.min(10.0, Math.max(0.01, (next.ts - frames[i].ts) / 1000)) : medianDelta
      }
      list.push('duration ' + dur.toFixed(4))
    }
    if (list.length <= 1) { muxingRecordings.delete(r.recId); return }
    const lastFile = list[list.length - 2].replace(/^file '/, '').replace(/'$/, '')
    list.push("file '" + lastFile + "'")
    list.push('duration ' + medianDelta.toFixed(4))   // hold the last frame
    fs.writeFileSync(path.join(tmp, 'list.txt'), list.join('\n'), 'utf8')

    let audio = (r.audio && r.audio.length) ? Buffer.concat(r.audio) : null
    const RATE = 16000, BYTES_PER_SEC = RATE * 2   // s16le mono
    const firstTs = frames[0].ts || r.startedAt
    const lastTs = frames[frames.length - 1].ts || firstTs
    const videoSec = list.slice(1).filter(x => x.startsWith("duration ")).reduce((acc, x) => acc + parseFloat(x.slice(9)), 0) || ((lastTs - firstTs) / 1000 + medianDelta)
    if (audio && audio.length) {
      // v3.8.17 - the PCM track starts when audio_control was enabled, which can be
      // before or after the first frame. Trim or pad so both streams start together;
      // then pad the tail so -shortest cannot chop the picture.
      const offsetSec = r.audioStartTs ? (firstTs - r.audioStartTs) / 1000 : 0
      if (offsetSec > 0.05) {
        const skip = Math.min(audio.length, Math.round(offsetSec * BYTES_PER_SEC))
        audio = audio.subarray(skip)
        try { serverLogger && serverLogger.info('recording', 'audio trimmed ' + offsetSec.toFixed(2) + 's') } catch {}
      } else if (offsetSec < -0.05) {
        const pad = Buffer.alloc(Math.round(-offsetSec * BYTES_PER_SEC))
        audio = Buffer.concat([pad, audio])
        try { serverLogger && serverLogger.info('recording', 'audio padded ' + (-offsetSec).toFixed(2) + 's') } catch {}
      }
      // v3.8.19 - the PCM track was measured as lagging the picture by ~0.5s: the
      // agent starts the audio pipeline after the first frames and buffers chunks
      // before sending, so its head is late. Drop that head (or prepend silence if a
      // negative value is configured). Tunable without a rebuild through
      // %APPDATA%\AiRemote-Server\av-offset.json  →  {"trimMs": 500}
      let leadMs = 500
      try {
        const cfgPath = path.join(path.dirname(_config.dbPath || '.'), 'av-offset.json')
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
          if (cfg && Number.isFinite(cfg.trimMs)) leadMs = cfg.trimMs
        }
      } catch {}
      if (Number.isFinite(parseInt(process.env.AIREMOTE_AV_TRIM_MS || '', 10))) {
        leadMs = parseInt(process.env.AIREMOTE_AV_TRIM_MS, 10)
      }
      leadMs = Math.max(-2000, Math.min(2000, leadMs))
      if (leadMs > 0) {
        const cut = Math.min(audio.length, Math.round((leadMs / 1000) * BYTES_PER_SEC))
        audio = audio.subarray(cut)
        try { serverLogger && serverLogger.info('recording', 'audio advanced ' + leadMs + 'ms') } catch {}
      } else if (leadMs < 0) {
        const pad = Buffer.alloc(Math.round((-leadMs / 1000) * BYTES_PER_SEC))
        audio = Buffer.concat([pad, audio])
        try { serverLogger && serverLogger.info('recording', 'audio delayed ' + (-leadMs) + 'ms') } catch {}
      }

      const wantBytes = Math.max(0, Math.round(videoSec * BYTES_PER_SEC))
      if (audio.length < wantBytes) audio = Buffer.concat([audio, Buffer.alloc(wantBytes - audio.length)])
      else if (audio.length > wantBytes + BYTES_PER_SEC) audio = audio.subarray(0, wantBytes)
      fs.writeFileSync(path.join(tmp, 'audio.pcm'), audio)
      try { serverLogger && serverLogger.info('recording', 'av align video=' + videoSec.toFixed(2) + 's audio=' + (audio.length / BYTES_PER_SEC).toFixed(2) + 's') } catch {}
    }

    const out = path.join(dir, r.recId + '.mp4')
    const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt')]
    if (audio && audio.length) args.push('-f', 's16le', '-ar', '16000', '-ac', '1', '-i', path.join(tmp, 'audio.pcm'))
    args.push('-vsync', 'cfr', '-r', String(fps), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p')
    if (audio && audio.length) args.push('-c:a', 'aac', '-b:a', '128k', '-shortest')
    args.push('-movflags', '+faststart', out)

    try { serverLogger && serverLogger.info('recording', 'muxing with ' + ff) } catch {}
    const { spawn } = require('child_process')
    const p = spawn(ff, args, { windowsHide: true })
    let err = ''
    p.stderr.on('data', (d) => { if (err.length < 600) err += String(d) })
    p.on('error', (e) => { try { serverLogger && serverLogger.warn('recording', 'ffmpeg spawn: ' + e.message) } catch {} })
    p.on('close', (code) => {
      try {
        if (code === 0 && fs.existsSync(out) && fs.statSync(out).size > 1024) {
          const mb = fs.statSync(out).size / 1024 / 1024
          db.prepare('UPDATE recordings SET file_path=?, size_mb=? WHERE id=?').run(out, mb, r.recId)
          const audioSec = audio ? (audio.length / 32000) : 0
          try { serverLogger && serverLogger.info('recording', 'video ' + String(r.recId).slice(0, 8) + ' ' + mb.toFixed(1) + 'MB fps=' + fps + ' frames=' + frames.length + ' audio=' + audioSec.toFixed(1) + 's') } catch {}
        } else {
          try { if (fs.existsSync(out)) fs.rmSync(out, { force: true }) } catch {}
          try { serverLogger && serverLogger.warn('recording', 'ffmpeg exit ' + code + ' ' + err.replace(/\s+/g, ' ').slice(0, 300)) } catch {}
        }
      } catch {}
      muxingRecordings.delete(r.recId)
      try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
      try { if (r.frameDir) fs.rmSync(r.frameDir, { recursive: true, force: true }) } catch {}
    })
  } catch (e) {
    muxingRecordings.delete(r.recId)
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
    try { serverLogger && serverLogger.warn('recording', 'mp4 export failed: ' + e.message) } catch {}
  }
}

async function finalizeScreenRecording(deviceId) {
  const r = screenRecorders.get(deviceId)
  if (!r) return null
  screenRecorders.delete(deviceId)
  try {
    const dir = path.join(path.dirname(_config.dbPath || '.'), 'recordings')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    // wait for the last frame writes to land before anything reads the folder
    try { await (r.writeChain || Promise.resolve()) } catch {}
    const frameFiles = r.frameFiles || []
    const endedAt = new Date().toISOString()
    const durationSec = Math.max(0, Math.floor((Date.now() - r.startedAt) / 1000))
    // v3.8.14 - the ZIP stays the lossless fallback for short sessions; a long session
    // is served as MP4 only, because assembling thousands of frames into one in-memory
    // archive was what pushed the process over its heap limit (and blocked the loop).
    const keepZip = frameFiles.length > 0 && frameFiles.length <= 500
    let zipPath = null
    if (keepZip) {
      const entries = []
      for (const f of frameFiles) {
        try { entries.push({ name: f.name, data: await fs.promises.readFile(path.join(r.frameDir, f.name)) }) } catch {}
      }
      if (r.audio && r.audio.length) entries.push({ name: r.audioFormat === 'pcm16' ? 'audio.pcm' : 'audio.webm', data: Buffer.concat(r.audio) })
      if (entries.length) {
        zipPath = path.join(dir, r.recId + '.zip')
        await fs.promises.writeFile(zipPath, buildZipStore(entries))
      }
    } else if (frameFiles.length === 0) {
      zipPath = path.join(dir, r.recId + '.zip')
      await fs.promises.writeFile(zipPath, buildZipStore([{ name: 'README.txt', data: Buffer.from('No frames captured', 'utf8') }]))
    }
    const sizeMb = zipPath ? fs.statSync(zipPath).size / 1024 / 1024 : 0
    db.prepare("UPDATE recordings SET ended_at=?, file_path=?, size_mb=? WHERE id=?").run(endedAt, zipPath, sizeMb, r.recId)
    try { serverLogger && serverLogger.info('recording', 'stop rec=' + String(r.recId).slice(0, 8) + ' frames=' + frameFiles.length + ' seconds=' + durationSec + ' zip=' + (zipPath ? 'yes' : 'no')) } catch {}
    try { exportRecordingMp4(r, dir) } catch (e) { muxingRecordings.delete(r.recId) }
    return { sessionId: r.recId, frames: frameFiles.length, audioChunks: (r.audio || []).length, sizeMB: sizeMb, durationSec, endedAt, mp4Pending: true, capped: !!r.capped }
  } catch (e) {
    muxingRecordings.delete(r.recId)
    try { db.prepare("UPDATE recordings SET ended_at=? WHERE id=?").run(new Date().toISOString(), r.recId) } catch {}
    return { sessionId: r.recId, error: e.message }
  }
}

// 15. WS Auth Helper
// ─────────────────────────────────────────────────────────────────────────────
function resolveWsUser(query) {
  if (query.ticket) {
    const t = wsTickets.get(query.ticket)
    if (t && t.expires > Date.now()) { wsTickets.delete(query.ticket); return t }
    return null
  }
  // v3.7.0 — raw JWT in the WS URL is rejected; clients must present a ticket
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. Fastify Instance + All Routes
// ─────────────────────────────────────────────────────────────────────────────
let fastify    = null
let started    = false
let _config    = {}
let _startedAt = null
let TLS_ACTIVE   = false
let TLS_CERT_PATH = null

const AGENT_VERSION = '3.9.1'   // agent artifact version (downloads)
let serverLogger = null   // set in start(); lets WS handlers write to the app log
const SERVER_VERSION = '3.9.1'  // server build version (/health)

async function start(config) {
  if (started) return
  _config = config
  const { port = 3001, jwtSecret, dbPath, logger: log, desktopCallbacks = {} } = config
  serverLogger = log || null
  JWT = jwtSecret
  _desktopCallbacks = desktopCallbacks

  initDb(dbPath)

  // v3.8.12 / R2 — مفتاح أسرار مستقل + هجرة القيم القديمة إلى GCM
  initSecretKey(dbPath)

  // v3.8.29 (R7) - scheduled, verified snapshots. VACUUM INTO gives a standalone
  // database from the live connection, so a backup never captures a torn WAL state.
  try {
    backupManager = createBackupManager({
      db,
      dbPath,
      dir: config.backupDir || process.env.AIREMOTE_BACKUP_DIR || undefined,
      keep: config.backupKeep,
      intervalHours: config.backupIntervalHours,
      disabled: config.backup === false,
      log: {
        info: (m) => (serverLogger && serverLogger.info ? serverLogger.info('backup', m) : console.log(m)),
        warn: (m) => (serverLogger && serverLogger.warn ? serverLogger.warn('backup', m) : console.log(m)),
        error: (m) => (serverLogger && serverLogger.error ? serverLogger.error('backup', m) : console.error(m))
      }
    })
    backupManager.start()
  } catch (e) {
    backupManager = null
    try { (serverLogger && serverLogger.error ? serverLogger.error : console.error)('backup', 'init failed: ' + e.message) } catch {}
  }

  // v3.8.32 (R7) - storage stays bounded: recordings and audit rows expire on a schedule,
  // and a notification goes out before anything is removed.
  try {
    retention = createRetention({
      db,
      dataDir: path.dirname(dbPath || '.'),
      enabled: config.retention !== false,
      recordingsDays: config.recordingsDays,
      auditDays: config.auditDays,
      notifyBeforeDays: config.retentionNotifyDays,
      log: {
        info: (m) => (serverLogger && serverLogger.info ? serverLogger.info('retention', m) : console.log(m)),
        warn: (m) => (serverLogger && serverLogger.warn ? serverLogger.warn('retention', m) : console.log(m))
      }
    })
    retention.start()

    // v3.8.33 (R7) - a counter nobody watches is not monitoring: raise a bell on a burst.
    failureAlerter = createFailureAlerter({
      db,
      windowMs: (config.alertWindowSeconds || 300) * 1000,
      threshold: config.alertThreshold || 10,
      cooldownMs: (config.alertCooldownSeconds || 1800) * 1000,
      log: { warn: (m) => (serverLogger && serverLogger.warn ? serverLogger.warn('alerts', m) : console.warn(m)) }
    })
  } catch (e) {
    retention = null
    try { (serverLogger && serverLogger.error ? serverLogger.error : console.error)('retention', 'init failed: ' + e.message) } catch {}
  }

  // v3.8.12 / R3 — عمود code لدفتر العناوين + تعبئة الأجهزة القائمة
  ensureContactsSchema()
  // v3.8.12 / R3-2 — جداول الوصول غير المراقب والصلاحيات الدقيقة
  ensureDeviceAccessSchema()

  // R5 — محرّك نقل الملفات: جدول file_transfers + استكمال + تحقق بصمة
  fileTransfers = createFileTransferManager({
    db,
    log: {
      info: (m) => (serverLogger && serverLogger.info ? serverLogger.info('ft', m) : console.log(m)),
      warn: (m) => (serverLogger && serverLogger.warn ? serverLogger.warn('ft', m) : console.log(m)),
      error: (m) => (serverLogger && serverLogger.error ? serverLogger.error('ft', m) : console.error(m))
    },
    getSocket: (id) => agentSockets.get(id) || null,
    sendJson,
    notify: (userId, msg) => sendToUser(userId, msg),
    audit: (action, deviceId, details) => {
      try {
        const row = details && details.id ? db.prepare('SELECT user_id FROM file_transfers WHERE id=?').get(details.id) : null
        dbLogAudit({ userId: row ? row.user_id : '', deviceId, action, details: JSON.stringify(details || {}) })
      } catch {}
    },
    roots: process.env.AIREMOTE_FT_ROOTS,
  })
  fileTransfers.init()

  {
    const assigned = ensureAllDeviceCodes()
    if (assigned) {
      const m = '🔢 [devices] assigned codes to ' + assigned + ' device(s)'
      if (serverLogger && serverLogger.info) serverLogger.info(m); else console.log(m)
    }
  }
  try {
    const mig = migrateLegacySecrets()
    if (mig.migrated || mig.failed) {
      const msg = '🔄 [secrets] migrated=' + mig.migrated + ' failed=' + mig.failed
      if (serverLogger && serverLogger.info) serverLogger.info(msg); else console.log(msg)
    }
  } catch (e) {
    const msg = '⚠️ [secrets] migration skipped: ' + e.message
    if (serverLogger && serverLogger.warn) serverLogger.warn(msg); else console.log(msg)
  }

  // ── v3.7.0 — TLS by default (self-signed for LAN/localhost) ───────────────
  let tlsOptions = null
  if (_config.tls !== false) {
    try {
      const selfsigned = require('selfsigned')
      const tlsDir = path.join(path.dirname(dbPath), 'tls')
      fs.mkdirSync(tlsDir, { recursive: true })
      TLS_CERT_PATH = path.join(tlsDir, 'server.crt')
      const keyPath = path.join(tlsDir, 'server.key')

      if (!fs.existsSync(TLS_CERT_PATH) || !fs.existsSync(keyPath)) {
        const ips = ['127.0.0.1']
        try {
          const os = require('os')
          const n = os.networkInterfaces()
          for (const k of Object.keys(n)) for (const a of (n[k] || [])) if (a.family === 'IPv4' && !a.internal) ips.push(a.address)
        } catch {}
        const altNames = [{ type: 2, value: 'localhost' }].concat(ips.map(ip => ({ type: 7, ip })))
        const pems = selfsigned.generate([{ name: 'commonName', value: 'AiRemote Server' }], {
          days: 3650, keySize: 2048, algorithm: 'sha256',
          extensions: [{ name: 'subjectAltName', altNames }]
        })
        fs.writeFileSync(TLS_CERT_PATH, pems.cert, 'utf8')
        fs.writeFileSync(keyPath, pems.private, 'utf8')
        log && log.info && log.info('server', 'Generated self-signed TLS certificate for ' + ips.join(', '))
      }
      tlsOptions = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(TLS_CERT_PATH) }
      TLS_ACTIVE = true
    } catch (e) {
      log && log.warn && log.warn('server', 'TLS unavailable, falling back to HTTP: ' + e.message)
      TLS_ACTIVE = false
      TLS_CERT_PATH = null
    }
  }

  // Close sessions left open by a previous crash/restart so the Sessions
  // page never shows days-old streams as still active.
  try {
    db.prepare(`UPDATE sessions
      SET ended_at = datetime('now'),
          duration_sec = CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER)
      WHERE ended_at IS NULL`).run()
  } catch {}

  // Fastify v4 does not accept TLS material in listen(); supply an HTTPS server.
  fastify = Fastify({
    logger: false,
    ...(tlsOptions ? { serverFactory: (handler) => require('https').createServer(tlsOptions, handler) } : {})
  })
  // Empty body + application/json is common on DELETE (browsers and our e2e client send the
  // header unconditionally). Treat it as {} so validation cannot pre-empt authorization.
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const t = String(body || '').trim()
    if (!t) return done(null, {})
    try { done(null, JSON.parse(t)) } catch (e) { done(e) }
  })
  // 3.9.0 — تذكرة الجلسة بديل JWT على مسارات الملفات والتسجيلات فقط.
  fastify.addHook('onRequest', async (req, reply) => {
    try {
      const url = String(req.raw && req.raw.url || '')
      const fsMatch = /^\/api\/devices\/([^\/?]+)\/fs(?:\/|\?|$)/.exec(url)
      const recMatch = /^\/api\/recordings(?:\/|\?|$)/.exec(url)
      if (!fsMatch && !recMatch) return
      const raw = (req.query && req.query.rt) || req.headers['x-air-session']
      if (!raw) return
      const res = sessionViewResolve(String(raw), { forWs: false })
      if (!res.ok) {
        dbLogAudit({ userId: '', userEmail: '', deviceId: fsMatch ? fsMatch[1] : null, action: 'session_view_denied', details: { code: res.code, path: url.split('?')[0] }, ipAddress: req.ip })
        reply.code(401).send({ error: 'تذكرة جلسة غير صالحة', code: res.code })
        return reply
      }
      if (fsMatch && String(fsMatch[1]) !== String(res.row.device_id)) {
        reply.code(403).send({ error: 'التذكرة لا تخص هذا الجهاز', code: 'ticket_wrong_device' })
        return reply
      }
      req._sessionPrincipal = {
        userId: res.session.requester.userId || '', email: res.session.requester.email || '',
        role: res.row.access === 'view' ? 'viewer' : 'manager',
        sessionId: res.session.id, sessionAccess: res.row.access, isSessionTicket: true,
      }
    } catch {}
  })

  await fastify.register(fcors, { origin: false, credentials: true })
  await fastify.register(frateLimit, { global: false, max: 200, timeWindow: '1 minute' })
  await fastify.register(fws)

  // v3.8.28 (R7) - count every response once; /metrics reads these counters.
  fastify.addHook('onResponse', async (req, reply) => {
    try {
      const key = req.method + ' ' + reply.statusCode
      metrics.http.set(key, (metrics.http.get(key) || 0) + 1)
      metrics.httpCount++
      metrics.httpSecondsSum += (reply.elapsedTime || 0) / 1000
      if (reply.statusCode >= 500) { metrics.errors++; try { if (failureAlerter) failureAlerter.record(reply.statusCode) } catch {} }
    } catch { }
  })

  // معالج خطأ مخصّص لحالة رفض الدور فقط؛ بقية الأخطاء تمرّ للمعالج الافتراضي.
  fastify.setErrorHandler((err, req, reply) => {
    if (err && err.code === 'role_too_low') {
      return reply.code(403).send({ error: err.message, code: 'role_too_low' })
    }
    metrics.errors++
    reply.send(err)
  })

  // v3.8.12 / R2 — حارس موحّد للعمليات المدمِّرة على الأجهزة.
  // المشكلة: كل مسارات fs/* وcontrol/block/unblock/disconnect وحذف الجهاز كانت
  // تكتفي بالملكية، فمشاهد يملك جهازاً يستطيع حذفه أو التحكم به — خلافاً لسياسة
  // الأدوار المعلنة (viewer للقراءة فقط، manager يشغّل). الحارس هنا فقط يمنع
  // دوراً أقل من manager عند وجود رمز صالح؛ غياب الرمز يترك الرد 401 للمسار.
  // v3.8.26 - was preHandler, i.e. AFTER body parsing. With fastify 5 a DELETE that carries
  // Content-Type: application/json but no body failed the parser first and answered 400, so a
  // viewer's forbidden delete looked like a bad request instead of a 403. onRequest runs
  // before any parsing: the security decision is made first, as it should be.
  fastify.addHook('onRequest', async (req, reply) => {
    const method = req.method
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
    const url = String(req.url || '').split('?')[0]
    const destructive =
      /^\/api\/devices\/[^/]+\/(fs(\/|$)|control$|block$|unblock$|disconnect$)/.test(url) ||
      (method === 'DELETE' && /^\/api\/devices\/[^/]+$/.test(url))
    if (!destructive) return
    const token = extractBearer(req)
    if (!token) return
    let payload = null
    try { payload = verifyToken(token) } catch { return }
    // R3-2 — رمز الوصول غير المراقب مقيَّد بجهاز واحد؛ القدرات تُفحص في كل مسار.
    if (payload && payload.role === 'unattended') return
    if (!atLeast(payload.role, 'manager')) {
      // الإيقاف الفعلي بـthrow: send() داخل خطّاف async لا يمنع تنفيذ المعالج
      // (اكتُشف بالاختبار: كان حذف الجهاز يُنفَّذ رغم وصول 403 للمستخدم).
      const err = new Error('Manager role required for device operations')
      err.statusCode = 403
      err.code = 'role_too_low'
      throw err
    }
  })

  // ── v3.4.0 harden + perf: security headers (HTML) + Brotli/Gzip + ETag + cache ──
  fastify.addHook('onSend', async (req, reply, payload) => {
    try {
      // R5 — ردود API حالة حيّة: لا تخزين في المتصفح ولا في أي
      // وسيط، ولا في كاش الضغط بالأسفل (المفتاح صار بصمة المحتوى).
      if (String((req.raw ? req.raw.url : req.url) || '').split('?')[0].startsWith('/api/')) reply.header('Cache-Control', 'no-store')
      if (TLS_ACTIVE) reply.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
      // v3.8.12 / R2 — nosniff لكل الردود (كان على HTML فقط)
      reply.header('X-Content-Type-Options', 'nosniff')
      const ct = String(reply.getHeader('content-type') || '')
      if (ct.includes('text/html')) {
        reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
        reply.header('X-Content-Type-Options', 'nosniff')
        reply.header('Referrer-Policy', 'no-referrer')
        reply.header('X-Frame-Options', 'SAMEORIGIN')
      }
    } catch {}
    return payload
  })
  const perfCache = new Map()
  fastify.addHook('onSend', async (req, reply, payload) => {
    try {
      const ct = String(reply.getHeader('content-type') || '')
      if (!ct || ct.includes('event-stream') || ct.includes('octet-stream') || ct.startsWith('image/') || ct.startsWith('audio/') || ct.startsWith('video/')) return payload
      if (!/text\/|application\/json|application\/javascript|xml|svg/.test(ct)) return payload
      if (reply.getHeader('content-encoding')) return payload
      let buf
      if (Buffer.isBuffer(payload)) buf = payload
      else if (typeof payload === 'string') buf = Buffer.from(payload)
      else if (payload && typeof payload.pipe === 'function') { const chunks = []; for await (const c of payload) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); buf = Buffer.concat(chunks) }
      else return payload
      if (buf.length < 1024 || buf.length > 6 * 1024 * 1024) return buf
      const urlPath = String(req.raw ? req.raw.url : req.url || '')
      const pathOnly = urlPath.split('?')[0]
      // R5 — لا تخزين لأي ردّ API: الردود تحمل حالة حيّة (إصدارات
      // الأجهزة، الجلسات، النقل). الكاش القديم كان يُفتح بمفتاح URL+الطول، فأي
      // ردّين متساويين في الطول يتبادلان الجسم المضغوط — وهو سبب ظهور إصدار
      // قديم لجهاز بعد تحديثه (عيب موثَّق في HANDOFF §5).
      const isHashed = /\/assets\/[^/]*-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(urlPath)
      const ae = String(req.headers['accept-encoding'] || '')
      // الأصول المبصومة فقط تُخزَّن بمفتاح المسار؛ الردود الديناميكية تُفتح ببصمة
      // المحتوى نفسه فلا يمكن أن يُخدَم جسم قديم تحت مفتاح جديد.
      const ck = isHashed ? (urlPath + ':' + buf.length) : crypto.createHash('sha1').update(buf).digest('hex')
      let out = perfCache.get(ck)
      if (!out) {
        out = { br: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }), gz: zlib.gzipSync(buf) }
        if (perfCache.size > 64) perfCache.clear()
        perfCache.set(ck, out)
      }
      if (isHashed) {
        const etag = 'W/"' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 24) + '"'
        reply.header('ETag', etag)
        reply.header('Cache-Control', 'public, max-age=31536000, immutable')
        if (req.headers['if-none-match'] === etag) { reply.code(304); return '' }
      }
      reply.header('Vary', 'Accept-Encoding')
      if (/\bbr\b/.test(ae)) { reply.header('Content-Encoding', 'br'); return out.br }
      if (/\bgzip\b/.test(ae)) { reply.header('Content-Encoding', 'gzip'); return out.gz }
      return buf
    } catch { return payload }
  })

  // Serve static React Dashboard if built
  const staticDir = path.join(__dirname, 'static')
  let hasDashboard = false
  if (fs.existsSync(path.join(staticDir, 'index.html'))) {
    try {
      await fastify.register(getFStatic(), { root: staticDir, prefix: '/', wildcard: false, decorateReply: false })
      hasDashboard = true
    } catch {}
  }

  // SPA fallback (v3.2.2 fix — reply.sendFile unavailable with decorateReply:false)
  if (hasDashboard) {
    const indexHtml = fs.readFileSync(path.join(staticDir, 'index.html'))
    fastify.setNotFoundHandler((req, reply) => {
      if (/^\/(api|ws|pty|ssh|screen)/.test(req.url)) return reply.code(404).send({ error: 'Not found' })
      reply.type('text/html').send(indexHtml)
    })
  }

  // ── v3.4.0 — Scheduled tasks (mini scheduler) ─────────────────────────────
  function taskNextDue(t, now) {
    if (t.daily_at && /^\d{1,2}:\d{2}$/.test(String(t.daily_at))) {
      const parts = String(t.daily_at).split(':')
      const today = new Date(now); today.setHours(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, 0, 0)
      const last = t.last_run_at ? new Date(t.last_run_at) : null
      if (now >= today && (!last || last < today)) return today.getTime()
      return today.getTime() + 86400000
    }
    if (Number(t.interval_min) > 0) {
      const last = t.last_run_at ? new Date(t.last_run_at).getTime() : 0
      const base = last || now.getTime()
      return base + Number(t.interval_min) * 60000
    }
    return null
  }
  async function runTask(t) {
    const startedAt = new Date().toISOString()
    let result = ''
    try {
      if (t.kind === 'ai') {
        const cfg = resolveAiConfig({})
        if (!cfg) throw new Error('AI غير مهيأ')
        const devCtx = t.device_id ? buildDeviceAiContext(t.device_id) : ''
        const sysMsg = { role: 'system', content: 'أنت منفّذ مهام مجدولة لمنصة AiRemote. نفّذ المهمة التالية واكتب ملخصاً موجزاً بالعربية لنتيجة الفحص أو التنفيذ.' + (devCtx ? '\n\n' + devCtx : '') }
        result = await callAI([sysMsg, { role: 'user', content: t.payload }], cfg)
      } else if (t.kind === 'exec') {
        if (!t.device_id) throw new Error('لا يوجد جهاز محدد')
        const r = await execOnDevice(t.device_id, t.payload, 60000)
        result = 'exit=' + (r.exitCode != null ? r.exitCode : '?') + '\n' + String(r.stdout || '').slice(0, 1500) + (r.stderr ? '\n[stderr] ' + String(r.stderr).slice(0, 400) : '')
      } else { result = 'نوع مهمة غير معروف' }
    } catch (e) { result = 'فشلت المهمة: ' + ((e && e.message) || e) }
    const txt = String(result || '').slice(0, 4000)
    try { db.prepare('UPDATE scheduled_tasks SET last_run_at=?, last_result=? WHERE id=?').run(startedAt, txt, t.id) } catch {}
    try { addNotification({ userId: t.user_id, deviceId: t.device_id || null, type: 'task', title: 'مهمة مجدولة — ' + t.name, message: txt.slice(0, 600), severity: 'info' }) } catch {}
    try { dbLogAudit({ userId: t.user_id, action: 'scheduled_task_run', deviceId: t.device_id || null, details: { task: t.name, kind: t.kind } }) } catch {}
  }
  let taskTimer = null
  if (!taskTimer) {
    taskTimer = setInterval(async () => {
      try {
        const now = new Date()
        const tasks = db.prepare('SELECT * FROM scheduled_tasks WHERE enabled=1').all()
        for (const t of tasks) {
          const nd = taskNextDue(t, now)
          if (nd == null) continue
          if (now.getTime() >= nd) {
            if (t.last_run_at && (now.getTime() - new Date(t.last_run_at).getTime()) < 45000) continue
            runTask(t).catch(() => {})
          }
        }
      } catch {}
    }, 45000)
  }

  fastify.get('/api/tasks', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const rows = db.prepare('SELECT * FROM scheduled_tasks WHERE user_id=? ORDER BY created_at DESC').all(p.userId)
    const now = new Date()
    return rows.map(r => ({ ...r, next_due: taskNextDue(r, now) }))
  })
  fastify.post('/api/tasks', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { name, kind = 'ai', deviceId = null, payload = '', intervalMin = 0, dailyAt = null, enabled = 1 } = req.body || {}
    if (!name || !payload) return reply.code(400).send({ error: 'name and payload required' })
    if (!['ai', 'exec'].includes(kind)) return reply.code(400).send({ error: 'kind must be ai|exec' })
    const id = uuidv4()
    db.prepare('INSERT INTO scheduled_tasks (id, user_id, name, kind, device_id, payload, interval_min, daily_at, enabled) VALUES (?,?,?,?,?,?,?,?,?)').run(id, p.userId, String(name).slice(0, 120), kind, deviceId || null, String(payload), parseInt(intervalMin) || 0, dailyAt || null, enabled ? 1 : 0)
    dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: deviceId || null, action: 'task_created', details: { name: String(name).slice(0, 120), kind }, ipAddress: req.ip })
    return { id }
  })
  fastify.put('/api/tasks/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const t = db.prepare('SELECT * FROM scheduled_tasks WHERE id=? AND user_id=?').get(req.params.id, p.userId)
    if (!t) return reply.code(404).send({ error: 'Not found' })
    const { name, deviceId, payload, intervalMin, dailyAt, enabled } = req.body || {}
    db.prepare('UPDATE scheduled_tasks SET name=?, device_id=?, payload=?, interval_min=?, daily_at=?, enabled=? WHERE id=?').run(
      name != null ? String(name).slice(0, 120) : t.name,
      deviceId !== undefined ? (deviceId || null) : t.device_id,
      payload != null ? String(payload) : t.payload,
      intervalMin != null ? (parseInt(intervalMin) || 0) : t.interval_min,
      dailyAt !== undefined ? (dailyAt || null) : t.daily_at,
      enabled != null ? (enabled ? 1 : 0) : t.enabled,
      t.id)
    return { ok: true }
  })
  fastify.delete('/api/tasks/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const t = db.prepare('SELECT * FROM scheduled_tasks WHERE id=? AND user_id=?').get(req.params.id, p.userId)
    if (!t) return reply.code(404).send({ error: 'Not found' })
    db.prepare('DELETE FROM scheduled_tasks WHERE id=?').run(t.id)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'task_deleted', details: { name: t.name }, ipAddress: req.ip })
    return { ok: true }
  })
  fastify.post('/api/tasks/:id/run', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const t = db.prepare('SELECT * FROM scheduled_tasks WHERE id=? AND user_id=?').get(req.params.id, p.userId)
    if (!t) return reply.code(404).send({ error: 'Not found' })
    runTask(t).catch(() => {})
    return { ok: true, started: true }
  })

  // ── Health ────────────────────────────────────────────────────────────────
  fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (req, body, done) => done(null, body))

  fastify.get('/api/health', async () => ({
    status: 'ok', version: SERVER_VERSION, uptime: Math.floor(process.uptime()),
    devices: { online: agentSockets.size, total: db.prepare("SELECT COUNT(*) as c FROM devices").get().c },
    port, localIp: getLocalIp(), isDesktop: true,
    addresses: (() => { try { const os = require('os'); const n = os.networkInterfaces(); const out = []; for (const k of Object.keys(n)) for (const a of (n[k] || [])) if (a.family === 'IPv4' && !a.internal) out.push(a.address); return out } catch { return [] } })(),
  }))

  // v3.7.0 — /health must answer JSON on the desktop build too
  fastify.get('/health', async () => ({
    status: 'ok', version: SERVER_VERSION, tls: TLS_ACTIVE,
    uptime: Math.floor(process.uptime()), port, isDesktop: true
  }))

  // v3.8.28 (R7) - readiness. /health says the process is alive; /ready says it can
  // actually serve a session: database reachable, schema present, not shutting down.
  fastify.get('/ready', async (req, reply) => {
    const checks = {}
    let ok = true
    try {
      const row = db.prepare('SELECT 1 AS one').get()
      checks.db = row && Number(row.one) === 1 ? 'ok' : 'empty'
    } catch (e) { checks.db = 'error'; }
    if (checks.db !== 'ok') ok = false
    try {
      const c = db.prepare('SELECT COUNT(*) AS c FROM devices').get()
      checks.schema = c && Number(c.c) >= 0 ? 'ok' : 'empty'
    } catch (e) { checks.schema = 'missing'; }
    if (checks.schema !== 'ok') ok = false
    if (shuttingDown) checks.shutdown = 'in-progress'
    if (shuttingDown) ok = false
    reply.code(ok ? 200 : 503).header('cache-control', 'no-store')
    return { ready: ok, version: SERVER_VERSION, uptime: Math.floor(process.uptime()), checks }
  })

  // v3.8.28 (R7) - Prometheus text format. Authenticated: counts are operational
  // data, not public. Labels are fixed or derived from a bounded set.
  fastify.get('/metrics', async (req, reply) => {
    const user = authMiddleware(req, reply); if (!user) return
    const out = []
    const v = (name, help, type, value, labels) => {
      out.push('# HELP ' + name + ' ' + help)
      out.push('# TYPE ' + name + ' ' + type)
      out.push(name + (labels ? '{' + labels + '}' : '') + ' ' + value)
    }
    let devicesTotal = 0
    try { devicesTotal = Number(db.prepare('SELECT COUNT(*) AS c FROM devices').get().c) || 0 } catch { }
    let viewers = 0
    try { for (const sess of screenSessions.values()) viewers += sess && sess.viewers ? sess.viewers.size : 0 } catch { }
    const relayByState = new Map()
    try { for (const sess of relaySessions.values()) { const st = sess.state || 'unknown'; relayByState.set(st, (relayByState.get(st) || 0) + 1) } } catch { }

    v('airemote_up', '1 while the server answers HTTP.', 'gauge', 1)
    v('airemote_uptime_seconds', 'Process uptime in seconds.', 'gauge', Math.floor(process.uptime()))
    out.push('# HELP airemote_info Build and runtime identity.')
    out.push('# TYPE airemote_info gauge')
    out.push('airemote_info{version="' + SERVER_VERSION + '",engine="' + String(db.__engine || 'better-sqlite3')
      + '",tls="' + (TLS_ACTIVE ? 1 : 0) + '"} 1')
    v('airemote_devices_total', 'Devices known to the server.', 'gauge', devicesTotal)
    v('airemote_devices_online', 'Devices with a live agent socket.', 'gauge', agentSockets.size)
    v('airemote_ws_clients', 'Dashboard websocket clients.', 'gauge', clientSockets.size)
    v('airemote_screen_sessions', 'Active screen capture sessions.', 'gauge', screenSessions.size)
    v('airemote_screen_viewers', 'Sockets watching a screen session.', 'gauge', viewers)
    {
      let csEnabled = 0, csEvents = 0, csBlocked = 0, csDup = 0
      for (const cs of clipboardSync.values()) {
        if (cs.enabled) csEnabled++
        csEvents += (cs.sent || 0) + (cs.received || 0)
        csBlocked += cs.blocked || 0
        csDup += cs.duplicates || 0
      }
      v('airemote_clipboard_sync_enabled', 'Devices with one-way clipboard sync on.', 'gauge', csEnabled)
      v('airemote_clipboard_sync_events_total', 'Clipboard transfers in either direction since start.', 'counter', csEvents)
      v('airemote_clipboard_sync_blocked_total', 'Changes dropped because the one-way direction forbids them.', 'counter', csBlocked)
      v('airemote_clipboard_sync_duplicates_total', 'Identical clipboard payloads skipped (echo guard).', 'counter', csDup)
    }
    out.push('# HELP airemote_relay_sessions Relay sessions by state.')
    out.push('# TYPE airemote_relay_sessions gauge')
    const known = ['requested', 'active', 'suspended', 'closed', 'denied', 'expired']
    const extra = [...relayByState.keys()].filter(k => known.indexOf(k) < 0)
    for (const st of known.concat(extra)) {
      const n = relayByState.get(st) || 0
      if (known.indexOf(st) >= 0 || n > 0) out.push('airemote_relay_sessions{state="' + st + '"} ' + n)
    }
    out.push('# HELP airemote_http_requests_total HTTP responses by method and status.')
    out.push('# TYPE airemote_http_requests_total counter')
    for (const entry of [...metrics.http.entries()].sort()) {
      const sp = entry[0].indexOf(' ')
      out.push('airemote_http_requests_total{method="' + entry[0].slice(0, sp)
        + '",status="' + entry[0].slice(sp + 1) + '"} ' + entry[1])
    }
    out.push('# HELP airemote_http_request_duration_seconds_sum Total response time in seconds.')
    out.push('# TYPE airemote_http_request_duration_seconds_sum counter')
    out.push('airemote_http_request_duration_seconds_sum ' + metrics.httpSecondsSum.toFixed(6))
    out.push('# HELP airemote_http_request_duration_seconds_count Responses timed.')
    out.push('# TYPE airemote_http_request_duration_seconds_count counter')
    out.push('airemote_http_request_duration_seconds_count ' + metrics.httpCount)
    v('airemote_errors_total', 'Unhandled errors and responses with status >= 500.', 'counter', metrics.errors)
    v('airemote_annotation_events_total', 'Laser/annotation events relayed between viewers.', 'counter', metrics.annotationEvents || 0)
    if (failureAlerter) {
      const as = failureAlerter.state()
      v('airemote_alert_events_total', 'Burst alerts raised since start.', 'counter', as.alerts)
      v('airemote_alert_recent_failures', 'Failures inside the alerting window.', 'gauge', as.recent)
    }
    if (retention) {
      const rs = retention.preview()
      v('airemote_recordings_rows', 'Recordings kept.', 'gauge', rs.recordings.total)
      v('airemote_recordings_megabytes', 'Size of kept recordings in MB.', 'gauge', rs.recordings.totalMb)
      v('airemote_retention_expired_recordings', 'Recordings past the retention window.', 'gauge', rs.recordings.expired)
      v('airemote_retention_expired_audit_rows', 'Audit rows past the retention window.', 'gauge', rs.audit.expired)
      v('airemote_retention_failures_total', 'Failed retention runs since start.', 'counter', retention.state().failures)
    }
    v('airemote_update_available', '1 when a newer verified package is in the update folder.', 'gauge',
      updateState.verdict && updateState.verdict.available ? 1 : 0)
    v('airemote_update_last_check_seconds', 'Age of the last update check, -1 when never checked.', 'gauge',
      updateState.at ? Math.round((Date.now() - updateState.at) / 1000) : -1)
    if (backupManager) {
      const bs = backupManager.state()
      v('airemote_backup_files', 'Snapshots kept on disk.', 'gauge', bs.files)
      v('airemote_backup_age_seconds', 'Age of the newest verified snapshot, -1 when none.', 'gauge',
        bs.ageSeconds === null ? -1 : bs.ageSeconds)
      v('airemote_backup_failures_total', 'Failed snapshot attempts since start.', 'counter', bs.failures)
    }
    reply.type('text/plain; version=0.0.4; charset=utf-8').header('cache-control', 'no-store')
    return out.join('\n') + '\n'
  })

  // ── GET /api/agent/allowed — lets a kicked agent poll whether it may reconnect ──
  fastify.get('/api/agent/allowed', async (req, reply) => {
    const token = String((req.query && req.query.token) || '')
    if (!token) return reply.code(400).send({ error: 'token required' })
    const d = db.prepare('SELECT status FROM devices WHERE token=?').get(token)
    if (!d) return reply.code(404).send({ error: 'unknown device' })
    return { allowed: d.status !== 'blocked' }
  })

  // ── Setup ─────────────────────────────────────────────────────────────────
  fastify.get('/api/setup/check', async () => {
    const { c } = db.prepare("SELECT COUNT(*) as c FROM users").get()
    return { needsSetup: c === 0, setupRequired: c === 0 }
  })

  fastify.post('/api/setup/init', async (req, reply) => {
    const { email, password, name = 'Admin' } = req.body || {}
    if (!email || !password) return reply.code(400).send({ error: 'email and password required' })
    if (password.length < 12) return reply.code(400).send({ error: 'Password must be at least 12 characters' })
    const { c } = db.prepare("SELECT COUNT(*) as c FROM users").get()
    if (c > 0) return reply.code(400).send({ error: 'Already initialized' })
    const hash = await bcrypt.hash(password, 12); const id = uuidv4()
    db.prepare("INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)").run(id, email, name, 'admin', hash)
    const accessToken  = signToken({ userId: id, email, role: 'admin' })
    const refreshToken = uuidv4()
    const refreshHash  = crypto.createHash('sha256').update(refreshToken).digest('hex')
    db.prepare("INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)").run(uuidv4(), id, refreshHash, new Date(Date.now() + 30 * 24 * 3600000).toISOString())
    dbLogAudit({ userId: id, userEmail: email, action: 'setup_completed', ipAddress: req.ip })
    return { accessToken, token: accessToken, refreshToken, user: { id, email, name, role: 'admin' } }
  })

  // ── Auth ──────────────────────────────────────────────────────────────────
  // v3.2.2 — Dashboard aliases (auth/setup-status, auth/setup)
  fastify.get('/api/auth/setup-status', async () => {
    const { c } = db.prepare("SELECT COUNT(*) as c FROM users").get()
    return { needsSetup: c === 0, setupRequired: c === 0 }
  })

  fastify.post('/api/auth/setup', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, password, name = 'Admin' } = req.body || {}
    if (!email || !password) return reply.code(400).send({ error: 'email and password required' })
    if (password.length < 12) return reply.code(400).send({ error: 'Password must be at least 12 characters' })
    const { c } = db.prepare("SELECT COUNT(*) as c FROM users").get()
    if (c > 0) return reply.code(400).send({ error: 'Already initialized' })
    const hash = await bcrypt.hash(password, 12); const id = uuidv4()
    db.prepare("INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)").run(id, email, name, 'admin', hash)
    const accessToken  = signToken({ userId: id, email, role: 'admin' })
    const refreshToken = uuidv4()
    const refreshHash  = crypto.createHash('sha256').update(refreshToken).digest('hex')
    db.prepare("INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)").run(uuidv4(), id, refreshHash, new Date(Date.now() + 30 * 24 * 3600000).toISOString())
    dbLogAudit({ userId: id, userEmail: email, action: 'setup_completed', ipAddress: req.ip })
    return { accessToken, token: accessToken, refreshToken, user: { id, email, name, role: 'admin' } }
  })

  fastify.post('/api/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, password } = req.body || {}
    if (!email || !password) return reply.code(400).send({ error: 'Email and password required' })
    const user = db.prepare("SELECT * FROM users WHERE email=?").get(email)
    if (!user) { dbLogAudit({ action: 'login_failed', userEmail: email, ipAddress: req.ip }); return reply.code(401).send({ error: 'بيانات الدخول غير صحيحة' }) }
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) { dbLogAudit({ userId: user.id, userEmail: email, action: 'login_failed', ipAddress: req.ip }); return reply.code(401).send({ error: 'بيانات الدخول غير صحيحة' }) }
    if (user.totp_enabled && user.totp_secret) {
      const totpToken = signToken({ userId: user.id, email: user.email, role: user.role, purpose: 'totp_verify' }, '5m')
      return { requiresTOTP: true, totpToken }
    }
    const accessToken  = signToken({ userId: user.id, email: user.email, role: user.role })
    const refreshToken = uuidv4()
    db.prepare("INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)").run(uuidv4(), user.id, crypto.createHash('sha256').update(refreshToken).digest('hex'), new Date(Date.now() + 30 * 24 * 3600000).toISOString())
    dbLogAudit({ userId: user.id, userEmail: user.email, action: 'login_success', ipAddress: req.ip })
    return { accessToken, token: accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })

  fastify.post('/api/auth/login/verify-totp', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { totpToken, code } = req.body || {}
    if (!totpToken || !code) return reply.code(400).send({ error: 'totpToken and code required' })
    let payload; try { payload = verifyToken(totpToken) } catch { return reply.code(401).send({ error: 'Invalid token' }) }
    if (payload.purpose !== 'totp_verify') return reply.code(401).send({ error: 'Invalid token purpose' })
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(payload.userId)
    if (!user?.totp_secret) return reply.code(404).send({ error: 'User not found' })
    const valid = getAuthenticator().check(code.replace(/\s/g, ''), user.totp_secret)
    if (!valid) return reply.code(401).send({ error: 'Invalid TOTP code' })
    const accessToken  = signToken({ userId: user.id, email: user.email, role: user.role })
    const refreshToken = uuidv4()
    db.prepare("INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)").run(uuidv4(), user.id, crypto.createHash('sha256').update(refreshToken).digest('hex'), new Date(Date.now() + 30 * 24 * 3600000).toISOString())
    dbLogAudit({ userId: user.id, userEmail: user.email, action: 'login_success', details: { via: '2fa' }, ipAddress: req.ip })
    return { accessToken, token: accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })

  fastify.post('/api/auth/refresh', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { refreshToken } = req.body || {}
    if (!refreshToken) return reply.code(400).send({ error: 'refreshToken required' })
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    const row  = db.prepare("SELECT * FROM refresh_tokens WHERE token_hash=? AND expires_at > ?").get(hash, new Date().toISOString())
    if (!row) return reply.code(401).send({ error: 'Invalid or expired refresh token' })
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(row.user_id)
    if (!user) return reply.code(401).send({ error: 'User not found' })
    // v3.2.2 — تدوير الرمز (single-use) + alias للواجهة
    db.prepare("DELETE FROM refresh_tokens WHERE id=?").run(row.id)
    const newRefreshToken = uuidv4()
    db.prepare("INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)").run(uuidv4(), user.id, crypto.createHash('sha256').update(newRefreshToken).digest('hex'), new Date(Date.now() + 30 * 24 * 3600000).toISOString())
    const accessToken = signToken({ userId: user.id, email: user.email, role: user.role })
    return { accessToken, token: accessToken, refreshToken: newRefreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })

  fastify.get('/api/auth/me', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const u = db.prepare("SELECT id, email, name, role, totp_enabled, created_at FROM users WHERE id=?").get(p.userId)
    if (!u) return reply.code(404).send({ error: 'Not found' })
    return u
  })

  fastify.post('/api/auth/ws-ticket', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const ticketId = uuidv4()
    wsTickets.set(ticketId, { ...p, expires: Date.now() + 30_000 })
    setTimeout(() => wsTickets.delete(ticketId), 31_000)
    return { ticket: ticketId }
  })

  fastify.post('/api/auth/logout', async (req) => {
    const { refreshToken } = req.body || {}
    if (refreshToken) db.prepare("DELETE FROM refresh_tokens WHERE token_hash=?").run(crypto.createHash('sha256').update(refreshToken).digest('hex'))
    return { ok: true }
  })

  fastify.post('/api/auth/change-password', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { currentPassword, newPassword } = req.body || {}
    if (!currentPassword || !newPassword) return reply.code(400).send({ error: 'Both passwords required' })
    if (newPassword.length < 12) return reply.code(400).send({ error: 'Min 12 characters' })
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(p.userId)
    if (!await bcrypt.compare(currentPassword, user.password_hash)) return reply.code(401).send({ error: 'Incorrect current password' })
    db.prepare("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?").run(await bcrypt.hash(newPassword, 12), p.userId)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'password_changed', ipAddress: req.ip })
    return { ok: true }
  })

  // ── 2FA ───────────────────────────────────────────────────────────────────
  fastify.get('/api/auth/2fa/status', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const u = db.prepare('SELECT totp_enabled FROM users WHERE id=?').get(p.userId)
    return { enabled: !!(u && u.totp_enabled) }
  })

  fastify.post('/api/auth/2fa/setup', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const user   = db.prepare("SELECT email FROM users WHERE id=?").get(p.userId)
    const secret = getAuthenticator().generateSecret()
    db.prepare("UPDATE users SET totp_secret=? WHERE id=?").run(secret, p.userId)
    const otpUrl    = getAuthenticator().keyuri(user.email, 'AiRemote', secret)
    const qrCodeUrl = await getQRCode().toDataURL(otpUrl)
    return { secret, otpUrl, qrCodeUrl }
  })

  fastify.post('/api/auth/2fa/enable', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { code } = req.body || {}
    if (!code) return reply.code(400).send({ error: 'code required' })
    const user = db.prepare("SELECT totp_secret FROM users WHERE id=?").get(p.userId)
    if (!user?.totp_secret) return reply.code(400).send({ error: 'Run /2fa/setup first' })
    if (!getAuthenticator().check(code.replace(/\s/g, ''), user.totp_secret)) return reply.code(400).send({ error: 'Invalid code' })
    db.prepare("UPDATE users SET totp_enabled=1, updated_at=datetime('now') WHERE id=?").run(p.userId)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: '2fa_enabled', ipAddress: req.ip })
    return { ok: true }
  })

  fastify.post('/api/auth/2fa/disable', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { password } = req.body || {}
    if (!password) return reply.code(400).send({ error: 'password required' })
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(p.userId)
    if (!await bcrypt.compare(password, user.password_hash)) return reply.code(401).send({ error: 'Incorrect password' })
    db.prepare("UPDATE users SET totp_enabled=0, totp_secret=NULL, updated_at=datetime('now') WHERE id=?").run(p.userId)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: '2fa_disabled', ipAddress: req.ip })
    return { ok: true }
  })

  // ── Users ─────────────────────────────────────────────────────────────────
  fastify.get('/api/users', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    return db.prepare("SELECT id, email, name, role, totp_enabled, created_at, updated_at FROM users ORDER BY created_at").all()
      .map(u => ({ ...u, totpEnabled: !!u.totp_enabled, createdAt: u.created_at, updatedAt: u.updated_at }))
  })

  fastify.post('/api/users', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    const { email, name, password, role = 'viewer' } = req.body || {}
    if (!email || !name || !password) return reply.code(400).send({ error: 'email, name, password required' })
    if (password.length < 12) return reply.code(400).send({ error: 'Min 12 characters' })
    if (!USER_ROLES.includes(role)) return reply.code(400).send({ error: 'Invalid role', allowed: USER_ROLES })
    if (db.prepare("SELECT id FROM users WHERE email=?").get(email)) return reply.code(409).send({ error: 'Email already exists' })
    const id = uuidv4()
    db.prepare("INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)").run(id, email, name, role, await bcrypt.hash(password, 12))
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'user_created', details: { email, name, role }, ipAddress: req.ip })
    return reply.code(201).send({ id, email, name, role })
  })

  fastify.patch('/api/users/:id', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    const { name, role, password } = req.body || {}
    const existing = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id)
    if (!existing) return reply.code(404).send({ error: 'User not found' })
    // 3.9.2 — تحقق من الدور، وأبطل رموز التحديث عند تغيير كلمة المرور أو الدور.
    if (role && !USER_ROLES.includes(role)) return reply.code(400).send({ error: 'Invalid role', allowed: USER_ROLES })
    if (password) {
      if (password.length < 12) return reply.code(400).send({ error: 'Min 12 characters' })
      db.prepare("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?").run(await bcrypt.hash(password, 12), req.params.id)
      try { db.prepare('DELETE FROM refresh_tokens WHERE user_id=?').run(req.params.id) } catch {}
    }
    if (role && role !== existing.role) {
      try { db.prepare('DELETE FROM refresh_tokens WHERE user_id=?').run(req.params.id) } catch {}
    }
    const updates = []; const vals = []
    if (name) { updates.push('name=?'); vals.push(name) }
    if (role) { updates.push('role=?'); vals.push(role) }
    if (updates.length) { updates.push("updated_at=datetime('now')"); vals.push(req.params.id); db.prepare(`UPDATE users SET ${updates.join(',')} WHERE id=?`).run(...vals) }
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'user_updated', details: { targetId: req.params.id, name, role }, ipAddress: req.ip })
    return db.prepare("SELECT id, email, name, role, totp_enabled, created_at FROM users WHERE id=?").get(req.params.id)
  })

  fastify.delete('/api/users/:id', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    if (req.params.id === p.userId) return reply.code(400).send({ error: 'Cannot delete yourself' })
    const existing = db.prepare("SELECT email FROM users WHERE id=?").get(req.params.id)
    if (!existing) return reply.code(404).send({ error: 'User not found' })
    // 3.9.2 (H2) — لا تترك جلسات حيّة بعد حذف المستخدم.
    const closed = relayCloseForPrincipal({ userId: req.params.id })
    db.prepare("DELETE FROM users WHERE id=?").run(req.params.id)
    db.prepare("DELETE FROM refresh_tokens WHERE user_id=?").run(req.params.id)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'user_deleted', details: { email: existing.email, closedSessions: closed }, ipAddress: req.ip })
    return reply.code(204).send()
  })

  // ── Sessions ──────────────────────────────────────────────────────────────
  // ── v3.8.38 (R8.3) — سجل جلسات قابل للبحث والتصدير ────────────────────────
  // Filters run in SQL, never in the browser: an export must be the whole filtered
  // set, and a non-admin may only ever see their own rows.
  const SESSION_BASE = "SELECT s.*, d.name as device_name, u.email as user_email FROM sessions s LEFT JOIN devices d ON s.device_id=d.id LEFT JOIN users u ON s.user_id=u.id"
  function sessionWhere(p, q) {
    const where = [], args = []
    if (p.role !== 'admin') { where.push('s.user_id = ?'); args.push(p.userId) }
    if (q.type)   { where.push('s.type = ?'); args.push(String(q.type).slice(0, 20)) }
    if (q.status === 'active') where.push('s.ended_at IS NULL')
    else if (q.status === 'ended') where.push('s.ended_at IS NOT NULL')
    if (q.deviceId) { where.push('s.device_id = ?'); args.push(String(q.deviceId).slice(0, 64)) }
    if (q.from)   { where.push('s.started_at >= ?'); args.push(String(q.from).slice(0, 40)) }
    if (q.to)     { where.push('s.started_at <= ?'); args.push(String(q.to).slice(0, 40)) }
    if (q.q) {
      // Wildcards are stripped, not escaped: the box is a text lookup, not a pattern.
      const term = '%' + String(q.q).slice(0, 80).replace(/[%_]/g, ' ') + '%'
      where.push("(COALESCE(d.name,'') LIKE ? OR COALESCE(u.email,'') LIKE ? OR COALESCE(s.type,'') LIKE ? OR s.id LIKE ? OR COALESCE(s.device_id,'') LIKE ?)")
      args.push(term, term, term, term, term)
    }
    return { clause: where.length ? ' WHERE ' + where.join(' AND ') : '', args }
  }

  fastify.get('/api/sessions', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const q = req.query || {}
    const limit  = Math.min(parseInt(q.limit || '100') || 100, 500)
    const offset = Math.max(0, parseInt(q.offset || '0') || 0)
    const { clause, args } = sessionWhere(p, q)
    const rows = db.prepare(SESSION_BASE + clause + ' ORDER BY s.started_at DESC LIMIT ? OFFSET ?').all(...args, limit, offset)
    return rows.map(mapSessionRow)
  })

  fastify.get('/api/sessions/export', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!atLeast(p.role, 'manager')) return reply.code(403).send({ error: 'Manager role required', code: 'role_too_low' })
    const q = req.query || {}
    const { clause, args } = sessionWhere(p, q)
    const rows = db.prepare(SESSION_BASE + clause + ' ORDER BY s.started_at DESC LIMIT 5000').all(...args)
    const esc = (v) => {
      const s = v == null ? '' : String(v)
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const header = ['id', 'type', 'started_at', 'ended_at', 'duration_sec', 'duration_min', 'device_id', 'device', 'user', 'status']
    const lines = [header.join(',')]
    for (const r of rows) {
      lines.push([
        r.id,
        r.type,
        r.started_at,
        r.ended_at || '',
        r.duration_sec != null ? r.duration_sec : '',
        r.duration_sec != null ? (Number(r.duration_sec) / 60).toFixed(1) : '',
        r.device_id,
        r.device_name || '',
        r.user_email || '',
        r.ended_at ? 'ended' : 'active'
      ].map(esc).join(','))
    }
    dbLogAudit({
      userId: p.userId, userEmail: p.email, action: 'sessions_export',
      details: { rows: rows.length, type: q.type || null, status: q.status || null, hasQuery: !!q.q, from: q.from || null, to: q.to || null },
      ipAddress: req.ip
    })
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="airemote-sessions-' + new Date().toISOString().slice(0, 10) + '.csv"')
    // BOM so Excel opens Arabic device names as UTF-8 instead of mojibake.
    return '\uFEFF' + lines.join('\r\n') + '\r\n'
  })

  // v3.2.2 — Live screen sessions (admin)
  fastify.get('/api/sessions/screen/active', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (p.role !== 'admin') return reply.code(403).send({ error: 'Admin only' })
    const out = []
    for (const [sid2, s] of screenSessions) {
      const rec2 = agentSockets.get(s.deviceId)
      out.push({ sessionId: sid2, deviceId: s.deviceId, deviceName: (rec2 && rec2.deviceName) || s.deviceId, userId: s.userId || null, viewers: s.viewers.size, startedAt: new Date(s.startedAt).toISOString() })
    }
    return out
  })

  fastify.delete('/api/sessions/screen/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (p.role !== 'admin') return reply.code(403).send({ error: 'Admin only' })
    const s = screenSessions.get(req.params.id)
    if (!s) return reply.code(404).send({ error: 'Session not found' })
    const rec2 = agentSockets.get(s.deviceId)
    if (rec2) sendJson(rec2.ws, { type: 'server:screen_stop', payload: { sessionId: req.params.id }, timestamp: Date.now() })
    try { dbLogSessionEnd(s.dbId) } catch {}
    try { finalizeScreenRecording(s.deviceId) } catch {}
    closeScreenSession(req.params.id, 'أوقفت الجلسة من قِبل المشرف / Stopped by admin')
    return { ok: true }
  })

  fastify.delete('/api/sessions/:id', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    const s = db.prepare("SELECT id FROM sessions WHERE id=?").get(req.params.id)
    if (!s) return reply.code(404).send({ error: 'Session not found' })
    db.prepare("UPDATE sessions SET ended_at=datetime('now') WHERE id=?").run(req.params.id)
    return { ok: true }
  })

  // ── Devices ───────────────────────────────────────────────────────────────
  fastify.get('/api/devices', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const rows = accessibleDeviceRows(p)
    return rows.map(d => {
      const online = agentSockets.has(d.id)
      const rm = (agentSockets.get(d.id)?.ws?._socket?.remoteAddress || null)
      const rmClean = rm ? String(rm).replace('::ffff:', '') : null
      const info = parseJson(d.info) || {}
      if (!info.ipPublic && rmClean) info.ipPublic = rmClean
      const tunnelLayer = rmClean ? (/^10\.90\./.test(rmClean) ? 'zerotier' : (/^(192\.168\.|10\.)/.test(rmClean) ? 'lan' : 'wan')) : null
      return {
        ...d, code: d.code || ensureDeviceCode(d.id) || null, info, tags: parseJson(d.tags, []),
        capabilities: parseJson(d.capabilities, {}), isOnline: online,
        status: d.status === 'blocked' ? 'blocked' : (online ? 'online' : 'offline'),
        remoteIp: rmClean, tunnelLayer,
        stats: agentSockets.get(d.id)?.stats || null,
      }
    })
  })

  fastify.post('/api/devices/:id/disconnect', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!isDeviceOwnerOrAdmin(p, req.params.id)) return reply.code(403).send({ error: 'المالك أو المدير فقط يدير الجهاز', code: 'owner_required' })
    const d = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id)
    if (!d) return reply.code(404).send({ error: 'Not found' })
    const rec = agentSockets.get(req.params.id)
    if (rec && rec.ws) { try { rec.ws.close(4001, 'kicked') } catch {} }
    db.prepare("UPDATE devices SET status='offline' WHERE id=?").run(req.params.id)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'device_disconnected', deviceId: req.params.id, details: { name: d.name }, ipAddress: req.ip })
    return { ok: true }
  })

  fastify.post('/api/devices/:id/block', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!isDeviceOwnerOrAdmin(p, req.params.id)) return reply.code(403).send({ error: 'المالك أو المدير فقط يدير الجهاز', code: 'owner_required' })
    const d = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id)
    if (!d) return reply.code(404).send({ error: 'Not found' })
    const rec = agentSockets.get(req.params.id)
    if (rec && rec.ws) { try { rec.ws.close(4001, 'kicked') } catch {} }
    db.prepare("UPDATE devices SET status='blocked' WHERE id=?").run(req.params.id)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'device_blocked', deviceId: req.params.id, details: { name: d.name }, ipAddress: req.ip })
    return { ok: true, status: 'blocked' }
  })

  fastify.post('/api/devices/:id/unblock', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!isDeviceOwnerOrAdmin(p, req.params.id)) return reply.code(403).send({ error: 'المالك أو المدير فقط يدير الجهاز', code: 'owner_required' })
    const d = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id)
    if (!d) return reply.code(404).send({ error: 'Not found' })
    db.prepare("UPDATE devices SET status='offline' WHERE id=?").run(req.params.id)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'device_unblocked', deviceId: req.params.id, details: { name: d.name }, ipAddress: req.ip })
    return { ok: true, status: 'offline' }
  })

  fastify.post('/api/devices', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { name, tags = [] } = req.body || {}
    if (!name) return reply.code(400).send({ error: 'name required' })
    const id = uuidv4(); const token = uuidv4()
    db.prepare("INSERT INTO devices (id, name, token, owner_id, tags) VALUES (?,?,?,?,?)").run(id, name, token, p.userId, JSON.stringify(tags))
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'device_created', details: { name }, ipAddress: req.ip })
    return reply.code(201).send({ id, name, token, tags, status: 'offline', isOnline: false })
  })

  // ── v3.8.12 / R3 — الاتصال بمعرّف قصير ─────────────────────────────────────
  fastify.get('/api/devices/by-code/:code', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const dev = deviceByCode(req.params.code)
    // لا نكشف وجود جهاز لا يملك المستخدم صلاحيته
    if (!dev || !canAccessDevice(p, dev.id)) return reply.code(404).send({ error: 'لا يوجد جهاز بهذا المعرّف' })
    return {
      id: dev.id, name: dev.name, code: dev.code, status: dev.status,
      isOnline: agentSockets.has(dev.id), ownerId: dev.owner_id,
    }
  })

  // ── v3.8.12 / R3 — دفتر العناوين (ملكي لكل مستخدم) ────────────────────────
  fastify.get('/api/contacts', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const q = String(req.query?.q || '').trim().toLowerCase()
    const rows = db.prepare('SELECT * FROM contacts WHERE owner_id=? ORDER BY favorite DESC, display_name COLLATE NOCASE').all(p.userId)
    const mapped = rows.map(c => ({
      id: c.id, displayName: c.display_name, deviceId: c.device_id, deviceCode: c.device_code,
      group: c.group_name, favorite: !!c.favorite, note: c.note,
      device: c.device_id ? (() => { const d = db.prepare('SELECT id,name,status FROM devices WHERE id=?').get(c.device_id); return d ? { ...d, isOnline: agentSockets.has(d.id) } : null })() : null,
      createdAt: c.created_at, updatedAt: c.updated_at,
    }))
    if (!q) return mapped
    return mapped.filter(c => (c.displayName || '').toLowerCase().includes(q) || String(c.deviceCode || '').includes(q) || String(c.group || '').toLowerCase().includes(q))
  })

  fastify.post('/api/contacts', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const b = req.body || {}
    const displayName = String(b.displayName || '').trim()
    if (!displayName) return reply.code(400).send({ error: 'displayName required' })
    if (displayName.length > 120) return reply.code(400).send({ error: 'displayName too long' })
    let deviceId = b.deviceId ? String(b.deviceId) : null
    let deviceCode = b.deviceCode ? String(b.deviceCode).replace(/\D/g, '') : null
    if (deviceId) {
      const d = db.prepare('SELECT id, code FROM devices WHERE id=?').get(deviceId)
      if (!d) return reply.code(404).send({ error: 'الجهاز غير موجود' })
      if (!canAccessDevice(p, deviceId)) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذا الجهاز' })
      deviceCode = deviceCode || d.code || ensureDeviceCode(deviceId)
    } else if (deviceCode) {
      if (deviceCode.length !== 9) return reply.code(400).send({ error: 'deviceCode must be 9 digits' })
      const d = deviceByCode(deviceCode)
      if (d) deviceId = d.id
    } else {
      return reply.code(400).send({ error: 'deviceId or deviceCode required' })
    }
    const id = uuidv4()
    db.prepare('INSERT INTO contacts (id, owner_id, display_name, device_id, device_code, group_name, favorite, note) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, p.userId, displayName, deviceId, deviceCode, b.group ? String(b.group) : null, b.favorite ? 1 : 0, b.note ? String(b.note) : null)
    dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId, action: 'contact_created', details: { displayName }, ipAddress: req.ip })
    return { ok: true, id }
  })

  fastify.patch('/api/contacts/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const row = db.prepare('SELECT * FROM contacts WHERE id=?').get(req.params.id)
    if (!row || row.owner_id !== p.userId) return reply.code(404).send({ error: 'Not found' })
    const b = req.body || {}
    const sets = [], vals = []
    if (b.displayName !== undefined) { const n = String(b.displayName).trim(); if (!n) return reply.code(400).send({ error: 'displayName empty' }); sets.push('display_name=?'); vals.push(n) }
    if (b.group !== undefined) { sets.push('group_name=?'); vals.push(b.group ? String(b.group) : null) }
    if (b.favorite !== undefined) { sets.push('favorite=?'); vals.push(b.favorite ? 1 : 0) }
    if (b.note !== undefined) { sets.push('note=?'); vals.push(b.note ? String(b.note) : null) }
    if (!sets.length) return reply.code(400).send({ error: 'nothing to update' })
    sets.push("updated_at=datetime('now')")
    db.prepare(`UPDATE contacts SET ${sets.join(',')} WHERE id=? AND owner_id=?`).run(...vals, row.id, p.userId)
    return { ok: true }
  })

  fastify.delete('/api/contacts/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const row = db.prepare('SELECT id, owner_id, display_name FROM contacts WHERE id=?').get(req.params.id)
    if (!row || row.owner_id !== p.userId) return reply.code(404).send({ error: 'Not found' })
    db.prepare('DELETE FROM contacts WHERE id=? AND owner_id=?').run(row.id, p.userId)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'contact_deleted', details: { displayName: row.display_name }, ipAddress: req.ip })
    return { ok: true }
  })
  // ── v3.8.12 / R3-2 — الوصول غير المراقب (كلمة مرور لكل جهاز) ───────────────
  // ── v3.8.36 / R8 — حالة مزامنة الحافظة أحادية الاتجاه (قراءة/ضبط) ─────────
  fastify.get('/api/devices/:id/clipboard-sync', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!canAccessDevice(p, req.params.id)) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذا الجهاز' })
    return Object.assign({ ok: true, deviceId: req.params.id }, clipboardPublic(clipboardState(req.params.id)))
  })

  fastify.post('/api/devices/:id/clipboard-sync', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!atLeast(p.role, 'manager')) return reply.code(403).send({ error: 'Manager role required', code: 'role_too_low' })
    if (!canAccessDevice(p, req.params.id)) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذا الجهاز' })
    const body = req.body || {}
    if (body.direction !== undefined && body.direction !== 'to-device' && body.direction !== 'to-viewer') {
      return reply.code(400).send({ error: 'direction must be to-device or to-viewer', code: 'bad_direction' })
    }
    if (body.enabled === true && !agentSockets.get(req.params.id)) return reply.code(409).send({ error: 'الجهاز غير متصل', code: 'device_offline' })
    const s = clipboardSet(req.params.id, { enabled: body.enabled, direction: body.direction }, p.email)
    dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: req.params.id, action: 'clipboard_sync_set', details: { enabled: s.enabled, direction: s.direction, via: 'api' }, ipAddress: req.ip })
    return Object.assign({ ok: true, deviceId: req.params.id }, clipboardPublic(s))
  })

  fastify.get('/api/devices/:id/access', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!canAccessDevice(p, req.params.id)) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذا الجهاز' })
    return unattendedStatus(req.params.id)
  })

  fastify.post('/api/devices/:id/access', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!atLeast(p.role, 'manager')) return reply.code(403).send({ error: 'Manager role required', code: 'role_too_low' })
    if (!isDeviceOwnerOrAdmin(p, req.params.id)) return reply.code(403).send({ error: 'المالك أو المدير فقط يضبط كلمة مرور الوصول', code: 'owner_required' })
    const dev = db.prepare('SELECT id, name, code FROM devices WHERE id=?').get(req.params.id)
    if (!dev) return reply.code(404).send({ error: 'Not found' })
    const body = req.body || {}
    const existing = unattendedRow(dev.id)

    if (body.enabled === false) {
      if (!existing) return reply.code(404).send({ error: 'لا توجد كلمة مرور لهذا الجهاز', code: 'no_unattended_password' })
      db.prepare("UPDATE device_unattended SET enabled=0, failed_count=0, locked_until=NULL, updated_by=?, updated_at=datetime('now') WHERE device_id=?").run(p.userId, dev.id)
      dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: dev.id, action: 'unattended_cleared', details: { enabled: false }, ipAddress: req.ip })
      return { ok: true, ...unattendedStatus(dev.id) }
    }

    const password = String(body.password || '')
    if (password.length < 8) return reply.code(400).send({ error: 'كلمة مرور الجهاز يجب أن تكون 8 أحرف على الأقل', code: 'password_too_short' })
    if (password.length > 200) return reply.code(400).send({ error: 'كلمة المرور طويلة جداً', code: 'password_too_long' })
    const hash = await bcrypt.hash(password, 10)
    db.prepare(
      'INSERT INTO device_unattended (device_id, password_hash, enabled, failed_count, locked_until, updated_by, updated_at) ' +
      "VALUES (?,?,1,0,NULL,?,datetime('now')) " +
      "ON CONFLICT(device_id) DO UPDATE SET password_hash=excluded.password_hash, enabled=1, failed_count=0, locked_until=NULL, updated_by=excluded.updated_by, updated_at=datetime('now')"
    ).run(dev.id, hash, p.userId)
    // لا تُسجَّل كلمة المرور ولا بصمتها — الطول وحده للسياق.
    dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: dev.id, action: 'unattended_set', details: { enabled: true, length: password.length, replaced: !!(existing && existing.password_hash) }, ipAddress: req.ip })
    return { ok: true, ...unattendedStatus(dev.id) }
  })

  // دخول غير مراقب: الجهاز نفسه هو نطاق الرمز (role=unattended + deviceId مقفل).
  fastify.post('/api/access/unattended', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = req.body || {}
    const password = String(body.password || '')
    const code = body.code != null ? String(body.code) : (body.deviceCode != null ? String(body.deviceCode) : '')
    const deviceId = body.deviceId != null ? String(body.deviceId) : ''
    if (!password) return reply.code(400).send({ error: 'password required' })
    if (!code && !deviceId) return reply.code(400).send({ error: 'code أو deviceId مطلوب', code: 'device_reference_required' })
    const dev = deviceId
      ? db.prepare('SELECT * FROM devices WHERE id=?').get(deviceId)
      : deviceByCode(code)
    if (!dev) {
      dbLogAudit({ action: 'unattended_login_failed', details: { reason: 'unknown_device' }, ipAddress: req.ip })
      return reply.code(404).send({ error: 'لا يوجد جهاز بهذا المعرّف', code: 'unknown_device' })
    }
    const row = unattendedRow(dev.id)
    if (!row || !row.enabled) {
      dbLogAudit({ deviceId: dev.id, action: 'unattended_denied', details: { reason: 'disabled' }, ipAddress: req.ip })
      return reply.code(403).send({ error: 'الوصول غير المراقب غير مُفعَّل لهذا الجهاز', code: 'unattended_disabled' })
    }
    const now = Date.now()
    if (row.locked_until) {
      const until = new Date(row.locked_until).getTime()
      if (until > now) {
        const retryAfterMs = until - now
        dbLogAudit({ deviceId: dev.id, action: 'unattended_locked', details: { retryAfterMs }, ipAddress: req.ip })
        reply.header('Retry-After', String(Math.ceil(retryAfterMs / 1000)))
        return reply.code(429).send({ error: 'الوصول مقفل مؤقتاً بعد محاولات فاشلة', code: 'unattended_locked', retryAfterMs })
      }
      db.prepare('UPDATE device_unattended SET failed_count=0, locked_until=NULL WHERE device_id=?').run(dev.id)
      row.failed_count = 0
    }
    const okPassword = await bcrypt.compare(password, row.password_hash)
    if (!okPassword) {
      const failed = (row.failed_count || 0) + 1
      if (failed >= UNATTENDED_MAX_FAILURES) {
        db.prepare("UPDATE device_unattended SET failed_count=0, locked_until=?, last_failed_at=?, updated_at=datetime('now') WHERE device_id=?")
          .run(new Date(now + UNATTENDED_LOCK_MS).toISOString(), new Date(now).toISOString(), dev.id)
        dbLogAudit({ deviceId: dev.id, action: 'unattended_locked', details: { attempts: failed, lockMs: UNATTENDED_LOCK_MS }, ipAddress: req.ip })
        reply.header('Retry-After', String(Math.ceil(UNATTENDED_LOCK_MS / 1000)))
        return reply.code(429).send({ error: 'الوصول مقفل مؤقتاً بعد محاولات فاشلة', code: 'unattended_locked', retryAfterMs: UNATTENDED_LOCK_MS })
      }
      db.prepare("UPDATE device_unattended SET failed_count=?, last_failed_at=?, updated_at=datetime('now') WHERE device_id=?")
        .run(failed, new Date(now).toISOString(), dev.id)
      dbLogAudit({ deviceId: dev.id, action: 'unattended_login_failed', details: { attempts: failed, max: UNATTENDED_MAX_FAILURES }, ipAddress: req.ip })
      return reply.code(401).send({ error: 'كلمة مرور الجهاز غير صحيحة', code: 'bad_device_password', remaining: UNATTENDED_MAX_FAILURES - failed })
    }
    db.prepare("UPDATE device_unattended SET failed_count=0, locked_until=NULL, last_success_at=?, updated_at=datetime('now') WHERE device_id=?")
      .run(new Date(now).toISOString(), dev.id)
    const accessToken = signToken({ userId: 'unattended:' + dev.id, email: 'unattended@device', role: 'unattended', deviceId: dev.id, purpose: 'unattended' }, UNATTENDED_TOKEN_TTL)
    dbLogAudit({ userId: 'unattended:' + dev.id, userEmail: 'unattended@device', deviceId: dev.id, action: 'unattended_login', details: { code: dev.code || null }, ipAddress: req.ip })
    return { ok: true, accessToken, token: accessToken, role: 'unattended', expiresIn: UNATTENDED_TOKEN_TTL, capabilities: DEVICE_CAPABILITIES.slice(), device: { id: dev.id, name: dev.name, code: dev.code || null } }
  })

  // ── v3.8.12 / R3-2 — الصلاحية الدقيقة لكل جهاز (مستخدم × جهاز × قدرة) ──────
  fastify.get('/api/devices/:id/permissions', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!isDeviceOwnerOrAdmin(p, req.params.id)) return reply.code(403).send({ error: 'المالك أو المدير فقط يرى الصلاحيات', code: 'owner_required' })
    const grants = db.prepare(
      'SELECT p.user_id, p.capability, u.email, u.name, u.role FROM device_permissions p LEFT JOIN users u ON u.id=p.user_id WHERE p.device_id=?'
    ).all(req.params.id)
    const byUser = new Map()
    for (const g of grants) {
      if (!byUser.has(g.user_id)) byUser.set(g.user_id, { userId: g.user_id, email: g.email || null, name: g.name || null, role: g.role || null, capabilities: [] })
      byUser.get(g.user_id).capabilities.push(g.capability)
    }
    return { deviceId: req.params.id, capabilities: DEVICE_CAPABILITIES.slice(), grants: Array.from(byUser.values()) }
  })

  fastify.put('/api/devices/:id/permissions/:userId', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!isDeviceOwnerOrAdmin(p, req.params.id)) return reply.code(403).send({ error: 'المالك أو المدير فقط يمنح الصلاحيات', code: 'owner_required' })
    const dev = db.prepare('SELECT id, owner_id FROM devices WHERE id=?').get(req.params.id)
    if (!dev) return reply.code(404).send({ error: 'Not found' })
    const target = db.prepare('SELECT id, email, name, role FROM users WHERE id=?').get(req.params.userId)
    if (!target) return reply.code(404).send({ error: 'لا يوجد مستخدم بهذا المعرّف', code: 'unknown_user' })
    if (target.id === dev.owner_id) return reply.code(400).send({ error: 'المالك يملك كل القدرات أصلاً', code: 'owner_has_all' })
    const body = req.body || {}
    const wanted = DEVICE_CAPABILITIES.filter(c => body[c] === true)
    db.prepare('DELETE FROM device_permissions WHERE user_id=? AND device_id=?').run(target.id, dev.id)
    const ins = db.prepare('INSERT INTO device_permissions (user_id, device_id, capability, granted_by) VALUES (?,?,?,?)')
    for (const c of wanted) ins.run(target.id, dev.id, c, p.userId)
    dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: dev.id, action: 'permission_granted', details: { targetUserId: target.id, targetEmail: target.email, capabilities: wanted }, ipAddress: req.ip })
    return { ok: true, userId: target.id, capabilities: wanted }
  })

  fastify.delete('/api/devices/:id/permissions/:userId', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!isDeviceOwnerOrAdmin(p, req.params.id)) return reply.code(403).send({ error: 'المالك أو المدير فقط يسحب الصلاحيات', code: 'owner_required' })
    const target = db.prepare('SELECT id, email FROM users WHERE id=?').get(req.params.userId)
    if (!target) return reply.code(404).send({ error: 'لا يوجد مستخدم بهذا المعرّف', code: 'unknown_user' })
    const info = db.prepare('DELETE FROM device_permissions WHERE user_id=? AND device_id=?').run(target.id, req.params.id)
    dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: req.params.id, action: 'permission_revoked', details: { targetUserId: target.id, removed: info.changes }, ipAddress: req.ip })
    return { ok: true, userId: target.id, removed: info.changes }
  })

  fastify.get('/api/devices/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!canAccessDevice(p, req.params.id)) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذا الجهاز' })
    const d = db.prepare("SELECT * FROM devices WHERE id=?").get(req.params.id)
    if (!d) return reply.code(404).send({ error: 'Not found' })
    const online = agentSockets.has(d.id)
    const rm = (agentSockets.get(d.id)?.ws?._socket?.remoteAddress || null)
    const rmClean = rm ? String(rm).replace('::ffff:', '') : null
    const info = parseJson(d.info) || {}
    if (!info.ipPublic && rmClean) info.ipPublic = rmClean
    const tunnelLayer = rmClean ? (/^10\.90\./.test(rmClean) ? 'zerotier' : (/^(192\.168\.|10\.)/.test(rmClean) ? 'lan' : 'wan')) : null
    return { ...d, info, tags: parseJson(d.tags, []), capabilities: parseJson(d.capabilities, {}), isOnline: online, remoteIp: rmClean, tunnelLayer, status: d.status === 'blocked' ? 'blocked' : (online ? 'online' : 'offline'), stats: agentSockets.get(d.id)?.stats || null }
  })

  fastify.put('/api/devices/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!isDeviceOwnerOrAdmin(p, req.params.id)) return reply.code(403).send({ error: 'المالك أو المدير فقط يدير الجهاز', code: 'owner_required' })
    const { name, tags } = req.body || {}
    const updates = []; const vals = []
    if (name) { updates.push('name=?'); vals.push(name) }
    if (tags) { updates.push('tags=?'); vals.push(JSON.stringify(tags)) }
    if (!updates.length) return reply.code(400).send({ error: 'Nothing to update' })
    updates.push("updated_at=datetime('now')"); vals.push(req.params.id)
    db.prepare(`UPDATE devices SET ${updates.join(',')} WHERE id=?`).run(...vals)
    return { ok: true }
  })

  fastify.delete('/api/devices/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!isDeviceOwnerOrAdmin(p, req.params.id)) return reply.code(403).send({ error: 'المالك أو المدير فقط يدير الجهاز', code: 'owner_required' })
    const d = db.prepare("SELECT name FROM devices WHERE id=?").get(req.params.id)
    if (!d) return reply.code(404).send({ error: 'Not found' })
    // 3.9.2 (H2) — جهاز محذوف لا يترك جلسة حيّة ولا مفتاح إعادة صالحاً.
    const closedSessions = relayCloseForPrincipal({ deviceId: req.params.id, actorUserId: p.userId })
    db.prepare("DELETE FROM devices WHERE id=?").run(req.params.id)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'device_deleted', details: { name: d.name, closedSessions }, ipAddress: req.ip })
    return { ok: true }
  })

  fastify.post('/api/devices/:id/wol', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!isDeviceOwnerOrAdmin(p, req.params.id)) return reply.code(403).send({ error: 'المالك أو المدير فقط يدير الجهاز', code: 'owner_required' })
    const d = db.prepare("SELECT info FROM devices WHERE id=?").get(req.params.id)
    if (!d) return reply.code(404).send({ error: 'Device not found' })
    const info = parseJson(d.info) || {}
    const rawMac = req.body?.macAddress || req.body?.mac || info?.mac
    if (!rawMac) return reply.code(400).send({ error: 'No MAC address' })
    // v3.5 — strict MAC validation (12 hex digits after removing separators)
    const macHex = String(rawMac).replace(/[^0-9a-fA-F]/g, '').toLowerCase()
    if (macHex.length !== 12) return reply.code(400).send({ error: 'Invalid MAC address' })
    const mac = macHex.match(/.{2}/g).join(':')
    const buf = Buffer.alloc(102)
    buf.fill(0xff, 0, 6)
    const macBuf = Buffer.from(macHex, 'hex')
    for (let i = 1; i <= 16; i++) macBuf.copy(buf, i * 6)
    // v3.5 — default to the subnet-directed broadcast of the active interface;
    // 255.255.255.255 is often dropped by switches/routers.
    function subnetBroadcast() {
      try {
        const os = require('os')
        for (const list of Object.values(os.networkInterfaces())) {
          for (const ni of list || []) {
            if (ni.family !== 'IPv4' || ni.internal) continue
            if (/^169\.254\./.test(ni.address)) continue
            const ip = ni.address.split('.').map(Number)
            const mask = (ni.netmask || '255.255.255.0').split('.').map(Number)
            if (ip.length !== 4 || mask.length !== 4) continue
            return ip.map((n, i2) => (n | (~mask[i2] & 255))).join('.')
          }
        }
      } catch {}
      return null
    }
    const bcast = (typeof req.body?.broadcast === 'string' && req.body.broadcast.trim())
      || subnetBroadcast() || '255.255.255.255'
    const dgram = require('dgram')
    const ports = [9, 7]
    const sendResults = []
    for (const port of ports) {
      sendResults.push(await new Promise((resolve) => {
        const sock = dgram.createSocket('udp4')
        let settled = false
        const done = (ok, err) => {
          if (settled) return
          settled = true
          try { sock.close() } catch {}
          resolve({ port, ok, error: err ? String(err.message || err) : undefined })
        }
        sock.once('error', (err) => done(false, err))
        sock.bind(() => {
          try {
            sock.setBroadcast(true)
            sock.send(buf, 0, buf.length, port, bcast, (err) => done(!err, err))
          } catch (err) { done(false, err) }
        })
      }))
    }
    const okCount = sendResults.filter(r => r.ok).length
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'device_wol', deviceId: req.params.id, details: { mac, broadcast: bcast, ports, okCount }, ipAddress: req.ip })
    if (!okCount) {
      return reply.code(502).send({ error: 'تعذّر إرسال حزمة WOL: ' + (sendResults.find(r => r.error)?.error || 'unknown'), mac, broadcast: bcast, results: sendResults })
    }
    return { ok: true, mac, broadcast: bcast, ports, results: sendResults, message: 'تم إرسال حزمة التنبيه (WOL) إلى ' + mac }
  })

  fastify.get('/api/devices/:id/stats/history', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!canAccessDevice(p, req.params.id)) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذا الجهاز' })
    const hours = Math.min(parseInt(req.query?.hours || '24'), 168)
    const since = new Date(Date.now() - hours * 3600000).toISOString()
    return db.prepare("SELECT cpu_percent, ram_percent, disk_percent, net_in_kb, net_out_kb, recorded_at FROM stats_history WHERE device_id=? AND recorded_at > ? ORDER BY recorded_at ASC").all(req.params.id, since)
  })

  // ── Device FS Relay ───────────────────────────────────────────────────────
  fastify.get('/api/devices/:id/fs', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!hasDeviceCapability(p, req.params.id, 'files')) return denyCapability(reply, p, req.params.id, 'files', req)
    try { return await agentFsRequest(req.params.id, 'list', { path: req.query?.path || '/' }) }
    catch (e) { return reply.code(502).send({ error: e.message }) }
  })

  fastify.get('/api/devices/:id/fs/download', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!hasDeviceCapability(p, req.params.id, 'files')) return denyCapability(reply, p, req.params.id, 'files', req)
    const { path: fsPath } = req.query || {}
    if (!fsPath) return reply.code(400).send({ error: 'path required' })
    const name = String(fsPath).split('/').pop() || 'file'
    // v3.5 — HTTP headers must be ASCII; support Arabic filenames via RFC 5987.
    const asciiName = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '')
    const utf8Name = encodeURIComponent(name).replace(/'/g, '%27')
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="' + asciiName + '"; filename*=UTF-8\'\'' + utf8Name,
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no'
    })
    try {
      await agentFsStream(req.params.id, fsPath, reply.raw)
    } catch (e) {
      try { reply.raw.destroy() } catch {}
    }
  })

  fastify.post('/api/devices/:id/fs/mkdir', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!hasDeviceCapability(p, req.params.id, 'files')) return denyCapability(reply, p, req.params.id, 'files', req)
    const { path: fsPath } = req.body || {}
    if (!fsPath) return reply.code(400).send({ error: 'path required' })
    try { return await agentFsRequest(req.params.id, 'mkdir', { path: fsPath }) }
    catch (e) { return reply.code(502).send({ error: e.message }) }
  })

  // v3.2.2 — Dashboard FS aliases (list / delete / rename)
  fastify.get('/api/devices/:id/fs/list', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!hasDeviceCapability(p, req.params.id, 'files')) return denyCapability(reply, p, req.params.id, 'files', req)
    try { return await agentFsRequest(req.params.id, 'list', { path: req.query?.path || '/' }) }
    catch (e) { return reply.code(502).send({ error: e.message }) }
  })

  fastify.post('/api/devices/:id/fs/delete', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!hasDeviceCapability(p, req.params.id, 'files')) return denyCapability(reply, p, req.params.id, 'files', req)
    const { path: fsPath } = req.body || {}
    if (!fsPath) return reply.code(400).send({ error: 'path required' })
    try { return await agentFsRequest(req.params.id, 'delete', { path: fsPath }) }
    catch (e) { return reply.code(502).send({ error: e.message }) }
  })

  fastify.post('/api/devices/:id/fs/rename', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!hasDeviceCapability(p, req.params.id, 'files')) return denyCapability(reply, p, req.params.id, 'files', req)
    const { oldPath, newPath } = req.body || {}
    if (!oldPath || !newPath) return reply.code(400).send({ error: 'oldPath and newPath required' })
    try { return await agentFsRequest(req.params.id, 'rename', { path: oldPath, newPath }) }
    catch (e) { return reply.code(502).send({ error: e.message }) }
  })

  fastify.delete('/api/devices/:id/fs', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!hasDeviceCapability(p, req.params.id, 'files')) return denyCapability(reply, p, req.params.id, 'files', req)
    const { path: fsPath } = req.query || {}
    if (!fsPath) return reply.code(400).send({ error: 'path required' })
    try { return await agentFsRequest(req.params.id, 'delete', { path: fsPath }) }
    catch (e) { return reply.code(502).send({ error: e.message }) }
  })

  // fs upload (streaming chunks to agent)
  fastify.post('/api/devices/:id/fs/upload', { bodyLimit: 268435456 }, async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!hasDeviceCapability(p, req.params.id, 'files')) return denyCapability(reply, p, req.params.id, 'files', req)
    const destPath = req.query?.path
    if (!destPath) return reply.code(400).send({ error: 'path required' })
    const rec = agentSockets.get(req.params.id)
    if (!rec) return reply.code(502).send({ error: 'Device offline' })
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '')
    if (buf.length > 268435456) return reply.code(413).send({ error: 'too large' })
    const CHUNK = 512 * 1024
    const total = Math.max(1, Math.ceil(buf.length / CHUNK))
    const opId = uuidv4()
    const waitResp = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pendingFsRequests.delete(opId); reject(new Error('upload timeout')) }, 60000)
      pendingFsRequests.set(opId, { resolve, reject, timer })
    })
    for (let i = 0; i < total; i++) {
      sendJson(rec.ws, { type: 'server:fs_write_chunk', payload: { opId, path: destPath, seq: i, total, data: buf.slice(i * CHUNK, (i + 1) * CHUNK).toString('base64'), isLast: i === total - 1 } })
      await new Promise(r => setImmediate(r))
    }
    try { const data = await waitResp; return { ok: true, ...(data || {}) } }
    catch (e) { return reply.code(502).send({ error: e.message }) }
  })

  // ── R5 — نقل الملفات: مقاطع قابلة للاستكمال، تحقق SHA-256، وحارس مسارات ────
  function ftErrorReply (reply, e) {
    const status = (e && e.status) ? e.status : (e && e.code === 'device_offline' ? 409 : 400)
    return reply.code(status).send({ error: e.message, code: (e && e.code) || 'ft_error', expected: e && e.expected })
  }
  function ftAuth (req, reply) {
    const p = authMiddleware(req, reply); if (!p) return null
    const row = fileTransfers.getRow(req.params.tid)
    if (!row) { reply.code(404).send({ error: 'النقل غير موجود', code: 'not_found' }); return null }
    if (!hasDeviceCapability(p, row.device_id, 'files')) { denyCapability(reply, p, row.device_id, 'files', req); return null }
    return p
  }

  fastify.post('/api/devices/:id/file-transfers', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!hasDeviceCapability(p, req.params.id, 'files')) return denyCapability(reply, p, req.params.id, 'files', req)
    try {
      const b = req.body || {}
      const row = fileTransfers.createTransfer({
        user: p, deviceId: req.params.id, direction: b.direction || 'upload',
        path: b.path, size: b.size, sha256: b.sha256, conflict: b.conflict,
        speedLimitKbps: b.speedLimitKbps, name: b.name
      })
      return reply.code(201).send({ ok: true, transfer: fileTransfers.publicRow(row) })
    } catch (e) { return ftErrorReply(reply, e) }
  })

  // دفعة الملفات الصغيرة: بيان واحد، صفّ لكل ملف، تقدّم لكل ملف.
  fastify.post('/api/devices/:id/file-transfers/batch', { bodyLimit: 134217728 }, async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!hasDeviceCapability(p, req.params.id, 'files')) return denyCapability(reply, p, req.params.id, 'files', req)
    try {
      const b = req.body || {}
      const out = await fileTransfers.createBatch({
        user: p, deviceId: req.params.id, destDir: b.destDir,
        files: b.files, conflict: b.conflict, speedLimitKbps: b.speedLimitKbps
      })
      return reply.send({ ok: out.failed === 0, ...out })
    } catch (e) { return ftErrorReply(reply, e) }
  })

  fastify.get('/api/file-transfers', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    return {
      transfers: fileTransfers.list(p, {
        deviceId: req.query && req.query.deviceId,
        batchId: req.query && req.query.batchId,
        state: req.query && req.query.state,
        limit: req.query && req.query.limit
      })
    }
  })

  fastify.get('/api/file-transfers/:tid', async (req, reply) => {
    const p = ftAuth(req, reply); if (!p) return
    try { return { transfer: fileTransfers.get(req.params.tid, p) } } catch (e) { return ftErrorReply(reply, e) }
  })

  fastify.post('/api/file-transfers/:tid/start', async (req, reply) => {
    const p = ftAuth(req, reply); if (!p) return
    try {
      const row = await fileTransfers.start(req.params.tid, p)
      return { ok: true, transfer: fileTransfers.publicRow(row) }
    } catch (e) { return ftErrorReply(reply, e) }
  })

  // رفع مقطع واحد (1MB افتراضياً) بإزاحة صريحة؛ العميل يكرّر من nextOffset.
  fastify.put('/api/file-transfers/:tid/data', { bodyLimit: 16777216 }, async (req, reply) => {
    const p = ftAuth(req, reply); if (!p) return
    try {
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '')
      const row = await fileTransfers.writeChunk(req.params.tid, p, Number(req.query && req.query.offset), buf)
      return { ok: true, transfer: fileTransfers.publicRow(row) }
    } catch (e) { return ftErrorReply(reply, e) }
  })

  // تنزيل متدفّق من الجهاز، يدعم from=offset للاستكمال.
  fastify.get('/api/file-transfers/:tid/data', async (req, reply) => {
    const p = ftAuth(req, reply); if (!p) return
    const row = fileTransfers.getRow(req.params.tid)
    try {
      const name = String(row.source_path || row.final_path || 'file').split(/[\\/]/).pop() || 'file'
      const asciiName = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '')
      const utf8Name = encodeURIComponent(name).replace(/'/g, '%27')
      const partial = req.query && req.query.length != null
      reply.hijack()
      reply.raw.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="' + asciiName + '"; filename*=UTF-8\'\'' + utf8Name,
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
        'Accept-Ranges': 'bytes'
      })
      let offset = Math.max(0, Number(req.query && req.query.offset) || 0)
      const cap = Math.max(0, Number(req.query && req.query.length) || 0)
      const chunk = fileTransfers.chunkSize
      let sent = 0
      for (;;) {
        const want = cap > 0 ? Math.min(chunk, cap - sent) : chunk
        if (want <= 0) break
        const r = await fileTransfers.readChunk(row.id, p, offset, want)
        if (r.data && r.data.length) {
          reply.raw.write(r.data)
          sent += r.data.length
          offset += r.data.length
        } else break
        if (r.eof) break
      }
      reply.raw.end()
      if (cap === 0) { try { await fileTransfers.finish(row.id, p, null) } catch {} }
    } catch (e) {
      try { reply.raw.destroy() } catch {}
    }
  })

  fastify.post('/api/file-transfers/:tid/finish', async (req, reply) => {
    const p = ftAuth(req, reply); if (!p) return
    try {
      const row = await fileTransfers.finish(req.params.tid, p, (req.body || {}).sha256)
      return { ok: true, transfer: fileTransfers.publicRow(row) }
    } catch (e) { return ftErrorReply(reply, e) }
  })

  fastify.post('/api/file-transfers/:tid/pause', async (req, reply) => {
    const p = ftAuth(req, reply); if (!p) return
    try { return { ok: true, transfer: fileTransfers.publicRow(await fileTransfers.pause(req.params.tid, p, 'paused_by_user')) } }
    catch (e) { return ftErrorReply(reply, e) }
  })

  fastify.post('/api/file-transfers/:tid/resume', async (req, reply) => {
    const p = ftAuth(req, reply); if (!p) return
    try { return { ok: true, transfer: fileTransfers.publicRow(await fileTransfers.resume(req.params.tid, p)) } }
    catch (e) { return ftErrorReply(reply, e) }
  })

  fastify.post('/api/file-transfers/:tid/cancel', async (req, reply) => {
    const p = ftAuth(req, reply); if (!p) return
    try { return { ok: true, transfer: fileTransfers.publicRow(await fileTransfers.cancel(req.params.tid, p, 'cancelled_by_user')) } }
    catch (e) { return ftErrorReply(reply, e) }
  })

  // v3.2.2 — Remote command execution (Dashboard /api/devices/:id/exec)
  fastify.post('/api/devices/:id/exec', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!atLeast(p.role, 'manager')) return reply.code(403).send({ error: 'Manager role required to run commands' })
    if (!hasDeviceCapability(p, req.params.id, 'control')) return denyCapability(reply, p, req.params.id, 'control', req)
    const { command, timeoutMs } = req.body || {}
    if (!command || typeof command !== 'string') return reply.code(400).send({ error: 'command required' })
    if (command.length > 4000) return reply.code(400).send({ error: 'command too long (max 4000)' })
    // v3.8.41 (R9.2/F2) — checked here because the agent receives an encoded wrapper.
    const blockedCmd = blockedReason(command)
    if (blockedCmd) {
      dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: req.params.id, action: 'command_blocked', details: { reason: blockedCmd }, ipAddress: req.ip })
      return reply.code(403).send({ error: 'أمر محجوب بسياسة الوكيل: ' + blockedCmd, code: 'blocked_command' })
    }
    // v3.3.4 — agents execute via cmd.exe; for Windows devices wrap the command to run in
    // PowerShell. -EncodedCommand sidelines all quoting/encoding pitfalls (Arabic, quotes).
    // (kept raw for very long commands to stay under the cmd.exe line-length limit)
    let runCommand = command
    try {
      const devRow  = db.prepare('SELECT info FROM devices WHERE id=?').get(req.params.id)
      const devInfo = parseJson((devRow && devRow.info) || '', {})
      if (String(devInfo.platform || '').toLowerCase().includes('windows') && command.length <= 1800) {
        const psCmd = "$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " + command + "; if (-not $?) { exit 1 }"
        runCommand = 'powershell -NoProfile -NonInteractive -EncodedCommand ' + Buffer.from(psCmd, 'utf16le').toString('base64')
      }
    } catch {}
    const rec = agentSockets.get(req.params.id)
    if (!rec) return reply.code(502).send({ error: 'Device offline' })
    const commandId = uuidv4()
    const tOut = Math.min(Math.max(parseInt(timeoutMs) || 60000, 1000), 300000)
    const sessId = dbLogSessionStart(p.userId, req.params.id, 'shell', { command: command.slice(0, 200) })
    const started = Date.now()
    try {
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pendingCommands.delete(commandId); reject(new Error('command timeout')) }, tOut + 5000)
        pendingCommands.set(commandId, { resolve, reject, timer })
        sendJson(rec.ws, { type: 'server:command', payload: { commandId, type: 'shell', command: runCommand } })
      })
      dbLogSessionEnd(sessId)
      dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: req.params.id, action: 'device_exec', details: { command: command.slice(0, 200) }, ipAddress: req.ip })
      return { ok: true, stdout: (result && result.stdout) || '', stderr: (result && result.stderr) || '', exitCode: (result && result.exitCode) != null ? result.exitCode : -1, duration: Date.now() - started }
    } catch (e) { dbLogSessionEnd(sessId); return reply.code(502).send({ error: e.message }) }
  })


  // v3.3.4 — one-shot screenshot (dashboard chat): capture on the device, return JPEG
  fastify.get('/api/devices/:id/screenshot', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!hasDeviceCapability(p, req.params.id, 'control')) return denyCapability(reply, p, req.params.id, 'control', req)
    const rec = agentSockets.get(req.params.id)
    if (!rec) return reply.code(502).send({ error: 'Device offline' })
    // v3.4.2 — Android: capture on device via AISHOT command, then read the JPEG back
    try {
      const devRowS  = db.prepare('SELECT info FROM devices WHERE id=?').get(req.params.id)
      const devInfoS = parseJson((devRowS && devRowS.info) || '', {})
      if (String(devInfoS.platform || '').toLowerCase().includes('android')) {
        const shotPathA  = '/data/data/com.airemote.agent/files/shot.jpg'
        const commandIdS = uuidv4()
        try {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pendingCommands.delete(commandIdS); reject(new Error('command timeout')) }, 25000)
            pendingCommands.set(commandIdS, { resolve, reject, timer })
            sendJson(rec.ws, { type: 'server:command', payload: { commandId: commandIdS, type: 'shell', command: 'AISHOT:' + shotPathA } })
          })
          const dataA = await agentFsRequest(req.params.id, 'read', { path: shotPathA })
          const b64A  = (dataA && (dataA.base64 || (dataA.data && dataA.data.base64))) || ''
          const bufA  = Buffer.from(b64A, 'base64')
          if (!bufA.length || bufA[0] !== 0xFF || bufA[1] !== 0xD8) return reply.code(502).send({ error: 'capture failed' })
          reply.header('Content-Type', 'image/jpeg')
          reply.header('Cache-Control', 'no-store')
          return reply.send(bufA)
        } catch (e) { return reply.code(502).send({ error: 'capture failed: ' + e.message }) }
      }
    } catch {}

    const shotPath = 'C:\\Users\\Public\\airemote-shot.jpg'
    // v3.3.4 — make the capture process DPI-aware first, otherwise on scaled displays it only
    // grabs the top-left logical region instead of the entire physical screen.
    const ps = "try { $cs = 'using System;using System.Runtime.InteropServices;public class DpiAw { [DllImport(' + [char]34 + 'user32.dll' + [char]34 + ')] public static extern bool SetProcessDPIAware(); }'; Add-Type -TypeDefinition $cs -ErrorAction SilentlyContinue; [DpiAw]::SetProcessDPIAware() | Out-Null } catch {}; Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $vb=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap($vb.Width,$vb.Height); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($vb.Location,[System.Drawing.Point]::Empty,$vb.Size); $bmp.Save('" + shotPath + "',[System.Drawing.Imaging.ImageFormat]::Jpeg); $g.Dispose(); $bmp.Dispose(); 'shot-ok'"
    const commandId = uuidv4()
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pendingCommands.delete(commandId); reject(new Error('command timeout')) }, 25000)
        pendingCommands.set(commandId, { resolve, reject, timer })
        const wrapped = "$ProgressPreference='SilentlyContinue'; " + ps
        const enc = Buffer.from(wrapped, 'utf16le').toString('base64')
        sendJson(rec.ws, { type: 'server:command', payload: { commandId, type: 'shell', command: 'powershell -NoProfile -NonInteractive -EncodedCommand ' + enc } })
      })
      const data = await agentFsRequest(req.params.id, 'read', { path: shotPath })
      const buf = Buffer.from((data && data.base64) || '', 'base64')
      if (!buf.length || buf[0] !== 0xFF || buf[1] !== 0xD8) return reply.code(502).send({ error: 'capture failed' })
      reply.header('Content-Type', 'image/jpeg')
      reply.header('Cache-Control', 'no-store')
      return buf
    } catch (e) { return reply.code(502).send({ error: e.message }) }
  })

// v3.3.5 — clickname helper script (written to the device on demand; avoids cmd line length limits)
const CLICKNAME_PS = `param([string]$nameB64)
$ProgressPreference = 'SilentlyContinue'
$n = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($nameB64)).ToLower()
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$CT = [System.Windows.Automation.ControlType]
$root = $AE::RootElement
function ScanWin($win, $n) {
  $types = @($CT::Hyperlink, $CT::Button, $CT::ListItem, $CT::TabItem)
  foreach ($ct in $types) {
    try {
      $cond = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $ct)
      $els = $win.FindAll($TS::Descendants, $cond)
      $i = 0
      foreach ($x in $els) { $i++; if ($i -gt 6000) { break }; try { $nm = $x.Current.Name; if ($nm -and $nm.ToLower().Contains($n) -and $x.Current.IsEnabled -and -not $x.Current.IsOffscreen) { return $x } } catch {} }
    } catch {}
  }
  try {
    $els = $win.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $i = 0
    foreach ($x in $els) { $i++; if ($i -gt 4000) { break }; try { $nm = $x.Current.Name; if ($nm -and $nm.ToLower().Contains($n) -and $x.Current.IsEnabled -and -not $x.Current.IsOffscreen) { return $x } } catch {} }
  } catch {}
  return $null
}
$target = $null
try {
  $cs = 'using System;using System.Runtime.InteropServices;public class Fg { [DllImport(' + [char]34 + 'user32.dll' + [char]34 + ')] public static extern IntPtr GetForegroundWindow(); }'
  Add-Type -TypeDefinition $cs -ErrorAction SilentlyContinue
  $fg = [Fg]::GetForegroundWindow()
  if ($fg -ne [IntPtr]::Zero) { $fw = $AE::FromHandle($fg); if ($fw -ne $null) { $target = ScanWin $fw $n } }
} catch {}
if ($target -eq $null) {
  $wins = $root.FindAll($TS::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($win in $wins) { try { if ($win.Current.ClassName -match 'Shell_TrayWnd|Progman|WorkerW') { continue } } catch { continue }; $target = ScanWin $win $n; if ($target -ne $null) { break } }
}
if ($target -eq $null) { 'name-not-found' } else {
  try { $target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); 'invoked' }
  catch {
    $r = $target.Current.BoundingRectangle
    $cx = [int]($r.X + $r.Width / 2)
    $cy = [int]($r.Y + $r.Height / 2)
    $cc = 'using System;using System.Runtime.InteropServices;public class Mu2 { [DllImport(' + [char]34 + 'user32.dll' + [char]34 + ')] public static extern bool SetCursorPos(int x,int y); [DllImport(' + [char]34 + 'user32.dll' + [char]34 + ')] public static extern void mouse_event(uint f,uint dx,uint dy,uint d,IntPtr e); }'
    Add-Type -TypeDefinition $cc -ErrorAction SilentlyContinue
    [Mu2]::SetCursorPos($cx, $cy)
    Start-Sleep -Milliseconds 150
    [Mu2]::mouse_event(2,0,0,0,[IntPtr]::Zero)
    [Mu2]::mouse_event(4,0,0,0,[IntPtr]::Zero)
    'clicked-center'
  }
}`

  // v3.3.4 — remote control for the AI: real mouse/keyboard actions via the agent
  fastify.post('/api/devices/:id/control', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!hasDeviceCapability(p, req.params.id, 'control')) return denyCapability(reply, p, req.params.id, 'control', req)
    const rec = agentSockets.get(req.params.id)
    if (!rec) return reply.code(502).send({ error: 'Device offline' })
    const b = req.body || {}
    const action = String(b.action || '').toLowerCase()
    const xi = (v) => { const n = parseInt(v); return Number.isFinite(n) ? Math.max(0, Math.min(10000, n)) : 0 }
    const x = xi(b.x), y = xi(b.y), x2 = xi(b.x2), y2 = xi(b.y2)
    const amount = Math.max(-20, Math.min(20, parseInt(b.amount) || -3))
    const text = String(b.text || '').slice(0, 500)
    const key  = String(b.key  || '').replace(/[^A-Za-z0-9 +^%~()]/g, '').slice(0, 30)
    // v3.4.2 — Android devices: forward the action as a structured AICTL command
    try {
      const devRowC  = db.prepare('SELECT info FROM devices WHERE id=?').get(req.params.id)
      const devInfoC = parseJson((devRowC && devRowC.info) || '', {})
      if (String(devInfoC.platform || '').toLowerCase().includes('android')) {
        const commandIdA = uuidv4()
        const payloadObj = {
          action, x, y, x2, y2, amount, text, key,
          seconds: Math.min(Math.max(parseInt(b.seconds != null ? b.seconds : b.amount) || 2, 1), 20)
        }
        const cmdA = 'AICTL:' + Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64')
        try {
          const result = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pendingCommands.delete(commandIdA); reject(new Error('command timeout')) }, 20000)
            pendingCommands.set(commandIdA, { resolve, reject, timer })
            sendJson(rec.ws, { type: 'server:command', payload: { commandId: commandIdA, type: 'shell', command: cmdA } })
          })
          dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: req.params.id, action: 'device_control', details: { action, platform: 'android' }, ipAddress: req.ip })
          return { ok: true, stdout: (result && result.stdout) || '', stderr: (result && result.stderr) || '', exitCode: (result && result.exitCode) != null ? result.exitCode : 0 }
        } catch (e) { return reply.code(502).send({ error: e.message }) }
      }
    } catch {}

    const dpiSnippet = "try { $cs0 = 'using System;using System.Runtime.InteropServices;public class DpiAw { [DllImport(' + [char]34 + 'user32.dll' + [char]34 + ')] public static extern bool SetProcessDPIAware(); }'; Add-Type -TypeDefinition $cs0 -ErrorAction SilentlyContinue; [DpiAw]::SetProcessDPIAware() | Out-Null } catch {}"
    const mu = "$cs = 'using System;using System.Runtime.InteropServices;public class Mu { [DllImport(' + [char]34 + 'user32.dll' + [char]34 + ')] public static extern bool SetCursorPos(int x,int y); [DllImport(' + [char]34 + 'user32.dll' + [char]34 + ')] public static extern void mouse_event(uint f,uint dx,uint dy,uint d,IntPtr e); [DllImport(' + [char]34 + 'user32.dll' + [char]34 + ')] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo); public const uint LD=2; public const uint LU=4; public const uint RD=8; public const uint RU=16; public const uint WH=2048; }'; Add-Type -TypeDefinition $cs -ErrorAction SilentlyContinue"
    const sk = (s) => s.replace(/([+^%~(){}\[\]])/g, '{$1}').replace(/'/g, "''")
    let body = ''
    if (action === 'move') body = "[Mu]::SetCursorPos(" + x + "," + y + "); 'moved " + x + "," + y + "'"
    else if (action === 'click' || action === 'rclick' || action === 'dclick') {
      const dn = action === 'rclick' ? '[Mu]::RD' : '[Mu]::LD'
      const up = action === 'rclick' ? '[Mu]::RU' : '[Mu]::LU'
      body = "[Mu]::SetCursorPos(" + x + "," + y + "); Start-Sleep -Milliseconds 120; [Mu]::mouse_event(" + dn + ",0,0,0,[IntPtr]::Zero); [Mu]::mouse_event(" + up + ",0,0,0,[IntPtr]::Zero)"
      if (action === 'dclick') body += "; Start-Sleep -Milliseconds 80; [Mu]::mouse_event([Mu]::LD,0,0,0,[IntPtr]::Zero); [Mu]::mouse_event([Mu]::LU,0,0,0,[IntPtr]::Zero)"
      body += "; 'ok'"
    }
    else if (action === 'drag') body = "[Mu]::SetCursorPos(" + x + "," + y + "); Start-Sleep -Milliseconds 120; [Mu]::mouse_event([Mu]::LD,0,0,0,[IntPtr]::Zero); Start-Sleep -Milliseconds 90; [Mu]::SetCursorPos(" + x2 + "," + y2 + "); Start-Sleep -Milliseconds 90; [Mu]::mouse_event([Mu]::LU,0,0,0,[IntPtr]::Zero); 'ok'"
    else if (action === 'focus') {
      const title = String(b.text || b.title || '').slice(0, 80)
      if (!title) return reply.code(400).send({ error: 'focus يحتاج عنوان النافذة في text' })
      const tEsc = title.replace(/'/g, "''")
      body = "$wsh = New-Object -ComObject WScript.Shell; $ok = $wsh.AppActivate('" + tEsc + "'); if ($ok) { 'focused' } else { " +
        "Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes; $root=[System.Windows.Automation.AutomationElement]::RootElement; " +
        "$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition); $hit=$null; " +
        "$needle='" + tEsc + "'.ToLower(); foreach($wn in $wins){ try{ $nm=$wn.Current.Name; if($nm -and $nm.ToLower().Contains($needle)){ $hit=$nm; break } }catch{} }; " +
        "if($hit){ $ok2=$wsh.AppActivate($hit); if($ok2){ 'focused-full' } else { 'focus-not-found' } } else { 'focus-not-found' } }"
    }
    else if (action === 'type') {
      const isAscii = /^[\x20-\x7E\r\n\t]*$/.test(text)
      if (isAscii) body = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('" + sk(text) + "'); 'typed'"
      else body = "Set-Clipboard -Value '" + text.replace(/'/g, "''") + "'; Start-Sleep -Milliseconds 200; [Mu]::keybd_event(0x11,0,0,[UIntPtr]::Zero); [Mu]::keybd_event(0x56,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60; [Mu]::keybd_event(0x56,0,2,[UIntPtr]::Zero); [Mu]::keybd_event(0x11,0,2,[UIntPtr]::Zero); 'typed-via-paste'"
    }
    else if (action === 'key') {
      const skey = (k) => {
        const raw = String(k || '').trim()
        if (!raw) return '{ENTER}'
        if (raw.includes('+')) {
          const parts = raw.split('+').map(x => x.trim()).filter(Boolean)
          let mods = ''
          for (const p of parts.slice(0, -1)) mods += /^ctrl$/i.test(p) ? '^' : /^alt$/i.test(p) ? '%' : /^shift$/i.test(p) ? '+' : ''
          const base = parts[parts.length - 1] || ''
          return mods + (base.length > 1 ? '{' + base.toUpperCase() + '}' : base)
        }
        if (/^[A-Za-z0-9]$/.test(raw)) return raw
        return '{' + raw.toUpperCase() + '}'
      }
      body = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('" + skey(key) + "'); 'key-sent'"
    }
    else if (action === 'wait') {
      const secs = Math.min(Math.max(parseInt(b.seconds != null ? b.seconds : b.amount) || 2, 1), 20)
      body = "Start-Sleep -Seconds " + secs + "; 'waited " + secs + "s'"
    }
    else if (action === 'clickname') {
      const name = String(b.text || b.name || '').slice(0, 80)
      if (!name) return reply.code(400).send({ error: 'clickname يحتاج نصاً في text' })
      const scriptPath = 'C:\\Users\\Public\\ai-ctl.ps1'
      const sbuf = Buffer.from(CLICKNAME_PS, 'utf8')
      const sop = uuidv4()
      const waitFs = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pendingFsRequests.delete(sop); reject(new Error('script write timeout')) }, 30000)
        pendingFsRequests.set(sop, { resolve, reject, timer })
      })
      sendJson(rec.ws, { type: 'server:fs_write_chunk', payload: { opId: sop, path: scriptPath, seq: 0, total: 1, data: sbuf.toString('base64'), isLast: true } })
      await waitFs
      const nameB64 = Buffer.from(name, 'utf8').toString('base64')
      body = "$out = & powershell -NoProfile -ExecutionPolicy Bypass -File '" + scriptPath + "' '" + nameB64 + "'; $out"
    }
    else if (action === 'scroll') body = "[Mu]::mouse_event([Mu]::WH,0,0," + (amount * 120) + ",[IntPtr]::Zero); 'scrolled'"
    else if (action === 'scroll-legacy') body = ''
    else if (action === 'info') body = "Add-Type -AssemblyName System.Windows.Forms; $pos=[System.Windows.Forms.Cursor]::Position; $vs=[System.Windows.Forms.SystemInformation]::VirtualScreen; 'cursor=' + $pos.X + ',' + $pos.Y + ' screen=' + $vs.Width + 'x' + $vs.Height; Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 10 | ForEach-Object { 'win: ' + $_.MainWindowTitle }"
    else return reply.code(400).send({ error: 'action غير مدعوم: ' + action })
    const wrapped = "$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " + dpiSnippet + '; ' + mu + '; ' + body + '; if (-not $?) { exit 1 }'
    const commandId = uuidv4()
    try {
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pendingCommands.delete(commandId); reject(new Error('command timeout')) }, 20000)
        pendingCommands.set(commandId, { resolve, reject, timer })
        const enc = Buffer.from(wrapped, 'utf16le').toString('base64')
        sendJson(rec.ws, { type: 'server:command', payload: { commandId, type: 'shell', command: 'powershell -NoProfile -NonInteractive -EncodedCommand ' + enc } })
      })
      dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: req.params.id, action: 'device_control', details: { action, x, y, x2, y2 }, ipAddress: req.ip })
      return { ok: true, stdout: (result && result.stdout) || '', stderr: (result && result.stderr) || '', exitCode: (result && result.exitCode) != null ? result.exitCode : 0 }
    } catch (e) { return reply.code(502).send({ error: e.message }) }
  })

  // ── Settings ──────────────────────────────────────────────────────────────
  fastify.get('/api/settings', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const rows = db.prepare("SELECT key, value FROM settings").all()
    const result = {}
    for (const r of rows) result[r.key] = parseJson(r.value, r.value)
    // v3.2.2 — expose AI config fields expected by the dashboard
    const aiCfg = getAiConfig() || {}
    result.aiProvider = aiCfg.provider || result.aiProvider || ''
    result.aiModel    = aiCfg.model    || result.aiModel    || ''
    result.aiApiKey   = (p.role === 'admin') ? (aiCfg.apiKey || '') : ''
    result.ollamaUrl  = aiCfg.baseUrl  || result.ollamaUrl  || ''
    // v3.3.5 — per-provider saved configs (keys only for admins)
    const cfgsAll = getAiConfigs()
    if (p.role === 'admin') { result.aiConfigs = cfgsAll }
    else {
      const out = {}
      for (const k of Object.keys(cfgsAll)) out[k] = { model: cfgsAll[k].model || '', baseUrl: cfgsAll[k].baseUrl || '' }
      result.aiConfigs = out
    }
    // 3.9.1 (B1) — غير admin يحصل على 200 بلا أي مفاتيح سرّية.
    return p.role === 'admin' ? result : redactSettingsForNonAdmin(result)
  })

  // v3.2.2 — dashboard PUT /api/settings (maps dashboard keys → storage + ai_config sync)
  fastify.put('/api/settings', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    const body = req.body || {}
    const upsert = db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,datetime('now'))")
    for (const k of Object.keys(body)) {
      if (body[k] === undefined) continue
      upsert.run(k, JSON.stringify(body[k]))
    }
    const aiKeys = ['aiProvider', 'aiModel', 'aiApiKey', 'ollamaUrl']
    if (aiKeys.some(k => k in body)) {
      const cur = getAiConfig() || {}
      const next = {
        provider: body.aiProvider !== undefined ? body.aiProvider : (cur.provider || ''),
        model:    body.aiModel    !== undefined ? body.aiModel    : (cur.model    || ''),
        apiKey:   body.aiApiKey   !== undefined ? body.aiApiKey   : (cur.apiKey   || ''),
        baseUrl:  body.ollamaUrl  !== undefined ? body.ollamaUrl  : (cur.baseUrl  || '')
      }
      upsert.run('ai_config', JSON.stringify(next))
      const cfgMap = getAiConfigs()
      cfgMap[next.provider || 'openai'] = { apiKey: next.apiKey || '', model: next.model || '', baseUrl: next.baseUrl || '' }
      setAiConfigs(cfgMap)
    }
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'settings_updated', details: { keys: Object.keys(body).slice(0, 12) }, ipAddress: req.ip })
    return { ok: true }
  })

  fastify.put('/api/settings/:key', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,datetime('now'))").run(req.params.key, JSON.stringify(req.body))
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'settings_updated', details: { key: req.params.key }, ipAddress: req.ip })
    return { ok: true }
  })

  // v3.3.0 — Telegram test (validates token then sends a test message)
  fastify.post('/api/settings/telegram/test', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    const { token, chatId } = req.body || {}
    if (!token || !chatId) return reply.code(400).send({ error: 'التوكن و Chat ID مطلوبان' })
    try {
      const meR = await fetch('https://api.telegram.org/bot' + token + '/getMe')
      const me = await meR.json().catch(() => null)
      if (!me || !me.ok) return reply.code(400).send({ error: 'التوكن غير صالح — تحقق من Bot Token' })
      const msgR = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: 'اختبار إشعارات AiRemote — تم الاتصال بنجاح' })
      })
      const msg = await msgR.json().catch(() => null)
      if (!msg || !msg.ok) return reply.code(400).send({ error: (msg && msg.description) || 'فشل إرسال الرسالة — تحقق من Chat ID' })
      return { ok: true, bot: (me.result && me.result.username) || '' }
    } catch (e) { return reply.code(500).send({ error: e.message }) }
  })

  // ── AI ────────────────────────────────────────────────────────────────────
  fastify.get('/api/ai/settings', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const cfg = getAiConfig()
    if (!cfg) return { configured: false }
    return { configured: true, provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl, hasKey: !!cfg.apiKey }
  })

  fastify.put('/api/ai/settings', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    const { provider, apiKey, model, baseUrl } = req.body || {}
    if (!provider) return reply.code(400).send({ error: 'provider required' })
    const existing = getAiConfig() || {}
    const finalKey = apiKey && apiKey !== '__keep__' ? apiKey : existing.apiKey || ''
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ai_config',?,datetime('now'))").run(JSON.stringify({ provider, apiKey: finalKey, model, baseUrl }))
    return { ok: true }
  })

  fastify.post('/api/ai/chat', async (req, reply) => {
    const p = aiAuth(req, reply); if (!p) return
    const { deviceId, message, conversationId, context } = req.body || {}
    if (!message) return reply.code(400).send({ error: 'message required' })
    const cfg = resolveAiConfig(req.body)
    if (!cfg) return reply.code(400).send({ error: 'AI not configured' })
    let convId     = conversationId || uuidv4()
    let existing   = db.prepare("SELECT messages, device_id FROM ai_conversations WHERE id=?").get(convId)
    if (existing && p.isDevice && existing.device_id !== p.deviceId) { existing = null; convId = uuidv4() }
    const history  = existing ? parseJson(existing.messages, []) : []
    const devCtx   = buildDeviceAiContext(deviceId)
    const memCtx   = buildAiMemory(p.userId, deviceId, convId)
    const sysMsg   = { role: 'system', content: AI_SYSTEM_PROMPT + (context ? `\n\n${context}` : '') + (devCtx ? `\n\n${devCtx}` : '') + (memCtx ? `\n\n${memCtx}` : '') }
    const userMsg  = { role: 'user', content: message }
    try {
      let responseText = await callAI([sysMsg, ...history, userMsg], cfg)
      // v3.3.5 — never return or save an empty answer (up to 2 extra tries)
      for (let rtry = 0; rtry < 2 && (!responseText || !String(responseText).trim()); rtry++) {
        try { await new Promise(r => setTimeout(r, 1500)); responseText = await callAI([sysMsg, ...history, userMsg], cfg) } catch {}
      }
      if (!responseText || !String(responseText).trim()) responseText = 'لم يصل رد — يبدو أنك أرسلت بسرعة: المزود المجاني يسمح برد واحد كل ~30 ثانية. انتظر نصف دقيقة ثم أعد الإرسال.'
      const newHistory   = [...history, userMsg, { role: 'assistant', content: responseText }]
      const now = new Date().toISOString()
      if (existing) { db.prepare("UPDATE ai_conversations SET messages=?, updated_at=? WHERE id=?").run(JSON.stringify(newHistory), now, convId) }
      else { db.prepare("INSERT INTO ai_conversations (id, device_id, user_id, title, messages, created_at, updated_at) VALUES (?,?,?,?,?,?,?)").run(convId, deviceId || '', p.userId, message.slice(0, 60), JSON.stringify(newHistory), now, now) }
      return { conversationId: convId, response: responseText, model: cfg.model || 'default', stats: (deviceId ? (agentSockets.get(deviceId) || {}).stats || null : null) }
    } catch (e) { return reply.code(500).send({ error: e.message }) }
  })

  fastify.post('/api/ai/chat/stream', async (req, reply) => {
    const p = aiAuth(req, reply); if (!p) return
    const { deviceId, message, conversationId, context } = req.body || {}
    if (!message) return reply.code(400).send({ error: 'message required' })
    const cfg = resolveAiConfig(req.body)
    if (!cfg) return reply.code(400).send({ error: 'AI not configured' })
    let convId     = conversationId || uuidv4()
    let existing   = db.prepare("SELECT messages, device_id FROM ai_conversations WHERE id=?").get(convId)
    if (existing && p.isDevice && existing.device_id !== p.deviceId) { existing = null; convId = uuidv4() }
    const history  = existing ? parseJson(existing.messages, []) : []
    const devCtx   = buildDeviceAiContext(deviceId)
    const memCtx   = buildAiMemory(p.userId, deviceId, convId)
    const sysMsg   = { role: 'system', content: AI_SYSTEM_PROMPT + (context ? `\n\n${context}` : '') + (devCtx ? `\n\n${devCtx}` : '') + (memCtx ? `\n\n${memCtx}` : '') }
    const userMsg  = { role: 'user', content: message }

    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' })
    reply.raw.write(`data: ${JSON.stringify({ conversationId: convId })}\n\n`)

    let fullResponse = ''
    try {
      fullResponse = await callAI([sysMsg, ...history, userMsg], cfg, true, (chunk) => {
        reply.raw.write(`data: ${JSON.stringify({ delta: chunk, chunk: chunk })}\n\n`)
      })
      if (!fullResponse) {
        fullResponse = await callAI([sysMsg, ...history, userMsg], cfg, false)
        reply.raw.write(`data: ${JSON.stringify({ delta: fullResponse, chunk: fullResponse })}\n\n`)
      }
    } catch (e) {
      // v3.3.2 — fallback: some OpenAI-compatible providers reject streaming (e.g. HTTP 402).
      // Retry without streaming and deliver the full text as one chunk.
      try {
        fullResponse = await callAI([sysMsg, ...history, userMsg], cfg, false)
        if (fullResponse) reply.raw.write(`data: ${JSON.stringify({ delta: fullResponse, chunk: fullResponse })}\n\n`)
        else reply.raw.write(`data: ${JSON.stringify({ error: e.message })}\n\n`)
      } catch (e2) {
        reply.raw.write(`data: ${JSON.stringify({ error: (e2 && e2.message) || e.message })}\n\n`)
      }
    }
    // v3.3.5 — never end with an empty answer: one more retry, then a clear message
    if (!fullResponse || !String(fullResponse).trim()) {
      for (let rtry = 0; rtry < 2 && (!fullResponse || !String(fullResponse).trim()); rtry++) {
        try { await new Promise(r => setTimeout(r, 1500)); fullResponse = await callAI([sysMsg, ...history, userMsg], cfg, false) } catch {}
      }
      if (!fullResponse || !String(fullResponse).trim()) fullResponse = 'لم يصل رد — يبدو أنك أرسلت بسرعة: المزود المجاني يسمح برد واحد كل ~30 ثانية. انتظر نصف دقيقة ثم أعد الإرسال.'
      reply.raw.write("data: " + JSON.stringify({ delta: fullResponse, chunk: fullResponse }) + "\n\n")
    }
    reply.raw.write('data: ' + JSON.stringify({ done: true, stats: (deviceId ? (agentSockets.get(deviceId) || {}).stats || null : null) }) + '\n\n')
    reply.raw.write('data: [DONE]\n\n'); reply.raw.end()

    try {
      const newHistory = [...history, userMsg, { role: 'assistant', content: fullResponse }]
      const now = new Date().toISOString()
      if (existing) { db.prepare("UPDATE ai_conversations SET messages=?, updated_at=? WHERE id=?").run(JSON.stringify(newHistory), now, convId) }
      else { db.prepare("INSERT INTO ai_conversations (id, device_id, user_id, title, messages, created_at, updated_at) VALUES (?,?,?,?,?,?,?)").run(convId, deviceId || '', p.userId, message.slice(0, 60), JSON.stringify(newHistory), now, now) }
    } catch {}
  })

  fastify.post('/api/ai/auto-heal', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { deviceId, issue, stats, logs: agentLogs } = req.body || {}
    if (!issue) return reply.code(400).send({ error: 'issue required' })
    const cfg = getAiConfig(); if (!cfg) return reply.code(400).send({ error: 'AI not configured' })
    const prompt = `أنت خبير في إدارة الخوادم. حلّل المشكلة التالية واقترح خطوات الإصلاح:\nالمشكلة: ${issue}${stats ? `\nالإحصائيات: CPU: ${stats.cpuPercent}%, RAM: ${stats.ramPercent}%` : ''}${agentLogs ? `\nLogs:\n${agentLogs}` : ''}`
    try {
      const analysis = await callAI([{ role: 'user', content: prompt }], cfg)
      return { analysis, deviceId }
    } catch (e) { return reply.code(500).send({ error: e.message }) }
  })

  fastify.get('/api/ai/conversations', async (req, reply) => {
    const p = aiAuth(req, reply); if (!p) return
    const { deviceId } = req.query || {}
    if (deviceId) return db.prepare("SELECT id, device_id, title, created_at, updated_at FROM ai_conversations WHERE user_id=? AND device_id=? ORDER BY updated_at DESC LIMIT 50").all(p.userId, deviceId)
    return db.prepare("SELECT id, device_id, title, created_at, updated_at FROM ai_conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 50").all(p.userId)
  })

  fastify.get('/api/ai/conversations/:id', async (req, reply) => {
    const p = aiAuth(req, reply); if (!p) return
    const conv = db.prepare("SELECT * FROM ai_conversations WHERE id=? AND user_id=?").get(req.params.id, p.userId)
    if (!conv) return reply.code(404).send({ error: 'Not found' })
    return { ...conv, messages: parseJson(conv.messages, []) }
  })

  fastify.delete('/api/ai/conversations/:id', async (req, reply) => {
    const p = aiAuth(req, reply); if (!p) return
    db.prepare("DELETE FROM ai_conversations WHERE id=? AND user_id=?").run(req.params.id, p.userId)
    return reply.code(204).send()
  })

  // v3.2.2 — Dashboard AI aliases (history / validate)
  fastify.get('/api/ai/history', async (req, reply) => {
    const p = aiAuth(req, reply); if (!p) return
    const { conversationId, deviceId } = req.query || {}
    let conv = null
    if (conversationId) conv = db.prepare("SELECT * FROM ai_conversations WHERE id=? AND user_id=?").get(conversationId, p.userId)
    else if (deviceId)  conv = db.prepare("SELECT * FROM ai_conversations WHERE user_id=? AND device_id=? ORDER BY updated_at DESC LIMIT 1").get(p.userId, deviceId)
    if (conv && p.isDevice && conv.device_id !== p.deviceId) conv = null
    if (conv && deviceId && conv.device_id !== deviceId) conv = null
    if (!conv) return { messages: [], conversationId: null }
    const msgs = parseJson(conv.messages, [])
    return { conversationId: conv.id, messages: msgs.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp || conv.updated_at })) }
  })

  fastify.delete('/api/ai/history', async (req, reply) => {
    const p = aiAuth(req, reply); if (!p) return
    const q = req.query || {}
    if (q.conversationId) { db.prepare("DELETE FROM ai_conversations WHERE id=? AND user_id=?").run(q.conversationId, p.userId); return { ok: true } }
    if (q.deviceId) { db.prepare("DELETE FROM ai_conversations WHERE user_id=? AND device_id=?").run(p.userId, q.deviceId); return { ok: true } }
    db.prepare("DELETE FROM ai_conversations WHERE user_id=?").run(p.userId)
    return { ok: true }
  })

  fastify.post('/api/ai/validate', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const cfg = (req.body && req.body.config) || {}
    const provider = String(cfg.provider || '').trim()
    if (!provider) return reply.code(400).send({ error: 'provider required' })
    const stored = getAiConfig() || {}
    const apiKey  = cfg.apiKey || stored.apiKey || ''
    const model   = cfg.model || stored.model || ''
    const baseUrl = String(cfg.baseUrl || '').replace(/\/$/, '')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30000)
    try {
      if (provider === 'ollama') {
        const base = baseUrl || 'http://localhost:11434'
        const r = await fetch(`${base}/api/tags`, { signal: ctrl.signal })
        if (!r.ok) throw new Error('Ollama HTTP ' + r.status)
        const d = await r.json().catch(() => ({}))
        const n = Array.isArray(d.models) ? d.models.length : 0
        return { ok: true, valid: true, provider, detail: 'Ollama متاح — ' + n + ' موديل' }
      }
      if (provider === 'openai') {
        // v3.3.4 — free Pollinations provider works without an API key
        if (/pollinations/i.test(baseUrl)) {
          const rp = await fetch(baseUrl.replace(/\/openai$/i, '').replace(/\/v1$/i, '') + '/models', { signal: ctrl.signal })
          if (!rp.ok) throw new Error('HTTP ' + rp.status)
          return { ok: true, valid: true, provider, detail: 'مزود مجاني (Pollinations) — متاح بدون مفتاح API' }
        }
        if (!apiKey) return reply.code(400).send({ error: 'يتطلب مفتاح OpenAI — أو استخدم المزود المجاني: الرابط https://text.pollinations.ai بدون مفتاح' })
        const base = baseUrl || 'https://api.openai.com'
        const r = await fetch(`${base}/v1/models`, { headers: { 'Authorization': 'Bearer ' + apiKey }, signal: ctrl.signal })
        if (r.status === 401) return reply.code(400).send({ error: 'مفتاح API غير صالح (401)' })
        if (r.status === 403) return reply.code(400).send({ error: 'خدمة OpenAI غير متاحة من منطقتك (403) — استخدم المزود المجاني: الرابط https://text.pollinations.ai بدون مفتاح' })
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const d = await r.json().catch(() => ({}))
        const list = Array.isArray(d.data) ? d.data : []
        const hasModel = model ? list.some(m => (m.id || '') === model) : true
        return { ok: true, valid: true, provider, detail: hasModel ? 'الاتصال ناجح' + (model ? ' والموديل متاح' : '') : 'الاتصال ناجح لكن الموديل "' + model + '" غير مدرج في القائمة' }
      }
      if (provider === 'zai') {
        // Z.ai (GLM) - OpenAI-compatible
        if (!apiKey) return reply.code(400).send({ error: 'مفتاح Z.ai API مطلوب' })
        const base = /z\.ai/i.test(baseUrl) ? baseUrl : 'https://api.z.ai/api/paas/v4'
        const r = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: model || 'glm-4.7-flash', messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 8 }),
          signal: ctrl.signal
        })
        if (r.status === 401 || r.status === 403) return reply.code(400).send({ error: 'مفتاح Z.ai غير صحيح (' + r.status + ')' })
        if (r.status === 429) return reply.code(400).send({ error: 'مزود Z.ai مزدحم مؤقتاً (429) — الطبقة المجانية مضغوطة، أعد المحاولة بعد دقيقة' })
        if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Z.ai HTTP ' + r.status + ': ' + t.slice(0, 120)) }
        return { ok: true, valid: true, provider, detail: 'Z.ai متصل - الموديل: ' + (model || 'glm-4.7-flash') }
      }
      if (provider === 'gemini') {
        if (!apiKey) return reply.code(400).send({ error: 'مفتاح API مطلوب' })
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey, { signal: ctrl.signal })
        if (r.status === 400 || r.status === 403) return reply.code(400).send({ error: 'مفتاح Google غير صالح' })
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const d = await r.json().catch(() => ({}))
        const n = Array.isArray(d.models) ? d.models.length : 0
        return { ok: true, valid: true, provider, detail: 'Gemini متاح — ' + n + ' موديل' }
      }
      return reply.code(400).send({ error: 'مزود غير معروف: ' + provider })
    } catch (e) {
      const msg = (e && e.name === 'AbortError') ? 'انتهت المهلة (9 ثوانٍ) — تحقق من العنوان والاتصال' : (e.message || String(e))
      return reply.code(400).send({ error: msg })
    } finally { clearTimeout(timer) }
  })
  // ── Alerts ────────────────────────────────────────────────────────────────
  fastify.get('/api/alerts', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    return db.prepare("SELECT * FROM alert_rules WHERE user_id=? ORDER BY created_at DESC").all(p.userId)
  })

  fastify.post('/api/alerts', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { type, deviceId, threshold, cooldownMin = 30, channel = 'in_app', webhookUrl } = req.body || {}
    const validTypes = ['device_offline','device_online','cpu_high','ram_high','disk_high']
    if (!validTypes.includes(type)) return reply.code(400).send({ error: `type must be one of: ${validTypes.join(', ')}` })
    const id = uuidv4()
    db.prepare("INSERT INTO alert_rules (id, user_id, device_id, type, threshold, cooldown_min, channel, webhook_url) VALUES (?,?,?,?,?,?,?,?)").run(id, p.userId, deviceId || null, type, threshold || null, cooldownMin, channel, webhookUrl || null)
    return reply.code(201).send({ id, type, deviceId, threshold, cooldownMin, channel })
  })

  fastify.patch('/api/alerts/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const rule = db.prepare("SELECT * FROM alert_rules WHERE id=?").get(req.params.id)
    if (!rule) return reply.code(404).send({ error: 'Not found' })
    if (rule.user_id !== p.userId && p.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    db.prepare("UPDATE alert_rules SET enabled=? WHERE id=?").run((req.body?.enabled ? 1 : 0), req.params.id)
    return { ok: true }
  })

  fastify.delete('/api/alerts/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const rule = db.prepare("SELECT user_id FROM alert_rules WHERE id=?").get(req.params.id)
    if (!rule) return reply.code(404).send({ error: 'Not found' })
    if (rule.user_id !== p.userId && p.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    db.prepare("DELETE FROM alert_rules WHERE id=?").run(req.params.id)
    return reply.code(204).send()
  })

  // ── SSH Credentials ───────────────────────────────────────────────────────
  fastify.get('/api/credentials', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { deviceId } = req.query || {}
    if (deviceId) return db.prepare("SELECT id, device_id, label, ssh_host, ssh_port, ssh_username, secret_type, last_used, created_at FROM device_credentials WHERE user_id=? AND device_id=? ORDER BY created_at DESC").all(p.userId, deviceId)
    return db.prepare("SELECT id, device_id, label, ssh_host, ssh_port, ssh_username, secret_type, last_used, created_at FROM device_credentials WHERE user_id=? ORDER BY created_at DESC").all(p.userId)
  })

  fastify.post('/api/credentials', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { deviceId, label, sshHost, sshPort = 22, sshUsername, secretType = 'password', secret } = req.body || {}
    if (!deviceId || !label || !sshHost || !sshUsername || !secret) return reply.code(400).send({ error: 'deviceId, label, sshHost, sshUsername, secret required' })
    const id = uuidv4()
    db.prepare("INSERT INTO device_credentials (id, user_id, device_id, label, ssh_host, ssh_port, ssh_username, secret_type, secret_enc) VALUES (?,?,?,?,?,?,?,?,?)").run(id, p.userId, deviceId, label, sshHost, sshPort, sshUsername, secretType, encryptSecret(secret))
    return reply.code(201).send({ id, deviceId, label, sshHost, sshPort, sshUsername, secretType })
  })

  fastify.delete('/api/credentials/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const cred = db.prepare("SELECT user_id FROM device_credentials WHERE id=?").get(req.params.id)
    if (!cred) return reply.code(404).send({ error: 'Not found' })
    if (cred.user_id !== p.userId && p.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    db.prepare("DELETE FROM device_credentials WHERE id=?").run(req.params.id)
    return reply.code(204).send()
  })

  // ── SFTP ──────────────────────────────────────────────────────────────────
  fastify.post('/api/sftp/connect', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { host, port = 22, username, password, privateKey, credentialId } = req.body || {}
    let fHost = host, fPort = port, fUser = username, fPass = password, fKey = privateKey
    if (credentialId) {
      const cred = db.prepare("SELECT * FROM device_credentials WHERE id=? AND user_id=?").get(credentialId, p.userId)
      if (!cred) return reply.code(404).send({ error: 'Credential not found' })
      fHost = cred.ssh_host; fPort = cred.ssh_port; fUser = cred.ssh_username
      const sec = decryptSecret(cred.secret_enc)
      if (cred.secret_type === 'private_key') fKey = sec; else fPass = sec
      db.prepare("UPDATE device_credentials SET last_used=datetime('now') WHERE id=?").run(credentialId)
    }
    if (!fHost || !fUser) return reply.code(400).send({ error: 'host and username required' })
    return new Promise((resolve) => {
      try {
        const { Client } = getSsh2(); const conn = new Client(); const sessionId = uuidv4()
        const authConf = { host: fHost, port: fPort, username: fUser }
        if (fKey) authConf.privateKey = fKey; else if (fPass) authConf.password = fPass
        conn.on('ready', () => {
          conn.sftp((err, sftp) => {
            if (err) { conn.end(); resolve(reply.code(502).send({ error: err.message })); return }
            sftpSessions.set(sessionId, { sftp, conn, userId: p.userId })
            setTimeout(() => { if (sftpSessions.has(sessionId)) { try { sftpSessions.get(sessionId).conn.end() } catch {}; sftpSessions.delete(sessionId) } }, 30 * 60000)
            resolve({ sessionId, host: fHost, username: fUser })
          })
        })
        conn.on('error', err => resolve(reply.code(502).send({ error: err.message })))
        conn.connect(authConf)
      } catch (e) { resolve(reply.code(502).send({ error: e.message })) }
    })
  })

  fastify.get('/api/sftp/:sessionId/list', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const sess = sftpSessions.get(req.params.sessionId)
    if (!sess) return reply.code(404).send({ error: 'SFTP session not found' })
    if (sess.userId && p.role !== 'admin' && sess.userId !== p.userId) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذه الجلسة' })
    return new Promise((resolve) => {
      sess.sftp.readdir(req.query?.path || '/', (err, list) => {
        if (err) { resolve(reply.code(502).send({ error: err.message })); return }
        resolve(list.map(f => ({ name: f.filename, type: f.attrs.isDirectory() ? 'directory' : 'file', size: f.attrs.size, modified: new Date(f.attrs.mtime * 1000).toISOString(), mode: f.attrs.mode })))
      })
    })
  })

  fastify.get('/api/sftp/:sessionId/download', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { path: fsPath } = req.query || {}
    const sess = sftpSessions.get(req.params.sessionId)
    if (!sess) return reply.code(404).send({ error: 'SFTP session not found' })
    if (sess.userId && p.role !== 'admin' && sess.userId !== p.userId) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذه الجلسة' })
    if (!fsPath) return reply.code(400).send({ error: 'path required' })
    return new Promise((resolve) => {
      const chunks = []; const stream = sess.sftp.createReadStream(fsPath)
      stream.on('data', c => chunks.push(c))
      stream.on('end', () => {
        const buf = Buffer.concat(chunks)
        reply.header('Content-Disposition', `attachment; filename="${fsPath.split('/').pop() || 'file'}"`).header('Content-Type', 'application/octet-stream')
        resolve(buf)
      })
      stream.on('error', err => resolve(reply.code(502).send({ error: err.message })))
    })
  })

  fastify.post('/api/sftp/:sessionId/mkdir', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const sess = sftpSessions.get(req.params.sessionId)
    if (!sess) return reply.code(404).send({ error: 'SFTP session not found' })
    if (sess.userId && p.role !== 'admin' && sess.userId !== p.userId) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذه الجلسة' })
    const { path: fsPath } = req.body || {}
    if (!fsPath) return reply.code(400).send({ error: 'path required' })
    return new Promise((resolve) => { sess.sftp.mkdir(fsPath, err => err ? resolve(reply.code(502).send({ error: err.message })) : resolve({ ok: true })) })
  })

  fastify.delete('/api/sftp/:sessionId/delete', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const sess = sftpSessions.get(req.params.sessionId)
    if (!sess) return reply.code(404).send({ error: 'SFTP session not found' })
    if (sess.userId && p.role !== 'admin' && sess.userId !== p.userId) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذه الجلسة' })
    const { path: fsPath, type } = req.query || {}
    if (!fsPath) return reply.code(400).send({ error: 'path required' })
    return new Promise((resolve) => {
      const fn = type === 'directory' ? 'rmdir' : 'unlink'
      sess.sftp[fn](fsPath, err => err ? resolve(reply.code(502).send({ error: err.message })) : resolve({ ok: true }))
    })
  })

  fastify.post('/api/sftp/:sessionId/close', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const sess = sftpSessions.get(req.params.sessionId)
    if (sess && sess.userId && p.role !== 'admin' && sess.userId !== p.userId) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذه الجلسة' })
    if (sess) { try { sess.conn.end() } catch {}; sftpSessions.delete(req.params.sessionId) }
    return { ok: true }
  })

  // ── Recordings ────────────────────────────────────────────────────────────
  fastify.get('/api/recordings', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { deviceId } = req.query || {}
    const base = "SELECT r.*, d.name as device_name FROM recordings r LEFT JOIN devices d ON r.device_id=d.id"
    if (deviceId) {
      return p.role === 'admin'
        ? db.prepare(`${base} WHERE r.device_id=? ORDER BY r.created_at DESC LIMIT 100`).all(deviceId)
        : db.prepare(`${base} WHERE r.device_id=? AND r.user_id=? ORDER BY r.created_at DESC LIMIT 100`).all(deviceId, p.userId)
    }
    return p.role === 'admin'
      ? db.prepare(`${base} ORDER BY r.created_at DESC LIMIT 100`).all()
      : db.prepare(`${base} WHERE r.user_id=? ORDER BY r.created_at DESC LIMIT 100`).all(p.userId)
  })

  fastify.post('/api/recordings', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { deviceId, name } = req.body || {}
    if (!deviceId) return reply.code(400).send({ error: 'deviceId required' })
    if (!hasDeviceCapability(p, deviceId, 'record')) return denyCapability(reply, p, deviceId, 'record', req)
    const id = uuidv4(); const now = new Date().toISOString()
    db.prepare("INSERT INTO recordings (id, device_id, user_id, name, started_at) VALUES (?,?,?,?,?)").run(id, deviceId, p.userId, name || `Recording ${now.slice(0,10)}`, now)
    return reply.code(201).send({ id, deviceId, userId: p.userId, name, startedAt: now })
  })

  fastify.patch('/api/recordings/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const recPatch = db.prepare("SELECT id, user_id FROM recordings WHERE id=?").get(req.params.id)
    if (!recPatch) return reply.code(404).send({ error: 'Not found' })
    if (p.role !== 'admin' && recPatch.user_id !== p.userId) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذا التسجيل' })
    const now = new Date().toISOString()
    db.prepare("UPDATE recordings SET ended_at=? WHERE id=?").run(now, req.params.id)
    return { ok: true, endedAt: now }
  })

  fastify.delete('/api/recordings/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const rec = db.prepare("SELECT * FROM recordings WHERE id=?").get(req.params.id)
    if (!rec) return reply.code(404).send({ error: 'Not found' })
    if (p.role !== 'admin' && rec.user_id !== p.userId) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذا التسجيل' })
    if (rec.file_path && fs.existsSync(rec.file_path)) try { fs.unlinkSync(rec.file_path) } catch {}
    db.prepare("DELETE FROM recordings WHERE id=?").run(req.params.id)
    return reply.code(204).send()
  })

  // ── Audit Log ─────────────────────────────────────────────────────────────
  fastify.get('/api/audit', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    const q = req.query || {}
    const pageSize = Math.min(parseInt(q.pageSize || q.limit || '50') || 50, 500)
    const page     = Math.max(parseInt(q.page || '1') || 1, 1)
    let where = ' WHERE 1=1'; const args = []
    if (q.action)   { where += ' AND action=?';   args.push(q.action) }
    if (q.userId)   { where += ' AND user_id=?';  args.push(q.userId) }
    if (q.deviceId) { where += ' AND device_id=?'; args.push(q.deviceId) }
    const total   = db.prepare('SELECT COUNT(*) as c FROM audit_log' + where).get(...args).c
    const entries = db.prepare('SELECT * FROM audit_log' + where + ' ORDER BY created_at DESC LIMIT ? OFFSET ?').all(...args, pageSize, (page - 1) * pageSize)
    return { entries, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
  })

  fastify.get('/api/audit/export', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    const q = req.query || {}
    let where = ' WHERE 1=1'; const args = []
    if (q.action) { where += ' AND action=?'; args.push(q.action) }
    if (q.userId) { where += ' AND user_id=?'; args.push(q.userId) }
    const rows = db.prepare('SELECT created_at, user_email, action, device_id, ip_address, details FROM audit_log' + where + ' ORDER BY created_at DESC LIMIT 10000').all(...args)
    const esc  = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
    const csv  = ['"created_at","user_email","action","device_id","ip_address","details"']
      .concat(rows.map(r => [r.created_at, r.user_email, r.action, r.device_id, r.ip_address, r.details].map(esc).join(',')))
      .join('\r\n')
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="airemote-audit.csv"')
    return '\uFEFF' + csv
  })


  // ── Notifications ─────────────────────────────────────────────────────────
  function notificationsPayload(userId, opts) {
    opts = opts || {}
    const limit = Math.min(parseInt(opts.limit || '50') || 50, 200)
    const rows = opts.unread
      ? db.prepare("SELECT * FROM notifications WHERE user_id=? AND read=0 ORDER BY created_at DESC LIMIT ?").all(userId, limit)
      : db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?").all(userId, limit)
    const unread = db.prepare("SELECT COUNT(*) as c FROM notifications WHERE user_id=? AND read=0").get(userId).c
    return { notifications: rows, unread }
  }
  const notifListHandler = async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    return notificationsPayload(p.userId, { unread: req.query?.unread === '1', limit: req.query?.limit })
  }
  fastify.get('/api/notifications', notifListHandler)
  fastify.get('/api/alerts/notifications', notifListHandler)
  const notifReadHandler = async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { all, ids } = req.body || {}
    if (all) { db.prepare("UPDATE notifications SET read=1 WHERE user_id=?").run(p.userId); return { ok: true } }
    if (Array.isArray(ids) && ids.length) {
      const stmt = db.prepare("UPDATE notifications SET read=1 WHERE user_id=? AND id=?")
      for (const id of ids.slice(0, 500)) stmt.run(p.userId, String(id))
      return { ok: true, count: ids.length }
    }
    return reply.code(400).send({ error: 'all=true or ids[] required' })
  }
  fastify.post('/api/alerts/notifications/read', notifReadHandler)
  const notifClearHandler = async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    db.prepare("DELETE FROM notifications WHERE user_id=? AND read=1").run(p.userId)
    return { ok: true }
  }
  fastify.delete('/api/alerts/notifications', notifClearHandler)


  // v3.2.2 — Recording download
  fastify.get('/api/recordings/:id/download', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const rec = db.prepare("SELECT * FROM recordings WHERE id=?").get(req.params.id)
    if (!rec) return reply.code(404).send({ error: 'Not found' })
    if (p.role !== 'admin' && rec.user_id !== p.userId) return reply.code(403).send({ error: 'غير مصرح بالوصول لهذا التسجيل' })
    // v3.8.14 - do not hand out the ZIP while the MP4 is still being muxed.
    if (muxingRecordings.has(rec.id)) {
      const pendingMp4 = path.join(path.dirname(_config.dbPath || '.'), 'recordings', rec.id + '.mp4')
      if (!fs.existsSync(pendingMp4)) {
        reply.header('Retry-After', '3')
        reply.header('X-Video-State', 'muxing')
        return reply.code(202).send({ state: 'muxing', recording: rec.id })
      }
    }
    if (!rec.file_path || !fs.existsSync(rec.file_path)) return reply.code(404).send({ error: 'Recording file not found' })
    // v3.8.8 - serve the muxed MP4 when the exporter finished, the ZIP otherwise.
    let filePath = rec.file_path
    if (filePath.toLowerCase().endsWith('.zip')) {
      const asMp4 = filePath.replace(/\.zip$/i, '.mp4')
      try { if (fs.existsSync(asMp4)) filePath = asMp4 } catch {}
    }
    const isMp4 = filePath.toLowerCase().endsWith('.mp4')
    reply.header('Content-Type', isMp4 ? 'video/mp4' : 'application/zip')
    reply.header('Content-Disposition', 'attachment; filename="recording-' + String(rec.id).slice(0, 8) + (isMp4 ? '.mp4' : '.zip') + '"')
    return fs.createReadStream(filePath)
  })
  // v3.8.14 - light status probe so the viewer waits for the MP4 without
  // downloading the whole ZIP on every poll (which is what made long recordings
  // look like they never produced a video).
  fastify.get('/api/recordings/:id/status', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const rec = db.prepare("SELECT * FROM recordings WHERE id=?").get(req.params.id)
    if (!rec) return reply.code(404).send({ error: 'Not found' })
    if (p.role !== 'admin' && rec.user_id !== p.userId) return reply.code(403).send({ error: 'Forbidden' })
    const dir = path.join(path.dirname(_config.dbPath || '.'), 'recordings')
    const mp4Path = path.join(dir, rec.id + '.mp4')
    // v3.8.15 - ffmpeg creates the output file before it finishes writing it, so
    // "file exists" is not "ready": muxing wins, and mp4 is only reported once the
    // row points at it (the exporter updates file_path on exit code 0).
    let state = 'missing'
    if (muxingRecordings.has(rec.id)) state = 'muxing'
    else if (rec.file_path && rec.file_path.toLowerCase().endsWith('.mp4') && fs.existsSync(rec.file_path)) state = 'mp4'
    else if (rec.file_path && fs.existsSync(rec.file_path)) state = 'zip'
    else if (fs.existsSync(mp4Path)) state = 'mp4'
    return { id: rec.id, state, endedAt: rec.ended_at, sizeMb: rec.size_mb || 0 }
  })

  // ── GitHub Releases ───────────────────────────────────────────────────────
  const REPO_ROOT    = path.resolve(__dirname, '../..')
  const RELEASES_DIR = path.join(REPO_ROOT, 'releases')

  const GH_RELEASES = [
    { id: 'win-gui',    label: 'Windows Agent (GUI)',    assetName: `AiRemote-Agent-v${AGENT_VERSION}-Windows-x64.zip`, filePath: path.join(RELEASES_DIR, 'agent-windows',  `AiRemote-Agent-v${AGENT_VERSION}-Windows-x64.zip`) },
    { id: 'win-exe',    label: 'Windows Agent (CLI)',    assetName: `AiRemote-Agent-v${AGENT_VERSION}-win-x64.exe`,     filePath: path.join(RELEASES_DIR, 'agent-headless', `AiRemote-Agent-v${AGENT_VERSION}-win-x64.exe`) },
    { id: 'linux-bin',  label: 'Linux Agent (Binary)',   assetName: `AiRemote-Agent-v${AGENT_VERSION}-linux-x64`,       filePath: path.join(RELEASES_DIR, 'agent-headless', `AiRemote-Agent-v${AGENT_VERSION}-linux-x64`) },
    { id: 'script-js',  label: 'Node.js Script',         assetName: `agent-v${AGENT_VERSION}.js`,                       filePath: path.join(RELEASES_DIR, 'agent-script',   `agent-v${AGENT_VERSION}.js`) },
    { id: 'script-pkg', label: 'Script Package (ZIP)',   assetName: `agent-script-v${AGENT_VERSION}.zip`,               filePath: path.join(RELEASES_DIR, 'agent-script',   `agent-script-v${AGENT_VERSION}.zip`) },
  ]

  async function ghApi(method, url, token, body, fileBuffer, contentType) {
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': `AiRemote/${AGENT_VERSION}` }
    let fetchBody
    if (fileBuffer) { headers['Content-Type'] = contentType || 'application/octet-stream'; headers['Content-Length'] = String(fileBuffer.length); fetchBody = fileBuffer }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; fetchBody = JSON.stringify(body) }
    const res = await fetch(url, { method, headers, body: fetchBody })
    if (!res.ok) { const t = await res.text().catch(() => ''); let msg = `GitHub API ${res.status}`; try { const j = JSON.parse(t); if (j.message) msg += ': ' + j.message } catch {}; throw new Error(msg) }
    if (res.status === 204) return {}
    return res.json()
  }

  function getGhConfig() {
    const row = db.prepare("SELECT value FROM settings WHERE key='github_config'").get()
    return row ? parseJson(row.value) : null
  }

  fastify.get('/api/github/config', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    const cfg = getGhConfig()
    return cfg ? { configured: true, owner: cfg.owner, repo: cfg.repo, tokenSet: !!cfg.token } : { configured: false }
  })

  fastify.post('/api/github/config', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    const { token, owner, repo } = req.body || {}
    if (!owner?.trim() || !repo?.trim()) return reply.code(400).send({ error: 'owner and repo required' })
    const existing = getGhConfig()
    const finalToken = token?.trim() && token !== '__keep__' ? token.trim() : existing?.token || ''
    if (!finalToken) return reply.code(400).send({ error: 'Token required' })
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('github_config',?,datetime('now'))").run(JSON.stringify({ token: finalToken, owner: owner.trim(), repo: repo.trim() }))
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'github_config_saved', ipAddress: req.ip })
    return { ok: true }
  })

  fastify.post('/api/github/test', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    const cfg = getGhConfig(); if (!cfg) return reply.code(400).send({ error: 'GitHub not configured' })
    try {
      const user = await ghApi('GET', 'https://api.github.com/user', cfg.token)
      const repo = await ghApi('GET', `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, cfg.token)
      return { ok: true, user: user.login, repo: repo.full_name, private: repo.private }
    } catch (e) { return reply.code(400).send({ error: e.message }) }
  })

  fastify.get('/api/github/releases', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    return GH_RELEASES.map(r => {
      const exists = fs.existsSync(r.filePath)
      return { id: r.id, label: r.label, assetName: r.assetName, exists, sizeMB: exists ? (fs.statSync(r.filePath).size / 1024 / 1024).toFixed(1) : null }
    })
  })

  fastify.post('/api/github/publish/:releaseId', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    const cfg = getGhConfig(); if (!cfg) return reply.code(400).send({ error: 'Configure GitHub first' })
    const { releaseId } = req.params
    const validIds = [...GH_RELEASES.map(r => r.id), 'all']
    if (!validIds.includes(releaseId)) return reply.code(400).send({ error: 'Invalid releaseId' })
    const publishId = `${releaseId}-${Date.now()}`
    publishStates.set(publishId, { status: 'running', log: [], startedAt: new Date().toISOString() })

    ;(async () => {
      const state = publishStates.get(publishId)
      const log   = (msg) => { state.log.push(msg); console.log(`[GitHub] ${msg}`) }
      const targets = releaseId === 'all' ? GH_RELEASES : GH_RELEASES.filter(r => r.id === releaseId)
      const available = targets.filter(r => fs.existsSync(r.filePath))
      if (!available.length) { state.status = 'error'; log('لا توجد ملفات — قم ببناء الإصدار أولاً'); state.finishedAt = new Date().toISOString(); return }
      try {
        log(`التحقق من الإصدار v${AGENT_VERSION}...`)
        let release
        try { release = await ghApi('GET', `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/tags/v${AGENT_VERSION}`, cfg.token) }
        catch { release = await ghApi('POST', `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases`, cfg.token, { tag_name: `v${AGENT_VERSION}`, name: `AiRemote v${AGENT_VERSION}`, draft: false, prerelease: false }); log(`تم إنشاء إصدار جديد`) }
        release = await ghApi('GET', `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/${release.id}`, cfg.token)
        state.url = release.html_url
        const uploadBase = release.upload_url.replace('{?name,label}', '')
        for (const def of available) {
          log(`📦 رفع ${def.assetName}...`)
          const existing = release.assets?.find(a => a.name === def.assetName)
          if (existing) { await ghApi('DELETE', `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/assets/${existing.id}`, cfg.token); log('  حذف النسخة القديمة') }
          const buf = fs.readFileSync(def.filePath)
          const ct  = def.assetName.endsWith('.zip') ? 'application/zip' : def.assetName.endsWith('.exe') ? 'application/vnd.microsoft.portable-executable' : 'application/octet-stream'
          await ghApi('POST', `${uploadBase}?name=${encodeURIComponent(def.assetName)}`, cfg.token, undefined, buf, ct)
          log(`  ✅ ${def.assetName} (${(buf.length/1024/1024).toFixed(1)} MB)`)
        }
        state.status = 'done'; state.finishedAt = new Date().toISOString(); log(`🎉 اكتمل النشر`)
      } catch (e) { state.status = 'error'; state.finishedAt = new Date().toISOString(); log(`❌ ${e.message}`) }
    })().catch(() => {})

    return { publishId }
  })

  fastify.get('/api/github/publish/:publishId/status', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    const state = publishStates.get(req.params.publishId)
    if (!state) return reply.code(404).send({ error: 'Publish job not found' })
    return state
  })

  // ── Downloads (via GitHub API) ────────────────────────────────────────────
  fastify.get('/api/downloads/releases', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const cfg = getGhConfig()
    if (!cfg) return { configured: false, releases: [], version: AGENT_VERSION }
    try {
      const release = await ghApi('GET', `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/latest`, cfg.token)
      return {
        configured: true, version: release.tag_name, releaseName: release.name,
        releaseUrl: release.html_url, publishedAt: release.published_at,
        assets: (release.assets || []).map(a => ({
          name: a.name, size: a.size, downloadUrl: a.browser_download_url,
          platform: a.name.includes('Windows') || a.name.endsWith('.exe') ? 'windows' : a.name.includes('linux') ? 'linux' : 'any',
          updatedAt: a.updated_at,
        })),
      }
    } catch (e) { return { configured: true, assets: [], version: AGENT_VERSION, error: e.message } }
  })

  fastify.get('/api/downloads/version', async () => ({ version: AGENT_VERSION, isDesktop: true }))

  // v3.2.2 — Local artifact manager (Dashboard /api/downloads/list)
  const DOWNLOAD_META = {
    'win-gui':    { label_ar: 'وكيل ويندوز (واجهة رسومية)', label_en: 'Windows Agent (GUI)',  desc_ar: 'حزمة كاملة مع الواجهة الرسومية — التثبيت الموصى به', desc_en: 'Full package with GUI — recommended', platform: 'windows' },
    'win-exe':    { label_ar: 'وكيل ويندوز (سطر أوامر)',    label_en: 'Windows Agent (CLI)',  desc_ar: 'ملف تنفيذي مستقل بدون واجهة', desc_en: 'Standalone headless executable', platform: 'windows' },
    'linux-bin':  { label_ar: 'وكيل لينكس (ثنائي)',         label_en: 'Linux Agent (Binary)', desc_ar: 'ثنائي لينكس x64', desc_en: 'Linux x64 binary', platform: 'linux' },
    'script-js':  { label_ar: 'سكربت Node.js',              label_en: 'Node.js Script',       desc_ar: 'تشغيل مباشر عبر Node.js', desc_en: 'Run directly with Node.js', platform: 'any' },
    'script-pkg': { label_ar: 'حزمة السكربت (ZIP)',         label_en: 'Script Package (ZIP)', desc_ar: 'حزمة سكربت كاملة', desc_en: 'Complete script package', platform: 'any' }
  }
  const dlBuildStates = new Map()   // releaseId → { status, log, available, startedAt, finishedAt }

  fastify.get('/api/downloads/list', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const releases = GH_RELEASES.map(r => {
      const meta = DOWNLOAD_META[r.id] || { label_ar: r.label, label_en: r.label, desc_ar: '', desc_en: '', platform: 'any' }
      let exists = false; let sizeBytes = 0
      try { exists = fs.existsSync(r.filePath); if (exists) sizeBytes = fs.statSync(r.filePath).size } catch {}
      const bs = dlBuildStates.get(r.id)
      return {
        id: r.id, label_ar: meta.label_ar, label_en: meta.label_en, desc_ar: meta.desc_ar, desc_en: meta.desc_en,
        badge_ar: null, badge_en: null, filename: r.assetName, platform: meta.platform,
        size_hint: exists ? (sizeBytes / 1024 / 1024).toFixed(1) + ' MB' : '', size_bytes: sizeBytes,
        available: exists, buildable: r.id === 'win-gui', build_status: bs ? bs.status : 'idle',
        version: AGENT_VERSION, download_url: '/api/downloads/file/' + r.id,
        build_url: r.id === 'win-gui' ? '/api/downloads/build/' + r.id : null,
        status_url: r.id === 'win-gui' ? '/api/downloads/build-status/' + r.id : null
      }
    })
    return { version: AGENT_VERSION, releases }
  })

  fastify.get('/api/downloads/file/:id', async (req, reply) => {
    const q = req.query || {}
    let user = null
    try { if (req.headers.authorization && String(req.headers.authorization).startsWith('Bearer ')) user = verifyToken(String(req.headers.authorization).slice(7)) } catch {}
    if (!user && q.token) { try { user = verifyToken(String(q.token)) } catch {} }
    if (!user) return reply.code(401).send({ error: 'Unauthorized' })
    const def = GH_RELEASES.find(r => r.id === req.params.id)
    if (!def || !fs.existsSync(def.filePath)) return reply.code(404).send({ error: 'Artifact not found' })
    reply.header('Content-Type', 'application/octet-stream')
    reply.header('Content-Disposition', 'attachment; filename="' + def.assetName + '"')
    return fs.createReadStream(def.filePath)
  })

  fastify.post('/api/downloads/build/:id', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    if (req.params.id !== 'win-gui') return reply.code(400).send({ error: 'Only win-gui is buildable' })
    if (!fs.existsSync(path.join(REPO_ROOT, 'package.json'))) return reply.code(400).send({ error: 'Build requires the development workspace (not available on this installation)' })
    const cur = dlBuildStates.get('win-gui')
    if (cur && cur.status === 'building') return reply.code(409).send({ error: 'Build already running' })
    const state = { status: 'building', log: [], available: false, startedAt: new Date().toISOString() }
    dlBuildStates.set('win-gui', state)
    const { spawn: spawnProc } = require('child_process')
    ;(async () => {
      try {
        state.log.push('▶ بدء بناء وكيل ويندوز...')
        const isWin = process.platform === 'win32'
        const cmd = isWin ? 'pnpm.cmd' : 'pnpm'
        const buildProc = spawnProc(cmd, ['--filter', '@airemote/agent-desktop', 'run', 'build'], { cwd: REPO_ROOT, shell: true })
        buildProc.stdout.on('data', d => { state.log.push(String(d).trim().slice(0, 400)); if (state.log.length > 300) state.log = state.log.slice(-300) })
        buildProc.stderr.on('data', d => { state.log.push(String(d).trim().slice(0, 400)); if (state.log.length > 300) state.log = state.log.slice(-300) })
        buildProc.on('close', (code) => {
          state.status = code === 0 ? 'done' : 'error'
          state.finishedAt = new Date().toISOString()
          try { state.available = fs.existsSync(GH_RELEASES[0].filePath) } catch {}
          state.log.push(code === 0 ? '✅ اكتمل البناء' : '❌ فشل البناء (code ' + code + ')')
        })
      } catch (e) { state.status = 'error'; state.finishedAt = new Date().toISOString(); state.log.push('❌ ' + e.message) }
    })()
    return { ok: true, id: 'win-gui' }
  })

  fastify.get('/api/downloads/build-status/:id', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    let fallback = false
    try { fallback = fs.existsSync(GH_RELEASES[0].filePath) } catch {}
    const state = dlBuildStates.get(req.params.id) || { status: 'idle', log: [], available: fallback }
    return state
  })


  // ── Desktop API ───────────────────────────────────────────────────────────
  fastify.get('/api/desktop/status', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    return { ...(_desktopCallbacks.getStatus?.() || {}), isDesktop: true, version: AGENT_VERSION }
  })

  fastify.post('/api/desktop/server/restart', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    _desktopCallbacks.restartServer?.().catch?.(() => {})
    return { ok: true }
  })

  fastify.post('/api/desktop/tunnel/start', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    _desktopCallbacks.startTunnel?.()
    return { ok: true }
  })

  fastify.post('/api/desktop/tunnel/stop', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    _desktopCallbacks.stopTunnel?.()
    return { ok: true }
  })

  fastify.get('/api/desktop/logs', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    return _desktopCallbacks.getLogs?.(parseInt(req.query?.n || '100')) || []
  })

  fastify.get('/api/desktop/settings', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    return _desktopCallbacks.getDesktopSettings?.() || {}
  })

  fastify.put('/api/desktop/settings', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    await _desktopCallbacks.setDesktopSettings?.(req.body)
    return { ok: true }
  })

  fastify.post('/api/desktop/backup', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    // v3.8.29 (R7) - the server owns the snapshot now; the desktop callback stays as a
    // fallback for builds that predate the manager.
    if (backupManager) {
      const r = backupManager.create('manual')
      if (!r.ok) return reply.code(500).send(r)
      dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'backup_created', details: { path: r.path, bytes: r.bytes }, ipAddress: req.ip })
      return r
    }
    try {
      return await (_desktopCallbacks.createBackup?.() || Promise.reject(new Error('Backup not available')))
    } catch (e) { return reply.code(500).send({ ok: false, error: e.message }) }
  })

  // v3.8.29 (R7) - what the operator needs before a restore: where the files are how old
  // the newest one is, and whether the last run failed.
  // v3.8.32 (R7) - retention: read the policy and the dry run any time, purge only on an
  // explicit admin call.
  fastify.get('/api/desktop/retention', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    if (!retention) return reply.code(503).send({ error: 'retention not available' })
    return { state: retention.state(), preview: retention.preview() }
  })

  fastify.post('/api/desktop/retention/run', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    if (!retention) return reply.code(503).send({ error: 'retention not available' })
    const body = req.body || {}
    const dryRun = body.dryRun === true
    if (!dryRun && body.confirm !== true) return reply.code(400).send({ error: 'confirm:true is required to delete' })
    const r = retention.run({ dryRun, dataDir: path.dirname(_config.dbPath || '.') })
    if (!dryRun && r.ok) dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'retention_run', details: r.deleted || {}, ipAddress: req.ip })
    return r
  })

  // v3.8.30 (R7) - schema state for an operator deciding whether an upgrade is safe.
  // v3.8.31 (R7) - update from an internal folder, verified by the signed manifest.
  // Checking is read-only; applying is a separate admin action that names the version.
  const updateDir = () => _config.updateDir || process.env.AIREMOTE_UPDATE_DIR || path.join(path.dirname(_config.dbPath || '.'), 'updates', 'source')
  const runCheck = async () => {
    const verdict = await updater.check({ sourceDir: updateDir(), currentVersion: SERVER_VERSION })
    updateState = { at: Date.now(), verdict }
    return verdict
  }

  fastify.get('/api/desktop/update', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    return {
      current: SERVER_VERSION,
      sourceDir: updateDir(),
      lastCheck: updateState.at ? new Date(updateState.at).toISOString() : null,
      verdict: updateState.verdict,
      lastResult: updater.readResult(path.dirname(_config.dbPath || '.')),
    }
  })

  fastify.post('/api/desktop/update/check', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    try { return await runCheck() } catch (e) { return reply.code(500).send({ ok: false, error: e.message }) }
  })

  fastify.post('/api/desktop/update/apply', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    const body = req.body || {}
    const target = String(body.version || '')
    if (body.confirm !== true) return reply.code(400).send({ error: 'confirm:true is required' })
    let verdict
    try { verdict = await runCheck() } catch (e) { return reply.code(500).send({ ok: false, error: e.message }) }
    if (!verdict.available || !verdict.verified) return reply.code(409).send({ error: 'no verified update available', verdict })
    if (target && target !== verdict.latest) return reply.code(409).send({ error: 'target mismatch', expected: verdict.latest })
    let staged
    try { staged = updater.stage(verdict, path.dirname(_config.dbPath || '.')) }
    catch (e) { return reply.code(500).send({ error: 'staging failed: ' + e.message }) }

    // Rollback needs an older package. A release share usually keeps them, so pick the
    // highest version below the target; otherwise the helper reports a clean failure.
    // The pattern must keep its backslashes: an escaped-to-death regex silently matches
    // nothing, and the first live drill shipped exactly that bug.
    let previous = null
    let rollbackNote = null
    try {
      const dir = path.join(updateDir(), 'server-windows')
      const files = fs.readdirSync(dir)
      const older = files
        .map((f) => ({ f, v: (f.match(/-v(\d+\.\d+\.\d+)-x64\.exe$/) || [])[1] }))
        .filter((x) => x.v && updater.compareVersions(x.v, verdict.latest) < 0)
        .sort((a, b) => updater.compareVersions(b.v, a.v))[0]
      previous = older ? path.join(dir, older.f) : null
      if (!previous) rollbackNote = 'no older package in ' + dir + ' (found ' + files.length + ' file(s))'
    } catch (e) { previous = null; rollbackNote = 'scan failed: ' + e.message }

    const appExe = path.join(path.dirname(process.execPath), 'AiRemote Server.exe')
    const started = updater.apply({
      dataDir: path.dirname(_config.dbPath || '.'),
      stagedPath: staged.path,
      previousInstaller: previous,
      target: verdict.latest,
      appExe,
    })
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'update_started', details: { from: SERVER_VERSION, to: verdict.latest, staged: staged.path, rollback: previous }, ipAddress: req.ip })
    return { ok: true, from: SERVER_VERSION, to: verdict.latest, staged: staged.path, rollback: previous, rollbackNote, helper: started }
  })

  fastify.get('/api/desktop/schema', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    try { return migrations.status(db) } catch (e) { return reply.code(500).send({ error: e.message }) }
  })

  fastify.get('/api/desktop/backups', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    if (!backupManager) return reply.code(503).send({ error: 'backup manager not available' })
    return { state: backupManager.state(), files: backupManager.list() }
  })

  // ── v3.8.12 / R4 — جلسات وكيل‑بوكيل عبر Relay ──────────────────────────────
  fastify.post('/api/relay/request', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const p = relayAuth(req, reply); if (!p) return
    const body = req.body || {}
    const access = String(body.access || 'control')
    if (!Object.prototype.hasOwnProperty.call(RELAY_ACCESS_CAPABILITY, access)) {
      return reply.code(400).send({ error: 'access غير مدعوم', code: 'bad_access', allowed: Object.keys(RELAY_ACCESS_CAPABILITY) })
    }
    let target = null
    if (body.targetDeviceId) target = db.prepare('SELECT * FROM devices WHERE id=?').get(String(body.targetDeviceId))
    else if (body.targetCode) target = deviceByCode(String(body.targetCode))
    if (!target) return reply.code(404).send({ error: 'لا يوجد جهاز بهذا المعرّف', code: 'unknown_device' })

    // الخطوة 2 في §4.2: الصلاحية تُفحص قبل أي إشعار للطرف الهدف.
    const capability = RELAY_ACCESS_CAPABILITY[access]
    let allowed = false
    if (p.isDevice) {
      if (String(target.owner_id) !== String(p.ownerId)) allowed = false
      else {
        let caps = {}
        try { caps = JSON.parse(target.capabilities || '{}') || {} } catch {}
        allowed = access === 'view' || (access === 'control' && caps.screenControl !== false) || (access === 'files' && caps.fs !== false)
      }
    } else {
      allowed = capability ? hasDeviceCapability(p, target.id, capability) : canAccessDevice(p, target.id)
    }
    if (!allowed) {
      dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: target.id, action: 'session_policy_denied', details: { access, via: p.isDevice ? 'device' : 'user' }, ipAddress: req.ip })
      return reply.code(403).send({ error: 'غير مصرح بهذا النوع من الوصول لهذا الجهاز', code: 'session_policy_denied' })
    }
    // 3.9.0 — الجهاز المصادق لا يطلب باسم جهاز آخر.
    if (p.isDevice && String(body.requesterDeviceId || '') !== String(p.deviceId)) {
      return reply.code(403).send({ error: 'requesterDeviceId يجب أن يطابق الجهاز المصادق', code: 'requester_mismatch' })
    }
    const passwordCheck = sessionPasswordCheck(target, body.password)
    if (!passwordCheck.ok) {
      if (passwordCheck.code === 'password_locked') reply.header('Retry-After', String(Math.ceil((passwordCheck.retryAfterMs || 300000) / 1000)))
      return reply.code(passwordCheck.code === 'password_locked' ? 429 : 403).send({ error: 'كلمة مرور الجهاز مطلوبة أو غير صحيحة', code: passwordCheck.code, attemptsLeft: passwordCheck.attemptsLeft })
    }
    if (!agentSockets.has(target.id)) {
      return reply.code(503).send({ error: 'الجهاز الهدف غير متصل', code: 'target_offline' })
    }
    // سياسة التعارض: جلسة واحدة لكل جهاز (منع، لا انتظار ولا استبدال).
    for (const s of relaySessions.values()) {
      if (s.target.deviceId === target.id && RELAY_ACTIVE_STATES.includes(s.state)) {
        dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: target.id, action: 'session_conflict', details: { sessionId: s.id, state: s.state }, ipAddress: req.ip })
        return reply.code(409).send({ error: 'يوجد جلسة قائمة أو معلّقة على هذا الجهاز', code: 'session_conflict', sessionId: s.id, state: s.state })
      }
    }
    const active = relayActiveCount()
    if (active >= RELAY_MAX_SESSIONS) {
      dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: target.id, action: 'session_capacity_rejected', details: { active, max: RELAY_MAX_SESSIONS }, ipAddress: req.ip })
      return reply.code(503).send({ error: 'سعة Relay ممتلئة', code: 'relay_capacity', active, max: RELAY_MAX_SESSIONS })
    }

    const id = uuidv4()
    const requesterDeviceId = body.requesterDeviceId ? String(body.requesterDeviceId) : null
    let requesterName = p.email || 'user'
    if (requesterDeviceId) {
      const rd = db.prepare('SELECT name FROM devices WHERE id=?').get(requesterDeviceId)
      if (rd) requesterName = rd.name
    }
    const session = {
      id, state: 'requested', access,
      capabilities: capability ? [capability] : ['control', 'files', 'record'],
      requester: { userId: p.userId, email: p.email || '', deviceId: requesterDeviceId, name: requesterName },
      target: { deviceId: target.id, name: target.name, ownerId: target.owner_id },
      createdAt: Date.now(), acceptedAt: null, closedAt: null, reason: null,
      bytesIn: 0, bytesOut: 0, droppedBytes: 0,
      tokenHash: null, tokenExpiresAt: null, tokenUses: {},
      offerTimer: null, throttleAt: 0, windowStart: Date.now(), windowBytes: 0,
    }
    relaySessions.set(id, session)

    const offerSent = relaySendToDevice(target.id, {
      type: 'session:offer',
      payload: {
        sessionId: id, access,
        accessLabel: SESSION_VIEW_ACCESS_LABEL[access] || access,
        passwordMode: !!(unattendedRow(target.id) && unattendedRow(target.id).enabled),
        requester: { name: requesterName, email: p.email || '', userId: p.userId, deviceId: requesterDeviceId },
        requesterOs: (function () { try { const rd = requesterDeviceId ? db.prepare('SELECT info FROM devices WHERE id=?').get(requesterDeviceId) : null; return rd && rd.info ? (JSON.parse(rd.info).platform || '') : '' } catch { return '' } })(),
        target: { deviceId: target.id, name: target.name },
        expiresInMs: RELAY_OFFER_TTL_MS,
        channels: RELAY_CHANNELS.slice(),
      },
    })
    if (!offerSent) { relaySessions.delete(id); return reply.code(503).send({ error: 'الجهاز الهدف غير متصل', code: 'target_offline' }) }

    session.offerTimer = setTimeout(() => {
      if (session.state !== 'requested') return
      session.state = 'expired'
      session.reason = 'timeout'
      session.offerTimer = null
      relaySendToDevice(session.requester.deviceId, { type: 'session:expired', payload: { sessionId: id, reason: 'timeout' } })
      relaySendToDevice(session.target.deviceId, { type: 'session:expired', payload: { sessionId: id, reason: 'timeout' } })
      dbLogAudit({ userId: session.requester.userId, userEmail: session.requester.email, deviceId: session.target.deviceId, action: 'session_expired', details: { sessionId: id }, ipAddress: null })
      relayBroadcastState(session)
      relayPruneLater(session, 60000)
    }, RELAY_OFFER_TTL_MS)
    if (session.offerTimer && session.offerTimer.unref) session.offerTimer.unref()

    dbLogAudit({ userId: p.userId, userEmail: p.email, deviceId: target.id, action: 'session_requested', details: { sessionId: id, access, requesterDeviceId }, ipAddress: req.ip })
    relayBroadcastState(session)
    return reply.code(201).send({ ok: true, sessionId: id, state: 'requested', access, target: { id: target.id, name: target.name }, expiresInMs: RELAY_OFFER_TTL_MS })
  })

  fastify.post('/api/relay/:id/decision', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const s = relayGet(req.params.id)
    if (!s) return reply.code(404).send({ error: 'لا توجد جلسة بهذا المعرّف', code: 'unknown_session' })
    if (!isDeviceOwnerOrAdmin(p, s.target.deviceId)) return reply.code(403).send({ error: 'قرار الجلسة لمالك الجهاز الهدف فقط', code: 'owner_required' })
    const accept = (req.body || {}).accept === true
    const res = relayDecide(s, accept, (req.body || {}).reason, 'user:' + String(p.userId).slice(0, 8))
    if (!res.ok) return reply.code(409).send({ error: 'الجلسة ليست بانتظار قرار', code: res.code, state: res.state })
    return { ok: true, sessionId: s.id, state: res.state }
  })

  // 3.9.0 — تذكرة عرض جديدة لطرف الطلب (بعد accept فقط).
  fastify.post('/api/relay/:id/view-ticket', async (req, reply) => {
    const p = relayAuth(req, reply); if (!p) return
    const s = relayGet(req.params.id)
    if (!s) return reply.code(404).send({ error: 'لا توجد جلسة بهذا المعرّف', code: 'unknown_session' })
    if (!p.isDevice || String(p.deviceId) !== String(s.requester.deviceId)) {
      return reply.code(403).send({ error: 'تذكرة العرض لجهاز الطالب فقط', code: 'not_party' })
    }
    if (s.state !== 'active') return reply.code(409).send({ error: 'الجلسة غير نشطة', code: 'session_not_active', state: s.state })
    const vt = sessionViewGrant(s, s.target.deviceId, s.access)
    return { ok: true, ticket: vt.ticket, viewUrl: vt.viewUrl, expiresAt: vt.expiresAt, access: s.access, resumeKey: vt.resumeKey, resumeUrl: vt.viewUrl, keyExpiresAt: vt.keyExpiresAt }
  })

  fastify.get('/api/relay/sessions', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const rows = []
    for (const s of relaySessions.values()) {
      if (p.role !== 'admin' && s.requester.userId !== p.userId && s.target.ownerId !== p.userId) continue
      rows.push({
        id: s.id, state: s.state, access: s.access,
        requesterDeviceId: s.requester.deviceId, requesterName: s.requester.name,
        targetDeviceId: s.target.deviceId, targetName: s.target.name,
        createdAt: s.createdAt, acceptedAt: s.acceptedAt, closedAt: s.closedAt, reason: s.reason,
        bytesIn: s.bytesIn, bytesOut: s.bytesOut,
      })
    }
    return { active: relayActiveCount(), max: RELAY_MAX_SESSIONS, sessions: rows }
  })

  fastify.get('/api/relay/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const s = relayGet(req.params.id)
    if (!s) return reply.code(404).send({ error: 'لا توجد جلسة بهذا المعرّف', code: 'unknown_session' })
    if (!canAccessDevice(p, s.target.deviceId) && s.requester.userId !== p.userId) return reply.code(403).send({ error: 'Forbidden' })
    return {
      id: s.id, state: s.state, access: s.access, reason: s.reason,
      requester: { userId: s.requester.userId, name: s.requester.name, deviceId: s.requester.deviceId },
      target: { deviceId: s.target.deviceId, name: s.target.name },
      createdAt: s.createdAt, acceptedAt: s.acceptedAt, closedAt: s.closedAt,
      bytesIn: s.bytesIn, bytesOut: s.bytesOut, droppedBytes: s.droppedBytes || 0,
      peerOnline: agentSockets.has(s.requester.deviceId || '') || agentSockets.has(s.target.deviceId),
    }
  })

  fastify.post('/api/relay/:id/close', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const s = relayGet(req.params.id)
    if (!s) return reply.code(404).send({ error: 'لا توجد جلسة بهذا المعرّف', code: 'unknown_session' })
    const isParty = s.requester.userId === p.userId || s.requester.deviceId === p.userId
    if (!isParty && !canAccessDevice(p, s.target.deviceId)) return reply.code(403).send({ error: 'Forbidden' })
    relayCloseSession(s, (req.body || {}).reason || 'user', p.userId)
    return { ok: true, sessionId: s.id, state: s.state }
  })

  fastify.register(async (app) => {
    app.get('/ws', { websocket: true }, (socket, request) => {
      const q = request.query || {}
      if (q.agent === '1' || q.type === 'agent') { handleAgentWs(socket); return }
      const user = resolveWsUser(q)
      if (user) { handleClientWs(socket, user); return }
      // Compatibility: agents that connect with a plain ws:// URL (as shown by
      // the in-app connect string) authenticate via the agent:register message.
      // Sockets that never register are closed by the register timeout.
      handleAgentWs(socket)
    })

    app.get('/pty', { websocket: true }, (socket, request) => {
      const q = request.query || {}
      const user = resolveWsUser(q)
      if (!user) { socket.close(); return }
      handlePtyWs(socket, request, user)
    })

    app.get('/screen', { websocket: true }, (socket, request) => {
      const q = request.query || {}
      const rt = String(q.rt || '')
      const rk = String(q.rk || '')
      if (rt || rk) {
        const res = sessionViewAuthorize(q)
        if (!res.ok) {
          dbLogAudit({
            userId: res.session ? (res.session.requester.userId || '') : '',
            userEmail: res.session ? (res.session.requester.email || '') : '',
            deviceId: q.deviceId || (res.row && res.row.device_id) || null,
            action: 'session_view_denied',
            details: { code: res.code, sessionId: res.session ? res.session.id : (res.row && res.row.session_id) || null },
            ipAddress: request && request.socket ? request.socket.remoteAddress : null,
          })
          try { socket.send(JSON.stringify({ type: 'screen:error', payload: { code: res.code, message: 'تذكرة عرض غير صالحة أو منتهية' } })) } catch {}
          socket.close()
          return
        }
        // التذكرة تُستهلك عند أول فتح فقط؛ مفتاح الإعادة لا يُستهلك (T5 محفوظ).
        if (res.mode === 'ticket') sessionViewConsume(res.row)
        const s = res.session
        const synthetic = {
          userId: s.requester.userId || '', email: s.requester.email || '',
          role: res.row.access === 'view' ? 'viewer' : 'manager',
          sessionId: s.id, sessionAccess: res.row.access, isSessionTicket: true,
        }
        socket._sessionAccess = res.row.access
        dbLogAudit({
          userId: synthetic.userId, userEmail: synthetic.email, deviceId: s.target.deviceId,
          action: res.mode === 'resume' ? 'session_view_reopened' : 'session_view_opened',
          details: { sessionId: s.id, access: res.row.access, mode: res.mode, uses: res.row.uses || null },
          ipAddress: request && request.socket ? request.socket.remoteAddress : null,
        })
        handleScreenWs(socket, request, synthetic)
        return
      }
      const user = resolveWsUser(q)
      if (!user) { socket.close(); return }
      handleScreenWs(socket, request, user)
    })

    app.get('/ssh', { websocket: true }, (socket, request) => {
      const q = request.query || {}
      const user = resolveWsUser(q)
      if (!user) { socket.close(); return }
      handleSshWs(socket, user)
    })
  })

  await fastify.listen({ port, host: '0.0.0.0' })
  shuttingDown = false
  started    = true
  _startedAt = Date.now()
  log?.info('server', `✅ AiRemote Server v${SERVER_VERSION} listening on port ${port}`)
  log?.info('server', `📡 Local IP: ${getLocalIp()}`)
  log?.info('server', hasDashboard ? '🖥️  Dashboard: embedded (static)' : '⚠️  Dashboard: not built yet')
}

async function stop() {
  try { if (backupManager) backupManager.stop() } catch {}
  try { if (retention) retention.stop() } catch {}
  if (!started || !fastify) return
  shuttingDown = true
  started = false; _startedAt = null
  for (const [id] of agentSockets) markDeviceOffline(id)
  agentSockets.clear(); clientSockets.clear(); ptyClients.clear()
  screenViewers.clear(); wsTickets.clear()
  for (const { conn } of sftpSessions.values()) try { conn.end() } catch {}
  sftpSessions.clear()
  for (const { conn } of sshSessions.values()) try { conn.end() } catch {}
  sshSessions.clear()
  try { await fastify.close() } catch {}
  if (db) { try { db.close() } catch {} }
  db = null; fastify = null
}

function getStatus() {
  return { running: started, port: _config.port || 3001, devicesOnline: agentSockets.size, localIp: getLocalIp(), startedAt: _startedAt, version: AGENT_VERSION }
}

function getAllDevices() {
  if (!db) return []
  return db.prepare("SELECT id, name, token, status, last_seen, tags, info FROM devices ORDER BY name").all()
    .map(d => ({ ...d, info: parseJson(d.info), tags: parseJson(d.tags, []), isOnline: agentSockets.has(d.id) }))
}

module.exports = { start, stop, getStatus, getAllDevices, events, getTlsCertPath: () => TLS_CERT_PATH, isTls: () => TLS_ACTIVE,
  // v3.8.12 / R2 — خطّافات اختبار لتشفير الأسرار (لا تُستخدم في مسارات الإنتاج)
  __secrets: { initSecretKey, encryptSecret, decryptSecret, migrateLegacySecrets, legacyDerivedKey,
               getKeyPath: () => _secretKeyPath, hasKey: () => !!_secretKey } }
