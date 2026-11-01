'use strict'
/** ينشئ جلسة TECNO→WIN10 ويقبلها، ثم ينتظر فتح العرض. */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const { DatabaseSync } = require('node:sqlite')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const TECNO_ID = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const tok = db.prepare('SELECT token FROM devices WHERE id=?').get(TECNO_ID).token
  db.close()
  const post = async (p, body, headers = {}) => {
    const r = await fetch('https://127.0.0.1:3001' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) })
    return { status: r.status, json: await r.json().catch(() => ({})) }
  }
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  const rq = await post('/api/relay/request', { targetDeviceId: WIN10, access: 'control', requesterDeviceId: TECNO_ID }, { 'X-Device-Token': tok })
  console.log('request', rq.status, rq.json.sessionId || rq.json.code)
  if (rq.status !== 201) process.exit(2)
  await sleep(1500)
  const d = await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  console.log('decision', d.status, d.json && d.json.state)
  await sleep(9000)
  console.log('SID=' + rq.json.sessionId)
})()
