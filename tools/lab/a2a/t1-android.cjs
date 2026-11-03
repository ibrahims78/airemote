#!/usr/bin/env node
'use strict'
// t1-android.cjs — T1 مصغّر على جهاز أندرويد: جلسة تحكم + كلمة مرور + تنفيذ مفتاح حقيقي.
// الدليل: تغيّر النشاط العلوي على الجهاز بعد ضغط HOME (homeWorked) — لا مجرد وصول الرسالة (D22).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const { execFileSync } = require('child_process')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const { DatabaseSync } = require('node:sqlite')

const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const TARGET = process.argv[2]
const REQUESTER = process.argv[3] || 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const SERIAL = process.argv[4] || 'GPSZ2025040701858'
const PASSWORD = process.argv[5] || ''
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const adb = (...a) => execFileSync(ADB, ['-s', SERIAL, ...a], { encoding: 'utf8', timeout: 60000 }).trim()
const topActivity = () => {
  try { return (adb('shell', 'dumpsys activity activities').match(/mResumedActivity: ([^\n]+)/) || [])[1] || '?' } catch { return '?' }
}
const devToken = (id) => {
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token
  db.close(); return t
}
const post = async (p, body, headers = {}) => {
  const r = await fetch('https://127.0.0.1:3001' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

;(async () => {
  if (!TARGET) { console.error('usage: t1-android.cjs <targetId> [requester] [serial] [password]'); process.exit(2) }
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    }
  }
  await sleep(600)
  const before = topActivity()

  const rq = await post('/api/relay/request', { targetDeviceId: TARGET, access: 'control', requesterDeviceId: REQUESTER }, { 'X-Device-Token': devToken(REQUESTER) })
  if (rq.status !== 201) { console.log('request failed', rq.status, JSON.stringify(rq.json).slice(0, 120)); process.exit(1) }
  await sleep(800)
  await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await post('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': devToken(REQUESTER) })
  const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)
  const qs = new URLSearchParams({ rt: u.searchParams.get('rt'), deviceId: TARGET, binary: '1', fps: '12', quality: '55', maxWidth: '1280' })
  const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + qs.toString(), { rejectUnauthorized: false })
  let frames = 0
  const events = []
  ws.on('message', (d, bin) => {
    if (bin) { frames++; return }
    let m; try { m = JSON.parse(String(d)) } catch { return }
    if (m && /control_(granted|denied)/.test(String(m.type))) events.push(m.type)
  })
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('ws timeout')), 10000) })
  await sleep(2500)

  // طلب التحكم على مستوى الجلسة (بكلمة المرور إن وُجدت)
  ws.send(JSON.stringify({ type: 'screen:request_control', payload: Object.assign({ requestId: 't1-' + Date.now() }, PASSWORD ? { password: PASSWORD } : {}) }))
  await sleep(2500)

  // افتح تطبيقاً ثم اضغط HOME: التنفيذ يعني عودة المشغّل للأعلى
  adb('shell', 'am', 'start', '-n', 'com.airemote.agent/.MainActivity')
  await sleep(1500)
  const mid = topActivity()
  ws.send(JSON.stringify({ type: 'screen:key_event', payload: { type: 'press', key: 'HOME' } }))
  await sleep(2500)
  const afterHome = topActivity()
  try { ws.close() } catch {}
  try { await lab.api('/api/relay/' + rq.json.sessionId + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}

  const homeWorked = /launcher|Launcher/i.test(afterHome) && !/launcher/i.test(mid)
  console.log(JSON.stringify({
    frames,
    controlEvents: events,
    topBefore: before,
    topDuringApp: mid,
    topAfterHome: afterHome,
    homeWorked,
    result: homeWorked ? 'CONTROL_EXECUTED' : 'NO_EXECUTION',
  }, null, 1))
  process.exit(homeWorked ? 0 : 6)
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1) })
