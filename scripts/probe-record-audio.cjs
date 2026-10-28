process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const path = require('path')
const creds = JSON.parse(fs.readFileSync('C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json', 'utf8'))
const HOST = '127.0.0.1', PORT = '3001', BASE = `https://${HOST}:${PORT}`
const NAME = process.env.LAB_DEVICE || 'WIN10'
const SECONDS = parseInt(process.env.LAB_SECONDS || '12', 10)
const OUT = process.env.LAB_OUT || path.join('outputs', 'verify-2026-10-28', 'win10-audio', 'recording.mp4')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password })
  }).then(r => r.json())
  if (!login.token) throw new Error('login failed')
  const auth = { Authorization: 'Bearer ' + login.token }
  const list = await fetch(BASE + '/api/devices', { headers: auth }).then(r => r.json())
  const arr = Array.isArray(list) ? list : (list.devices || [])
  const dev = arr.find(d => String(d.name).toLowerCase().includes(NAME.toLowerCase()))
  if (!dev) throw new Error('device not found: ' + NAME)
  const { ticket } = await fetch(BASE + '/api/auth/ws-ticket', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}'
  }).then(r => r.json())

  const before = await fetch(BASE + '/api/recordings', { headers: auth }).then(r => r.json())
  const beforeRows = Array.isArray(before) ? before : (before.recordings || [])
  const beforeIds = new Set(beforeRows.map(r => r.id))

  const ws = new WebSocket(`wss://${HOST}:${PORT}/screen?ticket=${ticket}&deviceId=${dev.id}&binary=1&fps=12&quality=60&maxWidth=1280`)
  ws.binaryType = 'arraybuffer'
  const st = { frames: 0, audioMsgs: 0, audioBytes: 0, statuses: [] }
  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') { st.frames++; return }
    let m; try { m = JSON.parse(ev.data) } catch { return }
    if (m.type === 'screen:audio') { st.audioMsgs++; st.audioBytes += Math.ceil((m.payload.data || '').length * 3 / 4) }
    if (m.type === 'screen:record_status') st.statuses.push(m.payload && m.payload.state)
  }
  await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej(new Error('ws timeout')), 8000) })
  await sleep(1500)
  ws.send(JSON.stringify({ type: 'screen:record_start', payload: { maxFrames: 900 } }))
  await sleep(SECONDS * 1000)
  ws.send(JSON.stringify({ type: 'screen:record_stop', payload: {} }))
  await sleep(4000)
  try { ws.close() } catch {}

  let rec = null
  for (let i = 0; i < 20 && !rec; i++) {
    const cur = await fetch(BASE + '/api/recordings', { headers: auth }).then(r => r.json())
    const rows = Array.isArray(cur) ? cur : (cur.recordings || [])
    rec = rows.find(r => !beforeIds.has(r.id) && (r.deviceId === dev.id || !r.deviceId))
    if (!rec) await sleep(1500)
  }
  if (!rec) throw new Error('no new recording appeared')
  const res = await fetch(`${BASE}/api/recordings/${rec.id}/download`, { headers: auth })
  const buf = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, buf)
  console.log('RESULT ' + JSON.stringify({
    device: dev.name, seconds: SECONDS, frames: st.frames,
    audioMsgs: st.audioMsgs, audioKB: Math.round(st.audioBytes / 1024),
    recordId: rec.id.slice(0, 8), status: res.status,
    contentType: res.headers.get('content-type'), bytes: buf.length,
    magic: buf.slice(4, 8).toString('ascii'), out: OUT
  }))
  process.exit(0)
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1) })
