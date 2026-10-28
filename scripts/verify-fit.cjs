/**
 * verify-fit.cjs — proves the popout shows the WHOLE remote desktop and that the
 * fit control works in all three modes (fit / fill / actual).
 *
 * For each mode it reads the grey area's content box (padding excluded) and the
 * canvas box, then checks: fit must never exceed the area, and its aspect must
 * match the stream aspect (no distortion / no crop).
 */
const { app, BrowserWindow, session } = require('electron')
const fs = require('fs')
const path = require('path')

const HOST = '127.0.0.1', PORT = '3001', BASE = `https://${HOST}:${PORT}`
const DEVICE_ID = process.env.LAB_DEVICE_ID
const OUT = path.resolve(process.env.LAB_OUT || 'outputs/verify-2026-10-28/fit')
const CREDS = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const measure = `(() => {
  const area = document.querySelector('canvas')?.parentElement
  const cv = document.querySelector('canvas')
  if (!area || !cv) return null
  const cs = getComputedStyle(area)
  const padX = (parseFloat(cs.paddingLeft)||0) + (parseFloat(cs.paddingRight)||0)
  const padY = (parseFloat(cs.paddingTop)||0) + (parseFloat(cs.paddingBottom)||0)
  const r = cv.getBoundingClientRect()
  const ar = area.getBoundingClientRect()
  return {
    avail: { w: Math.round(area.clientWidth - padX), h: Math.round(area.clientHeight - padY) },
    area:  { w: Math.round(ar.width), h: Math.round(ar.height) },
    canvas:{ w: Math.round(r.width), h: Math.round(r.height) },
    intrinsic: { w: cv.width, h: cv.height }
  }
})()`

async function main() {
  const creds = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
  fs.mkdirSync(OUT, { recursive: true })
  session.defaultSession.setCertificateVerifyProc((req, cb) => cb(String(req.hostname || '').toLowerCase() === HOST ? 0 : -3))
  await session.defaultSession.clearStorageData({ storages: ['localstorage', 'sessionstorage', 'cookies'] })

  const win = new BrowserWindow({ width: 1280, height: 800, show: true, webPreferences: { backgroundThrottling: false } })
  const wc = win.webContents
  await win.loadURL(BASE)
  await sleep(1200)
  await wc.executeJavaScript(`(() => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const e = document.querySelector('.login-form input[type="email"]')
    const p = document.querySelector('.login-form input[type="password"]')
    if (!e) return false
    set.call(e, ${JSON.stringify(creds.email)}); e.dispatchEvent(new Event('input', { bubbles: true }))
    set.call(p, ${JSON.stringify(creds.password)}); p.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('.login-submit').click(); return true
  })()`)
  await sleep(2500)

  await win.loadURL(`${BASE}/view/${DEVICE_ID}`)
  await sleep(4000)

  const modes = ['ملاءمة', 'ملء', '1:1']
  const out = { device: DEVICE_ID, modes: {}, ok: false }
  for (const label of modes) {
    const clicked = await wc.executeJavaScript(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === ${JSON.stringify(label)} && x.getAttribute('aria-pressed') !== null)
      if (!b) return false
      b.click(); return true
    })()`)
    await sleep(600)
    const m = await wc.executeJavaScript(measure)
    out.modes[label] = { clicked, ...m }
    console.log(label, 'clicked=' + clicked, JSON.stringify(m && { avail: m.avail, canvas: m.canvas, intrinsic: m.intrinsic }))
    if (label === 'ملاءمة') {
      const png = path.join(OUT, 'fit-' + DEVICE_ID.slice(0, 8) + '.png')
      fs.writeFileSync(png, (await wc.capturePage()).toPNG())
      out.screenshot = png
    }
  }

  const fit = out.modes['ملاءمة']
  const inBox = fit && fit.canvas.w <= fit.avail.w + 2 && fit.canvas.h <= fit.avail.h + 2
  const ratioOk = fit && fit.intrinsic.h > 0 && Math.abs((fit.canvas.w / fit.canvas.h) - (fit.intrinsic.w / fit.intrinsic.h)) < 0.02
  out.ok = !!fit && !!inBox && !!ratioOk
  out.checks = { fitsInsideArea: !!inBox, aspectPreserved: !!ratioOk }
  fs.writeFileSync(path.join(OUT, 'fit-result.json'), JSON.stringify(out, null, 2))
  console.log('RESULT ' + JSON.stringify({ ok: out.ok, checks: out.checks, fit: fit && { avail: fit.avail, canvas: fit.canvas, intrinsic: fit.intrinsic } }))
}

app.whenReady().then(async () => {
  const stop = setTimeout(() => { console.log('RESULT {"timedOut":true}'); app.exit(2) }, 120000)
  try { await main(); clearTimeout(stop); app.exit(0) }
  catch (e) { clearTimeout(stop); console.log('RESULT ' + JSON.stringify({ error: String(e && e.message || e) })); app.exit(1) }
})
