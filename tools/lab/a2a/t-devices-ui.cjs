'use strict'
/** اختبار واجهة «الأجهزة» على TECNO: تحديث القائمة ثم إرسال طلب تحكم وفتح العرض. */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path'); const fs = require('fs')
const { execFileSync } = require('child_process')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')

const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const TECNO = '12927374CM001019'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/devices-ui'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const adb = (...a) => execFileSync(ADB, ['-s', TECNO, ...a], { encoding: 'utf8', timeout: 60000 })
const shot = (n) => { const b = execFileSync(ADB, ['-s', TECNO, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }); fs.writeFileSync(path.join(OUT, n), b); fs.writeFileSync(path.join(__dirname, n), b); return b.length }
const ui = () => { adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml'); return adb('shell', 'cat', '/sdcard/ui.xml') }
const find = (xml, text) => {
  const re = new RegExp('text="' + text + '"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"')
  const m = re.exec(xml); if (!m) return null
  const [a, b, c, d] = m.slice(1).map(Number)
  return { x: Math.round((a + c) / 2), y: Math.round((b + d) / 2) }
}
const top = () => (adb('shell', 'dumpsys', 'activity', 'activities').match(/topResumedActivity=ActivityRecord\{\S+ u0 ([\w.\/]+)/) || [])[1]

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const res = {}
  adb('shell', 'am', 'force-stop', 'com.airemote.agent')
  await sleep(1200)
  adb('shell', 'am', 'start', '-n', 'com.airemote.agent/.MainActivity')
  await sleep(5000)

  let xml = ui()
  const refresh = find(xml, 'تحديث الأجهزة')
  res.refreshButton = refresh
  res.hasCard = /الأجهزة — اتصال وكيل بوكيل/.test(xml)
  if (refresh) { adb('shell', 'input', 'tap', String(refresh.x), String(refresh.y)); await sleep(4000) }
  xml = ui()
  res.afterRefresh = (xml.match(/متاح \d+ جهازاً|لا توجد أجهزة أخرى[^"]*/) || [''])[0]
  res.shot1 = shot('devices-list.png')

  const btn = find(xml, 'طلب تحكم')
  res.requestButton = btn
  if (btn) {
    adb('shell', 'input', 'tap', String(btn.x), String(btn.y))
    await sleep(3500)
    xml = ui()
    res.afterRequest = (xml.match(/تم إرسال الطلب[^"]*|تعذر[^"]*|يوجد جلسة[^"]*|غير مصرح[^"]*/) || [''])[0]
    res.shot2 = shot('devices-requested.png')
  }

  // حالة الجلسة على السيرفر
  const l = await lab.api('/api/relay/sessions')
  res.sessions = ((l.json && l.json.sessions) || []).map(s => ({ state: s.state, access: s.access, requester: s.requester && s.requester.name, target: s.target && s.target.name }))
  res.top = top()

  fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
})().catch(e => { console.error('ERR ' + e.message); process.exit(1) })
