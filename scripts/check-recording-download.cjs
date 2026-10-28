process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const creds = JSON.parse(fs.readFileSync('C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json', 'utf8'))
;(async () => {
  const login = await fetch('https://127.0.0.1:3001/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password })
  }).then(r => r.json())
  const auth = { Authorization: 'Bearer ' + login.token }
  const list = await fetch('https://127.0.0.1:3001/api/recordings', { headers: auth }).then(r => r.json())
  const rows = Array.isArray(list) ? list : (list.recordings || [])
  const rec = rows[0]
  if (!rec) { console.log('no recordings'); return }
  const res = await fetch(`https://127.0.0.1:3001/api/recordings/${rec.id}/download`, { headers: auth })
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(JSON.stringify({
    id: rec.id.slice(0, 8),
    status: res.status,
    contentType: res.headers.get('content-type'),
    disposition: res.headers.get('content-disposition'),
    bytes: buf.length,
    magic: buf.slice(4, 8).toString('ascii')
  }))
  process.exit(0)
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1) })
