'use strict'
/** اختبار مركّز: مفتاح Home عبر الجلسة من ويندوز إلى TECNO، مع قراءة الحالة قبل/بعد فقط. */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path'); const fs = require('fs')
const { execFileSync } = require('child_process')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')

const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const TECNO = '12927374CM001019'
const TECNO_ID = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const WIN10_ID = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/win-to-android'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const adb = (...a) => execFileSync(ADB, ['-s', TECNO, ...a], { encoding: 'utf8', timeout: 60000 })
const top = () => (adb('shell', 'dumpsys', 'activity', 'activities').match(/topResumedActivity=ActivityRecord\{\S+ u0 ([\w.\/]+)/) || [])[1] || '?'
const devToken = (id) => { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true }); const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token; db.close(); return t }

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const res = {}

  // هيّئ: الإعدادات في المقدمة
  adb('shell', 'am', 'start', '-a', 'android.settings.SETTINGS')
  await sleep(2500)
  res.topBefore = top()

  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(800)

  const req = async (p, body, headers = {}) => {
    const r = await fetch('https://127.0.0.1:3001' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) })
    return { status: r.status, json: await r.json().catch(() => ({})) }
  }
  const tokWin = devToken(WIN10_ID)
  const rq = await req('/api/relay/request', { targetDeviceId: TECNO_ID, access: 'control', requesterDeviceId: WIN10_ID }, { 'X-Device-Token': tokWin })
  res.request = rq.status
  if (rq.status !== 201) { res.error = JSON.stringify(rq.json); console.log(JSON.stringify(res, null, 1)); process.exit(2) }
  res.sid = rq.json.sessionId
  await sleep(1200)
  await lab.api('/api/relay/' + res.sid + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  await sleep(2000)

  const vt = await req('/api/relay/' + res.sid + '/view-ticket', {}, { 'X-Device-Token': tokWin })
  const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)
  const qs = new URLSearchParams({ rt: u.searchParams.get('rt'), deviceId: TECNO_ID, binary: '1', fps: '8', quality: '50', maxWidth: '480' })
  const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + qs.toString(), { rejectUnauthorized: false })
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('timeout')), 15000) })
  await sleep(1500)

  res.topAfterAccept = top()
  ws.send(JSON.stringify({ type: 'screen:key_event', payload: { type: 'press', key: 'home' } }))
  await sleep(2500)
  res.topAfterHome1 = top()
  ws.send(JSON.stringify({ type: 'screen:key_event', payload: { type: 'press', key: 'home' } }))
  await sleep(2000)
  res.topAfterHome2 = top()

  res.homeWorked = /launcher|Launcher/i.test(res.topAfterHome1) || /launcher|Launcher/i.test(res.topAfterHome2)
  try { ws.close() } catch {}
  try { await lab.api('/api/relay/' + res.sid + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}
  fs.writeFileSync(path.join(OUT, 'home.json'), JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
})().catch(e => { console.error('ERR ' + e.message); process.exit(1) })
