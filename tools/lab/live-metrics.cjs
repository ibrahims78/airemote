const lab = require('./lab.cjs')
;(async () => {
  const chk = await lab.api('/api/desktop/update/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  console.log('check status=' + chk.status + ' ' + JSON.stringify(chk.json).slice(0, 400))
  const m = await lab.api('/metrics')
  const lines = String(m.text || '').split('\n').filter(l => /clipboard_sync/.test(l))
  console.log(lines.join('\n'))
})().catch(e => { console.error(e.message); process.exit(1) })
