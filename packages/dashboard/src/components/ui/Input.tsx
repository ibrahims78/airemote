import { forwardRef, type InputHTMLAttributes } from 'react'
import { clsx } from 'clsx'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...rest }, ref
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={clsx(
        'h-9 w-full rounded-lg border bg-surface px-3 text-[13px] text-ink placeholder:text-muted/70',
        'transition-colors duration-fast outline-none',
        'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25',
        invalid ? 'border-danger' : 'border-line',
        className
      )}
      {...rest}
    />
  )
})
