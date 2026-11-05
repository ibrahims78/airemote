'use strict'
// Pane visibility: only the selected tab may have height.
const d = require('./cdp-driver.cjs')
const B = 'C:/Users/admin/AppData/Roaming/AutoClaw-oversea-official/accounts/ba207bd929e7ad7367272dfba67222768ae625cdd8b716878bf860274d23e71a/projects/Default/design'

;(async () => {
  let fails = 0
  for (const [f, w] of [['windows-agent.html', 700], ['android.html', 460]]) {
    await d.launch()
    const cdp = await d.attach()
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 1000, deviceScaleFactor: 1, mobile: false })
    await cdp.send('Page.navigate', { url: 'file:///' + (B + '/' + f).replace(/\\/g, '/') })
    await new Promise(r => setTimeout(r, 800))

    const norm = (x) => typeof x === 'string' ? x.replace(/[^a-z]/gi, '') : JSON.stringify(x)
    for (const [tab, pane] of [['status', 'status'], ['ai', 'ai'], ['chat', 'chat'], ['log', 'log']]) {
      await d.evaluate(cdp, `showTab('${tab}')`)
      await new Promise(r => setTimeout(r, 120))
      const res = await d.evaluate(cdp, `(function(){
        const ids = ['status','ai','chat','log']
        const h = {}
        ids.forEach(i => { const el = document.getElementById(i); h[i] = el ? Math.round(el.getBoundingClientRect().height) : -1 })
        return { h: h, on: (document.querySelector('.pg.on')||{}).id }
      })()`)
      const others = Object.keys(res.h).filter(k => k !== pane && res.h[k] > 0)
      const ok = res.on === pane && res.h[pane] > 60 && others.length === 0
      if (!ok) fails++
      console.log((ok ? 'PASS' : 'FAIL') + '  ' + f + ' tab=' + tab + '  on=' + res.on + '  heights=' + JSON.stringify(res.h))
    }
  }
  console.log('\nRESULT=' + (fails ? 'FAIL(' + fails + ')' : 'PASS'))
  process.exit(fails ? 1 : 0)
})()
