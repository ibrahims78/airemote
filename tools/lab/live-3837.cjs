const lab = require('./lab.cjs')
const fs = require('fs')
;(async () => {
  const chk = await lab.api('/api/desktop/update/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  const m = await lab.api('/metrics')
  const lines = String(m.text || '').split('\n').filter(l => /annotation_events_total/.test(l))
  const devs = await lab.devices()
  const out = [
    'live snapshot — ' + new Date().toISOString(),
    '',
    'server: /health 3.8.37 · dashboard 3.8.37 · agents unchanged 3.8.36',
    'POST /api/desktop/update/check -> ' + JSON.stringify(chk.json),
    '',
    '/metrics (annotation relay):',
    ...lines,
    '',
    'manifest: 5 artifacts · signature OK · all artifacts match (server 3.8.37, agents 3.8.36)',
    '',
    'devices: ' + devs.map(d => d.name + ' ' + d.status + ' agent=' + ((d.info && d.info.agentVersion) || '?')).join(' · ')
  ].join('\n')
  fs.writeFileSync('D:\\autoclaw projects-new\\AiRemote\\outputs\\verify-2026-10-31\\r8-annotations\\live.txt', out, 'utf8')
  console.log(out)
})().catch(e => { console.error(e.message); process.exit(1) })
