'use strict'
/** يطبع رسائل JSON التي يرسلها السيرفر للمُشاهد (سبب إغلاق جلسة الشاشة). */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const { execFileSync } = require('child_process')
const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const TECNO_ID = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const WIN10_ID = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const devToken = (id) => { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true }); const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token; db.close(); return t }

;(async () => {
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(800)
  const req = async (p, body, headers = {}) => {
    const r = await fetch('https://127.0.0.1:3001' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) })
    return { status: r.status, json: await r.json().catch(() => ({})) }
  }
  const tok = devToken(WIN10_ID)
  const rq = await req('/api/relay/request', { targetDeviceId: TECNO_ID, access: 'control', requesterDeviceId: WIN10_ID }, { 'X-Device-Token': tok })
  await sleep(1200)
  await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await req('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': tok })
  const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)
  const qs = new URLSearchParams({ rt: u.searchParams.get('rt'), deviceId: TECNO_ID, binary: '1', fps: '8', quality: '50', maxWidth: '480' })
  const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + qs.toString(), { rejectUnauthorized: false })
  const msgs = []
  ws.on('message', d => { if (typeof d === 'string' || (Buffer.isBuffer(d) && d.length < 200)) msgs.push(String(d).slice(0, 200)) })
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('t')), 15000) })
  await sleep(4000)
  console.log('READY=' + ws.readyState)
  console.log('MSGS=' + JSON.stringify(msgs, null, 1))
  try { ws.close() } catch {}
  try { await lab.api('/api/relay/' + rq.json.sessionId + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}
})().catch(e => { console.error('ERR ' + e.message); process.exit(1) })
