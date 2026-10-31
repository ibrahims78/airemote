'use strict'
// Does the server deliver session:ticket to the requesting DEVICE socket?
// Registers a temporary agent socket with TECNO's token, requests TECNO->WIN10,
// accepts from the owner API, and reports every message type received.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path')
const { DatabaseSync } = require('node:sqlite')
function loadWs () {
  const fs = require('fs')
  try { return require('ws') } catch {}
  const base = path.resolve(__dirname, '..', '..', '..', 'node_modules', '.pnpm')
  for (const d of fs.readdirSync(base).filter(x => /^ws@/.test(x))) {
    try { return require(path.join(base, d, 'node_modules', 'ws')) } catch {}
  }
  throw new Error('ws module not found')
}
const WebSocket = loadWs()
const lab = require(path.join(__dirname, '..', 'lab.cjs'))

const DB = 'C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db'
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const TECNO = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const db = new DatabaseSync(DB, { readOnly: true })
  const tok = db.prepare('SELECT token FROM devices WHERE id=?').get(TECNO).token
  db.close()

  const ws = new WebSocket('wss://127.0.0.1:3001/ws?agent=1', { rejectUnauthorized: false })
  const seen = []
  ws.on('message', (raw) => {
    try { const m = JSON.parse(raw.toString()); seen.push(m.type) } catch {}
  })
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
  ws.send(JSON.stringify({ type: 'agent:register', payload: { token: tok, info: { platform: 'android' }, capabilities: {} } }))
  await sleep(1200)
  console.log('registered, types so far:', seen.join(','))

  const r = await lab.api('/api/relay/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': tok },
    body: JSON.stringify({ targetDeviceId: WIN10, access: 'control', requesterDeviceId: TECNO }),
  })
  console.log('request', r.status, r.json && r.json.sessionId, r.json && (r.json.code || ''))
  if (r.status !== 201) { ws.close(); process.exit(2) }
  const sid = r.json.sessionId

  await sleep(800)
  const d = await lab.api('/api/relay/' + sid + '/decision', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }),
  })
  console.log('decision', d.status, d.json && d.json.state)
  await sleep(2500)
  console.log('types after accept:', seen.join(','))
  const gotTicket = seen.includes('session:ticket')
  console.log(gotTicket ? 'DELIVERY: session:ticket RECEIVED' : 'DELIVERY: no session:ticket')
  ws.close()
})()
