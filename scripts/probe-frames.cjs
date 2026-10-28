process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const path = require('path')
const creds = JSON.parse(fs.readFileSync('C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json', 'utf8'))
const HOST = process.env.LAB_HOST || '127.0.0.1'
const PORT = process.env.LAB_PORT || '3001'
const NAME = process.env.LAB_DEVICE || 'WIN10'
const SECONDS = parseInt(process.env.LAB_SECONDS || '10', 10)
const BASE = `https://${HOST}:${PORT}`

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

  const url = `wss://${HOST}:${PORT}/screen?ticket=${ticket}&deviceId=${dev.id}&binary=1&fps=18&quality=60&maxWidth=1600`
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  const st = { frames: 0, bytes: 0, key: 0, delta: 0, webp: 0, jpeg: 0, first: null, gaps: [], last: 0, errors: [], dims: {}, lastFrame: null }
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') { try { const m = JSON.parse(ev.data); if (m.type && /error|denied/.test(m.type)) st.errors.push(m.type) } catch {} ; return }
    const b = Buffer.from(ev.data)
    if (b.length < 13) return
    st.frames++; st.bytes += b.length
    const flags = b[12]
    if (flags & 1) st.key++
    if (flags & 2) st.delta++
    const off = (flags & 2) ? 21 : 13
    const magic = b.slice(off, off + 12).toString('ascii')
    if (magic.startsWith('RIFF') && magic.includes('WEBP')) st.webp++
    else if (b[off] === 0xFF && b[off + 1] === 0xD8) st.jpeg++
    const fw = b.readUInt32BE(0), fh = b.readUInt32BE(4)
    st.dims[fw + 'x' + fh] = (st.dims[fw + 'x' + fh] || 0) + 1
    st.lastFrame = { w: fw, h: fh, flags, kb: +(b.length / 1024).toFixed(1) }
    if (!st.first) st.first = { flags, len: b.length, magic: magic.slice(0, 8), w: fw, h: fh }
    const now = Date.now()
    if (st.last) st.gaps.push(now - st.last)
    st.last = now
  }
  ws.onerror = (e) => st.errors.push(String(e && e.message || 'ws error'))

  await new Promise((res, rej) => { ws.onopen = res; setTimeout(() => rej(new Error('ws timeout')), 10000) })
  await new Promise(r => setTimeout(r, 1500))
  const t0 = Date.now(), f0 = st.frames, b0 = st.bytes
  await new Promise(r => setTimeout(r, SECONDS * 1000))
  const dt = (Date.now() - t0) / 1000
  const frames = st.frames - f0, bytes = st.bytes - b0
  const gaps = st.gaps.slice(-40).sort((a, b) => a - b)
  const p50 = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null
  try { ws.close() } catch {}
  console.log(JSON.stringify({
    device: dev.name,
    seconds: +dt.toFixed(1),
    fps: +(frames / dt).toFixed(1),
    kbps: +(bytes / 1024 / dt).toFixed(0),
    avgFrameKB: frames ? +(bytes / frames / 1024).toFixed(1) : 0,
    frameGapP50ms: p50,
    keyframes: st.key, deltas: st.delta,
    payload: { webp: st.webp, jpeg: st.jpeg },
    firstFrame: st.first,
    lastFrame: st.lastFrame,
    dimsSeen: Object.keys(st.dims).map(k => k + ' x' + st.dims[k]).join(', '),
    errors: st.errors
  }, null, 2))
  process.exit(0)
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1) })
