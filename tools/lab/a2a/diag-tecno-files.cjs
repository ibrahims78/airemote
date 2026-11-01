'use strict'
// تشخيص: WIN11 → TECNO بوضع الملفات. ماذا يعيد /fs/list ولماذا؟
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const fs = require('fs')
const WIN11 = 'd147684b-2451-4418-a628-86f11aa66a4e'
const TECNO = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/files-mode'
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
  fs.mkdirSync(OUT, { recursive: true })
  const res = {}
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(600)
  const rq = await post('/api/relay/request', { targetDeviceId: TECNO, access: 'files', requesterDeviceId: WIN11 }, { 'X-Device-Token': devToken(WIN11) })
  res.request = rq.status
  res.sid = rq.json.sessionId
  if (rq.status !== 201) { console.log(JSON.stringify(res, null, 1)); process.exit(1) }
  await sleep(1000)
  await lab.api('/api/relay/' + res.sid + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await post('/api/relay/' + res.sid + '/view-ticket', {}, { 'X-Device-Token': devToken(WIN11) })
  res.ticketOk = !!vt.json.ticket
  for (const p of ['/', '/storage/emulated/0', '/sdcard']) {
    const r = await fetch('https://127.0.0.1:3001/api/devices/' + TECNO + '/fs/list?path=' + encodeURIComponent(p) + '&rt=' + encodeURIComponent(vt.json.ticket))
    const j = await r.json().catch(() => ({}))
    res['list' + p] = { status: r.status, body: JSON.stringify(j).slice(0, 220) }
  }
  await sleep(500)
  try { await lab.api('/api/relay/' + res.sid + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}
  fs.writeFileSync(OUT + '/diagnose-tecno.json', JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
})().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(1) })
