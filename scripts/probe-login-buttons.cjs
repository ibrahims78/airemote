/**
 * probe-login-buttons.cjs — why do the theme/language buttons not react?
 * Compares a real OS mouse click with a direct DOM .click(), and reports what
 * element is actually at the button's centre (hit-testing / overlay check).
 */
const { app, BrowserWindow, session } = require('electron')
const HOST = process.env.LAB_HOST || '192.168.0.175'
const PORT = process.env.LAB_PORT || '3001'
const BASE = `https://${HOST}:${PORT}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SNAP = `(() => {
  const shell = document.querySelector('.login-shell')
  const html = document.documentElement
  return {
    dir: shell ? shell.getAttribute('dir') : null,
    heading: (document.querySelector('#login-heading') || {}).textContent || '',
    bodyBg: getComputedStyle(document.body).backgroundColor,
    htmlClass: html.className,
    themeAttr: html.getAttribute('data-theme') || document.body.getAttribute('data-theme') || null,
    prefs: Array.from(document.querySelectorAll('.login-preferences button')).map(b => b.innerText.trim())
  }
})()`

async function main() {
  session.defaultSession.setCertificateVerifyProc((req, cb) => {
    cb(String(req.hostname || '').toLowerCase() === HOST ? 0 : -3)
  })
  await session.defaultSession.clearStorageData({ storages: ['localstorage', 'sessionstorage', 'cookies'] })
  const win = new BrowserWindow({ width: 1400, height: 900, show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } })
  const wc = win.webContents
  await win.loadURL(BASE)
  await sleep(2500)

  const before = await wc.executeJavaScript(SNAP)

  // what sits on top of the first preference button?
  const hit = await wc.executeJavaScript(`(() => {
    const b = document.querySelectorAll('.login-preferences button')[0]
    if (!b) return null
    const r = b.getBoundingClientRect()
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2)
    const top = document.elementFromPoint(cx, cy)
    return {
      rect: { x: cx, y: cy, w: Math.round(r.width), h: Math.round(r.height) },
      topTag: top ? top.tagName : null,
      topClass: top ? String(top.className).slice(0, 80) : null,
      isTheButton: !!(top && (top === b || b.contains(top)))
    }
  })()`)

  // 1) real mouse click
  if (hit) {
    wc.sendInputEvent({ type: 'mouseMove', x: hit.rect.x, y: hit.rect.y })
    wc.sendInputEvent({ type: 'mouseDown', x: hit.rect.x, y: hit.rect.y, button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x: hit.rect.x, y: hit.rect.y, button: 'left', clickCount: 1 })
    await sleep(900)
  }
  const afterMouse = await wc.executeJavaScript(SNAP)

  // 2) direct DOM click
  await wc.executeJavaScript(`(() => { const b = document.querySelectorAll('.login-preferences button')[0]; if (b) b.click(); return true })()`)
  await sleep(900)
  const afterDom = await wc.executeJavaScript(SNAP)

  // 3) language button via DOM
  await wc.executeJavaScript(`(() => { const b = document.querySelectorAll('.login-preferences button')[1]; if (b) b.click(); return true })()`)
  await sleep(900)
  const afterLangDom = await wc.executeJavaScript(SNAP)

  console.log('RESULT ' + JSON.stringify({ before, hit, afterMouse, afterDom, afterLangDom }, null, 2))
}
app.whenReady().then(async () => {
  const stop = setTimeout(() => { console.log('RESULT {"timedOut":true}'); app.exit(2) }, 90000)
  try { await main(); clearTimeout(stop); app.exit(0) } catch (e) { clearTimeout(stop); console.log('RESULT ' + JSON.stringify({ error: String(e && e.message || e) })); app.exit(1) }
})
