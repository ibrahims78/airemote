import type { ReactNode } from 'react'
import { Alert } from './Alert'
import { EmptyState } from './EmptyState'
import { SkeletonRows } from './Skeleton'

/**
 * 3.14.1 — every surface owes the user four states: normal, empty, loading, error.
 *
 * Most pages already render their own; this exists for the surfaces that render a
 * single child (a viewer, a stream, a panel) where "what to show instead" has to be
 * decided in one place so the four look identical everywhere.
 */
export type SurfaceState = 'loading' | 'error' | 'empty' | 'ready'

interface Props {
  state: SurfaceState
  children: ReactNode
  rows?: number
  errorTitle?: string
  retryLabel?: string
  onRetry?: () => void
  emptyIcon?: ReactNode
  emptyTitle?: string
  emptyDescription?: ReactNode
  emptyAction?: ReactNode
  className?: string
}

export function StateSurface ({
  state, children, rows = 4,
  errorTitle, retryLabel, onRetry,
  emptyIcon, emptyTitle, emptyDescription, emptyAction,
  className
}: Props) {
  if (state === 'ready') return <>{children}</>

  if (state === 'loading') {
    return (
      <div className={className} aria-busy="true" aria-live="polite">
        <SkeletonRows rows={rows} />
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className={className}>
        <Alert tone="danger" title={errorTitle}>
          {onRetry && (
            <button type="button" className="mt-1 text-[11.5px] underline underline-offset-2" onClick={onRetry}>
              {retryLabel}
            </button>
          )}
        </Alert>
      </div>
    )
  }

  return (
    <div className={className}>
      <EmptyState icon={emptyIcon} title={emptyTitle || ''} description={emptyDescription} action={emptyAction} />
    </div>
  )
}
