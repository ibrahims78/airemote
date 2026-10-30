// Remote exec helper: run a PowerShell command on a device through the server API.
// usage: node scripts/remote-exec.cjs <deviceId|name> "<command>" [timeoutMs]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')

const BASE = 'https://127.0.0.1:3001'
const CREDS = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'

;(async () => {
  const target = process.argv[2]
  const command = process.argv[3]
  const timeoutMs = parseInt(process.argv[4] || '60000', 10)
  if (!target || !command) { console.error('usage: remote-exec <deviceId|name> "<command>"'); process.exit(2) }

  const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
  const l = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password })
  }).then(r => r.json())
  if (!l.token) throw new Error('login failed')
  const auth = { Authorization: 'Bearer ' + l.token, 'Content-Type': 'application/json' }

  const list = await fetch(BASE + '/api/devices', { headers: auth }).then(r => r.json())
  const arr = Array.isArray(list) ? list : (list.devices || [])
  const dev = arr.find(d => d.id === target) || arr.find(d => String(d.name).toLowerCase().includes(String(target).toLowerCase()))
  if (!dev) throw new Error('device not found: ' + target)

  const res = await fetch(`${BASE}/api/devices/${dev.id}/exec`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ command, timeoutMs })
  })
  const js = await res.json().catch(() => ({}))
  console.log('device:', dev.name, '| http', res.status)
  console.log(JSON.stringify(js).slice(0, 2000))
})().catch(e => { console.error('EXEC FAILED:', e.message); process.exit(1) })
