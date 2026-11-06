#!/usr/bin/env node
'use strict'
/**
 * audit-buttons.cjs — the 277-button audit (PLAN §5), automated as far as it is safe.
 *
 * One page load per route; every visible button clicked once, in order, with Escape pressed
 * between clicks to close whatever the previous click opened. What is measured per button:
 *   - page exceptions caused by the click (the real failure signal)
 *   - whether the DOM reacted at all (mutations, URL change, a dialog appearing)
 *   - destructive labels (delete / block / sign out / stop / clear) are NOT clicked
 *
 * Earlier versions reloaded per click and matched by index/label; the tiles are built from
 * an async device list, so the index moves and repeated labels ("تكبير" x3) collide.
 *
 * Usage: node scripts/audit-buttons.cjs <report.json> [--routes /,/devices] [--max-per-route 60]
 */
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9427
const BASE = 'https://127.0.0.1:3001'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const outFile = path.resolve(process.argv[2] || 'audit.json')
const argOf = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null }
const ROUTES = (argOf('routes') || '/,/devices,/sessions,/files,/audit,/users,/notifications,/settings,/help,/ai').split(',').map(s => s.trim()).filter(Boolean)
const MAX = Number(argOf('max-per-route') || 60)

const creds = fs.readFileSync(path.join(os.tmpdir(), 'airemote-lab-probe.txt'), 'utf8').split(/\r?\n/)
const EMAIL = creds[0].trim()
const PASS = creds[1].trim()

const DESTRUCTIVE = /(حذف|إزالة|مسح|حجب|إلغاء الحجب|خروج|إيقاف|قطع|إنهاء|delete|remove|clear|block|unblock|sign\s*out|log\s*out|stop|disconnect|terminate)/i

function cdp (wsUrl) {
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
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  return { ready, send, events, close: () => ws.close() }
}

const ENUM_JS = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const seen = {};
  return [...document.querySelectorAll('button, [role=button], a.btn, input[type=submit]')].filter(visible).map((el) => {
    const label = (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
    const title = (el.getAttribute('title') || '').slice(0, 60);
    const key = label + '|' + title;
    seen[key] = (seen[key] || 0) + 1;
    return { label, title, ord: seen[key], disabled: !!el.disabled, key: key + '#' + seen[key] };
  });
})()`

const clickByKey = (key) => `(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const seen = {};
  const nodes = [...document.querySelectorAll('button, [role=button], a.btn, input[type=submit]')].filter(visible);
  let target = null;
  for (const el of nodes) {
    const label = (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
    const title = (el.getAttribute('title') || '').slice(0, 60);
    const k = label + '|' + title;
    seen[k] = (seen[k] || 0) + 1;
    if (k + '#' + seen[k] === ${JSON.stringify(key)}) { target = el; break; }
  }
  if (!target) return { ok: false, error: 'not present on this pass' };
  window.__auditMut = 0;
  const mo = new MutationObserver((m) => { window.__auditMut += m.length; });
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  const before = location.pathname + location.search;
  try { target.click(); } catch (e) { mo.disconnect(); return { ok: false, error: String(e && e.message) }; }
  return new Promise((resolve) => setTimeout(() => {
    mo.disconnect();
    resolve({ ok: true, mut: window.__auditMut, before, after: location.pathname + location.search,
              dialogs: document.querySelectorAll('[role=dialog], .modal, .fixed.inset-0').length });
  }, 650));
})()`

;(async () => {
  const userDir = path.join(os.tmpdir(), 'airemote-audit-' + Date.now())
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--ignore-certificate-errors',
    '--window-size=1440,1000', '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir,
    '--no-first-run', '--no-default-browser-check', 'about:blank'
  ], { stdio: 'ignore' })

  let target = null
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(300)
    try { const list = await fetch('http://127.0.0.1:' + PORT + '/json/list').then(r => r.json()); target = list.find(t => t.type === 'page') } catch {}
  }
  if (!target) { chrome.kill(); console.error('no CDP target'); process.exit(1) }

  const c = cdp(target.webSocketDebuggerUrl)
  await c.ready
  await c.send('Runtime.enable'); await c.send('Page.enable'); await c.send('Log.enable')

  const evalJs = async (expr) => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.result && r.result.exceptionDetails) return { __error: r.result.exceptionDetails.text }
    return r.result && r.result.result ? r.result.result.value : null
  }
  const exceptionsNow = () => c.events.filter(e => e.method === 'Runtime.exceptionThrown').length

  // login once
  await c.send('Page.navigate', { url: BASE + '/login' })
  await sleep(2200)
  await evalJs(`(() => {
    const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value'); if (d && d.set) d.set.call(el, v); else el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    const e = document.querySelector('input[type=email], #email'); const p = document.querySelector('input[type=password], #password');
    if (!e || !p) return 'NO_FORM';
    set(e, ${JSON.stringify(EMAIL)}); set(p, ${JSON.stringify(PASS)});
    const f = e.closest('form'); (f ? (f.querySelector('button[type=submit]') || f) : document.querySelector('button[type=submit]')).click();
    return 'ok';
  })()`)
  await sleep(3500)
  if (/login/.test(String(await evalJs('location.pathname')))) { console.error('login failed'); chrome.kill(); process.exit(2) }

  const report = { generatedAt: new Date().toISOString(), user: EMAIL, routes: [], totals: { buttons: 0, clicked: 0, passed: 0, threw: 0, noReaction: 0, skipped: 0 } }

  for (const route of ROUTES) {
    await c.send('Page.navigate', { url: BASE + route })
    await sleep(3000)
    const rec = { route, buttons: [], counts: { found: 0, clicked: 0, passed: 0, threw: 0, noReaction: 0, skipped: 0 } }
    const first = await evalJs(ENUM_JS)
    if (!Array.isArray(first)) { rec.error = 'enumeration failed'; report.routes.push(rec); continue }
    const keys = first.map(b => b).slice(0, MAX)
    rec.counts.found = first.length

    for (const b of keys) {
      const label = b.label || b.title || '(no label)'
      if (DESTRUCTIVE.test(label)) { rec.buttons.push({ ...b, result: 'skipped', reason: 'destructive label' }); rec.counts.skipped++; continue }
      const before = exceptionsNow()
      const r = await evalJs(clickByKey(b.key))
      const threw = exceptionsNow() - before
      const reacted = !!(r && r.ok && (r.mut > 0 || r.before !== r.after || r.dialogs > 0))
      const result = threw > 0 ? 'threw' : (!r || !r.ok ? 'absent' : (reacted ? 'passed' : 'no-reaction'))
      rec.buttons.push({ ...b, result, mut: r && r.mut, urlChanged: !!(r && r.before !== r.after), exceptions: threw, reason: (r && r.error) || undefined })
      rec.counts.clicked++
      if (result === 'passed') rec.counts.passed++
      else if (result === 'threw') rec.counts.threw++
      else if (result === 'no-reaction') rec.counts.noReaction++
      // close whatever opened, and come back if the click navigated away
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await sleep(150)
      const here = await evalJs('location.pathname')
      if (here && here !== route) { await c.send('Page.navigate', { url: BASE + route }); await sleep(2200) }
    }
    rec.counts.truncated = Math.max(0, first.length - keys.length)
    report.routes.push(rec)
    report.totals.buttons += rec.counts.found
    report.totals.clicked += rec.counts.clicked
    report.totals.passed += rec.counts.passed
    report.totals.threw += rec.counts.threw
    report.totals.noReaction += rec.counts.noReaction
    report.totals.skipped += rec.counts.skipped
    console.log(route + ': found=' + rec.counts.found + ' clicked=' + rec.counts.clicked + ' passed=' + rec.counts.passed + ' threw=' + rec.counts.threw + ' noReaction=' + rec.counts.noReaction + ' skipped=' + rec.counts.skipped)
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8')
  console.log('TOTALS ' + JSON.stringify(report.totals))
  c.close(); try { chrome.kill() } catch {}
  await sleep(300)
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
