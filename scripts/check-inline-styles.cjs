#!/usr/bin/env node
'use strict'
/**
 * check-inline-styles.cjs — no fixed style object survives in the dashboard.
 *
 * A `style={{ ... }}` object that carries only literals freezes a decision that
 * belongs in a class: it cannot be themed, it cannot be overridden by the light
 * palette, and it drifts the moment the design changes. What legitimately stays
 * inline is operational — a value computed per render (zoom, pan, progress,
 * popup anchor, series colour, stagger delay).
 *
 * This gate reads every style object in packages/dashboard/src, strips the
 * literals and the property names, and fails if nothing dynamic is left.
 *
 * Usage: node scripts/check-inline-styles.cjs [--json]
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'packages', 'dashboard', 'src')
const JSON_OUT = process.argv.includes('--json')

function walk (dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full)
  }
  return out
}

/** The object literal of a style prop, with nested braces balanced. */
function styleBlocks (text) {
  const blocks = []
  const marker = 'style={{'
  let at = text.indexOf(marker)
  while (at !== -1) {
    let depth = 0
    let i = at + marker.length - 2 // at the first '{'
    for (; i < text.length; i++) {
      const ch = text[i]
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) break }
    }
    blocks.push({ start: at, end: i + 1, body: text.slice(at, i + 1) })
    at = text.indexOf(marker, i + 1)
  }
  return blocks
}

/** true when the object carries a value that is not a literal. */
function isDynamic (block) {
  let body = block.slice(block.indexOf('{{') + 2, -2) // keep only the object literal
  body = body.replace(/`\$\{([^}]*)\}[^`]*`/g, ' $1 ') // template: keep the expression
  body = body.replace(/`[^`]*`/g, ' ')                    // template without expression
  body = body.replace(/'[^']*'|"[^"]*"/g, ' ')            // string literals
  body = body.replace(/[A-Za-z_$][\w$]*\s*:/g, ':')       // property names
  return /[A-Za-z_$]/.test(body)
}

const findings = []
let total = 0
let dynamic = 0
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, 'utf8')
  for (const block of styleBlocks(text)) {
    total++
    if (isDynamic(block.body)) { dynamic++; continue }
    const line = text.slice(0, block.start).split('\n').length
    const where = path.relative(ROOT, file).replace(/\\/g, '/')
    const snippet = block.body.replace(/\s+/g, ' ').slice(0, 90)
    findings.push({ file: where, line, snippet })
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ total, dynamic, static: findings.length, findings }, null, 2))
} else {
  console.log(`inline styles: ${total} · operational ${dynamic} · static ${findings.length}`)
  for (const f of findings) console.log(`  STATIC ${f.file}:${f.line}  ${f.snippet}`)
  console.log(findings.length === 0 ? 'OK — every inline style is computed per render' : 'FAIL — move the static ones into a class')
}
process.exit(findings.length === 0 ? 0 : 1)
