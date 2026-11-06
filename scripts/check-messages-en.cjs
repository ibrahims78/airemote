#!/usr/bin/env node
'use strict'
/**
 * check-messages-en.cjs — every Arabic `error:` the desktop server returns must
 * have an English entry in lib/messages-en.js, otherwise `message_en` is missing
 * from that response and the English UI falls back to Arabic.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const server = fs.readFileSync(path.join(ROOT, 'packages/server-desktop/server.js'), 'utf8')
const { MESSAGES_EN } = require(path.join(ROOT, 'packages/server-desktop/lib/messages-en.js'))

const found = new Set()
for (const m of server.matchAll(/error:\s*'([^']*[\u0600-\u06FF][^']*)'/g)) found.add(m[1])

const missing = [...found].filter(k => !(k in MESSAGES_EN))
const extra = Object.keys(MESSAGES_EN).filter(k => !found.has(k))

console.log(`server arabic errors: ${found.size}`)
console.log(`english entries:      ${Object.keys(MESSAGES_EN).length}`)
console.log(`missing:              ${missing.length}`)
console.log(`unused entries:       ${extra.length}`)

for (const m of missing.slice(0, 20)) console.log('  ✗ ' + m)
for (const e of extra.slice(0, 10)) console.log('  · unused: ' + e)

if (missing.length) {
  console.log('\nFAIL: messages without an English twin')
  process.exit(1)
}
console.log('\nALL SERVER MESSAGES HAVE AN ENGLISH TWIN')
