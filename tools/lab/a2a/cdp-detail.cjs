'use strict'
/** استعلام CDP سريع: ما العنصر في مركز الـcanvas؟ وما قيم الإدخال التي يراها العميل؟ */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path'); const fs = require('fs')
const { execFileSync } = require('child_process')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')

const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const TECNO = '12927374CM001019'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-01-01'.replace('2026-01-01', '2026-11-01') + '/t1-control'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const adb = (...a) => execFileSync(ADB, ['-s', TECNO, ...a], { encoding: 'utf8', timeout: 60000 })

;(async () => {
  const unix = adb('shell', 'cat', '/proc/net/unix')
  const m = /@?(webview_devtools_remote_\d+)/.exec(unix)
  if (!m) { console.log('no devtools'); process.exit(3) }
  adb('forward', 'tcp:9222', 'localabstract:' + m[1])
  await sleep(1000)
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
  const page = targets.find(t => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
  let id = 0; const pending = new Map()
  const call = (method, params) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })) })
  ws.on('message', (d) => { const j = JSON.parse(d.toString()); if (j.id && pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id) } })
  await new Promise(r => ws.on('open', r))
  const ev = async (e) => { const r = await call('Runtime.evaluate', { expression: e, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null }

  const out = {}
  out.rect = await ev(`(() => { const c=document.querySelector('canvas'); const r=c.getBoundingClientRect(); return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height,dpr:devicePixelRatio,iw:innerWidth,ih:innerHeight}) })()`)
  const R = JSON.parse(out.rect)
  out.centerHit = await ev(`(() => { const el = document.elementFromPoint(${R.l + R.w / 2}, ${R.t + R.h / 2}); return el ? el.tagName + '.' + (el.className||'').toString().slice(0,60) : 'none' })()`)
  out.stackedAtCenter = await ev(`(() => { const els = document.elementsFromPoint(${R.l + R.w / 2}, ${R.t + R.h / 2}); return els.slice(0,6).map(e => e.tagName + '.' + (e.className||'').toString().slice(0,40)) })()`)
  out.visualViewport = await ev(`JSON.stringify({ vw: visualViewport.width, vh: visualViewport.height, scale: visualViewport.scale })`)

  // إرسال حدث مؤشّر صناعي في مركز الـcanvas والتقاط ما يرسله العميل
  await ev(`(() => { window.__sent2 = []; const o = WebSocket.prototype.send; WebSocket.prototype.send = function(d){ try{ if(typeof d==='string') window.__sent2.push(d) }catch(e){}; return o.call(this,d) }; return 1 })()`)
  out.synthetic = await ev(`(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + r.height/2;
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 };
    c.dispatchEvent(new PointerEvent('pointerdown', opts));
    c.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
    return JSON.stringify({ x, y });
  })()`)
  await sleep(1500)
  out.sent = await ev('JSON.stringify((window.__sent2||[]).filter(m=>m.includes("mouse")).slice(0,6))')
  try { ws.close() } catch {}
  fs.writeFileSync(path.join(OUT, 'cdp-detail.json'), JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out, null, 1))
})().catch(e => { console.error('ERR ' + e.message); process.exit(1) })
