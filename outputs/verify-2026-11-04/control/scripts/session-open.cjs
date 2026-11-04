'use strict'
/**
 * session-open.cjs — opens a REAL control session TECNO -> WIN10 and prints the viewer URL.
 * Run from the workspace; it only talks to the local server.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const { DatabaseSync } = require('node:sqlite')

const TECNO = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const TARGETS = {
  win10: 'b42175d0-d0c9-428d-ab94-4e66dff56af3',
  win11: 'd147684b-2451-4418-a628-86f11aa66a4e',
}
const which = (process.argv[2] || 'win10').toLowerCase()
const TARGET = TARGETS[which]
if (!TARGET) { console.error('unknown target: ' + which); process.exit(1) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const tok = db.prepare('SELECT token FROM devices WHERE id=?').get(TECNO).token
  db.close()

  // close stale relay sessions
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    }
  }
  await sleep(800)

  const rq = await fetch('https://127.0.0.1:3001/api/relay/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': tok },
    body: JSON.stringify({ targetDeviceId: TARGET, access: 'control', requesterDeviceId: TECNO }),
  })
  const j = await rq.json().catch(() => ({}))
  console.log('REQUEST=' + rq.status + ' ' + (j.sessionId || j.code || ''))
  if (rq.status !== 201) process.exit(2)

  await sleep(1200)
  const d = await lab.api('/api/relay/' + j.sessionId + '/decision', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }),
  })
  console.log('DECISION=' + d.status + ' ' + (d.json && d.json.state))

  const vt = await fetch('https://127.0.0.1:3001/api/relay/' + j.sessionId + '/view-ticket', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': tok }, body: '{}',
  })
  const vj = await vt.json().catch(() => ({}))
  console.log('TICKET=' + vt.status)
  if (vt.status !== 200 || !vj.viewUrl) { console.log('ERR ' + JSON.stringify(vj)); process.exit(3) }
  console.log('SID=' + j.sessionId)
  console.log('VIEWURL=https://127.0.0.1:3001' + vj.viewUrl)
})().catch(e => { console.error('ERR ' + e.message); process.exit(1) })
