'use strict'
// TC-003: preview/monitor-wall tiles must be read-only — no control toolbar, "view only" badge,
// and only open/remove actions per tile (D42). No control password needed.
const fs = require('fs')
const d = require('./cdp-driver.cjs')
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-04/control'

;(async () => {
  const report = []
  const log = (s) => { report.push(s); console.log(s) }
  const { child } = await d.launch()
  const cdp = await d.attach()
  try {
    await d.goto(cdp, d.BASE + '/login', 1500)
    await d.evaluate(cdp, `localStorage.setItem('airemote-auth', ${JSON.stringify(d.loadAuth())}); 'set'`)
    await d.goto(cdp, d.BASE + '/', 5000)

    let facts = null
    for (let i = 0; i < 12; i++) {
      await d.sleep(1000)
      facts = await d.evaluate(cdp, `(() => {
        const canvases = [...document.querySelectorAll('canvas')]
        const tiles = canvases.map(cv => {
          let el = cv
          for (let k = 0; k < 8 && el.parentElement; k++) el = el.parentElement
          return {
            canvas: cv.width + 'x' + cv.height,
            viewOnlyBadge: /عرض فقط/.test(el.innerText || ''),
            buttons: [...el.querySelectorAll('button')].map(b => (b.title || b.getAttribute('aria-label') || b.innerText || '').replace(/\\s+/g,' ').trim()).filter(Boolean),
            dataTb: el.querySelectorAll('[data-tb="1"]').length
          }
        })
        return {
          canvases: canvases.length,
          tiles,
          pageText: document.body.innerText.replace(/\\s+/g,' ').slice(0, 200),
          viewOnlyHits: (document.body.innerText.match(/عرض فقط/g) || []).length
        }
      })()`)
      if (facts.canvases > 1) break
      if (i === 2) {
        // no live tile yet: add one from the monitor wall
        const added = await d.evaluate(cdp, `(() => {
          const b = [...document.querySelectorAll('button')].find(x => /إضافة بث/.test((x.title||'') + (x.innerText||'')))
          if (!b) return 'no-add-button'
          b.click(); return 'clicked'
        })()`)
        log('ADD_TILE=' + added)
      }
    }
    log('CANVASES=' + facts.canvases)
    log('VIEW_ONLY_TEXT_HITS=' + facts.viewOnlyHits)
    facts.tiles.slice(0, 6).forEach((t, i) => {
      log('TILE' + (i + 1) + ' canvas=' + t.canvas + ' dataTb=' + t.dataTb + ' badge=' + t.viewOnlyBadge + ' buttons=[' + t.buttons.join(' / ') + ']')
    })
    const totalDataTb = facts.tiles.reduce((n, t) => n + t.dataTb, 0)
    const allBadge = facts.tiles.length > 0 && facts.tiles.every(t => t.viewOnlyBadge)
    log('TOTAL_DATA_TB_IN_TILES=' + totalDataTb)
    log('VERDICT_TC003=' + (facts.canvases > 0 && totalDataTb === 0 ? 'PASS (no control toolbar in preview tiles)' : 'FAIL'))
    log('VERDICT_BADGE=' + (allBadge ? 'PASS (view-only badge on every tile)' : 'PARTIAL (badge missing on some tiles)'))
    log('PAGE_TEXT=' + facts.pageText)
    log('SHOT=' + await d.shot(cdp, 'overview-monitor-wall.png'))
    fs.mkdirSync(OUT, { recursive: true })
    fs.writeFileSync(OUT + '/tc-003-report.txt', report.join('\n') + '\n', 'utf8')
    console.log('REPORT=' + OUT + '/tc-003-report.txt')
  } finally { cdp.close(); try { child.kill() } catch {} }
})().catch(e => { console.log('ERR ' + e.message); process.exit(1) })
