'use strict'
// جلسة WIN10 → Emulator (تحكم) ليُفتح العارض على ويندوز بهدف أندرويد ويظهر شريط الأدوات بأزراره.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
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
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': devToken(WIN10) },
    body: JSON.stringify({ targetDeviceId: EMU, access: 'control', requesterDeviceId: WIN10 }),
  })
  const j = await r.json().catch(() => ({}))
  console.log(JSON.stringify({ status: r.status, sid: j.sessionId }))
  if (r.status === 201) {
    await sleep(800)
    await lab.api('/api/relay/' + j.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
    console.log('accepted')
  }
})()
