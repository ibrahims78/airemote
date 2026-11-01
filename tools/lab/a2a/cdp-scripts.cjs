'use strict'
/** ما الحزمة المحمّلة داخل WebView؟ وهل هناك Service Worker يخدّم نسخة قديمة؟ */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const { execFileSync } = require('child_process')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')

const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const adb = (...a) => execFileSync(ADB, ['-s', '12927374CM001019', ...a], { encoding: 'utf8', timeout: 60000 })

;(async () => {
  const unix = adb('shell', 'cat', '/proc/net/unix')
  const m = /@?(webview_devtools_remote_\d+)/.exec(unix)
  if (!m) { console.log('no devtools'); return }
  adb('forward', 'tcp:9222', 'localabstract:' + m[1])
  await new Promise(r => setTimeout(r, 800))
  const list = await (await fetch('http://127.0.0.1:9222/json')).json()
  const page = list.find(x => x.type === 'page')
  if (!page) { console.log('no page'); return }
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
  let id = 0; const pending = new Map()
  const call = (method, params) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  ws.on('message', d => { const j = JSON.parse(d.toString()); if (j.id && pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id) } })
  await new Promise(r => ws.on('open', r))
  const ev = async e => { const r = await call('Runtime.evaluate', { expression: e, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null }

  console.log('URL=' + await ev('location.href.replace(/rk=.*/, "rk=***")'))
  console.log('SCRIPTS=' + await ev('JSON.stringify(performance.getEntriesByType("resource").map(r=>r.name).filter(n=>n.includes(".js")).slice(0,8))'))
  console.log('SW=' + await ev('navigator.serviceWorker && navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : "none"'))
  console.log('CANVAS_POINTER=' + await ev('(()=>{const c=document.querySelector("canvas"); if(!c) return "none"; return c.style.cssText.slice(0,120)})()'))
  ws.close()
})().catch(e => { console.error('ERR ' + e.message); process.exit(1) })
