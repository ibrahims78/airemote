'use strict'
/**
 * check-route-roles.cjs — بوابة 55 (3.15.0)
 *
 * تفشل عندما يُضاف مسار كتابة (POST/PUT/PATCH/DELETE) بلا أي شكل من أشكال التصريح
 * داخل معالجه — وهو بالضبط شكل عيب P0-2 (SFTP بلا دور).
 *
 * خط الأساس: scripts/baselines/route-roles.json يوثّق الاستثناءات المقصودة (نقطة دخول
 * الدخول/الإعداد/الوصول غير المراقب/التذكرة) مع سبب لكل واحدة.
 *
 * Usage: node scripts/check-route-roles.cjs
 * Exit:  0 = لا انتهاك جديد · 1 = مسار كتابة جديد بلا حراسة (أو خط أساس قديم)
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const SERVER = path.join(ROOT, 'packages/server-desktop/server.js')
const BASELINE = path.join(__dirname, 'baselines/route-roles.json')

const ROUTE = /^\s*fastify\.(get|post|put|patch|delete|head|options)\(\s*'([^']+)'/
const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// أي عائلة حراسة: authMiddleware · ftAuth · aiAuth · relayAuth · fsAuth · adminMiddleware · atLeast · hasDeviceCapability
const GUARDS = [
  /\b[a-zA-Z_]*Auth\(req\s*,/,
  /authMiddleware\(/,
  /adminMiddleware\(/,
  /atLeast\(/,
  /hasDeviceCapability\(/,
]

const lines = fs.readFileSync(SERVER, 'utf8').split(/\r?\n/)
const violations = []
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(ROUTE)
  if (!m) continue
  const verb = m[1].toUpperCase()
  if (!WRITE.has(verb)) continue
  const win = lines.slice(i, i + 8).join('\n')
  if (GUARDS.some((g) => g.test(win))) continue
  violations.push({ method: verb, path: m[2], line: i + 1 })
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { allowed: [] }
const allowed = new Map((baseline.allowed || []).map((a) => [a.method + ' ' + a.path, a]))

const unexpected = violations.filter((v) => !allowed.has(v.method + ' ' + v.path))
const stale = [...allowed.keys()].filter((k) => !violations.some((v) => v.method + ' ' + v.path === k))

console.log('حراسة مسارات الكتابة')
console.log('  مسارات كتابة بلا حراسة: ' + violations.length + ' (منها ' + (violations.length - unexpected.length) + ' في خط الأساس)')

if (stale.length) {
  console.log('\n  ⚠ خط أساس قديم (لم يعد يُخالف — احذفه):')
  for (const k of stale) console.log('    ' + k)
}

if (unexpected.length) {
  console.log('\n  ✗ مسارات كتابة جديدة بلا حراسة:')
  for (const v of unexpected) console.log('    ' + v.method + ' ' + v.path + '   (server.js:' + v.line + ')')
  console.log('\nFAIL أضف حراسة (`*Auth` · `adminMiddleware` · `atLeast` · `hasDeviceCapability`) أو وثّق الاستثناء في scripts/baselines/route-roles.json')
  process.exit(1)
}

console.log('\nPASS لا مسار كتابة بلا حراسة خارج خط الأساس')
process.exit(stale.length ? 1 : 0)
