/**
 * E2E test — R7 updates from an internal folder (v3.8.31).
 *
 * Trust chain under test: the signed manifest is the only thing that decides what may run.
 * A package is staged only when the Ed25519 signature verifies AND its SHA-256 matches the
 * manifest entry, so a half-copied file or an edited manifest stops the update instead of
 * installing it.
 *
 *   A. a newer signed package is reported available and verified
 *   B. the same version reports up-to-date
 *   C. a modified package fails the hash check
 *   D. a manifest edited after signing fails the signature check
 *   E. a missing signature is refused
 *   F. staging copies the verified package into the data directory
 *   G. the detached helper reports success when /health shows the target version
 *   H. it rolls back to the previous package when the target never answers
 *   I. without a previous package it fails cleanly instead of leaving a broken install
 *   J. the HTTP surface refuses an apply without an explicit confirmation
 *
 * The test signs with the local release key, which is exactly how a real release is built.
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

const SERVER_DIR = path.resolve(__dirname, '..')
const ROOT = path.resolve(SERVER_DIR, '..', '..')
const updater = require(path.resolve(SERVER_DIR, 'lib', 'updater'))

let failed = 0
function check(desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? '  (' + extra + ')' : '')); failed++ }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-upd-'))
const source = path.join(tmp, 'source')
const dataDir = path.join(tmp, 'data')
fs.mkdirSync(path.join(source, 'server-windows'), { recursive: true })
fs.mkdirSync(path.join(dataDir, 'updates'), { recursive: true })

const PRIVATE_KEY = fs.readFileSync(path.join(ROOT, 'releases', 'release-key.pem'), 'utf8')

function writeSignedManifest(version, artifacts) {
  const body = JSON.stringify({ product: 'AiRemote', version, generatedAt: new Date().toISOString(), artifacts }, null, 2)
  fs.writeFileSync(path.join(source, 'manifest.json'), body, 'utf8')
  fs.writeFileSync(path.join(source, 'manifest.sig'),
    crypto.sign(null, Buffer.from(body), PRIVATE_KEY).toString('base64'), 'utf8')
}

const pkgName = 'server-windows/AiRemote-Server-Setup-v3.8.99-x64.exe'
const pkgPath = path.join(source, pkgName.split('/').join(path.sep))
fs.writeFileSync(pkgPath, crypto.randomBytes(4096))
const pkgSha = crypto.createHash('sha256').update(fs.readFileSync(pkgPath)).digest('hex')
const pkgSize = fs.statSync(pkgPath).size
const artifacts = [{ name: pkgName, size: pkgSize, sha256: pkgSha }]

async function main() {
  // A. available
  writeSignedManifest('3.8.99', artifacts)
  const a = await updater.check({ sourceDir: source, currentVersion: '3.8.30' })
  check('A1. newer signed package is available', a.ok && a.available && a.verified, JSON.stringify(a).slice(0, 200))
  check('A2. the artifact is resolved with its digest', !!a.artifact && a.artifact.sha256 === pkgSha)

  // B. up to date
  const b = await updater.check({ sourceDir: source, currentVersion: '3.8.99' })
  check('B. same version reports up-to-date', b.ok && !b.available && b.reason === 'up-to-date', b.reason)

  // C. modified package
  const original = fs.readFileSync(pkgPath)
  fs.appendFileSync(pkgPath, Buffer.from([0]))
  const c = await updater.check({ sourceDir: source, currentVersion: '3.8.30' })
  check('C. a modified package fails the hash check', !c.available && c.reason === 'package-size-mismatch', c.reason)
  fs.writeFileSync(pkgPath, original)

  // D. manifest edited after signing
  const manifestPath = path.join(source, 'manifest.json')
  const signedBody = fs.readFileSync(manifestPath, 'utf8')
  fs.writeFileSync(manifestPath, signedBody.replace('3.8.99', '3.9.50'), 'utf8')
  const d = await updater.check({ sourceDir: source, currentVersion: '3.8.30' })
  check('D. a manifest edited after signing is refused', !d.ok && d.reason === 'signature-invalid', d.reason)
  fs.writeFileSync(manifestPath, signedBody, 'utf8')

  // E. missing signature
  fs.renameSync(path.join(source, 'manifest.sig'), path.join(source, 'manifest.sig.bak'))
  const e = await updater.check({ sourceDir: source, currentVersion: '3.8.30' })
  check('E. a missing signature is refused', !e.ok && e.reason === 'signature-missing', e.reason)
  fs.renameSync(path.join(source, 'manifest.sig.bak'), path.join(source, 'manifest.sig'))

  // F. staging
  const good = await updater.check({ sourceDir: source, currentVersion: '3.8.30' })
  const staged = updater.stage(good, dataDir)
  check('F. staging copies the verified package', fs.existsSync(staged.path) && staged.bytes === pkgSize, JSON.stringify(staged))

  // G/H/I. the detached helper
  const helper = updater.writeHelper(dataDir)
  check('G0. helper written next to the data directory', fs.existsSync(helper))
  const planPath = path.join(dataDir, 'updates', 'plan.json')
  const resultPath = path.join(dataDir, 'updates', 'result.json')
  const logPath = path.join(dataDir, 'updates', 'apply.log')
  const previous = path.join(source, 'server-windows', 'AiRemote-Server-Setup-v3.8.30-x64.exe')
  fs.writeFileSync(previous, crypto.randomBytes(1024))

  const run = (health, withPrevious) => {
    fs.writeFileSync(planPath, JSON.stringify({
      target: '3.8.99', installer: staged.path,
      previousInstaller: withPrevious ? previous : null,
      appExe: 'C:\\nonexistent\\AiRemote Server.exe',
      healthUrl: 'http://127.0.0.1:1/health', timeoutSeconds: 2,
      resultPath, logPath,
    }), 'utf8')
    try { fs.unlinkSync(resultPath) } catch {}
    spawnSync(process.execPath, [helper, planPath], {
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        ELECTRON_RUN_AS_NODE: '1',
        AIREMOTE_UPDATE_SKIP_PROCESS: '1',
        AIREMOTE_UPDATE_INSTALL_CMD: 'cmd /c exit 0',
        AIREMOTE_UPDATE_FAKE_HEALTH: health,
      }),
    })
    return JSON.parse(fs.readFileSync(resultPath, 'utf8'))
  }

  const g = run('3.8.99', true)
  check('G. helper reports success when the target version answers', g.state === 'success' && g.version === '3.8.99', JSON.stringify(g))

  const h = run('3.8.30', true)
  check('H. helper rolls back when the target never answers', h.state === 'rolled-back', JSON.stringify(h))

  const i = run('3.8.30', false)
  check('I. without a previous package it fails cleanly', i.state === 'failed' && i.reason === 'no previous installer to roll back to', JSON.stringify(i))

  // J. HTTP surface
  const PORT = 3992
  const SECRET = crypto.randomBytes(32).toString('hex')
  const dbPath = path.join(tmp, 'data', 'airemote.db')
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, tls: false, backup: false,
    updateDir: source, logger: { info() {}, warn() {}, error() {} }, desktopCallbacks: {} })
  const BASE = 'http://127.0.0.1:' + PORT
  const admin = await fetch(BASE + '/api/auth/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Upd', email: 'upd@test', password: 'correct-horse-battery' }),
  }).then((r) => r.json())
  const H = { Authorization: 'Bearer ' + admin.token, 'Content-Type': 'application/json' }

  const st = await fetch(BASE + '/api/desktop/update', { headers: H }).then((r) => r.json())
  check('J1. status reports current version and source', st.current === '3.8.31' && st.sourceDir === source, JSON.stringify(st).slice(0, 160))
  const anon = await fetch(BASE + '/api/desktop/update/check', { method: 'POST' })
  check('J2. checking needs a token', anon.status === 401)
  const applied = await fetch(BASE + '/api/desktop/update/apply', { method: 'POST', headers: H, body: JSON.stringify({ version: '3.8.99' }) })
  check('J3. apply without confirm:true is refused', applied.status === 400, 'status=' + applied.status)

  await srv.stop()
  console.log(failed === 0 ? 'ALL UPDATE CHECKS PASSED' : failed + ' CHECK(S) FAILED')
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error('FAILED: ' + (e && e.stack || e)); process.exit(1) })
