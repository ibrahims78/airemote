// Lists devices + status from the lab server (credentials read from the lab file, never printed).
const https = require('https')
const fs = require('fs')
const path = require('path')

const HOST = process.env.LAB_HOST || '192.168.0.175'
const PORT = process.env.LAB_PORT || '3001'
function credsPath() {
  const cands = [process.env.LAB_CREDS,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'AiRemote', 'lab-credentials.txt') : null,
    path.join(require('os').homedir(), 'AppData', 'Roaming', 'AiRemote', 'lab-credentials.txt')].filter(Boolean)
  for (const c of cands) { try { if (fs.existsSync(c)) return c } catch {} }
  return path.join(process.env.APPDATA || '', 'AiRemote', 'lab-credentials.txt')
}
const CREDS = credsPath()

function req(method, pathname, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const headers = { 'Content-Type': 'application/json' }
    if (data) headers['Content-Length'] = Buffer.byteLength(data)
    if (token) headers.Authorization = 'Bearer ' + token
    const r = https.request({ host: HOST, port: PORT, path: pathname, method, headers, rejectUnauthorized: false }, (res) => {
      let buf = ''
      res.on('data', (d) => { buf += d })
      res.on('end', () => {
        let parsed = null
        try { parsed = JSON.parse(buf) } catch {}
        resolve({ status: res.statusCode, body: parsed, raw: buf.slice(0, 200) })
      })
    })
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

function creds() {
  const raw = fs.readFileSync(CREDS, 'utf8')
  const pick = (k) => { const m = raw.match(new RegExp('^\\s*' + k + '\\s*[:=]\\s*(.+)$', 'mi')); return m ? m[1].trim() : '' }
  return { email: pick('email'), password: pick('password') }
}

;(async () => {
  const c = creds()
  const login = await req('POST', '/api/auth/login', { email: c.email, password: c.password })
  if (!login.body || !login.body.token) {
    console.log('LOGIN-FAIL status=' + login.status + ' ' + login.raw)
    process.exit(1)
  }
  const token = login.body.token
  const dev = await req('GET', '/api/devices', null, token)
  const list = Array.isArray(dev.body) ? dev.body : (dev.body && dev.body.devices) || []
  console.log('devices: ' + list.length)
  for (const d of list) {
    console.log([d.name, 'status=' + d.status, 'isOnline=' + d.isOnline, 'platform=' + (d.info && d.info.platform), 'lastSeen=' + (d.last_seen || d.lastSeen), 'id=' + String(d.id).slice(0, 8)].join(' | '))
  }
})().catch((e) => { console.log('ERROR ' + e.message); process.exit(1) })
