'use strict'
/**
 * android-audit.cjs — click every clickable node on the Android agent, one at a time.
 * Skips destructive labels, returns to the main activity between taps, and reports any
 * crash/exception the system logged for the package.
 *
 * Usage: node android-audit.cjs <out.json> [--serial emulator-5554] [--pkg com.airemote.agent]
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ADB = 'D:\\autoclaw projects\\offline-build-tools\\android-toolchain\\sdk\\platform-tools\\adb.exe'
const outFile = path.resolve(process.argv[2] || 'android-audit.json')
const argOf = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null }
const SERIAL = argOf('serial') || 'emulator-5554'
const PKG = argOf('pkg') || 'com.airemote.agent'
const DESTRUCTIVE = /(إيقاف|حذف|مسح|إزالة|خروج|قطع|فصل|إنهاء|إلغاء|delete|remove|clear|stop|disconnect)/i
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function adb (...args) {
  return execFileSync(ADB, ['-s', SERIAL, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function dump () {
  adb('shell', 'uiautomator', 'dump', '/sdcard/audit.xml')
  adb('pull', '/sdcard/audit.xml', path.join(require('os').tmpdir(), 'audit.xml'))
  return fs.readFileSync(path.join(require('os').tmpdir(), 'audit.xml'), 'utf8')
}

function nodes (xml) {
  const out = []
  const re = /<node\b[^>]*>/g
  let m
  while ((m = re.exec(xml))) {
    const tag = m[0]
    const attr = (name) => {
      const r = new RegExp(name + '="([^"]*)"').exec(tag)
      return r ? r[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : ''
    }
    if (attr('clickable') !== 'true') continue
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr('bounds'))
    if (!b) continue
    out.push({
      cls: attr('class'), id: attr('resource-id'), text: attr('text').trim(), desc: attr('content-desc').trim(),
      enabled: attr('enabled') === 'true',
      x: Math.round((Number(b[1]) + Number(b[3])) / 2), y: Math.round((Number(b[2]) + Number(b[4])) / 2)
    })
  }
  return out
}

function focus () {
  try {
    const d = adb('shell', 'dumpsys', 'window')
    const m = /mCurrentFocus=([^\r\n]+)/.exec(d)
    return m ? m[1].trim() : ''
  } catch { return '' }
}

;(async () => {
  adb('logcat', '-c')
  adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`)
  await sleep(2500)
  const list = nodes(dump())
  const rows = []
  for (const n of list) {
    const label = n.text || n.desc || n.id || n.cls
    const skipped = !n.enabled || DESTRUCTIVE.test(label)
    if (skipped) { rows.push({ ...n, label, skipped: true, reason: !n.enabled ? 'disabled' : 'destructive' }); continue }
    const before = focus()
    try { adb('shell', 'input', 'tap', String(n.x), String(n.y)) } catch (e) { rows.push({ ...n, label, tapped: false, error: String(e.message || e) }); continue }
    await sleep(700)
    const after = focus()
    rows.push({ ...n, label, tapped: true, focusBefore: before, focusAfter: after, leftApp: !after.includes(PKG) })
    adb('shell', 'input', 'keyevent', '4')
    await sleep(300)
    adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`)
    await sleep(700)
  }

  const log = adb('logcat', '-d', '-v', 'brief').split(/\r?\n/)
  const bad = []
  for (let i = 0; i < log.length; i++) {
    if (!/FATAL EXCEPTION|ANR in/.test(log[i])) continue
    const block = log.slice(i, i + 4).join(' ')
    if (block.includes(PKG)) bad.push(log.slice(i, i + 12).join('\n'))
  }
  const shot = path.join(path.dirname(outFile), 'android-after.png')
  adb('shell', 'screencap', '-p', '/sdcard/audit.png')
  adb('pull', '/sdcard/audit.png', shot)

  const summary = {
    package: PKG, serial: SERIAL,
    clickable: rows.length,
    tapped: rows.filter(r => r.tapped).length,
    skipped: rows.filter(r => r.skipped).length,
    leftApp: rows.filter(r => r.leftApp).length,
    crashes: bad.length,
    crashLines: bad.slice(0, 5),
    screenshot: shot,
    rows
  }
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2), 'utf8')
  console.log(JSON.stringify({ clickable: summary.clickable, tapped: summary.tapped, skipped: summary.skipped, leftApp: summary.leftApp, crashes: summary.crashes }))
})().catch(e => { console.error('AUDIT FAILED: ' + (e.message || e)); process.exit(1) })
