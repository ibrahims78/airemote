#!/usr/bin/env node
'use strict'
/**
 * resume-check.cjs — إثبات استمرارية جلسة relay بعد إعادة تشغيل السيرفر.
 *
 *   node tools/lab/a2a/resume-check.cjs start  <target> <requester> [seconds]
 *   node tools/lab/a2a/resume-check.cjs resume [seconds]
 *
 * start  : ينشئ جلسة، يقبلها، يحفظ {sessionId, rk, deviceId} في outputs/verify-2026-11-03/persist/session.json،
 *          يتصل على /screen (binary) ويعدّ الإطارات — ولا يغلق الجلسة عند الخروج.
 * resume : يقرأ الملف نفسه ويعيد الاتصال بمفتاح الإعادة rk (بعد إعادة تشغيل السيرفر) ويعدّ الإطارات.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const path = require('path')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const { DatabaseSync } = require('node:sqlite')

const OUT_DIR = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-03/persist'
const STATE = path.join(OUT_DIR, 'session.json')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const devToken = (id) => {
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const row = db.prepare('SELECT token FROM devices WHERE id=?').get(id)
  db.close(); return row && row.token
}
const post = async (p, body, headers = {}) => {
  const r = await fetch('https://127.0.0.1:3001' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

function streamOnce (query, seconds) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const frames = []
    let open = false
    const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + query.toString(), { rejectUnauthorized: false })
    const done = (err) => {
      try { ws.close() } catch {}
      resolve({
        ok: frames.length > 0,
        error: err || null,
        frames: frames.length,
        firstFrameMs: frames.length ? frames[0] : null,
        lastFrameMs: frames.length ? frames[frames.length - 1] : null,
        dims: frames.dims || null,
        elapsedMs: Date.now() - t0,
      })
    }
    ws.on('open', () => { open = true })
    ws.on('message', (d, bin) => {
      if (!bin || d.length < 14) return
      const w = d.readUInt32BE ? d.readUInt32BE(0) : null
      if (!frames.dims) frames.dims = (w || 0) + 'x' + (d.length ? d.readUInt32BE(4) : 0)
      frames.push(Date.now() - t0)
    })
    ws.on('error', (e) => { if (!open) done('ws: ' + e.message) })
    ws.on('close', () => { if (!frames.length) done('closed-without-frames') })
    setTimeout(() => done(null), seconds * 1000)
  })
}

;(async () => {
  const mode = process.argv[2]
  fs.mkdirSync(OUT_DIR, { recursive: true })

  if (mode === 'start') {
    const TARGET = process.argv[3] || 'd147684b-2451-4418-a628-86f11aa66a4e'
    const REQUESTER = process.argv[4] || 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
    const seconds = Number(process.argv[5] || 6)

    for (const s of ((await lab.api('/api/relay/sessions')).json.sessions || [])) {
      if (['requested', 'active', 'suspended', 'accepted'].includes(s.state)) {
        await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      }
    }
    await sleep(600)
    const rq = await post('/api/relay/request', { targetDeviceId: TARGET, access: 'control', requesterDeviceId: REQUESTER }, { 'X-Device-Token': devToken(REQUESTER) })
    if (rq.status !== 201) { console.error('request failed ' + rq.status + ' ' + JSON.stringify(rq.json)); process.exit(1) }
    await sleep(800)
    await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
    const vt = await post('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': devToken(REQUESTER) })
    if (vt.status >= 400) { console.error('ticket failed ' + vt.status + ' ' + JSON.stringify(vt.json)); process.exit(1) }
    const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)
    const rk = new URLSearchParams(String(vt.json.viewUrl).split('#')[1] || '').get('rk') || String(vt.json.viewUrl).split('#rk=')[1]
    fs.writeFileSync(STATE, JSON.stringify({ sessionId: rq.json.sessionId, target: TARGET, requester: REQUESTER, deviceId: TARGET, rk, rt: u.searchParams.get('rt'), savedAt: Date.now() }, null, 1), 'utf8')
    const qs = new URLSearchParams({ rt: u.searchParams.get('rt'), deviceId: TARGET, binary: '1', fps: '15', quality: '60', maxWidth: '1600' })
    const r = await streamOnce(qs, seconds)
    console.log(JSON.stringify({ phase: 'start', sessionId: rq.json.sessionId, rkSaved: !!rk, ...r }, null, 1))
    process.exit(r.ok ? 0 : 5)
  }

  if (mode === 'resume') {
    const seconds = Number(process.argv[3] || 8)
    const st = JSON.parse(fs.readFileSync(STATE, 'utf8'))
    let last = null
    for (let attempt = 1; attempt <= 4; attempt++) {
      const qs = new URLSearchParams({ rk: st.rk, deviceId: st.deviceId, binary: '1', fps: '15', quality: '60', maxWidth: '1600' })
      const r = await streamOnce(qs, seconds)
      last = { attempt, ...r }
      console.log(JSON.stringify({ phase: 'resume', sessionId: st.sessionId, ...last }))
      if (r.ok) { console.log(JSON.stringify({ result: 'RESUME_OK', frames: r.frames, firstFrameMs: r.firstFrameMs })); process.exit(0) }
      await sleep(4000)
    }
    console.log(JSON.stringify({ result: 'RESUME_FAILED', last }))
    process.exit(6)
  }

  console.error('usage: resume-check.cjs start <target> <requester> [s] | resume [s]')
  process.exit(2)
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1) })
