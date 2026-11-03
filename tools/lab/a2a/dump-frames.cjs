#!/usr/bin/env node
'use strict'
/**
 * dump-frames.cjs — يعيد بناء أداة القياس المفقودة (audit/dump-frame.cjs).
 *
 * يفتح جلسة relay نحو جهاز هدف، يتصل كمشاهد على /screen?binary=1، ويفكّ ترويسة
 * الإطار (w,h,seq,flags[,dx,dy]) ويحفظ كل حمولة JPEG على القرص مع فهرس JSONL.
 *
 * الاستخدام:
 *   node tools/lab/a2a/dump-frames.cjs <targetDeviceId> [seconds] [outDir] [requesterDeviceId]
 *
 * ملاحظات:
 *   - يقيس الإطارات الحيّة فقط؛ إطار السيرفر المخبَّأ يظهر كإطار واحد عند الاتصال.
 *   - السطوع يُقاس لاحقاً بـ python (Pillow) — لا يُستنتج من حجم الإطار.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const path = require('path')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')

const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const TARGET = process.argv[2]
const SECONDS = Number(process.argv[3] || 8)
const OUT = process.argv[4] || 'D:/autoclaw projects-new/AiRemote/outputs/audit-frames'
const REQUESTER = process.argv[5] || (TARGET === WIN10 ? 'd147684b-2451-4418-a628-86f11aa66a4e' : WIN10)

if (!TARGET) { console.error('usage: dump-frames.cjs <targetDeviceId> [seconds] [outDir] [requesterId]'); process.exit(2) }

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
  for (const f of fs.readdirSync(OUT)) if (/^frame_\d+\.jpg$/.test(f) || f === 'index.jsonl') fs.unlinkSync(path.join(OUT, f))

  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    }
  }
  await sleep(700)

  const rq = await post('/api/relay/request', { targetDeviceId: TARGET, access: 'control', requesterDeviceId: REQUESTER }, { 'X-Device-Token': devToken(REQUESTER) })
  if (rq.status !== 201) { console.log('request failed', rq.status, JSON.stringify(rq.json).slice(0, 200)); process.exit(1) }
  await sleep(900)
  await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await post('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': devToken(REQUESTER) })
  const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)
  const qs = new URLSearchParams({ rt: u.searchParams.get('rt'), deviceId: TARGET, binary: '1', fps: '15', quality: '60', maxWidth: '1600' })

  const t0 = Date.now()
  const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + qs.toString(), { rejectUnauthorized: false })
  const idx = []
  let n = 0
  ws.on('message', (d, bin) => {
    if (!bin || d.length < 14) return
    const view = new DataView(d.buffer, d.byteOffset, d.byteLength)
    const width = view.getUint32(0), height = view.getUint32(4), seq = view.getUint32(8), flags = view.getUint8(12)
    const isDelta = (flags & 2) !== 0
    const hdr = 13 + (isDelta ? 8 : 0)
    const jpeg = d.subarray(hdr)
    n++
    const name = 'frame_' + String(n).padStart(4, '0') + '.jpg'
    fs.writeFileSync(path.join(OUT, name), jpeg)
    idx.push({ n, name, width, height, seq, flags, delta: isDelta, jpegBytes: jpeg.length, atMs: Date.now() - t0 })
  })
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('ws timeout')), 12000) })
  await sleep(SECONDS * 1000)
  try { ws.close() } catch {}
  try { await lab.api('/api/relay/' + rq.json.sessionId + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}

  fs.writeFileSync(path.join(OUT, 'index.jsonl'), idx.map(o => JSON.stringify(o)).join('\n') + '\n')
  const sizes = idx.map(o => o.jpegBytes)
  const summary = {
    outDir: OUT, target: TARGET, requester: REQUESTER, seconds: SECONDS, frames: n,
    firstFrameMs: idx.length ? idx[0].atMs : null,
    dims: idx.length ? idx[0].width + 'x' + idx[0].height : null,
    flagsSeen: [...new Set(idx.map(o => o.flags))],
    jpegBytesMin: sizes.length ? Math.min(...sizes) : 0,
    jpegBytesMax: sizes.length ? Math.max(...sizes) : 0,
    jpegBytesAvg: sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0,
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1))
  console.log(JSON.stringify(summary, null, 1))
  process.exit(n > 0 ? 0 : 5)
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1) })
