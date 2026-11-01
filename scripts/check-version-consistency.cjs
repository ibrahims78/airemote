#!/usr/bin/env node
'use strict'
/**
 * check-version-consistency.cjs — يحرس رقماً واحداً للإصدار في كل المشروع.
 *
 * لماذا: أربعة ملفات package.json + build.gradle + /health + releases/manifest.json
 * كانت تنزلق عن بعضها (3.8.12 في HTML مقابل 3.9.1 على السيرفر…). هذا السكربت
 * يقارنها كلها ويفشل عند أي اختلاف.
 *
 * المصدر المرجعي: ملف VERSION في الجذر إن وُجد؛ وإلا فيُستنتج من السيرفر.
 *
 * الخروج: 0 عند التطابق، 1 عند أي اختلاف.
 * الخيارات: --allow-missing-server  (تخطّي /health إن لم يكن السيرفر يعمل)
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'   // السيرفر المثبّت بشهادة ذاتية
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const argv = process.argv.slice(2)
const ALLOW_MISSING_SERVER = argv.includes('--allow-missing-server')

const rows = []
const add = (source, value, note) => rows.push({ source, value: value == null ? '' : String(value), note: note || '' })

function readJsonVersion (rel) {
  const p = path.join(ROOT, rel)
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).version || '' } catch (e) { return 'MISSING' }
}

// 1) VERSION (المصدر المرجعي)
const versionFile = path.join(ROOT, 'VERSION')
const canonical = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8').trim() : ''
add('VERSION', canonical || '(غائب)', canonical ? 'المصدر المرجعي' : 'لم يُنشأ بعد')

// 2) الحزم الأربع
for (const pkg of ['package.json', 'packages/server-desktop/package.json', 'packages/agent-desktop/package.json',
  'packages/dashboard/package.json']) {
  add(pkg, readJsonVersion(pkg))
}
// android-agent لا يحمل package.json (مشروع Gradle صرف) — إصداره يُقرأ من build.gradle أدناه.

// 3) Android build.gradle
let gradleName = ''
let gradleCode = ''
try {
  const g = fs.readFileSync(path.join(ROOT, 'packages/android-agent/app/build.gradle'), 'utf8')
  const mName = g.match(/versionName\s+["']([^"']+)["']/)
  const mCode = g.match(/versionCode\s+(\d+)/)
  gradleCode = mCode ? mCode[1] : ''
  if (mName) {
    gradleName = mName[1]
  } else if (/versionName\s+appVersionName/.test(g) && /rootProject\.file\(['"]\.\.\/\.\.\/VERSION['"]\)/.test(g)) {
    // P6 — الإصدار مربوط بملف VERSION: القيمة الفعلية هي قيمة الملف نفسه.
    gradleName = canonical
  } else {
    gradleName = 'UNRESOLVED'
  }
} catch (e) { gradleName = 'MISSING' }
add('android build.gradle versionName', gradleName, gradleCode ? 'versionCode=' + gradleCode : '')

// 4) ثوابت مكتوبة بيد داخل السيرفر — كانت 3.9.1 بعد بناء 3.10.0
let hardcoded = []
try {
  const s = fs.readFileSync(path.join(ROOT, 'packages/server-desktop/server.js'), 'utf8')
  const re = /(SERVER_VERSION|AGENT_VERSION)\s*=\s*['"](\d+\.\d+\.\d+)['"]/g
  let m
  while ((m = re.exec(s))) hardcoded.push(m[1] + " = '" + m[2] + "'")
} catch {}
add('server.js hardcoded versions', hardcoded.length ? hardcoded.join(', ') : '(لا شيء)', hardcoded.length ? 'يجب أن تُقرأ من package.json' : 'سليم')

// 5) بيان الإصدار
add('releases/manifest.json', readJsonVersion('releases/manifest.json'))

// 5) السيرفر الحيّ
async function serverVersion () {
  for (const p of ['/health', '/ready']) {
    try {
      const r = await fetch('https://127.0.0.1:3001' + p, { headers: { Accept: 'application/json' } })
      const j = await r.json()
      if (j && j.version) return { v: j.version, from: p }
    } catch (e) { /* السيرفر غير متاح */ }
  }
  return null
}

;(async () => {
  const srv = await serverVersion()
  add('server /health', srv ? srv.v : 'UNREACHABLE', srv ? 'من ' + srv.from : '')

  const width = Math.max(...rows.map(r => r.source.length))
  console.log('AiRemote — فحص توحيد الإصدار\n')
  for (const r of rows) {
    const flag = (canonical && r.value !== canonical && r.value !== 'UNREACHABLE') ? '✗' : (r.value === canonical ? '✓' : '·')
    console.log('  ' + flag + ' ' + r.source.padEnd(width, ' ') + '  ' + r.value.padEnd(12, ' ') + (r.note ? '  ' + r.note : ''))
  }

  const problems = []
  if (!canonical) problems.push('ملف VERSION غير موجود — أنشئه بقيمة الإصدار الحالية')
  if (srv == null && !ALLOW_MISSING_SERVER) problems.push('السيرفر غير متاح: لم يُتحقّق من /health')
  if (hardcoded.length) problems.push('إصدار مكتوب بيد في server.js: ' + hardcoded.join(', '))
  for (const r of rows) {
    if (r.source === 'server.js hardcoded versions') continue
    if (r.value === 'UNREACHABLE' || r.value === 'MISSING') { problems.push(r.source + ' غير مقروء'); continue }
    if (canonical && r.value !== canonical) problems.push(r.source + ' = ' + r.value + ' ≠ ' + canonical)
  }

  if (problems.length) {
    console.error('\nFAIL ' + problems.length + ' اختلاف:')
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }
  console.log('\nPASS كل المصادر تحمل ' + canonical)
})()
