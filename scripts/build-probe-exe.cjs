#!/usr/bin/env node
'use strict'
/**
 * build-probe-exe.cjs — pack the agent probe into ONE Windows executable (Node SEA).
 *
 * §4.1 owner decision (2026-11-07): the click audit must run on the real Win10/Win11 guests
 * without installing Node there and without opening CDP to 0.0.0.0. A single-file exe that
 * carries its own runtime does both: copy it in, run it with --audit, copy the JSON back.
 *
 * Usage: node scripts/build-probe-exe.cjs [--out releases/tools/patch-probe.exe]
 *                                         [--entry scripts/probe-agent-live.cjs]
 *                                         [--postject <postject\dist\cli.js>] [--keep]
 *
 * Needs postject once (it is the only way to flip the SEA fuse). It is looked up in the repo
 * first, then in %TEMP%\sea-tools — deliberately not installed into the product's own
 * dependency tree, because the probe is a lab tool, not a dependency of the app.
 */
const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const argOf = (name) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : null }

const entry = path.resolve(argOf('entry') || path.join(ROOT, 'scripts', 'probe-agent-live.cjs'))
const out = path.resolve(argOf('out') || path.join(ROOT, 'releases', 'tools', 'patch-probe.exe'))
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

function fail (msg) { console.error('BUILD FAILED: ' + msg); process.exit(1) }

function resolvePostject () {
  const explicit = argOf('postject')
  if (explicit) return path.resolve(explicit)
  const candidates = [
    path.join(ROOT, 'node_modules', 'postject', 'dist', 'cli.js'),
    path.join(os.tmpdir(), 'sea-tools', 'node_modules', 'postject', 'dist', 'cli.js')
  ]
  return candidates.find(p => fs.existsSync(p)) || null
}

if (!fs.existsSync(entry)) fail('entry script missing: ' + entry)
const postject = resolvePostject()
if (!postject) fail('postject not found — npm i --prefix "%TEMP%\\sea-tools" postject (once), or pass --postject <cli.js>')

// the fuse has to be present in this node.exe, otherwise the injected blob never loads
const nodeExe = process.execPath
const sentinel = Buffer.from(FUSE + ':0', 'ascii')
if (fs.readFileSync(nodeExe).indexOf(sentinel) < 0) fail('SEA fuse sentinel not found in ' + nodeExe)

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sea-'))
const blob = path.join(work, 'sea-prep.blob')
const cfgPath = path.join(work, 'sea-config.json')
fs.writeFileSync(cfgPath, JSON.stringify({
  main: entry,
  output: blob,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false
}, null, 2), 'utf8')

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts })
  if (r.error) fail(r.error.message)
  if (r.status !== 0) fail(`${path.basename(cmd)} ${args.join(' ')} → exit ${r.status}\n${r.stdout || ''}${r.stderr || ''}`)
  return r
}

// 1) bundle the probe into a blob
run(nodeExe, ['--experimental-sea-config', cfgPath], { cwd: work })
if (!fs.existsSync(blob) || fs.statSync(blob).size === 0) fail('sea blob not produced')
const blobSize = fs.statSync(blob).size

// 2) a copy of node.exe becomes the executable
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.copyFileSync(nodeExe, out)

// 3) inject the blob and flip the fuse
run(nodeExe, [postject, out, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', FUSE])

// 4) prove the result runs by itself
const test = spawnSync(out, ['--self-test'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60000 })
let selfTest = null
try { selfTest = JSON.parse(test.stdout) } catch { /* reported below */ }
if (test.status !== 0 || !selfTest || !selfTest.ok) {
  fail(`self-test failed (exit ${test.status})\n${test.stdout || ''}${test.stderr || ''}`)
}

if (!process.argv.includes('--keep')) { try { fs.rmSync(work, { recursive: true, force: true }) } catch {} }

const size = fs.statSync(out).size
console.log(JSON.stringify({
  built: path.relative(ROOT, out),
  bytes: size,
  mb: Number((size / 1048576).toFixed(1)),
  fromNode: nodeExe,
  node: process.version,
  entry: path.relative(ROOT, entry),
  blobBytes: blobSize,
  postject: path.relative(ROOT, postject).startsWith('..') ? postject : path.relative(ROOT, postject),
  selfTest
}, null, 2))
