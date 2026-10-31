const lab = require('./lab.cjs')
;(async () => {
  const list = await lab.devices()
  for (const d of list) {
    const info = d.info || {}
    console.log(String(d.name).padEnd(18) + String(d.status).padEnd(8) + 'agent=' + (info.agentVersion || '?'))
  }
})().catch(e => { console.error(e.message); process.exit(1) })
