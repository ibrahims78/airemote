#!/usr/bin/env node
'use strict'
/**
 * release-manifest.js — v3.7.0
 *
 * Produces a reproducible manifest of release artifacts with SHA-256 hashes and
 * an Ed25519 signature over the manifest, so downloads can be verified without
 * trusting the transport.
 *
 * Usage:
 *   node scripts/release-manifest.js                 # hash + sign everything in releases/
 *   node scripts/release-manifest.js --verify        # verify an existing manifest
 *
 * Keys live next to the manifest (release-key.pem / release-key.pub) and must
 * never be committed. Set AIREMOTE_RELEASE_KEY to use a key outside the repo.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const RELEASES = path.join(ROOT, 'releases')
const MANIFEST = path.join(RELEASES, 'manifest.json')
const SIGNATURE = path.join(RELEASES, 'manifest.sig')
const KEY_PATH = process.env.AIREMOTE_RELEASE_KEY || path.join(ROOT, 'releases', 'release-key.pem')
const PUB_PATH = KEY_PATH.replace(/\.pem$/, '.pub.pem')

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // v3.8.21 - archived builds are not downloadable artifacts: hashing them would
      // walk gigabytes and list files the manifest no longer publishes.
      if (entry.name === 'win-unpacked' || entry.name === 'archive' || entry.name === 'old releases') continue
      walk(full, out)
    } else if (/\.(exe|zip|apk|msi|7z|tar\.gz)$/i.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function sha256(file) {
  const h = crypto.createHash('sha256')
  h.update(fs.readFileSync(file))
  return h.digest('hex')
}

function ensureKeys() {
  if (fs.existsSync(KEY_PATH)) {
    return {
      privateKey: fs.readFileSync(KEY_PATH),
      publicKey: fs.readFileSync(PUB_PATH)
    }
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  fs.writeFileSync(KEY_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }))
  fs.writeFileSync(PUB_PATH, publicKey.export({ type: 'spki', format: 'pem' }))
  console.log('generated new Ed25519 release key at ' + KEY_PATH)
  return { privateKey: fs.readFileSync(KEY_PATH), publicKey: fs.readFileSync(PUB_PATH) }
}

function build() {
  const { privateKey } = ensureKeys()
  const files = walk(RELEASES, []).sort()
  const artifacts = files.map(f => ({
    name: path.relative(RELEASES, f).replace(/\\/g, '/'),
    size: fs.statSync(f).size,
    sha256: sha256(f)
  }))
  const manifest = {
    product: 'AiRemote',
    version: require(path.join(ROOT, 'packages', 'server-desktop', 'package.json')).version,
    generatedAt: new Date().toISOString(),
    artifacts
  }
  const body = JSON.stringify(manifest, null, 2)
  fs.writeFileSync(MANIFEST, body)
  fs.writeFileSync(SIGNATURE, crypto.sign(null, Buffer.from(body), privateKey).toString('base64'))
  console.log('manifest: ' + artifacts.length + ' artifacts -> ' + MANIFEST)
  for (const a of artifacts) console.log('  ' + a.sha256.slice(0, 16) + '…  ' + a.name)
}

function verify() {
  const body = fs.readFileSync(MANIFEST)
  const sig = Buffer.from(fs.readFileSync(SIGNATURE, 'utf8'), 'base64')
  const pub = fs.readFileSync(PUB_PATH)
  const ok = crypto.verify(null, body, pub, sig)
  console.log(ok ? 'signature OK' : 'signature INVALID')
  if (!ok) process.exit(1)
  const manifest = JSON.parse(body.toString())
  let bad = 0
  for (const a of manifest.artifacts) {
    const file = path.join(RELEASES, a.name)
    if (!fs.existsSync(file) || sha256(file) !== a.sha256) { bad++; console.log('MISMATCH ' + a.name) }
  }
  console.log(bad === 0 ? 'all artifacts match' : bad + ' artifact(s) mismatch')
  if (bad) process.exit(1)
}

if (process.argv.includes('--verify')) verify()
else build()
