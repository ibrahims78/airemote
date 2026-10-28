import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
  Monitor, Terminal, Activity, FolderOpen, ArrowLeft,
  Wifi, WifiOff, Cpu, MemoryStick, HardDrive, Clock,
  Globe, Server, Bot, Command, Tv2, ExternalLink
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
import { Badge, Card, EmptyState } from '../components/ui'

type Tab = 'overview' | 'terminal' | 'monitor' | 'files' | 'ai' | 'commands' | 'screen'

/** كل التبويبات — تُستخدم للتحقق من ?tab= قبل التبديل. */
const TABS: Tab[] = ['overview', 'commands', 'terminal', 'screen', 'monitor', 'files', 'ai']


function DeviceInfoPanel({ device }: { device: Device }) {
  const t = useT()
  const { statsMap } = useDeviceStore()
  const stats = statsMap[device.id]

  const uptime = stats?.uptime
    ? `${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m`
    : '—'

  const infoRows = [
    { label: t('hostname'),  value: device.info?.hostname || '—', icon: Server },
    { label: t('platform'),  value: device.info ? ([device.info.platform, device.info.osVersion].filter(Boolean).join(' ') || '—') : '—', icon: Monitor },
    { label: 'Arch',         value: device.info?.arch || '—', icon: Cpu },
    { label: t('ip_local'),  value: device.info?.ipLocal || '—', icon: Globe },
    { label: t('ip_public'), value: device.info?.ipPublic || '—', icon: Globe },
    { label: 'Tunnel',       value: device.tunnelLayer || '—', icon: Wifi },
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

      {stats && (
        <div className="rounded-xl border border-line bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <h3 className="text-sm font-medium text-ink">{t('tab_monitor')}</h3>
          </div>
          <div className="p-4 grid grid-cols-3 gap-4">
            {[
              { label: 'CPU', value: stats.cpuPercent, stroke: '#38bdf8' },
              { label: 'RAM', value: stats.ramPercent, stroke: '#2dd4bf' },
              { label: 'Disk', value: stats.diskPercent, stroke: '#c084fc' }
            ].map(item => (
              <div key={item.label} className="text-center">
                <div className="relative w-14 h-14 mx-auto mb-2">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3" className="text-line" />
                    <circle
                      cx="18" cy="18" r="15.9" fill="none"
                      stroke={item.stroke} strokeWidth="3"
                      strokeDasharray={`${item.value} 100`} strokeLinecap="round"
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-ink">{item.value}%</span>
                  </div>
                </div>
                <p className="text-xs text-muted">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function DeviceWorkspacePage() {
  const t = useT()
  const { deviceId } = useParams<{ deviceId: string }>()
  const { devices, statsMap, fetchDevices } = useDeviceStore()
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

  useEffect(() => {
    if (devices.length === 0) fetchDevices()
  }, [])

  if (!device) {
    return (
      <div className="p-5">
        <Card>
          <EmptyState
            icon={<Monitor size={26} />}
            title={t('no_devices_yet')}
            description={<Link to="/devices" className="text-primary hover:underline">{t('back_to_devices')}</Link>}
          />
        </Card>
      </div>
    )
  }

  const isOnline = device.status === 'online'

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
          <Link to="/devices" className="p-1.5 text-muted hover:text-ink transition-colors rounded-lg hover:bg-surface2">
            <ArrowLeft size={16} />
          </Link>
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', isOnline ? 'bg-primary/15' : 'bg-surface2')}>
            <Monitor size={14} className={isOnline ? 'text-primary' : 'text-muted'} />
          </div>
          <div>
            <h2 className="text-base font-bold text-ink leading-none">{device.name}</h2>
            <p className="text-xs text-muted mt-0.5">{device.info?.hostname || device.id.slice(0, 12)}</p>
          </div>
          <Badge tone={isOnline ? 'success' : 'neutral'} className="ms-auto px-2.5 py-1">
            {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
            {isOnline ? t('device_online') : t('device_offline')}
          </Badge>
          <button
            onClick={() => window.open('/view/' + device.id, '_blank', 'width=1400,height=900')}
            title="فتح البث في نافذة مستقلة (لعرض أكثر من جهاز معاً)"
            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface2 transition-colors"
          >
            <ExternalLink size={14} />
          </button>
          {stats && (
            <div className="hidden lg:flex items-center gap-3 text-xs text-muted border-s border-line ps-4 ms-2">
              <span className="flex items-center gap-1"><Cpu size={10} className="text-primary" /><span className="font-mono text-ink">{stats.cpuPercent}%</span></span>
              <span className="flex items-center gap-1"><MemoryStick size={10} className="text-primary" /><span className="font-mono text-ink">{stats.ramPercent}%</span></span>
              <span className="flex items-center gap-1"><HardDrive size={10} className="text-info" /><span className="font-mono text-ink">{stats.diskPercent}%</span></span>
            </div>
          )}
        </div>

        <div className="tabs-scroll flex gap-1 overflow-x-auto">
          {tabs.map(tb => (
            <button
              key={tb.id}
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
      <div className={clsx('flex-1 min-h-0 min-w-0', tab === 'ai' || tab === 'terminal' || tab === 'commands' || tab === 'files' || tab === 'screen' ? 'overflow-hidden' : 'overflow-auto')}>
        <ErrorBoundary>

        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 p-5">
            <div className="lg:col-span-1">
              <DeviceInfoPanel device={device} />
            </div>
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-line bg-surface p-5">
                <h3 className="text-sm font-medium text-ink mb-4 flex items-center gap-2">
                  <Activity size={14} className="text-primary" />
                  {t('tab_monitor')}
                </h3>
                <MonitoringCharts deviceId={device.id} stats={stats} />
              </div>
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

        {/* ScreenViewer stays mounted even when switching tabs so the stream
            remains alive. CSS hides it; only the user navigating away from the
            DeviceWorkspace page unmounts it (and tears down the WebSocket). */}
        {deviceId && (
          <div className="h-full p-5" style={{ display: tab === 'screen' ? 'flex' : 'none' }}>
            <ScreenViewer deviceId={deviceId} deviceName={device.name} />
          </div>
        )}

        {tab === 'monitor' && (
          <div className="space-y-5 p-5">
            <div className="rounded-xl border border-line bg-surface p-5">
              <h3 className="text-sm font-medium text-ink mb-4">{t('tab_monitor')} — {device.name}</h3>
              <MonitoringCharts deviceId={device.id} stats={stats} />
            </div>
          </div>
        )}

        {tab === 'files' && deviceId && (
          <div className="h-full p-5">
            <FileManager deviceId={deviceId} deviceName={device.name} />
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
