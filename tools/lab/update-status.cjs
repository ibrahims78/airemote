const lab = require('./lab.cjs')
;(async () => {
  const r = await lab.api('/api/desktop/update')
  console.log('status=' + r.status)
  console.log(JSON.stringify(r.json || r.text).slice(0, 600))
})().catch(e => { console.error(e.message); process.exit(1) })
