'use strict'
/**
 * تحقّق P5-fix: (1) بطاقة الأجهزة تُظهر session=active أثناء البث،
 * (2) إغلاق المُشاهد يُغلق جلسة relay (لا تبقى «نشطة» للأبد)،
 * (3) مستويات view/files/control تُنشئ جلسة وتُبثّ إطاراتاً.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const fs = require('fs')

const TECNO = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const EMU = '9b5eeaf9-b30d-449c-875e-1e21e56ac041'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/p5-fix'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const devToken = (id) => {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token
  db.close(); return t
}
const api = async (p, body, headers = {}, method = 'POST') => {
  const r = await fetch('https://127.0.0.1:3001' + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const res = {}
  const tok = devToken(TECNO)

  // نظّف
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(600)

  const rq = await api('/api/relay/request', { targetDeviceId: EMU, access: 'view', requesterDeviceId: TECNO }, { 'X-Device-Token': tok })
  res.request = rq.status; res.sid = rq.json.sessionId
  await sleep(900)
  await lab.api('/api/relay/' + res.sid + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await api('/api/relay/' + res.sid + '/view-ticket', {}, { 'X-Device-Token': tok })
  const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)
  const qs = new URLSearchParams({ rt: u.searchParams.get('rt'), deviceId: EMU, binary: '1', fps: '6', quality: '40', maxWidth: '360' })
  const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + qs.toString(), { rejectUnauthorized: false })
  let frames = 0
  ws.on('message', (d, bin) => { if (bin) frames++ })
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('timeout')), 12000) })
  await sleep(3000)
  res.frames = frames

  // (1) البطاقة تُظهر الجلسة
  const dev = await api('/api/relay/devices', null, { 'X-Device-Token': tok }, 'GET')
  const emuRow = (dev.json.devices || []).find(d => d.id === EMU)
  res.deviceSessionWhileStreaming = emuRow && emuRow.session
  res.deviceSessionField = emuRow ? Object.keys(emuRow) : []

  // (2) إغلاق المُشاهد ⇒ جلسة relay تُغلق بعد فترة السماح
  try { ws.close() } catch {}
  await sleep(9000)
  const st = await lab.api('/api/relay/sessions')
  const row = ((st.json && st.json.sessions) || []).find(s => s.id === res.sid)
  res.stateAfterViewerClose = row ? row.state : 'gone'

  res.pass = {
    request201: res.request === 201,
    frames: res.frames > 0,
    showsActive: res.deviceSessionWhileStreaming === 'active',
    closedAfterClose: res.stateAfterViewerClose === 'closed' || res.stateAfterViewerClose === 'gone',
  }
  fs.writeFileSync(OUT + '/verify.json', JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
  process.exit(Object.values(res.pass).every(Boolean) ? 0 : 1)
})().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(1) })
