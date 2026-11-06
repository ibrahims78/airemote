#!/usr/bin/env node
'use strict'
/**
 * check-i18n-refs.cjs — every translation reference must resolve to a key that
 * exists in BOTH languages, on the dashboard and on the Windows agent.
 *
 * Catches the class of bug found on 2026-11-07: `data-i18n="ctrlHashNote"` in the
 * agent HTML with no such key in LANG, so the hint silently stayed Arabic.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const problems = []
let checked = 0

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8') }

// ── agent ──────────────────────────────────────────────────────────────────
;(function checkAgent() {
  const html = read('packages/agent-desktop/renderer/index.html')
  const js = read('packages/agent-desktop/renderer/app.js')
  const keys = [...html.matchAll(/data-i18n(?:-title|-ph)?="([A-Za-z0-9_]+)"/g)].map(m => m[1])
  const uniq = [...new Set(keys)]
  const arPart = js.split('en: {')[0]
  const enPart = js.split('en: {')[1].split('function applyLang')[0]
  for (const k of uniq) {
    checked++
    const re = new RegExp('\\b' + k + '\\s*:')
    if (!re.test(arPart)) problems.push(`agent: ${k} missing in ar`)
    if (!re.test(enPart)) problems.push(`agent: ${k} missing in en`)
  }
  for (const [name, part] of [['ar', arPart], ['en', enPart]]) {
    const all = [...part.matchAll(/^\s{4}([A-Za-z0-9_]+)\s*:/gm)].map(m => m[1])
    const dups = all.filter((k, i) => all.indexOf(k) !== i)
    for (const d of new Set(dups)) problems.push(`agent: duplicate key ${d} in ${name}`)
  }
  console.log(`  agent    ${uniq.length} keys referenced, ${problems.filter(p => p.startsWith('agent')).length} problems`)
})()

// ── dashboard ──────────────────────────────────────────────────────────────
;(function checkDashboard() {
  const src = path.join(ROOT, 'packages', 'dashboard', 'src')
  const i18n = read('packages/dashboard/src/lib/i18n.ts')
  const arPart = i18n.split('en: {')[0]
  const enPart = i18n.split('en: {')[1]
  const refs = new Set()

  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { walk(full); continue }
      if (!/\.(ts|tsx)$/.test(e.name) || e.name === 'i18n.ts') continue
      const text = fs.readFileSync(full, 'utf8')
      // only literal single keys: t('x') / tr('x') / T('x')
      for (const m of text.matchAll(/\b(?:t|tr|T)\('([a-z0-9_]+)'/g)) refs.add(m[1])
    }
  }
  walk(src)

  for (const k of refs) {
    checked++
    const re = new RegExp('\\b' + k + '\\s*:')
    if (!re.test(arPart)) problems.push(`dashboard: ${k} missing in ar`)
    if (!re.test(enPart)) problems.push(`dashboard: ${k} missing in en`)
  }
  console.log(`  dashboard ${refs.size} keys referenced, ${problems.filter(p => p.startsWith('dashboard')).length} problems`)
})()

const agentP = problems.filter(p => p.startsWith('agent')).length
const dashP = problems.filter(p => p.startsWith('dashboard')).length
console.log(`\nchecked ${checked} references — agent ${agentP}, dashboard ${dashP}`)
if (problems.length) {
  for (const p of problems.slice(0, 40)) console.log('  ✗ ' + p)
  console.log(`\nFAIL: ${problems.length} unresolved translation reference(s)`)
  process.exit(1)
}
console.log('ALL TRANSLATION REFERENCES RESOLVE')
