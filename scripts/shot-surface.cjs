#!/usr/bin/env node
'use strict'
/**
 * shot-surface.cjs — screenshot one dashboard route at an exact reference size.
 * Auth is seeded from the lab probe file; nothing secret is printed.
 *
 * Usage:
 *   node scripts/shot-surface.cjs --route / --width 1700 --height 980 --scale 2 \
 *        --theme light --out out.png [--base http://127.0.0.1:5000] [--wait 8000]
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const args = {}
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]

const BASE = args.base || 'http://127.0.0.1:5000'
const ROUTE = args.route || '/'
const W = Number(args.width || 1700)
const H = Number(args.height || 980)
const SCALE = Number(args.scale || 2)
const THEME = args.theme || 'light'
const LANG = args.lang || 'ar'
const WAIT = Number(args.wait || 7000)
const OUT = args.out || path.resolve(__dirname, '..', 'outputs', 'surface.png')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const CREDS = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'
const PORT = 9226
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const creds = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password })
  }).then(r => r.json())
  if (!login.token) throw new Error('login failed')

  const profile = path.join(require('os').tmpdir(), 'airemote-surface-' + Date.now())
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=' + SCALE,
    '--window-size=' + W + ',' + H,
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--ignore-certificate-errors', 'about:blank'
  ], { stdio: 'ignore' })

  let target = null
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250)
    try { target = (await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json())).find(t => t.type === 'page') } catch {}
  }
  if (!target) { chrome.kill(); throw new Error('no CDP target') }

  const authState = JSON.stringify({ state: { token: login.token, user: login.user, refreshToken: login.refreshToken || null }, version: 0 })
  const uiState = JSON.stringify({ state: { theme: THEME, lang: LANG }, version: 0 })
  const seed = `try{
    localStorage.setItem('airemote-auth', ${JSON.stringify(authState)});
    localStorage.setItem('airemote-ui', ${JSON.stringify(uiState)});
  }catch(e){}`

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: seed })
  await send('Page.navigate', { url: BASE + ROUTE })
  await sleep(WAIT)

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'))
  const { result: { result: meta } } = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, title: document.title, route: location.pathname, arabic: ((document.body.innerText||"").match(/[\\u0600-\\u06FF]/g)||[]).length })',
    returnByValue: true
  })
  console.log('WROTE ' + OUT)
  console.log('META  ' + meta.value)

  ws.close()
  chrome.kill()
  await sleep(300)
  try { fs.rmSync(profile, { recursive: true, force: true }) } catch {}
})().catch(e => { console.error('SHOT FAILED: ' + e.message); process.exit(1) })
