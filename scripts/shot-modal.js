#!/usr/bin/env node
'use strict'
/**
 * R6.15 — لقطة لنافذة حوار: يفتح /devices ويضغط زراً بـaria-label ثم يلتقط الشاشة.
 *
 *   node scripts/shot-modal.js <aria-label> <out.png> [light|dark]
 *
 * المتطلبات: scripts/dev-server-temp.js على 3011 + scripts/dev-ui-serve.cjs على 4180،
 * وحساب مؤقت أُنشئ بـPOST /api/auth/setup (الافتراضي shot@local / ShotPassw0rd!).
 */
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')

const ROOT = path.resolve(__dirname, '..')
const API = process.env.SHOT_API || 'http://127.0.0.1:3011'
const ORIGIN = process.env.SHOT_ORIGIN || 'http://127.0.0.1:4180'
const EMAIL = process.env.SHOT_EMAIL || 'shot@local'
const PASS = process.env.SHOT_PASS || 'ShotPassw0rd!'

function loadWs () {
  const base = path.join(ROOT, 'node_modules', '.pnpm')
  for (const d of fs.readdirSync(base).filter(x => /^ws@/.test(x))) {
    try { return require(path.join(base, d, 'node_modules', 'ws')) } catch {}
  }
  return null
}
const WebSocket = loadWs()
if (!WebSocket) { console.error('ws not found'); process.exit(1) }

const label = process.argv[2]
const out = process.argv[3]
const theme = process.argv[4] === 'dark' ? 'dark' : 'light'
if (!label || !out) { console.error('usage: shot-modal <aria-label> <out.png> [light|dark]'); process.exit(2) }

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9335
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-modal-'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const getJson = p => new Promise((res, rej) => {
  http.get('http://127.0.0.1:' + PORT + p, r => { let b = ''; r.on('data', c => { b += c }); r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } }) }).on('error', rej)
})

;(async () => {
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir,
    '--window-size=1280,900', 'about:blank'
  ], { stdio: 'ignore' })

  let targets = null
  for (let i = 0; i < 40; i++) { try { targets = await getJson('/json/list'); if (targets && targets.length) break } catch {} await sleep(250) }
  if (!targets || !targets.length) { child.kill(); throw new Error('no CDP target') }
  const page = targets.find(t => t.type === 'page') || targets[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
  let seq = 0
  const pending = new Map()
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
  ws.on('message', raw => {
    const m = JSON.parse(raw.toString())
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) }
    else if (m.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || '').slice(0, 300))
  })
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params: params || {} }))
  })
  await send('Page.enable')
  await send('Runtime.enable')

  const r = await fetch(API + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS })
  })
  const j = await r.json().catch(() => ({}))
  if (!j.token) { console.log('LOGIN_FAILED', r.status); process.exit(1) }

  await send('Page.navigate', { url: ORIGIN + '/login' })
  await sleep(1200)
  const auth = JSON.stringify({ state: { token: j.token, refreshToken: null, user: { id: '', email: EMAIL, name: 'Admin', role: 'admin' } }, version: 0 })
  const ui = JSON.stringify({ state: { theme, lang: 'ar', sidebarOpen: true }, version: 0 })
  await send('Runtime.evaluate', { expression: `localStorage.setItem('airemote-auth', ${JSON.stringify(auth)}); localStorage.setItem('airemote-ui', ${JSON.stringify(ui)}); 'ok'` })

  await send('Page.navigate', { url: ORIGIN + '/devices' })
  //الحزمة تحتاج ≥9s للخروج من شاشة الإقلاع؛ 12s أأمن.
  await sleep(12000)

  const click = await send('Runtime.evaluate', {
    expression: `(() => { const b = document.querySelector('button[aria-label=${JSON.stringify(label)}]'); if (!b) return 'NOT_FOUND'; b.click(); return 'CLICKED' })()`,
    returnByValue: true
  })
  console.log('CLICK', click.result && click.result.value)
  await sleep(1200)
  const txt = await send('Runtime.evaluate', { expression: 'document.body.innerText.slice(0,200)', returnByValue: true })
  console.log('BODY', JSON.stringify(txt.result && txt.result.value).slice(0, 260))

  fs.mkdirSync(path.dirname(out), { recursive: true })
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('SHOT', out, fs.statSync(out).size)
  ws.close(); child.kill(); process.exit(0)
})().catch(e => { console.log('MODAL_ERROR', e.message); process.exit(1) })
