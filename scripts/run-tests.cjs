#!/usr/bin/env node
/**
 * W2-4 — أمر اختبار موحّد.
 * يشغّل المجموعات السبع المعروفة (لا تحتاج Electron).
 * SKIP لا يُحسب نجاحاً — أي خروج غير صفر = فشل المجموعة.
 */
const { spawnSync } = require('node:child_process')

const tests = [
  'packages/server/test/registry-race.test.cjs',
  'packages/server/test/e2e-connection.test.cjs',
  'packages/server/test/e2e-authz.test.cjs',
  'packages/server/test/e2e-screen-keyframe.test.cjs',
  'packages/agent-desktop/test/safety.test.cjs',
  'packages/agent-desktop/test/password-kdf.test.cjs',
  'packages/server-desktop/test/secrets.test.cjs',
]

let failed = 0
for (const t of tests) {
  process.stdout.write('===== ' + t + ' =====\n')
  const r = spawnSync(process.execPath, [t], { stdio: 'inherit' })
  if (r.status !== 0) {
    process.stderr.write('FAIL ' + t + ' (exit ' + r.status + ')\n')
    failed++
  } else {
    process.stdout.write('PASS ' + t + '\n')
  }
}

process.stdout.write('\n' + (tests.length - failed) + '/' + tests.length + ' test groups passed\n')
if (failed) process.exit(1)
