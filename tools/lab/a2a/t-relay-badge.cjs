'use strict'
// يتحقق من حقل relay في /api/devices أثناء جلسة وكيل↔وكيل حقيقية.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const fs = require('fs')
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const WIN11 = 'd147684b-2451-4418-a628-86f11aa66a4e'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const devToken = (id) => {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token
  db.close(); return t
}
;(async () => {
  const res = {}
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(600)
  const r = await fetch('https://127.0.0.1:3001/api/relay/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': devToken(WIN10) },
    body: JSON.stringify({ targetDeviceId: WIN11, access: 'view', requesterDeviceId: WIN10 }),
  })
  const j = await r.json()
  res.request = r.status; res.sid = j.sessionId
  await sleep(900)
  await lab.api('/api/relay/' + res.sid + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  await sleep(1200)
  const d = await lab.api('/api/devices')
  const rows = Array.isArray(d.json) ? d.json : (d.json.devices || [])
  res.requesterRow = rows.filter(x => x.id === WIN10).map(x => ({ name: x.name, relay: x.relay }))
  res.targetRow = rows.filter(x => x.id === WIN11).map(x => ({ name: x.name, relay: x.relay }))
  await lab.api('/api/relay/' + res.sid + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  await sleep(500)
  const d2 = await lab.api('/api/devices')
  const rows2 = Array.isArray(d2.json) ? d2.json : (d2.json.devices || [])
  res.afterClose = rows2.filter(x => x.id === WIN10).map(x => ({ relay: x.relay }))
  fs.mkdirSync('D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/relay-badge', { recursive: true })
  fs.writeFileSync('D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/relay-badge/badge.json', JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
})().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(1) })
