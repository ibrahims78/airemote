'use strict'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const TARGETS = {
  TECNO: '07f8ae91-5b64-41d9-97df-ce649772b0d3',
  EMU: '9b5eeaf9-b30d-449c-875e-1e21e56ac041',
  WIN11: 'd147684b-2451-4418-a628-86f11aa66a4e',
}
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
  for (const [name, id] of Object.entries(TARGETS)) {
    const l = await lab.api('/api/relay/sessions')
    for (const s of (l.json && l.json.sessions) || []) {
      if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    }
    await sleep(500)
    const rq = await post('/api/relay/request', { targetDeviceId: id, access: 'files', requesterDeviceId: WIN10 }, { 'X-Device-Token': devToken(WIN10) })
    if (rq.status !== 201) { console.log(name, 'request', rq.status); continue }
    await sleep(700)
    await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
    const vt = await post('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': devToken(WIN10) })
    for (const p of ['/', '/sdcard', '/C:', '/D:']) {
      const r = await fetch('https://127.0.0.1:3001/api/devices/' + id + '/fs/list?path=' + encodeURIComponent(p) + '&rt=' + encodeURIComponent(vt.json.ticket))
      const j = await r.json().catch(() => ({}))
      const n = Array.isArray(j) ? j.length : (j && j.error ? 'ERR' : 0)
      console.log(name, p, r.status, 'entries=' + n)
    }
    await lab.api('/api/relay/' + rq.json.sessionId + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    await sleep(400)
  }
})()
