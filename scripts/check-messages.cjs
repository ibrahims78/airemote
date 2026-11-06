#!/usr/bin/env node
'use strict'
/**
 * check-messages.cjs — the 3.14.0 message catalog audit.
 *
 * Every one of the eleven session states must have a text in Arabic and in
 * English on each surface that renders it: the dashboard (i18n.ts), the
 * Windows agent (LANG in app.js) and the Android agent (strings.xml).
 *
 * Usage: node scripts/check-messages.cjs [--json]
 */
const fs = require('fs')
const path = require('path')

const R = path.resolve(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(R, p), 'utf8')

// ── dashboard ──────────────────────────────────────────────────────────────
const i18n = read('packages/dashboard/src/lib/i18n.ts')
const arStart = i18n.indexOf('  ar: {')
const enStart = i18n.indexOf('  en: {')
if (arStart < 0 || enStart < 0) { console.error('FAIL cannot locate i18n blocks'); process.exit(1) }
const dAr = new Set(); const dEn = new Set()
for (const m of i18n.slice(arStart, enStart).matchAll(/^\s{4}([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)) dAr.add(m[1])
for (const m of i18n.slice(enStart).matchAll(/^\s{4}([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)) dEn.add(m[1])

// ── windows agent ──────────────────────────────────────────────────────────
const app = read('packages/agent-desktop/renderer/app.js')
const aAr = app.indexOf('const LANG = {')
const aEn = app.indexOf('\n  en: {', aAr)
const aEnd = app.indexOf('\n}\n', aEn)
if (aAr < 0 || aEn < 0) { console.error('FAIL cannot locate agent LANG'); process.exit(1) }
const gAr = new Set(); const gEn = new Set()
for (const m of app.slice(aAr, aEn).matchAll(/^\s{4}([A-Za-z_][A-Za-z0-9_]*)\s*:\s*['"]/gm)) gAr.add(m[1])
for (const m of app.slice(aEn, aEnd).matchAll(/^\s{4}([A-Za-z_][A-Za-z0-9_]*)\s*:\s*['"]/gm)) gEn.add(m[1])

// ── android ────────────────────────────────────────────────────────────────
const xmlKeys = (p) => {
  const out = new Set()
  for (const m of read(p).matchAll(/<string name="([^"]+)"/g)) out.add(m[1])
  return out
}
const sAr = xmlKeys('packages/android-agent/app/src/main/res/values/strings.xml')
const sEn = xmlKeys('packages/android-agent/app/src/main/res/values-en/strings.xml')

const STATES = ['requested', 'accepted', 'active', 'denied', 'expired', 'closed', 'suspended',
  'password_required', 'bad_password', 'password_locked', 'target_offline']

const AGENT_KEY = {
  requested: 'sessPending', accepted: 'sessAccepted', active: 'sessAllowed', denied: 'sessDenied',
  expired: 'sessTimeout', closed: 'sessClosed', suspended: 'sessNoSessions',
  password_required: 'sessPwRequired', bad_password: 'sessPwWrong', password_locked: 'sessPwLocked',
  target_offline: 'sessNetwork'
}

const verdict = (hasAr, hasEn) => hasAr && hasEn ? 'AR+EN' : hasAr ? 'AR only' : hasEn ? 'EN only' : 'missing'

const rows = STATES.map(s => ({
  state: s,
  dashboard: verdict(dAr.has('relay_' + s), dEn.has('relay_' + s)),
  agent: verdict(gAr.has(AGENT_KEY[s]), gEn.has(AGENT_KEY[s])),
  android: verdict(sAr.has('sess_state_' + s), sEn.has('sess_state_' + s))
}))

const bad = rows.filter(r => r.dashboard !== 'AR+EN' || r.agent !== 'AR+EN' || r.android !== 'AR+EN')
const diff = (a, b) => [...a].filter(k => !b.has(k))

const out = {
  rows,
  complete: rows.length - bad.length,
  total: rows.length,
  dashboard: { ar: dAr.size, en: dEn.size, arOnly: diff(dAr, dEn), enOnly: diff(dEn, dAr) },
  agent: { ar: gAr.size, en: gEn.size, arOnly: diff(gAr, gEn), enOnly: diff(gEn, gAr) },
  android: { ar: sAr.size, en: sEn.size, arOnly: diff(sAr, sEn), enOnly: diff(sEn, sAr) }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 1))
} else {
  console.log('state                 dashboard  agent      android')
  console.log('-'.repeat(54))
  for (const r of rows) console.log(`${r.state.padEnd(21)} ${r.dashboard.padEnd(10)} ${r.agent.padEnd(10)} ${r.android}`)
  console.log('')
  console.log(`states complete : ${out.complete}/${out.total}`)
  console.log(`dashboard keys  : ar=${out.dashboard.ar} en=${out.dashboard.en} | ar-only=${out.dashboard.arOnly.length} en-only=${out.dashboard.enOnly.length}`)
  console.log(`agent keys      : ar=${out.agent.ar} en=${out.agent.en} | ar-only=${out.agent.arOnly.length} en-only=${out.agent.enOnly.length}`)
  console.log(`android keys    : ar=${out.android.ar} en=${out.android.en} | ar-only=${out.android.arOnly.length} en-only=${out.android.enOnly.length}`)
  if (out.agent.arOnly.length) console.log('  agent ar-only: ' + out.agent.arOnly.slice(0, 10).join(', '))
  if (out.agent.enOnly.length) console.log('  agent en-only: ' + out.agent.enOnly.slice(0, 10).join(', '))
  if (out.android.arOnly.length) console.log('  android ar-only: ' + out.android.arOnly.slice(0, 10).join(', '))
  if (out.android.enOnly.length) console.log('  android en-only: ' + out.android.enOnly.slice(0, 10).join(', '))
}
process.exit(bad.length === 0 ? 0 : 1)
