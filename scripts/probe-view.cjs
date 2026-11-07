'use strict'
/**
 * probe-view.cjs — open /view/<deviceId> in the real dashboard and measure a live stream.
 * Collects console errors + page exceptions, samples every canvas for non-blank pixels,
 * and screenshots the window. Evidence for the ScreenPopout live-session item.
 *
 * Usage: node probe-view.cjs <deviceId> <out.json> [--base http://127.0.0.1:5000] [--wait 9000]
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9429
const argOf = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null }
const BASE = argOf('base') || 'http://127.0.0.1:5000'
const WAIT = Number(argOf('wait') || 9000)
const deviceId = process.argv[2]
const outFile = path.resolve(process.argv[3] || 'view.json')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function cdp (wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const events = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
    if (m.method) events.push(m)
  }
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  return { ready, send, events, close: () => ws.close() }
}

const SAMPLE_JS = `(() => {
  const cs = [...document.querySelectorAll('canvas')]
  const sample = (x) => {
    try {
      const g = x.getContext('2d'); if (!g) return 'nog'
      const w = Math.min(96, x.width), h = Math.min(96, x.height)
      if (!w || !h) return 'empty'
      const ox = Math.max(0, Math.floor((x.width - w) / 2)), oy = Math.max(0, Math.floor((x.height - h) / 2))
      const d = g.getImageData(ox, oy, w, h).data
      let nz = 0, sum = 0
      for (let i = 0; i < d.length; i += 4) { if (d[i] | d[i + 1] | d[i + 2]) nz++; sum += d[i] + d[i + 1] + d[i + 2] }
      return nz + '/' + (d.length / 4) + ':' + (sum % 100000)
    } catch (e) { return 'ERR:' + (e.message || e) }
  }
  const status = document.body.innerText.match(/[^\\n]*(?:بث|متصل|جارٍ|streaming|connecting)[^\\n]*/i)
  return { n: cs.length, dims: cs.map(x => x.width + 'x' + x.height), samples: cs.map(sample), status: status ? status[0].slice(0, 60) : '' }
})()`

;(async () => {
  const creds = fs.readFileSync(path.join(os.tmpdir(), 'airemote-lab-probe.txt'), 'utf8').split(/\r?\n/).filter(Boolean).reduce((o, line, i) => { if (i === 0) o.email = line.trim(); if (i === 1) o.password = line.trim(); return o }, {})
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) }).then(r => r.json())
  if (!login.token) { console.error('login failed'); process.exit(2) }

  const userDir = path.join(os.tmpdir(), 'airemote-view-' + Date.now())
  const chrome = spawn(CHROME, [
    ...(process.argv.includes('--headed') ? [] : ['--headless=new', '--disable-gpu']),
    '--hide-scrollbars', '--window-size=1440,1000',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir,
    '--no-first-run', '--no-default-browser-check', '--ignore-certificate-errors', 'about:blank'
  ], { stdio: 'ignore' })

  let target = null
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(300)
    try { target = (await fetch('http://127.0.0.1:' + PORT + '/json/list').then(r => r.json())).find(t => t.type === 'page') } catch {}
  }
  if (!target) { chrome.kill(); console.error('no CDP target'); process.exit(2) }

  const c = cdp(target.webSocketDebuggerUrl)
  await c.ready
  await c.send('Runtime.enable')
  await c.send('Log.enable')
  await c.send('Page.enable')
  const pauseSites = []
  if (process.argv.includes('--pause')) {
    await c.send('Debugger.enable')
    await c.send('Debugger.setPauseOnExceptions', { state: 'unhandled' })
    const pump = setInterval(async () => {
      const ev = c.events.find(e => e.method === 'Debugger.paused' && !e.__done)
      if (!ev) return
      ev.__done = true
      const frames = (ev.params.callFrames || []).slice(0, 6).map(f => (f.functionName || '?') + ' ' + (f.url || '').split('/').pop() + ':' + f.location.lineNumber)
      pauseSites.push(frames)
      try { await c.send('Debugger.resume') } catch {}
    }, 250)
    setTimeout(() => clearInterval(pump), 30000)
  }
  try { await c.send('Browser.grantPermissions', { origin: BASE, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }) } catch {}
  try { await c.send('Browser.setPermission', { origin: BASE, permission: { name: 'clipboard-read' }, setting: 'granted' }) } catch {}
  try { await c.send('Browser.setPermission', { origin: BASE, permission: { name: 'clipboard-write' }, setting: 'granted' }) } catch {}

  const authState = JSON.stringify({ state: { token: login.token, user: login.user, refreshToken: login.refreshToken || null }, version: 0 })
  const wsHook = `try{
    window.__wsMsg = 0; window.__wsBytes = 0; window.__wsUrls = []
    const OW = window.WebSocket
    function WS(u, p) { const ws = p === undefined ? new OW(u) : new OW(u, p); window.__wsUrls.push(String(u)); ws.addEventListener('message', (e) => { window.__wsMsg++; const d = e.data; window.__wsBytes += (d && (d.size || d.byteLength || d.length)) || 0 }); return ws }
    WS.prototype = OW.prototype; WS.OPEN = OW.OPEN; WS.CONNECTING = OW.CONNECTING; WS.CLOSING = OW.CLOSING; WS.CLOSED = OW.CLOSED
    window.WebSocket = WS
    window.__rej = []
    window.addEventListener('unhandledrejection', (e) => { const r = e.reason || {}; window.__rej.push({ msg: String(r && r.message || r), stack: String(r && r.stack || '').slice(0, 500) }) })
  }catch(e){}`
  const seed = `try{localStorage.setItem('airemote-auth', ${JSON.stringify(authState)})}catch(e){}
${wsHook}`
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: seed })
  await c.send('Page.navigate', { url: BASE + '/view/' + deviceId })
  await sleep(WAIT)

  const evalJson = async (expr) => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.result && r.result.exceptionDetails) return { __error: r.result.exceptionDetails.text }
    return r.result && r.result.result ? r.result.result.value : null
  }

  const samples = []
  let wsCounters = []
  for (let i = 0; i < 10; i++) {
    const s = await evalJson(SAMPLE_JS)
    const ws = await evalJson('({ m: window.__wsMsg, b: window.__wsBytes })')
    samples.push(s)
    wsCounters.push(ws)
    await sleep(500)
  }

  // optional: move the pointer across the canvas so the guest cursor moves and frames must change
  const motion = []
  if (process.argv.includes('--move')) {
    const rect = await evalJson(`(() => { const c = document.querySelector('canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })()`)
    if (rect && rect.w > 20) {
      const pts = [0.25, 0.4, 0.55, 0.7, 0.45, 0.3]
      for (const p of pts) {
        const x = rect.x + Math.round(rect.w * p)
        const y = rect.y + Math.round(rect.h * 0.5)
        await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
        await sleep(450)
        motion.push(await evalJson(SAMPLE_JS))
      }
    }
  }

  const shot = await c.send('Page.captureScreenshot', { format: 'png' })
  if (shot.result && shot.result.data) fs.writeFileSync(outFile.replace(/\.json$/, '.png'), Buffer.from(shot.result.data, 'base64'))

  const exceptions = c.events.filter(e => e.method === 'Runtime.exceptionThrown')
  const consoleErrors = c.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
  const summary = {
    url: BASE + '/view/' + deviceId,
    wsCounters,
    wsFramesFlowing: wsCounters.length > 1 && wsCounters[wsCounters.length - 1].m > wsCounters[0].m,
    samples,
    motion,
    motionChanged: motion.length > 1 && JSON.stringify(motion[0]) !== JSON.stringify(motion[motion.length - 1]),
    wsAfterMove: await evalJson('({ m: window.__wsMsg, b: window.__wsBytes })'),
    changing: samples.length > 1 && JSON.stringify(samples[0]) !== JSON.stringify(samples[samples.length - 1]),
    exceptions: exceptions.map(e => ({ text: e.params.exceptionDetails.text, desc: (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description || '').slice(0, 600), at: (e.params.exceptionDetails.stackTrace && e.params.exceptionDetails.stackTrace.callFrames || []).slice(0, 4).map(f => f.functionName + ' ' + (f.url || '').split('/').pop() + ':' + f.lineNumber) })),
    rejections: (await evalJson('window.__rej || []')) || [],
    pauseSites,
    consoleErrors: consoleErrors.map(e => (e.params.args || []).map(a => (a.value != null ? String(a.value) : a.description || a.type).slice(0, 160)).join(' ')).slice(0, 20),
    consoleErrorCount: consoleErrors.length
  }
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2), 'utf8')
  console.log(JSON.stringify({ canvas: samples[samples.length - 1] && samples[samples.length - 1].n, last: (samples[samples.length - 1] || {}).samples, first: (samples[0] || {}).samples, changing: summary.changing, wsMsg: wsCounters[wsCounters.length - 1] && wsCounters[wsCounters.length - 1].m, wsFramesFlowing: summary.wsFramesFlowing, exceptions: summary.exceptions.length, consoleErrors: summary.consoleErrorCount }))

  c.close(); chrome.kill(); await sleep(300)
  try { fs.rmSync(userDir, { recursive: true, force: true }) } catch {}
})().catch(e => { console.error('PROBE FAILED: ' + (e && e.stack || e.message || e)); process.exit(1) })
