'use strict'
/**
 * T15 — تسجيل MP4 داخل جلسة Relay.
 *
 * يفتح جلسة WIN10 → هدف (ويندوز افتراضاً)، يبدأ تسجيلاً عبر مقبس المُشاهد
 * (`screen:record_start`)، يسجّل مدة حقيقية بالساعة، يوقف، ينتظر انتهاء الترميز،
 * ينزّل الملف، ثم يقيسه بـffprobe: h264 + aac، والمدة ±1s.
 *
 * الاستخدام: node tools/lab/a2a/t15-record.cjs [--target WIN11-VM] [--seconds 12]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const WebSocket = require('D:/autoclaw projects-new/AiRemote/node_modules/.pnpm/ws@8.21.0/node_modules/ws')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')

const FFPROBE = 'D:/autoclaw projects/offline-build-tools/video-voice-production-toolkit/binaries/ffmpeg/ffprobe.exe'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/t15'
const WIN10_ID = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const DEVICES = {
  'WIN10-VM': WIN10_ID,
  'WIN11-VM': 'd147684b-2451-4418-a628-86f11aa66a4e',
  'TECNO-KL4': '07f8ae91-5b64-41d9-97df-ce649772b0d3',
}

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d }
const targetName = arg('target', 'WIN11-VM')
const seconds = Number(arg('seconds', '12'))
const targetId = DEVICES[targetName]
if (!targetId) { console.error('unknown target ' + targetName); process.exit(2) }

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
  const res = { target: targetName, at: new Date().toISOString() }

  // نظّف أي جلسات مفتوحة على الهدف حتى لا يقيس التسجيل جلسة قديمة
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    }
  }
  await sleep(800)

  const tokWin = devToken(WIN10_ID)
  const rq = await req('/api/relay/request', { targetDeviceId: targetId, access: 'control', requesterDeviceId: WIN10_ID }, { 'X-Device-Token': tokWin })
  res.request = rq.status; res.sid = rq.json.sessionId
  if (rq.status !== 201) { console.log(JSON.stringify(res, null, 1)); process.exit(2) }
  await sleep(1200)
  await lab.api('/api/relay/' + res.sid + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await req('/api/relay/' + res.sid + '/view-ticket', {}, { 'X-Device-Token': tokWin })
  res.ticketStatus = vt.status
  const u = new URL('https://127.0.0.1:3001' + vt.json.viewUrl)

  const qs = new URLSearchParams({ rt: u.searchParams.get('rt'), deviceId: targetId, binary: '1', fps: '10', quality: '60', maxWidth: '1280' })
  const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + qs.toString(), { rejectUnauthorized: false })
  const msgs = []
  let frames = 0
  ws.on('message', (d, isBinary) => {
    if (isBinary) { frames++; return }
    try { msgs.push(JSON.parse(d.toString())) } catch {}
  })
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('ws timeout')), 15000) })
  await sleep(2500)
  res.framesBeforeRecord = frames

  ws.send(JSON.stringify({ type: 'screen:record_start', payload: { fps: 10, quality: 60, maxWidth: 1280 } }))
  const started = Date.now()
  const st = await (async () => {
    for (let i = 0; i < 40; i++) {
      const m = msgs.find(x => x.type === 'screen:record_status' && x.payload && x.payload.recording === true)
      if (m) return m
      await sleep(250)
    }
    return null
  })()
  res.recordStartAck = !!st
  res.recId = st && st.payload && st.payload.meta && st.payload.meta.sessionId
  if (!res.recId) { console.log(JSON.stringify(res, null, 1)); process.exit(3) }

  await sleep(seconds * 1000)
  ws.send(JSON.stringify({ type: 'screen:record_stop', payload: {} }))
  const stopped = Date.now()
  res.wallSeconds = Math.round((stopped - started) / 100) / 10
  res.framesTotal = frames

  // انتظر الترميز
  let status = null
  for (let i = 0; i < 80; i++) {
    const r = await lab.api('/api/recordings/' + res.recId + '/status')
    status = r.json
    if (status && status.state === 'mp4') break
    await sleep(1000)
  }
  res.statusAfterWait = status && status.state

  // نزّل الملف
  const dl = await lab.api('/api/recordings/' + res.recId + '/download')
  let mp4Path = path.join(OUT, 't15-' + targetName.replace(/[^a-z0-9]+/gi, '-') + '.mp4')
  if (dl.status === 200 && dl.buffer) {
    fs.writeFileSync(mp4Path, dl.buffer)
    res.downloadedBytes = dl.buffer.length
  } else {
    // lab.api يعيد نصاً لا buffer؛ نجلب مرة ثانية كتيار
    const token = await lab.getToken()
    const r2 = await fetch('https://127.0.0.1:3001/api/recordings/' + res.recId + '/download', { headers: { Authorization: 'Bearer ' + token } })
    const buf = Buffer.from(await r2.arrayBuffer())
    fs.writeFileSync(mp4Path, buf)
    res.downloadStatus = r2.status
    res.downloadedBytes = buf.length
  }

  // ffprobe
  const probeRaw = execFileSync(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', mp4Path], { encoding: 'utf8', timeout: 60000 })
  const probe = JSON.parse(probeRaw)
  const vs = (probe.streams || []).find(s => s.codec_type === 'video') || {}
  const as = (probe.streams || []).find(s => s.codec_type === 'audio') || {}
  const dur = Number(probe.format && probe.format.duration)
  res.videoCodec = vs.codec_name; res.audioCodec = as.codec_name
  res.width = vs.width; res.height = vs.height
  res.durationSeconds = Math.round(dur * 100) / 100
  res.durationDelta = Math.round(Math.abs(dur - res.wallSeconds) * 100) / 100

  res.pass = {
    h264: res.videoCodec === 'h264',
    aac: res.audioCodec === 'aac',
    durationWithin1s: res.durationDelta <= 1,
  }
  res.ok = res.pass.h264 && res.pass.aac && res.pass.durationWithin1s

  try { ws.close() } catch {}
  try { await lab.api('/api/relay/' + res.sid + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}

  fs.writeFileSync(path.join(OUT, 'run-' + targetName.replace(/[^a-z0-9]+/gi, '-') + '.json'), JSON.stringify(res, null, 1))
  fs.writeFileSync(path.join(OUT, 'ffprobe-' + targetName.replace(/[^a-z0-9]+/gi, '-') + '.json'), probeRaw)
  console.log(JSON.stringify(res, null, 1))
  process.exit(res.ok ? 0 : 1)
})().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(1) })
