/**
 * measure-login-layout.cjs — is the theme/language strip visible without
 * scrolling at the sizes the app really uses?
 *
 * Runs against a URL (default: the lab server). For pre-deploy checks pass a
 * file:// URL to the built dashboard so layout can be verified without shipping.
 *
 * Usage: electron scripts/measure-login-layout.cjs [outPrefix]
 * Env: LAB_URL (overrides https://host:port), LAB_HOST/LAB_PORT
 */
const { app, BrowserWindow, session } = require('electron')
const fs = require('fs')

const HOST = process.env.LAB_HOST || '192.168.0.175'
const PORT = process.env.LAB_PORT || '3001'
const BASE = process.env.LAB_URL || `https://${HOST}:${PORT}`
const PREFIX = process.argv[2] || 'login'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const MEASURE = `(() => {
  const q = (s) => document.querySelector(s)
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) } }
  const prefs = q('.login-preferences')
  const pr = prefs ? prefs.getBoundingClientRect() : null
  const btns = Array.from(document.querySelectorAll('.login-preferences button'))
  const hit = btns.map(b => {
    const r = b.getBoundingClientRect()
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
    return !!el && (el === b || b.contains(el))
  })
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    mediaMatch: window.matchMedia('(max-height: 860px)').matches,
    cardMaxH: getComputedStyle(q('.login-card')).maxHeight,
    panelOverflow: getComputedStyle(q('.login-form-panel')).overflowY,
    panelHeight: rect(q('.login-form-panel')),
    docScrollHeight: document.documentElement.scrollHeight,
    prefs: rect(prefs),
    prefsFullyVisible: !!pr && pr.top >= 0 && pr.bottom <= window.innerHeight,
    buttonsClickableByHitTest: hit,
    submit: rect(q('.login-submit')),
    foot: rect(q('.login-form-foot')),
    topActions: document.querySelectorAll('.login-top-actions').length
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
  await sleep(2600)

  const large = await wc.executeJavaScript(MEASURE)
  fs.writeFileSync(`${PREFIX}-1400x900.png`, (await wc.capturePage()).toPNG())

  win.setBounds({ x: 40, y: 40, width: 1000, height: 660 })
  await sleep(1200)
  const small = await wc.executeJavaScript(MEASURE)
  fs.writeFileSync(`${PREFIX}-1000x660.png`, (await wc.capturePage()).toPNG())

  console.log('RESULT ' + JSON.stringify({ large, small }, null, 2))
}
app.whenReady().then(async () => {
  const stop = setTimeout(() => { console.log('RESULT {"timedOut":true}'); app.exit(2) }, 90000)
  try { await main(); clearTimeout(stop); app.exit(0) } catch (e) { clearTimeout(stop); console.log('RESULT ' + JSON.stringify({ error: String(e && e.message || e) })); app.exit(1) }
})
