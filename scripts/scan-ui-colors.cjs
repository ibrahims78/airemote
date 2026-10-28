#!/usr/bin/env node
'use strict'
/**
 * R6 — جرد امتثال الشاشات: عدد أصناف اللون الصريحة لكل ملف، وهل يستخدم مكتبة UI.
 *
 *   node scripts/scan-ui-colors.cjs
 *
 * الرقم الإجمالي هو مقياس بوابة «100% من الشاشات» في docs/PRODUCTION-PLAN-v2.0-AR.md (R6).
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', 'packages', 'dashboard', 'src')
const files = []
function walk (d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(tsx|ts)$/.test(e.name)) files.push(p)
  }
}
walk(ROOT)
// R6.1 — البوابة تشمل الاتجاهات (border-l/t/r/b/s/e) والظلال والصبغات،
// وإلا مرّت أصناف مثل border-l-yellow-400 بلا رصد (ثغرة قياس حقيقية).
const RX = /\b(?:text|bg|border|divide|from|to|via|ring|ring-offset|placeholder|fill|stroke|shadow|accent|outline|decoration|caret)(?:-[xytrblse])?-(?:slate|gray|zinc|neutral|stone|white|black|brand-blue|brand-teal|navy|teal|emerald|green|lime|red|rose|amber|yellow|purple|violet|fuchsia|pink|orange|cyan|sky|indigo)(?:-\d{2,3})?(?:\/\d{1,3})?\b/g
const rows = []
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8')
  const m = s.match(RX) || []
  const usesKit = /from '\.\.?\/components\/ui'|from '\.\/ui'/.test(s)
  if (m.length || usesKit) rows.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), explicit: m.length, kit: usesKit })
}
rows.sort((a, b) => b.explicit - a.explicit)
console.log('file'.padEnd(52) + 'explicit  kit')
for (const r of rows) console.log(r.file.padEnd(52) + String(r.explicit).padEnd(10) + (r.kit ? 'yes' : 'no'))
console.log('\nTOTAL explicit color utilities in src:', rows.reduce((a, r) => a + r.explicit, 0))
console.log('files using the kit:', rows.filter(r => r.kit).length)
