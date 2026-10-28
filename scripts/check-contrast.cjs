#!/usr/bin/env node
'use strict'
/**
 * R6 — بوابة تباين WCAG AA للرموز الدلالية.
 *
 * تقرأ متغيّرات `:root` (السمة الداكنة) و`html.light` من `index.css`، وتحسب
 * نسبة التباين لكل زوج مستخدم فعلياً في المكتبة، وتفشل إن نزل أي نص عن 4.5:1
 * أو أي عنصر غير نصي عن 3:1.
 *
 * Usage: node scripts/check-contrast.cjs
 */
const fs = require('fs')
const path = require('path')

const CSS = path.resolve(__dirname, '..', 'packages', 'dashboard', 'src', 'index.css')
const src = fs.readFileSync(CSS, 'utf8')

function block (selector) {
  const i = src.indexOf(selector)
  if (i < 0) throw new Error('block not found: ' + selector)
  const open = src.indexOf('{', i)
  const close = src.indexOf('}', open)
  const body = src.slice(open + 1, close)
  const out = {}
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*;/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  }
  return out
}

const ALIAS = { canvas: 'bg', surface2: 'surface-2' }
const themes = { dark: block(':root {'), light: block('html.light {') }
for (const t of Object.values(themes)) { for (const [alias, real] of Object.entries(ALIAS)) { if (!t[alias] && t[real]) t[alias] = t[real] } }

function lum (rgb) {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function ratio (a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
/** 10% tint of `tone` over `base` — how Alert/Badge backgrounds actually render. */
function tint (tone, base, alpha = 0.1) {
  return tone.map((v, i) => Math.round(v * alpha + base[i] * (1 - alpha)))
}

const CHECKS = [
  { id: 'ink/canvas', fg: 'ink', bg: 'canvas', min: 4.5, text: true },
  { id: 'ink/surface', fg: 'ink', bg: 'surface', min: 4.5, text: true },
  { id: 'muted/surface', fg: 'muted', bg: 'surface', min: 4.5, text: true },
  { id: 'muted/canvas', fg: 'muted', bg: 'canvas', min: 4.5, text: true },
  { id: 'muted/surface2', fg: 'muted', bg: 'surface2', min: 4.5, text: true },
  { id: 'primary-fg/primary', fg: 'primary-fg', bg: 'primary', min: 4.5, text: true },
  { id: 'success/alert', fg: 'success', bg: 'success', tinted: 'surface', min: 4.5, text: true },
  { id: 'warning/alert', fg: 'warning', bg: 'warning', tinted: 'surface', min: 4.5, text: true },
  { id: 'danger/alert', fg: 'danger', bg: 'danger', tinted: 'surface', min: 4.5, text: true },
  { id: 'info/alert', fg: 'info', bg: 'info', tinted: 'surface', min: 4.5, text: true },
  { id: 'primary/progress', fg: 'primary', bg: 'surface', min: 3, text: false }
]

let failed = 0
const rows = []
for (const [theme, t] of Object.entries(themes)) {
  for (const c of CHECKS) {
    const fg = t[c.fg]
    const bg = c.tinted ? tint(t[c.bg], t[c.tinted]) : t[c.bg]
    if (!fg || !bg) { rows.push({ theme, id: c.id, ratio: NaN, min: c.min, ok: false }); failed++; continue }
    const r = ratio(fg, bg)
    const ok = r >= c.min
    if (!ok) failed++
    rows.push({ theme, id: c.id, ratio: Math.round(r * 100) / 100, min: c.min, ok })
  }
}

const pad = (s, n) => String(s).padEnd(n)
console.log('WCAG contrast — semantic tokens\n')
console.log(pad('theme', 7) + pad('pair', 22) + pad('ratio', 8) + pad('min', 6) + 'result')
for (const r of rows) {
  console.log(pad(r.theme, 7) + pad(r.id, 22) + pad(Number.isFinite(r.ratio) ? r.ratio.toFixed(2) : '—', 8) + pad(r.min, 6) + (r.ok ? 'PASS' : 'FAIL'))
}
console.log('')
if (failed) {
  console.log(`${failed} contrast check(s) FAILED`)
  process.exit(1)
}
console.log(`ALL CONTRAST CHECKS PASSED (${rows.length}/${rows.length})`)
