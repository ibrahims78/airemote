'use strict'
/**
 * cdp-inspect.cjs — يفحص صفحة WebView داخل وكيل أندرويد عبر CDP:
 * يفتح forward على منفذ أدوات WebView، يسرد الأهداف، ويقرأ href/title/نصّ الصفحة.
 * المتطلب: settings global airemote_webview_debug=1 + إعادة تشغيل التطبيق.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const { execFileSync } = require('child_process')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const serial = process.argv[2] || '12927374CM001019'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const adb = (...a) => execFileSync(ADB, ['-s', serial, ...a], { encoding: 'utf8', timeout: 60000 })

;(async () => {
  const pid = adb('shell', 'pidof', 'com.airemote.agent').trim().split(/\s+/)[0]
  if (!pid) { console.log(JSON.stringify({ error: 'app not running' })); process.exit(1) }
  const sock = 'webview_devtools_remote_' + pid
  try { adb('forward', '--remove', 'tcp:9222') } catch {}
  adb('forward', 'tcp:9222', 'localabstract:' + sock)
  await sleep(600)
  const list = await (await fetch('http://127.0.0.1:9222/json')).json().catch(() => null)
  if (!list) { console.log(JSON.stringify({ error: 'no devtools endpoint', pid, sock })); process.exit(1) }
  const pages = list.filter(t => t.type === 'page').map(t => ({ url: t.url, title: t.title, ws: t.webSocketDebuggerUrl }))
  const out = { pid, sock, pages }
  if (pages.length) {
    const ws = new WebSocket(pages[0].ws, { perMessageDeflate: false })
    await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('ws timeout')), 8000) })
    let id = 0
    const evalJs = (expr) => new Promise((resolve) => {
      const myId = ++id
      const onMsg = (d) => {
        try {
          const m = JSON.parse(d.toString())
          if (m.id === myId) { ws.off('message', onMsg); resolve(m.result && m.result.result && m.result.result.value) }
        } catch {}
      }
      ws.on('message', onMsg)
      ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }))
      setTimeout(() => { try { ws.off('message', onMsg) } catch {}; resolve(undefined) }, 5000)
    })
    out.href = await evalJs('location.href')
    out.title = await evalJs('document.title')
    out.bodyLen = await evalJs('document.body ? document.body.innerText.length : -1')
    out.bodyHead = await evalJs('document.body ? document.body.innerText.slice(0,180) : null')
    out.canvas = await evalJs('document.querySelectorAll("canvas").length')
    try { ws.close() } catch {}
  }
  console.log(JSON.stringify(out, null, 1))
})()
