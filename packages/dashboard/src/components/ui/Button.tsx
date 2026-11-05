import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { clsx } from 'clsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-fast ' +
  'disabled:opacity-50 disabled:pointer-events-none select-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface2 text-ink border border-line hover:bg-surface',
  ghost: 'text-ink hover:bg-surface2',
  danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/15'
}

const SIZES: Record<Size, string> = {
  sm: 'h-[26px] px-2 text-[12px]',
  md: 'h-[30px] px-3 text-[13px]'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', loading = false, icon, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={rest.type || 'button'}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={clsx(BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {loading ? <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin" /> : icon}
      {children}
    </button>
  )
})
