#!/usr/bin/env node
'use strict'
/**
 * R6 — مصفوفة تحقق التباين البصري.
 *
 *   node scripts/ui-audit-matrix.cjs [--out=dir] [--base=..] [--setup-base=..] [--wait=12000]
 *
 * تفتح Edge مرة واحدة، تمرّ على 9 صفحات × 4 عروض × سمتين، وتلتقط لقطة لكل حالة،
 * ثم تفحص تباين كل نص ظاهر من الأنماط المحسوبة (WCAG 2.1 AA) وتكتب contrast.json + scan.txt.
 *
 * السيرفرات المطلوبة (قاعدة مؤقتة فقط):
 *   :4191 لوحة مبنية + وكيل /api إلى :3021 (بيانات)
 *   :4192 لوحة مبنية + وكيل /api إلى :3022 (قاعدة فارغة: صفحة /setup)
 */
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')

function loadWs () {
  const ROOT = path.resolve(__dirname, '..')
  const base = path.join(ROOT, 'node_modules', '.pnpm')
  for (const d of fs.readdirSync(base).filter(x => /^ws@/.test(x))) {
    try { return require(path.join(base, d, 'node_modules', 'ws')) } catch {}
  }
  return null
}
const WebSocket = loadWs()
if (!WebSocket) { console.error('ws not found'); process.exit(1) }

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v === undefined ? '1' : v]
}))

const BASE = args.base || 'http://127.0.0.1:4191'
const SETUP_BASE = args['setup-base'] || 'http://127.0.0.1:4192'
const OUT = path.resolve(args.out || 'outputs/verify-2026-10-29/r6-contrast')
const WAIT = Number(args.wait || 12000)
const LOGIN = args.login || 'shot@local:ShotPassw0rd!'
const PAGES = (args.pages || 'devices,notifications,help,ai,setup,settings,sessions,users,audit').split(',')
const SIZES = (args.sizes || '360x800,768x1024,1280x900,1920x1080').split(',')
const THEMES = (args.themes || 'light,dark').split(',')

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9440
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-matrix-'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const getJson = p => new Promise((resolve, reject) => {
  http.get('http://127.0.0.1:' + PORT + p, res => {
    let b = ''
    res.on('data', c => { b += c })
    res.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(e) } })
  }).on('error', reject)
})

const AUDIT = `(() => {
  const out = { checked: 0, failures: [], manual: [], exempt: 0 }
  const parse = (s) => {
    if (!s) return null
    s = String(s).trim().toLowerCase()
    if (s === 'transparent') return [0, 0, 0, 0]
    let m = s.match(/^rgba?\\(([^)]+)\\)$/)
    if (m) {
      const p = m[1].split(/[,\\s\\/]+/).filter(x => x !== '').map(Number)
      if (p.length >= 3 && p.slice(0, 3).every(n => !isNaN(n))) return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
      return null
    }
    m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/)
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), m[2] ? parseInt(m[2], 16) / 255 : 1]
    return null
  }
  const lum = (c) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
  }
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05) }
  const over = (fg, bg) => { const a = fg[3]; return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1] }
  const stops = (img) => {
    const list = []
    const re = /(rgba?\\([^)]*\\)|#[0-9a-fA-F]{3,8})/g
    let m
    while ((m = re.exec(img))) { const c = parse(m[1]); if (c) list.push(c) }
    return list
  }
  const show = (c) => 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'
  const sel = (el) => {
    let s = el.tagName.toLowerCase()
    if (el.id) s += '#' + el.id
    const cls = (el.getAttribute('class') || '').split(/\\s+/).filter(Boolean).slice(0, 3)
    if (cls.length) s += '.' + cls.join('.')
    return s
  }

  const all = Array.from(document.body.querySelectorAll('*'))
  for (const el of all) {
    if (el.closest('svg')) continue
    const tag = el.tagName
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue
    const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0)
    const isField = tag === 'INPUT' || tag === 'TEXTAREA'
    if (!hasText && !isField) continue
    if (el.getAttribute('aria-hidden') === 'true') continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility !== 'visible') continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue
    const text = (hasText ? el.textContent : (el.getAttribute('placeholder') || '')).replace(/\\s+/g, ' ').trim()
    if (!text) continue

    out.checked++
    const size = parseFloat(cs.fontSize) || 16
    const weight = parseInt(cs.fontWeight, 10) || 400
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    const need = large ? 3 : 4.5
    const disabled = !!(el.disabled || el.closest('[disabled]'))

    let fgSource = isField ? getComputedStyle(el, '::placeholder').color : cs.color
    if (isField && el.value && el.value.length) fgSource = cs.color
    if (!isField && (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text')) {
      out.manual.push({ text: text.slice(0, 60), reason: 'gradient text', sel: sel(el) })
      continue
    }
    let fg = parse(fgSource)
    if (!fg || fg[3] === 0) {
      out.manual.push({ text: text.slice(0, 60), reason: 'transparent text', sel: sel(el) })
      continue
    }

    let acc = [0, 0, 0, 0]
    let unknown = false
    let node = el
    const chain = []
    while (node && node.nodeType === 1) { chain.push(node); node = node.parentElement }
    for (let i = chain.length - 1; i >= 0; i--) {
      const st = getComputedStyle(chain[i])
      const bc = parse(st.backgroundColor)
      if (bc && bc[3] > 0) acc = over(bc, acc)
      const img = st.backgroundImage
      if (img && img !== 'none') {
        if (img.includes('url(')) { unknown = true; continue }
        const sts = stops(img)
        if (sts.length) {
          let worst = null
          for (const s of sts) {
            const cand = over(s[3] < 1 ? s : [s[0], s[1], s[2], 1], acc)
            const r = ratio(fg[3] < 1 ? over(fg, cand) : fg, cand)
            if (!worst || r < worst.r) worst = { c: cand, r }
          }
          if (worst) acc = worst.c
        }
      }
      if (chain[i] === document.documentElement && acc[3] < 1) {
        const bodyBg = parse(getComputedStyle(document.body).backgroundColor)
        if (bodyBg && bodyBg[3] > 0) acc = over(bodyBg, acc)
      }
    }
    if (acc[3] < 1 || unknown) {
      out.manual.push({ text: text.slice(0, 60), reason: unknown ? 'image background' : 'translucent stack', sel: sel(el) })
      continue
    }
    const fgc = fg[3] < 1 ? over(fg, acc) : fg
    const r = ratio(fgc, acc)
    if (disabled) { out.exempt++; continue }
    if (r + 0.001 < need) {
      out.failures.push({
        text: text.slice(0, 70), ratio: Math.round(r * 100) / 100, need,
        fg: show(fgc), bg: show(acc), size: Math.round(size * 10) / 10, weight,
        sel: sel(el), field: isField || undefined
      })
    }
  }
  out.failures.sort((a, b) => a.ratio - b.ratio)
  const seen = new Set()
  out.failures = out.failures.filter(f => {
    const k = f.text + '|' + f.ratio + '|' + f.fg + '|' + f.bg
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, 40)
  const mseen = new Set()
  out.manual = out.manual.filter(m => { const k = m.reason + '|' + m.sel; if (mseen.has(k)) return false; mseen.add(k); return true }).slice(0, 25)
  return out
})()`

async function main () {
  fs.mkdirSync(OUT, { recursive: true })
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir, 'about:blank'
  ], { stdio: 'ignore' })

  let targets = null
  for (let i = 0; i < 60; i++) {
    try { targets = await getJson('/json/list'); if (targets && targets.length) break } catch {}
    await sleep(250)
  }
  if (!targets || !targets.length) { child.kill(); throw new Error('no CDP target') }
  const page = targets.find(t => t.type === 'page') || targets[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
  let seq = 0
  const pending = new Map()
  ws.on('message', raw => {
    const m = JSON.parse(raw.toString())
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id)
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result)
    }
  })
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {} }))
  })

  await send('Page.enable')
  await send('Runtime.enable')

  const [email, password] = LOGIN.split(':')
  const loginRes = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
  })
  const loginJson = await loginRes.json().catch(() => ({}))
  if (!loginJson.token) throw new Error('login failed for ' + email)

  const auth = JSON.stringify({
    state: { token: loginJson.token, refreshToken: null, user: { id: '', email, name: 'Admin', role: 'admin' } }, version: 0
  })

  await send('Page.navigate', { url: BASE + '/login' })
  await sleep(1200)
  await send('Runtime.evaluate', { expression: `localStorage.setItem('airemote-auth', ${JSON.stringify(auth)}); 'ok'` })

  const results = []
  for (const pageName of PAGES) {
    const base = pageName === 'setup' ? SETUP_BASE : BASE
    const route = pageName === 'setup' ? '/setup' : '/' + pageName
    for (const size of SIZES) {
      const [w, h] = size.split('x').map(Number)
      for (const theme of THEMES) {
        const ui = JSON.stringify({ state: { theme, lang: 'ar', sidebarOpen: true }, version: 0 })
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
        await send('Runtime.evaluate', { expression: `localStorage.setItem('airemote-ui', ${JSON.stringify(ui)}); 'ok'` })
        await send('Page.navigate', { url: base + route })

        const deadline = Date.now() + WAIT
        let bodyText = ''
        for (;;) {
          await sleep(350)
          try {
            const r = await send('Runtime.evaluate', { expression: 'document.body ? document.body.innerText : ""', returnByValue: true })
            bodyText = (r && r.result && r.result.value) || ''
          } catch {}
          const booting = /Loading AiRemote/.test(bodyText) || bodyText.trim() === ''
          if (!booting) break
          if (Date.now() > deadline) break
        }
        await sleep(700)

        let audit = { checked: 0, failures: [], manual: [], exempt: 0 }
        try {
          const r = await send('Runtime.evaluate', { expression: AUDIT, returnByValue: true })
          if (r && r.result && r.result.value) audit = r.result.value
        } catch (e) { audit.error = e.message }

        const file = path.join(OUT, `${pageName}-${w}-${theme}.png`)
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
        const bytes = fs.statSync(file).size

        const rec = {
          page: pageName, width: w, height: h, theme,
          bytes, renderLen: bodyText.length,
          blank: bytes < 10000 || /Loading AiRemote/.test(bodyText),
          checked: audit.checked, failures: audit.failures || [], manual: audit.manual || [], exempt: audit.exempt || 0
        }
        results.push(rec)
        console.log(`${pageName} ${w} ${theme}: checked=${rec.checked} fail=${rec.failures.length} manual=${rec.manual.length} bytes=${bytes}${rec.blank ? ' BLANK!' : ''}`)
      }
    }
  }

  fs.writeFileSync(path.join(OUT, 'contrast.json'), JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, setupBase: SETUP_BASE, results }, null, 2))

  const lines = []
  lines.push('R6 — visual contrast matrix (WCAG 2.1 AA, computed styles)')
  lines.push('pages=' + PAGES.join(',') + ' | sizes=' + SIZES.join(',') + ' | themes=' + THEMES.join(','))
  lines.push('')
  let totalFail = 0
  for (const r of results) {
    totalFail += r.failures.length
    lines.push(`${r.page.padEnd(14)} ${String(r.width).padStart(4)} ${r.theme.padEnd(5)} checked=${String(r.checked).padStart(3)} fail=${String(r.failures.length).padStart(2)} manual=${String(r.manual.length).padStart(2)} exempt=${r.exempt} bytes=${r.bytes}${r.blank ? '  [BLANK]' : ''}`)
  }
  lines.push('')
  lines.push('TOTAL failures: ' + totalFail)
  lines.push('')
  for (const r of results) {
    if (!r.failures.length) continue
    lines.push(`--- ${r.page} ${r.width} ${r.theme} ---`)
    for (const f of r.failures) {
      lines.push(`  ${String(f.ratio).padStart(5)} < ${f.need}  ${f.fg} on ${f.bg}  ${f.size}px/${f.weight}  "${f.text}"  ${f.sel}`)
    }
  }
  const manual = results.filter(r => r.manual.length)
  if (manual.length) {
    lines.push('')
    lines.push('MANUAL REVIEW (not decidable from computed styles):')
    for (const r of manual) {
      lines.push(`--- ${r.page} ${r.width} ${r.theme} ---`)
      for (const m of r.manual) lines.push(`  ${m.reason}: "${m.text}"  ${m.sel}`)
    }
  }
  fs.writeFileSync(path.join(OUT, 'scan.txt'), lines.join('\n'))

  const blanks = results.filter(r => r.blank)
  console.log('\nDONE shots=' + results.length + ' failures=' + totalFail + ' blanks=' + blanks.length)
  console.log('OUT ' + OUT)
  ws.close()
  try { child.kill() } catch {}
  setTimeout(() => process.exit(blanks.length ? 1 : 0), 300)
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
