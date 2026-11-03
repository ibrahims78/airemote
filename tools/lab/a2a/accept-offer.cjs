'use strict'
// accept-offer.cjs — يثبت مسار التحكم على جهاز أندرويد طرفاً هدفاً:
//   1) ينشئ جلسة تحكم من جهاز طالب (رمز جهاز من قاعدة البيانات، لا يُطبع)
//   2) ينتظر حوار «طلب اتصال بجهازك» على الجهاز الهدف ويضغط «سماح»
//   3) يؤكد قبول الوكيل (agent:screen_control_granted) وحالة الجلسة
// الاستخدام: node tools/lab/a2a/accept-offer.cjs <serial> <targetDeviceId> <requesterDeviceId>
const { execFileSync } = require('child_process')
const { DatabaseSync } = require('node:sqlite')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')

const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const serial = process.argv[2]
const TARGET = process.argv[3]
const REQUESTER = process.argv[4] || 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
if (!serial || !TARGET) { console.error('usage: accept-offer.cjs <serial> <targetId> [requesterId]'); process.exit(2) }

const adb = (...a) => execFileSync(ADB, ['-s', serial, ...a], { encoding: 'utf8', timeout: 60000 })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const devToken = (id) => {
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token
  db.close(); return t
}

function uiTexts () {
  try {
    adb('shell', 'uiautomator', 'dump', '/sdcard/off.xml')
    const xml = adb('shell', 'cat', '/sdcard/off.xml')
    return (xml.match(/<node[^>]*>/g) || []).map(n => ({
      text: (n.match(/text="([^"]*)"/) || [])[1] || '',
      bounds: (n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/) || []).slice(1).map(Number),
    })).filter(o => o.text)
  } catch { return [] }
}

;(async () => {
  const r = await fetch('https://127.0.0.1:3001/api/relay/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': devToken(REQUESTER) },
    body: JSON.stringify({ targetDeviceId: TARGET, access: 'control', requesterDeviceId: REQUESTER }),
  })
  const js = await r.json().catch(() => ({}))
  console.log('request:', r.status, js.sessionId || JSON.stringify(js).slice(0, 160))
  if (!js.sessionId) process.exit(3)
  const sid = js.sessionId

  let tapped = null
  for (let i = 0; i < 8 && !tapped; i++) {
    await sleep(900)
    const nodes = uiTexts()
    const hit = nodes.find(o => /^(سماح|السماح|Allow)$/i.test(o.text) && o.bounds.length === 4)
    if (hit) {
      const x = Math.round((hit.bounds[0] + hit.bounds[2]) / 2)
      const y = Math.round((hit.bounds[1] + hit.bounds[3]) / 2)
      adb('shell', 'input', 'tap', String(x), String(y))
      tapped = { text: hit.text, x, y }
    }
    if (!tapped && i === 2) console.log('dialog texts so far:', nodes.map(o => o.text).slice(0, 8).join(' | '))
  }
  console.log('tapped:', JSON.stringify(tapped))
  await sleep(3500)

  const l = await lab.api('/api/relay/sessions')
  const s = (l.json && l.json.sessions || []).find(x => x.id === sid)
  console.log('session state:', s ? s.state : 'not found', '| access:', s ? s.access : '-')
  console.log('RESULT:', s && (s.state === 'active' || s.state === 'accepted') ? 'CONTROL_ACCEPTED' : 'NOT_ACCEPTED')
  process.exit(s && s.state === 'active' ? 0 : 4)
})().catch(e => { console.error('FAILED', e.message); process.exit(1) })
