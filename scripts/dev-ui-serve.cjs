#!/usr/bin/env node
'use strict'
/**
 * R6 — خادم ثابت للوحة المبنية + وكيل /api إلى سيرفر التطوير.
 *
 *   node scripts/dev-ui-serve.cjs            # 4180 → 3011
 *   DEV_UI_STATIC_PORT=4180 DEV_UI_API_PORT=3011 node scripts/dev-ui-serve.cjs
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', 'packages', 'dashboard', 'dist')
const PORT = Number(process.env.DEV_UI_STATIC_PORT || 4180)
const API_PORT = Number(process.env.DEV_UI_API_PORT || 3011)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' }

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('dashboard dist is missing — run: pnpm --filter @airemote/dashboard build')
  process.exit(1)
}

http.createServer((req, res) => {
  const url = req.url || '/'
  if (url.startsWith('/api')) {
    const proxy = http.request({ host: '127.0.0.1', port: API_PORT, path: url, method: req.method, headers: { ...req.headers, host: '127.0.0.1:' + API_PORT } }, r => {
      res.writeHead(r.statusCode || 502, r.headers)
      r.pipe(res)
    })
    proxy.on('error', e => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })) })
    req.pipe(proxy)
    return
  }
  const urlPath = decodeURIComponent(url.split('?')[0])
  let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' })
  fs.createReadStream(file).pipe(res)
}).listen(PORT, '127.0.0.1', () => console.log('DEV_UI_STATIC_READY http://127.0.0.1:' + PORT + ' → api :' + API_PORT))
