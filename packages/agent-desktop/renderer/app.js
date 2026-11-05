'use strict'
/* global airemote */

// ─── Version (single source of truth: package.json via preload) ─────────────
// The brand badge and the footer used to be hardcoded and drifted (v3.6.0 while
// the build was 3.8.x). Fill them from the running app instead.
function applyAppVersion () {
  try {
    const v = (window.airemote && window.airemote.version) || ''
    if (!v) return
    document.querySelectorAll('.brand-version').forEach((el) => { el.textContent = 'v' + v })
    const f = document.getElementById('footer-ver')
    if (f) f.textContent = 'v' + v
  } catch {}
}
applyAppVersion()
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyAppVersion)

// ─── Translations ──────────────────────────────────────────────────────────
const LANG = {
  ar: {
    stopped:        'متوقف',
    connecting:     'جاري الاتصال...',
    connected:      'متصل',
    error:          'خطأ في الاتصال',
    notConnected:   'الـ Agent غير متصل بأي خادم',
    checkConfig:    'تحقق من العنوان والـ Token',
    start:          'تشغيل',
    stop:           'إيقاف',
    reconnect:      'إعادة الاتصال',
    tabConn:        'الاتصال',
    serverUrl:      'عنوان الخادم (WebSocket)',
    serverHint:     'مثال: wss://myserver.replit.app/ws',
    deviceToken:    'Device Token',
    tokenHint:      'Dashboard → Devices → نسخ Token',
    autoStart:      'تشغيل تلقائي عند فتح البرنامج',
    startMinimized: 'بدء مصغراً في شريط الإشعارات',
    saveSettings:   'حفظ الإعدادات',
    saved:          'تم الحفظ ✓',
    resources:      'موارد الجهاز',
    eventLog:       'سجل الأحداث',
    clear:          'مسح',
    noEvents:       'لا توجد أحداث بعد...',
    cleared:        'تم مسح السجل...',
    device:         'الجهاز',
    localIp:        'IP المحلي',
    publicIp:       'IP الإنترنت',
    server:         'الخادم',
    connServer:     'الخادم',
    sessionTime:    'وقت الجلسة',
    active:         'نشط',
    errNoConfig:    '⚠ أدخل عنوان الخادم والـ Token أولاً',
    errNeedWs:      '⚠ العنوان يجب أن يبدأ بـ ws:// أو wss://',
    titleConnecting: 'جاري الاتصال...',
    titleConnected:  'متصل',
    titleError:      'خطأ',
    titleStopped:    'متوقف',
    lang:            'EN',
    uptimeFmt:       (h, m, s) => `${h ? h + 'س ' : ''}${m}د ${s}ث`,
    copied:          'تم النسخ',
    logCopied:       'تم نسخ السجل',
    logExported:     'تم تصدير السجل',
    deviceInfo:      'معلومات الجهاز',
    settingsTitle:   'الإعدادات',
    connectedToast:  'تم الاتصال بالخادم',
    screenActive:    'جارٍ مشاركة الشاشة',
    ctrlTitle:  'التحكم عن بُعد',
    ctrlHint:   'اختر كيف يُمنح التحكم من هذا الجهاز للمشاهد:',
    secCtrl:    'التحكم عن بُعد',
    secServer:  'الاتصال بالخادم',
    ctrlConsent:'موافقة يدوية (نافذة تأكيد عند كل طلب)',
    ctrlPwMode: 'كلمة سر (تُطلب من المتحكم)',
    ctrlPwLabel:'كلمة السر',
    saveCtrl:   'حفظ إعدادات التحكم',
    ctrlSaved:  'تم حفظ إعدادات التحكم',
    ctrlShort:  'كلمة السر قصيرة — 4 أحرف على الأقل',
    ctrlPwSet:  'كلمة السر مضبوطة ومفعّلة',
    ctrlClear:  'مسح كلمة السر',
    ctrlStateOn: 'محمي بكلمة سر — تُطلب من أي متحكم (سيرفر أو وكيل)',
    ctrlStateOff: 'يطلب موافقة يدوية في كل مرة',
    ctrlStateUnknown: 'جارٍ قراءة حالة الحماية…',
    ctrlWeak: 'ضعيفة', ctrlMedium: 'متوسطة', ctrlStrong: 'قوية',
    ctrlCleared: 'تم مسح كلمة السر — عاد الجهاز إلى الموافقة اليدوية',
    ctrlShow: 'إظهار', ctrlHide: 'إخفاء',
    sessPwRequired: 'الجهاز الهدف يتطلب كلمة سر — أدخلها ثم أعد الطلب.',
    sessPwWrong: 'كلمة السر غير صحيحة — تحقق منها وأعد المحاولة.',
    sessPwLocked: 'الجهاز مقفل مؤقتًا بعد محاولات فاشلة — أعد المحاولة بعد 5 دقائق.',
    sessDenied: 'رفض الطرف الآخر الطلب.',
  },
  en: {
    stopped:        'Stopped',
    connecting:     'Connecting...',
    connected:      'Connected',
    error:          'Connection Error',
    notConnected:   'Agent is not connected to any server',
    checkConfig:    'Check server URL and Token',
    start:          'Start',
    stop:           'Stop',
    reconnect:      'Reconnect',
    tabConn:        'Connection',
    serverUrl:      'Server URL (WebSocket)',
    serverHint:     'Example: wss://myserver.replit.app/ws',
    deviceToken:    'Device Token',
    tokenHint:      'Dashboard → Devices → Copy Token',
    autoStart:      'Auto-start when app opens',
    startMinimized: 'Start minimized to tray',
    saveSettings:   'Save Settings',
    saved:          'Saved ✓',
    resources:      'Device Resources',
    eventLog:       'Event Log',
    clear:          'Clear',
    noEvents:       'No events yet...',
    cleared:        'Log cleared...',
    device:         'Device',
    localIp:        'Local IP',
    publicIp:       'Public IP',
    server:         'Server',
    connServer:     'Server',
    sessionTime:    'Session',
    active:         'Active',
    errNoConfig:    '⚠ Enter server URL and Token first',
    errNeedWs:      '⚠ URL must start with ws:// or wss://',
    titleConnecting: 'Connecting...',
    titleConnected:  'Connected',
    titleError:      'Error',
    titleStopped:    'Stopped',
    lang:            'عربي',
    uptimeFmt:       (h, m, s) => `${h ? h + 'h ' : ''}${m}m ${s}s`,
    copied:          'Copied',
    logCopied:       'Log copied',
    logExported:     'Log exported',
    deviceInfo:      'Device Info',
    settingsTitle:   'Settings',
    connectedToast:  'Connected to server',
    screenActive:    'Screen sharing active',
    ctrlTitle:  'Remote Control',
    ctrlHint:   'Choose how remote control is granted from this device:',
    secCtrl:    'Remote control',
    secServer:  'Server connection',
    ctrlConsent:'Manual approval (confirm dialog each request)',
    ctrlPwMode: 'Password (required from the controller)',
    ctrlPwLabel:'Password',
    saveCtrl:   'Save control settings',
    ctrlSaved:  'Control settings saved',
    ctrlShort:  'Password too short — at least 4 characters',
    ctrlPwSet:  'Password is set and active',
    ctrlClear:  'Clear password',
    ctrlStateOn: 'Password protected — required from any controller (server or agent)',
    ctrlStateOff: 'Manual approval is requested each time',
    ctrlStateUnknown: 'Reading protection state…',
    ctrlWeak: 'Weak', ctrlMedium: 'Medium', ctrlStrong: 'Strong',
    ctrlCleared: 'Password cleared — the device is back to manual approval',
    ctrlShow: 'Show', ctrlHide: 'Hide',
    sessPwRequired: 'The target device requires a password — enter it and retry.',
    sessPwWrong: 'Wrong password — check it and try again.',
    sessPwLocked: 'The device is temporarily locked after failed attempts — retry in 5 minutes.',
    sessDenied: 'The other side refused the request.',
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id) }
let currentLang  = localStorage.getItem('lang')  || 'ar'
let currentTheme = localStorage.getItem('theme') || 'dark'
const html = document.documentElement

// ─── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 2200) {
  const wrap = $('toast-wrap')
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = msg
  wrap.appendChild(toast)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'))
  })
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => { if (toast.parentNode) toast.remove() }, 320)
  }, duration)
}

// ─── Copy helper ───────────────────────────────────────────────────────────
function copyText(text) {
  if (!text || text === '—') return
  navigator.clipboard.writeText(text).then(() => {
    showToast(LANG[currentLang].copied, 'success')
  }).catch(() => {})
}

// ─── Language ──────────────────────────────────────────────────────────────
function applyLang(lang) {
  currentLang = lang
  localStorage.setItem('lang', lang)
  html.setAttribute('lang', lang)
  html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
  $('lang-lbl').textContent = LANG[lang].lang
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')
    if (LANG[lang][key] !== undefined) el.textContent = LANG[lang][key]
  })
  $('inp-server').placeholder = 'wss://your-server.replit.app/ws'
  $('inp-token').placeholder  = lang === 'ar' ? 'أدخل الـ Token الخاص بهذا الجهاز' : 'Paste device token here'
  $('log-search').placeholder = lang === 'ar' ? 'بحث...' : 'Search...'
  if (currentState) applyStateLabels(currentState, lastDeviceId, lastServerUrl)
}

// ─── Theme ─────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  currentTheme = theme
  localStorage.setItem('theme', theme)
  html.setAttribute('data-theme', theme)
  $('icon-moon').style.display = theme === 'dark'  ? '' : 'none'
  $('icon-sun').style.display  = theme === 'light' ? '' : 'none'
}

$('btn-lang').addEventListener('click',  () => applyLang(currentLang  === 'ar' ? 'en' : 'ar'))
$('btn-theme').addEventListener('click', () => applyTheme(currentTheme === 'dark' ? 'light' : 'dark'))

// ─── Collapsible Sections ──────────────────────────────────────────────────
const COLL_DEFAULTS = { info: true, settings: false, stats: true, log: false }

function initCollapseSections() {
  Object.entries(COLL_DEFAULTS).forEach(([id, defaultCollapsed]) => {
    const stored = localStorage.getItem(`coll-${id}`)
    const shouldCollapse = stored !== null ? stored === '1' : defaultCollapsed
    if (shouldCollapse) {
      if (id === 'log') {
        document.getElementById('app').classList.add('log-mini')
      } else {
        const sec = $(`sec-${id}`)
        if (sec) sec.classList.add('collapsed')
      }
    } else {
      if (id !== 'log') {
        const sec = $(`sec-${id}`)
        if (sec) sec.classList.remove('collapsed')
      }
    }
  })
}

function toggleSection(id) {
  if (id === 'log') {
    const app = $('app')
    const isMini = app.classList.contains('log-mini')
    app.classList.toggle('log-mini', !isMini)
    localStorage.setItem('coll-log', isMini ? '0' : '1')
  } else {
    const sec = $(`sec-${id}`)
    if (!sec) return
    const wasCollapsed = sec.classList.contains('collapsed')
    sec.classList.toggle('collapsed', !wasCollapsed)
    localStorage.setItem(`coll-${id}`, wasCollapsed ? '0' : '1')
    if (id === 'info') updateInfoSummary()
    if (id === 'stats') updateStatsSummary()
  }
}

document.querySelectorAll('.sec-hdr[data-target]').forEach(btn => {
  btn.addEventListener('click', () => toggleSection(btn.dataset.target))
})
$('log-coll-btn').addEventListener('click', () => toggleSection('log'))

function updateInfoSummary() {
  const host = ($('inf-host').textContent || '').trim()
  const ip   = ($('inf-ip').textContent   || '').trim()
  const pub  = ($('inf-pubip').textContent || '').trim()
  const parts = [
    host !== '—' ? host : '',
    ip   !== '—' ? ip   : '',
    (pub && pub !== '—' && !pub.includes('•')) ? `(${pub})` : ''
  ].filter(Boolean)
  $('sum-info').textContent = parts.join('  ·  ')
}

function updateStatsSummary() {
  const cpu  = $('pct-cpu').textContent
  const ram  = $('pct-ram').textContent
  const disk = $('pct-disk').textContent
  if (cpu && cpu !== '—%') {
    $('sum-stats').textContent = `CPU ${cpu}  RAM ${ram}  Disk ${disk}`
  } else {
    $('sum-stats').textContent = ''
  }
}

// ─── Window Controls ───────────────────────────────────────────────────────
$('btn-min').addEventListener('click',   () => airemote.minimizeWin())
$('btn-tray').addEventListener('click',  () => airemote.hideWin())
$('btn-close').addEventListener('click', () => airemote.closeApp())

// ─── Token Eye ─────────────────────────────────────────────────────────────
let tokenVisible = false
$('btn-show-token').addEventListener('click', () => {
  tokenVisible = !tokenVisible
  $('inp-token').type = tokenVisible ? 'text' : 'password'
  $('eye-icon').innerHTML = tokenVisible
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
})

// ─── Info Grid Copy Buttons ────────────────────────────────────────────────
let fullDeviceId = ''

document.querySelectorAll('.info-copy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.copy
    if (targetId === 'inf-devid-full') {
      copyText(fullDeviceId || '—')
    } else {
      const el = $(targetId)
      if (el) {
        const txt = el.textContent.trim()
        if (txt && txt !== '—' && !el.querySelector('.ip-loading')) copyText(txt)
      }
    }
  })
})

// ─── Log State ─────────────────────────────────────────────────────────────
let activeLogFilter = 'all'
let logSearchQuery  = ''

document.querySelectorAll('.lf-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lf-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    activeLogFilter = btn.dataset.level
    applyLogFilter()
  })
})

$('log-search').addEventListener('input', () => {
  logSearchQuery = $('log-search').value.toLowerCase().trim()
  applyLogFilter()
})

function applyLogFilter() {
  const entries = $('log-box').querySelectorAll('.log-entry')
  entries.forEach(el => {
    const msg   = (el.querySelector('.log-msg')?.textContent || '').toLowerCase()
    const level = el.dataset.level || 'info'
    const matchSearch = !logSearchQuery || msg.includes(logSearchQuery)
    const matchLevel  = activeLogFilter === 'all' || level === activeLogFilter
    el.style.display  = matchSearch && matchLevel ? '' : 'none'
  })
}

// ─── Log Copy All ──────────────────────────────────────────────────────────
$('copy-log-btn').addEventListener('click', () => {
  const entries = $('log-box').querySelectorAll('.log-entry')
  const lines = [...entries].map(el => {
    const t = el.querySelector('.log-t')?.textContent   || ''
    const m = el.querySelector('.log-msg')?.textContent || ''
    return `[${t}] ${m}`
  }).join('\n')
  if (!lines) return
  navigator.clipboard.writeText(lines).then(() => {
    showToast(LANG[currentLang].logCopied, 'success')
  }).catch(() => {})
})

// ─── Log Export ────────────────────────────────────────────────────────────
$('export-log-btn').addEventListener('click', () => {
  const entries = $('log-box').querySelectorAll('.log-entry')
  const lines = [...entries].map(el => {
    const t = el.querySelector('.log-t')?.textContent   || ''
    const m = el.querySelector('.log-msg')?.textContent || ''
    return `[${t}] ${m}`
  }).join('\n')
  if (!lines) return
  const blob = new Blob([lines], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `airemote-log-${new Date().toISOString().slice(0, 10)}.txt`
  a.click()
  URL.revokeObjectURL(url)
  showToast(LANG[currentLang].logExported, 'info')
})

// ─── Log Clear ─────────────────────────────────────────────────────────────
$('clear-log').addEventListener('click', () => {
  $('log-box').innerHTML = `<div class="log-empty">${LANG[currentLang].cleared}</div>`
})

// ─── State ─────────────────────────────────────────────────────────────────
let currentState   = 'stopped'
let lastDeviceId   = null
let lastServerUrl  = ''
let statsInterval  = null
let sessionSeconds = 0

// ─── Uptime counter ──────────────────────────────────────────────────────────
let uptimeInterval = null

function startUptimeCounter(initial) {
  stopUptimeCounter()
  sessionSeconds = initial || 0
  renderUptime()
  uptimeInterval = setInterval(() => { sessionSeconds++; renderUptime() }, 1000)
}
function stopUptimeCounter() {
  if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null }
  $('stats-uptime').textContent = ''
  const el = $('strip-uptime')
  if (el) el.textContent = '—'
}
function renderUptime() {
  const h = Math.floor(sessionSeconds / 3600)
  const m = Math.floor((sessionSeconds % 3600) / 60)
  const s = sessionSeconds % 60
  const fmt = LANG[currentLang].uptimeFmt(h, m, s)
  $('stats-uptime').textContent = fmt
  const el = $('strip-uptime')
  if (el) el.textContent = fmt
}

function startStripUptime(initial) { startUptimeCounter(initial) }
function stopStripUptime()          { stopUptimeCounter() }

// ─── Agent Control ─────────────────────────────────────────────────────────
function getConnConfig() {
  return {
    serverUrl:      $('inp-server').value.trim(),
    token:          $('inp-token').value.trim(),
    autoStart:      $('chk-autostart').checked,
    startMinimized: $('chk-minimized').checked
  }
}

$('toggle-btn').addEventListener('click', () => {
  if (currentState === 'stopped' || currentState === 'error') doStart()
  else airemote.stopAgent()
})

$('reconnect-btn').addEventListener('click', () => {
  if (currentState !== 'stopped') {
    airemote.stopAgent()
    setTimeout(doStart, 800)
  } else {
    doStart()
  }
})

function doStart() {
  const cfg = getConnConfig()
  const t = LANG[currentLang]
  if (!cfg.serverUrl || !cfg.token) {
    flashError(!cfg.serverUrl ? $('inp-server') : $('inp-token'), t.errNoConfig)
    const sec = $('sec-settings')
    if (sec && sec.classList.contains('collapsed')) toggleSection('settings')
    return
  }
  if (!cfg.serverUrl.startsWith('ws://') && !cfg.serverUrl.startsWith('wss://')) {
    flashError($('inp-server'), t.errNeedWs)
    const sec = $('sec-settings')
    if (sec && sec.classList.contains('collapsed')) toggleSection('settings')
    return
  }
  airemote.startAgent(cfg)
}

// ─── Save Connection Config ─────────────────────────────────────────────────
$('save-btn').addEventListener('click', () => {
  const cfg = getConnConfig()
  const t = LANG[currentLang]
  if (cfg.serverUrl && !cfg.serverUrl.startsWith('ws://') && !cfg.serverUrl.startsWith('wss://')) {
    flashError($('inp-server'), t.errNeedWs); return
  }
  airemote.saveConfig(cfg)
  updateServerDisplay(cfg.serverUrl)
  const btn = $('save-btn')
  const origHtml = btn.innerHTML
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${t.saved}`
  btn.classList.add('saved')
  setTimeout(() => { btn.innerHTML = origHtml; btn.classList.remove('saved') }, 2500)
  showToast(t.saved, 'success')
})

// ── Remote Control Auth (v3.3.1) ────────────────────────────────────────
const ctrlPwField = $('ctrl-pw-field')
const ctrlPwInput = $('inp-ctrl-pw')
const ctrlStateEl = $('ctrl-pw-state')

function paintCtrlBadge(mode, hasPw) {
  const t = LANG[currentLang]
  const txt = $('ctrl-status-text'); const dot = $('ctrl-status-dot')
  const on = mode === 'password' && !!hasPw
  if (txt) txt.textContent = on ? t.ctrlStateOn : t.ctrlStateOff
  if (dot) dot.style.background = on ? '#22c55e' : '#f59e0b'
}
function paintCtrlStrength() {
  const t = LANG[currentLang]
  const bar = $('ctrl-pw-bar'); if (!bar) return
  const pw = ctrlPwInput ? String(ctrlPwInput.value || '') : ''
  let score = 0
  if (pw.length >= 4) score++
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const level = pw ? Math.min(3, Math.max(1, Math.ceil(score / 2))) : 0
  const colors = ['#64748b', '#ef4444', '#f59e0b', '#22c55e']
  const labels = ['', t.ctrlWeak, t.ctrlMedium, t.ctrlStrong]
  bar.style.width = (level ? level * 34 : 0) + '%'
  bar.style.background = colors[level]
  if (ctrlStateEl) ctrlStateEl.textContent = level ? labels[level] : ''
}
function applyCtrlMode(mode, hasPw) {
  const t = LANG[currentLang]
  const rb1 = $('ctrl-mode-consent'); const rb2 = $('ctrl-mode-password')
  if (rb1) rb1.checked = mode !== 'password'
  if (rb2) rb2.checked = mode === 'password'
  if (ctrlPwField) ctrlPwField.style.display = mode === 'password' ? '' : 'none'
  if (ctrlStateEl) ctrlStateEl.textContent = (mode === 'password' && hasPw) ? t.ctrlPwSet : ''
  paintCtrlBadge(mode, hasPw)
}
function refreshCtrlPwVisibility() {
  const rb2 = $('ctrl-mode-password')
  if (ctrlPwField) ctrlPwField.style.display = (rb2 && rb2.checked) ? '' : 'none'
}
{
  const rb1 = $('ctrl-mode-consent'); const rb2 = $('ctrl-mode-password')
  if (rb1) rb1.addEventListener('change', refreshCtrlPwVisibility)
  if (rb2) rb2.addEventListener('change', refreshCtrlPwVisibility)
}
const saveCtrlBtn = $('save-ctrl-btn')
if (saveCtrlBtn) {
  saveCtrlBtn.addEventListener('click', () => {
    const mode = ($('ctrl-mode-password') && $('ctrl-mode-password').checked) ? 'password' : 'consent'
    const pw   = ctrlPwInput ? ctrlPwInput.value : ''
    if (typeof airemote.saveControlAuth === 'function') airemote.saveControlAuth({ mode, password: pw })
  })
}
if (typeof airemote.onControlAuthState === 'function') {
  airemote.onControlAuthState(({ mode, ok, error, hasPassword }) => {
    const t = LANG[currentLang]
    if (error === 'short_password') { showToast(t.ctrlShort, 'error'); return }
    if (ok) {
      applyCtrlMode(mode, mode === 'password')
      if (ctrlPwInput) ctrlPwInput.value = ''
      showToast(t.ctrlSaved, 'success')
    } else {
      applyCtrlMode(mode || 'consent', !!hasPassword)
    }
  })
}
// 3.13.2 — الحقل الاحترافي: مؤشّر قوة + إظهار/إخفاء + مسح.
if (ctrlPwInput) ctrlPwInput.addEventListener('input', paintCtrlStrength)
{
  const eye = $('ctrl-pw-eye')
  if (eye && ctrlPwInput) {
    eye.addEventListener('click', () => {
      const t = LANG[currentLang]
      const show = ctrlPwInput.type === 'password'
      ctrlPwInput.type = show ? 'text' : 'password'
      eye.textContent = show ? t.ctrlHide : t.ctrlShow
    })
  }
  const clearBtn = $('clear-ctrl-btn')
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const t = LANG[currentLang]
      if (ctrlPwInput) ctrlPwInput.value = ''
      paintCtrlStrength()
      applyCtrlMode('consent', false)
      if (typeof airemote.saveControlAuth === 'function') airemote.saveControlAuth({ mode: 'consent', password: '' })
      showToast(t.ctrlCleared, 'success')
    })
  }
}

if (typeof airemote.getState === 'function') {
  airemote.getState().then(st => {
    try { applyCtrlMode((st && st.config && st.config.controlAuthMode) || 'consent', !!(st && st.config && st.config.hasControlPassword)) } catch {}
  }).catch(() => {})
}

// ─── Public IP ─────────────────────────────────────────────────────────────
let ipReceived = false

airemote.onPublicIp(ip => {
  ipReceived = true
  const el = $('inf-pubip')
  if (ip && ip.trim()) {
    el.textContent = ip.trim()
    el.classList.add('mono')
  } else {
    el.textContent = '—'
    el.classList.remove('mono')
  }
  updateInfoSummary()
})

setTimeout(() => {
  if (!ipReceived) {
    const el = $('inf-pubip')
    if (el && el.querySelector('.ip-loading')) {
      el.textContent = '—'
      el.classList.remove('mono')
      updateInfoSummary()
    }
  }
}, 9000)

// ─── State Management ───────────────────────────────────────────────────────
function applyState(state, deviceId, serverUrl, uptime) {
  currentState  = state
  lastDeviceId  = deviceId
  lastServerUrl = serverUrl || lastServerUrl
  applyStateLabels(state, deviceId, serverUrl || lastServerUrl)

  const connStrip = $('conn-strip')

  if (state === 'connected') {
    startStatsPolling()
    startStripUptime(uptime || 0)
    if (connStrip) connStrip.classList.remove('hidden')
    const stripServer = $('strip-server')
    if (stripServer) stripServer.textContent = resolveHost(serverUrl || lastServerUrl) || '—'
    const secStats = $('sec-stats')
    if (secStats && secStats.classList.contains('collapsed')) toggleSection('stats')
  } else if (state === 'connecting') {
    startStatsPolling()
    if (connStrip) connStrip.classList.remove('hidden')
    const stripServer = $('strip-server')
    if (stripServer) stripServer.textContent = resolveHost(serverUrl || lastServerUrl) || '—'
  } else {
    stopStatsPolling()
    stopStripUptime()
    resetStats()
    if (connStrip) connStrip.classList.add('hidden')
  }

  const t = LANG[currentLang]
  if (state === 'connected') showToast(`✅ ${t.connectedToast}`, 'success')
  if (state === 'error')     showToast(`❌ ${t.error}`, 'error')
}

function applyStateLabels(state, deviceId, serverUrl) {
  const t = LANG[currentLang]
  const card    = $('status-card')
  const dotWrap = $('dot-wrap')
  card.className    = state
  dotWrap.className = `status-dot-wrap ${state}`
  $('title-dot').className = `title-dot ${state}`

  const titleSep  = $('title-sep')
  const titleHost = $('title-host')
  const host = resolveHost(serverUrl)
  if ((state === 'connected' || state === 'connecting') && host) {
    if (titleSep)  titleSep.style.display  = ''
    if (titleHost) titleHost.textContent   = host
  } else {
    if (titleSep)  titleSep.style.display  = 'none'
    if (titleHost) titleHost.textContent   = ''
  }

  const META = {
    stopped:    { label: t.stopped,    sub: t.notConnected,                title: t.titleStopped    },
    connecting: { label: t.connecting, sub: resolveHost(serverUrl) || '—', title: t.titleConnecting },
    connected:  { label: t.connected,  sub: resolveHost(serverUrl) || '—', title: t.titleConnected  },
    error:      { label: t.error,      sub: t.checkConfig,                 title: t.titleError      }
  }
  const m = META[state] || { label: '—', sub: '—', title: '—' }
  $('status-label').textContent    = m.label
  $('status-sub').textContent      = m.sub
  $('title-state-lbl').textContent = m.title

  const btn = $('toggle-btn')
  btn.className = state
  if (state === 'stopped') {
    btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> ${t.start}`
  } else if (state === 'connecting') {
    btn.innerHTML = `<span class="dot-pulse"><span></span><span></span><span></span></span> ${t.connecting}`
  } else if (state === 'connected') {
    btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> ${t.stop}`
  } else {
    btn.innerHTML = `↺ ${t.reconnect}`
    btn.className = 'stopped'
  }

  fullDeviceId = deviceId || ''
  if (deviceId) {
    $('inf-devid').textContent = deviceId.length > 28
      ? deviceId.slice(0, 14) + '…' + deviceId.slice(-8)
      : deviceId
  } else {
    $('inf-devid').textContent = '—'
  }
  updateServerDisplay(serverUrl)
  updateInfoSummary()
}

function resolveHost(url) {
  if (!url) return null
  try {
    return new URL(url.replace(/^wss?:\/\//, m => m === 'wss://' ? 'https://' : 'http://')).hostname
  } catch { return url }
}

function updateServerDisplay(url) {
  $('inf-server').textContent = resolveHost(url) || '—'
  updateInfoSummary()
}

// ─── Stats ──────────────────────────────────────────────────────────────────
function startStatsPolling() {
  if (statsInterval) return
  pollStats()
  statsInterval = setInterval(pollStats, 8000)
}
function stopStatsPolling() {
  if (statsInterval) { clearInterval(statsInterval); statsInterval = null }
}
async function pollStats() {
  try { const s = await airemote.getStatsNow(); if (s) applyStats(s) } catch {}
}
function applyStats(s) {
  setBar($('bar-cpu'),  $('pct-cpu'),  s.cpuPercent,  s.cpuPercent  > 85)
  setBar($('bar-ram'),  $('pct-ram'),  s.ramPercent,  s.ramPercent  > 85)
  setBar($('bar-disk'), $('pct-disk'), s.diskPercent, s.diskPercent > 90)
  const ramUsed  = (s.ramUsedMb  / 1024).toFixed(1)
  const ramTotal = (s.ramTotalMb / 1024).toFixed(1)
  const disk = s.diskTotalGb > 0 ? `${s.diskUsedGb}/${s.diskTotalGb} GB` : `${s.diskPercent}%`
  $('stat-detail').textContent = `RAM: ${ramUsed}/${ramTotal} GB  ·  Disk C: ${disk}`
  updateStatsSummary()
}
function setBar(bar, lbl, val, danger) {
  const pct = Math.min(Math.max(val || 0, 0), 100)
  bar.style.width = `${pct}%`
  bar.classList.toggle('danger', danger)
  lbl.textContent = `${pct}%`
}
function resetStats() {
  ;[$('bar-cpu'), $('bar-ram'), $('bar-disk')].forEach(b => {
    b.style.width = '0%'; b.classList.remove('danger')
  })
  $('pct-cpu').textContent = $('pct-ram').textContent = $('pct-disk').textContent = '—%'
  $('stat-detail').textContent = '—'
  $('sum-stats').textContent = ''
}

// ─── IPC Stats (from heartbeat) ─────────────────────────────────────────────
airemote.onStats(s => { if (s) applyStats(s) })

// ─── Screen Session Status ───────────────────────────────────────────────────
let prevScreenCount = 0

if (typeof airemote.onScreenSessions === 'function') {
  airemote.onScreenSessions(({ count }) => {
    const sep    = $('strip-screen-sep')
    const item   = $('strip-screen-item')
    const banner = $('screen-banner')
    const bannerText = $('screen-banner-text')

    if (count > 0) {
      if (sep)    sep.style.display  = ''
      if (item)   item.style.display = ''
      if (banner) banner.classList.remove('hidden')
      if (bannerText) {
        const t = LANG[currentLang]
        bannerText.textContent = t.screenActive
          ? (count > 1 ? `${t.screenActive} (${count})` : t.screenActive)
          : (count > 1 ? `Screen sharing active (${count})` : 'Screen sharing active')
      }
      if (prevScreenCount === 0) {
        showToast(
          currentLang === 'ar' ? `🖥️ جارٍ مشاركة الشاشة` : `🖥️ Screen sharing active`,
          'warn', 3000
        )
      }
    } else {
      if (sep)    sep.style.display  = 'none'
      if (item)   item.style.display = 'none'
      if (banner) banner.classList.add('hidden')
      const privBadge = $('screen-privacy-badge')
      if (privBadge) privBadge.classList.add('hidden')
      if (prevScreenCount > 0) {
        showToast(
          currentLang === 'ar' ? `🖥️ انتهت مشاركة الشاشة` : `🖥️ Screen sharing ended`,
          'info', 2500
        )
      }
    }
    prevScreenCount = count
  })
}

// ─── Privacy Mode Indicator ──────────────────────────────────────────────────
if (typeof airemote.onScreenPrivacy === 'function') {
  airemote.onScreenPrivacy(({ enabled }) => {
    const badge = $('screen-privacy-badge')
    if (badge) badge.classList.toggle('hidden', !enabled)
    showToast(
      enabled
        ? (currentLang === 'ar' ? '🔒 وضع الخصوصية مُفعَّل' : '🔒 Privacy mode enabled')
        : (currentLang === 'ar' ? '🔓 وضع الخصوصية مُلغى'  : '🔓 Privacy mode disabled'),
      enabled ? 'warn' : 'info',
      2500
    )
  })
}

// ─── Logging ────────────────────────────────────────────────────────────────
function appendLog(entry) {
  const box = $('log-box')
  const empty = box.querySelector('.log-empty')
  if (empty) empty.remove()

  const el = document.createElement('div')
  el.className = 'log-entry'
  el.dataset.level = entry.level || 'info'
  el.innerHTML = `<span class="log-t">${esc(entry.t)}</span><span class="log-msg ${entry.level || ''}">${esc(entry.msg)}</span>`

  const msg = (entry.msg || '').toLowerCase()
  const matchSearch = !logSearchQuery || msg.includes(logSearchQuery)
  const matchLevel  = activeLogFilter === 'all' || (entry.level || 'info') === activeLogFilter
  if (!matchSearch || !matchLevel) el.style.display = 'none'

  box.appendChild(el)
  while (box.children.length > 200) box.removeChild(box.firstChild)

  if (!document.getElementById('app').classList.contains('log-mini')) {
    box.scrollTop = box.scrollHeight
  }
}

airemote.onLog(entry => appendLog(entry))

// ─── T006: In-session chat panel ──────────────────────────────────────────────
let chatUnread = 0

function showChatSection() {
  try { if (window.__switchTab) window.__switchTab('viewers') } catch (e) {}
  const sec = $('chat-section')
  if (sec) sec.classList.remove('hidden')
}

function appendChatMessage({ text, sender, ts }) {
  const box = $('chat-messages')
  if (!box) return
  const empty = box.querySelector('.chat-empty')
  if (empty) empty.remove()

  const isHost   = sender === 'host'
  const timeStr  = new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const senderLbl = isHost
    ? (currentLang === 'ar' ? 'أنت' : 'You')
    : (currentLang === 'ar' ? 'المشاهد' : 'Viewer')

  const el = document.createElement('div')
  el.className = `chat-msg ${isHost ? 'chat-msg--host' : 'chat-msg--viewer'}`
  el.innerHTML = `
    <div class="chat-meta">
      <span class="chat-sender">${esc(senderLbl)}</span>
      <span class="chat-time">${esc(timeStr)}</span>
    </div>
    <div class="chat-bubble">${esc(text)}</div>
  `
  box.appendChild(el)
  while (box.children.length > 120) box.removeChild(box.firstChild)
  box.scrollTop = box.scrollHeight
}

function updateChatUnread(delta) {
  chatUnread = Math.max(0, chatUnread + delta)
  const badge = $('chat-unread-badge')
  if (!badge) return
  if (chatUnread > 0) {
    badge.textContent = chatUnread > 9 ? '9+' : String(chatUnread)
    badge.classList.remove('hidden')
  } else {
    badge.classList.add('hidden')
  }
}

if (typeof airemote.onScreenChat === 'function') {
  airemote.onScreenChat(({ text, sender, ts }) => {
    appendLog({ level: 'info', msg: `💬 ${sender}: ${text}`, ts: ts || Date.now() })
    appendChatMessage({ text, sender: sender || 'viewer', ts })
    updateChatUnread(+1)
    // Do not steal the current tab; the unread badge is enough while focused.
    // A native toast is shown by main.js only when the window is in the background.
  })
}

if (typeof airemote.onOpenChatSection === 'function') {
  airemote.onOpenChatSection(() => {
    showChatSection()
    updateChatUnread(-chatUnread)
    if (chatInput) setTimeout(() => chatInput.focus(), 150)
  })
}

// Chat send
const chatInput   = $('chat-input')
const chatSendBtn = $('chat-send-btn')

function doSendChat() {
  if (!chatInput) return
  const text = chatInput.value.trim()
  if (!text) return
  if (typeof airemote.sendChat === 'function') {
    airemote.sendChat({ text })
    showChatSection()
  }
  chatInput.value = ''
  if (chatSendBtn) chatSendBtn.disabled = true
}

if (chatInput) {
  chatInput.addEventListener('input', () => {
    if (chatSendBtn) chatSendBtn.disabled = !chatInput.value.trim()
  })
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSendChat() }
  })
}

if (chatSendBtn) {
  chatSendBtn.addEventListener('click', doSendChat)
}

const chatClearBtn = $('chat-clear-btn')
if (chatClearBtn) {
  chatClearBtn.addEventListener('click', () => {
    const box = $('chat-messages')
    if (!box) return
    box.innerHTML = '<div class="chat-empty" id="chat-empty">لا توجد رسائل بعد...</div>'
    updateChatUnread(-chatUnread)
  })
}

// ── Chat Collapse Toggle ──────────────────────────────────────────────────
const chatCollapseBtn = $('chat-collapse-btn')
if (chatCollapseBtn) {
  // Restore saved state
  if (localStorage.getItem('chat-collapsed') === '1') {
    const sec = $('chat-section')
    if (sec) sec.classList.add('collapsed')
  }
  chatCollapseBtn.addEventListener('click', () => {
    const sec = $('chat-section')
    if (!sec) return
    const collapsed = sec.classList.toggle('collapsed')
    localStorage.setItem('chat-collapsed', collapsed ? '1' : '0')
    if (!collapsed) {
      const box = $('chat-messages')
      if (box) box.scrollTop = box.scrollHeight
    }
  })
}

// ── Chat Pop-out Window ───────────────────────────────────────────────────
const chatPopoutBtn = $('chat-popout-btn')
if (chatPopoutBtn) {
  chatPopoutBtn.addEventListener('click', () => {
    if (typeof airemote.openChatWindow === 'function') {
      airemote.openChatWindow({ theme: currentTheme })
    }
  })
}

if (typeof airemote.onChatWindowStatus === 'function') {
  airemote.onChatWindowStatus(({ open }) => {
    const sec = $('chat-section')
    if (sec) sec.classList.toggle('popped-out', open)
    if (chatPopoutBtn) chatPopoutBtn.classList.toggle('active', open)
    // When popped out, also collapse to save space
    if (open && sec && !sec.classList.contains('collapsed')) {
      sec.classList.add('collapsed')
    } else if (!open && sec) {
      // Restore uncollapsed when window closes
      sec.classList.remove('collapsed')
      localStorage.removeItem('chat-collapsed')
    }
  })
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── State IPC ───────────────────────────────────────────────────────────────
airemote.onState(data => {
  applyState(data.state, data.deviceId, data.serverUrl, data.uptime)
})

// ─── Flash helpers ───────────────────────────────────────────────────────────
function flashError(el, msg) {
  el.style.borderColor = 'var(--red)'
  el.style.boxShadow   = '0 0 0 3px rgba(239,68,68,.15)'
  el.title = msg
  setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; el.title = '' }, 3000)
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') airemote.hideWin()
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); toggleSection('info') }
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); toggleSection('log') }
})

// ─── Init ────────────────────────────────────────────────────────────────────
airemote.onInit(data => {
  const { config, logs, state, deviceId, serverUrl, hostname, ipLocal, ipPublic, platform } = data

  $('inp-server').value         = config.serverUrl       || ''
  $('inp-token').value          = config.token           || ''
  $('chk-autostart').checked    = config.autoStart      || false
  $('chk-minimized').checked    = config.startMinimized || false

  $('inf-host').textContent  = hostname || '—'
  $('inf-ip').textContent    = ipLocal  || '—'
  $('footer-os').textContent = platform || 'Windows'

  if (ipPublic && ipPublic.trim()) {
    ipReceived = true
    $('inf-pubip').textContent = ipPublic.trim()
    $('inf-pubip').classList.add('mono')
  }

  initCollapseSections()
  updateInfoSummary()
  updateStatsSummary()

  applyLang(currentLang)
  applyTheme(currentTheme)

  if (state && state !== 'stopped') {
    applyState(state, deviceId, serverUrl, data.uptime || 0)
  } else {
    applyStateLabels('stopped', deviceId, serverUrl)
    updateServerDisplay(serverUrl)
  }

  if (logs && logs.length) {
    logs.forEach(entry => appendLog(entry))
  }

  if (config.autoStart && config.serverUrl && config.token && state === 'stopped') {
    setTimeout(doStart, 800)
  }
})

// ── 3.9.0 — الاتصال بجهاز آخر (طلب + موافقة) ────────────────────────────────
;(function initAgentSessionUI () {
  const $id = (id) => document.getElementById(id)
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  // P3 — قائمة منسدلة احترافية: تُبنى من /api/relay/devices عبر IPC، بدل رمز من 9 أرقام.
  // كل خيار يعرض الاسم والمنصّة وحالة الاتصال، وقيمته معرّف الجهاز الذي يقبله السيرفر.
  async function loadDevices () {
    const sel = $id('session-device')
    if (!sel) return
    const cur = sel.value
    sel.disabled = true
    sel.innerHTML = '<option value="">جارٍ جلب الأجهزة…</option>'
    let r = null
    try { r = await window.airemote.relayDevices() } catch (e) { r = { ok: false, error: String((e && e.message) || e) } }
    if (!r || !r.ok) {
      sel.innerHTML = '<option value="">تعذّر جلب الأجهزة</option>'
      sel.disabled = false
      setState('تعذّر جلب الأجهزة: ' + ((r && (r.error || (r.data && r.data.code))) || 'خطأ'))
      return
    }
    const list = (r.data && (r.data.devices || r.data)) || []
    const devices = Array.isArray(list) ? list : []
    if (!devices.length) {
      sel.innerHTML = '<option value="">لا توجد أجهزة أخرى في حسابك</option>'
      sel.disabled = false
      return
    }
    sel.innerHTML = '<option value="">— اختر جهازاً —</option>' + devices.map((d) => {
      const name = String(d.name || d.id || '')
      const mark = d.online ? '● متصل' : '○ غير متصل'
      const kind = d.platform === 'android' ? 'أندرويد' : (d.platform === 'windows' ? 'ويندوز' : '')
      // P5-fix — أظهر أن الجهاز داخل جلسة وكيل↔وكيل الآن.
      const ses = d.session === 'active' ? ' · في جلسة' : (d.session === 'requested' ? ' · طلب معلّق' : '')
      return '<option value="' + esc(d.id) + '">' + esc(name + (kind ? ' · ' + kind : '') + ' — ' + mark + ses) + '</option>'
    }).join('')
    if (cur && devices.some((d) => String(d.id) === cur)) sel.value = cur
    sel.disabled = false
  }
  let pending = null
  let pendingTimer = null

  function setState (text) { const el = $id('session-state'); if (el) el.textContent = text || '' }
  function showPw (show) { const f = $id('session-pw-field'); if (f) f.style.display = show ? '' : 'none' }

  // P4 — قسم «الجلسات»: نفس الصياغة على المنصّتين (الطالب ← الهدف · الوصول · الحالة).
  async function loadSessions () {
    const box = $id('sessions-list')
    if (!box) return
    box.innerHTML = '<div class="session-row muted">جارٍ التحميل…</div>'
    let r = null
    try { r = await window.airemote.relaySessions() } catch (e) { r = { ok: false, error: String((e && e.message) || e) } }
    if (!r || !r.ok) { box.innerHTML = '<div class="session-row muted">تعذّر جلب الجلسات</div>'; return }
    const list = (r.data && (r.data.sessions || r.data)) || []
    const rows = (Array.isArray(list) ? list : []).filter((s) => ['requested', 'active', 'suspended'].includes(String(s.state || '')))
    if (!rows.length) { box.innerHTML = '<div class="session-row muted">لا جلسات نشطة</div>'; return }
    const stLabel = { requested: 'بانتظار الموافقة', active: 'نشطة', suspended: 'معلّقة' }
    const accLabel = { view: 'عرض', control: 'تحكم', files: 'ملفات' }
    box.innerHTML = rows.map((s) => {
      // السيرفر يعيد حقولاً مسطّحة (requesterName/targetName) لا كائناً متداخلاً.
      const who = s.requesterName || 'جهاز'
      const to = s.targetName || s.targetDeviceId || ''
      return '<div class="session-row">' + esc(who + ' ← ' + to) + ' · ' + esc(accLabel[s.access] || s.access || '') + ' · ' + esc(stLabel[s.state] || s.state) + '</div>'
    }).join('')
  }

  async function request () {
    const pick = $id('session-device')
    const targetDeviceId = pick ? pick.value : ''
    if (!targetDeviceId) { setState('اختر جهازاً من القائمة أولاً.'); return }
    const access = (document.querySelector('input[name="session-access"]:checked') || {}).value || 'view'
    const password = ($id('session-pw').value || '').trim()
    setState('جارٍ إرسال الطلب…')
    const r = await window.airemote.relayRequest({ targetDeviceId, access, password: password || undefined })
    if (!r || !r.ok) {
      const d = (r && r.data) || {}
      if (d.code === 'password_required' || d.code === 'control_password_required') {
        showPw(true)
        setState('هذا الجهاز يتطلب كلمة مرور التحكم — أدخلها ثم اضغط «طلب الاتصال» مرة أخرى.')
        const f = $id('session-pw'); if (f) f.focus()
        return
      }
      // 3.13.1 — رسائل واضحة لبقية حالات كلمة السر بدل رمز خام (bad_password / password_locked).
      if (d.code === 'bad_password') { showPw(true); setState('كلمة المرور غير صحيحة' + (d.attemptsLeft ? ' — تبقّى ' + d.attemptsLeft + ' محاولة' : '')); return }
      if (d.code === 'password_locked') { setState('مقفل مؤقتًا بعد محاولات فاشلة — أعد المحاولة بعد دقائق.'); return }
      setState('تعذّر الطلب: ' + (d.code || (r && r.error) || 'خطأ'))
      return
    }
    showPw(false)
    const until = Date.now() + 60000
    setState('بانتظار موافقة الطرف الآخر (60 ثانية)…')
    if (pendingTimer) clearInterval(pendingTimer)
    pendingTimer = setInterval(() => {
      const left = Math.max(0, Math.round((until - Date.now()) / 1000))
      if (left <= 0) { clearInterval(pendingTimer); pendingTimer = null; setState('انتهت مهلة الطلب.') }
      else setState('بانتظار موافقة الطرف الآخر (' + left + 'ث)…')
    }, 1000)
  }

  function showOffer (offer) {
    pending = offer || {}
    const b = $id('offer-body')
    if (b) {
      const who = (pending.requester && (pending.requester.name || pending.requester.email)) || 'جهاز'
      b.textContent = who + ' يطلب ' + (pending.accessLabel || pending.access || '') +
        ' — المهلة ' + Math.round((pending.expiresInMs || 60000) / 1000) + ' ثانية.'
    }
    const m = $id('session-offer'); if (m) m.style.display = 'flex'
    setTimeout(() => { const a = $id('offer-accept'); if (a) a.focus() }, 40)
  }

  async function decide (accept) {
    if (!pending || !pending.sessionId) return
    await window.airemote.sessionDecision({ sessionId: pending.sessionId, accept })
    const m = $id('session-offer'); if (m) m.style.display = 'none'
    setState(accept ? 'تم السماح — ستُفتح نافذة العرض.' : 'تم الرفض.')
    pending = null
  }

  function bind () {
    const pick = $id('session-device')
    if (!pick) return
    const refresh = $id('session-refresh')
    if (refresh) refresh.addEventListener('click', loadDevices)
    const sref = $id('sessions-refresh')
    if (sref) sref.addEventListener('click', loadSessions)
    $id('session-request-btn').addEventListener('click', request)
    loadDevices()
    loadSessions()
    $id('offer-accept').addEventListener('click', () => decide(true))
    $id('offer-deny').addEventListener('click', () => decide(false))
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind)
  else bind()
  // 3.13.1 — اختيار «تحكم كامل» يُظهر حقل كلمة المرور فورًا (الجهاز قد يطلبها).
  document.querySelectorAll('input[name="session-access"]').forEach((el) => {
    el.addEventListener('change', () => { if (el.checked && el.value === 'control') showPw(true) })
  })

  if (window.airemote && window.airemote.onSessionOffer) window.airemote.onSessionOffer(showOffer)

  // 3.13.2 — رفض الطلب: رسالة محدّدة حسب السبب (كلمة ناقصة/خاطئة/مقفل/رفض صريح).
  if (window.airemote && window.airemote.onSessionDenied) {
    window.airemote.onSessionDenied(function (p) {
      const t = LANG[currentLang]
      const reason = String((p && p.reason) || '')
      if (pendingTimer) { clearInterval(pendingTimer); pendingTimer = null }
      if (reason === 'password_required') { showPw(true); setState(t.sessPwRequired); const f = $id('session-pw'); if (f) f.focus(); return }
      if (reason === 'bad_password') { showPw(true); setState(t.sessPwWrong); return }
      if (reason === 'password_locked') { setState(t.sessPwLocked); return }
      setState(t.sessDenied + (reason ? ' (' + reason + ')' : ''))
    })
  }

  // 3.9.0 — إخفاء حوار العرض عند انتهاء/إغلاق الجلسة
  if (window.airemote && window.airemote.onSessionClosed) {
    window.airemote.onSessionClosed(function () {
      const m = $id('session-offer'); if (m) m.style.display = 'none'
      setState('انتهت الجلسة أو أُغلقت.')
    })
  }
})()