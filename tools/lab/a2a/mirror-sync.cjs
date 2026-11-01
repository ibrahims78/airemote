'use strict'
/**
 * يبني مرآة قراءة-فقط لمصدر AiRemote داخل مجلد المشروع الافتراضي،
 * لأن أدوات المساعدين لا تصل إلى D:\ لكنها تقرأ داخل مجلد المشروع.
 *
 * التشغيل: node mirror/sync.cjs   (يستبدل مجلد mirror/src في كل مرة)
 */
const fs = require('fs')
const path = require('path')

const REPO = 'D:/autoclaw projects-new/AiRemote'
const ROOT = path.resolve(__dirname, 'src')

const TREES = [
  'packages/dashboard/src',
  'packages/server-desktop/src',
  'packages/android-agent/app/src',
  'packages/shared/src',
  'packages/agent/src',
  'packages/ai-engine/src',
  'packages/agent-desktop/lib',
  'packages/server-desktop/lib',
  'packages/android-agent/app/build.gradle',
  'scripts',
  'tools',
  'docs',
]
const FLAT = [
  'packages/agent-desktop',
  'packages/server-desktop',
]
const FLAT_EXT = new Set(['.js', '.cjs', '.html', '.json'])
const ROOT_EXT = new Set(['.md', '.json'])

let copied = 0
let bytes = 0

function copyOne (src, rel) {
  const dst = path.join(ROOT, rel)
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.copyFileSync(src, dst)
  copied++
  try { bytes += fs.statSync(src).size } catch {}
}

function walk (dir, relBase) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'build' || e.name === '.gradle') continue
    const s = path.join(dir, e.name)
    const rel = path.join(relBase, e.name)
    if (e.isDirectory()) walk(s, rel)
    else copyOne(s, rel)
  }
}

fs.rmSync(ROOT, { recursive: true, force: true })
fs.mkdirSync(ROOT, { recursive: true })

for (const t of TREES) {
  const abs = path.join(REPO, t)
  if (fs.existsSync(abs)) walk(abs, t)
}
for (const f of FLAT) {
  const abs = path.join(REPO, f)
  if (!fs.existsSync(abs)) continue
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (!e.isFile()) continue
    if (!FLAT_EXT.has(path.extname(e.name))) continue
    copyOne(path.join(abs, e.name), path.join(f, e.name))
  }
}
for (const e of fs.readdirSync(REPO, { withFileTypes: true })) {
  if (!e.isFile()) continue
  if (!ROOT_EXT.has(path.extname(e.name))) continue
  copyOne(path.join(REPO, e.name), e.name)
}

// فهرس للمساعدة
const index = []
function list (dir, relBase) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(relBase, e.name)
    if (e.isDirectory()) list(path.join(dir, e.name), rel)
    else index.push(rel.replace(/\\/g, '/'))
  }
}
list(ROOT, '')
fs.writeFileSync(path.join(__dirname, 'INDEX.txt'), index.sort().join('\n'), 'utf8')
fs.writeFileSync(path.join(__dirname, 'META.json'), JSON.stringify({
  syncedAt: new Date().toISOString(), repo: REPO, files: copied, mb: +(bytes / 1048576).toFixed(1),
}, null, 1), 'utf8')

console.log('mirror: ' + copied + ' files · ' + (bytes / 1048576).toFixed(1) + ' MB → ' + ROOT)
