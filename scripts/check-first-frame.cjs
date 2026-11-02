#!/usr/bin/env node
'use strict'
/**
 * check-first-frame.cjs — بوابة أداء لأول إطار (3.11.5).
 *
 * لماذا: عيب 2084ms عاد مرتين في نفس الشريحة (تسخين لم يُنفَّذ · سبق screen_start).
 * القياس يجب أن يفشل آلياً بدل الاعتماد على مراجعة بشرية.
 *
 * الاستخدام:
 *   node scripts/check-first-frame.cjs [measure.json]
 * الميزانية: FIRST_FRAME_BUDGET_MS (افتراضي 1800 — أسوأ حالة عند اتصال العارض فور القبول).
 */
const fs = require('fs')
const path = require('path')

const budget = Number(process.env.FIRST_FRAME_BUDGET_MS || 1800)

function latestMeasure () {
  if (process.argv[2]) return process.argv[2]
  const root = path.join(process.cwd(), 'outputs')
  if (!fs.existsSync(root)) return null
  const hits = []
  for (const d of fs.readdirSync(root)) {
    if (!/^verify-/.test(d)) continue
    const p = path.join(root, d, 'warm-capture', 'measure.json')
    if (fs.existsSync(p)) hits.push({ p, t: fs.statSync(p).mtimeMs })
  }
  hits.sort((a, b) => b.t - a.t)
  return hits.length ? hits[0].p : null
}

const file = latestMeasure()
if (!file || !fs.existsSync(file)) {
  console.log(JSON.stringify({ gate: 'first-frame', result: 'SKIP', reason: 'no measure.json (run tools/lab/a2a/measure-stream.cjs first)' }))
  process.exit(0)
}
let data
try { data = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) {
  console.log(JSON.stringify({ gate: 'first-frame', result: 'FAIL', reason: 'unreadable: ' + e.message, file }))
  process.exit(1)
}
const list = Array.isArray(data.measurements) ? data.measurements : []
const last = list.length ? list[list.length - 1] : data
const ms = Number(last && last.firstFrameMs)
if (!Number.isFinite(ms) || ms <= 0) {
  console.log(JSON.stringify({ gate: 'first-frame', result: 'FAIL', reason: 'firstFrameMs missing', file }))
  process.exit(1)
}
const pass = ms <= budget
console.log(JSON.stringify({
  gate: 'first-frame', result: pass ? 'PASS' : 'FAIL',
  firstFrameMs: ms, budgetMs: budget, file: path.relative(process.cwd(), file),
  build: last.build || null,
}, null, 1))
process.exit(pass ? 0 : 1)