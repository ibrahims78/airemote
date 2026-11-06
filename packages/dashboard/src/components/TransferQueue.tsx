import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Upload, Pause, Play, X, ChevronDown, ChevronUp, CheckCircle2, FileUp, Gauge, FolderUp
} from 'lucide-react'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { onTransferProgress } from '../lib/websocket'
import { Alert, Badge, Button, EmptyState, ProgressBar, Select } from './ui'

interface Transfer {
  id: string
  batchId: string | null
  deviceId: string
  direction: 'upload' | 'download'
  sourcePath: string | null
  destPath: string
  finalPath: string | null
  size: number
  bytesDone: number
  nextOffset: number
  chunkSize: number
  sha256: string | null
  actualSha256: string | null
  state: string
  conflict: string
  error: string | null
  errorCode: string | null
  speedLimitKbps: number
  percent: number | null
  createdAt: string
}

interface Props {
  deviceId: string
  currentPath: string
  onFinished?: () => void
}

const CHUNK = 1024 * 1024

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const STATE: Record<string, { tone: Tone }> = {
  queued: { tone: 'neutral' },
  running: { tone: 'info' },
  paused: { tone: 'warning' },
  completed: { tone: 'success' },
  failed: { tone: 'danger' },
  cancelled: { tone: 'neutral' },
  skipped: { tone: 'info' }
}

function authToken(): string {
  try {
    const raw = localStorage.getItem('airemote-auth')
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { state?: { token?: string } }
    return parsed?.state?.token || ''
  } catch { return '' }
}

function fmtBytes(n: number): string {
  if (!n || n <= 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function sha256Of(file: File): Promise<string | null> {
  if (file.size > 128 * 1024 * 1024) return null // بصمة المتصفح مكلفة للملفات الضخمة
  try {
    const buf = await file.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch { return null }
}

export function TransferQueue({ deviceId, currentPath, onFinished }: Props) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState<'rename' | 'replace' | 'skip'>('rename')
  const [speedMbps, setSpeedMbps] = useState('0')
  const [resumeTarget, setResumeTarget] = useState<Transfer | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const resumeRef = useRef<HTMLInputElement>(null)
  const stopRef = useRef<Record<string, 'pause' | 'cancel' | null>>({})
  const heldFiles = useRef<Map<string, File>>(new Map())
  const hashes = useRef<Map<string, string | null>>(new Map())
  const onDone = useRef(onFinished)
  onDone.current = onFinished

  const refresh = useCallback(async () => {
    try {
      const res = await api.get(`/api/file-transfers?deviceId=${encodeURIComponent(deviceId)}&limit=40`, { timeout: 15000 })
      setTransfers((res.data?.transfers || []) as Transfer[])
      setUnavailable(false)
    } catch (e: unknown) {
      const err = e as { response?: { status?: number } }
      if (err.response?.status === 404) setUnavailable(true)
    }
  }, [deviceId])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 2500)
    const off = onTransferProgress((payload) => {
      const p = payload as Partial<Transfer> & { id?: string }
      if (!p || !p.id) return
      setTransfers(prev => prev.map(t => (t.id === p.id ? { ...t, ...p } as Transfer : t)))
      if (p.state === 'completed') onDone.current?.()
    })
    return () => { clearInterval(timer); off() }
  }, [refresh])

  async function runLoop(id: string, file: File, from: number) {
    let offset = from
    try {
      while (offset < file.size) {
        if (stopRef.current[id]) break
        const blob = file.slice(offset, Math.min(offset + CHUNK, file.size))
        await api.put(`/api/file-transfers/${id}/data?offset=${offset}`, blob, {
          headers: { 'Content-Type': 'application/octet-stream' },
          timeout: 120000
        })
        offset += blob.size
        setTransfers(prev => prev.map(t => (t.id === id ? { ...t, bytesDone: offset, percent: file.size ? Math.round((offset / file.size) * 1000) / 10 : null } : t)))
      }
      const stop = stopRef.current[id]
      if (stop === 'pause') {
        try { await api.post(`/api/file-transfers/${id}/pause`, {}) } catch {}
      } else if (stop === 'cancel') {
        try { await api.post(`/api/file-transfers/${id}/cancel`, {}) } catch {}
      } else {
        const digest = hashes.current.get(id) ?? null
        await api.post(`/api/file-transfers/${id}/finish`, { sha256: digest }, { timeout: 300000 })
        heldFiles.current.delete(id)
        onDone.current?.()
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || 'فشل النقل.')
    } finally {
      stopRef.current[id] = null
      await refresh()
    }
  }

  async function startNew(file: File) {
    setError('')
    setBusy('new')
    try {
      const digest = await sha256Of(file)
      const dest = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`
      const kbps = Math.round(Number(speedMbps || '0') * 1024)
      const created = await api.post(`/api/devices/${deviceId}/file-transfers`, {
        direction: 'upload', path: dest, size: file.size, sha256: digest,
        conflict, speedLimitKbps: kbps > 0 ? kbps : 0
      }, { timeout: 30000 })
      const t = created.data.transfer as Transfer
      heldFiles.current.set(t.id, file)
      hashes.current.set(t.id, digest)
      stopRef.current[t.id] = null
      const started = await api.post(`/api/file-transfers/${t.id}/start`, {}, { timeout: 60000 })
      const row = started.data.transfer as Transfer
      setTransfers(prev => [row, ...prev])
      setOpen(true)
      await runLoop(t.id, file, row.nextOffset || 0)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; code?: string } }; message?: string }
      const code = err.response?.data?.code
      setError(code === 'device_offline' ? 'الجهاز غير متصل.' : (err.response?.data?.error || err.message || 'فشل بدء النقل.'))
    } finally {
      setBusy(null)
    }
  }

  async function pause(id: string) {
    stopRef.current[id] = 'pause'
    setBusy(id)
    try { await api.post(`/api/file-transfers/${id}/pause`, {}) } catch {}
    setBusy(null)
    await refresh()
  }

  async function cancel(id: string) {
    stopRef.current[id] = 'cancel'
    setBusy(id)
    try { await api.post(`/api/file-transfers/${id}/cancel`, {}) } catch {}
    heldFiles.current.delete(id)
    setBusy(null)
    await refresh()
  }

  async function resume(id: string) {
    const t = transfers.find(x => x.id === id)
    if (!t) return
    const held = heldFiles.current.get(id)
    if (!held) { setResumeTarget(t); resumeRef.current?.click(); return }
    await resumeWith(id, held)
  }

  async function resumeWith(id: string, file: File) {
    setError('')
    setBusy(id)
    try {
      const res = await api.post(`/api/file-transfers/${id}/resume`, {}, { timeout: 60000 })
      const row = res.data.transfer as Transfer
      heldFiles.current.set(id, file)
      setTransfers(prev => prev.map(t => (t.id === id ? row : t)))
      stopRef.current[id] = null
      await runLoop(id, file, row.nextOffset || 0)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || 'فشل الاستكمال.')
    } finally {
      setBusy(null)
      setResumeTarget(null)
    }
  }

  async function startQueued(t: Transfer) {
    const held = heldFiles.current.get(t.id)
    if (!held) { setError('أعد اختيار الملف لبدء هذا النقل (لا يحتفظ المتصفح بالملف بعد إغلاق الصفحة).'); return }
    setBusy(t.id)
    try {
      const res = await api.post(`/api/file-transfers/${t.id}/start`, {})
      const row = res.data.transfer as Transfer
      setTransfers(prev => prev.map(x => (x.id === t.id ? row : x)))
      stopRef.current[t.id] = null
      await runLoop(t.id, held, row.nextOffset || 0)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || 'فشل البدء.')
    } finally { setBusy(null) }
  }

  const active = transfers.filter(t => ['running', 'paused', 'queued', 'failed'].includes(t.state)).length

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 transition-colors duration-fast hover:bg-surface2"
      >
        <span className="flex items-center gap-2 text-[12px] font-medium text-ink">
          <FileUp size={14} className="text-primary" />
          {tr('tq_title')}
          {active > 0 && <Badge tone="info">{tr('tq_active', { n: active })}</Badge>}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted">
          {transfers.length > 0 && <span>{tr('tq_items', { n: transfers.length })}</span>}
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-line p-3">
          {unavailable ? (
            <Alert tone="warning" title={tr('tq_unavailable_title')}>
              {tr('tq_unavailable_body')}
            </Alert>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" loading={busy === 'new'} icon={<Upload size={13} />} onClick={() => fileRef.current?.click()}>
                  {tr('tq_resumable_upload')}
                </Button>
                <input
                  ref={fileRef} type="file" className="hidden" aria-label={tr('tq_pick_file')}
                  onChange={e => { const f = e.target.files?.[0]; if (f) void startNew(f); e.currentTarget.value = '' }}
                />
                <input
                  ref={resumeRef} type="file" className="hidden" aria-label={tr('tq_pick_resume')}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    e.currentTarget.value = ''
                    if (f && resumeTarget) {
                      if (resumeTarget.size && f.size !== resumeTarget.size) { setError(tr('tq_size_mismatch')); setResumeTarget(null); return }
                      void resumeWith(resumeTarget.id, f)
                    }
                  }}
                />
                <label className="flex items-center gap-1 text-[11px] text-muted">
                  {tr('tq_on_conflict')}
                  <Select value={conflict} onChange={e => setConflict(e.target.value as 'rename' | 'replace' | 'skip')} aria-label={tr('tq_conflict_policy')}>
                    <option value="rename">{tr('fm_rename')}</option>
                    <option value="replace">{tr('tq_replace')}</option>
                    <option value="skip">{tr('tq_skip')}</option>
                  </Select>
                </label>
                <label className="flex items-center gap-1 text-[11px] text-muted">
                  <Gauge size={12} />
                  {tr('tq_speed_limit')}
                  <Select value={speedMbps} onChange={e => setSpeedMbps(e.target.value)} aria-label={tr('tq_speed_limit')}>
                    <option value="0">{tr('tq_no_limit')}</option>
                    <option value="2">2 MB/s</option>
                    <option value="8">8 MB/s</option>
                    <option value="32">32 MB/s</option>
                  </Select>
                </label>
              </div>

              {error && <Alert tone="danger" onClose={() => setError('')}>{error}</Alert>}

              {transfers.length === 0 ? (
                <EmptyState
                  icon={<FolderUp size={18} />}
                  title={tr('tq_empty_title')}
                  description={tr('tq_empty_desc')}
                />
              ) : (
                <div className="max-h-64 space-y-1.5 overflow-y-auto pe-1">
                  {transfers.map(t => {
                    const name = (t.finalPath || t.destPath || t.sourcePath || '').split(/[\\/]/).pop() || '—'
                    const pct = t.percent ?? (t.size ? Math.min(100, (t.bytesDone / t.size) * 100) : 0)
                    const canResume = (t.state === 'paused' || t.state === 'failed') && t.direction === 'upload'
                    const isBusy = busy === t.id
                    const meta = STATE[t.state] || STATE.queued
                    return (
                      <div key={t.id} className="rounded-lg border border-line bg-surface2 px-2.5 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-ink" title={t.destPath}>{name}</span>
                          <Badge tone={meta.tone}>{tr(('tq_state_' + t.state) as never)}</Badge>
                        </div>
                        <ProgressBar
                          className="mt-1"
                          value={t.state === 'completed' ? 100 : pct}
                          tone={t.state === 'failed' ? 'danger' : t.state === 'completed' ? 'success' : 'primary'}
                          label={tr('tq_progress', { name })}
                        />
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="truncate text-[10px] text-muted">
                            {fmtBytes(t.bytesDone)} / {fmtBytes(t.size)} · {t.direction === 'upload' ? tr('tq_upload') : tr('tq_download')}
                            {t.error ? ` · ${t.error}` : ''}
                          </span>
                          <span className="flex shrink-0 items-center gap-0.5">
                            {t.state === 'running' && (
                              <Button variant="ghost" size="sm" className="!px-1" loading={isBusy} aria-label={tr('tq_pause')} title={tr('tq_pause')} icon={<Pause size={12} />} onClick={() => void pause(t.id)} />
                            )}
                            {canResume && (
                              <Button variant="ghost" size="sm" className="!px-1 text-success" loading={isBusy} aria-label={tr('tq_resume')} title={tr('tq_resume')} icon={<Play size={12} />} onClick={() => void resume(t.id)} />
                            )}
                            {t.state === 'queued' && (
                              <Button variant="ghost" size="sm" className="!px-1 text-success" aria-label={tr('tq_start')} title={tr('tq_start')} icon={<Play size={12} />} onClick={() => void startQueued(t)} />
                            )}
                            {['running', 'paused', 'queued', 'failed'].includes(t.state) && (
                              <Button variant="ghost" size="sm" className="!px-1 text-danger" loading={isBusy} aria-label={tr('fm_cancel')} title={tr('fm_cancel')} icon={<X size={12} />} onClick={() => void cancel(t.id)} />
                            )}
                            {t.state === 'completed' && <CheckCircle2 size={12} className="text-success" aria-hidden />}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
