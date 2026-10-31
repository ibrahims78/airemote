'use strict'
// Run a local .ps1 file inside a lab VM through the agent exec channel.
// usage: node tools/lab/psrun.cjs <DEVICE_NAME> <local.ps1>
const path = require('path')
const fs = require('fs')
const remote = require(path.join(__dirname, 'remote.cjs'))

;(async () => {
  const [device, file] = process.argv.slice(2)
  if (!device || !file) { console.error('usage: node psrun.cjs <DEVICE> <file.ps1>'); process.exit(1) }
  const ps = fs.readFileSync(file, 'utf8')
  const r = await remote.run(device, ps, 60000)
  console.log(String(r.stdout || '').trim() || ('ERR ' + String(r.stderr || '').slice(0, 400)))
})()
