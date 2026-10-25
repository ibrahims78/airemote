#!/usr/bin/env node
'use strict'
/**
 * One-command verification battery for the hardened AiRemote tree.
 *
 * Prerequisites: `pnpm install` has been run for the relevant packages
 * (server + agent + dashboard; desktop-server test also needs
 * `pnpm install --prod --filter airemote-server-desktop`).
 *
 * Usage:  pnpm verify   (or: node scripts/verify.js)
 */
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')

function pnpmCmd() {
  // Run every step on the same pnpm that launched this script. The repo declares
  // "pnpm" as a root dependency, so node_modules/.bin/pnpm shadows the global CLI
  // inside `pnpm run` and a newer pnpm rejects a store created by an older one.
  const execPath = process.env.npm_execpath
  if (execPath && /pnpm/i.test(execPath) && fs.existsSync(execPath)) {
    return '"' + process.execPath + '" "' + execPath + '"'
  }
  if (process.platform === 'win32') {
    const p = path.join(process.env.APPDATA || '', 'npm', 'pnpm.cmd')
    if (fs.existsSync(p)) return '"' + p + '"'
  }
  return 'pnpm'
}
const PNPM = pnpmCmd()
const NODE = '"' + process.execPath + '"'

const steps = [
  { name: 'static import check',         cmd: NODE + ' scripts/check-imports.js' },
  { name: 'build shared',                cmd: PNPM + ' --filter @airemote/shared build' },
  { name: 'build ai-engine',             cmd: PNPM + ' --filter @airemote/ai-engine build' },
  { name: 'build server (tsc)',          cmd: PNPM + ' --filter @airemote/server build' },
  { name: 'build agent (tsc)',           cmd: PNPM + ' --filter @airemote/agent build' },
  { name: 'typecheck dashboard',         cmd: PNPM + ' --filter @airemote/dashboard typecheck' },
  { name: 'unit: registry race',         cmd: NODE + ' packages/server/test/registry-race.test.cjs' },
  { name: 'e2e: web-server connection',  cmd: NODE + ' packages/server/test/e2e-connection.test.cjs' },
  { name: 'e2e: device authorization',   cmd: NODE + ' packages/server/test/e2e-authz.test.cjs' },
  { name: 'e2e: desktop-server control', cmd: NODE + ' packages/server-desktop/test/e2e-screen-control.test.cjs' },
]

let failures = 0
console.log('AiRemote verification battery — ' + steps.length + ' steps\n')
for (const s of steps) {
  process.stdout.write('  ▶ ' + s.name.padEnd(30, ' ') + '  ')
  const r = spawnSync(s.cmd, { cwd: ROOT, shell: true, encoding: 'utf8' })
  if (r.status === 0) {
    console.log('ok')
  } else {
    failures++
    console.log('FAILED (exit ' + r.status + ')')
    const out = ((r.stdout || '') + '\n' + (r.stderr || '')).split('\n').filter(Boolean).slice(-10)
    for (const line of out) console.log('      ' + line)
  }
}

console.log('')
if (failures) {
  console.log(failures + ' of ' + steps.length + ' step(s) FAILED')
  process.exit(1)
}
console.log('ALL VERIFICATION STEPS PASSED (' + steps.length + '/' + steps.length + ')')
