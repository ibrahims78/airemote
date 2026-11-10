import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
  Monitor, Terminal, Activity, FolderOpen, ArrowLeft, ArrowRight,
  Wifi, WifiOff, Cpu, MemoryStick, HardDrive, Clock,
  Globe, Server, Bot, Command, Tv2, ExternalLink, RefreshCw
} from 'lucide-react'
import { clsx } from 'clsx'
import { useDeviceStore } from '../store/deviceStore'
import { PTYTerminal } from '../components/PTYTerminal'
import { ExecConsole } from '../components/ExecConsole'
import { MonitoringCharts } from '../components/MonitoringCharts'
import { FileManager } from '../components/FileManager'
import { AiChatPanel } from '../components/AiChatPanel'
import { CommandRunner } from '../components/CommandRunner'
import { ScreenViewer } from '../components/ScreenViewer'
import { ErrorBoundary } from '../components/ErrorBoundary'
import type { Device } from '@airemote/shared'
import { useT } from '../lib/i18n'
import { useUIStore } from '../store/uiStore'
import { Badge, Alert, Button, Card, EmptyState, SkeletonRows } from '../components/ui'

type Tab = 'overview' | 'terminal' | 'monitor' | 'files' | 'ai' | 'commands' | 'screen'

/** كل التبويبات — تُستخدم للتحقق من ?tab= قبل التبديل. */
const TABS: Tab[] = ['overview', 'commands', 'terminal', 'screen', 'monitor', 'files', 'ai']

function DeviceInfoPanel({ device, online }: { device: Device; online: boolean }) {
  const t = useT()
  const { statsMap } = useDeviceStore()
  const stats = statsMap[device.id]

  const uptime = online && stats?.uptime
    ? `${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m`
    : '—'

  const infoRows = [
    { label: t('hostname'),  value: device.info?.hostname || '—', icon: Server },
    { label: t('platform'),  value: device.info ? ([device.info.platform, device.info.osVersion].filter(Boolean).join(' ') || '—') : '—', icon: Monitor },
    { label: t('arch'),         value: device.info?.arch || '—', icon: Cpu },
    { label: t('ip_local'),  value: device.info?.ipLocal || '—', icon: Globe },
    { label: t('ip_public'), value: device.info?.ipPublic || '—', icon: Globe },
    { label: t('tunnel'),       value: device.tunnelLayer
      ? (String(device.tunnelLayer).toLowerCase() === 'zerotier' ? 'ZeroTier' : String(device.tunnelLayer).toUpperCase())
      : '—', icon: Wifi },
    { label: t('uptime'),    value: uptime, icon: Clock },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <h3 className="text-sm font-medium text-ink">{t('device_info')}</h3>
        </div>
        <div className="divide-y divide-line/60">
          {infoRows.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted">
                <Icon size={12} className="text-muted/60" />
                {label}
              </div>
              <span className="text-xs font-mono text-ink">{value}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

export function DeviceWorkspacePage() {
  const t = useT()
  const lang = useUIStore(s => s.lang)
  const isRtl = lang === 'ar'
  const { deviceId } = useParams<{ deviceId: string }>()
  const { devices, statsMap, fetchDevices, loading, error } = useDeviceStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') as Tab | null
  const [tab, setTabState] = useState<Tab>(requestedTab && TABS.includes(requestedTab) ? requestedTab : 'overview')

  /** التبويب في الرابط: يسمح بالربط العميق (وثائق/لقطات) ويحفظ الاختيار عند التحديث. */
  function setTab(next: Tab) {
    setTabState(next)
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  const device = devices.find(d => d.id === deviceId)
  const stats = deviceId ? statsMap[deviceId] : undefined
  const isOnline = device?.status === 'online'

  // 3.16.8 — re-read on mount: a deep link may land before the store ever fetched.
  useEffect(() => { fetchDevices() }, [fetchDevices])

  // 3.16.8 — the tab in the URL has to follow navigation, not only the first render.
  useEffect(() => {
    const wanted = searchParams.get('tab') as Tab | null
    if (wanted && TABS.includes(wanted) && wanted !== tab) setTabState(wanted)
  }, [searchParams, tab])

  // 3.16.8 — a deep link to a tab that needs a live connection falls back instead of
  // showing a disabled tab's empty pane.
  const needsConnection = tab !== 'overview' && tab !== 'monitor' && tab !== 'ai'
  useEffect(() => {
    if (device && !isOnline && needsConnection) setTab('overview')
  }, [device, isOnline, needsConnection])

  if (!device) {
    if (loading) {
      return (
        <div className="p-5"><Card><div className="p-3"><SkeletonRows rows={4} /></div></Card></div>
      )
    }
    if (error) {
      return (
        <div className="p-5">
          <Card><div className="space-y-3 p-4">
            <Alert tone="danger" title={t('devices_load_failed')} />
            <Button variant="primary" onClick={() => fetchDevices()}>{t('refresh')}</Button>
          </div></Card>
        </div>
      )
    }
    return (
      <div className="p-5">
        <Card>
          <EmptyState
            icon={<Monitor size={26} />}
            title={t('device_not_found')}
            description={t('device_not_found_hint')}
            action={<Link to="/devices" className="btn primary">{t('back_to_devices')}</Link>}
          />
        </Card>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType; disabled?: boolean }[] = [
    { id: 'overview',  label: t('tab_overview'),  icon: Server },
    { id: 'commands',  label: t('tab_commands'),  icon: Command,    disabled: !isOnline },
    { id: 'terminal',  label: t('tab_terminal'),  icon: Terminal,   disabled: !isOnline },
    { id: 'screen',    label: t('tab_screen'),    icon: Tv2,        disabled: !isOnline },
    { id: 'monitor',   label: t('tab_monitor'),   icon: Activity },
    { id: 'files',     label: t('tab_files'),     icon: FolderOpen, disabled: !isOnline },
    { id: 'ai',        label: t('tab_ai'),        icon: Bot },
  ]

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-line bg-canvas">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/devices" aria-label={t('back_to_devices')} title={t('back_to_devices')}
            className="p-1.5 text-muted hover:text-ink transition-colors rounded-lg hover:bg-surface2">
            {/* 3.16.7 - the arrow has to point the way the layout flows. */}
            {isRtl ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
          </Link>
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', isOnline ? 'bg-primary/15' : 'bg-surface2')}>
            <Monitor size={14} className={isOnline ? 'text-primary' : 'text-muted'} />
          </div>
          <div>
            <h2 className="text-base font-bold text-ink leading-none">{device.name}</h2>
            <p className="text-xs text-muted mt-0.5">{device.info?.hostname || device.id.slice(0, 12)}</p>
          </div>
          <Badge tone={isOnline ? 'success' : 'neutral'} className="px-2.5 py-1">
            {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
            {isOnline ? t('device_online') : t('device_offline')}
          </Badge>
          <Button variant="ghost" size="sm" aria-label={t('refresh')} title={t('refresh')} icon={<RefreshCw size={13} />} onClick={() => fetchDevices()} />
          {stats && isOnline && (
            <div className="hidden lg:flex items-center gap-3 text-xs text-muted border-s border-line ps-4 ms-2">
              <span className="flex items-center gap-1"><Cpu size={10} className="text-primary" /><span className="font-mono text-ink">{stats.cpuPercent}%</span></span>
              <span className="flex items-center gap-1"><MemoryStick size={10} className="text-primary" /><span className="font-mono text-ink">{stats.ramPercent}%</span></span>
              <span className="flex items-center gap-1"><HardDrive size={10} className="text-info" /><span className="font-mono text-ink">{stats.diskPercent}%</span></span>
            </div>
          )}
        </div>

        <div className="tabs-scroll flex gap-1 overflow-x-auto" role="tablist">
          {tabs.map(tb => (
            <button
              key={tb.id}
              role="tab"
              id={'dev-tab-' + tb.id}
              aria-selected={tab === tb.id}
              onClick={() => !tb.disabled && setTab(tb.id)}
              disabled={tb.disabled}
              className={clsx(
                'flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm border-b-2 transition-all',
                tab === tb.id ? 'border-primary text-primary font-medium' :
                tb.disabled ? 'border-transparent text-muted/60 cursor-not-allowed' :
                'border-transparent text-muted hover:text-ink'
              )}
            >
              <tb.icon size={14} />
              {tb.label}
              {tb.disabled && !isOnline && <span className="text-[10px] bg-surface2 text-muted px-1.5 py-0.5 rounded">{t('offline')}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div role="tabpanel" aria-labelledby={'dev-tab-' + tab} className={clsx('flex-1 min-h-0 min-w-0', tab === 'ai' || tab === 'terminal' || tab === 'commands' || tab === 'files' || tab === 'screen' ? 'overflow-hidden' : 'overflow-auto')}>
        <ErrorBoundary key={tab}>

        {tab === 'overview' && (
          <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
            <DeviceInfoPanel device={device} online={isOnline} />

            {/* 3.16.8 — the charts lived here and in the monitor tab; one home is enough. */}
            <div className="rounded-xl border border-line bg-surface p-4">
              <h3 className="mb-3 text-sm font-medium text-ink">{t('quick_actions')}</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'screen' as Tab, label: t('tab_screen'), icon: Tv2 },
                  { id: 'files' as Tab, label: t('tab_files'), icon: FolderOpen },
                  { id: 'terminal' as Tab, label: t('tab_terminal'), icon: Terminal },
                  { id: 'ai' as Tab, label: t('tab_ai'), icon: Bot },
                ].map(a => (
                  <button key={a.id} type="button" onClick={() => setTab(a.id)}
                    disabled={!isOnline && a.id !== 'ai'}
                    className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-[12px] text-ink transition-colors hover:border-primary/40 hover:bg-surface2 disabled:opacity-40">
                    <a.icon size={13} className="text-muted" />
                    <span className="truncate">{a.label}</span>
                  </button>
                ))}
              </div>
              {!isOnline && (
                <p className="mt-3 text-[11px] text-muted">{t('device_offline_stats')}</p>
              )}
            </div>
          </div>
        )}

        {tab === 'commands' && deviceId && (
          <div className="h-full p-5">
            <CommandRunner deviceId={deviceId} deviceName={device.name} platform={device.info?.platform} />
          </div>
        )}

        {tab === 'terminal' && deviceId && (
          <div className="h-full p-5">
            {String(device.info?.platform || '').toLowerCase() === 'android'
              ? <ExecConsole deviceId={deviceId} />
              : <PTYTerminal deviceId={deviceId} deviceName={device.name} />}
          </div>
        )}

        {/* 3.13.0 — لا بث في الخلفية: مغادرة تبويب الشاشة تُغلق الاتصال وتوقف الالتقاط. */}
        {deviceId && tab === 'screen' && (
          <div className="h-full p-5">
            <ScreenViewer deviceId={deviceId} deviceName={device.name} />
          </div>
        )}

        {tab === 'monitor' && (
          <div className="space-y-5 p-5">
            <div className="rounded-xl border border-line bg-surface p-5">
              <h3 className="text-sm font-medium text-ink mb-4">{t('tab_monitor')} — {device.name}</h3>
              {!isOnline && <Alert tone="info" className="mb-4">{t('device_offline_stats')}</Alert>}
              <MonitoringCharts deviceId={device.id} stats={stats} />
            </div>
          </div>
        )}

        {tab === 'files' && deviceId && (
          <div className="h-full p-5">
            <FileManager
              deviceId={deviceId}
              deviceName={device.name}
              platform={String(device.info?.platform || '')}
              initialPath={String(device.info?.platform || '').toLowerCase() === 'android' ? '/sdcard' : '/'}
            />
          </div>
        )}

        {tab === 'ai' && deviceId && (
          <div className="h-full">
            <AiChatPanel deviceId={deviceId} />
          </div>
        )}

        </ErrorBoundary>
      </div>
    </div>
  )
}
