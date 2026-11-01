'use strict'
/**
 * تشخيص داخل WebView عبر CDP:
 *  - يقرأ مستطيل الـcanvas وخصائصه.
 *  - يعترض WebSocket.send ويسجّل كل ما يرسله العميل.
 *  - يلمس الشاشة ثم يقرأ ما سُجّل.
 *
 * المتطلب: بناء APK فيه setWebContentsDebuggingEnabled عند
 * settings global airemote_webview_debug=1، وforward على 9222.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path'); const fs = require('fs')
const { execFileSync } = require('child_process')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')

const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const TECNO = '12927374CM001019'
const TECNO_ID = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const DB = 'C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/t1-control'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const adb = (...a) => execFileSync(ADB, ['-s', TECNO, ...a], { encoding: 'utf8', timeout: 60000 })
function token (id) { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(DB, { readOnly: true }); const r = db.prepare('SELECT token FROM devices WHERE id=?').get(id); db.close(); return r && r.token }

async function cdpTargets () {
  const res = await fetch('http://127.0.0.1:9222/json')
  return res.json()
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const res = {}

  // إعدادات التصحيح
  adb('shell', 'settings', 'put', 'global', 'airemote_webview_debug', '1')
  res.debugSetting = adb('shell', 'settings', 'get', 'global', 'airemote_webview_debug').trim()

  // جلسة جديدة
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  adb('shell', 'am', 'force-stop', 'com.airemote.agent')
  await sleep(1500)
  adb('shell', 'am', 'start', '-n', 'com.airemote.agent/.MainActivity')
  await sleep(6000)

  const rq = await lab.api('/api/relay/request', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': token(TECNO_ID) }, body: JSON.stringify({ targetDeviceId: WIN10, access: 'control', requesterDeviceId: TECNO_ID }) })
  res.request = rq.status
  if (rq.status !== 201) { console.log(JSON.stringify(res)); process.exit(2) }
  res.sid = rq.json.sessionId
  await sleep(1800)
  await lab.api('/api/relay/' + res.sid + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  await sleep(8000)

  res.top = (adb('shell', 'dumpsys', 'activity', 'activities').match(/topResumedActivity=ActivityRecord\{\S+ u0 ([\w.\/]+)/) || [])[1]

  // مقبس التصحيح
  const unix = adb('shell', 'cat', '/proc/net/unix')
  const m = /@?(webview_devtools_remote_\d+)/.exec(unix)
  if (!m) { res.error = 'no devtools socket'; fs.writeFileSync(path.join(OUT, 'cdp.json'), JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); process.exit(3) }
  res.socket = m[1]
  adb('forward', 'tcp:9222', 'localabstract:' + res.socket)
  await sleep(1500)

  const targets = await cdpTargets()
  res.targets = targets.map(t => ({ title: t.title, url: String(t.url).slice(0, 80), type: t.type }))
  const page = targets.find(t => t.type === 'page') || targets[0]
  if (!page) { res.error = 'no page target'; console.log(JSON.stringify(res, null, 1)); process.exit(4) }

  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
  let id = 0
  const pending = new Map()
  const call = (method, params) => new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  ws.on('message', (d) => {
    const msg = JSON.parse(d.toString())
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id).resolve(msg); pending.delete(msg.id) }
  })
  await new Promise(r => ws.on('open', r))

  const evaluate = async (expr) => {
    const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    return r.result && r.result.result ? r.result.result.value : null
  }

  res.page = await evaluate(`JSON.stringify({
    href: location.href.replace(/rt=[^&]+/, 'rt=***'),
    vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio,
    hasCanvas: !!document.querySelector('canvas'),
    canvases: Array.from(document.querySelectorAll('canvas')).map(c => { const r = c.getBoundingClientRect(); return { w: c.width, h: c.height, left: Math.round(r.left), top: Math.round(r.top), rw: Math.round(r.width), rh: Math.round(r.height) } }),
    touchAction: document.querySelector('canvas') ? getComputedStyle(document.querySelector('canvas')).touchAction : null
  })`)

  // اعتراض المقبس
  await evaluate(`(() => {
    if (window.__sent) return 'already';
    window.__sent = [];
    const orig = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try { if (typeof data === 'string' && data.length < 400) window.__sent.push(data) } catch (e) {}
      return orig.call(this, data);
    };
    window.__pointer = [];
    ['pointerdown','pointerup','pointermove','mousedown','mouseup','touchstart','touchend','click'].forEach(t => {
      document.addEventListener(t, (e) => {
        if (window.__pointer.length < 200) window.__pointer.push(t + ' @' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ' target=' + (e.target && e.target.tagName));
      }, true);
    });
    return 'installed';
  })()`)

  // لمسة في مركز الشاشة الحالي (يتغيّر مع الدوران — لا تفترض الوضع الرأسي)
  const disp = adb('shell', 'dumpsys', 'window', 'displays')
  const cur = /cur=(\d+)x(\d+)/.exec(disp)
  const TW = cur ? Number(cur[1]) : 720
  const TH = cur ? Number(cur[2]) : 1600
  res.tapAt = { w: TW, h: TH, x: Math.round(TW / 2), y: Math.round(TH / 2) }
  adb('shell', 'input', 'tap', String(res.tapAt.x), String(res.tapAt.y))
  await sleep(2000)
  adb('shell', 'input', 'tap', String(res.tapAt.x), String(res.tapAt.y))
  await sleep(2000)

  res.pointerEvents = await evaluate('JSON.stringify(window.__pointer || [])')
  res.sentMessages = await evaluate('JSON.stringify((window.__sent || []).filter(m => m.includes("mouse") || m.includes("key") || m.includes("control")).slice(0, 20))')
  res.sentTotal = await evaluate('JSON.stringify((window.__sent || []).length)')

  try { ws.close() } catch {}
  fs.writeFileSync(path.join(OUT, 'cdp.json'), JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
})().catch(e => { console.error('ERR ' + e.message); process.exit(1) })
