#!/usr/bin/env node
'use strict'
/**
 * deploy-agent-ui.cjs — push the fixed app.asar into the lab guests (WIN10 / WIN11).
 *
 * The agent UI is dead in 3.14.0 only when the preload bridge exists; a file-mode
 * screenshot cannot see that, so the guests are the real acceptance surface. This
 * copies the packaged asar in, runs the swap script inside the guest (backup, swap,
 * restart) and prints the guest report.
 *
 * Usage: node tools/lab/session/deploy-agent-ui.cjs [win10|win11|both]
 */
const path = require('path')
const g = require('../a2a/vmguest.cjs')

const ROOT = path.resolve(__dirname, '..', '..')
const ASAR = path.join(ROOT, 'releases', 'agent-windows', 'win-unpacked', 'resources', 'app.asar')
const SCRIPT = path.join(__dirname, 'swap-3140-ui.ps1')

const which = (process.argv[2] || 'both').toLowerCase()
const targets = which === 'both' ? ['win10', 'win11'] : [which]

for (const vm of targets) {
  console.log('=== ' + vm + ' ===')
  try {
    g.copyIn(vm, ASAR, 'C:\\Users\\admin\\new-app.asar')
    console.log('asar copied (' + Math.round(require('fs').statSync(ASAR).size / 1024) + ' KB)')
    const out = g.ps(vm, SCRIPT)
    console.log(String(out).replace(/^\uFEFF/, '').trim())
  } catch (e) {
    console.log('FAILED: ' + e.message)
  }
}
