// R8.3 evidence — live CSV export + the sessions UI + the viewer watermark.
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const lab = require('./lab.cjs')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = 'https://127.0.0.1:3001'
const PORT = 9227
const OUTDIR = 'D:\\autoclaw projects-new\\AiRemote\\outputs\\verify-2026-10-31\\r8-sessions'
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true })
  const token = await lab.getToken()
  const auth = { Authorization: 'Bearer ' + token }
  // The watermark shows the signed-in identity, so the seeded session must carry
  // the same user object the login route returns.
  const creds = JSON.parse(fs.readFileSync('C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json', 'utf8'))
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password })
  }).then(r => r.json())
  const user = login.user || null
  const devId = await lab.deviceId('WIN11-VM')

  // ── 1) live API: export + filters ───────────────────────────────────────
  const csvRes = await fetch(BASE + '/api/sessions/export', { headers: auth })
  const csvBuf = Buffer.from(await csvRes.arrayBuffer())
  fs.writeFileSync(path.join(OUTDIR, 'sessions-export.csv'), csvBuf)
  const csvText = csvBuf.toString('utf8').replace(/^\uFEFF/, '')
  const csvLines = csvText.split('\r\n').filter(Boolean)
  const api = {
    exportStatus: csvRes.status,
    contentType: csvRes.headers.get('content-type'),
    disposition: csvRes.headers.get('content-disposition'),
    bom: csvBuf[0] === 0xEF && csvBuf[1] === 0xBB && csvBuf[2] === 0xBF,
    rows: csvLines.length - 1,
    header: csvLines[0],
    firstRow: csvLines[1] || null
  }

  const q1 = await fetch(BASE + '/api/sessions?q=WIN11&limit=5', { headers: auth }).then(r => r.json())
  const q2 = await fetch(BASE + '/api/sessions?status=active&limit=5', { headers: auth }).then(r => r.json())
  const q3 = await fetch(BASE + '/api/sessions?type=screen&limit=5', { headers: auth }).then(r => r.json())
  const counts = { qWin11: q1.length, active: q2.length, screen: q3.length }

  // ── 2) UI ───────────────────────────────────────────────────────────────
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(process.env.TEMP || '.', 'cdp-r8-sess'),
    '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
  let target = null
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250)
    try { target = (await fetch('http://127.0.0.1:' + PORT + '/json/list').then(r => r.json())).find(t => t.type === 'page') } catch {}
  }
  if (!target) { chrome.kill(); throw new Error('no CDP target') }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null }
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(path.join(OUTDIR, name), Buffer.from(s.result.data, 'base64'))
  }

  const seed = `try{
    localStorage.setItem('airemote-auth', ${JSON.stringify(JSON.stringify({ state: { token, user, refreshToken: login.refreshToken || null }, version: 0 }))});
    localStorage.setItem('airemote-ui', ${JSON.stringify(JSON.stringify({ state: { theme: 'dark', lang: 'ar' }, version: 0 }))});
  }catch(e){}`
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: seed })

  await send('Page.navigate', { url: BASE + '/sessions' })
  await sleep(7000)
  const typed = await ev(`(() => {
    const input = [...document.querySelectorAll('input')].find(i => /ابحث|Search/.test(i.placeholder || ''))
    if (!input) return 'no-input'
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, 'WIN11')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return input.value
  })()`)
  await sleep(2500)
  const rowsAfter = await ev(`document.querySelectorAll('tbody tr').length`)
  await shot('ui-sessions.png')

  await send('Page.navigate', { url: BASE + '/devices/' + devId + '?tab=screen' })
  await sleep(10000)
  const started = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/بدء مشاركة الشاشة/.test(x.textContent||'')); if(b){b.click(); return 'started'} return 'no-start' })()`)
  await sleep(8000)
  const wm = await ev(`(() => {
    const el = [...document.querySelectorAll('div')].find(d => d.dir === 'ltr' && /bg-canvas\/55/.test(d.className || ''))
    return el ? { text: el.textContent, cls: el.className } : null
  })()`)
  await shot('ui-watermark.png')

  await send('Page.navigate', { url: BASE + '/sessions' })
  await sleep(4000)

  const out = { at: new Date().toISOString(), api, counts, ui: { typed, rowsAfter, started, watermark: wm } }
  fs.writeFileSync(path.join(OUTDIR, 'evidence.json'), JSON.stringify(out, null, 2), 'utf8')
  console.log(JSON.stringify(out, null, 2))

  ws.close(); chrome.kill(); process.exit(0)
})().catch(e => { console.error('SESSIONS EVIDENCE FAILED:', e.message); process.exit(1) })
