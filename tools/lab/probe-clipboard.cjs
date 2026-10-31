// Probe: clipboard read/write round-trip on live devices. Prints lengths + hashes only (never content).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const crypto = require('crypto')
const BASE = 'https://127.0.0.1:3001'
const CREDS = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'

const DEVICES = [
  ['WIN10-VM', 'b42175d0-d0c9-428d-ab94-4e66dff56af3'],
  ['WIN11-VM', 'd147684b-2451-4418-a628-86f11aa66a4e'],
  ['TECNO-KL4', '07f8ae91-5b64-41d9-97df-ce649772b0d3'],
]

const h = s => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12)

async function login() {
  const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password })
  }).then(r => r.json())
  if (!r.token) throw new Error('login failed')
  return r.token
}
async function ticket(token) {
  const r = await fetch(BASE + '/api/auth/ws-ticket', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }
  }).then(r => r.json())
  return r.ticket
}

function run(name, id, token) {
  return new Promise(async (resolve) => {
    const url = `wss://127.0.0.1:3001/screen?deviceId=${id}&ticket=${encodeURIComponent(await ticket(token))}&fps=4&quality=40&maxWidth=640`
    const ws = new WebSocket(url)
    const out = { device: name, read: null, writeMs: null, readAfter: null, errors: [] }
    let phase = 'read'
    let t0 = 0
    const finish = () => { try { ws.close() } catch {}; resolve(out) }
    const timer = setTimeout(finish, 20000)
    ws.onopen = () => ws.send(JSON.stringify({ type: 'screen:clipboard_read', payload: {} }))
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return
      const msg = JSON.parse(ev.data)
      if (msg.type === 'screen:error') { out.errors.push(msg.payload?.message); clearTimeout(timer); setTimeout(finish, 200) }
      if (msg.type !== 'screen:clipboard') return
      const text = msg.payload?.text ?? ''
      const info = { len: text.length, hash: h(text) }
      if (phase === 'read') {
        out.read = info
        const marker = 'airemote-clip-probe-' + Date.now()
        phase = 'write'
        t0 = Date.now()
        ws.send(JSON.stringify({ type: 'screen:clipboard_write', payload: { text: marker } }))
        setTimeout(() => {
          phase = 'verify'
          ws.send(JSON.stringify({ type: 'screen:clipboard_read', payload: {} }))
        }, 1200)
      } else if (phase === 'verify') {
        out.writeMs = Date.now() - t0
        out.readAfter = info
        clearTimeout(timer)
        setTimeout(finish, 100)
      }
    }
    ws.onerror = () => { out.errors.push('ws error'); }
  })
}

;(async () => {
  const token = await login()
  for (const [n, id] of DEVICES) console.log(JSON.stringify(await run(n, id, token)))
})().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
