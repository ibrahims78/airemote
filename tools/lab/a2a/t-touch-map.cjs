'use strict'
/**
 * يقيس ما يصِل WebView فعلاً من إحداثيات اللمس مقابل الإحداثي الفيزيائي المنقور.
 * لا يعدّل أي ملف: يسجّل pointerdown/move عبر CDP ثم ينقر نقاطاً معروفة.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path'); const fs = require('fs')
const { execFileSync } = require('child_process')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')

const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const TECNO = '12927374CM001019'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/touch-map'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const adb = (...a) => execFileSync(ADB, ['-s', TECNO, ...a], { encoding: 'utf8', timeout: 60000 })

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const res = {}
  const unix = adb('shell', 'cat', '/proc/net/unix')
  const m = /@?(webview_devtools_remote_\d+)/.exec(unix)
  if (!m) { res.error = 'no devtools'; console.log(JSON.stringify(res)); process.exit(3) }
  adb('forward', 'tcp:9222', 'localabstract:' + m[1])
  await sleep(800)
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
  const page = targets.find(t => t.type === 'page')
  if (!page) { res.error = 'no page'; console.log(JSON.stringify(res)); process.exit(3) }
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
  let id = 0; const pend = new Map()
  const call = (me, pa) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) })
  ws.on('message', d => { const j = JSON.parse(d.toString()); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id) } })
  await new Promise(r => ws.on('open', r))
  const ev = async e => { const r = await call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : null }

  res.rect = await ev(`(() => { const c=document.querySelector('canvas'); if(!c) return 'null'; const r=c.getBoundingClientRect(); return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height,dpr:devicePixelRatio,iw:innerWidth,ih:innerHeight}) })()`)
  if (res.rect === 'null') { res.error = 'no canvas'; console.log(JSON.stringify(res)); process.exit(3) }
  const R = JSON.parse(res.rect)

  await ev(`(() => {
    window.__pts = [];
    const rec = (t) => document.addEventListener(t, (e) => {
      window.__pts.push({ t, cx: Math.round(e.clientX * 100)/100, cy: Math.round(e.clientY * 100)/100, tag: e.target && e.target.tagName });
    }, true);
    ['pointerdown','pointerup','pointermove','touchstart','touchend','mousedown','mouseup'].forEach(rec);
    return 1;
  })()`)

  const disp = adb('shell', 'dumpsys', 'window', 'displays')
  const cur = /cur=(\d+)x(\d+)/.exec(disp)
  const SWp = cur ? +cur[1] : 720, SHp = cur ? +cur[2] : 1600
  res.screen = { w: SWp, h: SHp }

  // ثلاث نقاط داخل شريط الـcanvas (نسبياً)
  const pts = [0.30, 0.50, 0.70]
  res.samples = []
  for (const fy of pts) {
    const cssX = R.l + R.w * 0.5
    const cssY = R.t + R.h * fy
    const ph = { x: Math.round(cssX * R.dpr), y: Math.round(cssY * R.dpr) }
    await ev(`window.__pts = []`)
    adb('shell', 'input', 'tap', String(ph.x), String(ph.y))
    await sleep(1200)
    const got = await ev(`JSON.stringify(window.__pts.slice(0,6))`)
    res.samples.push({ fy, tapPhysical: ph, tapCssExpected: { x: Math.round(cssX), y: Math.round(cssY) }, got: JSON.parse(got || '[]') })
  }

  try { ws.close() } catch {}
  fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
})().catch(e => { console.error('ERR ' + e.message); process.exit(1) })
