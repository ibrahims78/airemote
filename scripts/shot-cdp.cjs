#!/usr/bin/env node
'use strict'
/**
 * Screenshot the real installed dashboard through the Chrome DevTools Protocol.
 * A bootstrap script is installed *before* any page script runs, so the app boots
 * already signed in with the requested theme. No credentials are ever printed.
 */
const { spawn } = require('child_process')
const fs = require('fs')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = 'https://127.0.0.1:3001'
const CREDS = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'
const PORT = 9223

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function cdp(wsUrl, calls) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  for (const c of calls) await c(send)
  ws.close()
}

;(async () => {
  const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password })
  }).then(r => r.json())
  if (!login.token) throw new Error('login failed')

  const theme = process.argv[2] || 'dark'
  const out = process.argv[3]
  const deviceId = process.argv[4]
  if (!out || !deviceId) throw new Error('usage: shot-cdp <dark|light> <out.png> <deviceId>')

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + process.env.TEMP + '\\cdp-' + theme,
    '--no-first-run', '--no-default-browser-check', 'about:blank'
  ], { stdio: 'ignore' })

  let target = null
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250)
    try {
      const list = await fetch('http://127.0.0.1:' + PORT + '/json/list').then(r => r.json())
      target = list.find(t => t.type === 'page')
    } catch {}
  }
  if (!target) { chrome.kill(); throw new Error('no CDP target') }

  const seed = `try{
    localStorage.setItem('airemote-auth', ${JSON.stringify(JSON.stringify({ state: { token: login.token, user: login.user, refreshToken: login.refreshToken || null }, version: 0 }))});
    localStorage.setItem('airemote-ui', ${JSON.stringify(JSON.stringify({ state: { theme: theme === 'light' ? 'light' : 'dark', lang: 'ar' }, version: 0 }))});
  }catch(e){}`

  const url = BASE + '/devices/' + deviceId + '?tab=monitor'

  await cdp(target.webSocketDebuggerUrl, [
    (send) => send('Page.enable'),
    (send) => send('Runtime.enable'),
    (send) => send('Page.addScriptToEvaluateOnNewDocument', { source: seed }),
    (send) => send('Page.navigate', { url }),
    () => sleep(12000),
    async (send) => {
      const r = await send('Runtime.evaluate', { expression: 'document.querySelectorAll(".recharts-wrapper svg").length' })
      console.log('charts=' + (r.result && r.result.result && r.result.result.value))
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
      console.log('WROTE ' + out)
    }
  ])

  chrome.kill()
  process.exit(0)
})().catch(e => { console.error('SHOT FAILED:', e.message); process.exit(1) })
