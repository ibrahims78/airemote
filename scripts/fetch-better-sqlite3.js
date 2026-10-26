#!/usr/bin/env node
/**
 * fetch-better-sqlite3.js — reproducible prebuild fetcher for `better-sqlite3`.
 *
 * Why this exists
 *   node-gyp cannot build `better-sqlite3` on a machine without a registered
 *   Visual Studio, and there is no prebuild for Node 24 (ABI 137). The desktop
 *   server ships on Electron, so the official Electron-ABI prebuild is enough —
 *   but only if a clean checkout can fetch the exact same bytes every time.
 *
 * What it does
 *   1. resolves the Electron version installed in the workspace and maps it to a
 *      module ABI (no guessing: unknown versions abort with a clear message),
 *   2. downloads the pinned prebuild archive for that ABI into `.cache/`,
 *   3. verifies its size and SHA-256 against the pinned digest from THIS file —
 *      a mismatch is a hard failure, never a warning,
 *   4. optionally extracts it into the package (or any --out directory).
 *
 * Usage
 *   node scripts/fetch-better-sqlite3.js                  # download + verify only
 *   node scripts/fetch-better-sqlite3.js --out <dir>      # also extract into <dir>
 *   node scripts/fetch-better-sqlite3.js --install        # extract into packages/server-desktop/node_modules/better-sqlite3
 *   node scripts/fetch-better-sqlite3.js --force          # ignore cached archive
 *   node scripts/fetch-better-sqlite3.js --abi 119        # skip Electron detection
 *
 * Exit codes: 0 success, 1 failure.
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const https = require('https')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const PKG = 'better-sqlite3'
const VERSION = '9.6.0'
const REPO = 'WiseLibs/better-sqlite3'

/** Electron major -> Node module ABI. Extend deliberately, never infer. */
const ELECTRON_ABI = {
  26: 116,
  27: 118,
  28: 119,
  29: 121,
  30: 123,
  31: 125,
  32: 128
}

/** Pinned digests, keyed by archive file name. */
const PINNED = {
  'better-sqlite3-v9.6.0-electron-v119-win32-x64.tar.gz': {
    sha256: '6208def72a1fe4b7d00542bc09c9cf07b192b62a1b43a41deb704103ea9d8f91',
    bytes: 888593,
    recorded: '2026-10-26 from the official v9.6.0 GitHub release'
  }
}

function parseArgs(argv) {
  const out = { install: false, force: false, abi: null, out: null, cache: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--install') out.install = true
    else if (a === '--force') out.force = true
    else if (a === '--abi') out.abi = parseInt(argv[++i], 10)
    else if (a === '--out') out.out = path.resolve(argv[++i])
    else if (a === '--cache') out.cache = path.resolve(argv[++i])
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0) }
    else { console.error('unknown argument: ' + a); process.exit(1) }
  }
  return out
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function detectElectronMajor() {
  const candidates = [
    path.join(ROOT, 'packages', 'server-desktop', 'node_modules', 'electron', 'package.json'),
    path.join(ROOT, 'node_modules', 'electron', 'package.json')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const v = String(readJson(c).version || '')
      const major = parseInt(v.split('.')[0], 10)
      if (major) return { major, version: v, source: path.relative(ROOT, c) }
    }
  }
  return null
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
}

function download(url, dest, redirects) {
  redirects = redirects === undefined ? 5 : redirects
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': 'AiRemote-Build/3.7.1' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        if (redirects <= 0) return reject(new Error('too many redirects'))
        const next = new URL(res.headers.location, url).toString()
        return resolve(download(next, dest, redirects - 1))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url))
      }
      const tmp = dest + '.part'
      const out = fs.createWriteStream(tmp)
      let received = 0
      res.on('data', (c) => { received += c.length })
      res.pipe(out)
      out.on('finish', () => out.close(() => {
        fs.renameSync(tmp, dest)
        resolve(received)
      }))
      out.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(120000, () => req.destroy(new Error('download timed out')))
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const targetPlatform = process.platform
  const targetArch = process.arch

  let abi = args.abi
  let electronNote = 'from --abi'
  if (!abi) {
    const el = detectElectronMajor()
    if (!el) {
      console.error('FAIL: Electron is not installed in this workspace, so the module ABI is unknown.')
      console.error('      Install dependencies first, or pass --abi <n> explicitly.')
      process.exit(1)
    }
    abi = ELECTRON_ABI[el.major]
    if (!abi) {
      console.error(`FAIL: Electron ${el.version} has no ABI mapped in this script.`)
      console.error('      Add it to ELECTRON_ABI after checking the official ABI table; do not guess.')
      process.exit(1)
    }
    electronNote = `Electron ${el.version} (${el.source})`
  }

  const fileName = `${PKG}-v${VERSION}-electron-v${abi}-${targetPlatform}-${targetArch}.tar.gz`
  const pin = PINNED[fileName]
  console.log(`[fetch] target      : ${fileName}`)
  console.log(`[fetch] abi source  : ${electronNote}`)

  if (!pin) {
    console.error('FAIL: this artifact is not pinned in this script, so it cannot be verified.')
    console.error('      Refusing to download an unverified binary.')
    process.exit(1)
  }

  const cacheDir = args.cache || path.join(ROOT, '.cache', 'better-sqlite3')
  fs.mkdirSync(cacheDir, { recursive: true })
  const archive = path.join(cacheDir, fileName)

  const verify = (p) => {
    const bytes = fs.statSync(p).size
    if (pin.bytes && bytes !== pin.bytes) return { ok: false, why: `size ${bytes} != pinned ${pin.bytes}` }
    const sha = sha256File(p)
    if (sha !== pin.sha256) return { ok: false, why: `sha256 ${sha} != pinned ${pin.sha256}` }
    return { ok: true, sha, bytes }
  }

  let state = null
  if (!args.force && fs.existsSync(archive)) {
    const v = verify(archive)
    if (v.ok) {
      state = v
      console.log(`[fetch] cache hit   : ${path.relative(ROOT, archive)} (sha256 ok)`)
    } else {
      console.log(`[fetch] cache stale : ${v.why} — re-downloading`)
    }
  }

  if (!state) {
    const url = `https://github.com/${REPO}/releases/download/v${VERSION}/${fileName}`
    console.log(`[fetch] downloading : ${url}`)
    const received = await download(url, archive)
    const v = verify(archive)
    if (!v.ok) {
      console.error('FAIL: downloaded archive does not match the pinned digest: ' + v.why)
      console.error('      The file was kept for inspection: ' + archive)
      process.exit(1)
    }
    state = v
    console.log(`[fetch] verified    : ${received} bytes, sha256 ${v.sha}`)
  } else {
    console.log(`[fetch] verified    : ${state.bytes} bytes, sha256 ${state.sha}`)
  }

  const outDir = args.install
    ? path.join(ROOT, 'packages', 'server-desktop', 'node_modules', 'better-sqlite3')
    : args.out

  if (!outDir) {
    console.log('[fetch] done        : archive verified in cache only (pass --out or --install to extract)')
    return
  }

  fs.mkdirSync(outDir, { recursive: true })
  // bsdtar ships with Windows 10+; the archive holds build/Release/better_sqlite3.node
  execFileSync('tar', ['-xzf', archive, '-C', outDir], { stdio: 'inherit' })

  const nodeFile = path.join(outDir, 'build', 'Release', 'better_sqlite3.node')
  if (!fs.existsSync(nodeFile)) {
    console.error('FAIL: extraction produced no ' + path.relative(ROOT, nodeFile))
    process.exit(1)
  }
  console.log(`[fetch] extracted   : ${path.relative(ROOT, nodeFile)} (${fs.statSync(nodeFile).size} bytes)`)
  console.log(`[fetch] sha256      : ${sha256File(nodeFile)}`)
  console.log('[fetch] done        : verified prebuild in place')
}

main().catch((e) => {
  console.error('FAIL: ' + (e && e.message ? e.message : e))
  process.exit(1)
})
