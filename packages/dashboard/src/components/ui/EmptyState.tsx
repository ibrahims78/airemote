import type { ReactNode } from 'react'

interface Props {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 px-4 py-6 text-center ${className || ''}`}>
      {icon && <div className="mb-0.5 text-muted/70" aria-hidden>{icon}</div>}
      <div className="text-[12px] font-medium text-ink">{title}</div>
      {description && <div className="max-w-[42ch] text-[11px] leading-5 text-muted">{description}</div>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  )
}
