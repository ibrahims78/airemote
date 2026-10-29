// Long-recording probe: records N seconds on a live device through the installed server,
// waits for the muxer, then reports the MP4 duration. Never prints credentials.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const path = require('path')

const HOST = '127.0.0.1', PORT = '3001', BASE = `https://${HOST}:${PORT}`
const SECONDS = parseInt(process.env.LAB_SECONDS || '300', 10)
const WANT = (process.env.LAB_DEVICE || '').toLowerCase()
const OUT = process.env.LAB_OUT || path.join('outputs', 'verify-2026-10-29', 'rec-live')
const CREDS = process.env.LAB_CREDS || 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const creds = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password })
  }).then(r => r.json())
  if (!login.token) throw new Error('login failed')
  const auth = { Authorization: 'Bearer ' + login.token }

  const list = await fetch(BASE + '/api/devices', { headers: auth }).then(r => r.json())
  const arr = Array.isArray(list) ? list : (list.devices || [])
  const online = arr.filter(d => String(d.status || "").toLowerCase() === "online")
  console.log('devices:', arr.map(d => `${d.name}(online=${d.online})`).join(', '))
  const dev = WANT ? online.find(d => String(d.name).toLowerCase().includes(WANT)) : online[0]
  if (!dev) throw new Error('no online device')
  console.log('using device:', dev.name)

  const { ticket } = await fetch(BASE + '/api/auth/ws-ticket', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}'
  }).then(r => r.json())

  const before = await fetch(BASE + '/api/recordings', { headers: auth }).then(r => r.json())
  const beforeIds = new Set((Array.isArray(before) ? before : before.recordings || []).map(r => r.id))

  const ws = new WebSocket(`wss://${HOST}:${PORT}/screen?ticket=${ticket}&deviceId=${dev.id}&binary=1&fps=12&quality=60&maxWidth=1280`)
  ws.binaryType = 'arraybuffer'
  let frames = 0, recId = null
  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') { frames++; return }
    let m; try { m = JSON.parse(ev.data) } catch { return }
    if (m.type === 'screen:record_status' && m.payload && m.payload.meta) recId = m.payload.meta.sessionId || recId
  }
  await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej(new Error('ws timeout')), 10000) })
  await sleep(1500)

  console.log('record_start at', new Date().toISOString())
  ws.send(JSON.stringify({ type: 'screen:record_start', payload: { maxFrames: 0 } }))
  const t0 = Date.now()
  await sleep(SECONDS * 1000)
  ws.send(JSON.stringify({ type: 'screen:record_stop', payload: {} }))
  const recordedSec = Math.round((Date.now() - t0) / 1000)
  console.log('record_stop after', recordedSec, 's · frames', frames)
  await sleep(2000)

  // find the new recording row
  if (!recId) {
    const after = await fetch(BASE + '/api/recordings', { headers: auth }).then(r => r.json())
    const rows = Array.isArray(after) ? after : after.recordings || []
    const fresh = rows.filter(r => !beforeIds.has(r.id))
    if (fresh.length) recId = fresh[0].id
  }
  if (!recId) throw new Error('no recording id')
  console.log('recording id', recId.slice(0, 8))

  let state = 'muxing'
  const t1 = Date.now()
  while (Date.now() - t1 < 15 * 60 * 1000) {
    const s = await fetch(`${BASE}/api/recordings/${recId}/status`, { headers: auth }).then(r => r.json())
    state = s.state
    if (state !== 'muxing') break
    await sleep(3000)
  }
  console.log('final state:', state, 'after', Math.round((Date.now() - t1) / 1000), 's of muxing')

  if (state === 'mp4' || state === 'zip') {
    const r = await fetch(`${BASE}/api/recordings/${recId}/download`, { headers: auth })
    const buf = Buffer.from(await r.arrayBuffer())
    fs.mkdirSync(OUT, { recursive: true })
    const ext = (r.headers.get('content-type') || '').includes('mp4') ? 'mp4' : 'zip'
    const file = path.join(OUT, `live-${SECONDS}s.${ext}`)
    fs.writeFileSync(file, buf)
    console.log('downloaded', file, buf.length, 'bytes', r.headers.get('content-type'))
  } else {
    console.log('no file: state', state)
  }
  try { ws.close() } catch {}
  process.exit(0)
})().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1) })
