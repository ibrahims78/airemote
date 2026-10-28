import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { clsx } from 'clsx'

type Tone = 'info' | 'success' | 'warning' | 'danger'

const STYLE: Record<Tone, string> = {
  info: 'border-info/30 bg-info/10 text-info',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger'
}

const ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle }

interface Props {
  tone?: Tone
  title?: string
  children?: ReactNode
  onClose?: () => void
  className?: string
}

export function Alert({ tone = 'info', title, children, onClose, className }: Props) {
  const Icon = ICON[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx('flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]', STYLE[tone], className)}>
      <Icon size={13} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={clsx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {onClose && (
        <button onClick={onClose} aria-label="إغلاق التنبيه" className="shrink-0 rounded p-0.5 hover:bg-surface2">
          <X size={12} />
        </button>
      )}
    </div>
  )
}
