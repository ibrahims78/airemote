#!/usr/bin/env node
'use strict'
/** probe-board.cjs — dump the live-card subtree (tag, class, box) to find what clips the tiles. */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const CREDS = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'
const BASE = process.argv[2] || 'http://127.0.0.1:5000'
const PORT = 9228
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: c.email, password: c.password }) }).then(r => r.json())
  if (!login.token) throw new Error('login failed')
  const profile = path.join(require('os').tmpdir(), 'probe-board-' + Date.now())
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
  const auth = JSON.stringify({ state: { token: login.token, user: login.user }, version: 0 })
  const ui = JSON.stringify({ state: { theme: 'light', lang: 'ar' }, version: 0 })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('airemote-auth',${JSON.stringify(auth)});localStorage.setItem('airemote-ui',${JSON.stringify(ui)});}catch(e){}` })
  await send('Page.navigate', { url: BASE + '/' })
  await sleep(8000)
  const expr = `(() => {
    const card = document.querySelector('.cr-live-card');
    if (!card) return 'no card';
    const rows = [];
    const walk = (el, depth) => {
      if (depth > 4 || rows.length > 26) return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      rows.push([depth, el.tagName.toLowerCase(), String(el.className).replace(/\\s+/g,' ').slice(0,52), Math.round(r.width), Math.round(r.height), cs.display, cs.gridTemplateColumns.slice(0,40), cs.aspectRatio, cs.overflow].join(' | '));
      for (const k of el.children) walk(k, depth + 1);
    };
    walk(card, 0);
    return rows.join('\\n');
  })()`
  const { result } = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
  console.log(result.result.value)
  ws.close(); chrome.kill(); await sleep(300); try { fs.rmSync(profile, { recursive: true, force: true }) } catch {}
})().catch(e => { console.error('PROBE FAILED: ' + e.message); process.exit(1) })
