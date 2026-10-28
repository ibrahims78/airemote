import { clsx } from 'clsx'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx('animate-pulse rounded-md bg-line/60', className)} />
}

/** Fixed-height placeholder for lists, so the layout does not jump while loading. */
export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx('space-y-1.5', className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
    </div>
  )
}
