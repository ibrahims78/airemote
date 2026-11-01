'use strict'
/**
 * نقرة على مركز الـcanvas بإحداثي فيزيائي = CSS×dpr + إزاحة الـWebView المقيسة (36,24)CSS.
 * المطلوب: الوكيل يستقبل (0.5, 0.5) والمؤشّر يهبط قرب مركز شاشة الهدف.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path'); const fs = require('fs')
const { execFileSync } = require('child_process')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const g = require('./vmguest.cjs')

const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const TECNO = '12927374CM001019'
const TRACE = 'C:\\Users\\admin\\AppData\\Roaming\\airemote-agent-desktop\\input-trace.log'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/touch-map'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const adb = (...a) => execFileSync(ADB, ['-s', TECNO, ...a], { encoding: 'utf8', timeout: 60000 })
const cursor = () => g.ps('win10', path.join(__dirname, 'cursor.ps1')).replace(/^\uFEFF/, '').trim()
const dims = () => g.ps('win10', path.join(__dirname, 'dims.ps1')).replace(/^\uFEFF/, '').trim()
const trace = (n = 6) => { try { g.copyOut('win10', TRACE, path.join(__dirname, 'trm.txt')); const t = fs.readFileSync(path.join(__dirname, 'trm.txt'), 'utf8'); return t.trim() ? t.trim().split(/\r?\n/).slice(-n) : [] } catch { return [] } }

const INSET_CSS = { x: 36, y: 24 }   // إزاحة الـWebView المقيسة في الجولة السابقة

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const res = {}
  res.screen = dims()
  const [wh] = res.screen.split(' @')
  const [SW, SH] = wh.split('x').map(Number)

  const unix = adb('shell', 'cat', '/proc/net/unix')
  const m = /@?(webview_devtools_remote_\d+)/.exec(unix)
  if (!m) { console.log('no devtools'); process.exit(3) }
  adb('forward', 'tcp:9222', 'localabstract:' + m[1])
  await sleep(800)
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
  const page = targets.find(t => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
  let id = 0; const pend = new Map()
  const call = (me, pa) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) })
  ws.on('message', d => { const j = JSON.parse(d.toString()); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id) } })
  await new Promise(r => ws.on('open', r))
  const ev = async e => { const r = await call('Runtime.evaluate', { expression: e, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null }
  res.rect = await ev(`(() => { const c=document.querySelector('canvas'); const r=c.getBoundingClientRect(); return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height,dpr:devicePixelRatio}) })()`)
  const R = JSON.parse(res.rect)
  try { ws.close() } catch {}

  // مركز الـcanvas بوحدات CSS ثم إلى فيزيائي مع الإزاحة
  const cssX = R.l + R.w / 2, cssY = R.t + R.h / 2
  const phys = { x: Math.round((cssX + INSET_CSS.x) * R.dpr), y: Math.round((cssY + INSET_CSS.y) * R.dpr) }
  res.target = { css: { x: cssX, y: cssY }, physical: phys, expectedNorm: { x: +( (cssX - R.l) / R.w ).toFixed(3), y: +((cssY - R.t) / R.h).toFixed(3) } }

  res.cursorBefore = cursor()
  adb('shell', 'input', 'tap', String(phys.x), String(phys.y))
  await sleep(2200)
  res.cursorAfter = cursor()
  res.trace = trace(4)

  const [ax, ay] = res.cursorAfter.split(',').map(Number)
  res.expectedPx = { x: Math.round(SW * 0.5), y: Math.round(SH * 0.5) }
  res.cursorMatches = Math.abs(ax - res.expectedPx.x) <= 4 && Math.abs(ay - res.expectedPx.y) <= 4

  fs.writeFileSync(path.join(OUT, 'centre-tap.json'), JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
})().catch(e => { console.error('ERR ' + e.message); process.exit(1) })
