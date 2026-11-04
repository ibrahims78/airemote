#!/usr/bin/env node
'use strict'
/**
 * audit-screen-surface.cjs — حارس سطح بث الشاشة.
 *
 * يقيس ثلاث زوايا تمنع عودة التكرار:
 *   buttons          عدد الأزرار في كل سطح
 *   viewOpenCalls    عدد window.open(...'/view/...') — يجب أن يكون 0 بعد 3.12.4
 *   screenStopSends  عدد مرات إرسال screen:stop من اللوحة
 *
 * الاستخدام:
 *   node scripts/audit-screen-surface.cjs            # طباعة القياسات
 *   node scripts/audit-screen-surface.cjs --json     # JSON فقط
 *   node scripts/audit-screen-surface.cjs --check    # فشل عند تجاوز الحدود
 *   node scripts/audit-screen-surface.cjs --write    # تثبيت خط أساس جديد (ratchet)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DASH = 'packages/dashboard/src'
const BASELINE = path.join(__dirname, 'screen-surface-baseline.json')

const BUTTON_FILES = [
  'packages/dashboard/src/components/ScreenViewer.tsx',
  'packages/dashboard/src/components/LivePreview.tsx',
  'packages/dashboard/src/components/LivePreviewBoard.tsx',
  'packages/dashboard/src/pages/OverviewPage.tsx',
  'packages/dashboard/src/pages/DeviceWorkspacePage.tsx',
  'packages/dashboard/src/pages/SessionsPage.tsx',
  'packages/dashboard/src/pages/DevicesPage.tsx',
]

const argv = process.argv.slice(2)
const CHECK = argv.includes('--check')
const WRITE = argv.includes('--write')
const JSON_ONLY = argv.includes('--json')

function read (rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8') } catch { return '' }
}

function walk (dir, out) {
  let entries = []
  try { entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const rel = path.posix.join(dir, e.name)
    if (e.isDirectory()) walk(rel, out)
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(rel)
  }
  return out
}

const buttons = {}
for (const f of BUTTON_FILES) buttons[f] = (read(f).match(/<button\b/g) || []).length
buttons.__total = Object.values(buttons).reduce((a, b) => a + b, 0)

let viewOpenCalls = 0
let screenStopSends = 0
for (const f of walk(DASH, [])) {
  const src = read(f)
  viewOpenCalls += (src.match(/window\.open\([^)]*\/view\//g) || []).length
  screenStopSends += (src.match(/'screen:stop'/g) || []).length
}

let toolbarVisible = 0
{
  const sv = read('packages/dashboard/src/components/ScreenViewer.tsx')
  toolbarVisible = (sv.match(/data-tb="1"/g) || []).length
}

const current = { measuredAt: new Date().toISOString(), buttons, toolbarVisible, viewOpenCalls, screenStopSends }

if (WRITE) {
  const baseline = {
    note: 'خط أساس سطح بث الشاشة — حدّثه بـ --write بعد كل مرحلة مقصودة فقط.',
    limits: { buttons, toolbarVisible, viewOpenCalls, screenStopSends },
  }
  fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n')
  if (!JSON_ONLY) console.log('baseline written:', path.relative(ROOT, BASELINE))
}

if (JSON_ONLY) {
  console.log(JSON.stringify(current, null, 2))
} else {
  console.log('AiRemote — قياس سطح بث الشاشة\n')
  for (const [f, n] of Object.entries(buttons)) {
    if (f === '__total') continue
    console.log('  ' + String(n).padStart(3) + '  ' + f.replace('packages/dashboard/src/', ''))
  }
  console.log('  ' + String(buttons.__total).padStart(3) + '  (الإجمالي)')
  console.log('\n  أزرار الشريط الظاهرة = ' + toolbarVisible + '   (الهدف <= 12)')
  console.log('  window.open(/view/) = ' + viewOpenCalls + '   (الهدف 0)')
  console.log("  'screen:stop'       = " + screenStopSends)
}

if (CHECK) {
  let limits = null
  try { limits = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).limits } catch {}
  if (!limits) {
    console.error('\nFAIL لا يوجد خط أساس: ' + path.relative(ROOT, BASELINE))
    process.exit(1)
  }
  const problems = []
  if (toolbarVisible > (limits.toolbarVisible ?? 12)) problems.push('أزرار الشريط الظاهرة = ' + toolbarVisible + ' > ' + limits.toolbarVisible)
  if (viewOpenCalls > (limits.viewOpenCalls ?? 0)) problems.push('window.open(/view/) = ' + viewOpenCalls + ' > ' + limits.viewOpenCalls)
  if (screenStopSends > (limits.screenStopSends ?? 0)) problems.push("'screen:stop' = " + screenStopSends + ' > ' + limits.screenStopSends)
  for (const [f, n] of Object.entries(buttons)) {
    if (f === '__total') continue
    const max = (limits.buttons && limits.buttons[f]) ?? 0
    if (n > max) problems.push(f.replace('packages/dashboard/src/', '') + ': ' + n + ' > ' + max)
  }
  if (problems.length) {
    console.error('\nFAIL ' + problems.length + ' تجاوز:')
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }
  if (!JSON_ONLY) console.log('\nPASS ضمن الحدود المثبتة.')
}
