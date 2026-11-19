'use strict'
/**
 * screen-test.cjs — عميل اختبار بث الشاشة لـ AiRemote
 * لا يكتب أي سرّ. الاعتماد يُقرأ من lab-probe.json فقط داخل العملية.
 *
 * أوضاع:
 *   node screen-test.cjs smoke   <deviceId> [seconds]
 *   node screen-test.cjs quality <deviceId>
 *   node screen-test.cjs record  <deviceId> <seconds>   # تسجيل سيرفر + حفظ إطارات صورة
 *   node screen-test.cjs control <deviceId>
 *   node screen-test.cjs full    <deviceId>             # smoke+quality+control+صورة
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const { WebSocket } = require(String.raw`D:\autoclaw projects-new\AiRemote\node_modules\.pnpm\ws@8.21.0\node_modules\ws`)

const HOST = '127.0.0.1:3001'
const OUT = path.join(__dirname, 'out')
fs.mkdirSync(OUT, { recursive: true })

const PROBE_PATH = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'
const probe = JSON.parse(fs.readFileSync(PROBE_PATH, 'utf8'))

const httpsAgent = new https.Agent({ rejectUnauthorized: false })

function req (method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const r = https.request({
      host: '127.0.0.1', port: 3001, path: urlPath, method,
      agent: httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
      timeout: 15000,
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(raw) } catch {}
        resolve({ status: res.statusCode, json, raw })
      })
    })
    r.on('error', reject)
    r.on('timeout', () => { r.destroy(new Error('timeout')) })
    if (data) r.write(data)
    r.end()
  })
}

async function login () {
  const r = await req('POST', '/api/auth/login', { email: probe.email, password: probe.password })
  if (r.status !== 200 || !r.json || !r.json.accessToken) throw new Error('login failed ' + r.status)
  return r.json.accessToken
}

async function wsTicket (token) {
  const r = await req('POST', '/api/auth/ws-ticket', {}, token)
  if (r.status !== 200 || !r.json || !r.json.ticket) throw new Error('ticket failed ' + r.status)
  return r.json.ticket
}

class ScreenClient {
  constructor (deviceId, token) {
    this.deviceId = deviceId
    this.token = token
    this.ws = null
    this.frames = []
    this.jsonMsgs = []
    this.stats = {
      binary: 0, jsonFrames: 0, deltas: 0, keyframes: 0, webp: 0, jpeg: 0,
      bytes: 0, lastSeq: -1, w: 0, h: 0, firstFrameAt: 0, lastFrameAt: 0,
      errors: [], closed: false, opened: false,
    }
    this.savedShots = 0
    this._pingTimer = null
    this._rtt = -1
  }

  async connect ({ fps = 20, quality = 72, maxWidth = 1920, binary = '1' } = {}) {
    const ticket = await wsTicket(this.token)
    const url = `wss://${HOST}/screen?ticket=${encodeURIComponent(ticket)}&deviceId=${this.deviceId}&binary=${binary}&fps=${fps}&quality=${quality}&maxWidth=${maxWidth}`
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { rejectUnauthorized: false })
      this.ws = ws
      const t0 = Date.now()
      ws.on('open', () => {
        this.stats.opened = true
        this.stats.openMs = Date.now() - t0
        this._pingTimer = setInterval(() => {
          if (ws.readyState !== 1) return
          this.send({ type: 'screen:ping', payload: { ts: Date.now(), rtt: this._rtt } })
        }, 2000)
        // طلب شاشات متعددة + حالة الحافظة
        setTimeout(() => this.send({ type: 'screen:get_monitors', payload: {} }), 400)
        resolve()
      })
      ws.on('message', (data, isBinary) => {
        if (isBinary) return this._onBinary(data)
        this._onJson(data.toString('utf8'))
      })
      ws.on('close', (code, reason) => {
        this.stats.closed = true
        this.stats.closeCode = code
        if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null }
      })
      ws.on('error', (e) => { this.stats.errors.push('ws:' + e.message) })
      ws.on('unexpected-response', (req, res) => {
        this.stats.errors.push('http:' + res.statusCode)
        reject(new Error('ws http ' + res.statusCode))
      })
    })
  }

  _onBinary (buf) {
    if (buf.length < 13) return
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const width = view.getUint32(0)
    const height = view.getUint32(4)
    const seq = view.getUint32(8)
    const flags = view.getUint8(12)
    const isDelta = (flags & 2) !== 0
    const isWebp = (flags & 4) !== 0
    const isKey = (flags & 1) !== 0
    if (seq !== 0 && seq <= this.stats.lastSeq) return
    this.stats.lastSeq = seq
    this.stats.binary++
    this.stats.bytes += buf.length
    if (isDelta) this.stats.deltas++
    if (isKey) this.stats.keyframes++
    if (isWebp) this.stats.webp++; else this.stats.jpeg++
    if (!isDelta) { this.stats.w = width; this.stats.h = height }
    if (!this.stats.firstFrameAt) this.stats.firstFrameAt = Date.now()
    this.stats.lastFrameAt = Date.now()
    const jpeg = Buffer.from(buf.buffer, buf.byteOffset + (isDelta ? 21 : 13), buf.length - (isDelta ? 21 : 13))
    this.frames.push({ seq, w: width, h: height, flags, at: Date.now(), jpeg, isDelta, isWebp })
    if (this.frames.length > 4000) this.frames.splice(0, 1000)
  }

  _onJson (text) {
    let m; try { m = JSON.parse(text) } catch { return }
    this.jsonMsgs.push(m)
    if (m.type === 'screen:pong') {
      const p = m.payload || {}
      if (p.clientTs) this._rtt = Date.now() - p.clientTs
      this.stats.rttMs = this._rtt
    }
    if (m.type === 'screen:error') this.stats.errors.push('srv:' + (m.payload && m.payload.message))
    if (m.type === 'screen:unavailable') this.stats.errors.push('unavail:' + (m.payload && m.payload.message))
    if (m.type === 'screen:monitors') this.stats.monitors = m.payload
    if (m.type === 'screen:record_status') this.stats.recordStatus = m.payload
    if (m.type === 'screen:control_granted') this.stats.control = 'granted'
    if (m.type === 'screen:control_denied') this.stats.control = 'denied:' + JSON.stringify(m.payload)
    if (m.type === 'screen:clipboard') this.stats.clipboard = m.payload
    if (m.type === 'screen:cursor') this.stats.cursor = m.payload
    if (m.type === 'screen:viewer_count') this.stats.viewers = m.payload && m.payload.count
  }

  send (obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj))
  }

  saveShot (tag) {
    // آخر إطار كامل غير دلتا
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const f = this.frames[i]
      if (!f.isDelta && f.jpeg && f.jpeg.length > 100) {
        const ext = f.isWebp ? 'webp' : 'jpg'
        const p = path.join(OUT, `shot-${tag}-${f.w}x${f.h}.${ext}`)
        fs.writeFileSync(p, f.jpeg)
        this.savedShots++
        return { path: p, w: f.w, h: f.h, bytes: f.jpeg.length, mime: f.isWebp ? 'webp' : 'jpeg' }
      }
    }
    return null
  }

  measure (ms) {
    return new Promise((resolve) => {
      const startN = this.stats.binary
      const startB = this.stats.bytes
      const t0 = Date.now()
      setTimeout(() => {
        const dt = (Date.now() - t0) / 1000
        const n = this.stats.binary - startN
        const b = this.stats.bytes - startB
        resolve({
          windowSec: +dt.toFixed(1),
          frames: n,
          fps: +(n / dt).toFixed(2),
          kbps: +(b * 8 / dt / 1000).toFixed(1),
          resolution: `${this.stats.w}x${this.stats.h}`,
          rttMs: this._rtt,
          totalFrames: this.stats.binary,
          deltas: this.stats.deltas,
          keyframes: this.stats.keyframes,
          webp: this.stats.webp,
          jpeg: this.stats.jpeg,
          errors: this.stats.errors.slice(-5),
        })
      }, ms)
    })
  }

  setQuality (fps, quality, maxWidth) {
    this.send({ type: 'screen:set_quality', payload: { fps, quality, maxWidth } })
  }

  mouse (type, x, y, button = 'left') {
    this.send({ type: 'screen:mouse_event', payload: { type, x, y, button } })
  }

  key (type, key, modifiers) {
    this.send({ type: 'screen:key_event', payload: { type, key, modifiers } })
  }

  requestControl () { this.send({ type: 'screen:control_request', payload: {} }) }

  recordStart () { this.send({ type: 'screen:record_start', payload: { maxFrames: 0 } }) }
  recordStop () { this.send({ type: 'screen:record_stop', payload: {} }) }

  close () {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null }
    try { if (this.ws) this.ws.close() } catch {}
    this.stats.closed = true
  }
}

function summarize (c, label) {
  const s = c.stats
  const durSec = s.firstFrameAt ? Math.max(0.001, (s.lastFrameAt - s.firstFrameAt) / 1000) : 0
  return {
    label,
    opened: s.opened,
    openMs: s.openMs,
    frames: s.binary,
    fpsAvg: durSec ? +(s.binary / durSec).toFixed(2) : 0,
    kbpsAvg: durSec ? +((s.bytes * 8 / durSec / 1000)).toFixed(1) : 0,
    resolution: `${s.w}x${s.h}`,
    rttMs: s.rttMs,
    deltas: s.deltas,
    keyframes: s.keyframes,
    webp: s.webp,
    jpeg: s.jpeg,
    viewers: s.viewers,
    control: s.control,
    monitors: s.monitors,
    recordStatus: s.recordStatus,
    errors: s.errors.slice(-8),
    closeCode: s.closeCode,
    savedShots: c.savedShots,
  }
}

async function main () {
  const [mode, deviceId, arg3] = process.argv.slice(2)
  if (!mode || !deviceId) { console.error('usage: screen-test.cjs <smoke|quality|record|control|full> <deviceId> [arg]'); process.exit(2) }
  const token = await login()
  const c = new ScreenClient(deviceId, token)
  const result = { mode, deviceId, startedAt: new Date().toISOString() }

  try {
    if (mode === 'smoke') {
      const secs = parseInt(arg3 || '15') * 1000
      await c.connect({ fps: 20, quality: 72, maxWidth: 1920 })
      await new Promise(r => setTimeout(r, 1500))
      result.firstShot = c.saveShot('smoke-first')
      result.measure = await c.measure(secs)
      result.lastShot = c.saveShot('smoke-last')
      result.summary = summarize(c, 'smoke')
    } else if (mode === 'quality') {
      await c.connect({ fps: 12, quality: 55, maxWidth: 1280 })
      await new Promise(r => setTimeout(r, 1200))
      const steps = []
      const presets = [
        { id: 'saver', fps: 12, quality: 55, maxWidth: 1280 },
        { id: 'balanced', fps: 20, quality: 72, maxWidth: 1920 },
        { id: 'high', fps: 25, quality: 78, maxWidth: 1920 },
        { id: 'best', fps: 30, quality: 72, maxWidth: 1920 },
        { id: 'smooth', fps: 30, quality: 60, maxWidth: 1600 },
        { id: 'lowband', fps: 5, quality: 25, maxWidth: 640 },
      ]
      for (const p of presets) {
        c.setQuality(p.fps, p.quality, p.maxWidth)
        await new Promise(r => setTimeout(r, 2500)) // استقرار
        const m = await c.measure(8000)
        m.preset = p
        m.shot = c.saveShot('q-' + p.id)
        steps.push(m)
      }
      result.steps = steps
      result.summary = summarize(c, 'quality')
    } else if (mode === 'record') {
      const secs = parseInt(arg3 || '30')
      await c.connect({ fps: 20, quality: 72, maxWidth: 1920 })
      await new Promise(r => setTimeout(r, 2000))
      result.firstShot = c.saveShot('rec-first')
      c.recordStart()
      await new Promise(r => setTimeout(r, 1500))
      result.recordStatusStart = c.stats.recordStatus
      // قياس في المنتصف
      const midAt = Math.floor(secs / 2) * 1000
      await new Promise(r => setTimeout(r, midAt))
      result.midMeasure = await c.measure(10000)
      result.midShot = c.saveShot('rec-mid')
      const rest = secs * 1000 - midAt - 10000
      if (rest > 0) await new Promise(r => setTimeout(r, rest))
      result.lastShot = c.saveShot('rec-last')
      c.recordStop()
      await new Promise(r => setTimeout(r, 2500))
      result.recordStatusStop = c.stats.recordStatus
      result.summary = summarize(c, 'record')
      result.endedAt = new Date().toISOString()
      result.durationPlannedSec = secs
    } else if (mode === 'control') {
      await c.connect({ fps: 15, quality: 60, maxWidth: 1280 })
      await new Promise(r => setTimeout(r, 2000))
      c.requestControl()
      await new Promise(r => setTimeout(r, 2500))
      result.control = c.stats.control
      result.cursorBefore = c.stats.cursor
      // حركة مؤشر إلى المنتصف ثم نقرة
      c.mouse('move', 0.5, 0.5)
      await new Promise(r => setTimeout(r, 400))
      c.mouse('click', 0.5, 0.5, 'left')
      await new Promise(r => setTimeout(r, 800))
      // كتابة نص
      c.key('press', 'a')
      await new Promise(r => setTimeout(r, 250))
      c.key('press', 'b')
      await new Promise(r => setTimeout(r, 250))
      // سكرول
      c.mouse('scroll', 0.5, 0.5, 'left')
      await new Promise(r => setTimeout(r, 500))
      result.cursorAfter = c.stats.cursor
      result.shot = c.saveShot('control')
      result.summary = summarize(c, 'control')
    } else if (mode === 'full') {
      await c.connect({ fps: 20, quality: 72, maxWidth: 1920 })
      await new Promise(r => setTimeout(r, 1500))
      result.firstShot = c.saveShot('full-first')
      result.m1 = await c.measure(10000)
      c.requestControl()
      await new Promise(r => setTimeout(r, 2000))
      result.control = c.stats.control
      c.mouse('move', 0.5, 0.5)
      c.mouse('click', 0.5, 0.5, 'left')
      await new Promise(r => setTimeout(r, 600))
      c.key('press', 'Escape')
      await new Promise(r => setTimeout(r, 400))
      result.shot = c.saveShot('full-control')
      result.m2 = await c.measure(5000)
      result.summary = summarize(c, 'full')
    }
  } catch (e) {
    result.error = e.message
    result.stack = e.stack
  } finally {
    c.close()
  }

  const file = path.join(OUT, `${mode}-${deviceId.slice(0, 8)}-${Date.now()}.json`)
  fs.writeFileSync(file, JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ file, ok: !result.error, ...result.summary, error: result.error, measure: result.measure, control: result.control, firstShot: result.firstShot, steps: result.steps ? result.steps.map(s => ({ preset: s.preset && s.preset.id, fps: s.fps, kbps: s.kbps, resolution: s.resolution, rttMs: s.rttMs, frames: s.frames })) : undefined }, null, 2))
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
