'use strict'
/**
 * grant-capture.cjs — يفتح MainActivity بوسم requestCapture ثم يقبل حوار MediaProjection.
 * يقبل أي زر نصّه: البدء الآن / ابدأ الآن / Start now / السماح / Allow.
 * الاستخدام: node grant-capture.cjs <serial>
 */
const { execFileSync } = require('child_process')
const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const serial = process.argv[2]
if (!serial) { console.error('serial required'); process.exit(2) }
const adb = (...a) => execFileSync(ADB, ['-s', serial, ...a], { encoding: 'utf8', timeout: 60000 })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  adb('shell', 'am', 'force-stop', 'com.airemote.agent')
  await sleep(800)
  adb('shell', 'am', 'start', '-n', 'com.airemote.agent/.MainActivity', '--ez', 'requestCapture', 'true')
  await sleep(3500)
  let xml = ''
  try { adb('shell', 'uiautomator', 'dump', '/sdcard/g.xml'); xml = adb('shell', 'cat', '/sdcard/g.xml') } catch (e) { console.error('dump failed: ' + e.message) }
  const nodes = xml.match(/<node[^>]*>/g) || []
  const wanted = /(البدء الآن|ابدأ الآن|بدء الآن|Start now|START NOW|السماح|Allow)/i
  let hit = null
  for (const n of nodes) {
    const text = (n.match(/text="([^"]*)"/) || [])[1] || ''
    const bounds = (n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/) || [])
    if (!text || bounds.length < 5) continue
    if (!wanted.test(text)) continue
    hit = { text, x: Math.round((+bounds[1] + +bounds[3]) / 2), y: Math.round((+bounds[2] + +bounds[4]) / 2) }
    break
  }
  if (!hit) {
    console.log(JSON.stringify({ serial, granted: false, reason: 'dialog button not found', texts: nodes.map(n => (n.match(/text="([^"]*)"/) || [])[1]).filter(Boolean).slice(0, 12) }))
    process.exit(1)
  }
  adb('shell', 'input', 'tap', String(hit.x), String(hit.y))
  await sleep(1500)
  const log = adb('shell', 'logcat', '-d', '-s', 'AiRemoteAgent:*')
  const ok = /التقاط الشاشة/.test(log) || /capture/.test(log)
  console.log(JSON.stringify({ serial, tapped: hit, granted: ok }))
})()
