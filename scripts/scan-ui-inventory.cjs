#!/usr/bin/env node
/**
 * scan-ui-inventory.cjs — Phase 0 of docs/PLAN-UI-IMPLEMENTATION-AR.md
 *
 * Builds design/INVENTORY.csv from the REAL source: one row per interactive
 * element, with file + line so every row can be opened and checked by hand.
 *
 * Measured baseline the plan was written against (commit 6f867b8 == HEAD today):
 *   dashboard   <button> 219   <input|<select|<textarea> 47
 *   windows     <button>  46   <input> 14 (+1 select/textarea = 15 fields)
 *   android     13 controls in activity_main.xml + 4 tabs + code-built buttons
 *
 * Usage:
 *   node scripts/scan-ui-inventory.cjs                 write design/INVENTORY.csv
 *   node scripts/scan-ui-inventory.cjs --summary       print counts only
 *   node scripts/scan-ui-inventory.cjs --check         fail if counts drift from design/INVENTORY.baseline.json
 *   node scripts/scan-ui-inventory.cjs --verify        fail if any row's file:line does not hold its element
 *   node scripts/scan-ui-inventory.cjs --baseline      rewrite the baseline from the current tree
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'design', 'INVENTORY.csv')
const BASELINE = path.join(ROOT, 'design', 'INVENTORY.baseline.json')

const args = new Set(process.argv.slice(2))

/* ────────────────────────────── helpers ────────────────────────────── */

const AR = /[\u0600-\u06FF]/
const hasAr = (s) => AR.test(s || '')
const hasLatin = (s) => /[A-Za-z]/.test(s || '')

/** Strings that are code, not UI copy. */
const NOT_TEXT = [
  /^[a-z0-9_.-]+$/,                 // snake_case / kebab keys, ids
  /[\[\]]/,                          // tailwind arbitrary values
  /(^|\s)(text|bg|border|ring|flex|grid|hidden|block|inline|w|h|p|px|py|m|mx|my|mt|mb|gap|font|rounded|shadow|hover|focus|active|disabled|sm|md|lg|xl|absolute|relative|overflow|transition|transform|truncate|min|max)-/,
  /^(https?:|\/|#)/,
  /px$/,
  /\bpx\b|\bdp\b/,
  /^[A-Za-z0-9+/=]{20,}$/
]

function isCopy (s) {
  const v = String(s || '').trim()
  if (!v || v.length < 2 || v.length > 70) return false
  if (!hasAr(v) && !hasLatin(v)) return false
  return !NOT_TEXT.some(re => re.test(v))
}

function read (rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function lineAt (src, index) {
  let n = 1
  for (let i = 0; i < index && i < src.length; i++) if (src.charCodeAt(i) === 10) n++
  return n
}

function listFiles (dir, ext) {
  const out = []
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) {
        if (['node_modules', 'dist', 'build'].includes(e.name)) continue
        walk(p)
      } else if (e.name.endsWith(ext)) out.push(p)
    }
  }
  walk(path.join(ROOT, dir))
  return out.sort()
}

/** Index of the '>' that closes the tag starting at `start`. */
function tagEnd (src, start) {
  let quote = null
  let brace = 0
  for (let i = start; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      if (ch === '\\') { i++; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    if (ch === '{') { brace++; continue }
    if (ch === '}') { brace--; continue }
    if (ch === '>' && brace === 0) return i
  }
  return -1
}

/** All `<tag>` occurrences: raw source, inner content, close index. */
function findTags (src, tag, ci) {
  const out = []
  const re = new RegExp('<' + tag + '(?=[\\s/>])', ci ? 'gi' : 'g')
  let m
  while ((m = re.exec(src))) {
    const start = m.index
    const end = tagEnd(src, start)
    if (end < 0) break
    const raw = src.slice(start, end + 1)
    const selfClosing = /\/\s*>$/.test(raw)
    let inner = ''
    let closeAt = -1
    if (!selfClosing) {
      let depth = 1
      const cre = new RegExp('<(/?)' + tag + '(?=[\\s/>])', ci ? 'gi' : 'g')
      cre.lastIndex = end + 1
      let cm
      while ((cm = cre.exec(src))) {
        if (cm[1] === '/') {
          depth--
          if (depth === 0) { closeAt = cm.index; break }
        } else {
          const gt = tagEnd(src, cm.index)
          if (gt < 0) break
          if (!/\/\s*>$/.test(src.slice(cm.index, gt + 1))) depth++
          cre.lastIndex = gt + 1
          continue
        }
        cre.lastIndex = cm.index + cm[0].length
      }
      if (closeAt >= 0) inner = src.slice(end + 1, closeAt)
    }
    out.push({ start, end, raw, inner, selfClosing, closeAt })
    re.lastIndex = end + 1
  }
  return out
}

/** Attribute map of one opening tag. */
function attrs (raw, tag) {
  const map = {}
  const body = raw.slice(1 + tag.length, raw.endsWith('/>') ? raw.length - 2 : raw.length - 1)
  const re = /([A-Za-z_:][\w:.-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|\{([\s\S]*?)\}))?/g
  let m
  while ((m = re.exec(body))) {
    const name = m[1]
    if (m[2] === undefined) { map[name] = true; continue }
    map[name] = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[5])
  }
  return map
}

/** Balanced `{…}` expression following `name={` inside a raw tag. */
function exprOf (raw, name) {
  const key = name + '={'
  const i = raw.indexOf(key)
  if (i < 0) return ''
  let depth = 0
  let quote = null
  const from = i + key.length - 1
  for (let k = from; k < raw.length; k++) {
    const ch = raw[k]
    if (quote) {
      if (ch === '\\') { k++; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return raw.slice(from + 1, k)
    }
  }
  return ''
}

/** Remove every JSX/HTML tag, keeping text nodes only. */
function stripTags (s) {
  let out = ''
  let i = 0
  while (i < s.length) {
    if (s[i] === '<' && /[A-Za-z/!]/.test(s[i + 1] || '')) {
      const e = tagEnd(s, i)
      if (e > 0) { i = e + 1; out += ' '; continue }
    }
    out += s[i++]
  }
  return out
}

function literals (chunk) {
  const out = []
  const re = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g
  let m
  while ((m = re.exec(chunk))) out.push(m[2])
  return out
}

/** Text nodes + literals in text-position expressions (never attribute values). */
function copyCandidates (inner) {
  let s = inner.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  s = stripTags(s)
  const exprs = []
  const reExpr = /\{([\s\S]*?)\}/g
  let m
  while ((m = reExpr.exec(s))) exprs.push(...literals(m[1]))
  const plain = s.replace(/\{[\s\S]*?\}/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim()
  return [plain, ...exprs].filter(isCopy)
}

/** i18n key used by this control (t / tr / tt) — resolved through the dictionary. */
function keyOf (chunk, dict) {
  const m = chunk.match(/\b(?:t|tr|tt|\$t)\(\s*['"]([\w.]+)['"]/)
  if (!m) return null
  const k = m[1]
  if (dict && dict.ar && dict.ar[k]) return { key: k, ar: dict.ar[k], en: dict.en[k] || '' }
  return { key: k, ar: '', en: '' }
}

const EXPECT = [
  [/navigate\(|history\.push|location\.href/i, 'انتقال إلى المسار المطلوب'],
  [/setTab|selectTab|setActiveTab/i, 'تبديل التبويب الظاهر'],
  [/theme|ثيم/i, 'تبديل الثيم فاتح/داكن'],
  [/lang|language|لغة/i, 'تبديل اللغة عربي/إنجليزي'],
  [/logout|signOut|خروج/i, 'إنهاء الجلسة والخروج'],
  [/menuAction|menuItem/i, 'تنفيذ إجراء القائمة'],
  [/minimi/i, 'تصغير النافذة إلى شريط المهام'],
  [/tray/i, 'إخفاء النافذة إلى علبة النظام'],
  [/newConv|new_conversation|startNew/i, 'بدء محادثة جديدة'],
  [/approve|allow|accept|سماح|قبول/i, 'قبول الطلب'],
  [/deny|reject|refuse|رفض/i, 'رفض الطلب'],
  [/delete|remove|revoke|kick|kill|destroy|purge|حذف|إلغاء/i, 'حذف/إلغاء بعد تأكيد'],
  [/copy|clipboard|نسخ/i, 'نسخ إلى الحافظة'],
  [/download|تنزيل/i, 'تنزيل الملف'],
  [/upload|رفع/i, 'رفع الملف'],
  [/export|تصدير/i, 'تصدير الملف'],
  [/capture|screenshot|snapshot|التقاط/i, 'التقاط صورة من الشاشة'],
  [/record|تسجيل/i, 'بدء/إيقاف التسجيل'],
  [/zoom|maximi|fullscreen|expand|lightbox|تكبير/i, 'تكبير/تصغير العرض'],
  [/clear|reset|wipe|تفريغ|مسح/i, 'تفريغ المحتوى'],
  [/save|persist|حفظ/i, 'حفظ القيم ثم إظهار تأكيد'],
  [/exec|run\b|command|shell|pty|تنفيذ/i, 'تنفيذ الأمر على الجهاز'],
  [/send|submit|ask|post|message|إرسال/i, 'إرسال الطلب'],
  [/refresh|reload|load|fetch|reconnect|probe|تحديث/i, 'تحديث البيانات من الخادم'],
  [/start|play|resume|arm|بدء|تشغيل/i, 'بدء التشغيل'],
  [/stop|pause|end|cut|abort|halt|إيقاف|قطع/i, 'إيقاف التشغيل'],
  [/cancel|dismiss|close|hide|إغلاق/i, 'إغلاق/إلغاء'],
  [/open|show|toggle|collapse|view|فتح/i, 'فتح/إغلاق العنصر'],
  [/^set[A-Z]|^toggle[A-Z]/, 'تغيير الحالة وتحديث الواجهة']
]

function expectedOf (action) {
  if (!action) return 'تنفيذ الإجراء وتحديث الواجهة'
  for (const [re, label] of EXPECT) if (re.test(action)) return label
  return 'تنفيذ الإجراء وتحديث الواجهة'
}

function testOf (action, surface) {
  if (surface === 'android') return 'touch + e2e'
  if (/api|fetch|send|save|delete|create|update|load|upload|download|request|socket|ws\./i.test(action || '')) return 'UI + e2e'
  return 'UI'
}

const CODE_WORDS = new Set(['if', 'for', 'while', 'switch', 'return', 'await', 'const', 'let', 'var', 'new', 'typeof', 'catch', 'function', 'else', 'try'])

function firstCall (body) {
  const re = /([\w$.]+)\s*\(/g
  let m
  while ((m = re.exec(body))) {
    const n = m[1].split('.').pop()
    if (CODE_WORDS.has(n)) continue
    return m[1] + '()'
  }
  return ''
}

function actionOf (expr) {
  if (!expr) return ''
  const s = expr.replace(/\?\./g, '.').replace(/\s+/g, ' ').trim()
  let body = s
  const arrow = body.match(/^(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>\s*([\s\S]*)$/)
  if (arrow) body = arrow[1].trim().replace(/^\{\s*/, '').replace(/\s*\}$/, '')
  const call = firstCall(body)
  if (call) return call
  if (/^[\w$.]+\s*=(?!=)/.test(body)) return 'إسناد مباشر'
  if (/^[\w$.]+$/.test(body)) return body + '()'
  return ''
}

function iconsOf (inner) {
  return (inner.match(/<([A-Z][A-Za-z0-9]*)[\s/>]/g) || [])
    .map(x => x.replace(/[<\s/>]/g, ''))
    .filter(n => !['Fragment', 'React', 'Suspense'].includes(n))
}

/** id → handler, read from app.js addEventListener / onclick wiring. */
function windowsHandlers () {
  const src = read('packages/agent-desktop/renderer/app.js')
  const map = {}
  const re = /\$\('([\w-]+)'\)\s*\.\s*(?:addEventListener\('click',\s*|onclick\s*=\s*)([^\n]{0,160})/g
  let m
  while ((m = re.exec(src))) {
    const a = actionOf(m[2])
    if (a && !map[m[1]]) map[m[1]] = a
  }
  return map
}

/** R.id.x → Java handler, read from the activity sources. */
function androidHandlers () {
  const map = {}
  for (const abs of listFiles('packages/android-agent/app/src/main/java', '.java')) {
    const src = fs.readFileSync(abs, 'utf8')
    const re = /R\.id\.(\w+)\)\s*\.setOnClickListener\(([\s\S]{0,220}?)\)\s*(?:;|\})/g
    let m
    while ((m = re.exec(src))) {
      const body = m[2]
      let call = body.match(/->\s*(\w+)\s*\(/)
      if (!call) call = body.match(/(\w+)\s*\(\s*v?\s*\)/)
      if (call && !map[m[1]]) map[m[1]] = call[1] + '()'
      else if (!map[m[1]]) map[m[1]] = 'setOnClickListener'
    }
    // tabs[i] → selectTab(idx)
    if (/tabs\[i\]\.setOnClickListener\(v -> selectTab\(idx\)\)/.test(src)) {
      for (const t of ['tab_status', 'tab_ai', 'tab_chat', 'tab_log']) map[t] = 'selectTab()'
    }
  }
  return map
}

function csvCell (v) {
  const s = v === undefined || v === null ? '' : String(v)
  return '"' + s.replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"'
}

/* ─────────────────────────── i18n dictionaries ─────────────────────────── */

function parseDict (slice) {
  const out = {}
  const re = /(?:^|[\s,{])([A-Za-z_][\w]*)\s*:\s*(['"])((?:\\.|(?!\2)[\s\S])*?)\2/g
  let m
  while ((m = re.exec(slice))) out[m[1]] = m[3]
  return out
}

function dashboardDict () {
  const src = read('packages/dashboard/src/lib/i18n.ts')
  const a = src.indexOf('ar: {')
  const e = src.indexOf('en: {')
  return { ar: parseDict(src.slice(a, e)), en: parseDict(src.slice(e)) }
}

function agentDict () {
  const src = read('packages/agent-desktop/renderer/app.js')
  const i = src.indexOf('const LANG = {')
  const a = src.indexOf('ar: {', i)
  const e = src.indexOf('en: {', a)
  const end = src.indexOf('\n}', e)
  return { ar: parseDict(src.slice(a, e)), en: parseDict(src.slice(e, end < 0 ? src.length : end)) }
}

/* ───────────────────────────── dashboard scan ───────────────────────────── */

/** Which pages import each component (one component can serve several pages). */
function usageMap () {
  const map = {}
  for (const abs of listFiles('packages/dashboard/src/pages', '.tsx')) {
    const page = path.basename(abs, '.tsx').replace(/Page$/, '')
    const src = fs.readFileSync(abs, 'utf8')
    const re = /from\s+['"][^'"]*\/components\/([\w/]+)['"]/g
    let m
    while ((m = re.exec(src))) {
      const comp = m[1].split('/').pop()
      map[comp] = map[comp] || []
      if (!map[comp].includes(page)) map[comp].push(page)
    }
  }
  return map
}

function scanDashboard (dict) {
  const rows = []
  const usage = usageMap()

  for (const abs of listFiles('packages/dashboard/src', '.tsx')) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/')
    const src = fs.readFileSync(abs, 'utf8')
    const owner = path.basename(abs, '.tsx')
    const isPage = /\/pages\//.test(rel)
    const page = isPage ? owner.replace(/Page$/, '') : (usage[owner] || []).join('+')
    const isPrimitive = /\/components\/ui\//.test(rel)

    findTags(src, 'button').forEach((t, i) => {
      const a = attrs(t.raw, 'button')
      const line = lineAt(src, t.start)
      const cands = copyCandidates(t.inner)
      const k = keyOf(stripTags(t.inner), dict)
      const ariaRaw = typeof a['aria-label'] === 'string' ? a['aria-label'] : ''
      const titleRaw = typeof a.title === 'string' ? a.title : ''

      let ar = ''
      let en = ''
      if (k && k.ar) { ar = k.ar.trim(); en = (k.en || '').trim() }
      if (!ar) ar = cands.find(hasAr) || ''
      if (!en) en = cands.find(v => hasLatin(v) && !hasAr(v)) || ''
      // aria-label / title may be a plain string or t('key')
      for (const raw of [ariaRaw, titleRaw]) {
        if (!raw) continue
        const kk = keyOf(raw, dict)
        const plain = !/["'`?={}$()]/.test(raw)
        const val = kk && kk.ar ? kk.ar.trim() : (plain ? raw.trim() : '')
        if (!ar && hasAr(val)) ar = val
        if (!en && kk && kk.en) en = kk.en.trim()
        else if (!en && val && hasLatin(val) && !hasAr(val)) en = val
      }
      ar = ar.trim()
      en = en.trim()

      const icons = iconsOf(t.inner)
      const label = (ar || en || '').replace(/\s+v$/i, '')
      const action = actionOf(exprOf(t.raw, 'onClick') || (a.type === 'submit' ? 'submit' : ''))
      const state = 'disabled' in a
        ? (a.disabled === true || a.disabled === '' ? 'disabled' : 'conditional')
        : 'enabled'
      const notes = []
      if (!label) notes.push(icons.length ? 'icon-only:' + icons[0] : 'icon-only')
      if (k && k.key) notes.push('i18n:' + k.key)
      if (/danger|red-|rose-/.test(t.raw)) notes.push('danger')
      if (isPrimitive) notes.push('primitive')

      rows.push({
        surface: 'dashboard',
        owner,
        page: page || '—',
        file: rel,
        line,
        kind: 'button',
        id: typeof a.id === 'string' ? a.id : (typeof a['data-testid'] === 'string' ? a['data-testid'] : `${owner}#b${String(i + 1).padStart(2, '0')}`),
        label: label || (icons.length ? `(أيقونة: ${icons[0]})` : '(بلا نص)'),
        label_en: en !== label ? en : '',
        icon: icons[0] || '',
        state,
        action,
        expected: expectedOf([action, label].filter(Boolean).join(' ')),
        test: testOf(action, 'dashboard'),
        notes: notes.join(' ')
      })
    })

    let f = 0
    for (const tag of ['input', 'select', 'textarea']) {
      findTags(src, tag).forEach((t) => {
        f++
        const a = attrs(t.raw, tag)
        const line = lineAt(src, t.start)
        const type = typeof a.type === 'string' ? a.type : (tag === 'textarea' ? 'textarea' : 'text')
        const ph = typeof a.placeholder === 'string' ? a.placeholder : ''
        const aria = typeof a['aria-label'] === 'string' ? a['aria-label'] : ''
        const name = typeof a.name === 'string' ? a.name : ''
        const label = hasAr(ph) ? ph : (ph || aria || name || `(حقل: ${owner}#f${String(f).padStart(2, '0')})`)
        rows.push({
          surface: 'dashboard',
          owner,
          page: page || '—',
          file: rel,
          line,
          kind: tag === 'select' ? 'select' : (tag === 'textarea' ? 'textarea' : (type === 'radio' || type === 'checkbox' ? type : 'field')),
          id: typeof a.id === 'string' ? a.id : (name || `${owner}#f${String(f).padStart(2, '0')}`),
          label,
          label_en: hasLatin(ph) && !hasAr(ph) ? ph : (hasLatin(aria) ? aria : ''),
          icon: '',
          state: 'disabled' in a ? 'disabled' : 'enabled',
          action: a.onChange ? 'onChange' : '',
          expected: 'قبول الإدخال وتحديث الحالة',
          test: 'UI + e2e',
          notes: type !== 'text' && type !== 'textarea' ? 'type:' + type : ''
        })
      })
    }

    // Component call sites: <Button …> / <Input …> render real controls, but a
    // `<button` grep never sees them. Counted separately, never silently dropped.
    if (!isPrimitive) {
      let c = 0
      for (const tag of ['Button', 'Input', 'Select', 'Textarea']) {
        const isBtn = tag === 'Button'
        findTags(src, tag).forEach((t) => {
          c++
          const a = attrs(t.raw, tag)
          const line = lineAt(src, t.start)
          const cands = copyCandidates(t.inner)
          const k = keyOf(stripTags(t.inner), dict)
          const ph = typeof a.placeholder === 'string' ? a.placeholder : ''
          const ariaRaw = typeof a['aria-label'] === 'string' ? a['aria-label'] : ''
          const titleRaw = typeof a.title === 'string' ? a.title : ''
          const kk = keyOf(ariaRaw, dict) || keyOf(titleRaw, dict)
          let ar = (k && k.ar ? k.ar.trim() : '') || cands.find(hasAr) || (hasAr(ph) ? ph : '') || (kk && kk.ar ? kk.ar : '')
          let en = (k && k.en ? k.en.trim() : '') || cands.find(v => hasLatin(v) && !hasAr(v)) || (hasLatin(ph) ? ph : '') || (kk && kk.en ? kk.en : '')
          for (const raw of [ariaRaw, titleRaw]) {
            if (!raw || /["'`?={}$()]/.test(raw)) continue
            if (!ar && hasAr(raw)) ar = raw.trim()
            if (!en && hasLatin(raw) && !hasAr(raw)) en = raw.trim()
          }
          const action = isBtn
            ? actionOf(exprOf(t.raw, 'onClick'))
            : (String(a.onChange || '').startsWith('{') ? 'onChange' : (a.onChange ? 'onChange' : ''))
          const icons = iconsOf(t.inner)
          const propIcon = (t.raw.match(/icon=\{\s*<([A-Z][\w]*)/) || [])[1] || ''
          const notes = ['component:' + tag, k && k.key ? 'i18n:' + k.key : '', /danger|red-|rose-|destructive/.test(t.raw) ? 'danger' : ''].filter(Boolean)
          rows.push({
            surface: 'dashboard',
            owner,
            page: page || '—',
            file: rel,
            line,
            kind: isBtn ? 'component-button' : (tag === 'Select' ? 'component-select' : 'component-field'),
            id: typeof a.id === 'string' ? a.id : `${owner}#c${String(c).padStart(2, '0')}`,
          label: ar || en || (icons.length ? `(أيقونة: ${icons[0]})` : (propIcon ? `(أيقونة: ${propIcon})` : '(بلا نص)')),
          label_en: en !== ar ? en : '',
          icon: icons[0] || propIcon || '',
          state: 'disabled' in a ? 'disabled' : 'enabled',
          action,
          expected: isBtn ? expectedOf([action, ar].filter(Boolean).join(' ')) : 'قبول الإدخال وتحديث الحالة',
          test: testOf(action, 'dashboard'),
          notes: notes.join(' ')
          })
        })
      }
    }
  }
  return rows
}

/* ──────────────────────────── windows agent scan ─────────────────────────── */

function scanWindows (dict) {
  const rel = 'packages/agent-desktop/renderer/index.html'
  const src = read(rel)
  const handlers = windowsHandlers()
  const rows = []
  let bi = 0
  let fi = 0

  findTags(src, 'button', true).forEach((t) => {
    const a = attrs(t.raw, 'button')
    const line = lineAt(src, t.start)
    const stripped = stripTags(t.inner)
    const cands = copyCandidates(t.inner)
    const keyAttr = typeof a['data-i18n'] === 'string' ? a['data-i18n'] : ''
    const innerKey = (t.inner.match(/data-i18n="([\w]+)"/) || [])[1] || ''
    const key = keyAttr || innerKey
    const k = keyOf(stripped, dict) || (key && dict.ar[key] ? { key, ar: dict.ar[key], en: dict.en[key] || '' } : null)
    const title = typeof a.title === 'string' ? a.title : ''
    const ar = (k && k.ar ? k.ar.trim() : '') || cands.find(hasAr) || (hasAr(title) && !/["'`?={}$()]/.test(title) ? title.trim() : '')
    const en = (k && k.en ? k.en.trim() : '') || cands.find(v => hasLatin(v) && !hasAr(v)) || (hasLatin(title) && !/["'`?={}$()]/.test(title) ? title.trim() : '')
    const id = typeof a.id === 'string' ? a.id : ''
    const icons = iconsOf(t.inner)
    const isTab = typeof a['data-tab'] === 'string'
    const copyTarget = typeof a['data-copy'] === 'string' ? a['data-copy'] : ''
    const action = id ? (handlers[id] || '') : (copyTarget ? 'copy(' + copyTarget + ')' : '')
    const fallback = copyTarget
      ? 'نسخ القيمة'
      : (isTab ? 'تبويب' : (/send/.test(String(a.class || '')) ? 'إرسال' : (/info-copy|eye/.test(String(a.class || '')) ? 'نسخ/إظهار' : '')))
    bi++
    rows.push({
      surface: 'windows-agent',
      owner: 'renderer/index.html',
      page: isTab ? 'tab:' + a['data-tab'] : '',
      file: rel,
      line,
      kind: isTab ? 'tab' : 'button',
      id: id || `index.html#b${String(bi).padStart(2, '0')}`,
      label: ar || en || fallback || (icons.length ? `(أيقونة: ${icons[0]})` : '(بلا نص)'),
      label_en: en !== ar ? en : '',
      icon: /<svg/.test(t.inner) ? 'svg' : icons[0] || '',
      state: 'disabled' in a ? 'disabled' : 'enabled',
      action: action || (key ? 'i18n:' + key : (isTab ? 'selectTab()' : '')),
      expected: expectedOf([action, id, key, title, ar, copyTarget].filter(Boolean).join(' ')),
      test: 'UI + e2e',
      notes: [
        key ? 'i18n:' + key : '',
        copyTarget ? 'derived:data-copy' : '',
        typeof a['data-feature'] === 'string' ? 'data-feature:' + a['data-feature'] : '',
        /danger|red|rose/.test(t.raw) ? 'danger' : ''
      ].filter(Boolean).join(' '),
    })
  })

  for (const tag of ['input', 'select', 'textarea']) {
    findTags(src, tag, true).forEach((t) => {
      fi++
      const a = attrs(t.raw, tag)
      const line = lineAt(src, t.start)
      const type = typeof a.type === 'string' ? a.type : (tag === 'textarea' ? 'textarea' : 'text')
      const ph = typeof a.placeholder === 'string' ? a.placeholder : ''
      const name = typeof a.name === 'string' ? a.name : ''
      rows.push({
        surface: 'windows-agent',
        owner: 'renderer/index.html',
        page: '',
        file: rel,
        line,
        kind: tag === 'select' ? 'select' : (tag === 'textarea' ? 'textarea' : (type === 'radio' || type === 'checkbox' ? type : 'field')),
        id: typeof a.id === 'string' ? a.id : (name ? name + ':' + String(a.value || '') : `index.html#f${String(fi).padStart(2, '0')}`),
        label: hasAr(ph) ? ph : (ph || name || `(حقل: ${typeof a.id === 'string' ? a.id : fi})`),
        label_en: ph && !hasAr(ph) ? ph : '',
        icon: '',
        state: 'disabled' in a ? 'disabled' : 'enabled',
        action: type === 'radio' || type === 'checkbox' ? 'onchange' : '',
        expected: 'قبول الإدخال وتحديث الحالة',
        test: type === 'radio' || type === 'checkbox' ? 'UI' : 'UI + e2e',
        notes: type !== 'text' ? 'type:' + type : ''
      })
    })
  }
  return rows
}

/* ───────────────────────────── android scan ───────────────────────────── */

function scanAndroid () {
  const rows = []
  const rel = 'packages/android-agent/app/src/main/res/layout/activity_main.xml'
  const src = read(rel)
  const handlers = androidHandlers()

  const tagRe = /<([A-Za-z][\w.]*)([^>]*?)\/?>/g
  let m
  while ((m = tagRe.exec(src))) {
    const tag = m[1]
    const body = m[2]
    const idm = body.match(/android:id="@\+id\/([\w]+)"/)
    if (!idm) continue
    const id = idm[1]
    const clickable = /android:onClick|android:clickable="true"/.test(body)
    let kind = ''
    if (/^Button$|ImageButton/.test(tag)) kind = 'button'
    else if (/EditText/.test(tag)) kind = 'field'
    else if (/Switch/.test(tag)) kind = 'toggle'
    else if (/Spinner/.test(tag)) kind = 'select'
    else if (/^TextView$/.test(tag) && /^tab_/.test(id)) kind = 'tab'
    else if (/^TextView$/.test(tag) && clickable) kind = 'tab'
    if (!kind) continue
    const text = (body.match(/android:text="@string\/([\w]+)"/) || [])[1] || (body.match(/android:text="([^"]*)"/) || [])[1] || ''
    const hint = (body.match(/android:hint="([^"]*)"/) || [])[1] || ''
    const action = (body.match(/android:onClick="([^"]+)"/) || [])[1] || handlers[id] || ''
    rows.push({
      surface: 'android',
      owner: 'MainActivity',
      page: 'activity_main',
      file: rel,
      line: lineAt(src, m.index),
      kind,
      id,
      label: text || hint || '(بلا نص)',
      label_en: '',
      icon: '',
      state: /android:enabled="false"/.test(body) ? 'disabled' : 'enabled',
      action,
      expected: kind === 'tab' ? 'تبديل التبويب الظاهر' : (kind === 'field' ? 'قبول الإدخال وتحديث الحالة' : expectedOf(id + ' ' + (text || hint) + ' ' + action)),
      test: 'touch + e2e',
      notes: /android:layout_height="(\d+)dp"/.test(body) && Number(RegExp.$1) < 44 ? 'h<' + RegExp.$1 + 'dp' : ''
    })
  }

  for (const abs of listFiles('packages/android-agent/app/src/main/java', '.java')) {
    const jrel = path.relative(ROOT, abs).replace(/\\/g, '/')
    const jsrc = fs.readFileSync(abs, 'utf8')
    const owner = path.basename(abs, '.java')

    let mm
    const pos = /\.set(Positive|Negative|Neutral)Button\(\s*"([^"]*)"/g
    while ((mm = pos.exec(jsrc))) {
      rows.push({
        surface: 'android',
        owner,
        page: 'dialog',
        file: jrel,
        line: lineAt(jsrc, mm.index),
        kind: 'code-button',
        id: `dialog-${mm[1].toLowerCase()}`,
        label: mm[2],
        label_en: '',
        icon: '',
        state: 'enabled',
        action: 'AlertDialog.set' + mm[1] + 'Button',
        expected: expectedOf(mm[2]),
        test: 'touch + e2e',
        notes: 'code-built dialog'
      })
    }

    const nb = /new Button\(this\)/g
    while ((mm = nb.exec(jsrc))) {
      const after = jsrc.slice(mm.index, mm.index + 700)
      const label = (after.match(/\.setText\(\s*"([^"]*)"/) || [])[1] || '(زر مُبنى بالكود)'
      const act = (after.match(/([\w]+)\.setOnClickListener/) || [])[1] || ''
      const varName = (jsrc.slice(Math.max(0, mm.index - 120), mm.index).match(/([\w]+)\s*=\s*$/) || [])[1] || ''
      rows.push({
        surface: 'android',
        owner,
        page: 'code-built',
        file: jrel,
        line: lineAt(jsrc, mm.index),
        kind: 'code-button',
        id: varName || '(anon)',
        label,
        label_en: '',
        icon: '',
        state: 'enabled',
        action: act ? act + '.setOnClickListener' : 'new Button',
        expected: expectedOf(label + ' ' + (act || '')),
        test: 'touch + e2e',
        notes: 'code-built in row/panel'
      })
    }
  }
  return rows
}

/* ─────────────────────────────── main ─────────────────────────────── */

function build () {
  return [...scanDashboard(dashboardDict()), ...scanWindows(agentDict()), ...scanAndroid()]
}

function counts (rows) {
  const by = {}
  for (const r of rows) {
    by[r.surface] = by[r.surface] || { total: 0, button: 0, field: 0 }
    by[r.surface].total++
    if (/button|tab/.test(r.kind)) by[r.surface].button++
    else by[r.surface].field++
  }
  return by
}

function main () {
  const rows = build()
  const c = counts(rows)

  if (args.has('--summary')) {
    console.log(JSON.stringify({ counts: c, total: rows.length }, null, 2))
    return
  }

  if (args.has('--baseline')) {
    fs.writeFileSync(BASELINE, JSON.stringify({ generatedAt: new Date().toISOString(), total: rows.length, counts: c }, null, 2) + '\n', 'utf8')
    console.log('baseline written -> ' + path.relative(ROOT, BASELINE))
    return
  }

  if (args.has('--verify')) {
    const bad = []
    for (const r of rows) {
      const abs = path.join(ROOT, r.file)
      const src = fs.readFileSync(abs, 'utf8')
      const lines = src.split(/\r?\n/)
      const text = lines[r.line - 1] || ''
      let ok = false
      if (r.surface === 'android') {
        if (r.kind === 'code-button' && /dialog-/.test(r.id)) ok = /\.set(Positive|Negative|Neutral)Button/.test(text)
        else if (r.kind === 'code-button') ok = /new Button\(this\)/.test(text)
        else {
          let block = ''
          for (let i = r.line - 1; i < Math.min(lines.length, r.line + 60); i++) {
            block += lines[i] + '\n'
            if (lines[i].includes('>')) break
          }
          ok = block.includes('@+id/' + r.id)
        }
      } else if (r.surface === 'windows-agent') {
        ok = /<(button|input|select|textarea)\b/i.test(text)
      } else {
        ok = /^(component-)/.test(r.kind)
          ? /<(Button|Input|Select|Textarea)\b/.test(text)
          : /<(button|input|select|textarea)\b/.test(text)
      }
      if (!ok) bad.push(`${r.surface} ${r.file}:${r.line} kind=${r.kind} id=${r.id} :: ${text.trim().slice(0, 90)}`)
    }
    if (bad.length) {
      console.error('LOCATION MISMATCH (' + bad.length + '/' + rows.length + '):')
      for (const b of bad.slice(0, 25)) console.error('  ' + b)
      process.exit(1)
    }
    console.log('PASS every row points at a real element (' + rows.length + '/' + rows.length + ')')
    return
  }

  const header = ['surface', 'owner', 'page', 'file', 'line', 'kind', 'id', 'label', 'label_en', 'icon', 'state', 'action', 'expected', 'test', 'notes']
  const csv = [header.map(csvCell).join(',')]
  for (const r of rows) csv.push(header.map(h => csvCell(r[h])).join(','))
  fs.writeFileSync(OUT, csv.join('\r\n') + '\r\n', 'utf8')

  console.log('rows=' + rows.length)
  for (const k of Object.keys(c)) {
    console.log('  ' + k.padEnd(14) + ' total=' + String(c[k].total).padStart(4) + '  buttons=' + String(c[k].button).padStart(3) + '  fields=' + String(c[k].field).padStart(3))
  }
  console.log('-> ' + path.relative(ROOT, OUT))

  if (args.has('--check')) {
    if (!fs.existsSync(BASELINE)) { console.error('no baseline: run --baseline once'); process.exit(2) }
    const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
    const diffs = []
    for (const k of Object.keys(base.counts)) {
      for (const f of ['total', 'button', 'field']) {
        const want = base.counts[k][f]
        const got = c[k] ? c[k][f] : 0
        if (want !== got) diffs.push(k + '.' + f + ': baseline=' + want + ' now=' + got)
      }
    }
    if (diffs.length) { console.error('DRIFT:\n  ' + diffs.join('\n  ')); process.exit(1) }
    console.log('PASS counts match baseline')
  }
}

main()
