import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertCircle, ArrowUpRight, ChevronDown, ChevronRight, ChevronUp, Cpu,
  History, Monitor, MonitorPlay, Play, Plus, Send, Settings, Sparkles,
  Wifi
} from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'
import { useUIStore } from '../store/uiStore'
import { useT } from '../lib/i18n'
import { clsx } from 'clsx'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Device } from '@airemote/shared'
import { LivePreviewBoard } from '../components/LivePreviewBoard'

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
  const stats = statsMap[device.id] || device.stats
  const isOnline = device.status === 'online'
  const cpu = stats?.cpuPercent ?? 0
  const ram = stats?.ramPercent ?? 0

  function openStream(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    window.open(`/view/${device.id}`, `airemote-stream-${device.id}`, 'width=1400,height=900')
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
          {isOnline ? <span>بانتظار بيانات الجهاز…</span> : <span>آخر ظهور: {formatLastSeen(device.lastSeen) || '—'}</span>}
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
  const { devices, loading, fetchDevices, statsMap } = useDeviceStore()
  const { lang } = useUIStore()
  const T = useT()
  const navigate = useNavigate()
  const [aiPrompt, setAiPrompt] = useState('')
  const [fleetOpen, setFleetOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [activeScreens, setActiveScreens] = useState<Record<string, ActiveScreen>>({})

  const isRtl = lang === 'ar'
  const tr = (ar: string, en: string) => isRtl ? ar : en

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
      .then(r => setSessions(r.data || []))
      .catch(() => {})
      .finally(() => setSessionsLoading(false))

    return () => clearInterval(timer)
  }, [fetchDevices])

  function openLive(deviceId: string) {
    window.open(`/view/${deviceId}`, `airemote-stream-${deviceId}`, 'width=1400,height=900')
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
      <section className="cr-overview-head" aria-label={tr('غرفة العمليات', 'Operations room')}>
        <div className="cr-overview-copy">
          <span className="cr-eyebrow"><span /> {tr('غرفة العمليات', 'OPERATIONS ROOM')}</span>
          <h1>{tr('شاشتك ومساعدك في مساحة واحدة.', 'Your screen and copilot in one workspace.')}</h1>
          <p>{tr('راقب أجهزتك، ابدأ البث فوراً، واسأل المساعد الذكي عن ما تراه على الشاشة دون مغادرة السياق.', 'Monitor your devices, start streaming instantly, and ask the AI copilot about what is on screen without leaving context.')}</p>
        </div>
        <div className="cr-overview-actions">
          <Link to="/devices" className="cr-btn"><Monitor size={12} /> {tr('الأجهزة', 'Devices')}</Link>
          <button type="button" className="cr-btn is-primary" onClick={() => {
            const device = primaryDevice || onlineDevices[0]
            if (device) openLive(device.id)
            else navigate('/devices')
          }}><Play size={12} /> {tr('بدء البث الحي', 'Start live stream')}</button>
          <Link to="/settings" className="cr-btn"><Settings size={12} /> {tr('الإعدادات', 'Settings')}</Link>
        </div>
      </section>

      <section className="cr-metrics" aria-label={tr('مؤشرات التشغيل', 'Operations metrics')}>
        <Link to="/devices" className="cr-metric cr-metric-ok is-clickable" title={tr('فتح قائمة الأجهزة', 'Open devices')}>
          <div className="cr-metric-top">
            <div className="cr-metric-label"><Wifi size={13} /> {tr('أجهزة متصلة', 'Connected')}</div>
            <ArrowUpRight size={12} className="cr-metric-arrow" />
          </div>
          <div className="cr-metric-value">{online}<small> / {devices.length}</small></div>
          <div className="cr-metric-foot">
            <i />
            {offline > 0 ? `${offline} ${tr('غير متصل', 'offline')}` : tr('كل الأجهزة متصلة', 'All devices online')}
          </div>
          <div className="cr-metric-bar"><span style={{ width: `${devices.length ? Math.round(online / devices.length * 100) : 0}%` }} /></div>
        </Link>

        <Link to="/settings?tab=sessions" className="cr-metric is-clickable" title={tr('فتح الجلسات', 'Open sessions')}>
          <div className="cr-metric-top">
            <div className="cr-metric-label"><MonitorPlay size={13} /> {tr('جلسات بث', 'Live sessions')}</div>
            <ArrowUpRight size={12} className="cr-metric-arrow" />
          </div>
          <div className="cr-metric-value">{liveEntries.length}</div>
          <div className="cr-metric-foot">
            <i className={liveEntries.length > 0 ? 'is-on' : ''} />
            {liveEntries.length > 0
              ? `${liveViewers} ${tr('مشاهد', 'viewer(s)')} · ${primaryDevice?.name || tr('بث نشط', 'active')}`
              : tr('لا يوجد بث نشط', 'No active stream')}
          </div>
          <div className="cr-metric-bar"><span style={{ width: `${Math.min(100, liveEntries.length * 25)}%` }} /></div>
        </Link>

        <Link to="/devices" className={clsx('cr-metric is-clickable', alerts > 0 && 'cr-metric-warn')} title={tr('فتح الأجهزة لمراجعة الموارد', 'Open devices to review resources')}>
          <div className="cr-metric-top">
            <div className="cr-metric-label"><AlertCircle size={13} /> {tr('تحتاج انتباهاً', 'Needs attention')}</div>
            <ArrowUpRight size={12} className="cr-metric-arrow" />
          </div>
          <div className="cr-metric-value">{alerts}</div>
          <div className="cr-metric-foot">
            <i className={alerts > 0 ? 'is-warn' : ''} />
            {monitoredDevices.length === 0
              ? tr('لا توجد بيانات موارد', 'No resource data')
              : alerts > 0
                ? `${alerts} ${tr('بموارد مرتفعة', 'high resource')}`
                : tr('كل الموارد طبيعية', 'Resources normal')}
          </div>
          <div className="cr-metric-bar"><span style={{ width: `${online ? Math.min(100, alerts / online * 100) : 0}%` }} /></div>
        </Link>

        <Link to="/devices" className="cr-metric is-clickable" title={tr('مراقبة موارد الأجهزة', 'Monitor device resources')}>
          <div className="cr-metric-top">
            <div className="cr-metric-label"><Cpu size={13} /> {tr('متوسط CPU', 'Average CPU')}</div>
            <ArrowUpRight size={12} className="cr-metric-arrow" />
          </div>
          <div className="cr-metric-value">{monitoredDevices.length ? avgCpu : '—'}<small>{monitoredDevices.length ? '%' : ''}</small></div>
          <div className="cr-metric-foot">
            <i />
            {online === 0
              ? tr('لا توجد أجهزة متصلة', 'No online devices')
              : `${monitoredDevices.length}/${online} ${tr('يرسل بيانات', 'reporting')}`}
          </div>
          <div className="cr-metric-bar"><span style={{ width: `${monitoredDevices.length ? Math.min(100, avgCpu) : 0}%` }} /></div>
        </Link>
      </section>

      <div className="cr-layout">
        <div className="cr-main">
          <section className="cr-card cr-live-card">
            <div className="cr-card-head">
              <div>
                <span className="cr-kicker"><i className="cr-pulse" /> {tr('البث المباشر', 'Live screens')}</span>
                <h2>{primaryDevice?.name || tr('اختر جهازاً وابدأ البث', 'Choose a device and start streaming')}</h2>
              </div>
              <span className={clsx('cr-badge', (primaryLive || onlineDevices.length > 0) && 'is-live')}>
                {primaryLive ? 'LIVE' : onlineDevices.length ? 'READY' : 'STANDBY'}
              </span>
            </div>

            {devices.length === 0 ? (
              <div className="cr-live-empty">
                <div className="cr-live-empty-icon"><Monitor size={22} /></div>
                <div>
                  <strong>{tr('الشاشة جاهزة عندما تكون مستعداً.', 'Your screen is ready when you are.')}</strong>
                  <p>{tr('اختر جهازاً متصلاً وابدأ البث من بطاقته.', 'Pick an online device and start a stream from its card.')}</p>
                </div>
                <Link to="/devices" className="cr-btn">{tr('اختيار جهاز', 'Choose a device')} <ChevronRight size={13} /></Link>
              </div>
            ) : (
              <LivePreviewBoard devices={devices} activeScreens={activeScreens} onOpen={openLive} />
            )}
          </section>

          <section className="cr-section">
            <div className="cr-section-head">
              <div>
                <span className="cr-kicker">{tr('الأسطول', 'Fleet')}</span>
                <h2>{tr('أجهزتك', 'Your devices')}</h2>
              </div>
              <div className="cr-section-actions">
                <Link to="/devices" className="cr-text-link">{T('view_all')} <ChevronRight size={12} /></Link>
                <button type="button" className="cr-collapse-btn" onClick={() => setFleetOpen(v => !v)} aria-expanded={fleetOpen}>
                  {fleetOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {fleetOpen ? tr('إخفاء', 'Hide') : tr('إظهار', 'Show')}
                </button>
              </div>
            </div>

            {fleetOpen && (loading ? (
              <div className="cr-device-grid">
                {[0, 1, 2].map(i => <div className="cr-device cr-skeleton" key={i} />)}
              </div>
            ) : devices.length === 0 ? (
              <div className="cr-empty">
                <Monitor size={28} />
                <strong>{T('no_devices_yet')}</strong>
                <p>{T('no_devices_desc')}</p>
                <Link to="/devices" className="cr-btn is-primary"><Monitor size={13} /> {tr('الأجهزة', 'Devices')}</Link>
              </div>
            ) : (
              <div className="cr-device-grid">
                {devices.map(device => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    activeStream={activeScreens[device.id]}
                    viewLabel={tr('فتح', 'Open')}
                    streamLabel={tr('بث', 'Stream')}
                  />
                ))}
              </div>
            ))}
          </section>

          <section className="cr-card cr-recent">
            <div className="cr-section-head">
              <div>
                <span className="cr-kicker">{tr('السجل', 'Activity')}</span>
                <h2>{T('recent_sessions')}</h2>
              </div>
              <div className="cr-section-actions">
                <Link to="/settings?tab=sessions" className="cr-text-link">{T('view_all')} <ChevronRight size={12} /></Link>
                <button type="button" className="cr-collapse-btn" onClick={() => setSessionsOpen(v => !v)} aria-expanded={sessionsOpen}>
                  {sessionsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {sessionsOpen ? tr('إخفاء', 'Hide') : tr('إظهار', 'Show')}
                </button>
              </div>
            </div>
            {sessionsOpen && (sessionsLoading ? (
              <div className="cr-recent-loading"><span className="cr-spinner" /> {T('loading')}</div>
            ) : sessions.length === 0 ? (
              <div className="cr-recent-empty">{T('no_sessions_yet')}</div>
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
          </section>
        </div>

        <aside className="cr-ai">
          <div className="cr-ai-head">
            <div className="cr-ai-mark"><Sparkles size={15} /></div>
            <div>
              <strong>{T('ai_assistant')}</strong>
              <span>{aiContext ? `${tr('السياق:', 'Context:')} ${aiContext.name}` : tr('جاهز للمساعدة', 'Ready to help')}</span>
            </div>
            <span className="cr-ai-ctx">CTX</span>
          </div>

          <div className="cr-ai-body">
            <p className="cr-ai-label">{tr('ماذا تريد أن تفعل؟', 'What do you want to do?')}</p>
            <div className="cr-ai-prompt">
              {aiContext
                ? tr(`افتح مساحة ${aiContext.name} وتحقق من حالة الاتصال والموارد.`, `Open ${aiContext.name} and check connectivity and resources.`)
                : tr('أضف جهازاً أولاً ثم اسألني عن حالته.', 'Add your first device, then ask me about its health.')}
            </div>

            <div className="cr-ai-suggestions">
              <Link to={`/ai?prompt=${encodeURIComponent(tr('تحقق من صحة الاتصال والموارد للجهاز الحالي', 'Check current device connectivity and resources'))}`} className="cr-ai-suggestion"><span>01</span> {tr('تحقق من صحة الاتصال', 'Check connection health')} <ChevronRight size={12} /></Link>
              <Link to={`/ai?prompt=${encodeURIComponent(tr('افتح آخر تطبيق على الجهاز الحالي', 'Open the last app on the current device'))}`} className="cr-ai-suggestion"><span>02</span> {tr('افتح آخر تطبيق على الجهاز', 'Open the last app on the device')} <ChevronRight size={12} /></Link>
              <Link to={`/ai?prompt=${encodeURIComponent(tr('لخّص أحدث الجلسات', 'Summarize recent sessions'))}`} className="cr-ai-suggestion"><span>03</span> {tr('لخّص أحدث جلسات', 'Summarize recent sessions')} <ChevronRight size={12} /></Link>
            </div>

            <form className="cr-ai-compose" onSubmit={submitAiPrompt}>
              <input
                value={aiPrompt}
                onChange={event => setAiPrompt(event.target.value)}
                placeholder={tr('اسأل عن الشاشة أو الجهاز…', 'Ask about your screen or device…')}
                aria-label={tr('سؤال للمساعد الذكي', 'Ask the AI copilot')}
              />
              <button type="submit" disabled={!aiPrompt.trim()} aria-label={tr('إرسال السؤال', 'Send question')}>
                <Send size={13} />
              </button>
            </form>
          </div>

          <div className="cr-ai-note">
            <Sparkles size={11} /> {tr('كل إجراء حساس يطلب تأكيداً قبل التنفيذ.', 'Sensitive actions require confirmation.')}
          </div>
        </aside>
      </div>
    </div>
  )
}
