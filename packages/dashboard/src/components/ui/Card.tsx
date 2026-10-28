import type { HTMLAttributes, ReactNode } from 'react'
import { clsx } from 'clsx'

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('rounded-xl border border-line bg-surface overflow-hidden', className)} {...rest}>
      {children}
    </div>
  )
}

interface HeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  className?: string
}

export function CardHeader({ title, subtitle, icon, actions, className }: HeaderProps) {
  return (
    <div className={clsx('flex items-center justify-between gap-3 border-b border-line px-3 py-2', className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="shrink-0 text-muted">{icon}</span>}
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-ink">{title}</div>
          {subtitle && <div className="truncate text-[11px] text-muted">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  )
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('p-3', className)} {...rest}>{children}</div>
}
