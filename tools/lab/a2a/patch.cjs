'use strict'
/**
 * brief/patch.cjs — ترقيع نصي آمن لملفات المستودع (خارج مجلد المشروع).
 *
 * لماذا: أدوات التحرير لا تصل إلى D:\، والترقيع بأوامر shell المباشرة سريع
 * لكنه بلا حماية. هذا السكربت يفرض ثلاث قواعد:
 *   1) كل نص مستهدف يجب أن يظهر مرة واحدة بالضبط — وإلا يفشل بلا كتابة.
 *   2) الملف الجديد لا يجوز أن ينكمش (إلا إن مُرّر allowShrink).
 *   3) الكتابة ذرّية: يُكتب إلى .tmp ثم يُستبدل.
 *
 * الاستخدام: node brief/patch.cjs brief/patch-main.json
 * ملف الترقيع: { "file": "abs path", "edits": [{ "old": "...", "new": "..." }], "allowShrink": false }
 */
const fs = require('fs')

const specPath = process.argv[2]
if (!specPath) { console.error('usage: node brief/patch.cjs <spec.json>'); process.exit(2) }
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
const file = spec.file
const original = fs.readFileSync(file, 'utf8')

let out = original
const crlf = original.includes('\r\n')
const norm = (s) => crlf ? String(s).replace(/\r?\n/g, '\r\n') : String(s).replace(/\r\n/g, '\n')
const applied = []
for (const [i, e] of (spec.edits || []).entries()) {
  const oldText = norm(e.old)
  const newText = norm(e.new)
  const occurrences = out.split(oldText).length - 1
  if (occurrences !== 1) {
    console.error(`ABORT edit#${i}: target appears ${occurrences} times (expected exactly 1). Nothing written.`)
    console.error('  first 120 chars: ' + JSON.stringify(String(e.old).slice(0, 120)))
    process.exit(1)
  }
  out = out.replace(oldText, newText)
  applied.push(i)
}

if (out === original) { console.error('ABORT: no change produced.'); process.exit(1) }
if (!spec.allowShrink && out.length < original.length) {
  console.error(`ABORT: file would shrink ${original.length} → ${out.length}. Nothing written.`)
  process.exit(1)
}

const tmp = file + '.tmp'
fs.writeFileSync(tmp, out, 'utf8')
fs.renameSync(tmp, file)
console.log(`PATCHED ${file}`)
console.log(`  edits: ${applied.length}  bytes: ${original.length} → ${out.length} (${out.length - original.length >= 0 ? '+' : ''}${out.length - original.length})`)
