'use strict'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const { execFileSync } = require('child_process')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const SERIAL = '12927374CM001019'
const SID = process.argv[2]
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function dump () {
  execFileSync(ADB, ['-s', SERIAL, 'shell', 'uiautomator', 'dump', '/sdcard/ui.xml'], { encoding: 'utf8' })
  return execFileSync(ADB, ['-s', SERIAL, 'shell', 'cat', '/sdcard/ui.xml'], { encoding: 'utf8' })
}
function find (xml, text) {
  const m = new RegExp('<node[^>]*text="' + text + '"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"').exec(xml)
  if (!m) return null
  const [x1, y1, x2, y2] = m.slice(1).map(Number)
  return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) }
}
;(async () => {
  execFileSync(ADB, ['-s', SERIAL, 'shell', 'am', 'start', '-n', 'com.airemote.agent/.MainActivity'], { encoding: 'utf8' })
  await sleep(1500)
  const xml = dump()
  console.log('offer', xml.includes('طلب اتصال بجهازك'))
  const b = find(xml, 'سماح')
  console.log('allow', JSON.stringify(b))
  if (b) {
    execFileSync(ADB, ['-s', SERIAL, 'shell', 'input', 'tap', String(b.x), String(b.y)], { encoding: 'utf8' })
    console.log('tapped')
  }
  for (let i = 0; i < 6; i++) {
    await sleep(1200)
    const s = await lab.api('/api/relay/' + SID)
    console.log('state', s.json && s.json.state)
    if (s.json && ['active', 'denied', 'expired'].includes(s.json.state)) break
  }
})()
