/**
 * verify-login-ui.cjs — check the login screen after removing duplicate controls.
 *
 * Asserts:
 *   - no header theme/language buttons (.login-top-actions, .login-lang)
 *   - exactly two preference buttons inside the form
 *   - BOTH of them still work: theme changes the rendered background, language
 *     switches direction/heading
 * and writes before/after screenshots.
 *
 * Usage: electron scripts/verify-login-ui.cjs [outPrefix]
 */

const { app, BrowserWindow, session } = require('electron')
const fs = require('fs')
const path = require('path')

const HOST = process.env.LAB_HOST || '192.168.0.175'
const PORT = process.env.LAB_PORT || '3001'
const BASE = `https://${HOST}:${PORT}`
const PREFIX = path.resolve(process.argv[2] || path.join(process.cwd(), 'login-ui'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(fn, ms, label) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v } catch {} await sleep(200) }
  throw new Error('timeout: ' + label)
}

const SNAP = `(() => {
  const shell = document.querySelector('.login-shell')
  return {
    topActions: document.querySelectorAll('.login-top-actions').length,
    langBtn: document.querySelectorAll('.login-lang').length,
    prefButtons: Array.from(document.querySelectorAll('.login-preferences button')).map(b => b.innerText.trim()),
    dir: shell ? shell.getAttribute('dir') : null,
    heading: (document.querySelector('#login-heading') || {}).textContent || '',
    bodyBg: getComputedStyle(document.body).backgroundColor,
    eyeButtons: document.querySelectorAll('.login-eye').length,
    submitLabel: (document.querySelector('.login-submit') || {}).innerText || ''
  }
})()`

async function clickSel(wc, sel, index) {
  const box = await wc.executeJavaScript(`(() => {
    const els = document.querySelectorAll(${JSON.stringify(sel)})
    const el = els[${index || 0}]
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) }
  })()`)
  if (!box || box.w < 2) throw new Error('not clickable: ' + sel)
  wc.sendInputEvent({ type: 'mouseMove', x: box.x, y: box.y })
  wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  await sleep(700)
}

async function main() {
  session.defaultSession.setCertificateVerifyProc((req, cb) => {
    cb(String(req.hostname || '').toLowerCase() === HOST ? 0 : -3)
  })
  await session.defaultSession.clearStorageData({ storages: ['localstorage', 'sessionstorage', 'cookies'] })

  const win = new BrowserWindow({ width: 1400, height: 900, show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } })
  const wc = win.webContents
  await win.loadURL(BASE)
  await waitFor(() => wc.executeJavaScript(`!!document.querySelector('.login-form')`), 30000, 'login form')
  await sleep(900)

  const before = await wc.executeJavaScript(SNAP)
  fs.mkdirSync(path.dirname(PREFIX), { recursive: true })
  fs.writeFileSync(PREFIX + '-before.png', (await wc.capturePage()).toPNG())

  // OS-level input only reaches the page when the window owns focus.
  win.show(); win.focus(); wc.focus()
  await sleep(400)

  // theme button = first preference button
  await clickSel(wc, '.login-preferences button', 0)
  const afterTheme = await wc.executeJavaScript(SNAP)
  fs.writeFileSync(PREFIX + '-after-theme.png', (await wc.capturePage()).toPNG())

  // language button = second preference button
  await clickSel(wc, '.login-preferences button', 1)
  const afterLang = await wc.executeJavaScript(SNAP)
  fs.writeFileSync(PREFIX + '-after-lang.png', (await wc.capturePage()).toPNG())

  console.log('RESULT ' + JSON.stringify({
    before,
    afterTheme,
    afterLang,
    checks: {
      noHeaderDuplicates: before.topActions === 0 && before.langBtn === 0,
      twoPrefButtons: before.prefButtons.length === 2,
      themeChanged: afterTheme.bodyBg !== before.bodyBg,
      languageChanged: afterLang.dir !== afterTheme.dir || afterLang.heading !== afterTheme.heading,
      oneEyeButton: before.eyeButtons === 1,
      singleSubmit: !!before.submitLabel
    },
    screenshots: { before: PREFIX + '-before.png', theme: PREFIX + '-after-theme.png', lang: PREFIX + '-after-lang.png' }
  }, null, 2))
}

app.whenReady().then(async () => {
  const stop = setTimeout(() => { console.log('RESULT {"timedOut":true}'); app.exit(2) }, 120000)
  try { await main(); clearTimeout(stop); app.exit(0) } catch (e) {
    clearTimeout(stop)
    console.log('RESULT ' + JSON.stringify({ error: String(e && e.message || e) }))
    app.exit(1)
  }
})
