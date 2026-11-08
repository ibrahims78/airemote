'use strict'
/**
 * audit-message-pairs.cjs — تقرير فقط (ليس بوابة).
 *
 * يسأل سؤالًا واحدًا: كل نوع يرسله طرف، هل يعالجه الطرف الآخر؟
 *   server -> agent : server:* التي يرسلها server.js  ⇒ يجب أن تظهر في معالجات الوكيلين
 *   agent  -> server: agent:* التي يرسلها الوكيلان    ⇒ يجب أن تظهر في معالجات السيرفر
 *
 * لا يُفشل البطارية: بعض الأنواع مشروطة بقدرات أو منصّة، وبعضها توافق قديم.
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const PREFIX = /^(agent|server):[a-z0-9_]+$/

const server = fs.readFileSync(path.join(ROOT, 'packages/server-desktop/server.js'), 'utf8')
const winAgent = fs.readFileSync(path.join(ROOT, 'packages/agent-desktop/main.js'), 'utf8')
const andAgent = fs.readFileSync(path.join(ROOT, 'packages/android-agent/app/src/main/java/com/airemote/agent/AgentService.java'), 'utf8')

// ما يرسله السيرفر إلى الوكيل: sendJson(rec.ws, { type: 'server:...' })
const serverSends = new Set()
for (const m of server.matchAll(/sendJson\(\s*\w+\.ws\s*,\s*\{\s*type:\s*'(server:[a-z0-9_]+)'/g)) serverSends.add(m[1])
// وأيضًا أي كائن فيه type: 'server:...' داخل server.js (يشمل أغلفة الدوال)
for (const m of server.matchAll(/type:\s*'(server:[a-z0-9_]+)'/g)) serverSends.add(m[1])

// ما يعالجه الوكيل: case 'server:...' أو type === 'server:...'
function handled(src) {
  const s = new Set()
  for (const m of src.matchAll(/case\s*['"](server:[a-z0-9_]+)['"]/g)) s.add(m[1])
  for (const m of src.matchAll(/type\s*[!=]==\s*['"](server:[a-z0-9_]+)['"]/g)) s.add(m[1])
  for (const m of src.matchAll(/['"](server:[a-z0-9_]+)['"]\s*===/g)) s.add(m[1])
  for (const m of src.matchAll(/equals\s*\(\s*['"](server:[a-z0-9_]+)['"]/g)) s.add(m[1])
  return s
}
const winHandles = handled(winAgent)
const andHandles = handled(andAgent)

const winMissing = [...serverSends].filter((t) => !winHandles.has(t)).sort()
const andMissing = [...serverSends].filter((t) => !andHandles.has(t)).sort()

console.log('# أزواج الرسائل — سيرفر → وكيل\n')
console.log('أنواع يرسلها السيرفر: ' + serverSends.size)
console.log('يعالجها وكيل ويندوز: ' + winHandles.size + ' · وكيل أندرويد: ' + andHandles.size + '\n')
console.log('## لا يعالجها وكيل ويندوز (' + winMissing.length + ')')
for (const t of winMissing) console.log('  ' + t)
console.log('\n## لا يعالجها وكيل أندرويد (' + andMissing.length + ')')
for (const t of andMissing) console.log('  ' + t)
console.log('\n## فرق المنصّتين (يعالجها ويندوز ولا يعالجها أندرويد)')
for (const t of [...winHandles].filter((t) => !andHandles.has(t)).sort()) console.log('  ' + t)

// الاتجاه المعاكس: ما يرسله الوكيلان مقابل ما يعالجه السيرفر
const agentSends = new Set()
for (const src of [winAgent, andAgent]) {
  for (const m of src.matchAll(/type:\s*'(agent:[a-z0-9_]+)'/g)) agentSends.add(m[1])
  for (const m of src.matchAll(/"(agent:[a-z0-9_]+)"/g)) agentSends.add(m[1])
}
const serverHandles = new Set()
for (const m of server.matchAll(/case\s*'(agent:[a-z0-9_]+)'/g)) serverHandles.add(m[1])
for (const m of server.matchAll(/type\s*[!=]==\s*'(agent:[a-z0-9_]+)'/g)) serverHandles.add(m[1])
const serverMissing = [...agentSends].filter((t) => !serverHandles.has(t)).sort()
console.log('\n# وكيل → سيرفر\n')
console.log('أنواع يرسلها الوكيلان: ' + agentSends.size + ' · يعالجها السيرفر: ' + serverHandles.size)
console.log('\n## يرسلها الوكيل ولا يعالجها السيرفر (' + serverMissing.length + ')')
for (const t of serverMissing) console.log('  ' + t)
