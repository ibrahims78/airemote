import { Maximize2, Minus, X } from 'lucide-react'

/** Frameless-window controls for login/setup screens (dashboard has its own titlebar). */
export function WindowChrome() {
  const wc = typeof window !== 'undefined'
    ? (window as unknown as { airemote?: { windowCtl?: { minimize?: () => void; maximize?: () => void; close?: () => void } } }).airemote?.windowCtl
    : undefined
  if (!wc) return null
  return (
    <div className="app-window-chrome">
      <div className="app-window-chrome-controls">
        <button type="button" className="app-window-btn" onClick={() => wc.minimize?.()} title="تصغير">
          <Minus size={15} />
        </button>
        <button type="button" className="app-window-btn" onClick={() => wc.maximize?.()} title="تكبير">
          <Maximize2 size={13} />
        </button>
        <button type="button" className="app-window-btn is-close" onClick={() => wc.close?.()} title="إغلاق">
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
