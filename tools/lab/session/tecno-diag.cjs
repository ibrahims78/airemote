'use strict'
// TECNO session-view diagnostic: what happens to SessionWebViewActivity after accept.
// usage: node tools/lab/session/tecno-diag.cjs [--tap=440,960]
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
const TAP = (tapArg ? tapArg.split('=')[1] : '440,960').split(',')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const adb = (...a) => execFileSync(ADB, ['-s', SERIAL, ...a], { encoding: 'utf8', timeout: 60000 })

function shot (name) {
  const buf = execFileSync(ADB, ['-s', SERIAL, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', timeout: 60000, maxBuffer: 32 * 1024 * 1024 })
  fs.writeFileSync(path.join(OUT, name), buf)
  return buf.length
}
const topActivity = () => {
  const d = adb('shell', 'dumpsys', 'activity', 'activities')
  const m = /topResumedActivity=ActivityRecord\{\S+ u0 ([\w.\/]+)/.exec(d)
  return m ? m[1] : 'unknown'
}
const sessionsOf = (rows, sid) => (rows || []).filter(r => String(r.details || '').includes(sid))

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  try { adb('logcat', '-c') } catch {}

  const list = await lab.api('/api/relay/sessions')
  for (const s of (list.json && list.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    }
  }
  const r = await lab.api('/api/relay/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetDeviceId: TECNO, access: 'control', requesterDeviceId: WIN10 }),
  })
  console.log('request', r.status, r.json && r.json.sessionId)
  if (r.status !== 201) process.exit(2)
  const sid = r.json.sessionId

  await sleep(2500)
  console.log('offer-shot=' + shot('tecno-diag-offer.png'))
  console.log('tap-target=' + TAP.join(','))
  if (process.argv.includes('--no-tap')) { console.log('no-tap mode'); }
  else { adb('shell', 'input', 'tap', TAP[0], TAP[1]); console.log('tapped', TAP.join(',')) }

  for (let i = 0; i < 14; i++) {
    await sleep(1000)
    const s = await lab.api('/api/relay/' + sid)
    console.log(i + 's state=' + (s.json && s.json.state) + ' top=' + topActivity())
    if (i === 2) console.log('  shot@3s=' + shot('tecno-diag-3s.png'))
    if (i === 7) console.log('  shot@8s=' + shot('tecno-diag-8s.png'))
  }

  const log = adb('logcat', '-d', '-v', 'time')
  const keep = log.split(/\r?\n/).filter(l => /SessionWebView|airemote|ActivityTaskManager|FATAL|AndroidRuntime/i.test(l))
  fs.writeFileSync(path.join(OUT, 'tecno-logcat.txt'), keep.join('\n'), 'utf8')
  console.log('logcat lines kept=' + keep.length)
  console.log(keep.slice(-12).join('\n'))

  const a = await lab.api('/api/audit?limit=60')
  const rows = Array.isArray(a.json) ? a.json : (a.json.rows || a.json.audit || [])
  console.log(sessionsOf(rows, sid).map(x => x.created_at + ' ' + x.action + ' ' + String(x.details || '').slice(0, 70)).join('\n'))
  console.log('SID=' + sid)
})()
