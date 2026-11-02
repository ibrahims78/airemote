'use strict'
// يفتح عارضاً على المحاكي لهدف WIN11 مع تعليم platform=android لاختبار ظهور أزرار أندرويد داخل الشريط.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const { execFileSync } = require('child_process')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const WIN11 = 'd147684b-2451-4418-a628-86f11aa66a4e'
const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const devToken = (id) => {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token
  db.close(); return t
}
const post = async (p, b, h = {}) => {
  const r = await fetch('https://127.0.0.1:3001' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b || {}) })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}
;(async () => {
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(600)
  const rq = await post('/api/relay/request', { targetDeviceId: WIN11, access: 'control', requesterDeviceId: WIN10 }, { 'X-Device-Token': devToken(WIN10) })
  if (rq.status !== 201) { console.log('request', rq.status); process.exit(1) }
  await sleep(800)
  await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await post('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': devToken(WIN10) })
  const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)
  u.searchParams.set('platform', 'android')
  const target = u.pathname + '?' + u.searchParams.toString()
  execFileSync(ADB, ['-s', 'emulator-5554', 'shell', 'am', 'start', '-n', 'com.airemote.agent/.SessionWebViewActivity',
    '--es', 'url', target, '--es', 'sessionId', rq.json.sessionId], { encoding: 'utf8', timeout: 60000 })
  console.log(JSON.stringify({ sid: rq.json.sessionId, opened: target.slice(0, 60) + '…' }))
})()
