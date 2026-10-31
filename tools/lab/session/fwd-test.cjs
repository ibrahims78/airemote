'use strict'
/**
 * 3.9.3 diagnostic — does the server forward screen:mouse_event to the TARGET agent?
 * Registers a temporary agent socket as WIN10, opens a real session TECNO -> WIN10,
 * opens the viewer with the real ticket, sends a click, and reports what the agent got.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path')
const fs = require('fs')
const { DatabaseSync } = require('node:sqlite')
const lab = require(path.join(__dirname, '..', 'lab.cjs'))

function loadWs () {
  try { return require('ws') } catch {}
  const base = path.resolve(__dirname, '..', '..', '..', 'node_modules', '.pnpm')
  for (const d of fs.readdirSync(base).filter(x => /^ws@/.test(x))) {
    try { return require(path.join(base, d, 'node_modules', 'ws')) } catch {}
  }
  throw new Error('ws not found')
}
const WebSocket = loadWs()
const DB = 'C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db'
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const TECNO = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const db = new DatabaseSync(DB, { readOnly: true })
  const t10 = db.prepare('SELECT token FROM devices WHERE id=?').get(WIN10).token
  const ttec = db.prepare('SELECT token FROM devices WHERE id=?').get(TECNO).token
  db.close()

  // 0) close anything still active so the request is not refused with session_conflict
  const existing = await lab.api('/api/relay/sessions')
  for (const s of (existing.json && existing.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      console.log('closed stale', s.id.slice(0, 8), s.state)
    }
  }

  // 1) fake target agent
  const agent = new WebSocket('wss://127.0.0.1:3001/ws?agent=1', { rejectUnauthorized: false })
  const got = []
  agent.on('message', (raw) => { try { const m = JSON.parse(raw.toString()); got.push(m.type) } catch {} })
  await new Promise((res, rej) => { agent.on('open', res); agent.on('error', rej) })
  agent.send(JSON.stringify({ type: 'agent:register', payload: { token: t10, info: { platform: 'windows' }, capabilities: {} } }))
  await sleep(1000)
  console.log('agent registered, got:', got.join(',') || '(none)')

  // 2) session TECNO -> WIN10
  const req = await lab.api('/api/relay/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': ttec },
    body: JSON.stringify({ targetDeviceId: WIN10, access: 'control', requesterDeviceId: TECNO }),
  })
  console.log('request', req.status, req.json && req.json.sessionId, req.json && (req.json.code || ''))
  if (req.status !== 201) { agent.close(); process.exit(2) }
  const sid = req.json.sessionId

  await sleep(600)
  const dec = await lab.api('/api/relay/' + sid + '/decision', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }),
  })
  console.log('decision', dec.status, dec.json && dec.json.state)
  await sleep(800)
  console.log('after accept, agent got:', got.join(','))
  if (!got.includes('session:token')) console.log('!! agent did NOT receive session:token')

  // 3) viewer with the real ticket, then a click at the centre
  const grantRes = await fetch('https://127.0.0.1:3001/api/relay/' + sid + '/view-ticket', {
    method: 'POST', headers: { 'X-Device-Token': ttec },
  })
  const grant = await grantRes.json().catch(() => ({}))
  const rt = grant.ticket
  console.log('ticket', !!rt, grantRes.status, grant.code || '')
  if (!rt) { agent.close(); process.exit(3) }

  const v = new WebSocket('wss://127.0.0.1:3001/screen?deviceId=' + WIN10 + '&rt=' + rt, { rejectUnauthorized: false })
  const vgot = []
  v.on('message', (raw) => { try { const m = JSON.parse(raw.toString()); vgot.push(m.type) } catch { vgot.push('binary') } })
  await new Promise((res, rej) => { v.on('open', res); v.on('error', rej) })
  await sleep(1500)
  v.send(JSON.stringify({ type: 'screen:mouse_event', payload: { type: 'click', x: 0.5, y: 0.5, button: 0 } }))
  await sleep(1500)
  console.log('viewer got:', vgot.slice(0, 6).join(','))
  const fwd = got.filter(t => t === 'server:screen_mouse').length
  console.log(fwd > 0 ? 'FORWARD: screen:mouse_event REACHED the agent (' + fwd + ')' : 'FORWARD: event NOT forwarded')
  v.close(); agent.close()
})()
