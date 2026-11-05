'use strict'
// Functional test of the expanded prototypes: page navigation, top-bar controls,
// fleet cards, the assistant page, the four agent tabs and the Android sheets.
const d = require('./cdp-driver.cjs')
const BASE = 'C:/Users/admin/AppData/Roaming/AutoClaw-oversea-official/accounts/ba207bd929e7ad7367272dfba67222768ae625cdd8b716878bf860274d23e71a/projects/Default/design'
const vis = "el => { if(!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }"

let fails = 0
async function check (cdp, label, expr) {
  let v
  try { v = await d.evaluate(cdp, expr) } catch (e) { v = 'ERR ' + String(e.message).slice(0, 60) }
  const ok = v === true
  if (!ok) fails++
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (ok ? '' : '  â†’ ' + JSON.stringify(v)))
}

;(async () => {
  // â”€â”€ server â”€â”€
  {
    await d.launch(); const cdp = await d.attach()
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1700, height: 980, deviceScaleFactor: 1, mobile: false })
    await cdp.send('Page.navigate', { url: 'file:///' + (BASE + '/server.html').replace(/\\/g, '/') })
    await new Promise(r => setTimeout(r, 900))
    console.log('â”€â”€ server.html')
    await check(cdp, 'four nav buttons', `document.querySelectorAll('.nav a[data-feature]').length === 4`)
    await check(cdp, 'nav buttons styled as pills', `getComputedStyle(document.querySelector('.nav a.on')).borderRadius !== '0px'`)
    await check(cdp, 'theme control in the top bar', `(${vis})(document.querySelector('[data-theme-btn="light"]'))`)
    await check(cdp, 'language control in the top bar', `(${vis})(document.querySelector('[data-lang-btn="en"]'))`)
    await check(cdp, 'fleet cards on overview', `document.querySelectorAll('#overview .fcard').length === 4`)
    await check(cdp, 'fleet card has actions', `document.querySelectorAll('#overview .fcard .acts button').length >= 6`)
    await check(cdp, 'ten pages exist', `document.querySelectorAll('.pg').length === 10`)
    // navigate to the assistant through the nav bar
    await d.evaluate(cdp, `document.querySelector('.nav a[data-tab="ai"]').click()`)
    await check(cdp, 'assistant page opens from the nav', `document.getElementById('ai').classList.contains('on')`)
    await check(cdp, 'assistant input visible', `(${vis})(document.querySelector('[data-feature="dash-ai-ask"]'))`)
    await check(cdp, 'assistant send visible', `(${vis})(document.querySelector('[data-feature="dash-ai-send"]'))`)
    await check(cdp, 'nav highlight follows the page', `document.querySelector('.nav a[data-tab="ai"]').classList.contains('on')`)
    // app menu â†’ settings page
    await d.evaluate(cdp, `document.querySelector('[data-feature="dash-app-menu"]').click()`)
    await check(cdp, 'menu opens', `document.getElementById('amenu').classList.contains('on')`)
    await check(cdp, 'menu lists four pages', `document.querySelectorAll('#amenu a[data-page]').length >= 4`)
    await d.evaluate(cdp, `document.querySelector('#amenu a[data-page="settings"]').click()`)
    await check(cdp, 'settings page opens from the menu', `document.getElementById('settings').classList.contains('on')`)
    await check(cdp, 'theme switches to dark', `(setTheme('dark'), !document.documentElement.classList.contains('light'))`)
    await check(cdp, 'theme switches back to light', `(setTheme('light'), document.documentElement.classList.contains('light'))`)
  }

  // â”€â”€ windows agent â”€â”€
  {
    await d.launch(); const cdp = await d.attach()
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 1, mobile: false })
    await cdp.send('Page.navigate', { url: 'file:///' + (BASE + '/windows-agent.html').replace(/\\/g, '/') })
    await new Promise(r => setTimeout(r, 900))
    console.log('â”€â”€ windows-agent.html')
    await check(cdp, 'theme control in the title bar', `(${vis})(document.querySelector('[data-theme-btn="light"]'))`)
    await check(cdp, 'language control in the title bar', `(${vis})(document.querySelector('[data-lang-btn="en"]'))`)
    await check(cdp, 'four tabs match the app', `[...document.querySelectorAll('.tabs button')].map(b => b.dataset.tab).join(',') === 'status,ai,chat,log'`)
    await d.evaluate(cdp, `showTab('ai')`)
    for (const id of ['ai-input', 'ai-send-btn', 'ai-hist-btn', 'ai-new-btn', 'ai-stop-btn', 'ai-collapse-btn']) {
      await check(cdp, 'AI tab: ' + id, `(${vis})(document.querySelector('[data-feature="${id}"]'))`)
    }
    await d.evaluate(cdp, `showTab('chat')`)
    for (const id of ['chat-input', 'chat-send-btn', 'chat-clear-btn', 'chat-popout-btn', 'chat-collapse-btn']) {
      await check(cdp, 'viewer-chat tab: ' + id, `(${vis})(document.querySelector('[data-feature="${id}"]'))`)
    }
    await check(cdp, 'viewer list is present', `document.querySelectorAll('#chat .item').length >= 2`)
    await d.evaluate(cdp, `showTab('log')`)
    await check(cdp, 'log tab: collapse', `(${vis})(document.querySelector('[data-feature="log-coll-btn"]'))`)
    await d.evaluate(cdp, `showTab('status')`)
    await check(cdp, 'status keeps the session/relay controls', `['session-device','session-pw','session-request-btn','offer-accept'].every(k => !!document.querySelector('[data-feature="'+k+'"]'))`)
    await check(cdp, 'session device value is plain text', `!/</.test(document.querySelector('[data-feature="session-device"]').value)`)
  }

  // â”€â”€ android â”€â”€
  {
    await d.launch(); const cdp = await d.attach()
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 460, height: 900, deviceScaleFactor: 1, mobile: true })
    await cdp.send('Page.navigate', { url: 'file:///' + (BASE + '/android.html').replace(/\\/g, '/') })
    await new Promise(r => setTimeout(r, 900))
    console.log('â”€â”€ android.html')
    await check(cdp, 'theme control in the header', `(${vis})(document.querySelector('[data-theme-btn="light"]'))`)
    await check(cdp, 'language control in the header', `(${vis})(document.querySelector('[data-lang-btn="en"]'))`)
    await check(cdp, 'four tabs match the app', `[...document.querySelectorAll('.tabs button')].map(b => b.dataset.tab).join(',') === 'status,ai,chat,log'`)
    await d.evaluate(cdp, `showTab('chat')`)
    await check(cdp, 'viewer-chat tab has input and send', `!!document.querySelector('[data-feature="and-chat-input"]') && !!document.querySelector('[data-feature="and-chat-send"]')`)
    await check(cdp, 'viewers list present', `document.querySelectorAll('#chat .item').length >= 2`)
    await d.evaluate(cdp, `showTab('ai')`)
    await check(cdp, 'ai tab has input and send', `!!document.querySelector('[data-feature="and-ai-input"]') && !!document.querySelector('[data-feature="and-ai-send"]')`)
    await d.evaluate(cdp, `showTab('status')`)
    await check(cdp, 'status keeps the approved controls', `['and-a11y-toggle','and-capture-toggle','and-session-request'].every(k => !!document.querySelector('[data-feature="'+k+'"]'))`)
    await check(cdp, 'session device value is plain text', `!/</.test(document.querySelector('[data-feature="and-session-device"]').value)`)
    await check(cdp, 'bottom bar keeps log/sessions/stop', `['and-log','and-sessions','and-stop'].every(k => !!document.querySelector('[data-feature="'+k+'"]'))`)
    await d.evaluate(cdp, `openSheet('sheet-setup')`)
    await check(cdp, 'setup sheet opens', `(${vis})(document.getElementById('sheet-setup'))`)
    await check(cdp, 'pairing controls present', `!!document.querySelector('[data-feature="and-pair-code"]') && !!document.querySelector('[data-feature="and-pair-btn"]')`)
    await d.evaluate(cdp, `closeSheet('sheet-setup'); openSheet('sheet-offer')`)
    await check(cdp, 'incoming offer sheet opens', `(${vis})(document.getElementById('sheet-offer'))`)
    await check(cdp, 'offer has accept and deny', `!!document.querySelector('[data-feature="and-offer-accept"]') && !!document.querySelector('[data-feature="and-offer-deny"]')`)
    await d.evaluate(cdp, `closeSheet('sheet-offer'); openSheet('sheet-session')`)
    await check(cdp, 'session view sheet opens', `(${vis})(document.getElementById('sheet-session'))`)
    await check(cdp, 'session has audio/record/end', `['and-session-audio','and-session-record','and-session-end'].every(k => !!document.querySelector('[data-feature="'+k+'"]'))`)
    await check(cdp, 'touch targets stay >= 44px', `[...document.querySelectorAll('.btn')].filter(b => b.getBoundingClientRect().height > 0).every(b => b.getBoundingClientRect().height >= 44)`)
    await check(cdp, 'segmented controls are >= 40px', `[...document.querySelectorAll('.seg2 button')].filter(b => b.getBoundingClientRect().height > 0).every(b => b.getBoundingClientRect().height >= 40)`)
    await check(cdp, 'icon buttons are 44px', `[...document.querySelectorAll('.iconbtn')].filter(b => b.getBoundingClientRect().height > 0).every(b => b.getBoundingClientRect().height >= 44)`)
    await check(cdp, 'no horizontal overflow', `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`)
  }

  console.log('\nRESULT=' + (fails ? 'FAIL(' + fails + ')' : 'PASS'))
  process.exit(fails ? 1 : 0)
})()


