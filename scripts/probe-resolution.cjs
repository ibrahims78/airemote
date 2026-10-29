// E2E probe for remote display modes: connect as a viewer, ask for the modes, then
// re-apply the current mode (no-op) and check the agent reports success.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')

const BASE = 'https://127.0.0.1:3001'
const CREDS = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'
const WANT = process.env.LAB_DEVICE || ''
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
  const l = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password })
  }).then(r => r.json())
  if (!l.token) throw new Error('login failed')
  const auth = { Authorization: 'Bearer ' + l.token }

  const list = await fetch(BASE + '/api/devices', { headers: auth }).then(r => r.json())
  const arr = Array.isArray(list) ? list : (list.devices || [])
  const dev = WANT
    ? arr.find(d => String(d.name).toLowerCase().includes(WANT.toLowerCase()))
    : arr.find(d => String(d.status) === 'online')
  if (!dev) throw new Error('no device')
  console.log('device:', dev.name, dev.status)

  const { ticket } = await fetch(BASE + '/api/auth/ws-ticket', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}'
  }).then(r => r.json())

  const ws = new WebSocket(`wss://127.0.0.1:3001/screen?ticket=${ticket}&deviceId=${dev.id}&binary=1&fps=8&quality=60&maxWidth=1280`)
  ws.binaryType = 'arraybuffer'
  let modes = null, applied = null
  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return
    let m; try { m = JSON.parse(ev.data) } catch { return }
    if (m.type === 'screen:resolutions') { modes = m.payload; console.log('MODES:', JSON.stringify(m.payload)) }
    if (m.type === 'screen:resolution_applied') { applied = m.payload; console.log('APPLIED:', JSON.stringify(m.payload)) }
  }
  await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej(new Error('ws timeout')), 10000) })
  await sleep(1500)

  ws.send(JSON.stringify({ type: 'screen:get_resolutions', payload: {} }))
  for (let i = 0; i < 20 && !modes; i++) await sleep(400)
  if (!modes) { console.log('NO MODES (agent too old or not Windows)'); process.exit(2) }

  const current = modes.current || (modes.modes && modes.modes[0])
  if (current) {
    const [w, h] = String(current).split('x').map(Number)
    console.log('re-applying current mode', w, h)
    ws.send(JSON.stringify({ type: 'screen:set_resolution', payload: { width: w, height: h } }))
    for (let i = 0; i < 25 && !applied; i++) await sleep(400)
  }
  console.log(applied && applied.ok ? 'RESULT: OK' : 'RESULT: FAILED')
  try { ws.close() } catch {}
  process.exit(0)
})().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1) })
