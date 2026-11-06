import { clsx } from 'clsx'
import { useT } from '../../lib/i18n'

interface Props {
  /** 0–100. Undefined renders an indeterminate bar. */
  value?: number
  tone?: 'primary' | 'success' | 'danger'
  size?: 'sm' | 'md'
  label?: string
  className?: string
}

const TONE = {
  primary: 'bg-primary',
  success: 'bg-success',
  danger: 'bg-danger'
}

export function ProgressBar({ value, tone = 'primary', size = 'sm', label, className }: Props) {
  const t = useT()
  const indeterminate = value === undefined
  const clamped = indeterminate ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div
      className={clsx('w-full overflow-hidden rounded-full bg-line/70', size === 'sm' ? 'h-1.5' : 'h-2.5', className)}
      role="progressbar"
      aria-label={label || t('ui_progress')}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
    >
      <div
        className={clsx('h-full rounded-full transition-[width] duration-200', TONE[tone], indeterminate && 'animate-pulse-slow w-1/3')}
        style={indeterminate ? undefined : { width: `${clamped}%` }}
      />
    </div>
  )
}
