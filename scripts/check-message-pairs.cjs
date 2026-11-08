'use strict'
/**
 * check-message-pairs.cjs — بوابة 56 (3.15.0)
 *
 * تفشل عندما يُرسل السيرفر إلى الوكيل نوعًا لا يعالجه الوكيل — وهو شكل عيب fs/pty:
 * رسالة تُرسَل بلا مستقبل، فتبدو الميزة قائمة وهي صامتة.
 *
 * خط الأساس: scripts/baselines/message-pairs.json يوثّق الحالات المقبولة مع سبب.
 *
 * Usage: node scripts/check-message-pairs.cjs
 * Exit:  0 = لا انحراف جديد · 1 = نوع مُرسَل بلا معالج (أو خط أساس قديم)
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const BASELINE = path.join(__dirname, 'baselines/message-pairs.json')

const server = fs.readFileSync(path.join(ROOT, 'packages/server-desktop/server.js'), 'utf8')
const winAgent = fs.readFileSync(path.join(ROOT, 'packages/agent-desktop/main.js'), 'utf8')
const andAgent = fs.readFileSync(path.join(ROOT, 'packages/android-agent/app/src/main/java/com/airemote/agent/AgentService.java'), 'utf8')

// ما يرسله السيرفر فعلًا إلى مقبس وكيل
const sent = new Set()
for (const m of server.matchAll(/type:\s*'(server:[a-z0-9_]+)'/g)) sent.add(m[1])

function handled(src) {
  const s = new Set()
  for (const m of src.matchAll(/case\s*['"](server:[a-z0-9_]+)['"]/g)) s.add(m[1])
  for (const m of src.matchAll(/type\s*[!=]==\s*['"](server:[a-z0-9_]+)['"]/g)) s.add(m[1])
  for (const m of src.matchAll(/['"](server:[a-z0-9_]+)['"]\s*===/g)) s.add(m[1])
  for (const m of src.matchAll(/equals\s*\(\s*['"](server:[a-z0-9_]+)['"]/g)) s.add(m[1])
  return s
}
const win = handled(winAgent)
const and = handled(andAgent)

const baseline = fs.existsSync(BASELINE)
  ? JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  : { win: [], android: [] }
const bWin = new Set((baseline.win || []).map((x) => x.type))
const bAnd = new Set((baseline.android || []).map((x) => x.type))

const winGaps = [...sent].filter((t) => !win.has(t)).sort()
const andGaps = [...sent].filter((t) => !and.has(t)).sort()

const newWin = winGaps.filter((t) => !bWin.has(t))
const newAnd = andGaps.filter((t) => !bAnd.has(t))
const staleWin = [...bWin].filter((t) => !winGaps.includes(t))
const staleAnd = [...bAnd].filter((t) => !andGaps.includes(t))

console.log('أزواج الرسائل — سيرفر → وكيل')
console.log('  يرسلها السيرفر      ' + sent.size)
console.log('  يعالجها ويندوز      ' + win.size + '  (فجوات: ' + winGaps.length + '، منها ' + (winGaps.length - newWin.length) + ' في خط الأساس)')
console.log('  يعالجها أندرويد     ' + and.size + '  (فجوات: ' + andGaps.length + '، منها ' + (andGaps.length - newAnd.length) + ' في خط الأساس)')

const stale = [...staleWin.map((t) => 'win:' + t), ...staleAnd.map((t) => 'android:' + t)]
if (stale.length) {
  console.log('\n  ⚠ خط أساس قديم (لم يعد فجوة — احذفه):')
  for (const t of stale) console.log('    ' + t)
}

if (newWin.length || newAnd.length) {
  if (newWin.length) {
    console.log('\n  ✗ يُرسَل إلى وكيل ويندوز ولا يُعالَج:')
    for (const t of newWin) console.log('    ' + t)
  }
  if (newAnd.length) {
    console.log('\n  ✗ يُرسَل إلى وكيل أندرويد ولا يُعالَج:')
    for (const t of newAnd) console.log('    ' + t)
  }
  console.log('\nFAIL أضف معالجًا في الوكيل، أو وثّق الاستثناء في scripts/baselines/message-pairs.json')
  process.exit(1)
}

console.log('\nPASS لا رسالة تُرسَل بلا معالج خارج خط الأساس')
process.exit(stale.length ? 1 : 0)
