'use strict'
// Functional test for the controls that were added after the per-file parity audit:
// app menu (nav-ai, dash-settings, dash-help), AI bar (dash-ai-ask/send),
// view-all link, the 4th agent tab (chat + assistant) and log-coll-btn.
const d = require('./cdp-driver.cjs')
const BASE = 'C:/Users/admin/AppData/Roaming/AutoClaw-oversea-official/accounts/ba207bd929e7ad7367272dfba67222768ae625cdd8b716878bf860274d23e71a/projects/Default/design'

const visible = "el => { if(!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }"

async function check (cdp, label, expr) {
  const v = await d.evaluate(cdp, expr)
  console.log((v ? 'PASS' : 'FAIL') + '  ' + label + (typeof v === 'boolean' ? '' : '  → ' + JSON.stringify(v)))
  return v === true
}

;(async () => {
  let fails = 0

  // ── server ──
  {
    const { child } = await d.launch()
    const cdp = await d.attach()
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1700, height: 980, deviceScaleFactor: 1, mobile: false })
    await cdp.send('Page.navigate', { url: 'file:///' + (BASE + '/server.html').replace(/\\/g, '/') })
    await new Promise(r => setTimeout(r, 900))

    console.log('── server.html')
    if (!await check(cdp, 'menu hidden by default', `!document.getElementById('amenu').classList.contains('on')`)) fails++
    await d.evaluate(cdp, `document.querySelector('[data-feature="dash-app-menu"]').click()`)
    if (!await check(cdp, 'menu opens on click', `document.getElementById('amenu').classList.contains('on') && (${visible})(document.getElementById('amenu'))`)) fails++
    for (const id of ['nav-ai', 'dash-settings', 'dash-help']) {
      if (!await check(cdp, 'menu item visible: ' + id, `(${visible})(document.querySelector('[data-feature="${id}"]'))`)) fails++
    }
    if (!await check(cdp, 'view-all visible', `(${visible})(document.querySelector('[data-feature="dash-view-all-devices"]'))`)) fails++
    if (!await check(cdp, 'ai bar hidden by default', `!document.getElementById('aibar').classList.contains('on')`)) fails++
    await d.evaluate(cdp, `document.querySelector('[data-feature="nav-ai"]').click()`)
    if (!await check(cdp, 'ai bar opens from menu', `document.getElementById('aibar').classList.contains('on') && (${visible})(document.getElementById('aibar'))`)) fails++
    if (!await check(cdp, 'ai ask field visible', `(${visible})(document.querySelector('[data-feature="dash-ai-ask"]'))`)) fails++
    if (!await check(cdp, 'ai send visible', `(${visible})(document.querySelector('[data-feature="dash-ai-send"]'))`)) fails++
    if (!await check(cdp, 'width still 1644', `Math.round(document.querySelector('.board').getBoundingClientRect().width) === 1644`)) fails++
    // click outside closes the menu
    await d.evaluate(cdp, `document.body.click()`)
    if (!await check(cdp, 'menu closes on outside click', `!document.getElementById('amenu').classList.contains('on')`)) fails++
  }

  // ── windows agent ──
  {
    const { child } = await d.launch()
    const cdp = await d.attach()
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 1, mobile: false })
    await cdp.send('Page.navigate', { url: 'file:///' + (BASE + '/windows-agent.html').replace(/\\/g, '/') })
    await new Promise(r => setTimeout(r, 900))

    console.log('── windows-agent.html')
    await d.evaluate(cdp, `showTab('session')`)
    if (!await check(cdp, 'session tab becomes visible', `document.getElementById('session').classList.contains('on')`)) fails++
    const ids = ['chat-collapse-btn', 'chat-popout-btn', 'chat-clear-btn', 'chat-send-btn', 'chat-input',
      'ai-hist-btn', 'ai-new-btn', 'ai-stop-btn', 'ai-collapse-btn', 'ai-send-btn', 'ai-input']
    for (const id of ids) {
      if (!await check(cdp, 'in session tab: ' + id, `(${visible})(document.querySelector('[data-feature="${id}"]'))`)) fails++
    }
    await d.evaluate(cdp, `showTab('ctrl')`)
    if (!await check(cdp, 'log-coll-btn visible on ctrl tab', `(${visible})(document.querySelector('[data-feature="log-coll-btn"]'))`)) fails++
    if (!await check(cdp, 'width still 560', `Math.round(document.querySelector('.board').getBoundingClientRect().width) === 560`)) fails++
  }

  console.log('\nRESULT=' + (fails ? 'FAIL(' + fails + ')' : 'PASS'))
  process.exit(fails ? 1 : 0)
})()
