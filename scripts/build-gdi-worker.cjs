#!/usr/bin/env node
'use strict'
/**
 * build-gdi-worker.cjs — 3.11.10
 *
 * يترجم packages/agent-desktop/lib/capture-gdi-worker.cs إلى .exe بـcsc.exe
 * (مترجم .NET Framework الموجود على كل ويندوز 10/11 — لا SDK ولا NuGet).
 *
 * لماذا: 3.11.9 كان العامل يبني النوع نفسه بـAdd-Type في كل إقلاع (~2s على
 * أجهزة المختبر). التجميع المسبق يزيل هذا الزمن من المسار الحرج.
 *
 * الاستخدام:
 *   node scripts/build-gdi-worker.cjs           # يبني إن لزم (المصدر أحدث أو الخرج مفقود)
 *   node scripts/build-gdi-worker.cjs --force   # يبني دائماً
 *   node scripts/build-gdi-worker.cjs --check   # يتحقق فقط (exit 1 إن كان الخرج قديماً/مفقوداً)
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'packages', 'agent-desktop', 'lib', 'capture-gdi-worker.cs')
const OUT_DIR = path.join(ROOT, 'packages', 'agent-desktop', 'lib', 'bin')
const OUT = path.join(OUT_DIR, 'capture-gdi-worker.exe')

const argv = process.argv.slice(2)
const FORCE = argv.includes('--force')
const CHECK = argv.includes('--check')

function cscPath () {
  const win = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows'
  const candidates = [
    path.join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(win, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
  ]
  for (const c of candidates) if (fs.existsSync(c)) return c
  return null
}

function sha256 (file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function upToDate () {
  try {
    const s = fs.statSync(SRC).mtimeMs
    const o = fs.statSync(OUT).mtimeMs
    return o >= s
  } catch { return false }
}

if (!fs.existsSync(SRC)) {
  console.error('build-gdi-worker: source missing: ' + SRC)
  process.exit(1)
}

if (CHECK) {
  if (upToDate()) {
    console.log('gdi-worker: up to date (' + fs.statSync(OUT).size + ' bytes)')
    process.exit(0)
  }
  console.error('gdi-worker: stale or missing — run node scripts/build-gdi-worker.cjs')
  process.exit(1)
}

if (!FORCE && upToDate()) {
  console.log('gdi-worker: up to date (' + fs.statSync(OUT).size + ' bytes) — rebuild with --force')
  process.exit(0)
}

const csc = cscPath()
if (!csc) {
  console.error('build-gdi-worker: csc.exe not found (.NET Framework 4.x is required on the build host)')
  process.exit(1)
}

fs.mkdirSync(OUT_DIR, { recursive: true })
const args = [
  '/nologo', '/target:exe', '/platform:anycpu', '/optimize+', '/debug-',
  '/r:System.dll', '/r:System.Drawing.dll',
  '/out:' + OUT,
  SRC
]
const r = spawnSync(csc, args, { encoding: 'utf8', windowsHide: true })
const out = ((r.stdout || '') + (r.stderr || '')).trim()
if (out) console.log(out)
if (r.status !== 0 || !fs.existsSync(OUT)) {
  console.error('build-gdi-worker: csc failed (status ' + r.status + ')')
  process.exit(1)
}

const st = fs.statSync(OUT)
console.log(JSON.stringify({
  out: OUT,
  bytes: st.size,
  sha256: sha256(OUT),
  csc,
  cscVersion: '4.8',
  source: SRC
}, null, 1))
