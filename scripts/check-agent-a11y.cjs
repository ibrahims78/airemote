#!/usr/bin/env node
'use strict'
/**
 * check-agent-a11y.cjs — every icon-only button in the Windows agent carries a name.
 *
 * The renderer builds some buttons from markup and some from template strings. A button
 * whose only child is an <svg> is invisible to a screen reader unless it has an
 * aria-label (preferred) or a title. The status tab was measured at 0 unnamed in 3.14.1,
 * but the AI and viewer tabs still had two bare send buttons; this gate keeps the whole
 * window honest, not one tab.
 *
 * Usage: node scripts/check-agent-a11y.cjs [--json]
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const RENDERER = path.join(ROOT, 'packages', 'agent-desktop', 'renderer')
const JSON_OUT = process.argv.includes('--json')

const LABELLED = /(aria-label|data-i18n-aria|title=|data-i18n-title)/

function tags (html, name) {
  const out = []
  const re = new RegExp('<' + name + '\\b([^>]*)>([\\s\\S]*?)<\\/' + name + '>', 'gi')
  let m
  while ((m = re.exec(html))) out.push({ attrs: m[1], inner: m[2], at: m.index })
  return out
}

const findings = []
let buttons = 0
let iconOnly = 0

const html = fs.readFileSync(path.join(RENDERER, 'index.html'), 'utf8')
for (const b of tags(html, 'button')) {
  buttons++
  const text = b.inner.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').trim()
  const hasIcon = /<svg|<img/i.test(b.inner)
  if (text) continue
  if (hasIcon) iconOnly++
  if (LABELLED.test(b.attrs)) continue
  const line = html.slice(0, b.at).split('\n').length
  const id = (/id="([^"]+)"/.exec(b.attrs) || [])[1] || (/class="([^"]+)"/.exec(b.attrs) || [])[1] || '(no id)'
  findings.push({ file: 'index.html', line, id, snippet: ('<button' + b.attrs + '>').replace(/\s+/g, ' ').slice(0, 100) })
}

// dynamically built markup: a template that opens a button and never names it
for (const file of ['app.js', 'ai.js', 'tabs.js']) {
  const full = path.join(RENDERER, file)
  if (!fs.existsSync(full)) continue
  const src = fs.readFileSync(full, 'utf8')
  for (const b of tags(src, 'button')) {
    if (!/class=/.test(b.attrs)) continue
    const text = b.inner.replace(/\$\{[^}]*\}/g, 'x').replace(/<[^>]*>/g, ' ').trim()
    if (text) continue
    if (LABELLED.test(b.attrs)) continue
    const line = src.slice(0, b.at).split('\n').length
    findings.push({ file, line, id: 'template', snippet: ('<button' + b.attrs + '>').replace(/\s+/g, ' ').slice(0, 100) })
  }
}

if (JSON_OUT) console.log(JSON.stringify({ buttons, iconOnly, unnamed: findings.length, findings }, null, 2))
else {
  console.log(`agent buttons: ${buttons} · icon-only ${iconOnly} · unnamed ${findings.length}`)
  for (const f of findings) console.log(`  UNNAMED ${f.file}:${f.line} ${f.id}  ${f.snippet}`)
  console.log(findings.length === 0 ? 'OK — every button has text or a name' : 'FAIL — add aria-label (and title) to the unnamed buttons')
}
process.exit(findings.length === 0 ? 0 : 1)
