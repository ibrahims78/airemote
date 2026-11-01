'use strict'
/**
 * مصفوفة وكيل↔وكيل: TECNO → Emulator لكل مستويات الوصول (view/files/control).
 * تقيس: حالة الطلب، التذكرة، الإطارات، أثر التحكم، ثم الإغلاق.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const fs = require('fs')

const TECNO = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const EMU = '9b5eeaf9-b30d-449c-875e-1e21e56ac041'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/a2a-matrix'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const devToken = (id) => {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token
  db.close(); return t
}
const req = async (p, body, headers = {}, method = 'POST') => {
  const r = await fetch('https://127.0.0.1:3001' + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const res = { cases: [] }
  const tok = devToken(TECNO)
  for (const access of ['view', 'files', 'control']) {
    const c = { access }
    // نظّف
    const l = await lab.api('/api/relay/sessions')
    for (const s of (l.json && l.json.sessions) || []) {
      if (['requested', 'active', 'suspended'].includes(s.state)) {
        await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      }
    }
    await sleep(600)

    const rq = await req('/api/relay/request', { targetDeviceId: EMU, access, requesterDeviceId: TECNO }, { 'X-Device-Token': tok })
    c.requestStatus = rq.status
    c.requestCode = rq.json && (rq.json.code || rq.json.error)
    c.sid = rq.json && rq.json.sessionId
    if (rq.status !== 201) { res.cases.push(c); continue }

    await sleep(900)
    const dec = await lab.api('/api/relay/' + c.sid + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
    c.decisionStatus = dec.status
    c.stateAfterAccept = dec.json && dec.json.state

    const vt = await req('/api/relay/' + c.sid + '/view-ticket', {}, { 'X-Device-Token': tok })
    c.ticketStatus = vt.status
    if (vt.status !== 200 || !vt.json.viewUrl) { res.cases.push(c); continue }

    const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)
    const qs = new URLSearchParams({ rt: u.searchParams.get('rt'), deviceId: EMU, binary: '1', fps: '8', quality: '50', maxWidth: '480' })
    let ws
    try {
      ws = new WebSocket('wss://127.0.0.1:3001/screen?' + qs.toString(), { rejectUnauthorized: false })
      const msgs = []
      let frames = 0, bytes = 0, dims = new Set()
      ws.on('message', (d, bin) => {
        if (bin) { frames++; bytes += d.length; if (d.length >= 13) { dims.add(d.readUInt32BE(0) + 'x' + d.readUInt32BE(4)) } }
        else { try { msgs.push(JSON.parse(d.toString())) } catch {} }
      })
      await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('ws timeout')), 12000) })
      await sleep(4000)
      c.frames = frames
      c.bytes = bytes
      c.dims = [...dims].slice(0, 6)
      c.errors = msgs.filter(m => m.type === 'screen:error' || m.type === 'screen:unavailable').map(m => m.payload)
      c.viewerCount = msgs.filter(m => m.type === 'screen:viewer_count').map(m => m.payload && m.payload.count)
      if (access === 'control') {
        ws.send(JSON.stringify({ type: 'screen:mouse_event', payload: { type: 'click', x: 0.5, y: 0.5, button: 0 } }))
        await sleep(900)
        ws.send(JSON.stringify({ type: 'screen:key_event', payload: { type: 'press', key: 'home' } }))
        await sleep(1200)
        c.framesAfterInput = frames
      }
      const st = await lab.api('/api/relay/sessions')
      const row = ((st.json && st.json.sessions) || []).find(s => s.id === c.sid)
      c.stateServerDuringStream = row && row.state
      try { ws.close() } catch {}
      await sleep(600)
      const st2 = await lab.api('/api/relay/sessions')
      const row2 = ((st2.json && st2.json.sessions) || []).find(s => s.id === c.sid)
      c.stateServerAfterClose = row2 && row2.state
    } catch (e) {
      c.wsError = String(e && e.message || e)
    }
    try { await lab.api('/api/relay/' + c.sid + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}
    res.cases.push(c)
    await sleep(800)
  }
  fs.writeFileSync(OUT + '/matrix.json', JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
})().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(1) })
