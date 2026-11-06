#!/usr/bin/env node
'use strict'
/**
 * check-bridge-shadow.cjs — a renderer script may not shadow a contextBridge global.
 *
 * 3.14.0 shipped a dead agent window because of exactly this:
 *   preload.js   -> contextBridge.exposeInMainWorld('airemote', ...)   // non-configurable property
 *   renderer/app.js -> const airemote = window.airemote || new Proxy(...)
 * A classic script cannot create a global lexical binding whose name is already a
 * non-configurable property of the global object, so the WHOLE file failed to parse:
 *   SyntaxError: Identifier 'airemote' has already been declared
 * Nothing re-throws it per statement: the status card stayed on its default "stopped"
 * label, the connection fields stayed empty and the accordions never bound.
 *
 * The file-mode preview could not catch it (no preload => no property => no clash),
 * so this gate compares the exposed names against top-level declarations instead.
 *
 * Usage: node scripts/check-bridge-shadow.cjs [rendererDir]
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const APP = path.join(ROOT, 'packages', 'agent-desktop')
const RENDERER = process.argv[2] ? path.resolve(process.argv[2]) : path.join(APP, 'renderer')
const PRELOAD = path.join(APP, 'preload.js')

const preload = fs.readFileSync(PRELOAD, 'utf8')
const exposed = new Set()
for (const m of preload.matchAll(/exposeInMainWorld\(\s*['"]([^'"]+)['"]/g)) exposed.add(m[1])

const DECL = /^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/
let files = 0
const clashes = []
for (const name of fs.readdirSync(RENDERER)) {
  if (!name.endsWith('.js')) continue
  files++
  const lines = fs.readFileSync(path.join(RENDERER, name), 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    const m = DECL.exec(line)               // top level only: the pattern is anchored and requires column 0
    if (m && exposed.has(m[1])) clashes.push({ file: name, line: i + 1, name: m[1] })
  })
}

console.log('--- check-bridge-shadow ---')
console.log('exposed by preload : ' + [...exposed].join(', '))
console.log('renderer scripts   : ' + files)
console.log('top-level clashes  : ' + clashes.length)
for (const c of clashes) console.log('  CLASH  ' + c.file + ':' + c.line + ' declares `' + c.name + '`, which preload exposes on window')
console.log(clashes.length === 0 ? 'RESULT: ok' : 'RESULT: FAIL')

process.exit(clashes.length === 0 ? 0 : 1)
