#!/usr/bin/env node
'use strict'
/**
 * check-dom-ids.cjs — the renderer never asks for an element that does not exist.
 *
 * A single missing id makes `$('x').addEventListener(...)` throw a TypeError at the
 * top level of app.js, which silently kills every statement after it: the status
 * card keeps its default label, the connection fields stay empty and the accordions
 * stop opening. Nothing else reports it, so this gate reads the ids the renderer
 * references and compares them with the ids that exist in the HTML (static markup
 * plus any markup the JS itself injects).
 *
 * Usage: node scripts/check-dom-ids.cjs [--json]
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const RENDERER = path.join(ROOT, 'packages', 'agent-desktop', 'renderer')

function read (f) {
  return fs.readFileSync(f, 'utf8')
}

const html = read(path.join(RENDERER, 'index.html'))
const jsFiles = ['app.js', 'ai.js', 'tabs.js'].map((f) => path.join(RENDERER, f)).filter(fs.existsSync)

// ids present in the static markup
const staticIds = new Set()
for (const m of html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) staticIds.add(m[1])

// ids that the JS injects itself (innerHTML templates, createElement assignments)
const injectedIds = new Set()
for (const f of jsFiles) {
  const src = read(f)
  for (const m of src.matchAll(/\bid\s*=\s*\\?["']([A-Za-z0-9_-]+)\\?["']/g)) injectedIds.add(m[1])
}

// ids the JS asks for
const refs = new Map() // id -> Set(file:line)
const patterns = [
  /(?<![.\w])\$\(\s*'([^']+)'\s*\)/g,               // $('id')
  /(?<![.\w])\$\(\s*"([^"]+)"\s*\)/g,
  /\$id\(\s*'([^']+)'\s*\)/g,                        // $id('id')
  /getElementById\(\s*'([^']+)'\s*\)/g,               // getElementById('id')
  /getElementById\(\s*"([^"]+)"\s*\)/g,
  /querySelector\(\s*'#([A-Za-z0-9_-]+)'/g
]
for (const f of jsFiles) {
  const lines = read(f).split(/\r?\n/)
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return
    for (const re of patterns) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(line)) !== null) {
        const id = m[1]
        if (!id || /[\s.#>]/.test(id)) continue
        if (!refs.has(id)) refs.set(id, new Set())
        refs.get(id).add(path.basename(f) + ':' + (i + 1))
      }
    }
  })
}

const missing = []
for (const [id, where] of [...refs.entries()].sort()) {
  if (!staticIds.has(id) && !injectedIds.has(id)) missing.push({ id, where: [...where] })
}

const result = {
  staticIds: staticIds.size,
  injectedIds: injectedIds.size,
  references: refs.size,
  missing: missing.length,
  missingList: missing
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log('--- check-dom-ids ---')
  console.log('ids in index.html   : ' + staticIds.size)
  console.log('ids injected by js  : ' + injectedIds.size)
  console.log('ids referenced      : ' + refs.size)
  console.log('missing ids         : ' + missing.length)
  for (const m of missing) console.log('  MISSING  #' + m.id + '   <- ' + m.where.slice(0, 4).join(', '))
  console.log(missing.length === 0 ? 'RESULT: ok' : 'RESULT: FAIL')
}

process.exit(missing.length === 0 ? 0 : 1)
