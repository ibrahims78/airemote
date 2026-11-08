'use strict'
/**
 * audit-live-surface.cjs — تقرير فقط (ليس بوابة).
 * يقيس سطح السيرفر الحيّ (packages/server-desktop/server.js) ووكيل ويندوز الحيّ،
 * لأن أرقام خطة 3.14.4 (56/47/3) جاءت من packages/server وpackages/agent غير المشحونين.
 *
 * المخرجات: جدول Markdown على stdout + ملخص أرقام.
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const SERVER = path.join(ROOT, 'packages/server-desktop/server.js')
const DASH = path.join(ROOT, 'packages/dashboard/src')

const server = fs.readFileSync(SERVER, 'utf8')
const lines = server.split(/\r?\n/)

// ── 1) مسارات HTTP الحيّة ────────────────────────────────────────────────────
const ROUTE = /^\s*fastify\.(get|post|put|patch|delete|head|options)\(\s*'([^']+)'/
const routes = []
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(ROUTE)
  if (!m) continue
  // نافذة الحراسة: من سطر التسجيل حتى 6 أسطر (الحراسة في السطر التالي عادة)
  const win = lines.slice(i, i + 7).join('\n')
  routes.push({
    line: i + 1,
    verb: m[1].toUpperCase(),
    path: m[2],
    auth: /\b[a-zA-Z_]*Auth\(req\s*,/.test(win) || /authMiddleware\(/.test(win),
    admin: /adminMiddleware\(/.test(win),
    role: /atLeast\(/.test(win),
    fsAuth: /fsAuth\(/.test(win),
    cap: /hasDeviceCapability\(/.test(win),
    audit: /dbLogAudit\(/.test(win),
  })
}

const write = routes.filter((r) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.verb))
const guarded = (r) => r.auth || r.admin || r.role || r.fsAuth || r.cap
const unguardedWrites = write.filter((r) => !guarded(r))
const noAuthAtAll = routes.filter((r) => !r.auth && !r.admin && !r.role && !r.fsAuth && !r.cap)

// ── 2) مسارات يستدعيها اللوحة فعلًا ──────────────────────────────────────────
const dashFiles = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(e.name)) dashFiles.push(p)
  }
}
walk(DASH)
let dashSrc = ''
for (const f of dashFiles) dashSrc += fs.readFileSync(f, 'utf8') + '\n'
const dashRefs = new Set()
for (const m of dashSrc.matchAll(/['"`]\/api\/([A-Za-z0-9_\-/:$?{}&=.]+)/g)) dashRefs.add('/api/' + m[1].split('?')[0])

const norm = (p) => p.replace(/\$\{[^}]+\}/g, ':').replace(/:\w+/g, ':').replace(/\/$/, '')
const dashSet = [...dashRefs].map(norm)
function calledByDash(routePath) {
  const r = norm(routePath)
  return dashSet.some((d) => {
    if (d === r) return true
    // مقارنة بادئة ذكية: /api/devices/:id يطابق /api/devices/:id/fs
    const a = d.split('/'), b = r.split('/')
    if (b.length > a.length) return false
    for (let i = 0; i < b.length; i++) if (b[i] !== a[i] && b[i] !== ':') return false
    return true
  })
}
const noCaller = routes.filter((r) => !calledByDash(r.path))

// ── 3) قدرات وكيل ويندوز ────────────────────────────────────────────────────
const agent = fs.readFileSync(path.join(ROOT, 'packages/agent-desktop/main.js'), 'utf8')
const caps = new Set()
const capAt = agent.indexOf('capabilities: {')
if (capAt >= 0) {
  let depth = 0, i = agent.indexOf('{', capAt)
  for (; i < agent.length; i++) {
    if (agent[i] === '{') depth++
    else if (agent[i] === '}') { depth--; if (!depth) break }
  }
  const body = agent.slice(capAt, i + 1)
  for (const m of body.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)) caps.add(m[1])
}
const capUsedByDash = [...caps].filter((c) =>
  new RegExp('\\b' + c + '\\b').test(dashSrc)
)
const capUnusedByDash = [...caps].filter((c) => !capUsedByDash.includes(c))

// ── التقرير ─────────────────────────────────────────────────────────────────
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
console.log('# سطح AiRemote الحيّ — قياس 2026-11-08\n')
console.log('## 1) مسارات HTTP\n')
console.log('| المقياس | العدد |')
console.log('|---|---|')
console.log('| مسارات مسجّلة | ' + routes.length + ' |')
console.log('| منها كتابة (POST/PUT/PATCH/DELETE) | ' + write.length + ' |')
console.log('| كتابة بلا أي حراسة | ' + unguardedWrites.length + ' |')
console.log('| مسارات بلا حراسة إطلاقًا | ' + noAuthAtAll.length + ' |')
console.log('| مسارات تكتب سطر تدقيق | ' + routes.filter((r) => r.audit).length + ' |')
console.log('| مسارات لا تستدعيها اللوحة | ' + noCaller.length + ' (' + pct(noCaller.length, routes.length) + '%) |')
console.log('\n### كتابة بلا حراسة (' + unguardedWrites.length + ')\n')
if (unguardedWrites.length) {
  console.log('| سطر | الطريقة | المسار |')
  console.log('|---|---|---|')
  for (const r of unguardedWrites) console.log('| ' + r.line + ' | ' + r.verb + ' | `' + r.path + '` |')
}
console.log('\n### مسارات لا تستدعيها اللوحة — أول 25\n')
console.log('| سطر | الطريقة | المسار | حراسة |')
console.log('|---|---|---|---|')
for (const r of noCaller.slice(0, 25)) {
  const g = r.admin ? 'admin' : r.role ? 'role' : r.fsAuth ? 'fsAuth' : r.cap ? 'capability' : r.auth ? 'auth' : 'بلا'
  console.log('| ' + r.line + ' | ' + r.verb + ' | `' + r.path + '` | ' + g + ' |')
}
console.log('\n## 2) قدرات وكيل ويندوز\n')
console.log('| المقياس | العدد |')
console.log('|---|---|')
console.log('| قدرات معلنة في الوكيل | ' + caps.size + ' |')
console.log('| تذكرها اللوحة | ' + capUsedByDash.length + ' |')
console.log('| لا تذكرها اللوحة | ' + capUnusedByDash.length + ' |')
console.log('\nغير مذكورة في اللوحة: ' + capUnusedByDash.join(' · '))
