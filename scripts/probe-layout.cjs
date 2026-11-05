#!/usr/bin/env node
'use strict'
/**
 * probe-layout.cjs — what actually constrains the control-room wall?
 * Prints getBoundingClientRect + the layout-relevant computed styles for the
 * page/layout/main/card/tile containers. No screenshots, no guessing.
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const CREDS = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'
const BASE = process.argv[2] || 'http://127.0.0.1:5000'
const PORT = 9227
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: c.email, password: c.password }) }).then(r => r.json())
  if (!login.token) throw new Error('login failed')

  const profile = path.join(require('os').tmpdir(), 'probe-' + Date.now())
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1700,980', '--force-device-scale-factor=1', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
  let target = null
  for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json())).find(t => t.type === 'page') } catch {} }
  if (!target) throw new Error('no target')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let id = 0; const pending = new Map()
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })

  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('airemote-auth',${JSON.stringify(JSON.stringify({ state: { token: login.token, user: login.user }, version: 0 }))});localStorage.setItem('airemote-ui',${JSON.stringify(JSON.stringify({ state: { theme: 'light', lang: 'ar' }, version: 0 }))});}catch(e){}` })
  await send('Page.navigate', { url: BASE + '/' })
  await sleep(8000)

  const expr = `(() => {
    const sels = ['.cr-page', '.cr-overview-head', '.cr-metrics', '.cr-layout', '.cr-main', '.cr-live-card', '.cr-ai', '.cr-live-board', '.cr-tile']
    const out = []
    for (const s of sels) {
      const el = document.querySelector(s)
      if (!el) { out.push({ sel: s, missing: true }); continue }
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      out.push({ sel: s, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        display: cs.display, cols: cs.gridTemplateColumns, maxW: cs.maxWidth, width: cs.width,
        flexDir: cs.flexDirection, position: cs.position })
    }
    const kids = Array.from(document.querySelector('.cr-layout')?.children || []).map(el => ({ cls: el.className, w: Math.round(el.getBoundingClientRect().width), x: Math.round(el.getBoundingClientRect().x) }))
    return JSON.stringify({ viewport: innerWidth, out, kids }, null, 1)
  })()`
  const { result } = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
  console.log(result.result.value)
  ws.close(); chrome.kill(); await sleep(300); try { fs.rmSync(profile, { recursive: true, force: true }) } catch {}
})().catch(e => { console.error('PROBE FAILED: ' + e.message); process.exit(1) })
