'use strict'
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
  const rq = await post('/api/relay/request', { targetDeviceId: TECNO, access: 'files', requesterDeviceId: WIN11 }, { 'X-Device-Token': devToken(WIN11) })
  console.log('request', rq.status, rq.json.sessionId)
  await sleep(800)
  await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await post('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': devToken(WIN11) })
  console.log('ticket keys:', Object.keys(vt.json), 'hasRk=', !!vt.json.resumeKey, 'access=', vt.json.access)
  for (const [label, key] of [['rt', vt.json.ticket], ['rk', vt.json.resumeKey]]) {
    if (!key) { console.log(label, 'MISSING'); continue }
    const r = await fetch('https://127.0.0.1:3001/api/devices/' + TECNO + '/fs/list?path=' + encodeURIComponent('/') + '&rt=' + encodeURIComponent(key))
    const j = await r.json().catch(() => ({}))
    console.log(label, 'status', r.status, Array.isArray(j) ? ('entries=' + j.length) : JSON.stringify(j).slice(0, 100))
  }
  await lab.api('/api/relay/' + rq.json.sessionId + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
})()
