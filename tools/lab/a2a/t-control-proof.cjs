'use strict'
/**
 * إثبات حتمي لمسار التحكم (بلا هاتف): جلسة كمستخدم → تذكرة عرض → مقبس → أحداث.
 * يتحقق من: (أ) أثر الوكيل grant + mouse/key بـgranted=true، (ب) مؤشّر الهدف.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path'); const fs = require('fs')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const g = require('./vmguest.cjs')

const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const VM = 'win10'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/control-proof'
const TRACE = 'C:\\Users\\admin\\AppData\\Roaming\\airemote-agent-desktop\\input-trace.log'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const cursor = () => g.ps(VM, path.join(__dirname, 'cursor.ps1')).replace(/^\uFEFF/, '').trim()
const dims = () => g.ps(VM, path.join(__dirname, 'dims.ps1')).replace(/^\uFEFF/, '').trim()
const trace = (n = 30) => {
  try { g.copyOut(VM, TRACE, path.join(__dirname, 'trp.txt')); const t = fs.readFileSync(path.join(__dirname, 'trp.txt'), 'utf8'); return t.trim() ? t.trim().split(/\r?\n/).slice(-n) : [] } catch { return [] }
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const res = { startedAt: new Date().toISOString() }
  res.screen = dims()
  const [wh] = res.screen.split(' @')
  const [SW, SH] = wh.split('x').map(Number)

  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(1000)

  // كجهاز طالب (TECNO) حتى تُصدر تذكرة العرض لهذا الجهاز
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const TECNO_ID = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
  const devTok = db.prepare('SELECT token FROM devices WHERE id=?').get(TECNO_ID).token
  db.close()
  const devApi = async (p, body) => {
    const r = await fetch('https://127.0.0.1:3001' + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Token': devTok },
      body: JSON.stringify(body || {}),
    })
    const j = await r.json().catch(() => ({}))
    return { status: r.status, json: j }
  }
  const rq = await devApi('/api/relay/request', { targetDeviceId: WIN10, access: 'control', requesterDeviceId: TECNO_ID })
  res.request = rq.status
  if (rq.status !== 201) { res.error = JSON.stringify(rq.json); fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); process.exit(2) }
  res.sid = rq.json.sessionId
  await sleep(1200)
  const dec = await lab.api('/api/relay/' + res.sid + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  res.decision = dec.json && dec.json.state

  const vt = await devApi('/api/relay/' + res.sid + '/view-ticket', {})
  if (vt.status !== 200 || !vt.json || !vt.json.viewUrl) { res.error = 'ticket ' + vt.status; fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); process.exit(3) }
  const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)
  const rt = u.searchParams.get('rt')
  res.access = u.searchParams.get('access')

  // انتظر منح الوكيل
  let granted = false
  for (let i = 0; i < 20; i++) { await sleep(500); if (trace(60).some(x => x.includes('grant sid=' + res.sid))) { granted = true; break } }
  res.grantSeen = granted

  const qs = new URLSearchParams({ rt, deviceId: WIN10, binary: '1', fps: '10', quality: '70', maxWidth: '1600' })
  const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + qs.toString(), { rejectUnauthorized: false })
  let frames = 0
  ws.on('message', d => { if (Buffer.isBuffer(d) && d.length > 40) frames++ })
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('ws timeout')), 15000) })
  for (let i = 0; i < 40 && frames === 0; i++) await sleep(250)
  res.frames = frames
  res.cursorBefore = cursor()

  const send = (o) => ws.send(JSON.stringify(o))
  const target = { fx: 0.3, fy: 0.3 }
  send({ type: 'screen:mouse_event', payload: { type: 'move', x: target.fx, y: target.fy } })
  await sleep(800)
  send({ type: 'screen:mouse_event', payload: { type: 'click', x: target.fx, y: target.fy, button: 0 } })
  await sleep(1200)
  for (const ch of ['A', 'i', 'R']) send({ type: 'screen:key_event', payload: { type: 'press', key: ch } })
  await sleep(1500)

  res.cursorAfter = cursor()
  const [bx, by] = res.cursorBefore.split(',').map(Number)
  const [ax, ay] = res.cursorAfter.split(',').map(Number)
  res.expected = { x: Math.round(SW * target.fx), y: Math.round(SH * target.fy) }
  res.cursorDelta = { dx: ax - bx, dy: ay - by }
  res.cursorMatches = Math.abs(ax - res.expected.x) <= 3 && Math.abs(ay - res.expected.y) <= 3

  const t = trace(40)
  res.mouseLines = t.filter(x => x.includes('mouse') && x.includes(res.sid))
  res.keyLines = t.filter(x => x.includes('key type=') && x.includes(res.sid))
  res.grantedTrue = res.mouseLines.some(x => x.includes('granted=true')) && res.keyLines.some(x => x.includes('granted=true'))

  try { ws.close() } catch {}
  try { await lab.api('/api/relay/' + res.sid + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}
  fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
})().catch(e => { console.error('ERR ' + e.message); process.exit(1) })
