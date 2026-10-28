import type { ReactNode } from 'react'

interface Props {
  label?: string
  htmlFor?: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
}

/** Label + control + hint/error, with a stable layout so forms never jump. */
export function Field({ label, htmlFor, hint, error, required, children, className }: Props) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1 block text-[12px] font-medium text-ink">
          {label}
          {required && <span className="ms-0.5 text-danger" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
      {error && <p className="mt-1 text-[11px] text-danger" role="alert">{error}</p>}
    </div>
  )
}
