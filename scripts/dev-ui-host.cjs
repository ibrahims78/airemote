#!/usr/bin/env node
'use strict'
/**
 * R6 — مضيف تطوير للواجهة: سيرفر المصدر + وكيل وهمي + مستخدم إداري + جهاز.
 *
 *   node scripts/dev-ui-host.cjs
 *   DEV_UI_PORT=3011 DEV_UI_EMAIL=dev@local DEV_UI_PASSWORD=... node scripts/dev-ui-host.cjs
 *
 * يطبع سطراً واحداً:  DEV_UI_READY {"port":..,"email":..,"password":..,"deviceId":..,"root":..}
 * لا يُستخدم في الإنتاج. قاعدة البيانات مؤقتة وتُعاد في كل تشغيل.
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const { createRequire } = require('module')

const ROOT = path.resolve(__dirname, '..')
const req = createRequire(path.join(ROOT, 'packages', 'server-desktop', 'package.json'))
const Database = req('better-sqlite3')
const bcrypt = req('bcryptjs')

function loadWs () {
  const base = path.join(ROOT, 'node_modules', '.pnpm')
  for (const d of fs.readdirSync(base).filter(x => /^ws@/.test(x))) {
    try { return require(path.join(base, d, 'node_modules', 'ws')) } catch {}
  }
  return null
}
const WebSocket = loadWs()
if (!WebSocket) { console.error('ws not found'); process.exit(1) }

const PORT = Number(process.env.DEV_UI_PORT || 3011)
const EMAIL = process.env.DEV_UI_EMAIL || 'dev@local'
const PASSWORD = process.env.DEV_UI_PASSWORD || crypto.randomBytes(9).toString('base64url')
const ROOT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-dev-ui-'))
const WEB_ROOT = '/' + ROOT_DIR.replace(/\\/g, '/').replace(/^\//, '')

fs.mkdirSync(path.join(ROOT_DIR, 'Documents'), { recursive: true })
fs.writeFileSync(path.join(ROOT_DIR, 'demo.txt'), 'hello from dev-ui\n')
fs.writeFileSync(path.join(ROOT_DIR, 'report.pdf'), Buffer.alloc(240 * 1024, 7))

const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-dev-ui-db-')), 'dev.db')
const srv = require(path.join(ROOT, 'packages', 'server-desktop', 'server.js'))
process.env.AIREMOTE_FT_ROOTS = ROOT_DIR

;(async () => {
  await srv.start({ port: PORT, jwtSecret: 'dev-ui-secret', dbPath, logger: { info() {}, warn() {}, error() {}, debug() {} }, desktopCallbacks: {}, tls: false })

  const db = new Database(dbPath)
  const hash = bcrypt.hashSync(PASSWORD, 8)
  const userId = crypto.randomUUID()
  db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(userId, EMAIL, 'Dev Admin', 'admin', hash)
  const devId = crypto.randomUUID()
  const devToken = crypto.randomUUID()
  db.prepare('INSERT INTO devices (id,name,token,owner_id,info,status,capabilities) VALUES (?,?,?,?,?,?,?)')
    .run(devId, 'WIN10-VM', devToken, userId, JSON.stringify({ platform: 'windows', agentVersion: '3.8.12', hostname: 'WIN10-VM', osVersion: 'Windows 10 Pro' }), 'online', '{"files":true,"control":true}')
  db.close()

  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?agent=1')
  let ft = null
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'agent:register', payload: { token: devToken, info: { platform: 'windows', agentVersion: '3.8.12', hostname: 'WIN10-VM' }, capabilities: { files: true } } }))
    const { createAgentTransfer } = require(path.join(ROOT, 'packages', 'agent-desktop', 'lib', 'file-transfer-agent.js'))
    ft = createAgentTransfer({ send: (m) => { try { ws.send(JSON.stringify(m)) } catch {} }, roots: [ROOT_DIR], log: () => {} })
  })
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()) } catch { return }
    if (m.type && m.type.startsWith('server:ft_') && ft) { ft.handle(m); return }
    if (m.type !== 'server:fs_request') return
    const p = m.payload || {}
    const reply = (data) => ws.send(JSON.stringify({ type: 'agent:fs_response', payload: { requestId: p.requestId, opId: p.requestId, data }, timestamp: Date.now() }))
    if (p.action === 'list') {
      if (!p.path || p.path === '/') {
        reply([
          { name: 'Documents', path: WEB_ROOT + '/Documents', isDirectory: true, size: 0, modified: new Date().toISOString(), permissions: '755' },
          { name: 'demo.txt', path: WEB_ROOT + '/demo.txt', isDirectory: false, size: 19, modified: new Date().toISOString(), permissions: '644' },
          { name: 'report.pdf', path: WEB_ROOT + '/report.pdf', isDirectory: false, size: 245760, modified: new Date().toISOString(), permissions: '644' }
        ])
      } else {
        const dir = String(p.path).replace(/^\//, '').replace(/\//g, path.sep)
        let entries = []
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true }).map(e => {
            const full = path.join(dir, e.name)
            const st = fs.statSync(full)
            return { name: e.name, path: '/' + full.replace(/\\/g, '/'), isDirectory: e.isDirectory(), size: st.size, modified: st.mtime.toISOString(), permissions: '644' }
          })
        } catch {}
        reply(entries)
      }
      return
    }
    reply({ ok: true })
  })

  console.log('DEV_UI_READY ' + JSON.stringify({ port: PORT, email: EMAIL, password: PASSWORD, deviceId: devId, root: ROOT_DIR }))
})().catch(e => { console.error('FATAL', e); process.exit(1) })
