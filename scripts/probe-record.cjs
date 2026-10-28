process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const creds = JSON.parse(fs.readFileSync('C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json', 'utf8'))
const HOST = '127.0.0.1', PORT = '3001'
const BASE = `https://${HOST}:${PORT}`
const NAME = process.env.LAB_DEVICE || 'TECNO'
const SECONDS = parseInt(process.env.LAB_SECONDS || '12', 10)

;(async () => {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password })
  }).then(r => r.json())
  const auth = { Authorization: 'Bearer ' + login.token }
  const list = await fetch(BASE + '/api/devices', { headers: auth }).then(r => r.json())
  const arr = Array.isArray(list) ? list : (list.devices || [])
  const dev = arr.find(d => String(d.name).toLowerCase().includes(NAME.toLowerCase()))
  if (!dev) throw new Error('device not found')
  const { ticket } = await fetch(BASE + '/api/auth/ws-ticket', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}'
  }).then(r => r.json())

  const ws = new WebSocket(`wss://${HOST}:${PORT}/screen?ticket=${ticket}&deviceId=${dev.id}&binary=1&fps=12&quality=60&maxWidth=1280`)
  ws.binaryType = 'arraybuffer'
  const st = { frames: 0, audioMsgs: 0, audioBytes: 0, meta: null, statuses: [] }
  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') { st.frames++; return }
    let m; try { m = JSON.parse(ev.data) } catch { return }
    if (m.type === 'screen:audio') { st.audioMsgs++; st.audioBytes += Math.ceil((m.payload.data || '').length * 3 / 4) }
    if (m.type === 'screen:record_status') { st.statuses.push(m.payload); if (m.payload.meta) st.meta = m.payload.meta }
  }
  await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej(new Error('ws timeout')), 8000) })
  await new Promise(r => setTimeout(r, 1500))

  ws.send(JSON.stringify({ type: 'screen:record_start', payload: { maxFrames: 900 } }))
  console.log('recording for ' + SECONDS + 's ...')
  await new Promise(r => setTimeout(r, SECONDS * 1000))
  ws.send(JSON.stringify({ type: 'screen:record_stop', payload: {} }))
  await new Promise(r => setTimeout(r, 2500))
  try { ws.close() } catch {}
  console.log('RESULT ' + JSON.stringify({ device: dev.name, frames: st.frames, audioMsgs: st.audioMsgs, audioKB: Math.round(st.audioBytes / 1024), meta: st.meta }))
  process.exit(0)
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1) })
