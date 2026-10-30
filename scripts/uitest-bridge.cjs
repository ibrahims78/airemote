#!/usr/bin/env node
'use strict'
/**
 * Screenshot bridge: serves the built dashboard over HTTPS with the server's own
 * certificate (now trusted), proxies /api and the WebSocket to the installed server,
 * and exposes the lab credentials same-origin so a page can sign in without the
 * credentials ever appearing in a command line or a log.
 *
 *   https://127.0.0.1:8092/         dashboard
 *   https://127.0.0.1:8092/__creds  {email,password}
 */
const http = require('http')
const https = require('https')
const tls = require('tls')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', 'packages', 'dashboard', 'dist')
const TLS_DIR = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote-Server\\tls'
const CREDS = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'
const API = { host: '127.0.0.1', port: 3001 }
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' }

let tokenCache = { token: null, user: null, at: 0 }

function getToken() {
  return new Promise((resolve) => {
    if (tokenCache.token && Date.now() - tokenCache.at < 10 * 60 * 1000) return resolve(tokenCache)
    try {
      const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
      const body = JSON.stringify({ email: c.email, password: c.password })
      const r = https.request({ host: API.host, port: API.port, path: '/api/auth/login', method: 'POST', rejectUnauthorized: false, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
        let b = ''
        res.on('data', d => b += d)
        res.on('end', () => {
          try { const js = JSON.parse(b); if (js.token) tokenCache = { token: js.token, user: js.user, at: Date.now() } } catch {}
          resolve(tokenCache)
        })
      })
      r.on('error', () => resolve(tokenCache))
      r.write(body); r.end()
    } catch { resolve(tokenCache) }
  })
}

function htmlWithSession(html, theme) {
  const boot = {
    auth: { state: { token: tokenCache.token, user: tokenCache.user, refreshToken: null }, version: 0 },
    ui: { state: { theme: theme === 'light' ? 'light' : 'dark', lang: 'ar' }, version: 0 }
  }
  const tag = '<script>(function(){try{localStorage.setItem(\'airemote-auth\',' + JSON.stringify(JSON.stringify(boot.auth)) + ');localStorage.setItem(\'airemote-ui\',' + JSON.stringify(JSON.stringify(boot.ui)) + ');}catch(e){}})();</script>'
  return html.replace('</head>', tag + '</head>')
}

function handler(req, res) {
  const url = req.url || '/'
  if (url.split('?')[0] === '/__creds') {
    try {
      const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify({ email: c.email, password: c.password }))
    } catch { res.writeHead(500); res.end('{}') }
    return
  }
  if (url.startsWith('/api')) {
    const u = new URL('https://127.0.0.1:3001' + url)
    const proxy = https.request({
      host: API.host, port: API.port, path: u.pathname + u.search, method: req.method,
      headers: { ...req.headers, host: '127.0.0.1:' + API.port }, rejectUnauthorized: false
    }, r => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res) })
    proxy.on('error', e => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })) })
    req.pipe(proxy)
    return
  }
  const urlPath = decodeURIComponent(url.split('?')[0])
  let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html')
  if (file.endsWith('.html')) {
    const theme = new URL('https://x' + url).searchParams.get('theme') || 'dark'
    getToken().then(() => {
      let html = fs.readFileSync(file, 'utf8')
      if (tokenCache.token) html = htmlWithSession(html, theme)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(html)
    })
    return
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' })
  fs.createReadStream(file).pipe(res)
}

function attachUpgrade(server) {
  server.on('upgrade', (req, socket, head) => {
    const up = tls.connect({ host: API.host, port: API.port, rejectUnauthorized: false, servername: 'localhost' }, () => {
      let head1 = req.method + ' ' + req.url + ' HTTP/1.1\r\n'
      for (const k of Object.keys(req.headers)) head1 += k + ': ' + req.headers[k] + '\r\n'
      head1 += '\r\n'
      up.write(head1)
      if (head && head.length) up.write(head)
      socket.pipe(up); up.pipe(socket)
    })
    up.on('error', () => { try { socket.destroy() } catch {} })
    socket.on('error', () => { try { up.destroy() } catch {} })
  })
}

const creds = { key: fs.readFileSync(TLS_DIR + '\\server.key'), cert: fs.readFileSync(TLS_DIR + '\\server.crt') }
const main = https.createServer(creds, handler)
attachUpgrade(main)
main.listen(8092, '127.0.0.1', () => console.log('UI_HTTPS_READY https://127.0.0.1:8092'))

const plain = http.createServer(handler)
plain.listen(8090, '127.0.0.1', () => console.log('UI_HTTP_READY http://127.0.0.1:8090'))
