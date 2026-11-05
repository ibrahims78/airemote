import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './control-room.css'
import './control-room-ref.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// v3.4.0 — PWA: register the minimal service worker (app-shell caching)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
