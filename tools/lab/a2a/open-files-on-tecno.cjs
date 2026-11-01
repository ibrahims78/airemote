'use strict'
// يفتح جلسة TECNO → Emulator بوضع الملفات (TECNO هو الطالب) لتظهر صفحة الملفات على الجهاز.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const fs = require('fs')
const TECNO = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const EMU = '9b5eeaf9-b30d-449c-875e-1e21e56ac041'
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
  const rq = await post('/api/relay/request', { targetDeviceId: EMU, access: 'files', requesterDeviceId: TECNO }, { 'X-Device-Token': devToken(TECNO) })
  const out = { request: rq.status, sid: rq.json.sessionId }
  if (rq.status === 201) {
    await sleep(900)
    await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
    out.accepted = true
  }
  fs.writeFileSync('D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/files-mode/live-tecno.json', JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out))
})()
