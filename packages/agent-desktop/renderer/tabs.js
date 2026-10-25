'use strict';
// AiRemote Agent — tab navigation (v3.4.1)
(function () {
  const KEY = 'airemote-agent-tab'
  function paneOf(name) { return document.getElementById('tab-' + name) }
  function btnOf(name) { return document.querySelector('#tabbar .tab-btn[data-tab="' + name + '"]') }

  window.__switchTab = function (name) {
    document.querySelectorAll('#tabbar .tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === name)
    })
    document.querySelectorAll('.tab-pane').forEach(function (p) {
      p.classList.toggle('active', p.id === 'tab-' + name)
    })
    if (name === 'viewers') {
      const sec = document.getElementById('chat-section')
      if (sec) sec.classList.remove('hidden')
      const b = document.getElementById('tab-chat-badge')
      if (b) b.classList.add('hidden')
    }
    try { localStorage.setItem(KEY, name) } catch (e) {}
  }

  function init() {
    const bar = document.getElementById('tabbar')
    if (!bar) return
    bar.querySelectorAll('.tab-btn').forEach(function (b) {
      b.addEventListener('click', function () { window.__switchTab(b.dataset.tab) })
    })
    let saved = 'status'
    try { saved = localStorage.getItem(KEY) || 'status' } catch (e) {}
    if (!paneOf(saved)) saved = 'status'
    window.__switchTab(saved)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
