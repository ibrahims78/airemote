#!/usr/bin/env node
'use strict'
/**
 * R6 — لقطات شاشة موثوقة عبر Edge headless + CDP (بلا تثبيت أي حزمة).
 *
 *   node _stage/ui-shot.cjs <url> <out.png> [--theme=light|dark] [--size=1280x900] [--token=JWT] [--uid=..] [--wait=1800]
 *
 * يحتاج سيرفراً يعمل على origin الـURL. يستخدم localStorage 'airemote-auth'
 * (نفس مفتاح zustand persist) و'airemote-ui' للسِمة.
 */
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const crypto = require('crypto')

function loadWs () {
  const ROOT = path.resolve(__dirname, '..')
  const base = path.join(ROOT, 'node_modules', '.pnpm')
  for (const d of fs.readdirSync(base).filter(x => /^ws@/.test(x))) {
    try { return require(path.join(base, d, 'node_modules', 'ws')) } catch {}
  }
  return null
}
const WebSocket = loadWs()
if (!WebSocket) { console.error('ws not found'); process.exit(1) }

const args = process.argv.slice(2)
const url = args[0]
const out = args[1]
if (!url || !out) { console.error('usage: ui-shot <url> <out.png> [--theme=light] [--size=1280x900] [--token=..]'); process.exit(2) }
const opt = Object.fromEntries(args.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? '1' : v] }))
const theme = opt.theme === 'dark' ? 'dark' : 'light'
const [w, h] = String(opt.size || '1280x900').split('x').map(Number)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9333
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-shot-'))

const getJson = (p) => new Promise((resolve, reject) => {
  http.get('http://127.0.0.1:' + PORT + p, res => {
    let b = ''
    res.on('data', c => { b += c })
    res.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(e) } })
  }).on('error', reject)
})
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir,
    '--window-size=' + w + ',' + h, 'about:blank'
  ], { stdio: 'ignore' })

  let targets = null
  for (let i = 0; i < 40; i++) {
    try { targets = await getJson('/json/list'); if (targets && targets.length) break } catch {}
    await sleep(250)
  }
  if (!targets || !targets.length) { child.kill(); throw new Error('no CDP target') }
  const page = targets.find(t => t.type === 'page') || targets[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
  let seq = 0
  const pending = new Map()
  const events = []
  ws.on('message', raw => {
    const m = JSON.parse(raw.toString())
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) }
    else if (m.method) events.push(m.method)
  })
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params: params || {} }))
  })

  await send('Page.enable')
  await send('Runtime.enable')
  const origin = new URL(url).origin

  // 1) login page first, so localStorage has the right origin
  await send('Page.navigate', { url: origin + '/login' })
  await sleep(1200)

  const auth = JSON.stringify({
    state: { token: opt.token || null, refreshToken: null, user: { id: opt.uid || '', email: 'admin@test.local', name: 'Admin', role: 'admin' } },
    version: 0
  })
  const ui = JSON.stringify({ state: { theme, lang: 'ar', sidebarOpen: true }, version: 0 })
  await send('Runtime.evaluate', { expression: `localStorage.setItem('airemote-auth', ${JSON.stringify(auth)}); localStorage.setItem('airemote-ui', ${JSON.stringify(ui)}); 'ok'` })

  // 2) target page
  await send('Page.navigate', { url })
  await sleep(Number(opt.wait || 1800))
  if (opt.eval) { try { await send('Runtime.evaluate', { expression: opt.eval, awaitPromise: true }) } catch {} await sleep(600) }

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('SHOT ' + out + ' (' + fs.statSync(out).size + ' bytes)')

  ws.close()
  try { child.kill() } catch {}
  setTimeout(() => process.exit(0), 300)
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })
