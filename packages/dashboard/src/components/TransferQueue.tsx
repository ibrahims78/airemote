import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Upload, Pause, Play, X, ChevronDown, ChevronUp, Loader2, CheckCircle2,
  AlertTriangle, FileUp, Gauge
} from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../lib/api'
import { onTransferProgress } from '../lib/websocket'

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

const STATE_LABEL: Record<string, string> = {
  queued: 'في الانتظار',
  running: 'جارٍ',
  paused: 'متوقف',
  completed: 'مكتمل',
  failed: 'فشل',
  cancelled: 'ملغى',
  skipped: 'تم التخطّي'
}

const STATE_STYLE: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
  running: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  failed: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400',
  skipped: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
}

export function TransferQueue({ deviceId, currentPath, onFinished }: Props) {
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
      const list = (res.data?.transfers || []) as Transfer[]
      setTransfers(list)
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
        const stop = stopRef.current[id]
        if (stop) break
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
    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2 text-[12px] font-medium text-slate-700 dark:text-slate-200">
          <FileUp size={14} className="text-brand-blue" />
          نقل الملفات
          {active > 0 && <span className="px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-[10px]">{active} نشط</span>}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          {transfers.length > 0 && <span>{transfers.length} عنصر</span>}
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-200 dark:border-white/10 p-3 space-y-3">
          {unavailable ? (
            <div className="text-[11px] text-amber-700 dark:text-amber-300/90 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-2.5 py-2">
              محرّك النقل غير متاح على السيرفر المثبَّت (يتطلب 3.8.13). التغيير موجود في المصدر فقط.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy === 'new'}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-blue hover:bg-blue-500 disabled:opacity-50 text-white text-[12px] font-medium"
                >
                  {busy === 'new' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  رفع قابل للاستكمال
                </button>
                <input
                  ref={fileRef} type="file" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) void startNew(f); e.currentTarget.value = '' }}
                />
                <input
                  ref={resumeRef} type="file" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    e.currentTarget.value = ''
                    if (f && resumeTarget) {
                      if (resumeTarget.size && f.size !== resumeTarget.size) { setError('حجم الملف لا يطابق النقل الأصلي.'); setResumeTarget(null); return }
                      void resumeWith(resumeTarget.id, f)
                    }
                  }}
                />
                <label className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  عند التعارض
                  <select
                    value={conflict} onChange={e => setConflict(e.target.value as 'rename' | 'replace' | 'skip')}
                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/10 rounded-md px-1.5 py-1 text-[11px] text-slate-700 dark:text-slate-200"
                  >
                    <option value="rename">إعادة تسمية</option>
                    <option value="replace">استبدال</option>
                    <option value="skip">تخطٍّ</option>
                  </select>
                </label>
                <label className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Gauge size={12} />
                  حد السرعة
                  <select
                    value={speedMbps} onChange={e => setSpeedMbps(e.target.value)}
                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/10 rounded-md px-1.5 py-1 text-[11px] text-slate-700 dark:text-slate-200"
                  >
                    <option value="0">بلا حد</option>
                    <option value="2">2 MB/s</option>
                    <option value="8">8 MB/s</option>
                    <option value="32">32 MB/s</option>
                  </select>
                </label>
              </div>

              {error && (
                <div className="flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-2.5 py-2">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {error}
                </div>
              )}

              {transfers.length === 0 ? (
                <div className="text-[11px] text-slate-500 dark:text-slate-500 py-2">لا عمليات نقل بعد. الملفات المرفوعة من هنا تُستكمل بعد الانقطاع.</div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pe-1">
                  {transfers.map(t => {
                    const name = (t.finalPath || t.destPath || t.sourcePath || '').split(/[\\/]/).pop() || '—'
                    const pct = t.percent ?? (t.size ? Math.min(100, (t.bytesDone / t.size) * 100) : 0)
                    const canResume = (t.state === 'paused' || t.state === 'failed') && t.direction === 'upload'
                    const isBusy = busy === t.id
                    return (
                      <div key={t.id} className="rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 px-2.5 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-700 dark:text-slate-200 truncate" title={t.destPath}>{name}</span>
                          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full shrink-0', STATE_STYLE[t.state] || STATE_STYLE.queued)}>
                            {STATE_LABEL[t.state] || t.state}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700/60 overflow-hidden">
                          <div
                            className={clsx('h-full transition-all', t.state === 'failed' ? 'bg-rose-400' : t.state === 'completed' ? 'bg-emerald-400' : 'bg-sky-400')}
                            style={{ width: `${t.state === 'completed' ? 100 : Math.max(1, Math.min(100, pct))}%` }}
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-slate-500 dark:text-slate-500 truncate">
                            {fmtBytes(t.bytesDone)} / {fmtBytes(t.size)} · {t.direction === 'upload' ? 'رفع' : 'تنزيل'}
                            {t.error ? ` · ${t.error}` : ''}
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            {t.state === 'running' && (
                              <button onClick={() => void pause(t.id)} disabled={isBusy} title="إيقاف مؤقت"
                                className="p-1 rounded hover:bg-white/10 text-amber-300 disabled:opacity-40">
                                {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Pause size={12} />}
                              </button>
                            )}
                            {canResume && (
                              <button onClick={() => void resume(t.id)} disabled={isBusy} title="استكمال"
                                className="p-1 rounded hover:bg-white/10 text-emerald-300 disabled:opacity-40">
                                {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                              </button>
                            )}
                            {t.state === 'queued' && (
                              <button onClick={() => void startQueued(t)} disabled={isBusy} title="بدء"
                                className="p-1 rounded hover:bg-white/10 text-emerald-300 disabled:opacity-40">
                                <Play size={12} />
                              </button>
                            )}
                            {['running', 'paused', 'queued', 'failed'].includes(t.state) && (
                              <button onClick={() => void cancel(t.id)} disabled={isBusy} title="إلغاء"
                                className="p-1 rounded hover:bg-white/10 text-rose-300 disabled:opacity-40">
                                <X size={12} />
                              </button>
                            )}
                            {t.state === 'completed' && <CheckCircle2 size={12} className="text-emerald-400" />}
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
