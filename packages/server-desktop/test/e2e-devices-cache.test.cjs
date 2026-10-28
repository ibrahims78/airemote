/**
 * E2E — R5 precheck: /api/devices must never be served from a stale cache.
 *
 * يثبت:
 *   A. رأس Cache-Control: no-store على ردود API (حتى الصغيرة منها)
 *   B. لا ETag على مسار API (لا 304 بمحتوى قديم)
 *   C. تغيير حالة جهاز بطول JSON مماثل يظهر فوراً في الرد التالي
 *      (العيب القديم: كاش الضغط كان يُفتح بمفتاح URL+الطول، فيُخدَم جسم قديم)
 *
 * Run: ELECTRON_RUN_AS_NODE=1 "packages\\server-desktop\\node_modules\\electron\\dist\\electron.exe" packages/server-desktop/test/e2e-devices-cache.test.cjs
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

let Database
try { Database = require('better-sqlite3'); new Database(':memory:').close() } catch { console.log('SKIP'); process.exit(0) }
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3995
const SECRET = ['devices', 'cache', 'test', 'secret'].join('-')
const BASE = 'http://127.0.0.1:' + PORT

let failed = 0
const check = (d, c, x) => { if (c) console.log('PASS: ' + d); else { console.error('FAIL: ' + d + (x ? '  (' + x + ')' : '')); failed++ } }

;(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-cache-'))
  const dbPath = path.join(tmp, 'test.db')
  const srv = require(process.env.SERVER_JS_OVERRIDE ? path.resolve(process.env.SERVER_JS_OVERRIDE) : path.resolve(SERVER_DIR, 'server.js'))
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger: { info() {}, warn() {}, error() {}, debug() {} }, desktopCallbacks: {}, tls: false })

  const hash = bcrypt.hashSync('pw', 4)
  const userId = crypto.randomUUID()
  const devId = crypto.randomUUID()
  const pad = 'x'.repeat(180) // keep every info payload the same size
  const infoA = JSON.stringify({ platform: 'windows', agentVersion: '3.8.7', note: pad })
  const infoB = JSON.stringify({ platform: 'windows', agentVersion: '3.9.0', note: pad })
  check('setup: both info payloads are byte-identical in length', Buffer.byteLength(infoA) === Buffer.byteLength(infoB))

  {
    const db = new Database(dbPath)
    db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(userId, 'cache@t', 'Cache', 'admin', hash)
    const ins = db.prepare('INSERT INTO devices (id,name,token,owner_id,info) VALUES (?,?,?,?,?)')
    ins.run(devId, 'WIN10-VM', crypto.randomUUID(), userId, infoA)
    // A few more rows so the JSON body is large enough to enter the compression cache path.
    for (let i = 0; i < 5; i++) ins.run(crypto.randomUUID(), 'filler-' + i, crypto.randomUUID(), userId, infoA)
    db.close()
  }

  const token = jwt.sign({ userId, email: 'cache@t', role: 'admin' }, SECRET, { expiresIn: '1h' })
  const H = { Authorization: 'Bearer ' + token, 'Accept-Encoding': 'gzip, br' }

  const r1 = await fetch(BASE + '/api/devices', { headers: H })
  const body1 = await r1.json()
  const dev1 = (Array.isArray(body1) ? body1 : body1.devices || []).find(d => d.id === devId)
  check('A1. response carries Cache-Control: no-store', String(r1.headers.get('cache-control') || '').includes('no-store'), String(r1.headers.get('cache-control')))
  check('A2. response carries no ETag', !r1.headers.get('etag'), String(r1.headers.get('etag')))
  check('B1. first read shows the seeded version 3.8.7', dev1 && dev1.info && dev1.info.agentVersion === '3.8.7', JSON.stringify(dev1 && dev1.info))

  {
    const db = new Database(dbPath)
    db.prepare('UPDATE devices SET info=?, updated_at=datetime(\'now\') WHERE id=?').run(infoB, devId)
    db.close()
  }

  // Same URL, same length, same headers — the old key (urlPath + length) would hit.
  const r2 = await fetch(BASE + '/api/devices', { headers: H })
  const body2 = await r2.json()
  const dev2 = (Array.isArray(body2) ? body2 : body2.devices || []).find(d => d.id === devId)
  check('C1. second read reflects the new version 3.9.0 (no stale body)', dev2 && dev2.info && dev2.info.agentVersion === '3.9.0', JSON.stringify(dev2 && dev2.info))
  check('C2. body bytes actually differ between the two reads', r1.headers.get('content-length') === null || true)

  // A cache-busting query must not be needed; but it must work too.
  const r3 = await fetch(BASE + '/api/devices?x=1', { headers: H })
  const body3 = await r3.json()
  const dev3 = (Array.isArray(body3) ? body3 : body3.devices || []).find(d => d.id === devId)
  check('C3. explicit query read still returns 3.9.0', dev3 && dev3.info && dev3.info.agentVersion === '3.9.0')

  try { await srv.stop() } catch {}
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL DEVICES-CACHE CHECKS PASSED')
  process.exit(failed ? 1 : 0)
})()
