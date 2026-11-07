#!/usr/bin/env node
'use strict'
/**
 * probe-agent-live.cjs — drive the real Windows agent window and report what it shows.
 *
 * The renderer is opened by Electron itself (preload bridge present), so this sees the
 * same code path the shipped app runs. It records every exception/console error, then
 * reads the live UI: the status card label, the connection fields, whether each
 * accordion opens, and whether every tab actually activates.
 *
 * Usage: node scripts/probe-agent-live.cjs <out-dir> [--port 9333]
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const APP_DIR = path.join(ROOT, 'packages', 'agent-desktop')
const ELECTRON = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe')

const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'outputs', 'probe-agent-live'))
const exeArg = (() => { const i = process.argv.indexOf('--exe'); return i > 0 ? process.argv[i + 1] : null })()
const portArg = process.argv.indexOf('--port')
const PORT = portArg > 0 ? Number(process.argv[portArg + 1]) : 9333
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

if (!exeArg && !fs.existsSync(ELECTRON)) {
  console.error('electron binary missing: ' + ELECTRON)
  process.exit(1)
}
fs.mkdirSync(outDir, { recursive: true })

// optional: seed the isolated profile so the agent boots straight into a connection
const argOf = (name) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : null }
const seedServer = argOf('server')
const seedToken = argOf('token') || 'probe-token'
const seedAuto = process.argv.includes('--auto')

function cdpClient (wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const events = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
    if (m.method) events.push(m)
  }
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
  return { ready, send, events, close: () => ws.close() }
}

const SNAPSHOT_JS = `(() => {
  const q = (s) => document.querySelector(s);
  const txt = (s) => { const e = q(s); return e ? (e.textContent || '').trim() : null };
  const vis = (s) => { const e = q(s); if (!e) return 'MISSING';
    const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
    return { display: cs.display, visibility: cs.visibility, h: Math.round(r.height), cls: e.className } };
  return {
    statusLabel: txt('#status-label'),
    statusSub: txt('#status-sub'),
    titleState: txt('#title-state-lbl'),
    titleHost: txt('#title-host'),
    statusCardClass: (q('#status-card') || {}).className || 'MISSING',
    toggleBtnText: txt('#toggle-btn'),
    toggleBtnClass: (q('#toggle-btn') || {}).className || 'MISSING',
    connStrip: vis('#conn-strip'),
    stripServer: txt('#strip-server'),
    infServer: txt('#inf-server'),
    infDevid: txt('#inf-devid'),
    secSettings: vis('#sec-settings'),
    bodySettings: vis('#body-settings'),
    settingsTitle: txt('#sec-settings .sec-hdr span'),
    tabs: [...document.querySelectorAll('#tabbar .tab-btn')].map(b => ({
      tab: b.dataset.tab, active: b.classList.contains('active'), label: (b.textContent || '').trim()
    })),
    activePane: (q('.tab-pane.active') || {}).id || 'NONE',
    footerVer: txt('#footer-ver'),
    brandVer: txt('.brand-version'),
    logEntries: document.querySelectorAll('#log-box .log-line, #log-box .log-row').length,
    ctrlPanel: (() => {
      const p = q('#panel-ctrl'); if (!p) return null;
      const rs = p.getBoundingClientRect();
      const body = q('#body-settings');
      const inner = q('#settings-inner');
      return {
        h: Math.round(rs.height), w: Math.round(rs.width),
        bg: getComputedStyle(p).backgroundColor,
        body: body ? { h: Math.round(body.getBoundingClientRect().height), scrollH: body.scrollHeight, clientH: body.clientHeight, overflow: getComputedStyle(body).overflow, maxH: getComputedStyle(body).maxHeight } : null,
        inner: inner ? { h: Math.round(inner.getBoundingClientRect().height), scrollH: inner.scrollHeight } : null,
        pane: (() => { const pn = q('#tab-status'); return pn ? { h: Math.round(pn.getBoundingClientRect().height), scrollH: pn.scrollHeight, clientH: pn.clientHeight } : null })(),
        visible: rs.height > 0 && rs.bottom <= (q('#tab-status') || document.body).getBoundingClientRect().bottom + 2,
        kids: [...p.children].map(el => {
          const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
          return { tag: el.tagName.toLowerCase(), id: el.id || '', cls: String(el.className || '').slice(0, 24),
                   y: Math.round(r.y + scrollY), h: Math.round(r.height), display: cs.display,
                   color: cs.color, text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48) };
        })
      };
    })()
  };
})()`

;(async () => {
  const userDir = path.join(require('os').tmpdir(), 'airemote-probe-' + Date.now())
  if (seedServer) {
    fs.mkdirSync(userDir, { recursive: true })
    fs.writeFileSync(path.join(userDir, 'airemote-config.json'), JSON.stringify({
      serverUrl: seedServer, token: seedToken, autoStart: !!seedAuto, startMinimized: false, _winBounds: null
    }, null, 2), 'utf8')
  }
  const child = exeArg
    ? spawn(path.resolve(exeArg), ['--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir], { cwd: path.dirname(path.resolve(exeArg)), stdio: 'ignore', detached: false })
    : spawn(ELECTRON, ['.', '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir], {
      cwd: APP_DIR, stdio: 'ignore', detached: false
    })

  let target = null
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(300)
    try {
      const list = await fetch('http://127.0.0.1:' + PORT + '/json/list').then(r => r.json())
      target = list.find(t => t.type === 'page' && /index\.html/.test(t.url))
    } catch {}
  }
  if (!target) {
    try { child.kill() } catch {}
    console.error('no CDP target — is another AiRemote Agent already running (single-instance lock)?')
    process.exit(2)
  }

  const c = cdpClient(target.webSocketDebuggerUrl)
  await c.ready
  await c.send('Runtime.enable')
  await c.send('Log.enable')
  await c.send('Page.enable')

  // real window resize (no emulation): emulation ghosts layers when the surface is smaller
  const rsArg = argOf('resize')
  if (rsArg) {
    const m = /^(\d+)x(\d+)$/.exec(rsArg)
    if (m) {
      const win = await c.send('Browser.getWindowForTarget', { targetId: target.id })
      const windowId = win.result && win.result.windowId
      if (windowId) {
        await c.send('Browser.setWindowBounds', { windowId, bounds: { width: Number(m[1]), height: Number(m[2]), windowState: 'normal' } })
        await sleep(900)
      }
    }
  }
  await sleep(4500)

  const evalJson = async (expr) => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.result && r.result.exceptionDetails) return { __error: r.result.exceptionDetails.text }
    return r.result && r.result.result ? r.result.result.value : null
  }

  const before = await evalJson(SNAPSHOT_JS)

  if (process.argv.includes('--pure')) {
    // no clicks, no scrolling: exactly what the user sees when the window opens
    await sleep(2500)
    const pureShot = await c.send('Page.captureScreenshot', { format: 'png' })
    if (pureShot.result && pureShot.result.data) {
      fs.writeFileSync(path.join(outDir, 'agent-pure.png'), Buffer.from(pureShot.result.data, 'base64'))
    }
    fs.writeFileSync(path.join(outDir, 'pure.json'), JSON.stringify({ dpr: await evalJson('devicePixelRatio'), innerW: await evalJson('innerWidth'), ui: before }, null, 2), 'utf8')
    const ex = c.events.filter(e => e.method === 'Runtime.exceptionThrown').length
    console.log(JSON.stringify({ pure: true, exceptions: ex, status: before.statusLabel, settings: before.secSettings && before.secSettings.cls, bodyH: before.bodySettings && before.bodySettings.h }, null, 2))
    c.close(); try { child.kill() } catch {}
    await sleep(300)
    process.exit(0)
  }

  // optional deep style dump of one subtree: node scripts/probe-agent-live.cjs out --dom '#panel-ctrl'
  const domSel = argOf('dom')
  const evalJs = argOf('eval')
  if (evalJs) {
    const value = await evalJson(evalJs)
    console.log(JSON.stringify({ eval: evalJs, value }, null, 2))
    const ex = c.events.filter(e => e.method === 'Runtime.exceptionThrown').length
    if (ex) console.log(JSON.stringify({ exceptions: ex, first: c.events.find(e => e.method === 'Runtime.exceptionThrown').params.exceptionDetails.text }))
    c.close(); try { child.kill() } catch {}
    await sleep(300)
    process.exit(0)
  }
  if (domSel) {
    const deep = await evalJson(`(() => {
      const root = document.querySelector(${JSON.stringify('')} + ${JSON.stringify(domSel)});
      if (!root) return { error: 'not found' };
      const dump = (el, depth) => {
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        const o = { tag: el.tagName.toLowerCase(), id: el.id || '', cls: String(el.className || '').slice(0, 30),
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          display: cs.display, visibility: cs.visibility, opacity: cs.opacity, color: cs.color,
          bg: cs.backgroundColor, transform: cs.transform, filter: cs.filter, clipPath: cs.clipPath,
          position: cs.position, z: cs.zIndex, overflow: cs.overflow,
          text: (el.childElementCount === 0 ? (el.textContent || '').trim().slice(0, 40) : '') };
        if (depth > 0) o.kids = [...el.children].map(k => dump(k, depth - 1));
        return o;
      };
      const rootRect = root.getBoundingClientRect();
      const probePoint = document.elementFromPoint(Math.round(rootRect.x + rootRect.width / 2), Math.round(rootRect.y + Math.min(80, rootRect.height / 2)));
      return { matches: document.querySelectorAll(${JSON.stringify(domSel)}).length, tree: dump(root, 2),
               elementAtMiddle: probePoint ? probePoint.tagName + '#' + (probePoint.id || '') + '.' + String(probePoint.className || '').slice(0, 24) : null };
    })()`)
    fs.writeFileSync(path.join(outDir, 'dom-dump.json'), JSON.stringify(deep, null, 2), 'utf8')
    console.log(JSON.stringify(deep, null, 2).slice(0, 6000))
    c.close(); try { child.kill() } catch {}
    await sleep(300)
    process.exit(0)
  }

  // interaction: close the accordion first, then open it the way a user does
  const clickSettings = await evalJson(`(() => {
    const sec = document.querySelector('#sec-settings');
    const h = sec ? sec.querySelector('.sec-hdr') : null;
    if (!h) return 'NO_HEADER';
    sec.classList.add('collapsed');
    const closedH = sec.querySelector('#body-settings').getBoundingClientRect().height;
    h.click();
    const body = sec.querySelector('#body-settings');
    return { forceClosedH: Math.round(closedH), openedAfterClick: !sec.classList.contains('collapsed'),
             bodyH: Math.round(body.getBoundingClientRect().height) };
  })()`)
  await sleep(400)
  const afterSettings = await evalJson(SNAPSHOT_JS)

  // interaction: switch through every tab
  const tabWalk = []
  for (const name of ['status', 'ai', 'viewers', 'log']) {
    const r = await evalJson(`(() => {
      const b = document.querySelector('#tabbar .tab-btn[data-tab="${name}"]');
      if (!b) return { name: "${name}", error: 'NO_BUTTON' };
      b.click();
      const pane = document.getElementById('tab-${name}');
      return { name: "${name}", active: b.classList.contains('active'),
               paneActive: pane ? pane.classList.contains('active') : 'NO_PANE',
               paneH: pane ? Math.round(pane.getBoundingClientRect().height) : null };
    })()`)
    tabWalk.push(r)
  }

  const trace = (m) => { if (process.env.PROBE_TRACE) { try { fs.appendFileSync(path.join(outDir, 'trace.log'), '[trace] ' + m + '\n') } catch {} } }

  if (process.argv.includes('--audit')) {
    // 6.5 — one click per clickable button. The page is reloaded before every click and the
    // button is addressed by its index among the visible buttons, so neither a rebuild of the
    // surface nor a language reset between loads can make it vanish.
    const TABS = ['status', 'ai', 'viewers', 'log']
    const DESTRUCTIVE = /(delete|remove|clear|block|sign\s*out|log\s*out|stop|disconnect|terminate|quit|uninstall|exit|حذف|مسح|إزالة|حجب|خروج|إيقاف|قطع|فصل|إنهاء|إلغاء)/i
    const VIS = "const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0 }"
    const ENUM = `(() => {
      ${VIS}
      return [...document.querySelectorAll('button')].filter(vis).map(b => ({
        label: (b.getAttribute('aria-label') || b.textContent || b.title || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        title: (b.getAttribute('title') || '').slice(0, 40),
        id: b.id || '',
        cls: String(b.className || '').slice(0, 40),
        disabled: !!b.disabled
      }))
    })()`
    const CLICK = (idx) => `(() => {
      ${VIS}
      const all = [...document.querySelectorAll('button')].filter(vis)
      const b = all[${idx}]
      if (!b) return { found: false, visible: all.length }
      try { b.click() } catch (e) { return { found: true, threw: String((e && e.message) || e) } }
      return { found: true, labelAt: (b.getAttribute('aria-label') || b.textContent || b.title || '').trim().replace(/\s+/g, ' ').slice(0, 60) }
    })()`
    const openTab = (tabName) => evalJson(`(() => { const b = document.querySelector('#tabbar .tab-btn[data-tab="${tabName}"]'); if (b) b.click(); return 1 })()`)
    const exCount = () => c.events.filter(e => e.method === 'Runtime.exceptionThrown').length
    const boot = async (tabName) => {
      await c.send('Page.reload', { ignoreCache: false })
      await sleep(3400)
      await openTab(tabName)
      await sleep(950)
    }

    const rows = []
    for (const tabName of TABS) {
      await boot(tabName)
      const list = (await evalJson(ENUM)) || []
      const picks = []
      list.forEach((item, idx) => {
        const chrome = /^(btn-min|btn-tray|btn-close)$/.test(item.id)
        if (item.disabled || chrome || DESTRUCTIVE.test(item.label + ' ' + item.title)) {
          rows.push({ tab: tabName, idx, ...item, skipped: true, reason: item.disabled ? 'disabled' : chrome ? 'window-chrome' : 'destructive' })
          return
        }
        picks.push({ idx, item })
      })
      trace(tabName + ' candidates ' + picks.length)
      for (const pick of picks) {
        await boot(tabName)
        const before = exCount()
        const res = await evalJson(CLICK(pick.idx))
        await sleep(320)
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
        await sleep(120)
        rows.push({ tab: tabName, idx: pick.idx, ...pick.item, ...res, exceptions: exCount() - before })
        trace('click ' + tabName + '#' + pick.idx + ' ' + JSON.stringify(res))
      }
    }

    const all = c.events.filter(e => e.method === 'Runtime.exceptionThrown')
    const clickedRows = rows.filter(r => !r.skipped)
    const summary = {
      mode: 'strict-by-index (reload before each click)',
      buttons: rows.length,
      candidates: clickedRows.length,
      clicked: clickedRows.filter(r => r.found && r.labelAt).length,
      vanished: clickedRows.filter(r => !r.found).length,
      mismatched: clickedRows.filter(r => r.found && r.labelAt && r.labelAt.slice(0, 18) !== (r.label || '').slice(0, 18)).length,
      skipped: rows.filter(r => r.skipped).length,
      skippedReasons: rows.filter(r => r.skipped).reduce((m, r) => { m[r.reason] = (m[r.reason] || 0) + 1; return m }, {}),
      threw: clickedRows.filter(r => r.threw).length,
      exceptions: all.length,
      exceptionList: all.map(e => e.params.exceptionDetails.text + ' @ ' + (e.params.exceptionDetails.url || '')).slice(0, 25),
      perTab: TABS.map(t => ({ tab: t, candidates: rows.filter(r => r.tab === t && !r.skipped).length, clicked: rows.filter(r => r.tab === t && !r.skipped && r.found && r.labelAt).length })),
      rows
    }
    fs.writeFileSync(path.join(outDir, 'agent-audit.json'), JSON.stringify(summary, null, 2), 'utf8')
    console.log(JSON.stringify({ audit: summary.mode, buttons: summary.buttons, candidates: summary.candidates, clicked: summary.clicked, vanished: summary.vanished, mismatched: summary.mismatched, skipped: summary.skipped, threw: summary.threw, exceptions: summary.exceptions }))
  }

  // back to the status tab and take a picture
  await evalJson(`(() => { const b = document.querySelector('#tabbar .tab-btn[data-tab="status"]'); if (b) b.click(); return 1 })()`)
  await evalJson(`(() => {
    const sec = document.querySelector('#sec-settings');
    const h = sec ? sec.querySelector('.sec-hdr') : null;
    if (sec && h && sec.classList.contains('collapsed')) h.click();
    return sec ? !sec.classList.contains('collapsed') : null;
  })()`)
  await sleep(1500)   // let the accordion's max-height transition and the repaint settle before capturing
  const shot = await c.send('Page.captureScreenshot', { format: 'png' })
  if (shot.result && shot.result.data) {
    fs.writeFileSync(path.join(outDir, 'agent-live.png'), Buffer.from(shot.result.data, 'base64'))
  }

  // close-up of the settings section, so an empty panel cannot hide in a full-window shot
  const rect = await evalJson(`(() => {
    const s = document.querySelector('#sec-settings');
    if (!s) return null;
    s.scrollIntoView({ block: 'start' });
    const r = s.getBoundingClientRect();
    return { x: Math.max(0, Math.round(r.x)) - 4, y: Math.max(0, Math.round(r.y)) - 4,
             width: Math.min(Math.round(r.width) + 8, innerWidth), height: Math.min(Math.round(r.height) + 8, innerHeight) };
  })()`)
  if (rect && rect.width > 10 && rect.height > 10) {
    const clipShot = await c.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } })
    if (clipShot.result && clipShot.result.data) {
      fs.writeFileSync(path.join(outDir, 'agent-settings.png'), Buffer.from(clipShot.result.data, 'base64'))
    }
  }

  // the status pane is a scroll container: capture its whole content, not just the viewport
  const paneRect = await evalJson(`(() => {
    const p = document.querySelector('#tab-status');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)),
             width: Math.round(r.width), height: Math.min(p.scrollHeight, 4000) };
  })()`)
  if (paneRect && paneRect.width > 10 && paneRect.height > 10) {
    const fullShot = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...paneRect, scale: 1 } })
    if (fullShot.result && fullShot.result.data) {
      fs.writeFileSync(path.join(outDir, 'agent-pane-full.png'), Buffer.from(fullShot.result.data, 'base64'))
    }
  }

  const afterAll = await evalJson(SNAPSHOT_JS)

  const exceptions = []
  const consoleMsgs = []
  for (const e of c.events) {
    if (e.method === 'Runtime.exceptionThrown') {
      const d = e.params.exceptionDetails
      exceptions.push({
        text: d.text,
        desc: (d.exception && d.exception.description) || '',
        url: d.url || '', line: (d.lineNumber || 0) + 1, col: (d.columnNumber || 0) + 1
      })
    }
    if (e.method === 'Runtime.consoleAPICalled' && (e.params.type === 'error' || e.params.type === 'warning')) {
      consoleMsgs.push({ level: e.params.type, text: (e.params.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ') })
    }
    if (e.method === 'Log.entryAdded' && (e.params.entry.level === 'error' || e.params.entry.level === 'warning')) {
      consoleMsgs.push({ level: 'log.' + e.params.entry.level, text: e.params.entry.text, url: e.params.entry.url })
    }
  }

  const report = {
    dpr: await evalJson('devicePixelRatio'),
    innerW: await evalJson('innerWidth'),
    labelRect: await evalJson(`(() => {
      const l = document.querySelector('#panel-ctrl .field label');
      if (!l) return null;
      const r = l.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, text: (l.textContent || '').trim().slice(0, 30),
               color: getComputedStyle(l).color };
    })()`),
    app: (exeArg ? 'PACKAGED ' + path.basename(exeArg) : 'AiRemote Agent (electron ' + path.basename(ELECTRON) + ')'),
    profile: seedServer
      ? 'isolated temp userData — seeded to connect to ' + seedServer
      : 'isolated temp userData — no local config, no server connection',
    exceptions, exceptionCount: exceptions.length,
    console: consoleMsgs,
    ui: { before, clickSettings, afterSettings, tabWalk, afterAll },
    verdict: {
      statusIsDefaultStopped: before && before.statusLabel === 'متوقف',
      settingsOpens: clickSettings && clickSettings.openedAfterClick === true,
      connInfoFilled: !!(before && before.infServer && before.infServer !== '—'),
      allTabsActivate: tabWalk.every(t => t && t.paneActive === true && t.active === true)
    }
  }
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8')

  console.log(JSON.stringify({
    exceptions: report.exceptionCount,
    firstException: exceptions[0] ? exceptions[0].desc.split('\n')[0] || exceptions[0].text : null,
    at: exceptions[0] ? exceptions[0].url.split('/').pop() + ':' + exceptions[0].line + ':' + exceptions[0].col : null,
    ui: report.ui.before,
    clickSettings: report.ui.clickSettings,
    tabWalk: report.ui.tabWalk,
    verdict: report.verdict,
    out: path.relative(ROOT, path.join(outDir, 'report.json'))
  }, null, 2))

  c.close()
  try { child.kill() } catch {}
  await sleep(400)
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
