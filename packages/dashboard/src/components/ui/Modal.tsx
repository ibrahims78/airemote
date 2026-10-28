import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const WIDTH = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

/**
 * Dialog with the accessibility minimum R6 requires: role/aria-modal, Esc to
 * close, backdrop click, initial focus and focus restore. (A full focus trap is
 * still on the R6 list.)
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const restore = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restore.current = document.activeElement as HTMLElement
    const t = setTimeout(() => {
      const el = panel.current
      if (!el) return
      // React already moved focus to an [autoFocus] field inside the dialog —
      // steal it back to the panel only when nothing inside is focused.
      if (el.contains(document.activeElement)) return
      el.focus()
    }, 0)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      restore.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-overlay/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-modal-title"
        aria-describedby={description ? 'ui-modal-desc' : undefined}
        tabIndex={-1}
        className={clsx('relative w-full rounded-xl border border-line bg-surface shadow-pop outline-none', WIDTH[size])}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-3.5 py-2.5">
          <div>
            <h2 id="ui-modal-title" className="text-[13px] font-semibold text-ink">{title}</h2>
            {description && <p id="ui-modal-desc" className="mt-0.5 text-[11px] text-muted">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="rounded p-1 text-muted hover:bg-surface2 hover:text-ink">
            <X size={14} />
          </button>
        </div>
        {children && <div className="px-3.5 py-3">{children}</div>}
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-3.5 py-2">{footer}</div>}
      </div>
    </div>
  )
}
