'use strict'
/**
 * Minimal CDP driver for the dashboard: launches Chrome, injects the lab token into
 * localStorage (read from disk inside this process — never printed), opens a page and
 * returns a screenshot + DOM facts. Reusable by the TC scripts.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const BASE = 'https://127.0.0.1:3001'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-04/ui'
const PROFILE = path.join(require('os').tmpdir(), 'airemote-cdp-profile')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function loadAuth () {
  const t = JSON.parse(fs.readFileSync('D:/autoclaw projects-new/AiRemote/tools/lab/.token.json', 'utf8')).token
  return JSON.stringify({ state: { token: t, user: { id: 'lab', name: 'Lab', role: 'admin', email: 'lab@local' }, refreshToken: null }, version: 0 })
}

async function launch () {
  fs.mkdirSync(PROFILE, { recursive: true })
  const args = [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    '--ignore-certificate-errors',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1600,900',
    'about:blank'
  ]
  const child = spawn(CHROME, args, { stdio: 'ignore', detached: false })
  for (let i = 0; i < 40; i++) {
    await sleep(250)
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version')
      if (r.ok) return { child, info: await r.json() }
    } catch {}
  }
  throw new Error('chrome devtools endpoint never came up')
}

class CDP {
  constructor (wsUrl) {
    this.ws = new WebSocket(wsUrl, { perMessageDeflate: false })
    this.id = 0
    this.pending = new Map()
    this.ws.on('message', (buf) => {
      let msg
      try { msg = JSON.parse(buf.toString()) } catch { return }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
      }
    })
  }
  open () { return new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej) }) }
  send (method, params = {}, sessionId) {
    const id = ++this.id
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify(payload))
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)) } }, 30000)
    })
  }
  close () { try { this.ws.close() } catch {} }
}

async function attach () {
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
  const page = list.find(t => t.type === 'page')
  const cdp = new CDP(page.webSocketDebuggerUrl)
  await cdp.open()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
  return cdp
}

async function evaluate (cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('eval error: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text))
  return r.result.value
}

async function goto (cdp, url, waitMs = 1200) {
  await cdp.send('Page.navigate', { url })
  await sleep(waitMs)
}

async function shot (cdp, name) {
  fs.mkdirSync(OUT, { recursive: true })
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const p = path.join(OUT, name)
  fs.writeFileSync(p, Buffer.from(r.data, 'base64'))
  return p
}

module.exports = { launch, attach, evaluate, goto, shot, sleep, BASE, OUT, loadAuth }
