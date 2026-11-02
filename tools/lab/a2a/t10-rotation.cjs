'use strict'
// T10 — تدوير الشاشة أثناء جلسة Relay: هل يستمر البث بلا شاشة سوداء؟
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const { execFileSync } = require('child_process')
const fs = require('fs')
const ADB = 'D:/autoclaw projects/open-build-tools/adb.exe'
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const TARGET = process.argv[2]
const SERIAL = process.argv[3] || 'emulator-5554'
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
let adbOk = true
const adb = (args) => { try { execFileSync('D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe', ['-s', SERIAL, ...args], { encoding: 'utf8', timeout: 60000 }); return true } catch (e) { adbOk = false; return false } }
;(async () => {
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(700)
  adb(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0'])
  adb(['shell', 'settings', 'put', 'system', 'user_rotation', '0'])
  await sleep(500)
  const rq = await post('/api/relay/request', { targetDeviceId: TARGET, access: 'control', requesterDeviceId: WIN10 }, { 'X-Device-Token': devToken(WIN10) })
  if (rq.status !== 201) { console.log(JSON.stringify({ pass: false, reason: 'request ' + rq.status })); process.exit(1) }
  await sleep(900)
  await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await post('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': devToken(WIN10) })
  const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)
  const qs = new URLSearchParams({ rt: u.searchParams.get('rt'), deviceId: TARGET, binary: '1', fps: '8', quality: '60', maxWidth: '900' })
  const t0 = Date.now()
  const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + qs.toString(), { rejectUnauthorized: false })
  const before = [], after = []
  let first = null, phase = 'before'
  ws.on('message', (d, bin) => { if (!bin) return; if (first === null) first = Date.now() - t0; (phase === 'before' ? before : after).push(d.length) })
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('ws timeout')), 12000) })
  await sleep(3000)
  const rot = adb(['shell', 'settings', 'put', 'system', 'user_rotation', '1'])
  phase = 'after'
  const tRot = Date.now()
  await sleep(5000)
  const back = adb(['shell', 'settings', 'put', 'system', 'user_rotation', '0'])
  await sleep(1000)
  try { ws.close() } catch {}
  const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0
  const res = {
    target: TARGET, serial: SERIAL, rotationApplied: rot, restored: back, adbOk,
    firstFrameMs: first, framesBefore: before.length, framesAfter: after.length,
    avgBytesBefore: avg(before), avgBytesAfter: avg(after),
    ratioAfterBefore: avg(before) ? +(avg(after) / avg(before)).toFixed(2) : null,
    msAfterRotation: Date.now() - tRot,
    pass: { streamContinues: after.length > 0, notBlack: avg(before) ? (avg(after) / avg(before)) > 0.2 : null },
  }
  fs.mkdirSync('outputs/verify-2026-11-02/t10', { recursive: true })
  fs.writeFileSync('outputs/verify-2026-11-02/t10/rotation.json', JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
  try { await lab.api('/api/relay/' + rq.json.sessionId + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}
  process.exit(0)
})().catch(e => { console.log(JSON.stringify({ pass: false, error: String(e && e.message || e) })); process.exit(1) })