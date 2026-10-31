// t1: can we get a control grant through the real consent dialog (UI automation helper on the VM)?
const lab = require('./lab.cjs')
const screen = require('./screen.cjs')
const crypto = require('crypto')
const h = s => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 10)

;(async () => {
  const c = await screen.open('WIN11-VM')
  const ok = await c.open()
  console.log('ws open:', ok)
  c.send('screen:request_control', { requestId: 'probe-1' })
  const granted = await c.waitFor('screen:control_granted', 4000)
  console.log('granted immediately:', !!granted)
  if (!granted) {
    // leave the client alive while the operator-side script clicks Allow
    global.__client = c
    console.log('WAITING_FOR_DIALOG')
    const g = await c.waitFor('screen:control_granted', 40000)
    console.log('granted after dialog:', !!g, g && g.payload)
    if (g) {
      const marker = 'control-grant-probe-' + Date.now()
      c.send('screen:clipboard_write', { text: marker })
      await new Promise(r => setTimeout(r, 1500))
      c.send('screen:clipboard_read', {})
      const cb = await c.waitFor('screen:clipboard', 8000)
      console.log('clipboard roundtrip:', cb ? { len: (cb.payload.text || '').length, match: cb.payload.text === marker } : null)
    }
  }
  console.log('events:', c.summary().join(' | '))
  c.close()
})().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
