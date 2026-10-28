/**
 * verify-rotation-stream.cjs — proves the live stream survives a device rotation.
 *
 * Why: on 2026-10-27 rotating the TECNO turned the stream black. The Android
 * agent cached a Canvas bound to the old Bitmap, so after a resize every frame
 * was drawn into a recycled bitmap and the capture loop died.
 *
 * Flow: real login -> /view/<deviceId> -> wait for streaming -> screenshot +
 * mean brightness -> rotate through adb -> screenshot + brightness -> rotate
 * back -> screenshot. Also counts WebSocket frames via CDP so "still frames"
 * is measured, not assumed.
 *
 * Usage: electron scripts/verify-rotation-stream.cjs
 * Env: LAB_HOST/LAB_PORT (default 127.0.0.1:3001), LAB_CREDS_JSON (lab-probe.json),
 *      LAB_DEVICE_ID (required), LAB_ADB, LAB_SERIAL, LAB_OUT (dir),
 *      LAB_WAIT_MS (default 6000)
 */
const { app, BrowserWindow, session } = require('electron')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const HOST = process.env.LAB_HOST || '127.0.0.1'
const PORT = process.env.LAB_PORT || '3001'
const BASE = `https://${HOST}:${PORT}`
const DEVICE_ID = process.env.LAB_DEVICE_ID || ''
const ADB = process.env.LAB_ADB || 'D:\\LDPlayer\\LDPlayer9\\adb.exe'
const SERIAL = process.env.LAB_SERIAL || ''
const WAIT = Math.max(2000, parseInt(process.env.LAB_WAIT_MS || '6000', 10))
const OUT = path.resolve(process.env.LAB_OUT || 'outputs/verify-2026-10-27/rotation')
const CREDS_JSON = process.env.LAB_CREDS_JSON
  || path.join('C:\\Users\\admin\\AppData\\Roaming\\AiRemote', 'lab-probe.json')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const say = (...a) => console.log('[rot]', ...a)

const net = { recv: 0, bytes: 0, closes: [] }
const result = { device: DEVICE_ID, serial: SERIAL, shots: [], ok: false }

function adb(args) {
  return execFileSync(ADB, ['-s', SERIAL].concat(args), { encoding: 'utf8' })
}

function rotate(deg) {
  adb(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0'])
  adb(['shell', 'settings', 'put', 'system', 'user_rotation', String(deg)])
  say('rotated device to user_rotation=' + deg)
}

async function brightness(win) {
  const img = await win.webContents.capturePage()
  const size = img.getSize()
  const bmp = img.getBitmap()          // BGRA
  let sum = 0, n = 0
  for (let i = 0; i < bmp.length; i += 4 * 37) {   // sample
    sum += (bmp[i] + bmp[i + 1] + bmp[i + 2]) / 3
    n++
  }
  return { mean: +(sum / Math.max(1, n)).toFixed(1), w: size.width, h: size.height }
}

async function shot(win, name) {
  const b = await brightness(win)
  const png = path.join(OUT, name + '.png')
  const img = await win.webContents.capturePage()
  fs.writeFileSync(png, img.toPNG())
  const state = await win.webContents.executeJavaScript(`(() => {
    const cv = document.querySelector('canvas')
    const txt = (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 160)
    return { canvas: cv ? { w: cv.width, h: cv.height } : null, text: txt,
             streaming: !!document.querySelector('.cr-live-preview.is-streaming') }
  })()`)
  const rec = { name, png, mean: b.mean, window: { w: b.w, h: b.h }, canvas: state.canvas, streaming: state.streaming, text: state.text, recv: net.recv }
  result.shots.push(rec)
  say(`${name}: brightness=${b.mean} canvas=${state.canvas ? state.canvas.w + 'x' + state.canvas.h : 'none'} streaming=${state.streaming} wsFrames=${net.recv}`)
  return rec
}

async function main() {
  const creds = JSON.parse(fs.readFileSync(CREDS_JSON, 'utf8'))
  fs.mkdirSync(OUT, { recursive: true })

  session.defaultSession.setCertificateVerifyProc((req, cb) => cb(String(req.hostname || '').toLowerCase() === HOST ? 0 : -3))
  await session.defaultSession.clearStorageData({ storages: ['localstorage', 'sessionstorage', 'cookies'] })

  const win = new BrowserWindow({ width: 1200, height: 800, show: true, webPreferences: { backgroundThrottling: false } })
  const wc = win.webContents
  try { wc.debugger.attach('1.3') } catch {}
  wc.debugger.sendCommand('Network.enable').catch(() => {})
  wc.debugger.on('message', (_e, m, p) => {
    if (m === 'Network.webSocketFrameReceived') { net.recv++; net.bytes += (p.response && p.response.payloadData || '').length }
    if (m === 'Network.webSocketClosed') net.closes.push(Date.now())
  })

  await win.loadURL(BASE)
  await sleep(1500)
  const hasLogin = await wc.executeJavaScript(`!!document.querySelector('.login-form input[type="email"]')`)
  if (hasLogin) {
    say('signing in as ' + creds.email)
    await wc.executeJavaScript(`(() => {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      const e = document.querySelector('.login-form input[type="email"]')
      const p = document.querySelector('.login-form input[type="password"]')
      set.call(e, ${JSON.stringify(creds.email)}); e.dispatchEvent(new Event('input', { bubbles: true }))
      set.call(p, ${JSON.stringify(creds.password)}); p.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector('.login-submit').click(); return true
    })()`)
    await sleep(3000)
  } else {
    say('already signed in')
  }

  await win.loadURL(`${BASE}/view/${DEVICE_ID}`)
  await sleep(2500)

  const first = await shot(win, '1-portrait')
  if (!first.streaming && first.recv === 0) throw new Error('stream did not start (no canvas / no frames)')

  if (process.env.LAB_UI_TEST === '1') {
    // toolbar stability: sample the toolbar width twice, 2s apart
    const w1 = await win.webContents.executeJavaScript(`(() => { const el = document.querySelector('div[class*="bg-navy-900/95"]'); return el ? Math.round(el.getBoundingClientRect().width) : -1 })()`)
    await sleep(2000)
    const w2 = await win.webContents.executeJavaScript(`(() => { const el = document.querySelector('div[class*="bg-navy-900/95"]'); return el ? Math.round(el.getBoundingClientRect().width) : -1 })()`)
    await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.title === 'إعدادات الجودة'); if (b) b.click(); return !!b })()`)
    await sleep(900)
    const menu = await win.webContents.executeJavaScript(`(() => { const els = Array.from(document.querySelectorAll('div')).filter(d => d.style && d.style.width === '268px'); if (!els.length) return null; const r = els[0].getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left), inView: r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1, items: els[0].querySelectorAll('button').length } })()`)
    await shot(win, 'menu-open')
    result.ok = first.mean > 8 && net.recv > 2 && !!menu && menu.inView && w1 === w2
    result.ui = { toolbarWidth1: w1, toolbarWidth2: w2, menu }
    result.net = { recv: net.recv, bytes: net.bytes, closes: net.closes.length }
    fs.writeFileSync(path.join(OUT, 'ui-result.json'), JSON.stringify(result, null, 2))
    console.log('RESULT ' + JSON.stringify({ ok: result.ok, toolbar: [w1, w2], menu, frames: net.recv, canvas: first.canvas }))
    return
  }

  if (process.env.LAB_SINGLE === '1') {
    result.ok = first.mean > 8 && net.recv > 2
    result.net = { recv: net.recv, bytes: net.bytes, closes: net.closes.length }
    result.single = first
    fs.writeFileSync(path.join(OUT, 'rotation-result.json'), JSON.stringify(result, null, 2))
    console.log('RESULT ' + JSON.stringify({ ok: result.ok, mean: first.mean, canvas: first.canvas, frames: net.recv, bytes: net.bytes, text: first.text }))
    return
  }

  rotate(1)                      // landscape
  await sleep(WAIT)
  const second = await shot(win, '2-landscape')

  rotate(0)                      // back to portrait
  await sleep(WAIT)
  const third = await shot(win, '3-portrait-again')

  result.rotation = { portrait: first, landscape: second, portraitAgain: third }
  result.ok = second.mean > 8 && third.mean > 8 && net.recv > (first.recv + 2)
  result.net = { recv: net.recv, bytes: net.bytes, closes: net.closes.length }
  fs.writeFileSync(path.join(OUT, 'rotation-result.json'), JSON.stringify(result, null, 2))
  console.log('RESULT ' + JSON.stringify({ ok: result.ok, mean: [first.mean, second.mean, third.mean], canvases: [first.canvas, second.canvas, third.canvas], frames: net.recv }))
}

app.whenReady().then(async () => {
  const stop = setTimeout(() => { console.log('RESULT {"timedOut":true}'); app.exit(2) }, 180000)
  try { await main(); clearTimeout(stop); app.exit(0) }
  catch (e) { clearTimeout(stop); console.log('RESULT ' + JSON.stringify({ error: String(e && e.message || e) })); app.exit(1) }
})
