'use strict'
/**
 * main-load.test.cjs — smoke test: the agent's main process must load.
 *
 * Why: 3.11.8 build#1 shipped a TDZ ReferenceError ("Cannot access 'configStore'
 * before initialization") that `node --check` cannot see — the syntax is valid,
 * it only throws at module evaluation. It surfaced only when the packaged app
 * started on WIN10/WIN11 (dialog: "A JavaScript error occurred in the main
 * process"). This test evaluates main.js with a stubbed electron module and
 * fails on any throw at module scope.
 */
const Module = require('module')
const os = require('os')
const path = require('path')
const fs = require('fs')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-mainload-'))

function makeStub () {
  const target = function () { return makeStub() }
  return new Proxy(target, {
    get (_t, key) {
      if (key === 'then' || key === 'toJSON' || typeof key === 'symbol') return undefined
      if (key === 'getPath') return (name) => path.join(tmp, String(name || 'p'))
      if (key === 'getAppPath') return () => tmp
      if (key === 'requestSingleInstanceLock') return () => true
      if (key === 'whenReady') return () => ({ then: () => ({ catch: () => {} }) })
      if (key === 'isPackaged') return false
      if (key === 'getName') return () => 'airemote-agent-desktop'
      if (key === 'getVersion') return () => '3.11.8'
      return makeStub()
    },
    apply () { return makeStub() }
  })
}

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return makeStub()
  return originalLoad.apply(this, arguments)
}

let err = null
try {
  require('../main.js')
} catch (e) {
  err = e
} finally {
  Module._load = originalLoad
}

if (err) {
  const head = (err && err.stack ? err.stack : String(err)).split('\n').slice(0, 6).join('\n     ')
  console.error('  ✗ main.js threw while loading:\n     ' + head)
  process.exit(1)
}
console.log('  ✓ main.js loads without throwing (electron stubbed)')
