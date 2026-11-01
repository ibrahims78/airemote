'use strict'
// يفتح SessionWebViewActivity مباشرة بتذكرة جلسة جديدة (تحقق بصري من العارض وشريط التنقّل).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const { execFileSync } = require('child_process')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const TECNO = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const EMU = '9b5eeaf9-b30d-449c-875e-1e21e56ac041'
const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const devToken = (id) => {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token
  db.close(); return t
}
const post = async (p, body, headers = {}) => {
  const r = await fetch('https://127.0.0.1:3001' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}
;(async () => {
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(600)
  const rq = await post('/api/relay/request', { targetDeviceId: EMU, access: 'control', requesterDeviceId: TECNO }, { 'X-Device-Token': devToken(TECNO) })
  if (rq.status !== 201) { console.log('request failed', rq.status, JSON.stringify(rq.json)); process.exit(1) }
  await sleep(900)
  await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await post('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': devToken(TECNO) })
  if (!vt.json.viewUrl) { console.log('no viewUrl', JSON.stringify(vt.json).slice(0, 200)); process.exit(1) }
  execFileSync(ADB, ['-s', '12927374CM001019', 'shell', 'am', 'start', '-n', 'com.airemote.agent/.SessionWebViewActivity',
    '--es', 'url', vt.json.viewUrl, '--es', 'sessionId', rq.json.sessionId], { encoding: 'utf8', timeout: 60000 })
  console.log(JSON.stringify({ sid: rq.json.sessionId, opened: true }))
})()
