import { Link } from 'react-router-dom'
import { Monitor, Play, RefreshCw, Smartphone, ExternalLink } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '../lib/i18n'
import type { Device } from '@airemote/shared'
import { Badge } from './ui'
import { openScreenWindow } from '../lib/screenWindow'

/**
 * شريط الأسطول — الصف الأول في مرجع المالك (design/server.html).
 * بطاقة رفيعة لكل جهاز: شارة حالة + اسم + سطران (النظام/الوكيل) + إجراءان.
 * لا يبدأ أي بث: «تشغيل» يفتح نافذة العرض فقط.
 */
export function FleetStrip ({ devices, max = 4 }: { devices: Device[]; max?: number }) {
  const t = useT()
  const list = devices.slice(0, max)
  if (list.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="fleet-strip">
      {list.map(d => {
        const online = d.status === 'online'
        const isAndroid = String(d.info?.platform || '').toLowerCase() === 'android'
        const Icon = isAndroid ? Smartphone : Monitor
        const version = (d.info as Record<string, unknown> | undefined)?.agentVersion as string | undefined
        return (
          <article
            key={d.id}
            className={clsx(
              'flex flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-2.5',
              !online && 'opacity-80'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <Icon size={14} className="shrink-0 text-muted" />
                <span className="truncate text-[13px] font-medium text-ink" title={d.name}>{d.name}</span>
              </div>
              <Badge tone={online ? 'success' : 'neutral'}>
                <i className={clsx('inline-block h-1.5 w-1.5 rounded-full', online ? 'bg-success' : 'bg-muted')} />
                {online ? t('online') : t('offline')}
              </Badge>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] leading-5">
              <dt className="text-muted">{t('fleet_os')}</dt>
              <dd className="truncate text-ink-2">{d.info?.osVersion || d.info?.platform || '—'}</dd>
              <dt className="text-muted">{t('fleet_agent')}</dt>
              <dd className="truncate text-ink-2">{version || '—'}</dd>
            </dl>

            <div className="mt-auto flex items-center justify-end gap-1.5">
              <Link
                to={'/devices/' + d.id}
                className="inline-flex h-[26px] items-center gap-1 rounded-lg border border-line px-2 text-[12px] text-ink transition-colors hover:bg-surface2"
              >
                <ExternalLink size={12} /> فتح
              </Link>
              <button
                type="button"
                onClick={() => openScreenWindow(d.id)}
                disabled={!online}
                className={clsx(
                  'inline-flex h-[26px] items-center gap-1 rounded-lg px-2 text-[12px] font-medium transition-colors',
                  online
                    ? 'bg-primary text-primary-fg hover:brightness-110'
                    : 'cursor-not-allowed border border-line text-muted'
                )}
              >
                <Play size={12} /> تشغيل
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
