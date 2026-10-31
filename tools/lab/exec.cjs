// exec helper: run a command on a device via the product API (cached token).
const lab = require('./lab.cjs')

;(async () => {
  const target = process.argv[2]
  const command = process.argv[3]
  const timeoutMs = parseInt(process.argv[4] || '60000', 10)
  if (!target || !command) { console.error('usage: exec <device> "<command>"'); process.exit(2) }
  const id = await lab.deviceId(target)
  const r = await lab.api(`/api/devices/${id}/exec`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, timeoutMs })
  })
  const j = r.json || {}
  console.log('device:', target, '| http', r.status, '| exit', j.exitCode, '| duration', j.duration)
  if (j.stdout) console.log(j.stdout)
  if (j.stderr) console.log('STDERR:', j.stderr.slice(0, 1500))
})().catch(e => { console.error('EXEC FAILED:', e.message); process.exit(1) })
