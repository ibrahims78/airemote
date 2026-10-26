/**
 * verify-popout-join.cjs — the exact bug path: open a FIRST standalone window
 * (starts the capture), then open a SECOND one that joins the running capture.
 *
 * Before 3.7.2 the joining window received delta frames only: no full frame, so
 * it never learned the screen size and stayed black behind the buffering
 * overlay. After 3.7.2 the server replays the last full frame, so the second
 * window must paint immediately.
 *
 * Usage: electron scripts/verify-popout-join.cjs [outB.png]
 * Env: LAB_HOST, LAB_PORT, LAB_CREDS, LAB_DEVICE
 */

const { app, BrowserWindow, session, ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

const HOST = process.env.LAB_HOST || '192.168.0.175'
const PORT = process.env.LAB_PORT || '3001'
const BASE = `https://${HOST}:${PORT}`
const CREDS_FILE = process.env.LAB_CREDS || path.join(process.env.APPDATA || '', 'AiRemote', 'lab-credentials.txt')
const WANT_DEVICE = process.env.LAB_DEVICE || ''
const OUT_PNG = path.resolve(process.argv[2] || path.join(process.cwd(), 'popout-join.png'))
const USE_PRELOAD = process.env.LAB_PRELOAD === '1'
const PRELOAD = 'D:\\autoclaw projects-new\\AiRemote\\packages\\server-desktop\\preload.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const say = (...a) => console.log('[join]', ...a)

function readCreds() {
  const raw = fs.readFileSync(CREDS_FILE, 'utf8')
  const pick = (k) => { const m = raw.match(new RegExp('^\\s*' + k + '\\s*[:=]\\s*(.+)$', 'mi')); return m ? m[1].trim() : '' }
  return { email: pick('email'), password: pick('password') }
}

async function waitFor(fn, ms, label) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v } catch {} await sleep(250) }
  throw new Error('timeout: ' + label)
}

function makeTracker(child, tag) {
  const t = { tag, win: child, sockets: [], frames: 0, bytes: 0, headers: [], console: [], life: [] }
  const wc = child.webContents
  wc.on('console-message', (_e, level, msg) => { if (t.console.length < 20) t.console.push(level + ': ' + String(msg).slice(0, 200)) })
  wc.on('did-fail-load', (_e, code, desc, url) => t.life.push({ ev: 'fail', code, desc, url }))
  wc.on('did-finish-load', () => t.life.push({ ev: 'loaded', url: wc.getURL() }))
  try { wc.debugger.attach('1.3') } catch (e) { t.life.push({ ev: 'cdp-fail', e: e.message }) }
  wc.debugger.sendCommand('Network.enable').catch(() => {})
  wc.debugger.on('message', (_e, method, params) => {
    if (method === 'Network.webSocketCreated') t.sockets.push(String(params.url).replace(/ticket=[^&]+/, 'ticket=<redacted>'))
    if (method === 'Network.webSocketFrameReceived') {
      const r = params.response || {}
      t.frames++
      t.bytes += (r.payloadData || '').length
      try {
        const buf = Buffer.from(r.payloadData || '', 'base64')
        if (r.opcode === 2 && t.headers.length < 4 && buf.length >= 13) {
          const flags = buf.readUInt8(12)
          t.headers.push({ w: buf.readUInt32BE(0), h: buf.readUInt32BE(4), seq: buf.readUInt32BE(8), full: (flags & 2) === 0, len: buf.length })
        }
      } catch {}
    }
  })
  return t
}

const DOM = `(() => {
  const c = Array.from(document.querySelectorAll('canvas')).map(x => {
    let lit = 0
    try {
      const d = x.getContext('2d').getImageData(0, 0, Math.min(40, x.width || 1), Math.min(40, x.height || 1)).data
      for (let i = 0; i < d.length; i += 4) if (d[i] || d[i+1] || d[i+2]) lit++
    } catch { lit = -1 }
    return { w: x.width, h: x.height, lit }
  })
  return { streaming: !!document.querySelector('.cr-live-preview.is-streaming') || /LIVE/.test(document.body.innerText), canvases: c }
})()`

async function main() {
  if (USE_PRELOAD) {
    // Mirror the app's window IPC so the popout's fullscreen call behaves exactly as in production.
    ipcMain.on('window:fullscreen', (e, on) => { try { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!!on) } catch {} })
    ipcMain.on('window:minimize', (e) => { try { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.minimize() } catch {} })
    ipcMain.on('window:maximize', (e) => { try { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.maximize() } catch {} })
    ipcMain.on('window:close', (e) => { try { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close() } catch {} })
  }

  session.defaultSession.setCertificateVerifyProc((req, cb) => {
    cb(String(req.hostname || '').toLowerCase() === HOST ? 0 : -3)
  })
  await session.defaultSession.clearStorageData({ storages: ['localstorage', 'sessionstorage', 'cookies'] })

  const win = new BrowserWindow({ width: 1400, height: 900, show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } })

  const trackers = []
  win.webContents.setWindowOpenHandler(({ url }) => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      width: 1200, height: 800, autoHideMenuBar: true, backgroundColor: '#000000',
      webPreferences: USE_PRELOAD
        ? { preload: PRELOAD, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false }
        : { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false }
    }
  }))
  win.webContents.on('did-create-window', (child) => {
    const t = makeTracker(child, 'child' + (trackers.length + 1))
    trackers.push(t)
    say('child window created: ' + t.tag)
  })

  await win.loadURL(BASE)
  await waitFor(() => win.webContents.executeJavaScript(`!!document.querySelector('.login-form input[type="email"]')`), 30000, 'login form')
  const creds = readCreds()
  await win.webContents.executeJavaScript(`(() => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const e = document.querySelector('.login-form input[type="email"]')
    const p = document.querySelector('.login-form input[type="password"]')
    set.call(e, ${JSON.stringify(creds.email)}); e.dispatchEvent(new Event('input', { bubbles: true }))
    set.call(p, ${JSON.stringify(creds.password)}); p.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('.login-submit').click()
    return true
  })()`)
  await waitFor(() => win.webContents.executeJavaScript(`!!document.querySelector('.cr-live-tile')`), 30000, 'dashboard')
  await sleep(1200)

  const devices = await win.webContents.executeJavaScript(`(() => {
    const sel = document.querySelector('.cr-live-device-select')
    return sel ? Array.from(sel.options).map(o => ({ id: o.value, name: o.textContent.trim() })) : []
  })()`)
  const target = WANT_DEVICE
    ? devices.find((d) => d.name.toLowerCase().includes(WANT_DEVICE.toLowerCase()))
    : devices[0]
  if (!target) throw new Error('no device')

  // Window A opens the capture.
  await win.webContents.executeJavaScript(
    `window.open('/view/' + ${JSON.stringify(target.id)}, 'airemote-A', 'width=1200,height=800'); true`)
  await waitFor(() => trackers.length >= 1, 15000, 'first child')
  const A = trackers[0]
  await waitFor(() => A.frames > 5, 25000, 'child A frames')
  const domA = await A.win.webContents.executeJavaScript(DOM)
  say('A frames=' + A.frames + ' canvas=' + JSON.stringify(domA.canvases))

  // Window B joins the capture that A is holding.
  await win.webContents.executeJavaScript(
    `window.open('/view/' + ${JSON.stringify(target.id)}, 'airemote-B', 'width=1200,height=800'); true`)
  await waitFor(() => trackers.length >= 2, 15000, 'second child')
  const B = trackers[1]

  const t0 = Date.now()
  while (Date.now() - t0 < 20000 && B.frames === 0) await sleep(250)
  await sleep(2500)
  const domB = await B.win.webContents.executeJavaScript(DOM)

  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true })
  fs.writeFileSync(OUT_PNG, (await B.win.webContents.capturePage()).toPNG())

  // The 7s pre-roll light is intentional; confirm it actually clears.
  await sleep(9000)
  const afterOverlay = await B.win.webContents.executeJavaScript(
    `({ overlay: !!document.querySelector('.cr-buffer-overlay'), text: (document.body.innerText || '').includes('التخزين المؤقت') })`)
  const afterShot = OUT_PNG.replace(/\.png$/i, '-after.png')
  fs.writeFileSync(afterShot, (await B.win.webContents.capturePage()).toPNG())
  const domBAfter = await B.win.webContents.executeJavaScript(DOM)

  console.log('RESULT ' + JSON.stringify({
    device: target.name,
    A: { frames: A.frames, firstHeader: A.headers[0] || null, canvases: domA.canvases },
    B: { frames: B.frames, bytes: B.bytes, headers: B.headers, canvases: domB.canvases, sockets: B.sockets, console: B.console, life: B.life },
    after9s: { overlayStillThere: afterOverlay, canvases: domBAfter.canvases, screenshot: afterShot },
    screenshotB: OUT_PNG
  }, null, 2))
}

app.whenReady().then(async () => {
  const stop = setTimeout(() => { console.log('RESULT {"timedOut":true}'); app.exit(2) }, 150000)
  try { await main(); clearTimeout(stop); app.exit(0) } catch (e) {
    clearTimeout(stop)
    console.log('RESULT ' + JSON.stringify({ error: String(e && e.message || e) }))
    app.exit(1)
  }
})
