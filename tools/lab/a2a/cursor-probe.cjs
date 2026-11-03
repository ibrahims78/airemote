#!/usr/bin/env node
'use strict'
// cursor-probe.cjs — يتحقق من مسار المؤشر: وكيل → سيرفر → مشاهد.
// يفتح جلسة relay، يتصل على /screen?binary=1، ويطبع أول حزم screen:cursor
// (موضع مؤشر الضيف بالبكسل) مع عدد الإطارات الثنائية — إثبات أن المؤشر الواحد يُغذّى حقيقياً.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const { DatabaseSync } = require('node:sqlite')

const TARGET = process.argv[2] || 'd147684b-2451-4418-a628-86f11aa66a4e'
const REQUESTER = process.argv[3] || 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const SECONDS = Number(process.argv[4] || 6)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const devToken = (id) => {
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
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    }
  }
  await sleep(600)
  const rq = await post('/api/relay/request', { targetDeviceId: TARGET, access: 'control', requesterDeviceId: REQUESTER }, { 'X-Device-Token': devToken(REQUESTER) })
  if (rq.status !== 201) { console.log('request failed', rq.status); process.exit(1) }
  await sleep(800)
  await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await post('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': devToken(REQUESTER) })
  const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)
  const qs = new URLSearchParams({ rt: u.searchParams.get('rt'), deviceId: TARGET, binary: '1', fps: '15', quality: '60', maxWidth: '1600' })
  const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + qs.toString(), { rejectUnauthorized: false })

  const cursors = []
  let frames = 0
  ws.on('message', (d, bin) => {
    if (bin) { frames++; return }
    let m; try { m = JSON.parse(String(d)) } catch { return }
    if (m && m.type === 'screen:cursor') {
      cursors.push({ x: m.payload.x, y: m.payload.y, w: m.payload.width, h: m.payload.height })
    }
  })
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('ws timeout')), 10000) })
  await sleep(SECONDS * 1000)
  try { ws.close() } catch {}
  try { await lab.api('/api/relay/' + rq.json.sessionId + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}

  const res = {
    target: TARGET,
    binaryFrames: frames,
    cursorMessages: cursors.length,
    first: cursors[0] || null,
    last: cursors[cursors.length - 1] || null,
    result: cursors.length > 0 ? 'CURSOR_RELAY_OK' : 'NO_CURSOR',
  }
  console.log(JSON.stringify(res, null, 1))
  process.exit(cursors.length > 0 ? 0 : 5)
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1) })
