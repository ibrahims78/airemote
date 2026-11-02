'use strict'
/**
 * config-store.test.cjs — regression battery for the agent settings store.
 *
 * Written for AUDIT-2026-11-02 (P1): the WIN10 agent lost serverUrl/token/
 * autoStart after a guest reboot. Root cause chain, each case below pins one
 * link: non-atomic write → invalid JSON → "no config" fallback → the next
 * bounds save persisted defaults over the real file.
 */
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createConfigStore } = require('../lib/config-store')

let pass = 0
let fail = 0
function ok (name, fn) {
  try {
    fn()
    pass++
    console.log('  ✓ ' + name)
  } catch (e) {
    fail++
    console.error('  ✗ ' + name + ' — ' + e.message)
  }
}
function tmpdir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-cfg-'))
}
const quiet = () => {}
const CORRUPT = '{"serverUrl":"wss://h:3001/ws","token":"keep-me-please",,,'
const PAIR = { serverUrl: 'wss://192.168.0.1:3001/ws', token: 'tok-123', autoStart: true }

ok('round-trip: save then reload keeps pairing', () => {
  const f = path.join(tmpdir(), 'airemote-config.json')
  const a = createConfigStore({ file: f, log: quiet })
  assert.strictEqual(a.save({ ...PAIR }), true)
  const b = createConfigStore({ file: f, log: quiet })
  assert.strictEqual(b.config.serverUrl, PAIR.serverUrl)
  assert.strictEqual(b.config.token, PAIR.token)
  assert.strictEqual(b.config.autoStart, true)
  assert.strictEqual(b.state.recovered, false)
})

ok('atomic write leaves no .tmp residue', () => {
  const dir = tmpdir()
  const f = path.join(dir, 'airemote-config.json')
  const s = createConfigStore({ file: f, log: quiet })
  s.save({ ...PAIR })
  s.save({ _winBounds: { x: 1, y: 2, width: 900, height: 600 } })
  const leftovers = fs.readdirSync(dir).filter(n => n.includes('.tmp-'))
  assert.deepStrictEqual(leftovers, [])
  const parsed = JSON.parse(fs.readFileSync(f, 'utf8'))
  assert.strictEqual(parsed.token, PAIR.token)
})

ok('corrupt file: quarantined byte-for-byte, app starts on defaults', () => {
  const f = path.join(tmpdir(), 'airemote-config.json')
  fs.writeFileSync(f, CORRUPT, 'utf8')
  const s = createConfigStore({ file: f, log: quiet })
  assert.strictEqual(s.state.recovered, true)
  assert.ok(s.state.quarantined, 'quarantine path must be reported')
  assert.strictEqual(fs.readFileSync(s.state.quarantined, 'utf8'), CORRUPT, 'original bytes must survive')
  assert.strictEqual(s.config.serverUrl, '')
  assert.strictEqual(s.config.token, '')
  assert.ok(!fs.existsSync(f), 'bad file must be moved away, not overwritten in place')
})

ok('REGRESSION: a bounds save after corruption must not destroy the pairing data', () => {
  const f = path.join(tmpdir(), 'airemote-config.json')
  fs.writeFileSync(f, CORRUPT, 'utf8')
  const s = createConfigStore({ file: f, log: quiet })
  s.save({ _winBounds: { x: 10, y: 20, width: 1100, height: 700 } })
  assert.ok(fs.readFileSync(s.state.quarantined, 'utf8').includes('keep-me-please'), 'pairing bytes must still be recoverable')
  const fresh = JSON.parse(fs.readFileSync(f, 'utf8'))
  assert.strictEqual(fresh._winBounds.width, 1100)
  assert.strictEqual(fresh.serverUrl, '')
})

ok('quarantine happens once — a restart on the new file is clean', () => {
  const f = path.join(tmpdir(), 'airemote-config.json')
  fs.writeFileSync(f, CORRUPT, 'utf8')
  const first = createConfigStore({ file: f, log: quiet })
  first.save({ ...PAIR })
  const second = createConfigStore({ file: f, log: quiet })
  assert.strictEqual(second.state.recovered, false)
  assert.strictEqual(second.state.quarantined, null)
  assert.strictEqual(second.config.token, PAIR.token)
})

ok('seeds pairing from legacy userData when the live config is missing', () => {
  const dir = tmpdir()
  const live = path.join(dir, 'live', 'airemote-config.json')
  const legacy = path.join(dir, 'legacy', 'airemote-config.json')
  fs.mkdirSync(path.dirname(legacy), { recursive: true })
  fs.writeFileSync(legacy, JSON.stringify({ ...PAIR, controlAuthMode: 'consent' }), 'utf8')
  const s = createConfigStore({ file: live, legacyFile: legacy, log: quiet })
  assert.strictEqual(s.state.seeded, true)
  assert.strictEqual(s.config.serverUrl, PAIR.serverUrl)
  assert.strictEqual(s.config.token, PAIR.token)
  assert.strictEqual(s.config.autoStart, true, 'absent live config may inherit autoStart')
  assert.strictEqual(s.config.controlAuthMode, 'consent')
  assert.ok(fs.existsSync(live), 'seed must be persisted immediately')
  assert.strictEqual(JSON.parse(fs.readFileSync(live, 'utf8')).token, PAIR.token)
})

ok('seeds pairing but keeps an explicit autoStart=false in a live config', () => {
  const dir = tmpdir()
  const live = path.join(dir, 'airemote-config.json')
  const legacy = path.join(dir, 'legacy.json')
  fs.writeFileSync(live, JSON.stringify({ serverUrl: '', token: '', autoStart: false, _winBounds: { width: 1000, height: 640 } }), 'utf8')
  fs.writeFileSync(legacy, JSON.stringify(PAIR), 'utf8')
  const s = createConfigStore({ file: live, legacyFile: legacy, log: quiet })
  assert.strictEqual(s.config.serverUrl, PAIR.serverUrl)
  assert.strictEqual(s.config.token, PAIR.token)
  assert.strictEqual(s.config.autoStart, false, 'explicit off must not be overridden by legacy true')
  assert.strictEqual(s.config._winBounds.width, 1000)
})

ok('never overwrites existing live pairing with legacy values', () => {
  const dir = tmpdir()
  const live = path.join(dir, 'airemote-config.json')
  const legacy = path.join(dir, 'legacy.json')
  fs.writeFileSync(live, JSON.stringify({ serverUrl: 'wss://mine/ws', token: 'mine' }), 'utf8')
  fs.writeFileSync(legacy, JSON.stringify({ serverUrl: 'wss://legacy/ws', token: 'legacy' }), 'utf8')
  const s = createConfigStore({ file: live, legacyFile: legacy, log: quiet })
  assert.strictEqual(s.state.seeded, false)
  assert.strictEqual(s.config.serverUrl, 'wss://mine/ws')
  assert.strictEqual(s.config.token, 'mine')
})

ok('save failure is reported instead of swallowed', () => {
  const dir = tmpdir()
  const blocker = path.join(dir, 'blocker')
  fs.writeFileSync(blocker, 'x', 'utf8')
  const seen = []
  const s = createConfigStore({ file: path.join(blocker, 'nested', 'airemote-config.json'), log: m => seen.push(m) })
  assert.strictEqual(s.save({ ...PAIR }), false)
  assert.ok(seen.some(m => /save FAILED/.test(m)), 'failure must reach the log callback')
})

ok('BOM-prefixed config is tolerated', () => {
  const f = path.join(tmpdir(), 'airemote-config.json')
  fs.writeFileSync(f, '\uFEFF' + JSON.stringify({ ...PAIR }), 'utf8')
  const s = createConfigStore({ file: f, log: quiet })
  assert.strictEqual(s.state.recovered, false)
  assert.strictEqual(s.config.token, PAIR.token)
})

console.log('')
if (fail) {
  console.error(fail + ' of ' + (pass + fail) + ' config-store case(s) FAILED')
  process.exit(1)
}
console.log('ALL CONFIG-STORE CASES PASSED (' + pass + '/' + pass + ')')
