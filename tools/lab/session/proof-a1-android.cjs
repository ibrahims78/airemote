'use strict'
/**
 * 3.9.2 — إثبات A1 على أندرويد بالاتجاه الصحيح: TECNO هو **الطالب**، WIN10 هو الهدف.
 * التذكرة تُرسل للطالب فقط، لذلك نافذة العرض تُفتح على الهاتف.
 *
 * 1) طلب من TECNO (رمز جهازه من قاعدة البيانات، لا يُطبع)
 * 2) قبول على WIN10 من مسار المالك (نفس relayDecide)
 * 3) WebView يُفتح على TECNO (session_view_opened)
 * 4) HOME ثم إعادة فتح التطبيق = إعادة تحميل حقيقية (onResume → web.reload)
 * 5) يجب أن يُسجَّل session_view_reopened
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')
const lab = require(path.join(__dirname, '..', 'lab.cjs'))

const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const SERIAL = '12927374CM001019'
const DB = 'C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db'
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const TECNO = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const OUT = path.resolve(__dirname, '..', '..', '..', 'outputs', 'verify-2026-11-01', 'session-reconnect')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log(...a)
const adb = (...a) => execFileSync(ADB, ['-s', SERIAL, ...a], { encoding: 'utf8', timeout: 60000 })

function token () {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(DB, { readOnly: true })
  const row = db.prepare('SELECT token FROM devices WHERE id = ?').get(TECNO)
  db.close()
  if (!row || !row.token) throw new Error('no device token')
  return row.token
}

function shot (name) {
  const buf = execFileSync(ADB, ['-s', SERIAL, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', timeout: 60000, maxBuffer: 32 * 1024 * 1024 })
  fs.writeFileSync(path.join(OUT, name), buf)
  return buf.length
}
const top = () => {
  const d = adb('shell', 'dumpsys', 'activity', 'activities')
  const m = /topResumedActivity=ActivityRecord\{\S+ u0 ([\w.\/]+)/.exec(d)
  return m ? m[1] : 'unknown'
}
const rowsOf = (j) => Array.isArray(j) ? j : (j && (j.rows || j.audit || j.entries)) || []
const hits = (rows, sid, action) => rowsOf(rows).filter(r => String(r.action || '') === action && String(r.details || '').includes(sid)).length

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const tok = token()

  const list = await lab.api('/api/relay/sessions')
  for (const s of (list.json && list.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    }
  }

  const r = await lab.api('/api/relay/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': tok },
    body: JSON.stringify({ targetDeviceId: WIN10, access: 'control', requesterDeviceId: TECNO }),
  })
  log('request', r.status, r.json && r.json.sessionId, r.json && (r.json.code || ''))
  if (r.status !== 201) process.exit(2)
  const sid = r.json.sessionId

  await sleep(1500)
  const d = await lab.api('/api/relay/' + sid + '/decision', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }),
  })
  log('accept', d.status, d.json && d.json.state)

  let opened = false
  for (let i = 0; i < 12; i++) {
    await sleep(1000)
    const a = await lab.api('/api/audit?limit=60')
    if (hits(a.json, sid, 'session_view_opened') > 0) { opened = true; log('opened at', i + 1 + 's top=' + top()); break }
  }
  log('opened=' + opened + ' top=' + top())
  log('shot viewer=' + shot('tecno-as-requester-viewer.png'))

  // إعادة تحميل حقيقية: خروج من التطبيق ثم العودة إليه → onResume → web.reload().
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
  await sleep(3000)
  adb('shell', 'monkey', '-p', 'com.airemote.agent', '-c', 'android.intent.category.LAUNCHER', '1')
  await sleep(7000)
  log('after reload top=' + top())
  log('shot after=' + shot('tecno-as-requester-after-reload.png'))

  const a2 = await lab.api('/api/audit?limit=60')
  const o = hits(a2.json, sid, 'session_view_opened')
  const re = hits(a2.json, sid, 'session_view_reopened')
  log('audit opened=' + o + ' reopened=' + re)

  const lg = adb('logcat', '-d', '-v', 'time')
  const keep = lg.split(/\r?\n/).filter(l => /AiR-SessionView/.test(l))
  fs.writeFileSync(path.join(OUT, 'tecno-sessionview-logcat.txt'), keep.join('\n'), 'utf8')
  log(keep.slice(-6).join('\n'))

  log(re > 0 ? 'RESULT: ANDROID REOPEN PROVEN' : 'RESULT: ANDROID REOPEN NOT OBSERVED')
  log('SID=' + sid)
})()
