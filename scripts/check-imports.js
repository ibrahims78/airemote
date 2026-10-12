#!/usr/bin/env node
'use strict'
/**
 * Static import-consistency check: every relative import in the checked
 * packages must resolve to an existing file that actually exports the
 * imported names. Catches the class of breakage that previously took the
 * server package down at HEAD (imports of non-exported members).
 *
 * Usage: node scripts/check-imports.js [root ...]
 */
const fs = require('fs')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const roots = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'packages/server/src',
      'packages/agent/src',
      'packages/ai-engine/src',
      'packages/shared/src',
    ].map((r) => path.join(REPO, r))

function walk(d, out) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) out.push(p)
  }
  return out
}

const exportsCache = {}
function getExports(file) {
  if (exportsCache[file]) return exportsCache[file]
  const src = fs.readFileSync(file, 'utf8')
  const set = new Set()
  let m
  const re1 = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g
  while ((m = re1.exec(src))) set.add(m[1])
  const re2 = /export\s*\{([^}]+)\}/g
  while ((m = re2.exec(src))) {
    m[1].split(',').forEach((s) => {
      s = s.trim()
      if (!s) return
      const parts = s.split(/\s+as\s+/)
      set.add((parts[1] || parts[0]).trim())
    })
  }
  const re3 = /export\s+(?:type|interface|enum)\s+([A-Za-z_$][\w$]*)/g
  while ((m = re3.exec(src))) set.add(m[1])
  exportsCache[file] = set
  return set
}

function resolve(spec, fromFile) {
  const base = path.resolve(path.dirname(fromFile), spec)
  const cands = [base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx'), base]
  for (const c of cands) {
    try { if (fs.statSync(c).isFile()) return c } catch {}
  }
  return null
}

let problems = 0
let filesCount = 0
let importsCount = 0
for (const root of roots) {
  if (!fs.existsSync(root)) { console.log('skip (missing): ' + root); continue }
  for (const f of walk(root, [])) {
    filesCount++
    const src = fs.readFileSync(f, 'utf8')
    const re = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g
    let m
    while ((m = re.exec(src))) {
      importsCount++
      const names = m[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
        s = s.replace(/^type\s+/, '')
        return s.split(/\s+as\s+/)[0].trim()
      })
      const target = resolve(m[2], f)
      if (!target) { console.log(path.relative(REPO, f) + ': cannot resolve ' + m[2]); problems++; continue }
      if (!target.endsWith('.ts') && !target.endsWith('.tsx')) continue
      const exps = getExports(target)
      for (const n of names) {
        if (!exps.has(n)) {
          console.log(path.relative(REPO, f) + ": imports '" + n + "' from '" + m[2] + "' -> NOT EXPORTED by " + path.relative(REPO, target))
          problems++
        }
      }
    }
  }
}

console.log('files scanned: ' + filesCount + ' | relative imports checked: ' + importsCount)
console.log(problems ? 'PROBLEMS: ' + problems : 'PROBLEMS: NONE')
process.exit(problems ? 1 : 0)
