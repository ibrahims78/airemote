'use strict'
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('toastApi', {
  open: () => ipcRenderer.send('chat-toast-open'),
  close: () => ipcRenderer.send('chat-toast-close'),
  onUpdate: (fn) => ipcRenderer.on('chat-toast-update', (_, d) => fn(d)),
})
