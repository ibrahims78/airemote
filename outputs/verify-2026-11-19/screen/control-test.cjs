'use strict'
/** control-test.cjs — اختبار تحكم موسّع: منح + نقر + مفاتيح + أزرار أندرويد + جودة */
const fs = require('fs')
const path = require('path')
const https = require('https')
const { WebSocket } = require(String.raw`D:\autoclaw projects-new\AiRemote\node_modules\.pnpm\ws@8.21.0\node_modules\ws`)

const OUT = path.join(__dirname, 'out')
fs.mkdirSync(OUT, { recursive: true })
const PROBE_PATH = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'
const probe = JSON.parse(fs.readFileSync(PROBE_PATH, 'utf8'))
const httpsAgent = new https.Agent({ rejectUnauthorized: false })

function req (method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const r = https.request({
      host: '127.0.0.1', port: 3001, path: urlPath, method, agent: httpsAgent,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
      timeout: 15000,
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}; resolve({ status: res.statusCode, json: j }) })
    })
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

async function main () {
  const deviceId = process.argv[2]
  const mode = process.argv[3] || 'control' // control | quality | rtc | monitors
  const login = await req('POST', '/api/auth/login', { email: probe.email, password: probe.password })
  const token = login.json.accessToken
  const t = await req('POST', '/api/auth/ws-ticket', {}, token)
  const q = mode === 'quality' ? 'fps=20&quality=72&maxWidth=1920' : 'fps=15&quality=60&maxWidth=1280'
  const url = `wss://127.0.0.1:3001/screen?ticket=${t.json.ticket}&deviceId=${deviceId}&binary=1&${q}`
  const ws = new WebSocket(url, { rejectUnauthorized: false })
  const log = []
  const shots = []
  let lastJpeg = null
  let lastW = 0, lastH = 0
  const state = { control: null, errors: [], msgs: [], qualityApplied: false, rtc: null }

  const send = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)) }
  const save = (tag) => {
    if (!lastJpeg) return null
    const p = path.join(OUT, `${tag}-${Date.now()}.jpg`)
    fs.writeFileSync(p, lastJpeg)
    shots.push({ tag, path: p, w: lastW, h: lastH, bytes: lastJpeg.length })
    return p
  }

  ws.on('open', () => {
    log.push('open')
    if (mode === 'quality') {
      // تسلسل تبديل الجودة مع قياس
      runQuality()
    } else if (mode === 'rtc') {
      send({ type: 'rtc:start', payload: {} })
      setTimeout(() => { log.push('rtc-timeout'); finish() }, 8000)
    } else if (mode === 'monitors') {
      send({ type: 'screen:get_monitors', payload: {} })
      send({ type: 'screen:get_resolutions', payload: {} })
      setTimeout(finish, 4000)
    } else {
      runControl()
    }
  })

  async function runQuality () {
    const steps = [
      { id: 'saver', fps: 12, quality: 55, maxWidth: 1280 },
      { id: 'balanced', fps: 20, quality: 72, maxWidth: 1920 },
      { id: 'high', fps: 25, quality: 78, maxWidth: 1920 },
      { id: 'best', fps: 30, quality: 72, maxWidth: 1920 },
      { id: 'lowband', fps: 5, quality: 25, maxWidth: 640 },
    ]
    const results = []
    // انتظر أول إطار
    await new Promise(r => setTimeout(r, 2000))
    for (const p of steps) {
      send({ type: 'screen:set_quality', payload: p })
      await new Promise(r => setTimeout(r, 2000))
      let n0 = frameN, b0 = byteN
      await new Promise(r => setTimeout(r, 6000))
      const dt = 8
      results.push({ ...p, fps: +((frameN - n0) / dt).toFixed(2), kbps: +((byteN - b0) * 8 / dt / 1000).toFixed(1), res: `${lastW}x${lastH}` })
      save('q-' + p.id)
    }
    state.qualitySteps = results
    finish()
  }

  let frameN = 0, byteN = 0
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      frameN++
      byteN += data.length
      if (data.length < 13) return
      const w = data.readUInt32BE(0), h = data.readUInt32BE(4)
      if (w > 50 && h > 50) { lastW = w; lastH = h }
      const flags = data.readUInt8(12)
      const isDelta = (flags & 2) !== 0
      if (!isDelta) {
        const jpeg = data.subarray(13)
        if (jpeg.length > 200) lastJpeg = Buffer.from(jpeg)
      }
      return
    }
    let m; try { m = JSON.parse(data.toString()) } catch { return }
    state.msgs.push(m.type)
    if (m.type === 'screen:control_granted') state.control = 'granted'
    if (m.type === 'screen:control_denied') state.control = 'denied:' + JSON.stringify(m.payload)
    if (m.type === 'screen:error') state.errors.push(m.payload && m.payload.message)
    if (m.type === 'screen:monitors') state.monitors = m.payload
    if (m.type === 'screen:resolutions') state.resolutions = m.payload
    if (m.type === 'rtc:signal') state.rtc = { got: true, kind: m.payload && m.payload.data && m.payload.data.sdp ? m.payload.data.sdp.type : 'other' }
    if (m.type === 'screen:rotate_status') state.rotate = m.payload
    if (m.type === 'screen:brightness_status') state.brightness = m.payload
  })

  async function runControl () {
    await new Promise(r => setTimeout(r, 1500))
    save('pre-control')
    send({ type: 'screen:request_control', payload: { requestId: 'test-' + Date.now(), password: process.argv[4] || '' } })
    // ننتظر المنح ثم نحقن
    await new Promise(r => setTimeout(r, 4000))
    log.push('control=' + state.control)
    // حركة + نقرة مزدوجة على مركز الشاشة ثم كتابة
    send({ type: 'screen:mouse_event', payload: { type: 'move', x: 0.5, y: 0.5 } })
    await new Promise(r => setTimeout(r, 300))
    send({ type: 'screen:mouse_event', payload: { type: 'click', x: 0.5, y: 0.5, button: 0 } })
    await new Promise(r => setTimeout(r, 700))
    save('after-click')
    send({ type: 'screen:key_event', payload: { type: 'press', key: 'a' } })
    await new Promise(r => setTimeout(r, 200))
    send({ type: 'screen:key_event', payload: { type: 'press', key: 'Escape' } })
    await new Promise(r => setTimeout(r, 400))
    // أندرويد: رجوع / رئيسية / تطبيقات / سطوع / تدوير
    send({ type: 'screen:key_event', payload: { type: 'press', key: 'Home' } })
    await new Promise(r => setTimeout(r, 800))
    save('after-home')
    send({ type: 'screen:brightness', payload: { value: 180 } })
    await new Promise(r => setTimeout(r, 600))
    send({ type: 'screen:brightness', payload: { value: 255 } })
    await new Promise(r => setTimeout(r, 400))
    send({ type: 'screen:clipboard_write', payload: { text: 'AiRemote-control-test-2026' } })
    await new Promise(r => setTimeout(r, 500))
    send({ type: 'screen:clipboard_read', payload: {} })
    await new Promise(r => setTimeout(r, 800))
    save('final')
    finish()
  }

  function finish () {
    try { ws.close() } catch {}
  }
  ws.on('close', () => {
    log.push('closed')
    const out = { deviceId, mode, control: state.control, errors: state.errors, monitors: state.monitors, resolutions: state.resolutions, rtc: state.rtc, rotate: state.rotate, brightness: state.brightness, qualitySteps: state.qualitySteps, frames: frameN, shots, log, msgTypes: [...new Set(state.msgs)] }
    const f = path.join(OUT, `${mode}-${deviceId.slice(0, 8)}-${Date.now()}.json`)
    fs.writeFileSync(f, JSON.stringify(out, null, 2))
    console.log(JSON.stringify(out, null, 2))
  })
  ws.on('error', (e) => { state.errors.push(e.message) })
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
