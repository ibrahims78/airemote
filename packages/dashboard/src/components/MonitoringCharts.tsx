import { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent'
import { Cpu, MemoryStick, HardDrive, Network, ArrowUp, ArrowDown, Activity } from 'lucide-react'
import { clsx } from 'clsx'
import type { DeviceStats } from '@airemote/shared'
import { useT } from '../lib/i18n'
import { useChartPalette } from '../lib/chartTheme'

interface HistoryPoint {
  time: string
  cpu: number
  ram: number
  netUp: number
  netDown: number
}

interface Props {
  deviceId: string
  stats: DeviceStats | undefined
}

function fmtKbps(kbps: number | undefined): string {
  const v = kbps ?? 0
  if (v === 0)     return '0 B/s'
  if (v < 1)       return `${Math.round(v * 1024)} B/s`
  if (v < 1024)    return `${v.toFixed(v < 10 ? 2 : 1)} KB/s`
  return `${(v / 1024).toFixed(2)} MB/s`
}

// Module-level history store so it persists across re-renders
const historyMap = new Map<string, HistoryPoint[]>()

function getOrCreateHistory(deviceId: string): HistoryPoint[] {
  if (!historyMap.has(deviceId)) historyMap.set(deviceId, [])
  return historyMap.get(deviceId)!
}

type Tone = 'info' | 'primary' | 'warning'

const TONE: Record<Tone, { chip: string; icon: string }> = {
  info:    { chip: 'bg-info/15',    icon: 'text-info' },
  primary: { chip: 'bg-primary/15', icon: 'text-primary' },
  warning: { chip: 'bg-warning/15', icon: 'text-warning' }
}

function StatCard({ icon: Icon, label, value, unit, tone, subLabel }: {
  icon: React.ElementType
  label: string
  value: number
  unit: string
  tone: Tone
  subLabel?: string
}) {
  const pct = unit === '%' ? value : undefined
  const isHigh = pct !== undefined && pct > 85
  const barColor = isHigh ? 'bg-danger' : pct !== undefined && pct > 70 ? 'bg-warning' : TONE[tone].icon.replace('text-', 'bg-')

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', TONE[tone].chip)}>
            <Icon size={14} className={TONE[tone].icon} />
          </div>
          <span className="text-sm text-ink">{label}</span>
        </div>
        <div className="text-end">
          <span className={clsx('text-xl font-bold font-mono', isHigh ? 'text-danger' : 'text-ink')}>
            {typeof value === 'number' ? value.toFixed(1) : '0.0'}
          </span>
          <span className="text-xs text-muted ms-0.5">{unit}</span>
        </div>
      </div>
      {pct !== undefined && (
        <div className="w-full bg-line/50 rounded-full h-1.5 overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-700', barColor)}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
      {subLabel && <p className="text-xs text-muted mt-1.5">{subLabel}</p>}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-line rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-1.5 font-mono">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-muted">{p.name}:</span>
          <span className="text-ink font-mono">{Number(p.value).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

const NetTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-line rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-1.5 font-mono">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-muted">{p.name}:</span>
          <span className="text-ink font-mono">{fmtKbps(Number(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

export function MonitoringCharts({ deviceId, stats }: Props) {
  const T = useT()
  const chart = useChartPalette()
  const [history, setHistory] = useState<HistoryPoint[]>(() => [...getOrCreateHistory(deviceId)])

  const updateHistory = useCallback((newStats: DeviceStats) => {
    const arr = getOrCreateHistory(deviceId)
    const now = new Date()
    const point: HistoryPoint = {
      time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`,
      cpu: newStats.cpuPercent,
      ram: newStats.ramPercent,
      netUp: newStats.networkUpKbps,
      netDown: newStats.networkDownKbps
    }
    arr.push(point)
    if (arr.length > 60) arr.shift()
    setHistory([...arr])
  }, [deviceId])

  useEffect(() => {
    if (stats) updateHistory(stats)
  }, [stats, updateHistory])

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-40 text-muted text-sm">
        <div className="text-center">
          <Activity size={24} className="mx-auto mb-2 text-muted/70 animate-pulse" />
          {T('mon_waiting')}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Cpu} label={T('mon_cpu')} value={stats.cpuPercent} unit="%" tone="info" />
        <StatCard
          icon={MemoryStick} label={T('mon_ram')}
          value={stats.ramPercent} unit="%" tone="primary"
          subLabel={`${((stats.ramUsedMb ?? 0) / 1024).toFixed(1)} / ${((stats.ramTotalMb ?? 0) / 1024).toFixed(1)} GB`}
        />
        <StatCard
          icon={HardDrive} label={T('mon_disk')}
          value={stats.diskPercent} unit="%" tone="warning"
          subLabel={`${(stats.diskUsedGb ?? 0).toFixed(1)} / ${(stats.diskTotalGb ?? 0).toFixed(1)} GB`}
        />
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
              <Network size={14} className="text-warning" />
            </div>
            <span className="text-sm text-ink">{T('mon_net')}</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-muted">
                <ArrowUp size={10} className="text-success" /> {T('mon_up')}
              </div>
              <span className="text-xs font-mono text-ink">{fmtKbps(stats.networkUpKbps)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-muted">
                <ArrowDown size={10} className="text-info" /> {T('mon_down')}
              </div>
              <span className="text-xs font-mono text-ink">{fmtKbps(stats.networkDownKbps)}</span>
            </div>
          </div>
        </div>
      </div>

      {history.length >= 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-line bg-surface p-4">
            <h4 className="text-xs font-medium text-muted mb-3 flex items-center gap-1.5">
              <Cpu size={11} className="text-info" /> CPU &amp; RAM (%)
            </h4>
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={history} margin={{ top: 2, right: 2, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id={`cpuGrad-${deviceId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chart.cpu} stopOpacity={0.35}/>
                    <stop offset="95%" stopColor={chart.cpu} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id={`ramGrad-${deviceId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chart.ram} stopOpacity={0.35}/>
                    <stop offset="95%" stopColor={chart.ram} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: chart.axis }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: chart.axis }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="cpu" name="CPU" stroke={chart.cpu} fill={`url(#cpuGrad-${deviceId})`} strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="ram" name="RAM" stroke={chart.ram} fill={`url(#ramGrad-${deviceId})`} strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <h4 className="text-xs font-medium text-muted mb-3 flex items-center gap-1.5">
              <Network size={11} className="text-warning" /> {T('mon_net')}
            </h4>
            {history.every(p => p.netUp === 0 && p.netDown === 0) ? (
              <div className="flex h-[130px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-center">
                <Network size={16} className="text-muted/60" />
                <span className="text-[11px] text-muted">{T('mon_no_net')}</span>
                <span className="text-[10px] text-muted/70">0 B/s ↑ · 0 B/s ↓</span>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={history} margin={{ top: 2, right: 2, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: chart.axis }} interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 9, fill: chart.axis }}
                  tickFormatter={v => fmtKbps(v)}
                  width={42}
                  domain={[0, (dataMax: number) => dataMax < 1 ? 10 : Math.ceil(dataMax * 1.2)]}
                />
                <Tooltip content={<NetTooltip />} />
                <Line type="monotone" dataKey="netUp"   name={T('mon_up')}   stroke={chart.netUp} strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="netDown" name={T('mon_down')} stroke={chart.netDown} strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
