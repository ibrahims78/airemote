'use strict'
/**
 * 3.11 — تحقّق وضع الملفات في وكيل↔وكيل:
 *  A) جلسة access=files: تذكرة الجلسة تفتح /fs/list (200 مع عناصر).
 *  B) جلسة access=view: نفس المسار يُرفض 403 (التذكرة لا تفتح الملفات).
 *  C) بلا تذكرة وبدون JWT: 401/403.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const fs = require('fs')
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const WIN11 = 'd147684b-2451-4418-a628-86f11aa66a4e'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/files-mode'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const devToken = (id) => {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token
  db.close(); return t
}
const req = async (p, body, headers = {}, method = 'POST') => {
  const r = await fetch('https://127.0.0.1:3001' + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

async function openSession (access) {
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(600)
  const rq = await req('/api/relay/request', { targetDeviceId: WIN11, access, requesterDeviceId: WIN10 }, { 'X-Device-Token': devToken(WIN10) })
  if (rq.status !== 201) return { error: 'request ' + rq.status, body: rq.json }
  await sleep(900)
  await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await req('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': devToken(WIN10) })
  return { sid: rq.json.sessionId, ticket: vt.json.ticket, access: vt.json.access }
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const res = {}

  const files = await openSession('files')
  res.filesSession = files
  if (files.ticket) {
    const list = await req('/api/devices/' + WIN11 + '/fs/list?path=/&rt=' + encodeURIComponent(files.ticket), null, {}, 'GET')
    const arr = Array.isArray(list.json) ? list.json : ((list.json && list.json.entries) || [])
    res.filesList = { status: list.status, count: arr.length, sample: arr.slice(0, 3).map(e => e.name) }
  }
  if (files.sid) await lab.api('/api/relay/' + files.sid + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  await sleep(500)

  const view = await openSession('view')
  res.viewSession = { sid: view.sid, access: view.access }
  if (view.ticket) {
    const denied = await req('/api/devices/' + WIN11 + '/fs/list?path=/&rt=' + encodeURIComponent(view.ticket), null, {}, 'GET')
    res.viewTicketOnFs = { status: denied.status, code: denied.json && denied.json.code }
  }
  if (view.sid) await lab.api('/api/relay/' + view.sid + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })

  const noAuth = await req('/api/devices/' + WIN11 + '/fs/list?path=/', null, {}, 'GET')
  res.noAuth = { status: noAuth.status }

  const anonOk = (res.noAuth.status === 401) || (res.noAuth.status === 403)
  res.pass = {
    filesTicketOpensList: res.filesList && res.filesList.status === 200,
    viewTicketRejected: res.viewTicketOnFs && res.viewTicketOnFs.status === 403,
    anonymousRejected: anonOk,
  }
  fs.writeFileSync(OUT + '/verify.json', JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
  process.exit(Object.values(res.pass).every(Boolean) ? 0 : 1)
})().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(1) })
