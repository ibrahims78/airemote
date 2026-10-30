// Remote command helper for measurement scripts (uses the cached lab token).
const lab = require('./lab.cjs')

async function run(device, command, timeoutMs = 30000) {
  const id = await lab.deviceId(device)
  const r = await lab.api(`/api/devices/${id}/exec`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, timeoutMs })
  })
  const j = r.json || {}
  return { ok: r.status === 200 && j.exitCode === 0, stdout: (j.stdout || '').trim(), stderr: (j.stderr || '').trim(), status: r.status }
}

async function getClipboard(device) {
  const r = await run(device, 'Get-Clipboard -Raw')
  return r.ok ? r.stdout : null
}

async function setClipboard(device, text) {
  const safe = String(text).replace(/'/g, "''")
  return run(device, "Set-Clipboard -Value '" + safe + "'")
}

module.exports = { run, getClipboard, setClipboard }
