'use strict'
// يفتح جلسة TECNO → Emulator (control) ويتركها مفتوحة 20 ثانية لالتقاط لقطات.
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
;(async () => {
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(600)
  const r = await fetch('https://127.0.0.1:3001/api/relay/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': devToken(TECNO) },
    body: JSON.stringify({ targetDeviceId: EMU, access: 'control', requesterDeviceId: TECNO }),
  })
  const j = await r.json()
  const out = { request: r.status, sid: j.sessionId }
  if (r.status === 201) {
    await sleep(900)
    await lab.api('/api/relay/' + j.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
    out.accepted = true
  }
  fs.writeFileSync('D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/a2a-matrix/live-session.json', JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out))
})().catch(e => { console.error('ERR ' + e.message); process.exit(1) })
