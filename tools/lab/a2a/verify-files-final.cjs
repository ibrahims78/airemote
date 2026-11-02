'use strict'
// تحقّق شامل لوضع الملفات: عمر التذكرة، الجذر، /storage، وبقاء الجلسة بعد القبول.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const fs = require('fs')
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
  const res = {}
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(600)
  const rq = await post('/api/relay/request', { targetDeviceId: TECNO, access: 'files', requesterDeviceId: WIN11 }, { 'X-Device-Token': devToken(WIN11) })
  res.request = rq.status
  res.sid = rq.json.sessionId
  await sleep(800)
  await lab.api('/api/relay/' + res.sid + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await post('/api/relay/' + res.sid + '/view-ticket', {}, { 'X-Device-Token': devToken(WIN11) })
  res.ticketTtlHours = Math.round((new Date(vt.json.expiresAt).getTime() - Date.now()) / 3600000)
  res.access = vt.json.access
  for (const p of ['/', '/sdcard', '/storage', '/storage/emulated/0']) {
    const r = await fetch('https://127.0.0.1:3001/api/devices/' + TECNO + '/fs/list?path=' + encodeURIComponent(p) + '&rt=' + encodeURIComponent(vt.json.ticket))
    const j = await r.json().catch(() => ({}))
    res['list' + p] = { status: r.status, entries: Array.isArray(j) ? j.length : 'ERR' }
  }
  await sleep(3000)
  const st = await lab.api('/api/relay/sessions')
  const row = ((st.json && st.json.sessions) || []).find(s => s.id === res.sid)
  res.stateAfter5s = row ? row.state : 'gone'
  res.pass = {
    ttl12h: res.ticketTtlHours >= 11,
    rootHasEntries: res['list/'] && res['list/'].entries >= 3,
    sdcardHasEntries: res['list/sdcard'] && res['list/sdcard'].entries > 0,
    storageMapped: res['list/storage'] && res['list/storage'].status === 200 && res['list/storage'].entries > 0,
    sessionStaysActive: res.stateAfter5s === 'active',
  }
  await lab.api('/api/relay/' + res.sid + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  fs.mkdirSync('D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-02', { recursive: true })
  fs.writeFileSync('D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-02/files-final.json', JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
  process.exit(Object.values(res.pass).every(Boolean) ? 0 : 1)
})()
