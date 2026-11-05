/**
 * Unit test — agent control-password KDF (3.13.2).
 *
 * The password is stored on the device only. It used to be a single salted SHA-256, which is
 * fast enough to brute-force offline. It is now scrypt (N=16384,r=8,p=1) with a versioned
 * prefix, and legacy hashes still verify and are upgraded in place on first success.
 *
 * The test extracts the two real functions from main.js and runs them in a sandbox, so it
 * exercises the shipped code rather than a copy.
 */
'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')
const crypto = require('crypto')

const MAIN = path.resolve(__dirname, '..', 'main.js')
const src = fs.readFileSync(MAIN, 'utf8')

function pick (name) {
  const i = src.indexOf('function ' + name)
  if (i < 0) throw new Error(name + ' not found in main.js')
  let depth = 0
  let j = i
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}') { depth--; if (depth === 0) { j++; break } }
  }
  return src.slice(i, j)
}

let failed = 0
const check = (d, c, x) => { if (c) console.log('PASS: ' + d); else { console.error('FAIL: ' + d + (x ? '  (' + x + ')' : '')); failed++ } }

let saved = null
const box = {
  crypto,
  Buffer,
  config: {},
  saveConfig: (u) => { saved = Object.assign({}, box.config, u); Object.assign(box.config, u) },
  addLog: () => {}
}
vm.createContext(box)
vm.runInContext(
  ['const SCRYPT_PARAMS = ' + (src.match(/const SCRYPT_PARAMS = (\{[^}]*\})/) || ['', '{ N: 16384, r: 8, p: 1 }'])[1],
    pick('hashControlPassword'),
    pick('verifyControlPassword')].join('\n')
  + '\nthis.__h = hashControlPassword; this.__v = verifyControlPassword;',
  box
)

// 1) a fresh hash is scrypt and verifies
const h = box.__h('123456')
box.config.controlPasswordSalt = h.salt
box.config.controlPasswordHash = h.hash
check('new hash uses scrypt with a version prefix', String(h.hash).startsWith('scrypt$'), String(h.hash).slice(0, 12))
check('correct password verifies', box.__v('123456') === true)
check('wrong password is refused', box.__v('123457') === false)
check('empty password is refused', box.__v('') === false)

// 2) a legacy sha256 hash still works and is upgraded
const salt = crypto.randomBytes(16).toString('hex')
const legacy = crypto.createHash('sha256').update(salt + ':' + 'oldpass').digest('hex')
box.config.controlPasswordSalt = salt
box.config.controlPasswordHash = legacy
saved = null
check('legacy sha256 hash verifies', box.__v('oldpass') === true)
check('legacy hash is upgraded to scrypt on success', !!saved && String(saved.controlPasswordHash).startsWith('scrypt$'))
check('upgraded hash still verifies the same password', box.__v('oldpass') === true)
check('upgraded hash rejects a wrong password', box.__v('oldpass2') === false)

console.log('')
if (failed) { console.error(failed + ' CHECK(S) FAILED'); process.exit(1) }
console.log('ALL PASSWORD KDF CHECKS PASSED')
