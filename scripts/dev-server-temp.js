#!/usr/bin/env node
'use strict'
/**
 * R6.15 — يرفع نسخة المصدر من السيرفر على قاعدة بيانات مؤقتة، بلا TLS، للقطات الشاشة فقط.
 * لا يمسّ قاعدة المختبر في %APPDATA%\AiRemote-Server.
 *
 *   ELECTRON_RUN_AS_NODE=1 node_modules\.pnpm\electron@28.3.3\node_modules\electron\dist\electron.exe scripts\dev-server-temp.js
 *
 * بعدها: DEV_UI_STATIC_PORT=4180 DEV_UI_API_PORT=3011 node scripts/dev-ui-serve.cjs
 * (better-sqlite3 مبني لـElectron NODE_MODULE_VERSION 119 — التشغيل بـnode العادي يفشل.)
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const server = require(path.join(ROOT, 'packages', 'server-desktop', 'server.js'))
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-shot-'))
const dbPath = path.join(dataDir, 'shot.db')

const logger = {
  info: (a, b) => console.log('[info]', a, b || ''),
  warn: (a, b) => console.log('[warn]', a, b || ''),
  error: (a, b) => console.log('[err]', a, b || ''),
  debug: () => {},
  getRecent: () => []
}

server.start({
  port: Number(process.env.SHOT_PORT || 3011),
  jwtSecret: crypto.randomBytes(32).toString('hex'),
  dbPath,
  tls: false,
  logger
}).then(() => {
  console.log('SHOT_SERVER_READY', 'db=' + dbPath)
}).catch(e => {
  console.error('SHOT_SERVER_FAILED', e && e.message)
  process.exit(1)
})

process.on('SIGINT', () => { server.stop && server.stop().finally(() => process.exit(0)) })
