import type { ReactNode } from 'react'
import { clsx } from 'clsx'

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface2 text-muted border-line',
  info: 'bg-info/10 text-info border-info/25',
  success: 'bg-success/10 text-success border-success/25',
  warning: 'bg-warning/10 text-warning border-warning/25',
  danger: 'bg-danger/10 text-danger border-danger/25'
}

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex h-[22px] items-center gap-1 rounded-full border px-2 text-[11px] font-medium', TONES[tone], className)}>
      {children}
    </span>
  )
}
