/**
 * verify-popout.cjs — reproduce the standalone stream window ("/view/:id")
 * the way packages/server-desktop/main.js creates it, then report why it is
 * black or not.
 *
 * Flow: load dashboard -> log in -> (optionally start the tile stream first)
 * -> window.open('/view/<id>') with the same setWindowOpenHandler options
 * -> inspect the CHILD window: URL, load failures, console, WebSocket frames
 * (including the 13-byte binary header), canvas pixels, screenshot.
 *
 * Device ids are read from the tile's own <select>, so no credentials are used
 * beyond the lab login form.
 *
 * Usage:
 *   node_modules/.bin/electron scripts/verify-popout.cjs [out.png]
 *
 * Env: LAB_HOST, LAB_PORT, LAB_CREDS, LAB_DEVICE (name substring),
 *      LAB_TRUST=0 (do not supply certificate trust),
 *      LAB_PRE_STREAM=1 (start the dashboard tile first = the user's path)
 */

const { app, BrowserWindow, session } = require('electron')
const fs = require('fs')
const path = require('path')

const HOST = process.env.LAB_HOST || '192.168.0.175'
const PORT = process.env.LAB_PORT || '3001'
const BASE = `https://${HOST}:${PORT}`
const CREDS_FILE = process.env.LAB_CREDS || path.join(process.env.APPDATA || '', 'AiRemote', 'lab-credentials.txt')
const TRUST = process.env.LAB_TRUST !== '0'
const WANT_DEVICE = process.env.LAB_DEVICE || ''
const PRE_STREAM = process.env.LAB_PRE_STREAM === '1'
const OUT_PNG = path.resolve(process.argv[2] || path.join(process.cwd(), 'popout.png'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const say = (...a) => console.log('[popout]', ...a)

const childNet = { sockets: [], frames: 0, bytes: 0, headers: [], texts: [] }
const childConsole = []
const childLifecycle = []
let childWin = null

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

function watchChild(wc) {
  wc.on('console-message', (_e, level, msg) => {
    if (childConsole.length < 40) childConsole.push(level + ': ' + String(msg).slice(0, 240))
  })
  wc.on('did-fail-load', (_e, code, desc, url) => childLifecycle.push({ ev: 'did-fail-load', code, desc, url }))
  wc.on('did-finish-load', () => childLifecycle.push({ ev: 'did-finish-load', url: wc.getURL() }))
  wc.on('render-process-gone', (_e, d) => childLifecycle.push({ ev: 'render-gone', reason: d.reason }))
  try { wc.debugger.attach('1.3') } catch (e) { childLifecycle.push({ ev: 'cdp-attach-failed', e: e.message }) }
  wc.debugger.sendCommand('Network.enable').catch(() => {})
  wc.debugger.on('message', (_e, method, params) => {
    if (method === 'Network.webSocketCreated') childNet.sockets.push(String(params.url).replace(/ticket=[^&]+/, 'ticket=<redacted>'))
    if (method === 'Network.webSocketFrameReceived') {
      const r = params.response || {}
      childNet.frames++
      childNet.bytes += (r.payloadData || '').length
      try {
        const buf = Buffer.from(r.payloadData || '', 'base64')
        if (r.opcode === 2) {
          if (childNet.headers.length < 8) {
            if (buf.length >= 13) {
              const flags = buf.readUInt8(12)
              childNet.headers.push({
                op: 2, len: buf.length,
                w: buf.readUInt32BE(0), h: buf.readUInt32BE(4), seq: buf.readUInt32BE(8),
                flags, keyframe: (flags & 1) === 1, delta: (flags & 2) === 2
              })
            } else {
              childNet.headers.push({ op: 2, len: buf.length, hex: buf.toString('hex').slice(0, 40) })
            }
          }
        } else if (r.opcode === 1 && childNet.texts.length < 5) {
          childNet.texts.push(buf.toString('utf8').slice(0, 160))
        }
      } catch {}
    }
    if (method === 'Network.webSocketFrameError') childLifecycle.push({ ev: 'ws-frame-error', e: params.errorMessage })
    if (method === 'Network.loadingFailed' && params.errorText && /CERT|SSL/i.test(String(params.errorText))) {
      childLifecycle.push({ ev: 'cert-loading-failed', errorText: params.errorText, type: params.type })
    }
  })
}

const CHILD_DOM = `(() => {
  const canvases = Array.from(document.querySelectorAll('canvas')).map(c => {
    let lit = null
    try {
      const d = c.getContext('2d').getImageData(0, 0, Math.min(48, c.width || 1), Math.min(48, c.height || 1)).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] || d[i+1] || d[i+2]) n++
      lit = n
    } catch (e) { lit = 'err' }
    const r = c.getBoundingClientRect()
    return { w: c.width, h: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height), lit }
  })
  return {
    url: location.href,
    title: document.title,
    bodyText: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 400),
    canvases,
    hasLoginForm: !!document.querySelector('.login-form'),
    bodyBg: getComputedStyle(document.body).backgroundColor
  }
})()`

async function clickTileStart(win) {
  const btn = await win.webContents.executeJavaScript(`(() => {
    const b = document.querySelector('.cr-live-tile .cr-live-preview .cr-btn.is-primary')
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  if (!btn) return false
  win.webContents.sendInputEvent({ type: 'mouseMove', x: btn.x, y: btn.y })
  win.webContents.sendInputEvent({ type: 'mouseDown', x: btn.x, y: btn.y, button: 'left', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x: btn.x, y: btn.y, button: 'left', clickCount: 1 })
  return true
}

async function main() {
  if (TRUST) {
    session.defaultSession.setCertificateVerifyProc((req, cb) => {
      cb(String(req.hostname || '').toLowerCase() === HOST ? 0 : -3)
    })
  }
  await session.defaultSession.clearStorageData({ storages: ['localstorage', 'sessionstorage', 'cookies'] })

  const win = new BrowserWindow({
    width: 1400, height: 900, show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false }
  })

  // Mirrors packages/server-desktop/main.js setWindowOpenHandler.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/\/view\//.test(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1400, height: 900, minWidth: 900, minHeight: 600,
          autoHideMenuBar: true, backgroundColor: '#000000',
          webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false }
        }
      }
    }
    return { action: 'allow' }
  })
  win.webContents.on('did-create-window', (child) => {
    childWin = child
    say('child window created')
    watchChild(child.webContents)
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
  await sleep(1000)

  // Device ids come from the tile's own selector: value = id, text = name.
  const devices = await win.webContents.executeJavaScript(`(() => {
    const sel = document.querySelector('.cr-live-device-select')
    return sel ? Array.from(sel.options).map(o => ({ id: o.value, name: o.textContent.trim() })) : []
  })()`)
  say('devices: ' + devices.map((d) => d.name).join(', '))

  if (PRE_STREAM) {
    await win.webContents.executeJavaScript(`(() => {
      const sel = document.querySelector('.cr-live-device-select')
      const want = ${JSON.stringify(WANT_DEVICE.toLowerCase())}
      if (sel && want) {
        const opt = Array.from(sel.options).find(o => o.textContent.trim().toLowerCase().includes(want))
        if (opt) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
          setter.call(sel, opt.value)
          sel.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }
      return true
    })()`)
    await sleep(1200)
    const already = await win.webContents.executeJavaScript(`!!document.querySelector('.cr-live-preview.is-streaming')`)
    if (!already) await clickTileStart(win)
    let tileLive = already
    if (!tileLive) {
      try {
        await waitFor(() => win.webContents.executeJavaScript(`!!document.querySelector('.cr-live-preview.is-streaming')`), 20000, 'tile streaming')
        tileLive = true
      } catch { say('tile did not report streaming within 20s') }
    }
    say('tile streaming before popout = ' + tileLive + ' -> opening the standalone window (user path)')
    await sleep(1500)
  }

  const target = WANT_DEVICE
    ? devices.find((d) => d.name.toLowerCase().includes(WANT_DEVICE.toLowerCase()))
    : devices[0]
  if (!target) throw new Error('no device to open')

  say('opening /view/' + target.id + ' for ' + target.name)
  await win.webContents.executeJavaScript(
    `window.open('/view/' + ${JSON.stringify(target.id)}, 'airemote-stream-' + ${JSON.stringify(target.id)}, 'width=1400,height=900'); true`)

  await waitFor(() => childWin && !childWin.isDestroyed(), 15000, 'child window')
  const cwc = childWin.webContents

  await sleep(1000)
  let dom = null
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    try { dom = await cwc.executeJavaScript(CHILD_DOM) } catch (e) { childLifecycle.push({ ev: 'eval-failed', e: e.message }) }
    if (childNet.frames > 5) break
    await sleep(1000)
  }

  const after = { frames: childNet.frames, bytes: childNet.bytes }
  let shot = null
  try {
    const img = await cwc.capturePage()
    fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true })
    fs.writeFileSync(OUT_PNG, img.toPNG())
    shot = OUT_PNG
  } catch (e) { childLifecycle.push({ ev: 'capture-failed', e: e.message }) }

  console.log('RESULT ' + JSON.stringify({
    device: target.name,
    preStreamedTile: PRE_STREAM,
    trustSupplied: TRUST,
    childUrl: cwc.isDestroyed() ? null : cwc.getURL(),
    dom,
    ws: { sockets: childNet.sockets, frames: after.frames, bytes: after.bytes, headers: childNet.headers, texts: childNet.texts },
    lifecycle: childLifecycle,
    console: childConsole,
    screenshot: shot
  }, null, 2))
}

app.whenReady().then(async () => {
  const stop = setTimeout(() => { console.log('RESULT ' + JSON.stringify({ timedOut: true, lifecycle: childLifecycle })); app.exit(2) }, 150000)
  try { await main(); clearTimeout(stop); app.exit(0) } catch (e) {
    clearTimeout(stop)
    console.log('RESULT ' + JSON.stringify({ error: String(e && e.message || e), lifecycle: childLifecycle, console: childConsole }, null, 2))
    app.exit(1)
  }
})
