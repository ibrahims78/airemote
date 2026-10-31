// Probe: what does the live agent return for screen:get_monitors on each device?
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const BASE = 'https://127.0.0.1:3001'
const CREDS = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'

const DEVICES = [
  ['WIN10-VM', 'b42175d0-d0c9-428d-ab94-4e66dff56af3'],
  ['WIN11-VM', 'd147684b-2451-4418-a628-86f11aa66a4e'],
  ['TECNO-KL4', '07f8ae91-5b64-41d9-97df-ce649772b0d3'],
  ['Android-Emulator', '9b5eeaf9-b30d-449c-875e-1e21e56ac041'],
]

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
  if (!r.ticket) throw new Error('ticket failed')
  return r.ticket
}

function probeDevice(name, id, token) {
  return new Promise(async (resolve) => {
    const t = await ticket(token)
    const url = `wss://127.0.0.1:3001/screen?deviceId=${id}&ticket=${encodeURIComponent(t)}&fps=4&quality=40&maxWidth=640`
    const ws = new WebSocket(url)
    const out = { device: name, messages: [], monitors: null, frames: 0, errors: [] }
    const done = () => { try { ws.close() } catch {} ; resolve(out) }
    const timer = setTimeout(done, 9000)
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'screen:get_monitors', payload: {} }))
    }
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') { out.frames++; return }
      let msg
      try { msg = JSON.parse(ev.data) } catch { return }
      out.messages.push(msg.type)
      if (msg.type === 'screen:monitors') out.monitors = msg.payload?.monitors || []
      if (msg.type === 'screen:error') out.errors.push(msg.payload?.message)
      if (out.monitors) { clearTimeout(timer); setTimeout(done, 400) }
    }
    ws.onerror = (e) => { out.errors.push('ws error'); }
  })
}

;(async () => {
  const token = await login()
  for (const [name, id] of DEVICES) {
    const r = await probeDevice(name, id, token)
    console.log(JSON.stringify(r))
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
