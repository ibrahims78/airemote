// t2: grant control with the lab control password, then measure a clipboard round-trip.
const fs = require('fs')
const lab = require('./lab.cjs')
const screen = require('./screen.cjs')
const crypto = require('crypto')

;(async () => {
  const pwd = fs.readFileSync(__dirname + '/cp.txt', 'utf8').trim()
  const list = await lab.devices()
  const d = list.find(x => x.name === 'WIN11-VM')
  console.log('device status:', d && d.status)

  const c = await screen.open('WIN11-VM')
  console.log('ws open:', await c.open())
  await c.waitFor('screen:monitors', 3000)

  const t0 = Date.now()
  c.send('screen:request_control', { requestId: 'probe-2', password: pwd })
  const g = await c.waitFor('screen:control_granted', 8000)
  const denied = await c.waitFor('screen:control_denied', 10)
  console.log('grant:', !!g, g ? ('via=' + (g.payload.via || '?') + ' in ' + (g.at - t0) + 'ms') : ('denied=' + (denied && denied.payload && denied.payload.reason)))

  if (g) {
    const marker = 'clip-probe-' + Date.now()
    const tw = Date.now()
    c.send('screen:clipboard_write', { text: marker })
    await new Promise(r => setTimeout(r, 900))
    c.send('screen:clipboard_read', {})
    const cb = await c.waitFor('screen:clipboard', 8000)
    const text = cb ? cb.payload.text : null
    console.log('write->read:', { match: text === marker, len: text ? text.length : -1, ms: cb ? cb.at - tw : -1, hash: text ? crypto.createHash('sha256').update(text).digest('hex').slice(0, 10) : null })
  }
  c.close()
})().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
