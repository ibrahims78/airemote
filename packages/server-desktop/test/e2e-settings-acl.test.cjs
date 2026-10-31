/**
 * 3.9.1 (B1) — settings ACL.
 * Proves: a non-admin gets 200 with no secret material, admin keeps the full
 * object, and both write routes are admin-only (403) with no side effect.
 * Run with ELECTRON_RUN_AS_NODE=1 electron.
 */
'use strict'
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

let Database
try { Database = require('better-sqlite3'); new Database(':memory:').close() }
catch {
  try {
    const { createDatabase } = require(path.join(__dirname, '..', 'lib', 'db-adapter'))
    Database = function (p, o) { return createDatabase(p, o) }
    new Database(':memory:').close()
  } catch { console.log('SKIP: no sqlite'); process.exit(0) }
}
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3959
const SECRET = 'settings-acl-secret'
const BASE = 'http://127.0.0.1:' + PORT

let failed = 0
const check = (d, c, x) => { if (c) console.log('PASS: ' + d); else { console.error('FAIL: ' + d + (x ? '  (' + x + ')' : '')); failed++ } }

const SECRETS = ['sk-live-secret-123', 'tg-bot-secret-456', 'ghp_secret_789']

;(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-acl-'))
  const dbPath = path.join(tmp, 'test.db')
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger: { info() {}, warn() {}, error() {}, debug() {} }, desktopCallbacks: {}, tls: false })

  const adminId = crypto.randomUUID()
  const viewerId = crypto.randomUUID()
  {
    const db = new Database(dbPath)
    const hash = bcrypt.hashSync('pw', 4)
    db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(adminId, 'admin@t', 'Admin', 'admin', hash)
    db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(viewerId, 'viewer@t', 'Viewer', 'viewer', hash)
    const up = db.prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,datetime('now'))")
    up.run('ai_config', JSON.stringify({ provider: 'openai', model: 'gpt-4o', apiKey: SECRETS[0], baseUrl: '' }))
    up.run('telegramToken', JSON.stringify(SECRETS[1]))
    up.run('telegramChatId', JSON.stringify('12345'))
    up.run('github_config', JSON.stringify({ token: SECRETS[2], owner: 'acme', repo: 'airemote' }))
    up.run('uiTheme', JSON.stringify('light'))
    db.close()
  }

  const admin = jwt.sign({ userId: adminId, email: 'admin@t', role: 'admin' }, SECRET, { expiresIn: '1h' })
  const viewer = jwt.sign({ userId: viewerId, email: 'viewer@t', role: 'viewer' }, SECRET, { expiresIn: '1h' })
  const get = (t) => fetch(BASE + '/api/settings', { headers: { Authorization: 'Bearer ' + t } })
  const put = (t, p, body) => fetch(BASE + '/api/settings' + p, {
    method: 'PUT', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

  const viewerRes = await get(viewer)
  const viewerBody = await viewerRes.json().catch(() => ({}))
  const viewerRaw = JSON.stringify(viewerBody)

  check('B1/1. viewer GET /api/settings is 200 (not 403)', viewerRes.status === 200, 'status=' + viewerRes.status)
  check('B1/2. no provider key leaked to viewer', !viewerRaw.includes(SECRETS[0]), viewerRaw.slice(0, 120))
  check('B1/3. no telegram token leaked to viewer', !viewerRaw.includes(SECRETS[1]), viewerRaw.slice(0, 120))
  check('B1/4. no github token leaked to viewer', !viewerRaw.includes(SECRETS[2]) && !('github_config' in viewerBody), viewerRaw.slice(0, 120))
  check('B1/5. admin-only blobs are absent for viewer', !('ai_config' in viewerBody) && !('telegramToken' in viewerBody), Object.keys(viewerBody).join(','))
  check('B1/6. viewer still gets non-secret settings', viewerBody.aiProvider === 'openai' && viewerBody.uiTheme === 'light', JSON.stringify({ p: viewerBody.aiProvider, t: viewerBody.uiTheme }))
  check('B1/7. no apiKey field survives anywhere in the viewer body', !/apikey/i.test(viewerRaw), viewerRaw.slice(0, 160))

  const adminRes = await get(admin)
  const adminBody = await adminRes.json().catch(() => ({}))
  check('B1/8. admin GET keeps the provider key', adminRes.status === 200 && adminBody.aiApiKey === SECRETS[0], 'status=' + adminRes.status)
  check('B1/9. admin GET keeps telegram + github config', adminBody.telegramToken === SECRETS[1] && !!adminBody.github_config && adminBody.github_config.token === SECRETS[2], JSON.stringify(Object.keys(adminBody)))

  const putAll = await put(viewer, '', { uiTheme: 'dark' })
  check('B1/10. viewer PUT /api/settings is 403', putAll.status === 403, 'status=' + putAll.status)
  const putKey = await put(viewer, '/uiTheme', { value: 'dark' })
  check('B1/11. viewer PUT /api/settings/:key is 403', putKey.status === 403, 'status=' + putKey.status)

  {
    const db = new Database(dbPath)
    const row = db.prepare("SELECT value FROM settings WHERE key='uiTheme'").get()
    db.close()
    check('B1/12. refused write had no side effect', String(row && row.value).includes('light') && !String(row && row.value).includes('dark'), String(row && row.value))
  }

  const adminPut = await put(admin, '/uiTheme', { value: 'dark' })
  check('B1/13. admin write still works', adminPut.status === 200, 'status=' + adminPut.status)

  const after = await get(viewer)
  check('B1/14. viewer session survives the 403s (still 200)', after.status === 200, 'status=' + after.status)

  console.log(failed === 0 ? 'ALL SETTINGS ACL CHECKS PASSED' : 'FAILED: ' + failed)
  try { await srv.stop() } catch {}
  process.exit(failed === 0 ? 0 : 1)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
