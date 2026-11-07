import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useToastStore } from '../store/toastStore'
import type { Toast } from '../store/toastStore'

const ICONS = {
  success: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10 border-success/25' },
  error:   { icon: XCircle,      color: 'text-danger',     bg: 'bg-danger/10 border-danger/25' },
  warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10 border-warning/25' },
  info:    { icon: Info,          color: 'text-info', bg: 'bg-info/10 border-info/25' },
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [visible, setVisible] = useState(false)
  const cfg = ICONS[toast.type]
  const Icon = cfg.icon

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className={clsx(
        'flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-sm transition-all duration-300',
        cfg.bg,
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8',
        'min-w-[260px] max-w-[360px]'
      )}
    >
      <Icon size={16} className={clsx('flex-shrink-0 mt-0.5', cfg.color)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{toast.title}</p>
        {toast.message && <p className="text-xs text-muted mt-0.5 leading-relaxed">{toast.message}</p>}
      </div>
      <button onClick={onClose} className="text-muted hover:text-ink transition-colors flex-shrink-0 mt-0.5">
        <X size={13} />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()
  return (
    <div className="fixed bottom-5 left-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onClose={() => removeToast(t.id)} />
        </div>
      ))}
    </div>
  )
}
