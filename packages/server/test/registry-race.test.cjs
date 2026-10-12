/**
 * Race regression test: a late close of a replaced (stale) agent socket must
 * NOT remove the newer connection's registration.
 *
 * Requires the compiled output. Run:
 *   pnpm --filter @airemote/server build
 *   node packages/server/test/registry-race.test.cjs
 */
'use strict'

const { DeviceRegistry } = require('../dist/ws/registry.js')

let failed = false
function check(desc, cond) {
  if (cond) { console.log('PASS: ' + desc) }
  else { console.error('FAIL: ' + desc); failed = true }
}

const mk = (name) => ({
  name,
  readyState: 1,
  sent: [],
  send(d) { this.sent.push(d) },
  close() {},
  terminate() {},
})

const reg = new DeviceRegistry()

// 1) A registers dev1
const A = mk('A')
reg.registerDevice('dev1', A)
check('A registered -> device online', reg.isDeviceOnline('dev1') === true)

// 2) B re-registers dev1, replacing A
const B = mk('B')
reg.registerDevice('dev1', B)
check('B replaced A -> still online', reg.isDeviceOnline('dev1') === true)
check('registry points to B', reg.getDevice('dev1').socket === B)

// 3) Stale close of A must not remove B
const r1 = reg.disconnectDevice('dev1', A)
check('stale disconnect(A) returns false', r1 === false)
check('device still online after stale close', reg.isDeviceOnline('dev1') === true)
check('registry still points to B', reg.getDevice('dev1').socket === B)

// 4) Normal close of B
const r2 = reg.disconnectDevice('dev1', B)
check('current disconnect(B) returns true', r2 === true)
check('device offline after B closes', reg.isDeviceOnline('dev1') === false)

// 5) Legacy call without socket still disconnects
const C = mk('C')
reg.registerDevice('dev2', C)
const r3 = reg.disconnectDevice('dev2')
check('legacy disconnect without socket returns true', r3 === true)
check('dev2 offline after legacy disconnect', reg.isDeviceOnline('dev2') === false)

// 6) Unknown device
check('disconnect of unknown device returns false', reg.disconnectDevice('ghost') === false)

if (failed) {
  console.error('RACE TEST FAILED')
  process.exit(1)
}
console.log('ALL TESTS PASSED')
