'use strict'
// T12 — الحافظة داخل جلسة Relay: العارض يفعّل المزامنة (to-viewer)، نغيّر حافظة الهدف،
// ونتحقق أن التغيير وصل العارض عبر screen:clipboard_change.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const fs = require('fs')
const path = require('path')
const vg = require('D:/autoclaw projects-new/AiRemote/tools/lab/a2a/vmguest.cjs')
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const TARGET = process.argv[2] || 'd147684b-2451-4418-a628-86f11aa66a4e'
const VM = process.argv[3] || 'win11'
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
  const out = { target: TARGET, vm: VM, steps: {}, pass: {} }
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(700)
  const rq = await post('/api/relay/request', { targetDeviceId: TARGET, access: 'control', requesterDeviceId: WIN10 }, { 'X-Device-Token': devToken(WIN10) })
  out.steps.request = rq.status
  if (rq.status !== 201) { console.log(JSON.stringify(out)); process.exit(1) }
  await sleep(900)
  await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await post('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': devToken(WIN10) })
  out.steps.ticket = vt.status
  const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)
  const qs = new URLSearchParams({ rt: u.searchParams.get('rt'), deviceId: TARGET, binary: '1', fps: '2', quality: '40', maxWidth: '640' })
  const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + qs.toString(), { rejectUnauthorized: false })
  const seen = []
  ws.on('message', (d, bin) => {
    if (bin) return
    try { const m = JSON.parse(d.toString()); if (m && /clipboard/.test(String(m.type))) seen.push({ type: m.type, payload: m.payload }) } catch {}
  })
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('ws timeout')), 12000) })
  ws.send(JSON.stringify({ type: 'screen:clipboard_sync_enable', payload: { enabled: true } }))
  await sleep(400)
  ws.send(JSON.stringify({ type: 'screen:clipboard_sync_direction', payload: { direction: 'to-viewer' } }))
  await sleep(800)
  vg.ps(VM, 'D:/autoclaw projects-new/AiRemote/tools/lab/a2a/set-clip.ps1')
  const markerPath = 'C:/Users/admin/AppData/Local/Temp/ar-clip-marker.txt'
  try { vg.copyOut(VM, 'C:\\Users\\admin\\clip-marker.txt', markerPath) } catch (e) { out.steps.copyOut = String(e.message) }
  const marker = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf8').trim() : ''
  out.marker = marker
  const t0 = Date.now()
  while (Date.now() - t0 < 9000) {
    const hit = seen.find(m => JSON.stringify(m.payload || {}).includes(marker) && marker)
    if (hit) break
    await sleep(250)
  }
  out.messages = seen.map(m => m.type)
  const hit = seen.find(m => marker && JSON.stringify(m.payload || {}).includes(marker))
  out.pass.markerReceived = !!hit
  // screen:clipboard_apply هو آلية التسليم إلى العارض (لا صدى): وجوده مع العلامة = نجاح.
  out.pass.deliveredViaApply = !!(hit && hit.type === 'screen:clipboard_apply')
  out.received = hit ? hit.type : null
  try { ws.close() } catch {}
  fs.mkdirSync('outputs/verify-2026-11-02/t12', { recursive: true })
  fs.writeFileSync('outputs/verify-2026-11-02/t12/clipboard.json', JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out, null, 1))
  try { await lab.api('/api/relay/' + rq.json.sessionId + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}
  process.exit(0)
})().catch(e => { console.log(JSON.stringify({ pass: false, error: String(e && e.message || e) })); process.exit(1) })