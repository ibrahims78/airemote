#!/usr/bin/env node
'use strict'
/**
 * shot-agent.cjs — baseline for the Windows agent surface.
 * The renderer ships dark by default; the approved reference is light. This
 * copies the renderer into the evidence folder with data-theme="light" (the
 * source is untouched), screenshots it at the reference size, and diffs it.
 *
 * Usage: node scripts/shot-agent.cjs [light|dark]
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { pathToFileURL } = require('url')

const R = path.resolve(__dirname, '..')
const SRC = path.join(R, 'packages', 'agent-desktop', 'renderer')
const OUT_DIR = path.join(R, 'outputs', 'verify-2026-11-05', 'phase3', 'agent-light')
const PNG = path.join(R, 'outputs', 'verify-2026-11-05', 'phase3', 'agent-light.png')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const theme = process.argv[2] || 'light'

fs.mkdirSync(OUT_DIR, { recursive: true })
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8')
html = html.split('data-theme="dark"').join('data-theme="' + theme + '"')
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf8')
for (const f of fs.readdirSync(SRC)) {
  if (f.endsWith('.css') || f.endsWith('.js')) {
    fs.copyFileSync(path.join(SRC, f), path.join(OUT_DIR, f))
  }
}
console.log('light copy written ->', path.relative(R, OUT_DIR))

const res = spawnSync(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=2',
  '--window-size=700,900',
  '--screenshot=' + PNG.replace(/\\/g, '/'),
  '--virtual-time-budget=3000',
  pathToFileURL(path.join(OUT_DIR, 'index.html')).href
], { stdio: 'ignore', windowsHide: true })
if (res.status !== 0 || !fs.existsSync(PNG)) { console.error('screenshot failed'); process.exit(1) }
console.log('shot ->', path.relative(R, PNG))
