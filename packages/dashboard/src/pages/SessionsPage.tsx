import { useState, useEffect, useCallback, useRef } from 'react'
import { History, Terminal, Monitor, FolderOpen, Bot, RefreshCw, Circle, Tv2, Square, AlertTriangle, Search, Download } from 'lucide-react'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { clsx } from 'clsx'
import { toast } from '../store/toastStore'
import { Alert, Button, Card, EmptyState, SkeletonRows } from '../components/ui'

interface SessionWithDevice {
  id: string; deviceId: string; deviceName: string; userId: string
  type: string; startedAt: string; endedAt?: string; durationSec?: number; ipAddress?: string
}

interface LiveScreenSession {
  sessionId: string; deviceId: string; deviceName: string; userId?: string; startedAt: string
}

const typeConfig: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  ssh:    { label: 'SSH Terminal', icon: Terminal,  color: 'text-primary',  bg: 'bg-primary/10'  },
  sftp:   { label: 'SFTP',        icon: FolderOpen, color: 'text-primary',  bg: 'bg-primary/10'  },
  ai:     { label: 'AI Chat',     icon: Bot,         color: 'text-warning',  bg: 'bg-warning/10'  },
  screen: { label: 'Screen',      icon: Tv2,         color: 'text-info',  bg: 'bg-info/10'  },
  vnc:    { label: 'VNC',         icon: Monitor,     color: 'text-info',  bg: 'bg-info/10'  },
  rdp:    { label: 'RDP',         icon: Monitor,     color: 'text-warning',  bg: 'bg-warning/10'  },
}

function formatDuration(sec?: number): string {
  if (!sec) return '—'
  if (sec < 60) return `${sec} ث`
  if (sec < 3600) return `${Math.floor(sec / 60)} د ${sec % 60} ث`
  return `${Math.floor(sec / 3600)} س ${Math.floor((sec % 3600) / 60)} د`
}

function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - new Date(since).getTime()) / 1000))
  useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [since])
  return <span className="font-mono text-xs text-muted">{formatDuration(elapsed)}</span>
}

export function SessionsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [sessions, setSessions]         = useState<SessionWithDevice[]>([])
  const [liveStreams, setLiveStreams]    = useState<LiveScreenSession[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<'' | 'sessions_load_failed'>('')
  const [stoppingId, setStoppingId]     = useState<string | null>(null)
  const [confirmId, setConfirmId]       = useState<string | null>(null)
  const [filter, setFilter]             = useState<string>('all')
  const [isAdmin, setIsAdmin]           = useState(false)
  // v3.8.38 (R8.3) — search + date range are applied by the server, so an export
  // contains the whole filtered set instead of the rows currently on screen.
  const [query, setQuery]               = useState('')
  const [fromDate, setFromDate]         = useState('')
  const [toDate, setToDate]             = useState('')
  const [exporting, setExporting]       = useState(false)
  const filtersRef = useRef({ q: '', from: '', to: '' })
  filtersRef.current = { q: query, from: fromDate, to: toDate }
  const T = useT()

  const listParams = useCallback(() => {
    const f = filtersRef.current
    const params: Record<string, string> = {}
    if (f.q.trim()) params.q = f.q.trim()
    if (f.from) params.from = f.from
    if (f.to) params.to = f.to + 'T23:59:59'
    return params
  }, [])

  const exportParams = useCallback(() => {
    const params = listParams()
    if (filter === 'active' || filter === 'ended') params.status = filter
    else if (filter !== 'all') params.type = filter
    return params
  }, [filter, listParams])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sessRes, liveRes] = await Promise.allSettled([
        api.get('/api/sessions', { params: listParams() }),
        api.get('/api/sessions/screen/active')
      ])
      if (sessRes.status === 'fulfilled') setSessions(sessRes.value.data)
      if (liveRes.status === 'fulfilled') {
        setLiveStreams(liveRes.value.data)
        setIsAdmin(true)
      }
      setError(sessRes.status === 'rejected' ? 'sessions_load_failed' : '')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Debounce the search box so typing does not hammer the API.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    const t = setTimeout(() => { load() }, 350)
    return () => clearTimeout(t)
  }, [query, fromDate, toDate, load])

  async function exportCsv() {
    setExporting(true)
    try {
      const res = await api.get('/api/sessions/export', { params: exportParams(), responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'airemote-sessions-' + new Date().toISOString().slice(0, 10) + '.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      toast.success(T('sessions_exported'))
    } catch {
      toast.error(T('sessions_export_failed'))
    } finally {
      setExporting(false)
    }
  }

  async function forceStop(sessionId: string) {
    setStoppingId(sessionId)
    setConfirmId(null)
    try {
      await api.delete(`/api/sessions/screen/${sessionId}`)
      setLiveStreams(prev => prev.filter(s => s.sessionId !== sessionId))
      toast.success(T('stream_stopped'))
      load()
    } catch {
      toast.error('Failed to stop stream')
    } finally {
      setStoppingId(null)
    }
  }

  const active = sessions.filter(s => !s.endedAt).length
  const types  = [...new Set(sessions.map(s => s.type))]

  const filtered =
    filter === 'all'    ? sessions :
    filter === 'active' ? sessions.filter(s => !s.endedAt) :
    filter === 'ended'  ? sessions.filter(s => s.endedAt) :
    sessions.filter(s => s.type === filter)

  const FILTERS = [
    { key: 'all',    label: T('all_sessions'),    count: sessions.length },
    { key: 'active', label: T('active_sessions'), count: active },
    { key: 'ended',  label: T('ended_sessions'),  count: sessions.length - active },
    ...types.map(t => ({ key: t, label: typeConfig[t]?.label || t.toUpperCase(), count: sessions.filter(s => s.type === t).length }))
  ]

  return (
    <div className={embedded ? 'space-y-6' : 'cr-page space-y-6'}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-ink">{T('sessions_title')}</h2>
          <button
            onClick={load} disabled={loading}
            className="flex items-center gap-2 text-sm text-muted hover:text-ink bg-surface2 hover:bg-surface border border-line px-3 py-2 rounded-lg transition-all disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {T('refresh')}
          </button>
          </div>
          <p className="text-muted text-sm mt-1">{T('sessions_subtitle')}</p>
        </div>
      </div>

      {/* ── Search / range / export (R8.3) ───────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={T('sessions_search_placeholder')}
            className="w-full bg-surface border border-line rounded-lg pl-8 pr-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-info/40"
          />
        </div>
        <input type="date" dir="ltr" value={fromDate} onChange={e => setFromDate(e.target.value)} title={T('sessions_from')} aria-label="من تاريخ"
          className="bg-surface border border-line rounded-lg px-2 py-2 text-xs text-ink" />
        <span className="text-muted text-xs">→</span>
        <input type="date" dir="ltr" value={toDate} onChange={e => setToDate(e.target.value)} title={T('sessions_to')} aria-label="إلى تاريخ"
          className="bg-surface border border-line rounded-lg px-2 py-2 text-xs text-ink" />
        <button onClick={exportCsv} disabled={exporting}
          className="flex items-center gap-2 text-sm text-muted hover:text-ink bg-surface2 hover:bg-surface border border-line px-3 py-2 rounded-lg transition-all disabled:opacity-50">
          <Download size={13} className={exporting ? 'animate-pulse' : ''} />
          {T('sessions_export')}
        </button>
      </div>

      {/* ── Live Streams Panel (admin only) ─────────────────────────────── */}
      {isAdmin && (
        <div className="rounded-xl border border-line bg-surface overflow-hidden border border-line">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line bg-surface2">
            <Tv2 size={15} className="text-info" />
            <span className="text-sm font-semibold text-ink">{T('live_streams')}</span>
            {liveStreams.length > 0 && (
              <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-info font-medium">
                {liveStreams.length}
              </span>
            )}
          </div>

          {liveStreams.length === 0 ? (
            <div className="text-center py-8">
              <Tv2 size={28} className="mx-auto mb-2 text-muted/30" />
              <p className="text-muted text-sm">{T('no_live_streams')}</p>
            </div>
          ) : (
            <div className="divide-y divide-line/60">
              {liveStreams.map(s => (
                <div key={s.sessionId} className="flex items-center gap-3 px-4 py-3 hover:bg-surface2 transition-colors">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Circle size={6} className="fill-current text-info animate-pulse shrink-0" />
                    <span className="text-sm font-medium text-ink truncate">{s.deviceName}</span>
                    <span className="text-[10px] text-muted shrink-0" dir="ltr">
                      {new Date(s.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <ElapsedTimer since={s.startedAt} />
                  </div>

                  {/* Confirm inline or Force-stop button */}
                  {confirmId === s.sessionId ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <AlertTriangle size={13} className="text-warning" />
                      <span className="text-xs text-warning">{T('force_stop_confirm')}</span>
                      <button
                        onClick={() => forceStop(s.sessionId)}
                        disabled={stoppingId === s.sessionId}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-danger/15 text-danger hover:bg-danger/25 border border-danger/40 font-medium transition-all disabled:opacity-50"
                      >
                        {stoppingId === s.sessionId ? '…' : T('force_stop')}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-surface2 text-muted hover:text-ink transition-all"
                      >
                        {T('cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(s.sessionId)}
                      className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 border border-danger/30 font-medium transition-all shrink-0"
                    >
                      <Square size={10} className="fill-current" />
                      {T('force_stop')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key} onClick={() => setFilter(f.key)}
            className={clsx(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all border',
              filter === f.key
                ? 'bg-primary/5 text-primary border-primary/30'
                : 'bg-surface2 text-muted hover:text-ink border-transparent hover:border-line'
            )}
          >
            {f.label}
            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full', filter === f.key ? 'bg-primary text-primary-fg' : 'bg-line text-ink')}>{f.count}</span>
          </button>
        ))}
      </div>

      {error && (
        <Alert tone="danger" className="mb-3">
          <div className="flex items-center gap-2">
            <span>{T(error)}</span>
            <button type="button" onClick={() => load()} className="underline underline-offset-2">{T('ui_retry')}</button>
          </div>
        </Alert>
      )}

      {/* Session history table */}
      {loading ? (
        <Card><div className="p-3"><SkeletonRows rows={6} /></div></Card>
      ) : (
        <div className="rounded-xl border border-line bg-surface overflow-hidden">
          {filtered.length === 0 && !error && (
            <EmptyState icon={<History size={26} />} title={T('no_sessions_yet')} />
          )}
          {filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[550px]">
                <thead>
                  <tr className="border-b border-line">
                    {[T('session_type'), T('session_device'), T('session_start'), T('session_duration'), 'المستخدم', ''].map((h, i) => (
                      <th key={i} className="text-xs text-muted font-medium px-4 py-3 text-start">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => {
                    const tc     = typeConfig[s.type] || { label: s.type.toUpperCase(), icon: Monitor, color: 'text-muted', bg: 'bg-surface2' }
                    const Icon   = tc.icon
                    const isActive = !s.endedAt
                    return (
                      <tr key={s.id} className={clsx('border-b border-line/60 hover:bg-surface2 transition-colors', i === filtered.length - 1 && 'border-b-0')}>
                        <td className="px-4 py-3">
                          <div className={clsx('inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-medium', tc.bg, tc.color)}>
                            <Icon size={11} /> {tc.label}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-ink font-medium text-xs">{s.deviceName}</td>
                        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap" dir="ltr">
                          {(() => {
                            const d = new Date(s.startedAt)
                            const p2 = (n: number) => String(n).padStart(2, '0')
                            return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} · ${p2(d.getHours())}:${p2(d.getMinutes())}`
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-success font-medium">
                              <Circle size={6} className="fill-current animate-pulse" /> {T('session_active')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted font-mono">{formatDuration(s.durationSec)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted" dir="ltr">{(s as unknown as { userEmail?: string }).userEmail || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('text-[10px] px-2 py-0.5 rounded-full', isActive ? 'bg-success/10 text-success' : 'bg-surface2 text-muted')}>
                            {isActive ? '●' : '○'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
