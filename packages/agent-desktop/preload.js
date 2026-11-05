'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('airemote', {
  startAgent:    (cfg) => ipcRenderer.send('start-agent', cfg),
  stopAgent:     ()    => ipcRenderer.send('stop-agent'),
  minimizeWin:   ()    => ipcRenderer.send('minimize-win'),
  hideWin:       ()    => ipcRenderer.send('hide-win'),
  closeApp:      ()    => ipcRenderer.send('close-app'),
  saveConfig:    (cfg) => ipcRenderer.send('save-config', cfg),

  getState:      ()    => ipcRenderer.invoke('get-state'),
  getStatsNow:   ()    => ipcRenderer.invoke('get-stats-now'),
  getDeviceInfo: ()    => ipcRenderer.invoke('get-device-info'),

  onInit:        (fn)  => ipcRenderer.on('init',        (_, d) => fn(d)),
  onState:       (fn)  => ipcRenderer.on('state',       (_, d) => fn(d)),
  onLog:         (fn)  => ipcRenderer.on('log',         (_, d) => fn(d)),
  onStats:       (fn)  => ipcRenderer.on('stats',       (_, d) => fn(d)),
  onPublicIp:    (fn)  => ipcRenderer.on('public-ip',   (_, d) => fn(d)),

  sendChat:           (data) => ipcRenderer.send('send-chat', data),
  saveControlAuth:    (data) => ipcRenderer.send('save-control-auth', data),
  openChatWindow:     (opts) => ipcRenderer.send('open-chat-window', opts || {}),

  onScreenChat:       (fn) => ipcRenderer.on('screen-chat',     (_, d) => fn(d)),
  onOpenChatSection:  (fn) => ipcRenderer.on('open-chat-section', (_, d) => fn(d)),
  onControlAuthState: (fn) => ipcRenderer.on('control-auth-state', (_, d) => fn(d)),
  // 3.9.0 — agent-to-agent sessions
  relayDevices:     () => ipcRenderer.invoke('relay-devices'),
  relaySessions:    () => ipcRenderer.invoke('relay-sessions'),
  relayRequest:     (payload) => ipcRenderer.invoke('relay-request', payload),
  relayViewTicket:  (sessionId) => ipcRenderer.invoke('relay-view-ticket', sessionId),
  sessionDecision:  (payload) => ipcRenderer.invoke('session-decision', payload),
  onSessionOffer:   (fn) => ipcRenderer.on('session-offer', (_, d) => fn(d)),
  onSessionClosed:  (fn) => ipcRenderer.on('session-closed', (_, d) => fn(d)),
  onSessionDenied:  (fn) => ipcRenderer.on('session-denied', (_, d) => fn(d)),
  onScreenSessions:   (fn) => ipcRenderer.on('screen-sessions', (_, d) => fn(d)),
  onScreenPrivacy:    (fn) => ipcRenderer.on('screen-privacy',  (_, d) => fn(d)),
  onChatWindowStatus: (fn) => ipcRenderer.on('chat-win-status', (_, d) => fn(d)),

  // v3.4.0 — on-device AI assistant
  aiSend:            (text) => ipcRenderer.send('ai-send', { text }),
  aiStop:            ()     => ipcRenderer.send('ai-stop'),
  aiNewConversation: ()     => ipcRenderer.send('ai-new-conversation'),
  aiRunBlock:        (lang, content) => ipcRenderer.invoke('ai-run-block', { lang, content }),
  aiListConversations: () => ipcRenderer.invoke('ai-list-conversations'),
  onAiReady:           (fn) => ipcRenderer.on('ai-ready', () => fn()),
  aiLoadConversation:  (id) => ipcRenderer.invoke('ai-load-conversation', id),
  aiDeleteConversation:(id) => ipcRenderer.invoke('ai-delete-conversation', id),
  aiSetConversation:   (id) => ipcRenderer.invoke('ai-set-conversation', id),
  onAiDelta:         (fn) => ipcRenderer.on('ai-delta', (_, d) => fn(d)),
  onAiDone:          (fn) => ipcRenderer.on('ai-done',  (_, d) => fn(d)),
  onAiError:         (fn) => ipcRenderer.on('ai-error', (_, d) => fn(d)),
})
