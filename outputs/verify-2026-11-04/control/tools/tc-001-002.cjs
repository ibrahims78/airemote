'use strict'
// TC-001/002: open the screen tab, right-click the canvas, prove the agent got a RIGHT click
// and that no LEFT click followed (the 3.13.0 regression guard), plus screenshots.
const fs = require('fs')
const path = require('path')
const d = require('./cdp-driver.cjs')

const REPO = 'D:/autoclaw projects-new/AiRemote'
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const OUT = REPO + '/outputs/verify-2026-11-04/control'

const vm = require(REPO + '/tools/lab/a2a/vmguest.cjs')

const DUMP = REPO + '/outputs/verify-2026-11-04/control/scripts/dump-inputlog.ps1'
fs.writeFileSync(DUMP, [
  '$ErrorActionPreference = "Continue"',
  '$p = "C:\\Users\\admin\\input-worker.log"',
  '$o = "C:\\Users\\admin\\dump-inputlog.out.txt"',
  '$out = @()',
  'if (Test-Path $p) { $all = @(Get-Content $p); $out += ("COUNT=" + $all.Count); $out += ($all | Select-Object -Last 30) } else { $out += "MISSING" }',
  '$out | Set-Content -Encoding ASCII $o'
].join('\r\n'), 'utf8')

function lines (txt) { return String(txt || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean) }

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const report = []
  const log = (s) => { report.push(s); console.log(s) }

  const before = lines(vm.ps('win10', DUMP, 'dump-inputlog.ps1'))
  const countBefore = Number((before.find(l => l.startsWith('COUNT=')) || 'COUNT=0').slice(6))
  log('GUEST_LOG_COUNT_BEFORE=' + countBefore)

  const { child } = await d.launch()
  const cdp = await d.attach()
  try {
    await d.goto(cdp, d.BASE + '/login', 1800)
    await d.evaluate(cdp, `localStorage.setItem('airemote-auth', ${JSON.stringify(d.loadAuth())}); 'set'`)
    await d.goto(cdp, d.BASE + '/devices/' + WIN10, 3500)

    const tab = await d.evaluate(cdp, `(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.innerText||'').trim() === 'الشاشة')
      if (!b) return 'no-tab'
      b.click(); return 'clicked'
    })()`)
    log('SCREEN_TAB=' + tab)

    const started = await d.evaluate(cdp, `(() => {
      const b = [...document.querySelectorAll('button')].find(x => /بدء مشاركة الشاشة|بدء البث/.test((x.innerText||'').trim()))
      if (!b) return 'no-start-button'
      b.click(); return 'clicked'
    })()`)
    log('START_BUTTON=' + started)

    let state = null
    for (let i = 0; i < 20; i++) {
      await d.sleep(1000)
      state = await d.evaluate(cdp, `(() => {
        const cv = document.querySelector('canvas')
        const tb = [...document.querySelectorAll('[data-tb="1"]')].map(e => e.title || e.getAttribute('aria-label') || '').filter(Boolean)
        return {
          canvas: cv ? { w: cv.width, h: cv.height, cw: cv.clientWidth, ch: cv.clientHeight } : null,
          toolbar: tb,
          bodyText: document.body.innerText.replace(/\\s+/g,' ').slice(0, 160)
        }
      })()`)
      if (state.canvas && state.toolbar.length >= 8) break
    }
    log('CANVAS=' + JSON.stringify(state.canvas))
    log('TOOLBAR_COUNT=' + (state.toolbar ? state.toolbar.length : 0))
    log('TOOLBAR=' + (state.toolbar || []).join(' | '))
    log('SHOT_STREAM=' + await d.shot(cdp, 'stream-before-rightclick.png'))

    if (!state.canvas) { throw new Error('no canvas — stream never started') }

    // enable remote control (D40: needs a control session; the agent may prompt on the guest)
    const ctl = await d.evaluate(cdp, `(() => {
      const b = [...document.querySelectorAll('button')].find(x => /تفعيل التحكم/.test((x.innerText||'').trim()))
      if (!b) return 'no-control-button'
      b.click(); return 'clicked'
    })()`)
    log('CONTROL_BUTTON=' + ctl)
    await d.sleep(6000)
    const s2 = await d.evaluate(cdp, `(() => ({
      toolbar: [...document.querySelectorAll('[data-tb="1"]')].map(e => e.title || e.getAttribute('aria-label') || '').filter(Boolean),
      text: document.body.innerText.replace(/\s+/g,' ').slice(-200),
      pwModal: !!document.querySelector('input[type=password]')
    }))()`)
    log('AFTER_CONTROL_TOOLBAR=' + s2.toolbar.join(' | '))
    log('AFTER_CONTROL_TEXT=' + s2.text)
    log('PASSWORD_MODAL=' + s2.pwModal)
    log('SHOT_CONTROL=' + await d.shot(cdp, 'after-control-click.png'))

    const rect = await d.evaluate(cdp, `(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`)
    const cx = Math.round(rect.x + rect.w / 2)
    const cy = Math.round(rect.y + rect.h / 2)
    log('CLICK_AT=' + cx + ',' + cy)

    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', {
        type, x: cx, y: cy, button: 'right', buttons: type === 'mousePressed' ? 2 : 0, clickCount: 1
      })
      await d.sleep(120)
    }
    await d.sleep(2200)
    log('SHOT_AFTER=' + await d.shot(cdp, 'stream-after-rightclick.png'))

    const after = lines(vm.ps('win10', DUMP, 'dump-inputlog.ps1'))
    const countAfter = Number((after.find(l => l.startsWith('COUNT=')) || 'COUNT=0').slice(6))
    log('GUEST_LOG_COUNT_AFTER=' + countAfter)
    const newLines = after.filter(l => /^\d\d:\d\d:\d\d\.\d\d\d/.test(l))
    log('NEW_LINES=' + newLines.length)
    newLines.slice(-12).forEach(l => log('  LOG ' + l))

    const rightHits = newLines.filter(l => /\sC R\s/.test(l) || /\sB R\s/.test(l) || /\sE R\s/.test(l))
    const leftHits = newLines.filter(l => /\sC L\s/.test(l) || /\sB L\s/.test(l) || /\sE L\s/.test(l))
    log('RIGHT_CLICK_EVENTS=' + rightHits.length)
    log('LEFT_CLICK_EVENTS=' + leftHits.length)
    log('VERDICT_TC001=' + (rightHits.length > 0 ? 'PASS (right button reached the agent)' : 'FAIL'))
    log('VERDICT_TC002=' + (leftHits.length === 0 ? 'PASS (no left click followed)' : 'FAIL (left click leaked)'))

    fs.writeFileSync(OUT + '/tc-001-002-report.txt', report.join('\n') + '\n', 'utf8')
  } finally {
    cdp.close(); try { child.kill() } catch {}
  }
  console.log('REPORT=' + OUT + '/tc-001-002-report.txt')
})().catch(e => { console.log('ERR ' + e.message); process.exit(1) })
