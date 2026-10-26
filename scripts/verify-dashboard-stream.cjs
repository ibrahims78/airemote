/**
 * verify-dashboard-stream.cjs — headless proof of the live-stream path through
 * the real dashboard UI (v3.7.1 WebSocket-ticket flow).
 *
 * Flow
 *   1. clears storage so the login form is always exercised,
 *   2. signs in with the lab account (credentials read from disk, never printed),
 *   3. optionally switches the tile to LAB_DEVICE,
 *   4. makes the tile idle (click Stop if autoStart already opened it), then
 *      performs ONE real mouse click on "Start live stream" (OS-level input),
 *   5. samples UI state + WebSocket traffic every second via the DevTools
 *      Protocol, and writes a screenshot while frames are live.
 *
 * Usage (from the repo root):
 *   node_modules/.bin/electron scripts/verify-dashboard-stream.cjs [out.png]
 *
 * Env: LAB_HOST (default 192.168.0.175), LAB_PORT (default 3001),
 *      LAB_CREDS (default %APPDATA%\AiRemote\lab-credentials.txt),
 *      LAB_DEVICE (device-name substring), LAB_SECONDS (default 30)
 *
 * Exit codes: 0 = frames rendered, 2 = clicked but no frames, 1 = setup failure.
 */

const { app, BrowserWindow, session } = require('electron')
const fs = require('fs')
const path = require('path')

const HOST = process.env.LAB_HOST || '192.168.0.175'
const PORT = process.env.LAB_PORT || '3001'
const BASE = `https://${HOST}:${PORT}`
const CREDS_FILE = process.env.LAB_CREDS
  || path.join(process.env.APPDATA || '', 'AiRemote', 'lab-credentials.txt')
const OUT_PNG = path.resolve(process.argv[2] || path.join(process.cwd(), 'dashboard-stream.png'))
const WANT_DEVICE = process.env.LAB_DEVICE || ''
const SECONDS = Math.max(8, parseInt(process.env.LAB_SECONDS || '30', 10))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const say = (...a) => console.log('[verify]', ...a)
const redact = (u) => String(u).replace(/ticket=[^&]+/g, 'ticket=<redacted>')

const net = { sockets: {}, closes: [], errors: [] }
const consoleLines = []
let result = { ok: false, stage: 'start' }

function readCreds() {
  const raw = fs.readFileSync(CREDS_FILE, 'utf8')
  const pick = (key) => {
    const m = raw.match(new RegExp('^\\s*' + key + '\\s*[:=]\\s*(.+)$', 'mi'))
    return m ? m[1].trim() : ''
  }
  const email = pick('email')
  const password = pick('password')
  if (!email || !password) throw new Error('lab credentials file is missing email/password')
  return { email, password }
}

async function waitFor(fn, timeoutMs, label, interval = 250) {
  const t0 = Date.now()
  let last
  while (Date.now() - t0 < timeoutMs) {
    try {
      const v = await fn()
      if (v) return v
    } catch (e) { last = e }
    await sleep(interval)
  }
  throw new Error(`timeout (${timeoutMs}ms) waiting for ${label}${last ? ': ' + last.message : ''}`)
}

function attachCdp(wc) {
  try { wc.debugger.attach('1.3') } catch (e) { say('CDP attach failed: ' + e.message); return }
  wc.debugger.sendCommand('Network.enable').catch(() => {})
  wc.debugger.on('message', (_e, method, params) => {
    // CDP frame events carry no URL, so map requestId -> socket.
    if (method === 'Network.webSocketCreated') {
      net.sockets[params.requestId] = { url: redact(params.url), raw: params.url || '', recv: 0, recvBytes: 0, sent: 0, opcodes: {}, openedAt: Date.now() }
    }
    if (method === 'Network.webSocketFrameReceived') {
      const s = net.sockets[params.requestId]
      if (!s) return
      const r = params.response || {}
      s.recv++
      s.recvBytes += (r.payloadData || '').length
      s.opcodes[r.opcode] = (s.opcodes[r.opcode] || 0) + 1
    }
    if (method === 'Network.webSocketFrameSent') {
      const s = net.sockets[params.requestId]
      if (s) s.sent++
    }
    if (method === 'Network.webSocketFrameError') net.errors.push(params.errorMessage)
    if (method === 'Network.webSocketClosed') {
      const s = net.sockets[params.requestId]
      net.closes.push({ req: params.requestId, url: s ? s.url : '', at: Date.now(), recv: s ? s.recv : -1 })
    }
  })
}

async function clickAt(wc, selector) {
  const box = await wc.executeJavaScript(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) }
  })()`)
  if (!box) throw new Error('element not found: ' + selector)
  if (box.w < 2 || box.h < 2) throw new Error('element has no size: ' + selector)
  wc.sendInputEvent({ type: 'mouseMove', x: box.x, y: box.y })
  wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  return box
}

const DOM_SAMPLE = `(() => {
  const tile = document.querySelector('.cr-live-tile')
  const meta = document.querySelector('.cr-live-preview-meta')
  const sig = document.querySelector('.cr-live-signal span')
  const empty = tile ? tile.querySelector('.cr-live-preview-empty strong') : null
  const canvas = document.querySelector('.cr-live-canvas')
  let lit = null
  try {
    if (canvas) {
      const ctx = canvas.getContext('2d')
      const d = ctx.getImageData(0, 0, Math.min(48, canvas.width), Math.min(48, canvas.height)).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) n++
      lit = n
    }
  } catch (e) { lit = 'err' }
  return {
    streaming: !!document.querySelector('.cr-live-preview.is-streaming'),
    badge: sig ? sig.textContent : '',
    meta: meta ? meta.textContent.replace(/\\s+/g, ' ').trim() : '',
    emptyTitle: empty ? empty.textContent.trim() : '',
    canvasLitSamples: lit,
    device: (document.querySelector('.cr-live-preview-top b') || {}).textContent || ''
  }
})()`

function screenSocket() {
  const e = Object.entries(net.sockets).filter(([, s]) => s.raw.includes('/screen'))
  return e.length ? e[e.length - 1][1] : null
}

async function main() {
  const creds = readCreds()

  // The shipped app trusts only its own loopback certificate; this dashboard is
  // remote, so the harness supplies trust for this host only.
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    callback(String(request.hostname || '').toLowerCase() === HOST ? 0 : -3)
  })
  await session.defaultSession.clearStorageData({ storages: ['localstorage', 'sessionstorage', 'cookies', 'indexdb'] })

  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false }
  })
  const wc = win.webContents
  wc.on('console-message', (_e, level, message) => {
    if (consoleLines.length < 40) consoleLines.push(level + ': ' + String(message).slice(0, 240))
  })
  attachCdp(wc)

  result.stage = 'load'
  await win.loadURL(BASE)

  result.stage = 'login'
  await waitFor(() => wc.executeJavaScript(`!!document.querySelector('.login-form input[type="email"]')`), 30000, 'login form')
  await wc.executeJavaScript(`(() => {
    const setVal = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    setVal(document.querySelector('.login-form input[type="email"]'), ${JSON.stringify(creds.email)})
    setVal(document.querySelector('.login-form input[type="password"]'), ${JSON.stringify(creds.password)})
    return true
  })()`)
  await sleep(150)
  await clickAt(wc, '.login-submit')
  say('login submitted')

  result.stage = 'dashboard'
  await waitFor(() => wc.executeJavaScript(`!!document.querySelector('.cr-live-tile')`), 30000, 'live tile')
  await sleep(1500)

  const board = await wc.executeJavaScript(`(() => {
    const sel = document.querySelector('.cr-live-device-select')
    return {
      options: sel ? Array.from(sel.options).map(o => ({ v: o.value, t: o.textContent.trim() })) : [],
      version: (document.body.innerText.match(/v?3\\.\\d+\\.\\d+/) || [''])[0]
    }
  })()`)
  say('dashboard ' + board.version + ' devices=' + board.options.map((o) => o.t).join(','))

  if (WANT_DEVICE) {
    const target = board.options.find((o) => o.t.toLowerCase().includes(WANT_DEVICE.toLowerCase()))
    if (!target) throw new Error('device not offered by the tile: ' + WANT_DEVICE)
    await wc.executeJavaScript(`(() => {
      const sel = document.querySelector('.cr-live-device-select')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      setter.call(sel, ${JSON.stringify(target.v)})
      sel.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`)
    await sleep(1200)
    say('tile switched to ' + target.t)
  }

  // Make the tile idle first, so the measured stream is the one my click starts.
  const pre = await wc.executeJavaScript(DOM_SAMPLE)
  let autoStarted = false
  if (pre.streaming) {
    autoStarted = true
    await clickAt(wc, '.cr-live-tile .cr-live-stop')
    await waitFor(() => wc.executeJavaScript(`!document.querySelector('.cr-live-preview.is-streaming')`), 10000, 'stream to stop')
    await sleep(800)
  }
  say('pre-click state: streaming=' + pre.streaming + ' (autoStart=' + autoStarted + ') device=' + pre.device)

  const sockBefore = Object.keys(net.sockets).length
  result.stage = 'click-start'
  const label = await wc.executeJavaScript(
    `((document.querySelector('.cr-live-tile .cr-live-preview .cr-btn.is-primary') || {}).innerText || '').trim()`)
  const box = await clickAt(wc, '.cr-live-tile .cr-live-preview .cr-btn.is-primary')
  const t0 = Date.now()
  say(`clicked "${label}" at ${box.x},${box.y}`)

  const timeline = []
  let firstLiveShot = null
  const endAt = t0 + SECONDS * 1000
  while (Date.now() < endAt) {
    await sleep(1000)
    const d = await wc.executeJavaScript(DOM_SAMPLE)
    const s = screenSocket()
    timeline.push({
      t: ((Date.now() - t0) / 1000).toFixed(0) + 's',
      streaming: d.streaming,
      badge: d.badge,
      meta: d.meta,
      canvasLit: d.canvasLitSamples,
      recv: s ? s.recv : 0,
      closed: s ? net.closes.some((c) => c.url === s.url) : null
    })
    if (!firstLiveShot && d.streaming && s && s.recv > 4) {
      await sleep(700)
      firstLiveShot = OUT_PNG.replace(/\.png$/i, '-live.png')
      fs.mkdirSync(path.dirname(firstLiveShot), { recursive: true })
      fs.writeFileSync(firstLiveShot, (await wc.capturePage()).toPNG())
      say('captured live frame at ' + ((Date.now() - t0) / 1000).toFixed(1) + 's')
    }
  }

  const finalDom = await wc.executeJavaScript(DOM_SAMPLE)
  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true })
  fs.writeFileSync(OUT_PNG, (await wc.capturePage()).toPNG())

  const s = screenSocket()
  const peak = timeline.reduce((a, r) => Math.max(a, r.recv), 0)
  result = {
    ok: !!(s && s.recv > 0 && timeline.some((r) => r.streaming)),
    stage: 'done',
    device: finalDom.device,
    autoStartedBeforeClick: autoStarted,
    clickedLabel: label,
    newSocketsAfterClick: Object.keys(net.sockets).length - sockBefore,
    socket: s ? { url: s.url, recv: s.recv, recvBytes: s.recvBytes, sent: s.sent, opcodes: s.opcodes } : null,
    peakRecv: peak,
    final: { streaming: finalDom.streaming, badge: finalDom.badge, meta: finalDom.meta, emptyTitle: finalDom.emptyTitle },
    closes: net.closes.map((c) => ({ url: c.url, afterMs: c.at - t0, recv: c.recv })),
    timeline,
    wsErrors: net.errors,
    console: consoleLines,
    screenshots: { live: firstLiveShot, final: OUT_PNG }
  }
}

app.whenReady().then(async () => {
  const hardStop = setTimeout(() => {
    console.log('RESULT ' + JSON.stringify({ ...result, ok: false, timedOut: true, console: consoleLines }))
    app.exit(2)
  }, 180000)
  try {
    await main()
    console.log('RESULT ' + JSON.stringify(result))
    clearTimeout(hardStop)
    app.exit(result.ok ? 0 : 2)
  } catch (e) {
    clearTimeout(hardStop)
    console.log('RESULT ' + JSON.stringify({ ...result, ok: false, error: String((e && e.message) || e), console: consoleLines }))
    app.exit(1)
  }
})
