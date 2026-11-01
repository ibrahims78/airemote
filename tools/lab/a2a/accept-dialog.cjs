'use strict'
// يقبل حوار إذن MediaProjection إن كان معروضاً (بحث بنص الزر)، على أي جهاز.
const { execFileSync } = require('child_process')
const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const serial = process.argv[2]
const adb = (...a) => execFileSync(ADB, ['-s', serial, ...a], { encoding: 'utf8', timeout: 60000 })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
;(async () => {
  const xml = (() => { try { adb('shell', 'uiautomator', 'dump', '/sdcard/ad.xml'); return adb('shell', 'cat', '/sdcard/ad.xml') } catch { return '' } })()
  const nodes = xml.match(/<node[^>]*>/g) || []
  const wanted = /(البدء الآن|ابدأ الآن|بدء الآن|Start now|START NOW)/i
  let hit = null
  for (const n of nodes) {
    const text = (n.match(/text="([^"]*)"/) || [])[1] || ''
    const b = (n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/) || []).slice(1).map(Number)
    if (!text || b.length < 4 || !wanted.test(text)) continue
    hit = { text, x: Math.round((b[0] + b[2]) / 2), y: Math.round((b[1] + b[3]) / 2) }
    break
  }
  if (!hit) { console.log(JSON.stringify({ serial, dialog: false })); return }
  adb('shell', 'input', 'tap', String(hit.x), String(hit.y))
  await sleep(1200)
  console.log(JSON.stringify({ serial, dialog: true, tapped: hit.text }))
})()
