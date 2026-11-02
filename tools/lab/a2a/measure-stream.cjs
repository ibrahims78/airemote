'use strict'
// قياس سريع للبث: fps الفعلي، أول إطار، متوسط حجم الإطار، والحجم الكلي.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const fs = require('fs')
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const TARGET = process.argv[2] || 'd147684b-2451-4418-a628-86f11aa66a4e'
const SECONDS = Number(process.argv[3] || 12)
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
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(700)
  const rq = await post('/api/relay/request', { targetDeviceId: TARGET, access: 'control', requesterDeviceId: WIN10 }, { 'X-Device-Token': devToken(WIN10) })
  if (rq.status !== 201) { console.log('request', rq.status); process.exit(1) }
  await sleep(900)
  await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await post('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': devToken(WIN10) })
  const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)
  const qs = new URLSearchParams({ rt: u.searchParams.get('rt'), deviceId: TARGET, binary: '1', fps: '18', quality: '60', maxWidth: '1600' })
  const t0 = Date.now()
  const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + qs.toString(), { rejectUnauthorized: false })
  let frames = 0, bytes = 0, first = null
  ws.on('message', (d, bin) => { if (bin) { frames++; bytes += d.length; if (first === null) first = Date.now() - t0 } })
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('timeout')), 12000) })
  await sleep(SECONDS * 1000)
  const res = {
    target: TARGET, seconds: SECONDS, frames, firstFrameMs: first,
    fps: Math.round((frames / SECONDS) * 10) / 10,
    avgFrameKB: frames ? Math.round((bytes / frames / 1024) * 10) / 10 : 0,
    kbps: Math.round((bytes * 8 / 1000 / SECONDS) * 10) / 10,
  }
  try { ws.close() } catch {}
  try { await lab.api('/api/relay/' + rq.json.sessionId + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}
  fs.mkdirSync('D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-02', { recursive: true })
  const out = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-02/stream-measure.json'
  fs.writeFileSync(out, JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
})()
