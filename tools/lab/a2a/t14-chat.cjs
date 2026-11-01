'use strict'
/**
 * T14 — دردشة الجلسة: مشاهد A يُرسل، ومشاهد B يستقبل، على جلسة Relay حقيقية.
 * النجاح: B يستقبل `screen:chat` بنفس النص، وA لا يستقبل رسالته كصدى.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const fs = require('fs')

const TARGET = 'd147684b-2451-4418-a628-86f11aa66a4e'   // WIN11-VM
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/t14'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const devToken = (id) => {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token
  db.close(); return t
}
const req = async (p, body, headers = {}) => {
  const r = await fetch('https://127.0.0.1:3001' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const res = {}
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    }
  }
  await sleep(700)

  const tok = devToken(WIN10)
  const rq = await req('/api/relay/request', { targetDeviceId: TARGET, access: 'control', requesterDeviceId: WIN10 }, { 'X-Device-Token': tok })
  res.request = rq.status; res.sid = rq.json.sessionId
  if (rq.status !== 201) { console.log(JSON.stringify(res, null, 1)); process.exit(2) }
  await sleep(1000)
  await lab.api('/api/relay/' + res.sid + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })

  const ticket = async () => (await req('/api/relay/' + res.sid + '/view-ticket', {}, { 'X-Device-Token': tok })).json.viewUrl
  const open = async () => {
    const v = await ticket()
    const u = new URL('https://127.0.0.1:3001' + v)
    const qs = new URLSearchParams({ rt: u.searchParams.get('rt'), deviceId: TARGET, binary: '1', fps: '4', quality: '40', maxWidth: '360' })
    const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + qs.toString(), { rejectUnauthorized: false })
    const msgs = []
    ws.on('message', (d, bin) => { if (!bin) { try { msgs.push(JSON.parse(d.toString())) } catch {} } })
    await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('ws timeout')), 15000) })
    return { ws, msgs }
  }

  const A = await open()
  await sleep(800)
  const B = await open()
  await sleep(1200)

  const text = 't14-' + Date.now()
  A.ws.send(JSON.stringify({ type: 'screen:chat', payload: { text, sender: 'A' } }))
  await sleep(1500)

  const gotB = B.msgs.filter(m => m.type === 'screen:chat' && m.payload && m.payload.text === text)
  const gotA = A.msgs.filter(m => m.type === 'screen:chat' && m.payload && m.payload.text === text)
  res.text = text
  res.viewerBGot = gotB.length
  res.viewerASawOwnEcho = gotA.length
  res.pass = gotB.length === 1 && gotA.length === 0

  try { A.ws.close() } catch {}
  try { B.ws.close() } catch {}
  try { await lab.api('/api/relay/' + res.sid + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}

  fs.writeFileSync(OUT + '/chat.json', JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
  process.exit(res.pass ? 0 : 1)
})().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(1) })
