/**
 * Regression test — the updater must never copy the package more than once per attempt,
 * must throttle repeats, must hold a single-flight lock and must clean leftovers.
 *
 * Written after a live report: the updater looped, copying a ~223MB file into a new temp
 * folder ~23 times a day and never deleting one.
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

const SERVER_DIR = path.resolve(__dirname, '..')
const updater = require(path.resolve(SERVER_DIR, 'lib', 'updater'))

let failed = 0
function check (desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? '  (' + extra + ')' : '')); failed++ }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-uploop-'))
const dataDir = path.join(tmp, 'data')
const srcPkg = path.join(tmp, 'pkg.exe')
fs.mkdirSync(path.join(dataDir, 'updates'), { recursive: true })

// a 6MB stand-in for the real 223MB package
fs.writeFileSync(srcPkg, crypto.randomBytes(6 * 1024 * 1024))
const size = fs.statSync(srcPkg).size
const sha = crypto.createHash('sha256').update(fs.readFileSync(srcPkg)).digest('hex')
const verdict = { verified: true, artifact: { name: 'server-windows/AiRemote-Server-Setup-v9.9.9-x64.exe', path: srcPkg, size, sha256: sha } }

// ---- 1) staging is idempotent: one file, reused on the second call
const s1 = updater.stage(verdict, dataDir)
const stagedDir = path.join(dataDir, 'updates', 'staged')
const countAfterFirst = fs.readdirSync(stagedDir).length
const s2 = updater.stage(verdict, dataDir)
const countAfterSecond = fs.readdirSync(stagedDir).length
check('staging writes exactly one package', countAfterFirst === 1 && countAfterSecond === 1, countAfterFirst + '/' + countAfterSecond)
check('a second identical stage is reused, not re-copied', s2.reused === true && s2.bytes === size)
check('the staged file matches the source size', fs.statSync(s2.path).size === size)

// ---- 2) staging a different package prunes the previous one
fs.writeFileSync(path.join(tmp, 'pkg2.exe'), crypto.randomBytes(1024))
const verdict2 = { verified: true, artifact: { name: 'server-windows/AiRemote-Server-Setup-v9.9.10-x64.exe', path: path.join(tmp, 'pkg2.exe'), size: 1024, sha256: 'x' } }
updater.stage(verdict2, dataDir)
check('staging a new package leaves a single file behind', fs.readdirSync(stagedDir).length === 1, fs.readdirSync(stagedDir).join(','))

// ---- 3) attempt ledger throttles repeats of the same package
check('no attempt recorded yet', updater.recentAttempt(dataDir, '9.9.9', sha, 60000) === null)
updater.recordAttempt(dataDir, { target: '9.9.9', sha, at: new Date().toISOString(), action: 'apply' })
const recent = updater.recentAttempt(dataDir, '9.9.9', sha, 6 * 3600 * 1000)
check('a repeat inside the cooldown is reported', !!recent && recent.target === '9.9.9')
check('a different package is not throttled', updater.recentAttempt(dataDir, '9.9.9', 'other-sha', 6 * 3600 * 1000) === null)
updater.recordAttempt(dataDir, { target: '1.0.0', sha: 'abc', at: new Date(Date.now() - 24 * 3600 * 1000).toISOString() })
check('an old attempt falls outside the cooldown', updater.recentAttempt(dataDir, '1.0.0', 'abc', 6 * 3600 * 1000) === null)

// ---- 4) single-flight lock
const l1 = updater.acquireLock(dataDir)
const l2 = updater.acquireLock(dataDir)
check('the first lock is granted', l1.ok === true)
check('the second lock is refused while the first is held', l2.ok === false && l2.reason === 'locked')
updater.releaseLock(dataDir)
const l3 = updater.acquireLock(dataDir)
check('the lock can be taken again after release', l3.ok === true)
updater.releaseLock(dataDir)

// ---- 5) cleanup removes stale installer temp dumps
const fakeNs = path.join(os.tmpdir(), 'nsAIREMOTE_TEST.tmp')
fs.mkdirSync(fakeNs, { recursive: true })
fs.writeFileSync(path.join(fakeNs, 'setup.exe'), crypto.randomBytes(21 * 1024 * 1024))
const old = new Date(Date.now() - 5 * 3600 * 1000)
fs.utimesSync(fakeNs, old, old)

const before = fs.existsSync(fakeNs)
const res = updater.cleanup(dataDir, { tempAgeMs: 2 * 3600 * 1000 })
check('the stale ns*.tmp folder existed before cleanup', before)
check('cleanup removed the stale installer temp folder', !fs.existsSync(fakeNs), JSON.stringify(res.removed))
check('cleanup reports what it removed', Array.isArray(res.removed) && res.removed.length >= 1)

try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
try { fs.rmSync(fakeNs, { recursive: true, force: true }) } catch {}

console.log('')
if (failed) { console.error(failed + ' CHECK(S) FAILED'); process.exit(1) }
console.log('ALL UPDATER LOOP CHECKS PASSED')
