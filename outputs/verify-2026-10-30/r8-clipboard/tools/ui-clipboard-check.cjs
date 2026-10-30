// R8.1 UI check — drive the real installed dashboard over CDP: open the clipboard
// panel, enable sync, press the reverse chord, and prove the UI follows the server.
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const lab = require('./lab.cjs')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = 'https://127.0.0.1:3001'
const PORT = 9224
const OUTDIR = 'D:\\autoclaw projects-new\\AiRemote\\outputs\\verify-2026-10-30\\r8-clipboard'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function cdp(wsUrl, fn) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  try { return await fn(send) } finally { ws.close() }
}

;(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true })
  const token = await lab.getToken()
  const devId = await lab.deviceId('WIN11-VM')

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(process.env.TEMP || '.', 'cdp-r8-clip'),
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
    localStorage.setItem('airemote-auth', ${JSON.stringify(JSON.stringify({ state: { token, user: null, refreshToken: null }, version: 0 }))});
    localStorage.setItem('airemote-ui', ${JSON.stringify(JSON.stringify({ state: { theme: 'dark', lang: 'ar' }, version: 0 }))});
  }catch(e){}`

  const result = { steps: [] }
  await cdp(target.webSocketDebuggerUrl, async (send) => {
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', { source: seed })
    await send('Page.navigate', { url: BASE + '/devices/' + devId + '?tab=screen' })
    await sleep(12000)

    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      return r.result && r.result.result ? r.result.result.value : null
    }

    const started = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /بدء مشاركة الشاشة|Start screen sharing/.test(b.textContent || ''))
      if (!btn) return 'no-start'
      btn.click(); return 'started'
    })()`)
    result.steps.push({ name: 'start screen sharing', value: started })
    await sleep(7000)

    const opened = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /Clipboard sync|مزامنة الحافظة/.test(b.getAttribute('title') || ''))
      if (!btn) return 'no-button'
      btn.click(); return 'clicked'
    })()`)
    result.steps.push({ name: 'open clipboard panel', value: opened })
    if (opened !== 'clicked') {
      const bodyText = await evaluate('document.body.innerText.slice(0, 800)')
      const shot0 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      fs.writeFileSync(path.join(OUTDIR, 'ui-debug.png'), Buffer.from(shot0.result.data, 'base64'))
      console.log('BODY: ' + JSON.stringify(bodyText))
      const titles = await evaluate("[...document.querySelectorAll('button')].map(b => b.getAttribute('title')).filter(Boolean).slice(0,40)")
      console.log('TITLES: ' + JSON.stringify(titles))
    }
    await sleep(1200)

    const panelText = await evaluate(`(() => {
      const ta = document.querySelector('textarea[placeholder*="الحافظة"], textarea[placeholder*="lipboard"]')
      if (!ta) return null
      const panel = ta.closest('div.absolute') || ta.parentElement
      return panel.innerText
    })()`)
    result.steps.push({ name: 'panel opened', hasPanel: !!panelText, text: panelText })

    const clicked = await evaluate(`(() => {
      const ta = document.querySelector('textarea[placeholder*="الحافظة"], textarea[placeholder*="lipboard"]')
      if (!ta) return 'no-panel'
      const panel = ta.closest('div.absolute') || ta.parentElement
      const btn = [...panel.querySelectorAll('button')].find(b => /Sync (on|off)|المزامنة (متوقفة|مفعّلة)/.test(b.textContent || ''))
      if (!btn) return 'no-toggle'
      btn.click(); return btn.textContent.trim()
    })()`)
    result.steps.push({ name: 'enable sync', value: clicked })
    await sleep(2500)

    const afterEnable = await evaluate(`(() => {
      const ta = document.querySelector('textarea[placeholder*="الحافظة"], textarea[placeholder*="lipboard"]')
      const panel = ta && ta.closest('div.absolute')
      return panel ? panel.innerText : null
    })()`)
    const stateOn = await lab.api('/api/devices/' + devId + '/clipboard-sync').then(r => r.json)
    result.steps.push({ name: 'state after enable', text: afterEnable, api: { enabled: stateOn.enabled, direction: stateOn.direction, agentWatching: stateOn.agentWatching } })

    const shot1 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(path.join(OUTDIR, 'ui-sync-on.png'), Buffer.from(shot1.result.data, 'base64'))

    const chord = await evaluate(`(() => {
      const ev = new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', ctrlKey: true, altKey: true, shiftKey: true, bubbles: true, cancelable: true })
      window.dispatchEvent(ev)
      return ev.defaultPrevented
    })()`)
    await sleep(1800)

    const afterChord = await evaluate(`(() => {
      const ta = document.querySelector('textarea[placeholder*="الحافظة"], textarea[placeholder*="lipboard"]')
      const panel = ta && ta.closest('div.absolute')
      return panel ? panel.innerText : null
    })()`)
    const stateRev = await lab.api('/api/devices/' + devId + '/clipboard-sync').then(r => r.json)
    result.steps.push({ name: 'reverse chord', defaultPrevented: chord, text: afterChord, api: { enabled: stateRev.enabled, direction: stateRev.direction } })

    const shot2 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(path.join(OUTDIR, 'ui-reversed.png'), Buffer.from(shot2.result.data, 'base64'))

    const disable = await evaluate(`(() => {
      const ta = document.querySelector('textarea[placeholder*="الحافظة"], textarea[placeholder*="lipboard"]')
      const panel = ta && ta.closest('div.absolute')
      if (!panel) return 'no-panel'
      const btn = [...panel.querySelectorAll('button')].find(b => /Sync (on|off)|المزامنة (متوقفة|مفعّلة)/.test(b.textContent || ''))
      if (!btn) return 'no-toggle'
      btn.click(); return btn.textContent.trim()
    })()`)
    result.steps.push({ name: 'disable sync', value: disable })
    await sleep(1200)
    const stateOff = await lab.api('/api/devices/' + devId + '/clipboard-sync').then(r => r.json)
    result.steps.push({ name: 'state after disable', api: { enabled: stateOff.enabled } })

    fs.writeFileSync(path.join(OUTDIR, 'ui-check.json'), JSON.stringify(result, null, 2), 'utf8')
    console.log(JSON.stringify(result.steps.map(s => ({ name: s.name, value: s.value, api: s.api, defaultPrevented: s.defaultPrevented })), null, 2))
    console.log('\nenableText=' + JSON.stringify(afterEnable))
    console.log('reversedText=' + JSON.stringify(afterChord))
  })

  chrome.kill()
  process.exit(0)
})().catch(e => { console.error('UI CHECK FAILED:', e.message); process.exit(1) })
