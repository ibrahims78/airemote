'use strict'
/**
 * 3.9.1 — إثبات حيّ على TECNO: طلب WIN10 → TECNO، موافقة حقيقية بالنقر (adb tap)،
 * ثم إعادة تحميل WebView بإعادة إنشاء النشاط (تدوير الشاشة) — وهو ما كان يفشل
 * بـ«تذكرة غير صالحة» في 3.9.0.
 *
 * التشغيل: node tools/lab/session/proof-a1-tecno.cjs [--tap=x,y]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')
const lab = require(path.join(__dirname, '..', 'lab.cjs'))

const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const SERIAL = '12927374CM001019'
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const TECNO = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const OUT = path.resolve(__dirname, '..', '..', '..', 'outputs', 'verify-2026-11-01', 'session-reconnect')
const tapArg = process.argv.find(a => a.startsWith('--tap='))
const TAP = tapArg ? tapArg.split('=')[1] : ''

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log(...a)
const adb = (...args) => execFileSync(ADB, ['-s', SERIAL, ...args], { encoding: 'utf8', timeout: 60000 })

function snap (name) {
  const buf = execFileSync(ADB, ['-s', SERIAL, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', timeout: 60000, maxBuffer: 32 * 1024 * 1024 })
  const file = path.join(OUT, name)
  fs.writeFileSync(file, buf)
  return buf.length
}

function rowsOf (json) {
  if (Array.isArray(json)) return json
  if (json && typeof json === 'object') for (const k of Object.keys(json)) if (Array.isArray(json[k])) return json[k]
  return []
}
const count = (rows, action) => rowsOf(rows).filter(r => String(r.action || '') === action).length

const windowDump = () => adb('shell', 'dumpsys', 'window', 'windows')

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const list = await lab.api('/api/relay/sessions')
  for (const s of (list.json && list.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      log('closed stale', s.id.slice(0, 8), s.state)
    }
  }

  const r = await lab.api('/api/relay/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetDeviceId: TECNO, access: 'control', requesterDeviceId: WIN10 }),
  })
  log('request', r.status, r.json && r.json.sessionId, r.json && (r.json.code || ''))
  if (r.status !== 201) process.exit(2)
  const sid = r.json.sessionId

  await sleep(2500)
  if (TAP) {
    adb('shell', 'input', 'tap', TAP.split(',')[0], TAP.split(',')[1])
    log('tapped', TAP)
  }
  log('snap offer:', snap('tecno-offer.png'))

  let state = ''
  for (let i = 0; i < 8; i++) {
    await sleep(1000)
    const s = await lab.api('/api/relay/' + sid)
    state = s.json && s.json.state
    if (state === 'active' || state === 'denied') break
  }
  log('state', state)
  if (state !== 'active') { log('SID=' + sid, 'NOT ACTIVE'); process.exit(3) }

  await sleep(5000)
  log('snap viewer:', snap('tecno-viewer-before-reload.png'))

  const a1 = await lab.api('/api/audit?limit=200')
  const opened1 = count(a1.json, 'session_view_opened')
  const reopened1 = count(a1.json, 'session_view_reopened')
  log('audit before: opened=' + opened1 + ' reopened=' + reopened1)

  // إعادة تحميل حقيقية: تدوير الشاشة يُعيد إنشاء النشاط ويُعيد تحميل WebView بنفس العنوان.
  try { adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0') } catch {}
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '1')
  await sleep(6000)
  log('snap rotated:', snap('tecno-after-rotate.png'))
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0')
  await sleep(5000)
  log('snap restored:', snap('tecno-after-reload.png'))

  const a2 = await lab.api('/api/audit?limit=200')
  const opened2 = count(a2.json, 'session_view_opened')
  const reopened2 = count(a2.json, 'session_view_reopened')
  log('audit after: opened=' + opened2 + ' reopened=' + reopened2)

  const s = await lab.api('/api/relay/' + sid)
  log('final state', s.json && s.json.state)
  log(reopened2 > reopened1 ? 'RESULT: TECNO REOPEN PROVEN' : 'RESULT: TECNO REOPEN NOT OBSERVED')
  log('SID=' + sid)
})()
