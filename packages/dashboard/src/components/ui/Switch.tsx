import { clsx } from 'clsx'

export interface SwitchProps {
  checked: boolean
  onChange?: (value: boolean) => void
  disabled?: boolean
  /** Async transition: keeps the control visible but inert. */
  pending?: boolean
  label?: string
  /** 44×26 target for touch surfaces (Android parity). */
  touch?: boolean
  id?: string
  className?: string
}

/**
 * مفتاح تشغيل — 38×22 (لمس 44×26).
 * الحالات: مفعّل · متوقّف · معطّل · قيد الانتظار.
 * الموضع منطقي (start) ليعمل في RTL وLTR بلا ملفّين.
 */
export function Switch ({ checked, onChange, disabled, pending, label, touch, id, className }: SwitchProps) {
  const inert = Boolean(disabled || pending)
  return (
    <span className={clsx('inline-flex items-center gap-2 select-none', className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-busy={pending || undefined}
        disabled={inert}
        onClick={() => onChange?.(!checked)}
        className={clsx(
          'relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-fast',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
          touch ? 'h-[26px] w-[44px]' : 'h-[22px] w-[38px]',
          checked ? 'border-primary bg-primary' : 'border-line bg-surface2',
          inert && 'cursor-not-allowed opacity-50'
        )}
      >
        <span
          className={clsx(
            'absolute rounded-full bg-surface shadow-sm transition-[inset-inline-start] duration-fast',
            touch ? 'h-[18px] w-[18px]' : 'h-[16px] w-[16px]',
            checked ? (touch ? 'start-[23px]' : 'start-[19px]') : 'start-[2px]',
            pending && 'animate-pulse'
          )}
        />
        {pending && <span className="absolute inset-0 rounded-full bg-ink/5" />}
      </button>
      {label && <span className="text-[13px] text-ink">{label}</span>}
    </span>
  )
}
