#!/usr/bin/env node
'use strict'
/**
 * mirror-sync.cjs — يبني مرآة قراءة-فقط لشفرة AiRemote داخل مجلد المشروع الافتراضي.
 *
 * لماذا: أدوات المساعدين (subagents) في هذا المضيف لا تملك تنفيذ أوامر، وأدوات ملفاتها
 * محصورة في مجلد المشروع؛ فهي لا تستطيع قراءة D:\. المرآة تنقل المصدر إلى داخل المجلد
 * الذي تقرأ منه، فيجري التحليل على كود حقيقي بأرقام أسطر صحيحة.
 *
 * مستقل عن الحساب: لا يفترض أي مسار حساب. الهدف الافتراضي = ./mirror/src من مجلد العمل.
 *
 * الاستخدام:
 *   cd "<مجلد المشروع الافتراضي>"      # المجلد الذي يقرأ/يكتب فيه المساعدون
 *   node "<repo>\tools\lab\a2a\mirror-sync.cjs"
 *
 * خيارات:
 *   --repo <path>   مسار مستودع AiRemote (افتراضي: AIREMOTE_REPO أو D:\autoclaw projects-new\AiRemote)
 *   --out  <dir>    مجلد الإخراج (افتراضي: <cwd>\mirror)
 *   --check         يتحقق من وجود المرآة ويطبع ملخصاً ثم يخرج (لا ينسخ)
 *
 * يخرج: <out>\src (الملفات) · <out>\INDEX.txt · <out>\META.json
 * لا ينسخ: node_modules · dist · releases · outputs · build · .gradle · .git · أي ملف سرّي
 */
const fs = require('fs')
const path = require('path')

// ── وسائط
const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const REPO = path.resolve(arg('--repo', process.env.AIREMOTE_REPO || 'D:/autoclaw projects-new/AiRemote'))
const OUT = path.resolve(arg('--out', path.join(process.cwd(), 'mirror')))
const SRC = path.join(OUT, 'src')
const CHECK = argv.includes('--check')

if (!fs.existsSync(path.join(REPO, 'package.json'))) {
  console.error('ABORT: ليس مستودع AiRemote: ' + REPO)
  process.exit(2)
}
if (OUT === REPO || OUT.startsWith(REPO + path.sep)) {
  console.error('ABORT: مجلد الإخراج داخل المستودع (' + OUT + ') — اختر مجلد المشروع الافتراضي.')
  process.exit(2)
}

function summary () {
  const meta = path.join(OUT, 'META.json')
  if (!fs.existsSync(meta)) { console.error('لا توجد مرآة في ' + OUT); process.exit(3) }
  const m = JSON.parse(fs.readFileSync(meta, 'utf8'))
  console.log('mirror: ' + m.files + ' files · ' + m.mb + ' MB · synced ' + m.syncedAt)
  console.log('src : ' + path.join(OUT, 'src'))
  console.log('repo: ' + m.repo)
  const must = [
    'packages/agent-desktop/main.js',
    'packages/agent-desktop/lib/coords.js',
    'packages/server-desktop/server.js',
    'packages/dashboard/src/components/ScreenViewer.tsx',
    'packages/android-agent/app/src/main/java/com/airemote/agent/AgentService.java',
  ]
  for (const f of must) {
    const ok = fs.existsSync(path.join(SRC, f))
    console.log((ok ? 'OK   ' : 'MISS ') + f)
  }
}
if (CHECK) { summary(); process.exit(0) }

// ── ما يُنسخ
const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'build', '.gradle', 'dist', 'releases', 'outputs', '__pycache__', '.idea', '.vscode'])
const TREES = [
  'packages/dashboard/src',
  'packages/server-desktop/src',
  'packages/android-agent/app/src',
  'packages/shared/src',
  'packages/agent/src',
  'packages/ai-engine/src',
  'packages/agent-desktop/lib',
  'packages/server-desktop/lib',
  'packages/agent/src',
  'scripts',
  'tools',
  'docs',
]
const FLAT_DIRS = ['packages/agent-desktop', 'packages/server-desktop']
const FLAT_EXT = new Set(['.js', '.cjs', '.html', '.json', '.gradle'])
const ROOT_EXT = new Set(['.md', '.json', '.gradle'])

let copied = 0
let bytes = 0
const skipped = []

function copyOne (src, rel) {
  const dst = path.join(SRC, rel)
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.copyFileSync(src, dst)
  copied++
  try { bytes += fs.statSync(src).size } catch {}
}
function walk (dir, relBase) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (EXCLUDE_DIRS.has(e.name)) { skipped.push(path.join(relBase, e.name)); continue }
    const s = path.join(dir, e.name)
    const rel = path.join(relBase, e.name)
    if (e.isDirectory()) walk(s, rel)
    else copyOne(s, rel)
  }
}

fs.rmSync(SRC, { recursive: true, force: true })
fs.mkdirSync(SRC, { recursive: true })

for (const t of TREES) {
  const abs = path.join(REPO, t)
  if (fs.existsSync(abs)) walk(abs, t)
}
for (const f of FLAT_DIRS) {
  const abs = path.join(REPO, f)
  if (!fs.existsSync(abs)) continue
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (!e.isFile() || !FLAT_EXT.has(path.extname(e.name))) continue
    copyOne(path.join(abs, e.name), path.join(f, e.name))
  }
}
for (const e of fs.readdirSync(REPO, { withFileTypes: true })) {
  if (!e.isFile() || !ROOT_EXT.has(path.extname(e.name))) continue
  copyOne(path.join(REPO, e.name), e.name)
}

// ── الفهرس والبيانات
const index = []
;(function list (dir, relBase) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(relBase, e.name)
    if (e.isDirectory()) list(path.join(dir, e.name), rel)
    else index.push(rel.replace(/\\/g, '/'))
  }
})(SRC, '')
fs.writeFileSync(path.join(OUT, 'INDEX.txt'), index.sort().join('\n'), 'utf8')
fs.writeFileSync(path.join(OUT, 'META.json'), JSON.stringify({
  syncedAt: new Date().toISOString(),
  repo: REPO,
  out: OUT,
  files: copied,
  mb: +(bytes / 1048576).toFixed(1),
  excludedDirs: [...EXCLUDE_DIRS],
}, null, 1), 'utf8')

console.log('mirror: ' + copied + ' files · ' + (bytes / 1048576).toFixed(1) + ' MB')
console.log('src : ' + SRC)
console.log('index/meta: ' + OUT)
