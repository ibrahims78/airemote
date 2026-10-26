/**
 * lab-api.cjs — tiny CLI against the lab server.
 * Usage: node scripts/lab-api.cjs GET /api/devices
 *        node scripts/lab-api.cjs POST /api/auth/login '{"email":"...","password":"..."}'
 * Credentials: LAB_CREDS (default %APPDATA%\AiRemote\lab-credentials.txt, then ~/AppData/Roaming/...)
 * Never prints the password.
 */
'use strict'
const https = require('https')
const fs = require('fs')
const os = require('os')
const path = require('path')

const HOST = process.env.LAB_HOST || '192.168.0.175'
const PORT = process.env.LAB_PORT || '3001'

function credsPath() {
  const cands = [
    process.env.LAB_CREDS,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'AiRemote', 'lab-credentials.txt') : null,
    path.join(os.homedir(), 'AppData', 'Roaming', 'AiRemote', 'lab-credentials.txt')
  ].filter(Boolean)
  for (const c of cands) { try { if (fs.existsSync(c)) return c } catch {} }
  return null
}
function creds() {
  const p = credsPath()
  if (!p) throw new Error('lab-credentials.txt not found (set LAB_CREDS)')
  const raw = fs.readFileSync(p, 'utf8')
  const pick = (k) => { const m = raw.match(new RegExp('^\\s*' + k + '\\s*[:=]\\s*(.+)$', 'mi')); return m ? m[1].trim() : '' }
  return { email: pick('email'), password: pick('password') }
}
function req(method, pathname, body, token) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body))
    const headers = { 'Content-Type': 'application/json' }
    if (data) headers['Content-Length'] = Buffer.byteLength(data)
    if (token) headers.Authorization = 'Bearer ' + token
    const r = https.request({ host: HOST, port: PORT, path: pathname, method, headers, rejectUnauthorized: false, timeout: 15000 }, (res) => {
      let buf = ''
      res.on('data', d => { buf += d })
      res.on('end', () => { let j = null; try { j = JSON.parse(buf) } catch {}; resolve({ status: res.statusCode, json: j, raw: buf }) })
    })
    r.on('timeout', () => r.destroy(new Error('timeout')))
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}
;(async () => {
  const [, , method = 'GET', pathname = '/api/health', bodyArg] = process.argv
  let token = null
  if (pathname !== '/api/auth/login' && pathname !== '/api/health' && pathname !== '/health') {
    const c = creds()
    const l = await req('POST', '/api/auth/login', { email: c.email, password: c.password })
    if (!l.json || !(l.json.token || l.json.accessToken)) { console.log('LOGIN FAILED', l.status, (l.raw || '').slice(0, 200)); process.exit(1) }
    token = l.json.token || l.json.accessToken
  }
  const out = await req(method, pathname, bodyArg ? JSON.parse(bodyArg) : undefined, token)
  console.log(JSON.stringify(out.json, null, 2))
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1) })