'use strict'
/**
 * T9 + T10 — أدلة حيّة على أندرويد حقيقي (TECNO KL4، vc32/3.9.4).
 *
 * T9  : الجلسة تبقى حيّة والتطبيق في الخلفية (HOME) ثم تعود وتُعيد التحميل.
 * T10 : تدوير الشاشة — الهدف يستقبل force_keyframe ويعيد إطاراً كاملاً.
 *
 * المُشاهد: TECNO (12927374CM001019) — الهدف: المحاكي (emulator-5554).
 * لا يطبع أي سرّ: رمز الجهاز يُقرأ من قاعدة البيانات ولا يُسجَّل.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')

const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const TECNO = '12927374CM001019'
const EMU = 'emulator-5554'
const TECNO_ID = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const EMU_ID = '9b5eeaf9-b30d-449c-875e-1e21e56ac041'
const DB = 'C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/t9-t10'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const adb = (serial, ...a) => execFileSync(ADB, ['-s', serial, ...a], { encoding: 'utf8', timeout: 60000 })
const log = (...a) => console.log(...a)

function token (id) {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(DB, { readOnly: true })
  const row = db.prepare('SELECT token FROM devices WHERE id = ?').get(id)
  db.close()
  if (!row || !row.token) throw new Error('no device token for ' + id)
  return row.token
}
function shot (serial, name) {
  const buf = execFileSync(ADB, ['-s', serial, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', timeout: 60000, maxBuffer: 32 * 1024 * 1024 })
  fs.writeFileSync(path.join(OUT, name), buf)
  return buf.length
}
function uiDump (serial) {
  adb(serial, 'shell', 'uiautomator', 'dump', '/sdcard/ui.xml')
  return adb(serial, 'shell', 'cat', '/sdcard/ui.xml')
}
function findNode (xml, text) {
  const re = new RegExp('<node[^>]*text="' + text + '"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"')
  const m = re.exec(xml)
  if (!m) return null
  const [x1, y1, x2, y2] = m.slice(1).map(Number)
  return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) }
}
const topActivity = (serial) => {
  const d = adb(serial, 'shell', 'dumpsys', 'activity', 'activities')
  const m = /topResumedActivity=ActivityRecord\{\S+ u0 ([\w.\/]+)/.exec(d)
  return m ? m[1] : 'unknown'
}
const rowsOf = (j) => Array.isArray(j) ? j : (j && (j.rows || j.audit || j.entries)) || []
const countHits = (rows, sid, action) => rowsOf(rows).filter(r => String(r.action || '') === action && String(r.details || '').includes(sid)).length
const state = async (sid) => { const r = await lab.api('/api/relay/' + sid); return r.json && r.json.state }
const audit = async () => { const r = await lab.api('/api/audit?limit=120'); return r.json }

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const result = { startedAt: new Date().toISOString(), agentVersion: null, session: {}, t9: {}, t10: {} }

  // ── 0) تنظيف الجلسات المفتوحة
  const list = await lab.api('/api/relay/sessions')
  for (const s of (list.json && list.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    }
  }

  // ── 1) إصدار الوكيل على الجهازين
  const devs = await lab.devices()
  result.agentVersion = devs.map(d => (d.name || '') + '=' + ((d.info || {}).agentVersion || '?') + '/' + d.status)

  // ── 2) طلب تحكم: TECNO → المحاكي
  const tok = token(TECNO_ID)
  const rq = await lab.api('/api/relay/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': tok },
    body: JSON.stringify({ targetDeviceId: EMU_ID, access: 'control', requesterDeviceId: TECNO_ID }),
  })
  log('request', rq.status, rq.json && (rq.json.code || rq.json.sessionId ? 'sid' : ''))
  if (rq.status !== 201) { fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify({ error: 'request failed', status: rq.status, body: rq.json }, null, 1)); process.exit(2) }
  const sid = rq.json.sessionId
  result.session.id = sid
  await sleep(2500)

  // ── 3) قبول على الهدف من واجهته (نقرة «سماح») — وإلا مسار المالك
  let accepted = 'dialog'
  const xml = uiDump(EMU)
  const btn = findNode(xml, 'سماح')
  if (btn) {
    adb(EMU, 'shell', 'input', 'tap', String(btn.x), String(btn.y))
  } else {
    accepted = 'owner-api'
    await lab.api('/api/relay/' + sid + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  }
  result.session.acceptedVia = accepted

  let active = false
  for (let i = 0; i < 15; i++) {
    await sleep(1000)
    if (await state(sid) === 'active') { active = true; break }
  }
  result.session.active = active
  result.session.stateAfterAccept = await state(sid)

  // ── 4) هل فُتح العرض على TECNO؟
  let opened = false
  for (let i = 0; i < 15; i++) {
    await sleep(1000)
    if (countHits(await audit(), sid, 'session_view_opened') > 0) { opened = true; break }
  }
  result.session.viewerOpened = opened
  result.session.topAfterOpen = topActivity(TECNO)
  result.session.shotViewer = shot(TECNO, 't9-viewer-open.png')

  // ── 5) T9 — التطبيق إلى الخلفية 60s
  adb(TECNO, 'shell', 'input', 'keyevent', 'KEYCODE_HOME')
  await sleep(3000)
  result.t9.topWhileBackground = topActivity(TECNO)
  const states = []
  for (let i = 0; i < 6; i++) {
    await sleep(10000)
    states.push({ t: (i + 1) * 10, state: await state(sid), agentAlive: adb(EMU, 'shell', 'pidof com.airemote.agent').trim() !== '' })
  }
  result.t9.backgroundStates = states
  result.t9.stayedActive = states.every(s => s.state === 'active')

  // العودة إلى التطبيق = onResume → إعادة تحميل العرض
  adb(TECNO, 'shell', 'monkey', '-p', 'com.airemote.agent', '-c', 'android.intent.category.LAUNCHER', '1')
  await sleep(8000)
  const a2 = await audit()
  result.t9.reopened = countHits(a2, sid, 'session_view_reopened') > 0
  result.t9.topAfterReturn = topActivity(TECNO)
  result.t9.shotAfterReturn = shot(TECNO, 't9-after-return.png')
  result.t9.stateAfterReturn = await state(sid)

  // ── 6) T10 — تدوير الهدف (المحاكي) ثم المُشاهد (TECNO)
  adb(EMU, 'logcat', '-c')
  adb(EMU, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
  adb(EMU, 'shell', 'settings', 'put', 'system', 'user_rotation', '1')
  await sleep(6000)
  const emuLog = adb(EMU, 'logcat', '-d', '-s', 'AiRemoteAgent:*')
  result.t10.targetRotated = /orientation changed/.test(emuLog) || emuLog.includes('screen orientation changed')
  result.t10.targetLogLines = emuLog.split(/\r?\n/).filter(l => /orientation|force|keyframe|rotation/i.test(l)).slice(-8)
  result.t10.shotAfterTargetRotate = shot(TECNO, 't10-after-target-rotate.png')
  result.t10.stateAfterTargetRotate = await state(sid)

  adb(EMU, 'shell', 'settings', 'put', 'system', 'user_rotation', '0')
  await sleep(4000)

  // تدوير المُشاهد نفسه
  adb(TECNO, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
  adb(TECNO, 'shell', 'settings', 'put', 'system', 'user_rotation', '1')
  await sleep(6000)
  result.t10.viewerRotated = adb(TECNO, 'shell', 'wm', 'size').trim()
  result.t10.shotAfterViewerRotate = shot(TECNO, 't10-after-viewer-rotate.png')
  result.t10.stateAfterViewerRotate = await state(sid)
  adb(TECNO, 'shell', 'settings', 'put', 'system', 'user_rotation', '0')
  adb(TECNO, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '1')
  await sleep(3000)

  result.finishedAt = new Date().toISOString()
  fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(result, null, 1))
  log('\n--- RESULT ---')
  log(JSON.stringify(result, null, 1))
})().catch(e => {
  console.error('ERR ' + e.message)
  try { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'run-error.txt'), e.stack || e.message) } catch {}
  process.exit(1)
})
