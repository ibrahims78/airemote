import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { AlertTriangle, Inbox } from 'lucide-react'
import { SkeletonRows } from './Skeleton'

export interface Column<T> {
  key: string
  header: ReactNode
  render?: (row: T) => ReactNode
  width?: string
  align?: 'start' | 'end' | 'center'
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>
  rows: T[]
  rowKey: (row: T, index: number) => string
  onRowClick?: (row: T) => void
  loading?: boolean
  error?: string | null
  empty?: ReactNode
  className?: string
  /** Highlights one row as if hovered — used by the visual harness. */
  hoverRowKey?: string
}

/**
 * جدول موحّد: صف 36px · رأس ثابت · hover · وأربع حالات (طبيعي/فارغ/تحميل/خطأ).
 * لا يعرف شيئًا عن البيانات — الشاشات تمرّر الأعمدة والصفوف.
 */
export function DataTable<T> ({ columns, rows, rowKey, onRowClick, loading, error, empty, className, hoverRowKey }: DataTableProps<T>) {
  const cellPad = 'px-3'
  return (
    <div className={clsx('overflow-hidden rounded-xl border border-line bg-surface', className)}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="h-8 border-b border-line bg-surface2/60 text-[11px] font-medium text-muted">
            {columns.map(c => (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={clsx(cellPad, 'text-start font-medium', c.align === 'end' && 'text-end', c.align === 'center' && 'text-center')}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length} className="p-0">
                <SkeletonRows rows={3} />
              </td>
            </tr>
          )}

          {!loading && error && (
            <tr>
              <td colSpan={columns.length} className="h-24">
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-danger" role="alert">
                  <AlertTriangle size={16} />
                  <span className="text-[12px]">{error}</span>
                </div>
              </td>
            </tr>
          )}

          {!loading && !error && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="h-24">
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted">
                  <Inbox size={16} />
                  <span className="text-[12px]">{empty || 'لا عناصر'}</span>
                </div>
              </td>
            </tr>
          )}

          {!loading && !error && rows.map((row, i) => {
            const key = rowKey(row, i)
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  'h-9 border-b border-line last:border-b-0 transition-colors duration-fast',
                  onRowClick && 'cursor-pointer',
                  key === hoverRowKey ? 'bg-surface2' : 'hover:bg-surface2/70'
                )}
              >
                {columns.map(c => (
                  <td key={c.key} className={clsx(cellPad, 'text-ink', c.align === 'end' && 'text-end', c.align === 'center' && 'text-center')}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
