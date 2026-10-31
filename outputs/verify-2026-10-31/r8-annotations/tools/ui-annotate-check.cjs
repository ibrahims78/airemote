// R8.2 UI evidence — draw laser + pen in the real dashboard, prove the relay and
// that drawing does not send remote input.
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const lab = require('./lab.cjs')
const screen = require('./screen.cjs')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = 'https://127.0.0.1:3001'
const PORT = 9225
const OUTDIR = 'D:\\autoclaw projects-new\\AiRemote\\outputs\\verify-2026-10-31\\r8-annotations'
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

  // second viewer: joins the same session and records the relayed marks
  const peer = await screen.open('WIN11-VM', { fps: 4, quality: 30, maxWidth: 640 })
  await peer.open()
  await sleep(1500)

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(process.env.TEMP || '.', 'cdp-r8-anno'),
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

  const result = { steps: [], sent: {}, peerEvents: [] }

  await cdp(target.webSocketDebuggerUrl, async (send) => {
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', { source: seed })
    await send('Page.navigate', { url: BASE + '/devices/' + devId + '?tab=screen' })
    await sleep(11000)

    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      return r.result && r.result.result ? r.result.result.value : null
    }

    // record every websocket frame the page sends
    await evaluate(`(() => {
      window.__sent = []
      const orig = WebSocket.prototype.send
      if (!WebSocket.prototype.__wrapped) {
        WebSocket.prototype.send = function (data) {
          try { const m = JSON.parse(data); if (m && m.type) window.__sent.push(m.type) } catch {}
          return orig.call(this, data)
        }
        WebSocket.prototype.__wrapped = true
      }
      return true
    })()`)

    const started = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /بدء مشاركة الشاشة|Start screen sharing/.test(b.textContent || ''))
      if (!btn) return 'no-start'; btn.click(); return 'started'
    })()`)
    result.steps.push({ name: 'start screen sharing', value: started })
    await sleep(9000)

    const opened = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /ليزر وتعليقات|Laser & annotations/.test(b.getAttribute('title') || ''))
      if (!btn) return 'no-button'; btn.click(); return 'clicked'
    })()`)
    result.steps.push({ name: 'open annotation panel', value: opened })
    await sleep(800)

    const laser = await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'ليزر' || (x.textContent || '').trim() === 'Laser')
      if (!b) return 'no-laser'; b.click(); return 'laser'
    })()`)
    result.steps.push({ name: 'select laser', value: laser })
    await sleep(400)

    const geo = await evaluate(`(() => {
      const svg = document.querySelector('svg[viewBox="0 0 1 1"]')
      if (!svg) return null
      const r = svg.getBoundingClientRect()
      return { x: r.left, y: r.top, w: r.width, h: r.height, pe: getComputedStyle(svg).pointerEvents }
    })()`)
    result.steps.push({ name: 'overlay geometry', value: geo })

    // draw a laser diagonal
    const drawn = await evaluate(`(() => {
      const svg = document.querySelector('svg[viewBox="0 0 1 1"]')
      if (!svg) return 'no-svg'
      const r = svg.getBoundingClientRect()
      const fire = (type, fx, fy) => svg.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
        clientX: r.left + r.width * fx, clientY: r.top + r.height * fy
      }))
      fire('pointerdown', 0.15, 0.25)
      for (let i = 1; i <= 18; i++) fire('pointermove', 0.15 + i * 0.035, 0.25 + i * 0.022)
      fire('pointerup', 0.78, 0.65)
      const hit = document.elementFromPoint(r.left + r.width * 0.5, r.top + r.height * 0.5)
      return { isSvg: hit === svg, tag: hit && hit.tagName }
    })()`)
    result.steps.push({ name: 'draw laser', value: drawn })
    await sleep(700)

    const shot1 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(path.join(OUTDIR, 'ui-laser.png'), Buffer.from(shot1.result.data, 'base64'))

    // switch to pen and draw a curve (persists)
    const pen = await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'قلم' || (x.textContent || '').trim() === 'Pen')
      if (!b) return 'no-pen'; b.click(); return 'pen'
    })()`)
    result.steps.push({ name: 'select pen', value: pen })
    await sleep(300)
    const penDrawn = await evaluate(`(() => {
      const svg = document.querySelector('svg[viewBox="0 0 1 1"]')
      if (!svg) return 'no-svg'
      const r = svg.getBoundingClientRect()
      const fire = (type, fx, fy) => svg.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 2, pointerType: 'mouse', isPrimary: true,
        clientX: r.left + r.width * fx, clientY: r.top + r.height * fy
      }))
      fire('pointerdown', 0.20, 0.70)
      for (let i = 1; i <= 24; i++) fire('pointermove', 0.20 + i * 0.022, 0.70 - Math.sin(i / 4) * 0.06)
      fire('pointerup', 0.73, 0.64)
      return document.querySelectorAll('svg[viewBox="0 0 1 1"] polyline').length
    })()`)
    result.steps.push({ name: 'draw pen', value: penDrawn })
    await sleep(600)

    const shot2 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(path.join(OUTDIR, 'ui-annotations.png'), Buffer.from(shot2.result.data, 'base64'))

    const sentLog = await evaluate('window.__sent.slice()')
    const counts = {}
    for (const k of sentLog || []) counts[k] = (counts[k] || 0) + 1
    result.sent = counts

    // leave drawing mode, confirm the overlay releases the pointer
    const off = await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'إيقاف' || (x.textContent || '').trim() === 'Off')
      if (!b) return 'no-off'; b.click(); return 'off'
    })()`)
    await sleep(400)
    const released = await evaluate(`(() => {
      const svg = document.querySelector('svg[viewBox="0 0 1 1"]')
      return svg ? getComputedStyle(svg).pointerEvents : null
    })()`)
    result.steps.push({ name: 'leave drawing mode', value: off, pointerEvents: released })

    fs.writeFileSync(path.join(OUTDIR, 'ui-check.json'), JSON.stringify(result, null, 2), 'utf8')
  })

  await sleep(500)
  const peerAnno = peer.events.filter(e => e.type === 'screen:annotate')
  result.peerEvents = peerAnno.map(e => e.payload && e.payload.tool)
  fs.writeFileSync(path.join(OUTDIR, 'peer-relay.json'), JSON.stringify({
    count: peerAnno.length,
    tools: result.peerEvents,
    first: peerAnno[0] ? peerAnno[0].payload : null,
    last: peerAnno[peerAnno.length - 1] ? peerAnno[peerAnno.length - 1].payload : null
  }, null, 2), 'utf8')

  console.log(JSON.stringify({
    steps: result.steps,
    sent: result.sent,
    peerCount: peerAnno.length,
    peerTools: [...new Set(result.peerEvents)]
  }, null, 2))

  peer.close()
  chrome.kill()
  process.exit(0)
})().catch(e => { console.error('ANNO UI FAILED:', e.message); process.exit(1) })
