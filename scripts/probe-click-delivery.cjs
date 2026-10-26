/**
 * probe-click-delivery.cjs — do OS-level mouse events reach the page at all?
 * Installs a capture-phase counter, focuses the window, then clicks.
 */
const { app, BrowserWindow, session } = require('electron')
const HOST = process.env.LAB_HOST || '192.168.0.175'
const PORT = process.env.LAB_PORT || '3001'
const BASE = process.env.LAB_URL || `https://${HOST}:${PORT}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  session.defaultSession.setCertificateVerifyProc((req, cb) => {
    cb(String(req.hostname || '').toLowerCase() === HOST ? 0 : -3)
  })
  await session.defaultSession.clearStorageData({ storages: ['localstorage', 'sessionstorage', 'cookies'] })

  const win = new BrowserWindow({ width: 1400, height: 900, show: true, focusable: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } })
  const wc = win.webContents
  await win.loadURL(BASE)
  await sleep(2500)
  win.show(); win.focus(); wc.focus()
  await sleep(400)

  await wc.executeJavaScript(`(() => {
    window.__clicks = []
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('button') : null
      window.__clicks.push(b ? (b.className || b.innerText || 'button') : 'other')
    }, true)
    return true
  })()`)

  const box = await wc.executeJavaScript(`(() => {
    const b = document.querySelectorAll('.login-preferences button')[0]
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
             top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight,
             focused: document.hasFocus() }
  })()`)

  wc.sendInputEvent({ type: 'mouseMove', x: box.x, y: box.y })
  await sleep(120)
  wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  await sleep(900)

  const after = await wc.executeJavaScript(`({
    clicks: window.__clicks,
    focused: document.hasFocus(),
    htmlClass: document.documentElement.className
  })`)

  console.log('RESULT ' + JSON.stringify({ box, after }, null, 2))
}
app.whenReady().then(async () => {
  const stop = setTimeout(() => { console.log('RESULT {"timedOut":true}'); app.exit(2) }, 90000)
  try { await main(); clearTimeout(stop); app.exit(0) } catch (e) { clearTimeout(stop); console.log('RESULT ' + JSON.stringify({ error: String(e && e.message || e) })); app.exit(1) }
})
