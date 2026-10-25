'use strict';
// AiRemote Agent — on-device AI assistant (v3.4.0)
(function () {
  const $ = (id) => document.getElementById(id)
  let msgs = []          // {role:'user'|'bot', text, streaming?, error?}
  let streaming = false
  let curBot = null
  let renderTimer = null
  let liveReply = false

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  function isDangerous(code) {
    return /(\brm\s+-rf|\bdel\s+[^\n]*\/[fqs]|Remove-Item|\brd\s+\/s|rmdir\s+\/s|\bformat\b\s+[a-zA-Z]:|diskpart|Clear-Disk|Initialize-Disk|\bshutdown\b|Stop-Computer|Restart-Computer|taskkill[^\n]*\/f|\breg\s+delete|\bsc\s+delete|net\s+user[^\n]*\/delete|cipher\s+\/w|bcdedit)/i.test(code || '')
  }

  function parseParts(text) {
    const parts = []
    const lines = String(text || '').split('\n')
    let mode = 'text'
    let buf = []
    let lang = ''
    for (const ln of lines) {
      const t = ln.trim()
      if (mode === 'text' && t.startsWith('```')) {
        if (buf.length) parts.push({ type: 'text', content: buf.join('\n') })
        buf = []
        lang = t.slice(3).trim().toLowerCase()
        mode = 'code'
        continue
      }
      if (mode === 'code' && t.startsWith('```')) {
        parts.push({ type: 'code', lang, content: buf.join('\n') })
        buf = []
        mode = 'text'
        continue
      }
      buf.push(ln)
    }
    if (buf.length) parts.push({ type: mode, lang, content: buf.join('\n') })
    return parts
  }

  const EXEC_LANGS = ['powershell', 'ps1', 'bash', 'cmd', 'shell', 'control', 'screenshot', 'record']

  function buildMsgHtml(m, idx) {
    const role = m.role === 'user' ? 'user' : 'bot'
    let inner = ''
    if (m.error) inner += '<div class="ai-error-text">خطأ: ' + esc(m.error) + '</div>'
    const parts = parseParts(m.text)
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k]
      if (p.type === 'text') {
        if (p.content.trim()) inner += '<div class="ai-text">' + esc(p.content).replace(/\n/g, '<br>') + '</div>'
      } else {
        const pl = (p.lang || '').toLowerCase()
        const execable = EXEC_LANGS.includes(pl)
        const bid = 'b' + idx + '_' + k
        inner += '<div class="ai-block" data-lang="' + esc(pl) + '" id="' + bid + '">' +
          '<div class="ai-block-header"><span class="ai-block-lang">' + esc(pl || 'code') + '</span><div class="ai-block-btns">' +
          '<button class="ai-mini" data-act="copy" data-bid="' + bid + '" data-k="' + k + '">نسخ</button>' +
          (execable ? '<button class="ai-mini ai-mini-run" data-act="run" data-bid="' + bid + '" data-k="' + k + '">تنفيذ</button>' : '') +
          '</div></div>' +
          '<pre class="ai-block-pre">' + esc(p.content) + '</pre>' +
          '<div class="ai-block-result" id="' + bid + '_r"></div>' +
          '</div>'
      }
    }
    if (role === 'user') {
      inner += '<div class="ai-msg-actions">' +
        '<button class="ai-mini" data-act="copy-msg" data-midx="' + idx + '">نسخ</button>' +
        '<button class="ai-mini" data-act="resend-msg" data-midx="' + idx + '">إعادة إرسال</button>' +
        '</div>'
    }
    return '<div class="ai-msg ai-msg--' + role + '"><div class="ai-bubble">' + inner + (m.streaming ? '<span class="ai-cursor"></span>' : '') + '</div></div>'
  }

  function render() {
    const el = $('ai-messages')
    if (!el) return
    el.innerHTML = msgs.map((m, i) => buildMsgHtml(m, i)).join('')
    el.scrollTop = el.scrollHeight
    const empty = $('ai-empty')
    if (empty) empty.style.display = msgs.length ? 'none' : 'block'
  }

  function setStatus(txt) {
    const el = $('ai-status')
    if (el) el.textContent = txt || ''
  }

  function updateComposer() {
    const inp = $('ai-input')
    const sendBtn = $('ai-send-btn')
    const stopBtn = $('ai-stop-btn')
    if (inp) inp.disabled = false
    if (sendBtn) sendBtn.disabled = streaming || !inp || !inp.value.trim()
    if (stopBtn) stopBtn.classList.toggle('hidden', !streaming)
  }

  function send() {
    const inp = $('ai-input')
    if (!inp || streaming) return
    const text = inp.value.trim()
    if (!text) return
    inp.value = ''
    msgs.push({ role: 'user', text })
    curBot = { role: 'bot', text: '', streaming: true }
    msgs.push(curBot)
    streaming = true
    liveReply = true
    setStatus('...')
    render()
    updateComposer()
    try { window.airemote.aiSend(text) } catch (e) { onError({ error: String((e && e.message) || e) }) }
  }

  async function autoRunBlocks(m) {
    try {
      const idx = msgs.indexOf(m)
      if (idx < 0) return
      const parts = parseParts(m.text)
      const todo = []
      for (let k = 0; k < parts.length; k++) {
        const p = parts[k]
        const pl = (p.lang || '').toLowerCase()
        if (!EXEC_LANGS.includes(pl)) continue
        if (pl === 'record') continue
        if (isDangerous(p.content)) continue
        todo.push({ k, pl })
      }
      if (!todo.length) return
      setStatus('تنفيذ تلقائي...')
      for (const t of todo) {
        await runBlock('b' + idx + '_' + t.k, t.k, idx, null)
        await new Promise(r => setTimeout(r, 400))
      }
      setStatus('')
    } catch (e) { setStatus('') }
  }

  async function runBlock(bid, k, mIdx, btn) {
    const m = msgs[mIdx]
    if (!m) return
    const part = parseParts(m.text)[k]
    const res = $(bid + '_r')
    if (!part || !res) return
    if (isDangerous(part.content) && !(btn && btn.dataset.confirmed)) {
      res.innerHTML = '<div class="ai-danger">أمر خطير — يتطلب تأكيداً صريحاً قبل التنفيذ. ' +
        '<button class="ai-mini ai-mini-danger" data-act="run" data-bid="' + bid + '" data-k="' + k + '" data-confirmed="1">تأكيد التنفيذ</button></div>'
      return
    }
    const mIdx2 = parseInt((bid.match(/^b(\d+)_/) || [])[1] || '0', 10)
    res.innerHTML = '<div class="ai-running">جاري التنفيذ…</div>'
    try {
      const r = await window.airemote.aiRunBlock(part.lang, part.content)
      let html = ''
      if (r && r.image) html += '<img class="ai-shot" src="' + r.image + '" alt="screenshot">'
      const out = String((r && r.out) || '').trim()
      const err = String((r && r.err) || '').trim()
      html += '<div class="ai-res-head ' + (r && r.ok ? 'ok' : 'bad') + '">' + (r && r.ok ? 'تم التنفيذ' : 'فشل التنفيذ') + (r && r.code != null ? ' (exit ' + r.code + ')' : '') + '</div>'
      if (out) html += '<pre class="ai-res-pre">' + esc(out.slice(0, 2500)) + '</pre>'
      if (err) html += '<pre class="ai-res-pre bad">' + esc(err.slice(0, 1200)) + '</pre>'
      const resNow = $(bid + '_r') || res
      resNow.innerHTML = html
    } catch (e) {
      const resNow2 = $(bid + '_r') || res
      resNow2.innerHTML = '<pre class="ai-res-pre bad">' + esc(String((e && e.message) || e)) + '</pre>'
    }
  }

  function translateError(raw) {
    const e = String(raw || '')
    if (/FREE_LIMIT|1 reply every 30 seconds|Retry after/i.test(e)) return 'المزود المجاني يسمح برد واحد كل ~30 ثانية. انتظر قليلاً ثم أعد الإرسال.'
    if (/HTTP 401|Unauthorized/i.test(e)) return 'تعذر التحقق من الجهاز — تأكد من رمز الجهاز في إعدادات الوكيل.'
    if (/HTTP 404/.test(e)) return 'مسار الخادم غير صحيح — تحقق من عنوان الخادم (يجب أن ينتهي بـ /ws فقط).'
    if (/fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|network|Failed to fetch/i.test(e)) return 'تعذر الوصول إلى الخادم — تحقق من الاتصال وعنوان الخادم.'
    if (/HTTP 5\d\d/.test(e)) return 'خطأ في الخادم أثناء معالجة الطلب. راجع سجل الخادم.'
    return e || 'خطأ غير معروف'
  }

  function onError(d) {
    const em = translateError((d && d.error) || '')
    if (curBot && !curBot.text.trim()) {
      msgs.pop()
      curBot = null
      msgs.push({ role: 'bot', text: '', error: em })
    } else if (curBot) {
      curBot.streaming = false
      curBot = null
      msgs.push({ role: 'bot', text: '', error: em })
    } else {
      msgs.push({ role: 'bot', text: '', error: em })
    }
    streaming = false
    setStatus('')
    render()
    updateComposer()
  }

  function escA(s) { return esc(s).replace(/"/g, '&quot;') }
  function fmtDate(s) { try { const d = new Date(s); return d.toLocaleDateString('ar', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) } catch (e) { return '' } }
  async function refreshHist() {
    const box = $('ai-hist')
    if (!box) return
    box.innerHTML = '<div class="ai-hist-empty">جارٍ التحميل…</div>'
    try {
      const r = await window.airemote.aiListConversations()
      const list = (r && r.ok && Array.isArray(r.conversations)) ? r.conversations : []
      if (!list.length) { box.innerHTML = '<div class="ai-hist-empty">لا محادثات سابقة</div>'; return }
      box.innerHTML = list.map(function (c) {
        return '<div class="ai-hist-row" data-id="' + escA(c.id) + '"><div class="ai-hist-main"><div class="ai-hist-title">' + escA(c.title || 'محادثة') + '</div><div class="ai-hist-date">' + escA(fmtDate(c.updated_at)) + '</div></div><button class="ai-mini ai-hist-del" data-del="' + escA(c.id) + '">حذف</button></div>'
      }).join('')
    } catch (e) { box.innerHTML = '<div class="ai-hist-empty">فشل التحميل</div>' }
  }
  function toggleHist() {
    const box = $('ai-hist')
    if (!box) return
    const willShow = box.classList.contains('hidden')
    box.classList.toggle('hidden', !willShow)
    if (willShow) refreshHist()
  }
  async function loadConversation(id) {
    try {
      const r = await window.airemote.aiLoadConversation(id)
      if (!r || !r.ok) { setStatus('فشل تحميل المحادثة'); return }
      msgs = (r.messages || []).filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant') && m.content })
        .map(function (m) { return { role: m.role === 'user' ? 'user' : 'bot', text: String(m.content) } })
      curBot = null
      streaming = false
      liveReply = false
      try { window.airemote.aiSetConversation(id) } catch (e) {}
      const box = $('ai-hist'); if (box) box.classList.add('hidden')
      render()
      updateComposer()
      setStatus('')
    } catch (e) { setStatus('فشل التحميل') }
  }
  async function deleteConversation(id) {
    try { await window.airemote.aiDeleteConversation(id); refreshHist() } catch (e) {}
  }

  function init() {
    const sec = $('ai-section')
    if (!sec) return
    const inp = $('ai-input')
    const sendBtn = $('ai-send-btn')

    if (window.airemote) {
      window.airemote.onAiDelta((d) => {
        if (!curBot) return
        curBot.text += (d && d.delta) || ''
        if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; render() }, 120)
      })
      window.airemote.onAiDone(() => {
        const done = curBot
        if (curBot) { curBot.streaming = false; curBot = null }
        streaming = false
        if (renderTimer) { clearTimeout(renderTimer); renderTimer = null }
        setStatus('')
        render()
        updateComposer()
        if (liveReply && done && done.text && done.text.trim()) {
          liveReply = false
          autoRunBlocks(done)
        } else { liveReply = false }
      })
      window.airemote.onAiError(onError)
    }

    if (sendBtn) sendBtn.addEventListener('click', send)
    if (inp) {
      inp.addEventListener('input', updateComposer)
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); send() }
      })
    }
    const stopBtn = $('ai-stop-btn')
    if (stopBtn) stopBtn.addEventListener('click', () => { try { window.airemote.aiStop() } catch {} })
    const newBtn = $('ai-new-btn')
    if (newBtn) newBtn.addEventListener('click', () => {
      msgs = []
      curBot = null
      streaming = false
      try { window.airemote.aiNewConversation() } catch {}
      render()
      updateComposer()
      setStatus('')
    })
    const histBtn = $('ai-hist-btn')
    if (histBtn) histBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleHist() })
    document.addEventListener('click', function (e) {
      const box = $('ai-hist')
      if (!box || box.classList.contains('hidden')) return
      const del = e.target && e.target.closest ? e.target.closest('.ai-hist-del') : null
      if (del) { e.stopPropagation(); deleteConversation(del.dataset.del); return }
      const row = e.target && e.target.closest ? e.target.closest('.ai-hist-row') : null
      if (row && row.dataset.id) { loadConversation(row.dataset.id); return }
      const inHist = e.target && e.target.closest && (e.target.closest('#ai-hist') || e.target.closest('#ai-hist-btn'))
      if (!inHist) box.classList.add('hidden')
    })

    const collBtn = $('ai-collapse-btn')
    if (collBtn) collBtn.addEventListener('click', () => {
      const body = $('ai-messages')
      const comp = sec.querySelector('.ai-compose')
      const chev = $('ai-chev')
      const hide = body && body.style.display !== 'none'
      if (body) body.style.display = hide ? 'none' : 'flex'
      if (comp) comp.style.display = hide ? 'none' : 'flex'
      if (chev) chev.style.transform = hide ? 'rotate(-90deg)' : ''
    })

    // delegated buttons
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('#ai-section button[data-act]') : null
      if (!btn) return
      const act = btn.dataset.act
      if (act === 'copy-msg' || act === 'resend-msg') {
        const mm = msgs[parseInt(btn.dataset.midx || '-1', 10)]
        if (!mm) return
        if (act === 'copy-msg') {
          try { navigator.clipboard.writeText(mm.text) } catch {}
          btn.textContent = 'تم النسخ'
          setTimeout(() => { btn.textContent = 'نسخ' }, 1500)
        } else {
          const inp2 = $('ai-input')
          if (inp2) { inp2.value = mm.text; inp2.focus() }
          send()
        }
        return
      }
      const bid = btn.dataset.bid || ''
      const k = parseInt(btn.dataset.k || '0', 10)
      const mIdx = parseInt((bid.match(/^b(\d+)_/) || [])[1] || '0', 10)
      const m = msgs[mIdx]
      if (!m) return
      const part = parseParts(m.text)[k]
      if (!part) return
      if (act === 'copy') {
        try { navigator.clipboard.writeText(part.content) } catch {}
        btn.textContent = 'تم النسخ'
        setTimeout(() => { btn.textContent = 'نسخ' }, 1500)
      } else if (act === 'run') {
        runBlock(bid, k, mIdx, btn)
      }
    })

    updateComposer()

    // v3.5 — restore this device's most recent conversation, and retry once
    // the agent has registered (deviceId was null during early startup).
    const restoreLatest = () => {
      if (!window.airemote || !window.airemote.aiListConversations) return
      window.airemote.aiListConversations().then((r) => {
        if (r && r.ok && Array.isArray(r.conversations) && r.conversations.length) {
          loadConversation(r.conversations[0].id)
        }
      }).catch(() => {})
    }
    restoreLatest()
    if (window.airemote.onAiReady) window.airemote.onAiReady(restoreLatest)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
