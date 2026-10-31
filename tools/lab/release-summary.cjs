const fs = require('fs')
const path = require('path')
const ROOT = 'D:\\autoclaw projects-new\\AiRemote'
const OUT = path.join(ROOT, 'outputs', 'verify-2026-10-31', 'r9-release')
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'releases', 'manifest.json'), 'utf8'))
const summary = {
  at: new Date().toISOString(),
  product: manifest.product,
  version: manifest.version,
  generatedAt: manifest.generatedAt,
  artifacts: manifest.artifacts.map(a => ({
    name: a.name,
    sizeMb: Math.round(a.size / 1048576 * 10) / 10,
    sha256: a.sha256.slice(0, 16) + '…',
    exists: fs.existsSync(path.join(ROOT, 'releases', a.name))
  })),
  docs: ['docs/ADMIN-GUIDE-AR.md', 'docs/USER-GUIDE-AR.md', 'docs/RELEASE-NOTES-3.8.41-AR.md', 'docs/SHORTCUTS-AR.md', 'docs/ANDROID-LIMITATIONS.md', 'docs/SECURITY-REVIEW-AR.md', 'docs/LOAD-TEST-AR.md']
    .map(p => ({ p, bytes: fs.existsSync(path.join(ROOT, p)) ? fs.statSync(path.join(ROOT, p)).size : null }))
}
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'release-summary.json'), JSON.stringify(summary, null, 2), 'utf8')
console.log(JSON.stringify(summary, null, 2))
