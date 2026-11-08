#!/usr/bin/env node
'use strict'
/** check-artifacts.cjs — read the version (and a marker string) out of a built app.asar, and grep the shipped static. */
const fs = require('fs')
const path = require('path')

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()

function asarFiles (asar) {
  const fd = fs.openSync(asar, 'r')
  const head = Buffer.alloc(16)
  fs.readSync(fd, head, 0, 16, 0)
  const headerSize = head.readUInt32LE(4)
  const strLen = head.readUInt32LE(8)
  const raw = Buffer.alloc(strLen)
  fs.readSync(fd, raw, 0, strLen, 12)
  const text = raw.toString('utf8')
  const i0 = text.indexOf('{'); const i1 = text.lastIndexOf('}')
  const header = JSON.parse(text.slice(i0, i1 + 1))
  const dataStart = 8 + headerSize
  const readEntry = (node) => {
    const buf = Buffer.alloc(node.size)
    fs.readSync(fd, buf, 0, node.size, dataStart + Number(node.offset))
    return buf
  }
  return { header, readEntry, close: () => fs.closeSync(fd) }
}

function report (label, asar, markerRelPath, marker) {
  // 2026-11-08 — win-unpacked صار يُؤرشف بعد كل بناء (791MB وسيطة يعيدها electron-builder).
  // الغياب ليس فشلًا: الإثبات الأقوى موجود في check-shipped-bytes الذي يفحص الـasar المثبَّت.
  if (!fs.existsSync(asar)) {
    console.log(`${label}: SKIP (not built here — win-unpacked is archived; use scripts/check-shipped-bytes.cjs for the installed bytes)`)
    return null
  }
  const a = asarFiles(asar)
  try {
    const { header, readEntry } = a
    const pkg = JSON.parse(readEntry(header.files['package.json']).toString('utf8'))
    let found = 'n/a'
    if (markerRelPath) {
      const parts = markerRelPath.split('/')
      let node = header.files
      for (const p of parts) {
        if (!node) break
        node = node[p] || (node.files ? node.files[p] : null)
      }
      if (node) found = readEntry(node).toString('utf8').includes(marker)
    }
    console.log(`${label}: version=${pkg.version}  ${markerRelPath || ''} contains "${marker || ''}" = ${found}`)
    return pkg.version
  } finally { a.close() }
}

const vAgent = report('agent  app.asar', path.join(ROOT, 'releases/agent-windows/win-unpacked/resources/app.asar'),
  'renderer/app.js', 'chk-runstartup')
const vServer = report('server app.asar', path.join(ROOT, 'releases/server-windows/win-unpacked/resources/app.asar'),
  null, null)

// the shipped dashboard bundle must carry the new control
function grepTree (dir, needle) {
  let hits = 0
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.(js|css|html)$/i.test(e.name)) {
        if (fs.readFileSync(full, 'utf8').includes(needle)) hits++
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return hits
}
const distHits = grepTree(path.join(ROOT, 'packages/dashboard/dist'), 'dev_startup')
const staticHits = grepTree(path.join(ROOT, 'packages/server-desktop/static'), 'dev_startup')
console.log(`dashboard dist files with dev_startup : ${distHits}`)
console.log(`server static files with dev_startup  : ${staticHits}`)
console.log(`VERSION file : ${fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim()}`)
const want = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim()
const ok = (vAgent === null || vAgent === want) && (vServer === null || vServer === want) && staticHits > 0
console.log(ok ? 'RESULT: ok' : 'RESULT: FAIL')
process.exit(ok ? 0 : 1)
