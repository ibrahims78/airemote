#!/usr/bin/env node
'use strict'
/**
 * R1 — إثبات أن الملتحق الجديد يحصل على إطار كامل فوراً (force_keyframe)
 * لا بعد انتظار الإطار الأمني الدوري (15s).
 *
 * الطريقة: مشاهد A يفتح الجلسة ويستقر، ثم مشاهد B يلتحق بعد 3 ثوانٍ.
 * نقيس زمن أول إطار عند B ونوعه (كامل أم دلتا).
 *
 * الاستخدام: node scripts/probe-join-keyframe.cjs [--device WIN10]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')

const BASE = 'https://127.0.0.1:3001'
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i !== -1 ? process.argv[i + 1] : d }
const DEVICE = arg('device', 'WIN10')
const creds = JSON.parse(fs.readFileSync('C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json', 'utf8'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function openViewer(ticket, deviceId, label) {
  const ws = new WebSocket(`wss://${BASE.slice(8)}/screen?ticket=${ticket}&deviceId=${deviceId}&binary=1&fps=18&quality=60&maxWidth=1600`)
  ws.binaryType = 'arraybuffer'
  const st = { label, openedAt: 0, firstAt: null, keyframe: null, dims: null, frames: 0 }
  ws.onopen = () => { st.openedAt = Date.now() }
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') return
    const b = Buffer.from(ev.data)
    if (b.length < 13) return
    st.frames++
    if (st.firstAt === null) {
      st.firstAt = Date.now()
      st.keyframe = (b[12] & 1) === 1
      st.dims = `${b.readUInt32BE(0)}x${b.readUInt32BE(4)}`
    }
  }
  return { ws, st }
}

;(async () => {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  }).then((r) => r.json())
  const auth = { Authorization: 'Bearer ' + login.token }
  const list = await fetch(BASE + '/api/devices', { headers: auth }).then((r) => r.json())
  const arr = Array.isArray(list) ? list : list.devices || []
  const dev = arr.find((d) => String(d.name).toLowerCase().includes(DEVICE.toLowerCase()))
  if (!dev || String(dev.status).toLowerCase() !== 'online') {
    console.error('ERROR: الجهاز ' + DEVICE + ' غير متاح/غير متصل')
    process.exit(2)
  }
  const newTicket = () => fetch(BASE + '/api/auth/ws-ticket', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}',
  }).then((r) => r.json()).then((r) => r.ticket)

  const A = openViewer(await newTicket(), dev.id, 'A')
  await sleep(4000) // A مستقر والجلسة قائمة

  const tB0 = Date.now()
  const B = openViewer(await newTicket(), dev.id, 'B')
  await sleep(6000)

  const aFirst = A.st.firstAt ? A.st.firstAt - A.st.openedAt : null
  const bFirst = B.st.firstAt ? B.st.firstAt - B.st.openedAt : null
  const bAfterJoin = B.st.firstAt ? B.st.firstAt - tB0 : null

  const result = {
    device: dev.name,
    viewerA: { firstFrameMs: aFirst, keyframe: A.st.keyframe, dims: A.st.dims, frames: A.st.frames },
    viewerB: { firstFrameMs: bFirst, keyframe: B.st.keyframe, dims: B.st.dims, frames: B.st.frames },
    verdict: bAfterJoin !== null && B.st.keyframe === true && bAfterJoin < 3000 ? 'PASS (keyframe on join < 3s)' : 'FAIL (no timely keyframe for late joiner)',
  }
  console.log(JSON.stringify(result, null, 2))
  try { A.ws.close() } catch {}
  try { B.ws.close() } catch {}
  process.exit(result.verdict.startsWith('PASS') ? 0 : 1)
})().catch((e) => { console.error('ERROR: ' + e.message); process.exit(2) })
