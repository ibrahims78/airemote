'use strict'
// يضغط أول زر «فتح الإعداد» في شاشة التهيئة ثم يقبل حوار MediaProjection.
const { execFileSync } = require('child_process')
const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const serial = process.argv[2]
const adb = (...a) => execFileSync(ADB, ['-s', serial, ...a], { encoding: 'utf8', timeout: 60000 })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const dump = () => { try { adb('shell', 'uiautomator', 'dump', '/sdcard/d.xml'); return adb('shell', 'cat', '/sdcard/d.xml') } catch { return '' } }
const nodes = (xml) => (xml.match(/<node[^>]*>/g) || []).map(n => ({
  text: (n.match(/text="([^"]*)"/) || [])[1] || '',
  click: /clickable="true"/.test(n),
  b: (n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/) || []).slice(1).map(Number),
}))
const center = (b) => ({ x: Math.round((b[0] + b[2]) / 2), y: Math.round((b[1] + b[3]) / 2) })

;(async () => {
  let xml = dump()
  let list = nodes(xml)
  let openBtn = list.find(n => n.text === 'فتح الإعداد')
  if (!openBtn) { console.log(JSON.stringify({ serial, step: 'no-setup-button', texts: list.map(n => n.text).filter(Boolean).slice(0, 15) })); process.exit(1) }
  const c1 = center(openBtn.b)
  adb('shell', 'input', 'tap', String(c1.x), String(c1.y))
  await sleep(2500)
  xml = dump(); list = nodes(xml)
  const accept = list.find(n => /(البدء الآن|ابدأ الآن|بدء الآن|Start now|Allow|السماح)/i.test(n.text))
  if (!accept) { console.log(JSON.stringify({ serial, step: 'no-accept', texts: list.map(n => n.text).filter(Boolean).slice(0, 15) })); process.exit(1) }
  const c2 = center(accept.b)
  adb('shell', 'input', 'tap', String(c2.x), String(c2.y))
  await sleep(1500)
  const log = adb('shell', 'logcat', '-d', '-t', '200', '-s', 'AiRemoteAgent:*')
  console.log(JSON.stringify({ serial, step: 'granted', accept: accept.text, sawLog: /التقاط|permission|capab/i.test(log) }))
})()
