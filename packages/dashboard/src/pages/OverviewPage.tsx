import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertCircle, ArrowUpRight, ChevronDown, ChevronRight, ChevronUp, Cpu,
  History, Monitor, MonitorPlay, Play, Send, Settings, Sparkles,
  Wifi
} from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'
import { useT } from '../lib/i18n'
import { clsx } from 'clsx'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { openScreenWindow } from '../lib/screenWindow'
import type { Device } from '@airemote/shared'
import { LivePreviewBoard } from '../components/LivePreviewBoard'
import { Alert, Badge, Button, Card, EmptyState, Skeleton, SkeletonRows } from '../components/ui'

interface Session {
  id: string
  deviceId: string
  deviceName?: string
  type: string
  startedAt: string
  endedAt?: string
  durationSec?: number
}

interface ActiveScreen {
  sessionId: string
  viewers?: number
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  ssh: 'SSH',
  sftp: 'SFTP',
  ai: 'AI',
  vnc: 'VNC',
  rdp: 'RDP',
  screen: 'SCREEN',
}

/**
 * Links that must look like a primary action. Kept here (not in Button) because
 * Button renders a <button>, and nesting it inside <Link> is invalid HTML.
 */
const PRIMARY_LINK =
  'inline-flex h-7 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-[12px] font-medium ' +
  'text-primary-fg transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas'

function formatDuration(sec?: number) {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatLastSeen(value?: Date | string) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function ResourceBar({ value, tone }: { value: number; tone: 'teal' | 'amber' | 'red' }) {
  return (
    <div className="cr-resource-track">
      <span className={clsx('cr-resource-fill', `is-${tone}`)} style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
    </div>
  )
}

function DeviceCard({ device, activeStream, viewLabel, streamLabel }: {
  device: Device
  activeStream?: ActiveScreen
  viewLabel: string
  streamLabel: string
}) {
  const { statsMap } = useDeviceStore()
  const T = useT()
  const stats = statsMap[device.id] || device.stats
  const isOnline = device.status === 'online'
  const cpu = stats?.cpuPercent ?? 0
  const ram = stats?.ramPercent ?? 0

  function openStream(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    openScreenWindow(device.id)
  }

  return (
    <article className={clsx('cr-device', !isOnline && 'is-offline')}>
      <div className="cr-device-head">
        <div className="cr-device-icon"><Monitor size={15} /></div>
        <div className="cr-device-title">
          <strong>{device.name}</strong>
          <span>{device.info?.hostname || device.id.slice(0, 10)}</span>
        </div>
        <span className={clsx('cr-status', isOnline ? 'is-online' : 'is-offline')}>
          <i /> {isOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      <div className="cr-device-meta">
        <span>{device.info?.osVersion || device.info?.platform || 'Device'}</span>
        {device.info?.arch && <><b>·</b><span>{device.info.arch}</span></>}
        {activeStream && <><b>·</b><span className="cr-device-live">LIVE</span></>}
      </div>

      {isOnline && stats ? (
        <div className="cr-resources">
          <div className="cr-resource">
            <span><Cpu size={10} /> CPU <b>{Math.round(cpu)}%</b></span>
            <ResourceBar value={cpu} tone={cpu > 80 ? 'red' : 'teal'} />
          </div>
          <div className="cr-resource">
            <span><Activity size={10} /> RAM <b>{Math.round(ram)}%</b></span>
            <ResourceBar value={ram} tone={ram > 85 ? 'amber' : 'teal'} />
          </div>
        </div>
      ) : (
        <div className="cr-device-empty">
          {isOnline
            ? <span>{T('ov_waiting_stats')}</span>
            : <span>{T('ov_last_seen_prefix')} {formatLastSeen(device.lastSeen) || '—'}</span>}
        </div>
      )}

      <div className="cr-device-footer">
        <Link to={`/devices/${device.id}`} className="cr-device-link">
          {viewLabel} <ChevronRight size={12} />
        </Link>
        {isOnline && (
          <button type="button" onClick={openStream} className="cr-device-stream">
            <MonitorPlay size={12} /> {streamLabel}
          </button>
        )}
      </div>
    </article>
  )
}

export function OverviewPage() {
  const { devices, loading, error, fetchDevices, statsMap } = useDeviceStore()
  const T = useT()
  const navigate = useNavigate()
  const [aiPrompt, setAiPrompt] = useState('')
  const [fleetOpen, setFleetOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState(false)
  const [activeScreens, setActiveScreens] = useState<Record<string, ActiveScreen>>({})

  const onlineDevices = devices.filter(d => d.status === 'online')
  const online = onlineDevices.length
  const offline = devices.length - online
  const statsFor = (id: string) => statsMap[id] || devices.find(d => d.id === id)?.stats
  const monitoredDevices = onlineDevices.filter(d => typeof statsFor(d.id)?.cpuPercent === 'number')
  const attentionDevices = onlineDevices.filter(d => {
    const s = statsFor(d.id)
    return s && (s.cpuPercent > 85 || s.ramPercent > 85 || s.diskPercent > 90)
  })
  const alerts = attentionDevices.length
  const avgCpu = monitoredDevices.length > 0
    ? Math.round(monitoredDevices.reduce((sum, d) => sum + (statsFor(d.id)?.cpuPercent || 0), 0) / monitoredDevices.length)
    : 0
  const liveViewers = Object.values(activeScreens).reduce((sum, s) => sum + (s.viewers || 0), 0)

  const liveEntries = useMemo(() => Object.entries(activeScreens), [activeScreens])
  const primaryLive = liveEntries[0]
  const primaryDevice = primaryLive ? devices.find(d => d.id === primaryLive[0]) : undefined
  const aiContext = primaryDevice || onlineDevices[0] || devices[0]

  useEffect(() => {
    fetchDevices()
    const loadActive = () => {
      api.get('/api/sessions/screen/active')
        .then(r => {
          const map: Record<string, ActiveScreen> = {}
          for (const x of (r.data || [])) {
            if (x && x.deviceId) map[x.deviceId] = { sessionId: x.sessionId, viewers: x.viewers }
          }
          setActiveScreens(map)
        })
        .catch(() => {})
    }
    loadActive()
    const timer = setInterval(loadActive, 10_000)

    api.get('/api/sessions?limit=6')
      .then(r => { setSessions(r.data || []); setSessionsError(false) })
      .catch(() => setSessionsError(true))
      .finally(() => setSessionsLoading(false))

    return () => clearInterval(timer)
  }, [fetchDevices])

  function openLive(deviceId: string) {
    openScreenWindow(deviceId)
  }

  function submitAiPrompt(event: React.FormEvent) {
    event.preventDefault()
    const prompt = aiPrompt.trim()
    if (!prompt) return
    setAiPrompt('')
    navigate(`/ai?prompt=${encodeURIComponent(prompt)}`)
  }

  return (
    <div className="cr-page">
      <section className="cr-overview-head" aria-label={T('ov_room')}>
        <div className="cr-overview-copy">
          <span className="cr-eyebrow"><span /> {T('ov_room_upper')}</span>
          <h1>{T('ov_hero_title')}</h1>
          <p>{T('ov_hero_desc')}</p>
        </div>
        <div className="cr-overview-actions">
          <Link to="/devices" className="cr-btn"><Monitor size={12} /> {T('devices')}</Link>
          <Link to="/settings" className="cr-btn"><Settings size={12} /> {T('settings')}</Link>
        </div>
      </section>

      {error && (
        <Alert tone="danger" title={T('ov_load_failed')} className="mb-3">
          <Button size="sm" variant="secondary" onClick={() => fetchDevices()}>{T('ov_retry')}</Button>
        </Alert>
      )}

      <section className="cr-metrics" aria-label={T('ov_metrics_aria')}>
        <Link to="/devices" className="cr-metric cr-metric-ok is-clickable" title={T('ov_open_devices')}>
          <div className="cr-metric-top">
            <div className="cr-metric-label"><Wifi size={13} /> {T('ov_connected')}</div>
            <ArrowUpRight size={12} className="cr-metric-arrow" />
          </div>
          <div className="cr-metric-value">{online}<small> / {devices.length}</small></div>
          <div className="cr-metric-foot">
            <i />
            {offline > 0 ? `${offline} ${T('ov_offline_word')}` : T('ov_all_online')}
          </div>
          <div className="cr-metric-bar"><span style={{ width: `${devices.length ? Math.round(online / devices.length * 100) : 0}%` }} /></div>
        </Link>

        <Link to="/settings?tab=sessions" className="cr-metric is-clickable" title={T('ov_open_sessions')}>
          <div className="cr-metric-top">
            <div className="cr-metric-label"><MonitorPlay size={13} /> {T('ov_live_sessions')}</div>
            <ArrowUpRight size={12} className="cr-metric-arrow" />
          </div>
          <div className="cr-metric-value">{liveEntries.length}</div>
          <div className="cr-metric-foot">
            <i className={liveEntries.length > 0 ? 'is-on' : ''} />
            {liveEntries.length > 0
              ? `${liveViewers} ${T('ov_viewers')} · ${primaryDevice?.name || T('ov_active_stream')}`
              : T('ov_no_active_stream')}
          </div>
          <div className="cr-metric-bar"><span style={{ width: `${Math.min(100, liveEntries.length * 25)}%` }} /></div>
        </Link>

        <Link to="/devices" className={clsx('cr-metric is-clickable', alerts > 0 && 'cr-metric-warn')} title={T('ov_open_devices_resources')}>
          <div className="cr-metric-top">
            <div className="cr-metric-label"><AlertCircle size={13} /> {T('ov_needs_attention')}</div>
            <ArrowUpRight size={12} className="cr-metric-arrow" />
          </div>
          <div className="cr-metric-value">{alerts}</div>
          <div className="cr-metric-foot">
            <i className={alerts > 0 ? 'is-warn' : ''} />
            {monitoredDevices.length === 0
              ? T('ov_no_resource_data')
              : alerts > 0
                ? `${alerts} ${T('ov_high_resource')}`
                : T('ov_resources_normal')}
          </div>
          <div className="cr-metric-bar"><span style={{ width: `${online ? Math.min(100, alerts / online * 100) : 0}%` }} /></div>
        </Link>

        <Link to="/devices" className="cr-metric is-clickable" title={T('ov_monitor_resources')}>
          <div className="cr-metric-top">
            <div className="cr-metric-label"><Cpu size={13} /> {T('stat_avg_cpu')}</div>
            <ArrowUpRight size={12} className="cr-metric-arrow" />
          </div>
          <div className="cr-metric-value">{monitoredDevices.length ? avgCpu : '—'}<small>{monitoredDevices.length ? '%' : ''}</small></div>
          <div className="cr-metric-foot">
            <i />
            {online === 0
              ? T('ov_no_online')
              : `${monitoredDevices.length}/${online} ${T('ov_reporting')}`}
          </div>
          <div className="cr-metric-bar"><span style={{ width: `${monitoredDevices.length ? Math.min(100, avgCpu) : 0}%` }} /></div>
        </Link>
      </section>

      <div className="cr-layout">
        <div className="cr-main">
          <Card className="cr-live-card">
            <div className="cr-card-head">
              <div>
                <span className="cr-kicker"><i className="cr-pulse" /> {T('ov_live_screens')}</span>
                <h2>{primaryDevice?.name || T('ov_choose_device_stream')}</h2>
              </div>
              <Badge tone={primaryLive ? 'success' : onlineDevices.length ? 'info' : 'neutral'}>
                {primaryLive ? 'LIVE' : onlineDevices.length ? 'READY' : 'STANDBY'}
              </Badge>
            </div>

            {devices.length === 0 ? (
              <EmptyState
                className="py-10"
                icon={<Monitor size={22} />}
                title={T('ov_screen_ready')}
                description={T('ov_pick_online')}
                action={<Link to="/devices" className={PRIMARY_LINK}>{T('ov_choose_device')} <ChevronRight size={13} /></Link>}
              />
            ) : (
              <LivePreviewBoard devices={devices} activeScreens={activeScreens} onOpen={openLive} />
            )}
          </Card>

          <section className="cr-section">
            <div className="cr-section-head">
              <div>
                <span className="cr-kicker">{T('ov_fleet')}</span>
                <h2>{T('ov_your_devices')}</h2>
              </div>
              <div className="cr-section-actions">
                <Link to="/devices" className="cr-text-link">{T('view_all')} <ChevronRight size={12} /></Link>
                <button type="button" className="cr-collapse-btn" onClick={() => setFleetOpen(v => !v)} aria-expanded={fleetOpen}>
                  {fleetOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {fleetOpen ? T('ov_hide') : T('ov_show')}
                </button>
              </div>
            </div>

            {fleetOpen && (loading ? (
              <div className="cr-device-grid">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-[141px] rounded-xl" />)}
              </div>
            ) : error && devices.length === 0 ? (
              <Card>
                <EmptyState
                  className="py-8"
                  icon={<AlertCircle size={24} />}
                  title={T('ov_load_failed')}
                  action={<Button size="sm" variant="secondary" onClick={() => fetchDevices()}>{T('ov_retry')}</Button>}
                />
              </Card>
            ) : devices.length === 0 ? (
              <Card>
                <EmptyState
                  className="py-8"
                  icon={<Monitor size={28} />}
                  title={T('no_devices_yet')}
                  description={T('no_devices_desc')}
                  action={<Link to="/devices" className={PRIMARY_LINK}><Monitor size={13} /> {T('devices')}</Link>}
                />
              </Card>
            ) : (
              <div className="cr-device-grid">
                {devices.map(device => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    activeStream={activeScreens[device.id]}
                    viewLabel={T('ov_open')}
                    streamLabel={T('ov_stream')}
                  />
                ))}
              </div>
            ))}
          </section>

          <Card className="cr-recent">
            <div className="cr-section-head">
              <div>
                <span className="cr-kicker">{T('ov_activity')}</span>
                <h2>{T('recent_sessions')}</h2>
              </div>
              <div className="cr-section-actions">
                <Link to="/settings?tab=sessions" className="cr-text-link">{T('view_all')} <ChevronRight size={12} /></Link>
                <button type="button" className="cr-collapse-btn" onClick={() => setSessionsOpen(v => !v)} aria-expanded={sessionsOpen}>
                  {sessionsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {sessionsOpen ? T('ov_hide') : T('ov_show')}
                </button>
              </div>
            </div>
            {sessionsOpen && (sessionsLoading ? (
              <SkeletonRows rows={3} className="py-2" />
            ) : sessionsError ? (
              <Alert tone="danger" title={T('ov_load_failed')} className="mt-2" />
            ) : sessions.length === 0 ? (
              <EmptyState className="py-6" icon={<History size={20} />} title={T('no_sessions_yet')} />
            ) : (
              <div className="cr-session-list">
                {sessions.map(session => {
                  const active = !session.endedAt
                  return (
                    <div className="cr-session-row" key={session.id}>
                      <span className={clsx('cr-session-dot', active && 'is-active')} />
                      <div className="cr-session-copy">
                        <strong>{session.deviceName || session.deviceId?.slice(0, 10) || 'Device'}</strong>
                        <span>{new Date(session.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <span className="cr-session-type">{SESSION_TYPE_LABELS[session.type] || session.type.toUpperCase()}</span>
                      <span className={clsx('cr-session-state', active && 'is-active')}>
                        {active ? T('session_active') : formatDuration(session.durationSec)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </Card>
        </div>

        <aside className="cr-ai">
          <div className="cr-ai-head">
            <div className="cr-ai-mark"><Sparkles size={15} /></div>
            <div>
              <strong>{T('ai_assistant')}</strong>
              <span>{aiContext ? `${T('ov_context')} ${aiContext.name}` : T('ov_ready_help')}</span>
            </div>
            <span className="cr-ai-ctx">CTX</span>
          </div>

          <div className="cr-ai-body">
            <p className="cr-ai-label">{T('ov_what_to_do')}</p>
            <div className="cr-ai-prompt">
              {aiContext
                ? T('ov_prompt_open_space').replace('{name}', aiContext.name)
                : T('ov_add_device_first')}
            </div>

            <div className="cr-ai-suggestions">
              <Link to={`/ai?prompt=${encodeURIComponent(T('ov_prompt_check_health'))}`} className="cr-ai-suggestion"><span>01</span> {T('ov_check_health')} <ChevronRight size={12} /></Link>
              <Link to={`/ai?prompt=${encodeURIComponent(T('ov_prompt_open_app'))}`} className="cr-ai-suggestion"><span>02</span> {T('ov_open_last_app')} <ChevronRight size={12} /></Link>
              <Link to={`/ai?prompt=${encodeURIComponent(T('ov_prompt_summarize'))}`} className="cr-ai-suggestion"><span>03</span> {T('ov_summarize')} <ChevronRight size={12} /></Link>
            </div>

            <form className="cr-ai-compose" onSubmit={submitAiPrompt}>
              <input
                value={aiPrompt}
                onChange={event => setAiPrompt(event.target.value)}
                placeholder={T('ov_ask_placeholder')}
                aria-label={T('ov_ask_aria')}
              />
              <button type="submit" disabled={!aiPrompt.trim()} aria-label={T('ov_send_question')}>
                <Send size={13} />
              </button>
            </form>
          </div>

          <div className="cr-ai-note">
            <Sparkles size={11} /> {T('ov_sensitive_note')}
          </div>
        </aside>
      </div>
    </div>
  )
}
