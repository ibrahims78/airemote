#!/usr/bin/env node
'use strict'
/**
 * shot-dashboard.cjs — log into the dashboard like a user and photograph a route.
 *
 * Usage: node tools/lab/session/shot-dashboard.cjs <out.png> [route] [--fail-api <substring>] [--delay-api <substring>]
 *   --fail-api   make matching /api requests fail (drives the error state)
 *   --delay-api  hold matching /api requests for 6s, capture while pending (drives loading)
 */
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9411
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const out = path.resolve(process.argv[2] || 'shot.png')
const route = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '/'
const argOf = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null }
const failApi = argOf('fail-api')
const delayApi = argOf('delay-api')

const creds = fs.readFileSync(path.join(os.tmpdir(), 'airemote-lab-probe.txt'), 'utf8').split(/\r?\n/)
const EMAIL = creds[0].trim()
const PASS = creds[1].trim()

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

;(async () => {
  const userDir = path.join(os.tmpdir(), 'airemote-shot-' + Date.now())
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--ignore-certificate-errors',
    '--window-size=1440,1000', '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir,
    '--no-first-run', '--no-default-browser-check', 'about:blank'
  ], { stdio: 'ignore' })

  let target = null
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(300)
    try { const list = await fetch('http://127.0.0.1:' + PORT + '/json/list').then(r => r.json()); target = list.find(t => t.type === 'page') } catch {}
  }
  if (!target) { chrome.kill(); console.error('no CDP target'); process.exit(1) }

  const c = cdp(target.webSocketDebuggerUrl)
  await c.ready
  await c.send('Runtime.enable')
  await c.send('Page.enable')

  const evalJs = async (expr) => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.result && r.result.exceptionDetails) return { __error: r.result.exceptionDetails.text }
    return r.result && r.result.result ? r.result.result.value : null
  }

  // optional fault injection for the state shots
  if (failApi || delayApi) {
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] })
    c.events.push({ method: '__fetchOn' })
    const handle = async () => {
      const reqs = c.events.filter(e => e.method === 'Fetch.requestPaused')
      for (const e of reqs) {
        if (e.__done) continue
        e.__done = true
        const url = e.params.request.url
        if (failApi && url.includes(failApi)) { await c.send('Fetch.failRequest', { requestId: e.params.requestId, errorReason: 'Failed' }); continue }
        if (delayApi && url.includes(delayApi)) { await sleep(6000) }
        await c.send('Fetch.continueRequest', { requestId: e.params.requestId })
      }
    }
    setInterval(handle, 250)
  }

  await c.send('Page.navigate', { url: 'https://127.0.0.1:3001/login' })
  await sleep(2500)
  await evalJs(`(() => {
    const set = (el, v) => {
      const proto = Object.getPrototypeOf(el)
      const desc = Object.getOwnPropertyDescriptor(proto, 'value')
      if (desc && desc.set) desc.set.call(el, v); else el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const email = document.querySelector('input[type=email], input[name=email], #email')
    const pw = document.querySelector('input[type=password], input[name=password], #password')
    if (!email || !pw) return 'NO_FORM'
    set(email, ${JSON.stringify(EMAIL)})
    set(pw, ${JSON.stringify(PASS)})
    const form = email.closest('form')
    const btn = (form && form.querySelector('button[type=submit]')) || document.querySelector('button[type=submit]')
    if (btn) { btn.click(); return 'SUBMITTED' }
    if (form) { form.requestSubmit(); return 'SUBMITTED_FORM' }
    return 'NO_BUTTON'
  })()`)
  await sleep(4000)

  const where = await evalJs('location.pathname')
  await c.send('Page.navigate', { url: 'https://127.0.0.1:3001' + route })
  await sleep(failApi || delayApi ? 1500 : 3000)

  const shot = await c.send('Page.captureScreenshot', { format: 'png' })
  if (shot.result && shot.result.data) fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))

  const errors = c.events.filter(e => e.method === 'Runtime.exceptionThrown').length
  console.log(JSON.stringify({ route, landedAfterLogin: where, errors, out: path.basename(out) }))

  c.close(); try { chrome.kill() } catch {}
  await sleep(300)
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
