#!/usr/bin/env node
'use strict'
/**
 * check-password-policy.cjs — يحرس تطابق حدّ طول كلمة مرور المستخدم بين اللوحة والسيرفر.
 *
 * لماذا: كانت الواجهة تقبل 8 أحرف والسيرفر يرفض أقل من 12، فيرى المستخدم
 * «كلمة المرور قوية» ثم خطأ 400 عند الإرسال. العيب كان في ثلاثة مواضع:
 * SetupPage · إنشاء مستخدم · إعادة تعيين كلمة مرور — إضافة إلى نص i18n.
 *
 * المصدر المرجعي: تحقّقات السيرفر التي تحمل رسالة إنجليزية
 * (Password must be at least N / Min N characters) لمسارات المستخدمين.
 * كلمة مرور الجهاز (رسالة عربية) خارج النطاق عمداً.
 *
 * الخروج: 0 عند التطابق، 1 عند أي اختلاف أو نقص في القياس.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SERVER = path.join(ROOT, 'packages', 'server-desktop', 'server.js')
const DASH = path.join(ROOT, 'packages', 'dashboard', 'src')

function fail(msg) { console.error('FAIL ' + msg); process.exit(1) }

const serverSrc = fs.readFileSync(SERVER, 'utf8')

// 1) حدود السيرفر لكلمات مرور المستخدمين (رسائل إنجليزية)
const serverHits = []
const re = /password\.length < (\d+)\)?[^\n]*(?:Password must be at least|Min \d+ characters)/g
let m
while ((m = re.exec(serverSrc))) {
  serverHits.push({ n: Number(m[1]), line: serverSrc.slice(0, m.index).split('\n').length })
}
if (serverHits.length < 2) fail(`تعذّر قياس حدود السيرفر (وجدت ${serverHits.length} موضعاً، المتوقع ≥2)`)
const serverNums = [...new Set(serverHits.map(h => h.n))]
if (serverNums.length !== 1) fail(`حدود السيرفر غير متسقة: ${serverNums.join(' / ')} في الأسطر ${serverHits.map(h => h.line).join(',')}`)
const serverMin = serverNums[0]
console.log(`server: ${serverMin} حرفاً (${serverHits.length} موضعاً: ${serverHits.map(h => h.line).join(', ')})`)

// 2) كل حدود اللوحة (كل ملفات src) — الحقول التي تخص كلمة المرور
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
  return out
}
const files = walk(DASH)
const uiHits = []
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const lines = src.split(/\r?\n/)
  lines.forEach((line, i) => {
    if (!/password/i.test(line) && !/\bp\.length\s*[<>]=?\s*\d+/.test(line)) return
    let mm
    const cmp = /(?:password|\bp)\.length\s*[<>]=?\s*(\d+)/i.exec(line)
    if (cmp) uiHits.push({ file: path.relative(ROOT, f), line: i + 1, n: Number(cmp[1]), src: line.trim() })
    // نص i18n: password_min: 'N ...'
    const i18 = /password_min:\s*'[^']*?(\d+)\s*(?:أحرف|حرف|characters)/.exec(line)
    if (i18) uiHits.push({ file: path.relative(ROOT, f), line: i + 1, n: Number(i18[1]), src: line.trim() })
  })
}
if (!uiHits.length) fail('تعذّر إيجاد أي حدّ لكلمة المرور في اللوحة')

const bad = uiHits.filter(h => h.n !== serverMin)
for (const h of uiHits) {
  console.log(`${h.n === serverMin ? 'OK  ' : 'BAD '} ${h.file}:${h.line} → ${h.n}  | ${h.src.slice(0, 70)}`)
}

if (bad.length) {
  console.error(`\nFAIL ${bad.length} موضعاً يخالف حدّ السيرفر (${serverMin}): ${bad.map(b => `${b.file}:${b.line}`).join(', ')}`)
  process.exit(1)
}
console.log(`\nPASS ${uiHits.length} موضعاً في اللوحة كلها تطابق حدّ السيرفر (${serverMin}).`)
