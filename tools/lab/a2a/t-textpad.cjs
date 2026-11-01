'use strict'
/**
 * اختبار حقل النص: يفتح الحقل في العارض (نقرة برمجية)، يكتب نصاً حقيقياً عبر adb،
 * يضغط «إرسال»، ثم يقرأ أثر الوكيل للتأكد من وصول المفاتيح مع granted.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path'); const fs = require('fs')
const { execFileSync } = require('child_process')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const g = require('./vmguest.cjs')

const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const TECNO = '12927374CM001019'
const TECNO_ID = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const WIN11 = 'd147684b-2451-4418-a628-86f11aa66a4e'
const TARGET = process.argv[2] === 'win11' ? WIN11 : WIN10
const TARGET_VM = process.argv[2] === 'win11' ? 'win11' : 'win10'
const DB = 'C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db'
const TRACE = 'C:\\Users\\admin\\AppData\\Roaming\\airemote-agent-desktop\\input-trace.log'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/textpad'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const adb = (...a) => execFileSync(ADB, ['-s', TECNO, ...a], { encoding: 'utf8', timeout: 60000 })
const shot = (n) => { const b = execFileSync(ADB, ['-s', TECNO, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }); fs.writeFileSync(path.join(OUT, n), b); fs.writeFileSync(path.join(__dirname, n), b); return b.length }
function token (id) { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(DB, { readOnly: true }); const r = db.prepare('SELECT token FROM devices WHERE id=?').get(id); db.close(); return r && r.token }
  const trace = (n = 14) => { try { g.copyOut(TARGET_VM, TRACE, path.join(__dirname, 'tr2.txt')); return fs.readFileSync(path.join(__dirname, 'tr2.txt'), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(-n) } catch { return ['(no trace)'] } }

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const res = { startedAt: new Date().toISOString() }

  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(1200)
  const rq = await lab.api('/api/relay/request', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': token(TECNO_ID) }, body: JSON.stringify({ targetDeviceId: TARGET, access: 'control', requesterDeviceId: TECNO_ID }) })
  if (rq.status !== 201) { console.log('request', rq.status); process.exit(2) }
  res.sid = rq.json.sessionId
  await sleep(1800)
  await lab.api('/api/relay/' + res.sid + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  await sleep(9000)

  const unix = adb('shell', 'cat', '/proc/net/unix')
  const m = /@?(webview_devtools_remote_\d+)/.exec(unix)
  if (!m) { res.error = 'no devtools'; console.log(JSON.stringify(res, null, 1)); process.exit(3) }
  adb('forward', 'tcp:9222', 'localabstract:' + m[1])
  await sleep(1000)
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
  const page = targets.find(t => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
  let id = 0; const pending = new Map()
  const call = (me, pa) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })) })
  ws.on('message', d => { const j = JSON.parse(d.toString()); if (j.id && pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id) } })
  await new Promise(r => ws.on('open', r))
  const ev = async e => { const r = await call('Runtime.evaluate', { expression: e, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null }

  res.hasTypeButton = await ev(`!!document.querySelector('button[title="إرسال نص إلى الجهاز البعيد"]')`)
  if (!res.hasTypeButton) {
    // الشريط مخفي: أظهره عبر زر الأدوات العائم ثم أعد البحث
    res.revealed = await ev(`(() => { const b = document.querySelector('button[aria-label="إظهار شريط الأدوات"]'); if (!b) return 'no handle'; b.click(); return 'clicked handle' })()`)
    await new Promise(r => setTimeout(r, 1200))
    res.hasTypeButton = await ev(`!!document.querySelector('button[title="إرسال نص إلى الجهاز البعيد"]')`)
  }
  res.clickedType = await ev(`(() => { const b = document.querySelector('button[title="إرسال نص إلى الجهاز البعيد"]'); if (!b) return 'no button'; b.click(); return 'clicked' })()`)
  await sleep(900)
  res.padVisible = await ev(`!!document.querySelector('input[placeholder*="اكتب نصاً"]')`)
  res.shotPad = shot('pad-open.png')

  if (res.padVisible) {
    await ev(`(() => { const i = document.querySelector('input[placeholder*="اكتب نصاً"]'); i.focus(); return document.activeElement === i })()`)
    await sleep(600)
    adb('shell', 'input', 'text', 'AiRemote')
    await sleep(1200)
    res.inputValue = await ev(`document.querySelector('input[placeholder*="اكتب نصاً"]').value`)
    res.shotTyped = shot('pad-typed.png')
    res.sentClick = await ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'إرسال'); if (!b) return 'no send'; b.click(); return 'clicked' })()`)
    await sleep(2500)
  }

  res.trace = trace(16)
  res.keyLines = res.trace.filter(x => x.includes('key type='))
  res.shotAfter = shot('pad-after.png')
  try { ws.close() } catch {}
  try { await lab.api('/api/relay/' + res.sid + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}
  fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
})().catch(e => { console.error('ERR ' + e.message); process.exit(1) })
