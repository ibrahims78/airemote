'use strict'
// TC-003/004: a real VIEW-ONLY relay session (access='view').
// TC-003: control tools hidden + "view only" badge. TC-004: input attempt rejected.
// The view ticket stays inside this process — it is never printed.
const d = require('./cdp-driver.cjs')
const REPO = 'D:/autoclaw projects-new/AiRemote'
const lab = require(REPO + '/tools/lab/lab.cjs')
const vm = require(REPO + '/tools/lab/a2a/vmguest.cjs')
const fs = require('fs')

const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const WIN11 = 'd147684b-2451-4418-a628-86f11aa66a4e'
const OUT = REPO + '/outputs/verify-2026-11-04/control'
const DUMP = OUT + '/scripts/dump-inputlog.ps1'

fs.writeFileSync(DUMP, [
  '$ErrorActionPreference = "Continue"',
  '$p = "C:\\Users\\admin\\input-worker.log"',
  '$o = "C:\\Users\\admin\\dump-inputlog.out.txt"',
  '$out = @()',
  'if (Test-Path $p) { $all = @(Get-Content $p); $out += ("COUNT=" + $all.Count); $out += ($all | Select-Object -Last 6) } else { $out += "MISSING" }',
  '$out | Set-Content -Encoding ASCII $o'
].join('\r\n'), 'utf8')
const logCount = () => {
  const out = String(vm.ps('win10', DUMP, 'dump-inputlog.ps1') || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  return Number((out.find(l => l.startsWith('COUNT=')) || 'COUNT=0').slice(6))
}
const devToken = (id) => {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token
  db.close(); return t
}
const post = async (p, body, headers = {}) => {
  const r = await fetch(d.BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

;(async () => {
  const report = []
  const log = (s) => { report.push(s); console.log(s) }
  const before = logCount()
  log('GUEST_LOG_COUNT_BEFORE=' + before)

  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    }
  }

  const rq = await post('/api/relay/request', { targetDeviceId: WIN10, access: 'view', requesterDeviceId: WIN11 }, { 'X-Device-Token': devToken(WIN11) })
  log('REQUEST=' + rq.status + ' sid=' + (rq.json.sessionId || rq.json.code || ''))
  if (rq.status !== 201) { log('VERDICT=BLOCKED (view session refused)'); throw new Error('relay request ' + rq.status) }
  const sid = rq.json.sessionId

  await d.sleep(1200)
  const dec = await lab.api('/api/relay/' + sid + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  log('DECISION=' + dec.status + ' state=' + (dec.json && dec.json.state))
  await d.sleep(800)

  const vt = await post('/api/relay/' + sid + '/view-ticket', {}, { 'X-Device-Token': devToken(WIN11) })
  if (vt.status !== 200 && vt.status !== 201) { log('VIEW_TICKET_STATUS=' + vt.status); throw new Error('no view ticket') }
  const viewUrl = vt.json.viewUrl || vt.json.url
  log('VIEW_URL_PATH=' + String(viewUrl).split('?')[0])

  const { child } = await d.launch()
  const cdp = await d.attach()
  try {
    await d.goto(cdp, d.BASE + String(viewUrl), 9000)
    let s = null
    for (let i = 0; i < 12; i++) {
      await d.sleep(1000)
      s = await d.evaluate(cdp, `(() => ({
        canvas: !!document.querySelector('canvas'),
        viewOnlyBadge: /عرض فقط/.test(document.body.innerText),
        dataTb: [...document.querySelectorAll('[data-tb="1"]')].length,
        controls: [...document.querySelectorAll('[data-tb="1"]')].map(e => e.title || '').filter(Boolean),
        text: document.body.innerText.replace(/\\s+/g,' ').slice(0, 220)
      }))()`)
      if (s.canvas) break
    }
    log('CANVAS=' + s.canvas)
    log('VIEW_ONLY_BADGE=' + s.viewOnlyBadge)
    log('TOOLBAR_DATA_TB=' + s.dataTb + ' [' + s.controls.join(' | ') + ']')
    log('VIEWER_TEXT=' + s.text)
    // open the More menu to see whether keyboard/text controls are hidden too
    const more = await d.evaluate(cdp, `(() => {
      const b = [...document.querySelectorAll('[data-tb="1"]')].find(e => /المزيد/.test((e.title||'') + (e.innerText||'')))
      if (!b) return 'no-more'
      b.click(); return 'clicked'
    })()`)
    await d.sleep(900)
    const menu = await d.evaluate(cdp, `(() => {
      const items = [...document.querySelectorAll('button')].map(b => ((b.title||'') + ' ' + (b.innerText||'')).replace(/\\s+/g,' ').trim()).filter(Boolean)
      const hits = items.filter(t => /لوحة المفاتيح|إرسال نص|التحكم عن بُعد|وضع الكيبورد|نص إلى الجهاز/.test(t))
      return { moreClicked: true, controlHits: hits, menuSample: items.slice(-14) }
    })()`)
    log('MORE=' + more)
    log('FORBIDDEN_CONTROLS_IN_MENU=' + (menu.controlHits.length ? menu.controlHits.join(' | ') : 'none'))
    log('MENU_SAMPLE=' + menu.menuSample.join(' / '))
    log('SHOT=' + await d.shot(cdp, 'view-only-session.png'))

    // TC-004: try to send input anyway
    const rect = await d.evaluate(cdp, `(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 } })()`)
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
      await d.sleep(120)
    }
    await d.sleep(2500)
    const after = logCount()
    log('GUEST_LOG_COUNT_AFTER=' + after)
    log('INPUT_REACHED_AGENT=' + (after > before))
    log('VERDICT_TC003=' + (s.canvas && s.viewOnlyBadge && s.dataTb === 9 && menu.controlHits.length === 0 ? 'PASS' : 'CHECK') + ' (badge=' + s.viewOnlyBadge + ' toolbarBtns=' + s.dataTb + ' forbiddenInMenu=' + menu.controlHits.length + ')')
    log('VERDICT_TC004=' + (after === before ? 'PASS (input never reached the agent)' : 'FAIL (input leaked)'))
    log('SHOT_AFTER=' + await d.shot(cdp, 'view-only-after-input.png'))
    fs.mkdirSync(OUT, { recursive: true })
    fs.writeFileSync(OUT + '/tc-003-004-report.txt', report.join('\n') + '\n', 'utf8')
    console.log('REPORT=' + OUT + '/tc-003-004-report.txt')
  } finally {
    cdp.close(); try { child.kill() } catch {}
    await lab.api('/api/relay/' + sid + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {})
  }
})().catch(e => { console.log('ERR ' + e.message); process.exit(1) })
