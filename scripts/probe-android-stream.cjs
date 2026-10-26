/**
 * probe-android-stream.cjs — what does the Android agent actually send on /screen?
 * Opens the standalone window for one device and records the first WebSocket
 * message types, binary headers and the canvas state.
 */
const { app, BrowserWindow, session } = require('electron')
const fs = require('fs')
const path = require('path')

const HOST = process.env.LAB_HOST || '192.168.0.175'
const PORT = process.env.LAB_PORT || '3001'
const BASE = `https://${HOST}:${PORT}`
const CREDS = process.env.LAB_CREDS || path.join(process.env.APPDATA || '', 'AiRemote', 'lab-credentials.txt')
const WANT = process.env.LAB_DEVICE || 'Android'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const say = (...a) => console.log('[probe]', ...a)

function creds() {
  const raw = fs.readFileSync(CREDS, 'utf8')
  const pick = (k) => { const m = raw.match(new RegExp('^\\s*' + k + '\\s*[:=]\\s*(.+)$', 'mi')); return m ? m[1].trim() : '' }
  return { email: pick('email'), password: pick('password') }
}

async function waitFor(fn, ms, label) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v } catch {} await sleep(250) }
  throw new Error('timeout: ' + label)
}

async function main() {
  session.defaultSession.setCertificateVerifyProc((req, cb) => cb(String(req.hostname || '').toLowerCase() === HOST ? 0 : -3))
  await session.defaultSession.clearStorageData({ storages: ['localstorage', 'sessionstorage', 'cookies'] })

  const win = new BrowserWindow({ width: 1300, height: 850, show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } })
  const wc = win.webContents
  let child = null
  const net = { sockets: [], texts: [], bins: [] }

  win.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 750 } }))
  win.webContents.on('did-create-window', (c) => {
    child = c
    const cc = c.webContents
    try { cc.debugger.attach('1.3') } catch {}
    cc.debugger.sendCommand('Network.enable').catch(() => {})
    cc.debugger.on('message', (_e, m, p) => {
      if (m === 'Network.webSocketCreated') net.sockets.push(String(p.url).replace(/ticket=[^&]+/, 'ticket=<redacted>'))
      if (m === 'Network.webSocketFrameReceived') {
        const r = p.response || {}
        try {
          const buf = Buffer.from(r.payloadData || '', 'base64')
          if (r.opcode === 2) {
            if (net.bins.length < 6) net.bins.push({ len: buf.length, w: buf.length >= 13 ? buf.readUInt32BE(0) : null, h: buf.length >= 13 ? buf.readUInt32BE(4) : null, flags: buf.length >= 13 ? buf[12] : null })
          } else if (net.texts.length < 10) {
            const s = buf.toString('utf8')
            let t = s.slice(0, 120)
            try { const j = JSON.parse(s); t = JSON.stringify({ type: j.type, keys: j.payload ? Object.keys(j.payload).slice(0, 8) : null, w: j.payload && j.payload.width, h: j.payload && j.payload.height, seq: j.payload && j.payload.seq, delta: !!(j.payload && j.payload.deltaRegion) }) } catch {}
            net.texts.push(t)
          }
        } catch {}
      }
    })
  })

  await win.loadURL(BASE)
  await waitFor(() => wc.executeJavaScript(`!!document.querySelector('.login-form input[type="email"]')`), 30000, 'login')
  const c = creds()
  await wc.executeJavaScript(`(() => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const e = document.querySelector('.login-form input[type="email"]'); const p = document.querySelector('.login-form input[type="password"]')
    set.call(e, ${JSON.stringify(c.email)}); e.dispatchEvent(new Event('input', { bubbles: true }))
    set.call(p, ${JSON.stringify(c.password)}); p.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('.login-submit').click(); return true
  })()`)
  await waitFor(() => wc.executeJavaScript(`!!document.querySelector('.cr-live-device-select')`), 30000, 'dashboard')
  await sleep(1200)

  const devices = await wc.executeJavaScript(`(() => { const s = document.querySelector('.cr-live-device-select'); return s ? Array.from(s.options).map(o => ({ id: o.value, name: o.textContent.trim() })) : [] })()`)
  const target = devices.find((d) => d.name.toLowerCase().includes(WANT.toLowerCase()))
  if (!target) throw new Error('device not found: ' + WANT)
  say('opening /view/' + target.id + ' for ' + target.name)

  await wc.executeJavaScript(`window.open('/view/' + ${JSON.stringify(target.id)}, 'probe-a', 'width=1100,height=750'); true`)
  await waitFor(() => child && !child.isDestroyed(), 15000, 'child')
  await sleep(12000)

  const dom = await child.webContents.executeJavaScript(`(() => {
    const cv = Array.from(document.querySelectorAll('canvas'))
    return { streaming: !!document.querySelector('.cr-live-preview.is-streaming'), text: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 200),
             canvases: cv.map(x => ({ w: x.width, h: x.height })) }
  })()`)

  console.log('RESULT ' + JSON.stringify({ device: target.name, dom, net }, null, 2))
}

app.whenReady().then(async () => {
  const stop = setTimeout(() => { console.log('RESULT {"timedOut":true}'); app.exit(2) }, 120000)
  try { await main(); clearTimeout(stop); app.exit(0) } catch (e) { clearTimeout(stop); console.log('RESULT ' + JSON.stringify({ error: String(e && e.message || e) })); app.exit(1) }
})
