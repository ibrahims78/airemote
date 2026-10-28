process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const creds = JSON.parse(fs.readFileSync('C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json', 'utf8'))
const BASE = 'https://127.0.0.1:3001'
;(async () => {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password })
  }).then(r => r.json())
  if (!login.token) { console.log('LOGIN FAILED', JSON.stringify(login)); process.exit(1) }
  const list = await fetch(BASE + '/api/devices', { headers: { Authorization: 'Bearer ' + login.token } }).then(r => r.json())
  const arr = Array.isArray(list) ? list : (list.devices || [])
  for (const d of arr) {
    let info = {}
    try { info = typeof d.info === 'string' ? JSON.parse(d.info) : (d.info || {}) } catch {}
    console.log(`${d.name.padEnd(18)} ${String(d.status).padEnd(8)} agent=${info.agentVersion || '?'} platform=${info.platform || '?'}`)
  }
})()
