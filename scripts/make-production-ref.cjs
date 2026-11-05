#!/usr/bin/env node
'use strict'
/**
 * make-production-ref.cjs — renders a production variant of the approved server
 * reference: identical markup and CSS, with the states legend row hidden (it is
 * a spec sheet, not app UI). The approved files in design/ are never modified;
 * the variant is written next to the evidence.
 */
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { spawnSync } = require('child_process')

const R = 'D:/autoclaw projects-new/AiRemote'
const SRC = R + '/design/server.html'
const OUT_DIR = R + '/outputs/verify-2026-11-05/phase3'
const HTML = OUT_DIR + '/server-production.html'
const PNG = OUT_DIR + '/server-production-light.png'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

let html = fs.readFileSync(SRC, 'utf8')
if (!html.includes('.state-strip{display:none')) {
  html = html.replace('</head>', () => '<style>.state-strip{display:none!important}</style>\n</head>')
}
fs.writeFileSync(HTML, html, 'utf8')
console.log('wrote', path.basename(HTML))

const res = spawnSync(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=2',
  '--window-size=1700,980',
  '--screenshot=' + PNG.replace(/\\/g, '/'),
  '--virtual-time-budget=2500',
  pathToFileURL(HTML).href
], { stdio: 'inherit', windowsHide: true })

console.log('chrome exit', res.status)
if (!fs.existsSync(PNG)) { console.error('no png'); process.exit(1) }
const size = fs.statSync(PNG).size
console.log('png bytes', size)
