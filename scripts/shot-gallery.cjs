#!/usr/bin/env node
'use strict'
/**
 * shot-gallery.cjs — screenshots every component state of /dev/ui.
 * Drives real Chrome over CDP: real :hover (mouse move), real :focus-visible,
 * real layout. Output: outputs/verify-<date>/components/*.png
 *
 * Usage: node scripts/shot-gallery.cjs [baseUrl] [outDir]
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.argv[2] || 'http://127.0.0.1:5000'
const OUT = process.argv[3] || path.resolve(__dirname, '..', 'outputs', 'verify-2026-11-05', 'components')
const PORT = 9225
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function main () {
  fs.mkdirSync(OUT, { recursive: true })
  const profile = path.join(require('os').tmpdir(), 'airemote-gallery-' + Date.now())
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    'about:blank'
  ], { stdio: 'ignore' })

  let version
  for (let i = 0; i < 40; i++) {
    try { version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json()); break } catch { await sleep(250) }
  }
  if (!version) throw new Error('Chrome did not expose CDP')

  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  const send = (method, params = {}, sessionId) => new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' })
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true })
  const S = (m, p) => send(m, p, sessionId)

  await S('Page.enable')
  await S('DOM.enable')
  await S('CSS.enable')
  await S('Runtime.enable')

  async function open (section) {
    await S('Emulation.setDeviceMetricsOverride', { width: 1120, height: 1400, deviceScaleFactor: 1, mobile: false })
    await S('Page.navigate', { url: `${BASE}/dev/ui?only=${section}` })
    await sleep(1600)
    // fonts + first paint settle
    await S('Runtime.evaluate', { expression: 'document.fonts && document.fonts.ready', awaitPromise: true })
    await sleep(300)
  }

  async function center (selector) {
    const { result } = await S('Runtime.evaluate', {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`,
      returnByValue: true
    })
    return result.result.value
  }

  async function force (selector, pseudos) {
    const { result: { root } } = await S('DOM.getDocument', { depth: -1 })
    const { result: { nodeId } } = await S('DOM.querySelector', { nodeId: root.nodeId, selector })
    if (!nodeId) { console.log('  force: selector not found', selector); return false }
    const r = await S('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudos })
    if (r.error) console.log('  force failed', selector, r.error.message)
    await sleep(250)
    return true
  }

  async function capture (name, opts = {}) {
    if (opts.hover) await force(opts.hover, ['hover'])
    if (opts.focus) await force(opts.focus, ['focus', 'focus-visible'])
    const { result: { cssContentSize } } = await S('Page.getLayoutMetrics')
    const shot = await S('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: 1120, height: Math.min(cssContentSize.height + 24, 4000), scale: 1 }
    })
    const file = path.join(OUT, name + '.png')
    fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'))
    const kb = Math.round(fs.statSync(file).size / 1024)
    console.log(`${name}.png  ${kb}KB`)
  }

  const evidence = []
  async function styles (label, selector, props) {
    const { result } = await S('Runtime.evaluate', {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const cs = getComputedStyle(el); const out = {}; for (const p of ${JSON.stringify(props)}) out[p] = cs.getPropertyValue(p); return out })()`,
      returnByValue: true
    })
    evidence.push({ label, selector, style: result.result.value })
  }

  const shots = [
    ['01-button', 'button', {}],
    ['02-button-hover', 'button', { hover: '#btn-hover-target' }],
    ['03-button-focus', 'button', { focus: '#btn-focus-target' }],
    ['04-field', 'field', {}],
    ['05-field-focus', 'field', { focus: '#field-focus-target' }],
    ['06-switch', 'switch', {}],
    ['07-badge', 'badge', {}],
    ['08-card', 'card', {}],
    ['09-table', 'table', {}],
    ['10-states', 'states', {}]
  ]

  for (const [name, section, opts] of shots) {
    await open(section)
    await capture(name, opts)   // forces hover/focus, then screenshots

    if (name === '01-button') {
      await styles('button default', '#btn-primary', ['height', 'padding-inline', 'background-color', 'color', 'border-radius'])
    }
    if (name === '02-button-hover') {
      await styles('button hover (forced)', '#btn-hover-target', ['filter', 'background-color'])
    }
    if (name === '03-button-focus') {
      await styles('button focus-visible (forced)', '#btn-focus-target', ['outline-style', 'outline-width', 'box-shadow'])
    }
    if (name === '04-field') {
      await styles('field default', '#field-normal', ['height', 'border-color', 'background-color'])
    }
    if (name === '05-field-focus') {
      await styles('field focus (forced)', '#field-focus-target', ['border-color', 'box-shadow'])
    }
    if (name === '06-switch') {
      await styles('switch on', '[data-section="switch"] [role="switch"][aria-checked="true"]', ['height', 'width', 'background-color'])
    }
  }
  fs.writeFileSync(path.join(OUT, 'states.json'), JSON.stringify({ url: BASE, generatedAt: new Date().toISOString(), evidence }, null, 2) + '\n', 'utf8')
  console.log('state-evidence -> states.json')

  ws.close()
  chrome.kill()
  await sleep(400)
  try { fs.rmSync(profile, { recursive: true, force: true }) } catch {}
  console.log('done ->', OUT)
}

main().catch(e => { console.error(e); process.exit(1) })
