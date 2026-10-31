const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const lab = require('./lab.cjs')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = 'https://127.0.0.1:3001'
const PORT = 9226
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const token = await lab.getToken()
  const devId = await lab.deviceId('WIN11-VM')
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(process.env.TEMP || '.', 'cdp-anno-probe'),
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
    localStorage.setItem('airemote-auth', ${JSON.stringify(JSON.stringify({ state: { token, user: null, refreshToken: null }, version: 0 }))});
    localStorage.setItem('airemote-ui', ${JSON.stringify(JSON.stringify({ state: { theme: 'dark', lang: 'ar' }, version: 0 }))});
  }catch(e){}`
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: seed })
  await send('Page.navigate', { url: BASE + '/devices/' + devId + '?tab=screen' })
  await sleep(10000)
  await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/بدء مشاركة الشاشة/.test(x.textContent||'')); if(b) b.click(); return !!b })()`)
  await sleep(8000)
  const info = await ev(`(() => {
    const c = document.querySelector('canvas')
    const svg = document.querySelector('svg[viewBox="0 0 1 1"]')
    const wrap = svg && svg.parentElement
    const r = (el) => el ? (() => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } })() : null
    return {
      canvas: r(c), canvasAttr: c ? { w: c.width, h: c.height } : null, canvasStyle: c ? c.getAttribute('style') : null,
      wrap: r(wrap), wrapClass: wrap ? wrap.className : null,
      svg: r(svg),
      area: r(document.querySelector('canvas') && document.querySelector('canvas').closest('div.flex-1'))
    }
  })()`)
  console.log(JSON.stringify(info, null, 2))
  ws.close(); chrome.kill(); process.exit(0)
})().catch(e => { console.error('FAILED', e.message); process.exit(1) })
