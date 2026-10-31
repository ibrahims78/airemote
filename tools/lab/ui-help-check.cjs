const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const lab = require('./lab.cjs')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = 'https://127.0.0.1:3001'
const PORT = 9228
const OUTDIR = 'D:\\autoclaw projects-new\\AiRemote\\outputs\\verify-2026-10-31\\r8-docs'
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true })
  const token = await lab.getToken()
  const creds = JSON.parse(fs.readFileSync('C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json', 'utf8'))
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password })
  }).then(r => r.json())

  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,1000',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(process.env.TEMP || '.', 'cdp-r8-docs'),
    '--no-first-run', 'about:blank'], { stdio: 'ignore' })
  let target = null
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250)
    try { target = (await fetch('http://127.0.0.1:' + PORT + '/json/list').then(r => r.json())).find(t => t.type === 'page') } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0; const pending = new Map()
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null }

  const seed = `try{
    localStorage.setItem('airemote-auth', ${JSON.stringify(JSON.stringify({ state: { token, user: login.user || null, refreshToken: login.refreshToken || null }, version: 0 }))});
    localStorage.setItem('airemote-ui', ${JSON.stringify(JSON.stringify({ state: { theme: 'dark', lang: 'ar' }, version: 0 }))});
  }catch(e){}`
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: seed })
  await send('Page.navigate', { url: BASE + '/help' })
  await sleep(8000)

  const sections = await ev(`[...document.querySelectorAll('h2,h3')].map(h => h.textContent.trim()).filter(Boolean).slice(-8)`)
  const hasShortcuts = await ev(`document.body.innerText.includes('الاختصارات')`)
  const hasAndroid = await ev(`document.body.innerText.includes('حدود أندرويد')`)
  const rows = await ev(`(() => {
    const t = [...document.querySelectorAll('table')].find(x => /Ctrl\\+K/.test(x.textContent || ''))
    return t ? t.querySelectorAll('tr').length : 0
  })()`)

  // jump to the shortcuts section if the page links sections
  await ev(`(() => {
    const el = [...document.querySelectorAll('a,button')].find(x => /الاختصارات/.test(x.textContent || ''))
    if (el) { el.click(); return true }
    return false
  })()`)
  await sleep(1200)
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(path.join(OUTDIR, 'ui-help-shortcuts.png'), Buffer.from(shot.result.data, 'base64'))

  const out = { at: new Date().toISOString(), hasShortcuts, hasAndroid, tableRows: rows, lastHeadings: sections }
  fs.writeFileSync(path.join(OUTDIR, 'help-check.json'), JSON.stringify(out, null, 2), 'utf8')
  console.log(JSON.stringify(out, null, 2))
  ws.close(); chrome.kill(); process.exit(0)
})().catch(e => { console.error('HELP CHECK FAILED:', e.message); process.exit(1) })
