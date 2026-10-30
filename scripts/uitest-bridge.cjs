#!/usr/bin/env node
'use strict'
// Local UI bridge for screenshots: serves the built dashboard over http, proxies /api to
// the installed TLS server, and hands the page the lab credentials without printing them.
const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', 'packages', 'dashboard', 'dist')
const PORT = Number(process.env.UI_PORT || 8090)
const API = 'https://127.0.0.1:3001'
const CREDS = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' }

const server = http.createServer((req, res) => {
  const url = req.url || '/'
  if (url === '/__creds') {
    try {
      const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ email: c.email, password: c.password }))
    } catch (e) { res.writeHead(500); res.end('{}') }
    return
  }
  if (url.startsWith('/api')) {
    const u = new URL(API + url)
    const proxy = https.request({ host: u.hostname, port: 3001, path: u.pathname + u.search, method: req.method, headers: { ...req.headers, host: '127.0.0.1:3001' }, rejectUnauthorized: false }, r => {
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
})

// The dashboard keeps a WebSocket for live stats; without this proxy the monitoring tab
// sits on "waiting for data" forever and the charts never render.
server.on('upgrade', (req, socket, head) => {
  const tls = require('tls')
  const up = tls.connect({ host: '127.0.0.1', port: 3001, rejectUnauthorized: false, servername: 'localhost' }, () => {
    let reqText = req.method + ' ' + req.url + ' HTTP/1.1\r\n'
    for (const k of Object.keys(req.headers)) reqText += k + ': ' + req.headers[k] + '\r\n'
    reqText += '\r\n'
    up.write(reqText)
    if (head && head.length) up.write(head)
    socket.pipe(up); up.pipe(socket)
  })
  up.on('error', () => { try { socket.destroy() } catch {} })
  socket.on('error', () => { try { up.destroy() } catch {} })
})

server.listen(PORT, '127.0.0.1', () => console.log('UI_BRIDGE_READY http://127.0.0.1:' + PORT))
