'use strict'
// يعيد إنتاج: WIN11 → TECNO (ملفات) بدون قبول تلقائي. يترك الطلب معلّقاً للفحص.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const WIN11 = 'd147684b-2451-4418-a628-86f11aa66a4e'
const TECNO = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const devToken = (id) => {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token
  db.close(); return t
}
;(async () => {
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(700)
  const r = await fetch('https://127.0.0.1:3001/api/relay/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': devToken(WIN11) },
    body: JSON.stringify({ targetDeviceId: TECNO, access: 'files', requesterDeviceId: WIN11 }),
  })
  const j = await r.json().catch(() => ({}))
  console.log(JSON.stringify({ status: r.status, sid: j.sessionId, code: j.code || j.error || null }))
})()
