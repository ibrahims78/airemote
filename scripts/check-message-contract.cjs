'use strict'
/**
 * check-message-contract.cjs — بوابة 53 (3.14.4 / P1-4)
 *
 * تفشل عندما يُستخدم نوع رسالة WS في الشيفرة الحيّة بلا إعلان في العقد
 * (packages/shared/src/types/messages.ts).
 *
 * لماذا: عيب fs/pty في 3.14.3 كان بالضبط هذا — الشيفرة ترسل اسمًا والعقد يعلن غيره،
 * ولا شيء كان يكشف الانحراف.
 *
 * تُبلغ (بلا فشل) عن الأنواع المعلنة التي لا يستخدمها أحد.
 *
 * Usage: node scripts/check-message-contract.cjs
 * Exit:  0 = كل نوع مستخدم معلن · 1 = نوع مستخدم غير معلن
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const CONTRACT = path.join(ROOT, 'packages/shared/src/types/messages.ts')

// نطاقات الرسائل المعروفة — تقلّل الضجيج (node:events وأمثالها ليست رسائل)
const PREFIX = /^(agent|server|client|device|pty|ft|relay|screen|rtc|session|fs|alert|view|tunnel|contact|cmd|ai|broadcast):[a-z0-9_]+$/

const SCAN = [
  ['packages/server-desktop', ['.js']],
  ['packages/dashboard/src', ['.ts', '.tsx']],
  ['packages/agent-desktop', ['.js', '.html', '.ts', '.tsx']],
  ['packages/android-agent/app/src', ['.java']],
]

// مواضع الاستخدام: إرسال `type: 'x'` · مقارنة `type === 'x'` · فرع `case 'x':`
const PATTERNS = [
  /type\s*:\s*['"]([a-z][a-z0-9_:]+)['"]/g,
  /type\s*[!=]==\s*['"]([a-z][a-z0-9_:]+)['"]/g,
  /case\s*['"]([a-z][a-z0-9_:]+)['"]\s*:/g,
]

function collectFiles(dir, exts, out) {
  if (!fs.existsSync(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', 'static', 'out'].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) collectFiles(p, exts, out)
    else if (exts.some((x) => e.name.endsWith(x)) && !e.name.endsWith('.bundle.js')) out.push(p)
  }
}

function declaredTypes() {
  const src = fs.readFileSync(CONTRACT, 'utf8')
  const start = src.indexOf('export type WSMessageType')
  if (start < 0) throw new Error('WSMessageType not found in ' + CONTRACT)
  const end = src.indexOf('export interface', start)
  const block = src.slice(start, end < 0 ? undefined : end)
  const set = new Set()
  for (const m of block.matchAll(/'([a-z][a-z0-9_:]+)'/g)) if (PREFIX.test(m[1])) set.add(m[1])
  return set
}

function main() {
  const declared = declaredTypes()
  const files = []
  for (const [dir, exts] of SCAN) collectFiles(path.join(ROOT, dir), exts, files)

  const used = new Map()
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8')
    for (const re of PATTERNS) {
      for (const m of s.matchAll(re)) {
        const t = m[1]
        if (!PREFIX.test(t)) continue
        if (!used.has(t)) used.set(t, new Set())
        used.get(t).add(path.relative(ROOT, f).replace(/\\/g, '/'))
      }
    }
  }

  const undeclared = [...used.keys()].filter((t) => !declared.has(t)).sort()
  const unused = [...declared].filter((t) => !used.has(t)).sort()

  console.log('عقد الرسائل — فحص الإعلان')
  console.log('  ملفات مفحوصة      ' + files.length)
  console.log('  أنواع معلنة       ' + declared.size)
  console.log('  أنواع مستخدمة     ' + used.size)

  if (unused.length) {
    console.log('\n  ⚠ معلنة بلا مستخدم (' + unused.length + ') — تحذير لا فشل:')
    console.log('    ' + unused.join(' · '))
  }

  if (undeclared.length) {
    console.log('\n  ✗ مستخدمة بلا إعلان (' + undeclared.length + '):')
    for (const t of undeclared) {
      const where = [...used.get(t)].slice(0, 2).join(', ')
      console.log('    ' + t.padEnd(34) + where)
    }
    console.log('\nFAIL ' + undeclared.length + ' نوعًا مستخدمًا غير معلن في العقد')
    process.exit(1)
  }

  console.log('\nPASS كل نوع مستخدم معلن في العقد')
  process.exit(0)
}

main()
