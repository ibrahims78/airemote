'use strict'
/**
 * android-audit.cjs — click every clickable node on the Android agent, one at a time.
 * Skips destructive labels, returns to the main activity between taps, and reports any
 * crash/exception the system logged for the package.
 *
 * Usage: node android-audit.cjs <out.json> [--serial emulator-5554] [--pkg com.airemote.agent] [--baseline]
 *
 * --baseline pins the §4.3 reference surface (Arabic · status tab · settings folded · no session)
 * and refuses to tap unless the surface holds exactly 19 clickables **and the status tab reads
 * Arabic** (exit code 3 otherwise). Without it the run is a smoke reading: the count is recorded,
 * never enforced.
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
// §4.3 — the reference surface is pinned, so its count is an acceptance number, not a reading.
const BASELINE = process.argv.includes('--baseline')
const BASELINE_CLICKABLE = 19

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

/** tap one node by its exact resource-id (the reference surface is addressed by id, never by label) */
function tapId (id) {
  const tag = new RegExp('<node\\b[^>]*resource-id="' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>').exec(dump())
  if (!tag) return null
  const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(tag[0])
  if (!b) return null
  const x = Math.round((Number(b[1]) + Number(b[3])) / 2)
  const y = Math.round((Number(b[2]) + Number(b[4])) / 2)
  adb('shell', 'input', 'tap', String(x), String(y))
  return { id, x, y }
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
  adb('shell', 'am', 'force-stop', PKG)
  await sleep(800)
  adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`)
  await sleep(2500)

  let baselineInfo = null
  if (BASELINE) {
    // Pin the reference surface before counting: Arabic UI, status tab, settings folded.
    // BACK closes whatever the two taps opened; MainActivity is the app's only activity, so a
    // BACK on a bare surface finishes it — the surface is brought forward again right after.
    const steps = []
    const lang = tapId(`${PKG}:id/tb_lang_ar`)
    steps.push({ step: 'lang-ar', ok: !!lang, at: lang && `${lang.x},${lang.y}` })
    await sleep(900)
    const tab = tapId(`${PKG}:id/tab_status`)
    steps.push({ step: 'tab-status', ok: !!tab, at: tab && `${tab.x},${tab.y}` })
    await sleep(900)
    adb('shell', 'input', 'keyevent', '4')
    await sleep(600)
    adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`)
    await sleep(2200)
    const surface = nodes(dump())
    // the decision defines the surface as Arabic, so the count alone is not the gate: an English
    // surface has the same 19 clickables and would otherwise pass as "the reference surface".
    const statusTab = surface.find(n => n.id === `${PKG}:id/tab_status`)
    const arabic = !!(statusTab && /[\u0600-\u06FF]/.test(statusTab.text))
    baselineInfo = { expected: BASELINE_CLICKABLE, clickable: surface.length, arabic, steps }
    if (surface.length !== BASELINE_CLICKABLE || !arabic || steps.some(s => !s.ok)) {
      fs.mkdirSync(path.dirname(outFile), { recursive: true })
      fs.writeFileSync(outFile, JSON.stringify({
        package: PKG, serial: SERIAL, failed: 'baseline-surface-mismatch', baseline: baselineInfo,
        rows: surface.map(n => ({ id: n.id, text: n.text, desc: n.desc, enabled: n.enabled }))
      }, null, 2), 'utf8')
      console.error(`BASELINE MISMATCH: clickable=${surface.length} expected=${BASELINE_CLICKABLE} arabic=${arabic} ` +
        `steps=${steps.map(s => s.step + ':' + (s.ok ? 'ok' : 'missing')).join(',')} — surface drifted, refusing to tap`)
      process.exit(3)
    }
  }
  const list = nodes(dump())
  const rows = []
  for (const n of list) {
    const label = n.text || n.desc || n.id || n.cls
    const skipped = !n.enabled || DESTRUCTIVE.test(label)
    if (skipped) { rows.push({ ...n, label, skipped: true, reason: !n.enabled ? 'disabled' : 'destructive' }); continue }
    const before = focus()
    try { adb('shell', 'input', 'tap', String(n.x), String(n.y)) } catch (e) { rows.push({ ...n, label, tapped: false, error: String(e.message || e) }); continue }
    await sleep(700)
    // A repaint can leave mCurrentFocus empty for a moment; an empty reading is not another app.
    let after = focus()
    if (!after) { await sleep(500); after = focus() }
    const leftApp = !!after && !(after.includes(PKG) || after.includes('PopupWindow'))
    rows.push({ ...n, label, tapped: true, focusBefore: before, focusAfter: after, leftApp })
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
    baseline: baselineInfo,
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
