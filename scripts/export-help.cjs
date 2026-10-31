#!/usr/bin/env node
'use strict'
/**
 * export-help.cjs — R9.3
 *
 * The in-app help (packages/dashboard/src/pages/helpContent.ts) is the single
 * source of the user guide. This writes it out as Markdown so the shipped docs
 * and the app can never drift apart.
 *
 * Usage: node scripts/export-help.cjs [out.md]
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'packages', 'dashboard', 'src', 'pages', 'helpContent.ts')
const OUT = process.argv[2] || path.join(ROOT, 'docs', 'USER-GUIDE-AR.md')

const text = fs.readFileSync(SRC, 'utf8')
const start = text.indexOf('export const HELP_MARKDOWN')
if (start < 0) throw new Error('HELP_MARKDOWN not found')
const eq = text.indexOf('=', start)
const literalStart = text.slice(eq).search(/["']/)
const quote = text[eq + literalStart]
const bodyStart = eq + literalStart + 1
let i = bodyStart
let body = ''
while (i < text.length) {
  const ch = text[i]
  if (ch === '\\') { body += text[i] + text[i + 1]; i += 2; continue }
  if (ch === quote) break
  body += ch
  i++
}
if (i >= text.length) throw new Error('unterminated string literal')

// The literal is a plain JS string; evaluating it adds no side effects.
const markdown = new Function('return "' + body.replace(/"/g, '\\"') + '"')()

const header = [
  '<!-- مُولَّد آلياً من packages/dashboard/src/pages/helpContent.ts — لا تُحرّره يدوياً. -->',
  '<!-- Regenerate: node scripts/export-help.cjs -->',
  ''
].join('\n')

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, header + markdown.trimEnd() + '\n', 'utf8')

const lines = markdown.split('\n').length
const sections = markdown.split('\n').filter(l => /^## /.test(l)).length
console.log('wrote ' + path.relative(ROOT, OUT) + ' — ' + lines + ' lines, ' + sections + ' sections, ' + markdown.length + ' chars')
