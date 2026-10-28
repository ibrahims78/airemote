import { forwardRef, type SelectHTMLAttributes } from 'react'
import { clsx } from 'clsx'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...rest }, ref
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={clsx(
        'h-8 rounded-lg border bg-surface px-2 text-[12px] text-ink outline-none transition-colors duration-fast',
        'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25',
        invalid ? 'border-danger' : 'border-line',
        className
      )}
      {...rest}
    >
      {children}
    </select>
  )
})
