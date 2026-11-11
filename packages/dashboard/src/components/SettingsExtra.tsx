import { useCallback, useEffect, useState } from 'react'
import type { ElementType, ReactNode } from 'react'
import { ShieldCheck, CalendarClock, Plus, Trash2, Play, Pencil, X } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../lib/api'
import { useUIStore } from '../store/uiStore'
import { useDeviceStore } from '../store/deviceStore'
import { toast } from '../store/toastStore'

function Sec({ icon: Icon, color, title, children }: { icon: ElementType; color: string; title: string; children: ReactNode }) {
  return (
    <section className="cr-card cr-settings-section animate-fade-in">
      <div className="cr-settings-section-head">
        <span className={clsx('cr-settings-section-icon', color)}><Icon size={15} /></span>
        <h3>{title}</h3>
      </div>
      <div className="cr-settings-section-body">{children}</div>
    </section>
  )
}

const inputCls = 'w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-primary transition-colors'

export function TwoFactorSection() {
  const { lang } = useUIStore()
  const isRtl = lang === 'ar'
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try { const r = await api.get('/api/auth/2fa/status'); setEnabled(!!r.data.enabled); setErr('') } catch {
    // 3.16.8 — a failed read used to look like "disabled", so an enabled user could start over.
    setEnabled(null)
    setErr(isRtl ? 'تعذّر جلب حالة التحقق بخطوتين — أعد المحاولة قبل الاعتماد على ما يظهر.' : 'Could not read the 2FA status - retry before trusting what is shown.')
  }
  }, [])
  useEffect(() => { load() }, [load])

  async function startSetup() {
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await api.post('/api/auth/2fa/setup', {})
      setSecret(r.data.secret || '')
      setQr(r.data.qrCodeUrl || r.data.qr || '')
      setMsg(isRtl ? 'امسح رمز QR بتطبيق المصادقة ثم أدخل الرمز للتفعيل' : 'Scan the QR with your authenticator app, then enter the code')
    } catch (e) {
      const ee = e as { response?: { data?: { error?: string } } }
      setErr(ee.response?.data?.error || (isRtl ? 'فشل بدء الإعداد' : 'Setup failed'))
    } finally { setBusy(false) }
  }

  async function enable() {
    if (!code.trim()) return
    setBusy(true); setErr(''); setMsg('')
    try {
      await api.post('/api/auth/2fa/enable', { code: code.trim() })
      setMsg(isRtl ? 'تم تفعيل التحقق بخطوتين بنجاح' : 'Two-factor authentication enabled')
      setQr(''); setSecret(''); setCode('')
      load()
    } catch (e) {
      const ee = e as { response?: { data?: { error?: string } } }
      setErr(ee.response?.data?.error === 'Invalid code' ? (isRtl ? 'رمز غير صحيح — حاول مجدداً' : 'Invalid code') : (ee.response?.data?.error || 'Error'))
    } finally { setBusy(false) }
  }

  async function disable() {
    if (!pw.trim()) return
    setBusy(true); setErr(''); setMsg('')
    try {
      await api.post('/api/auth/2fa/disable', { password: pw.trim() })
      setMsg(isRtl ? 'تم إلغاء التحقق بخطوتين' : 'Two-factor disabled')
      setPw('')
      load()
    } catch (e) {
      const ee = e as { response?: { data?: { error?: string } } }
      setErr(ee.response?.data?.error || (isRtl ? 'كلمة المرور غير صحيحة' : 'Wrong password'))
    } finally { setBusy(false) }
  }

  return (
    <Sec icon={ShieldCheck} color="text-success" title={isRtl ? 'التحقق بخطوتين (2FA)' : 'Two-factor authentication'}>
      {enabled === null ? (
        err ? (
          <div className="space-y-2 text-xs text-danger">
            <p>{err}</p>
            <button type="button" onClick={() => { setErr(''); load() }} className="underline">{isRtl ? 'إعادة المحاولة' : 'Retry'}</button>
          </div>
        ) : (
          <div className="h-4 w-40 rounded bg-surface2/70 animate-pulse" />
        )
      ) : enabled ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-success text-sm font-medium">
            <ShieldCheck size={14} />
            <span>{isRtl ? 'مفعّل — حسابك محمي برمز متغير' : 'Enabled — your account is protected'}</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder={isRtl ? 'كلمة المرور لإلغاء التفعيل' : 'Password to disable'} className={clsx(inputCls, 'max-w-[240px]')} dir="ltr" />
            <button onClick={disable} disabled={busy || !pw.trim()} className="px-3 py-2 rounded-lg bg-danger/15 text-danger hover:bg-danger/25 disabled:opacity-40 text-xs font-medium transition-colors">
              {isRtl ? 'إلغاء التفعيل' : 'Disable'}
            </button>
          </div>
        </div>
      ) : qr ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-5">
            <img src={qr} alt="2FA QR" className="w-44 h-44 rounded-xl border border-line bg-primary-fg p-2" />
            <div className="space-y-2 flex-1 min-w-[220px]">
              <p className="text-xs text-muted">{isRtl ? 'أو أدخل المفتاح يدوياً في تطبيق المصادقة:' : 'Or enter this key manually:'}</p>
              <code className="block text-xs font-mono bg-canvas border border-line rounded-lg px-3 py-2 select-all break-all" dir="ltr">{secret}</code>
              <div className="flex items-center gap-2 pt-1">
                <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className={clsx(inputCls, 'max-w-[140px] font-mono text-center tracking-widest')} dir="ltr" />
                <button onClick={enable} disabled={busy || code.length < 6} className="px-3 py-2 rounded-lg bg-success/15 text-success hover:bg-success/25 disabled:opacity-40 text-xs font-medium transition-colors">
                  {isRtl ? 'تفعيل' : 'Enable'}
                </button>
                <button onClick={() => { setQr(''); setSecret(''); setCode(''); setMsg('') }} className="px-3 py-2 rounded-lg bg-surface2 text-muted hover:bg-surface2/70 text-xs transition-colors">
                  <X size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-muted max-w-md">{isRtl ? 'أضف طبقة حماية ثانية: رمز متغير كل 30 ثانية من تطبيق المصادقة (Google Authenticator أو ما يماثله) عند تسجيل الدخول.' : 'Add a second layer: a rotating code from your authenticator app at sign-in.'}</p>
          <button onClick={startSetup} disabled={busy} className="px-3.5 py-2 rounded-lg bg-info/10 text-info hover:bg-info/20 disabled:opacity-50 text-xs font-medium transition-colors">
            {busy ? '…' : (isRtl ? 'بدء الإعداد' : 'Set up')}
          </button>
        </div>
      )}
      {msg && !qr && <div className="mt-3 text-xs text-success">{msg}</div>}
      {err && <div className="mt-3 text-xs text-danger">{err}</div>}
    </Sec>
  )
}

interface TaskRow {
  id: string
  name: string
  kind: string
  device_id?: string | null
  payload: string
  interval_min: number
  daily_at?: string | null
  enabled: number
  last_run_at?: string | null
  last_result?: string | null
  next_due?: string | null
}

export function TasksSection() {
  const { lang } = useUIStore()
  const isRtl = lang === 'ar'
  const { devices } = useDeviceStore()
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [loadErr, setLoadErr] = useState('')
  const [form, setForm] = useState({ name: '', kind: 'ai', deviceId: '', payload: '', mode: 'interval', intervalMin: 30, dailyAt: '09:00' })
  // 2026-11-11 — the server accepted a full task update all along; the page only offered
  // the enabled toggle, so a typo in a prompt could not be repaired.
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr('')
    // 3.16.8 — a failed fetch rendered as "no tasks yet", which reads as an empty list.
    try { const r = await api.get('/api/tasks'); setTasks(Array.isArray(r.data) ? r.data : []) }
    catch (e) {
      const ee = e as { response?: { data?: { error?: string } } }
      setTasks([])
      setLoadErr(ee.response?.data?.error || (isRtl ? 'تعذّر تحميل المهام' : 'Could not load tasks'))
    } finally { setLoading(false) }
  }, [isRtl])
  useEffect(() => { load() }, [load])

  async function create() {
    if (!form.name.trim() || !form.payload.trim()) { setErr(isRtl ? 'الاسم والمحتوى مطلوبان' : 'Name and content required'); return }
    // 3.16.8 — dailyAt='' becomes interval 0 on the server: a task that never fires.
    if (form.mode === 'daily' && !form.dailyAt) { setErr(isRtl ? 'حدّد وقتًا للتشغيل اليومي' : 'Pick a time for the daily run'); return }
    setBusy(true); setErr(''); setMsg('')
    try {
      const body = {
        name: form.name.trim(), kind: form.kind,
        deviceId: form.deviceId || null,
        payload: form.payload,
        intervalMin: form.mode === 'interval' ? Number(form.intervalMin) || 30 : 0,
        dailyAt: form.mode === 'daily' ? form.dailyAt : null,
      }
      if (editingId) {
        await api.put(`/api/tasks/${editingId}`, body)
        setMsg(isRtl ? 'حُدِّثت المهمة' : 'Task updated')
      } else {
        await api.post('/api/tasks', body)
        setMsg(isRtl ? 'أُنشئت المهمة' : 'Task created')
      }
      setShowForm(false)
      setEditingId(null)
      setForm({ name: '', kind: 'ai', deviceId: '', payload: '', mode: 'interval', intervalMin: 30, dailyAt: '09:00' })
      load()
    } catch (e) {
      const ee = e as { response?: { data?: { error?: string } } }
      setErr(ee.response?.data?.error || 'Error')
    } finally { setBusy(false) }
  }

  function editTask(t: TaskRow) {
    setForm({
      name: t.name,
      kind: t.kind,
      deviceId: t.device_id || '',
      payload: t.payload || '',
      mode: t.daily_at ? 'daily' : 'interval',
      intervalMin: t.interval_min || 30,
      dailyAt: t.daily_at || '09:00',
    })
    setEditingId(t.id)
    setErr('')
    setMsg('')
    setShowForm(true)
  }

  async function toggle(t: TaskRow) {
    try { await api.put(`/api/tasks/${t.id}`, { enabled: t.enabled ? 0 : 1 }); load() }
    catch (e) { toast.error(isRtl ? 'تعذّر تغيير حالة المهمة' : 'Could not change the task', (e as { response?: { data?: { error?: string } } }).response?.data?.error) }
  }
  async function runNow(t: TaskRow) {
    try { await api.post(`/api/tasks/${t.id}/run`, {}); setMsg(isRtl ? 'بدأ التنفيذ — ستصل النتيجة كإشعار' : 'Running — result will arrive as a notification') }
    catch (e) { toast.error(isRtl ? 'تعذّر تشغيل المهمة' : 'Could not run the task', (e as { response?: { data?: { error?: string } } }).response?.data?.error) }
  }
  async function del(t: TaskRow) {
    if (!confirm(isRtl ? `حذف المهمة «${t.name}»؟` : `Delete the task "${t.name}"?`)) return
    try { await api.delete(`/api/tasks/${t.id}`); load() }
    catch (e) { toast.error(isRtl ? 'تعذّر حذف المهمة' : 'Could not delete the task', (e as { response?: { data?: { error?: string } } }).response?.data?.error) }
  }

  function schedText(t: TaskRow) {
    if (t.daily_at) return (isRtl ? 'يومياً ' : 'daily ') + t.daily_at
    if (t.interval_min > 0) return (isRtl ? 'كل ' : 'every ') + t.interval_min + (isRtl ? ' دقيقة' : ' min')
    return isRtl ? 'يدوي' : 'manual'
  }

  return (
    <Sec icon={CalendarClock} color="text-primary" title={isRtl ? 'المهام المجدولة' : 'Scheduled tasks'}>
      {loading ? (
        <div className="space-y-2">
          {[0, 1].map(i => <div key={i} className="h-10 rounded-lg bg-surface2/70 animate-pulse" style={{ animationDelay: (i * 120) + 'ms' }} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.length === 0 && !showForm && (
            <p className="text-xs text-muted">{isRtl ? 'لا مهام بعد — أنشئ مهمة لفحص دوري أو طلب ذكاء مجدول (مثال: «كل يوم 9 صباحاً افحص القرص وأرسل ملخصاً»).' : 'No tasks yet.'}</p>
          )}
          {loadErr && (
            <p className="text-xs text-danger">{loadErr} <button type="button" onClick={() => load()} className="underline">{isRtl ? 'إعادة المحاولة' : 'Retry'}</button></p>
          )}
          {tasks.map(t => (
            <div key={t.id} className="rounded-lg border border-line bg-canvas/60 px-3 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-medium', t.kind === 'ai' ? 'bg-info/10 text-info' : 'bg-warning/15 text-warning')}>
                  {t.kind === 'ai' ? (isRtl ? 'ذكاء' : 'AI') : (isRtl ? 'أمر' : 'Exec')}
                </span>
                <span className="text-sm font-medium text-ink flex-1 truncate">{t.name}</span>
                <span className="text-[11px] text-muted">{schedText(t)}</span>
                <button onClick={() => toggle(t)} className={clsx('w-9 h-5 rounded-full transition-colors relative', t.enabled ? 'bg-success/70' : 'bg-line')} title={t.enabled ? 'إيقاف' : 'تشغيل'}>
                  <span className={clsx('absolute top-0.5 w-4 h-4 rounded-full bg-primary-fg transition-all', t.enabled ? (isRtl ? 'left-0.5' : 'right-0.5') : (isRtl ? 'left-[18px]' : 'left-0.5'))} />
                </button>
                <button onClick={() => runNow(t)} className="p-1.5 rounded text-muted hover:text-success hover:bg-surface2 transition-colors" title={isRtl ? 'تشغيل الآن' : 'Run now'}><Play size={13} /></button>
                <button onClick={() => editTask(t)} className="p-1.5 rounded text-muted hover:text-info hover:bg-surface2 transition-colors" title={isRtl ? 'تعديل' : 'Edit'}><Pencil size={13} /></button>
                <button onClick={() => del(t)} className="p-1.5 rounded text-muted hover:text-danger hover:bg-surface2 transition-colors" title={isRtl ? 'حذف' : 'Delete'}><Trash2 size={13} /></button>
              </div>
              {t.last_result && (
                <div className="mt-1.5 text-[10px] text-muted whitespace-pre-wrap max-h-16 overflow-hidden">{t.last_result.slice(0, 300)}</div>
              )}
              {/* 3.16.8 — the server sends both stamps; the card showed neither. */}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
                {t.next_due && <span>{isRtl ? 'القادم: ' : 'Next: '}{String(t.next_due).replace('T', ' ').slice(0, 16)}</span>}
                {t.last_run_at && <span>{isRtl ? 'آخر تشغيل: ' : 'Last run: '}{String(t.last_run_at).replace('T', ' ').slice(0, 16)}</span>}
              </div>
            </div>
          ))}

          {showForm ? (
            <div className="rounded-lg border border-info/40 bg-canvas/70 p-3 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={isRtl ? 'اسم المهمة' : 'Task name'} className={inputCls} />
                <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))} className={inputCls}>
                  <option value="ai">{isRtl ? 'طلب للذكاء الاصطناعي' : 'AI prompt'}</option>
                  <option value="exec">{isRtl ? 'أمر تنفيذ على جهاز' : 'Exec command on device'}</option>
                </select>
              </div>
              <select value={form.deviceId} onChange={e => setForm(f => ({ ...f, deviceId: e.target.value }))} className={inputCls}>
                <option value="">{isRtl ? 'بدون جهاز (سياق عام)' : 'No device'}</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <textarea value={form.payload} onChange={e => setForm(f => ({ ...f, payload: e.target.value }))} rows={2}
                placeholder={form.kind === 'ai' ? (isRtl ? 'وصف المهمة… مثال: افحص مساحة القرص وأعطني ملخصاً' : 'Task description…') : (isRtl ? 'الأمر… مثال: Get-PSDrive C' : 'Command…')}
                className={clsx(inputCls, 'font-mono text-xs resize-none')} />
              <div className="flex items-center gap-3 flex-wrap text-xs text-muted">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="sched" checked={form.mode === 'interval'} onChange={() => setForm(f => ({ ...f, mode: 'interval' }))} />
                  {isRtl ? 'كل' : 'Every'}
                </label>
                <input type="number" min={5} value={form.intervalMin} onChange={e => setForm(f => ({ ...f, intervalMin: Number(e.target.value) }))}
                  disabled={form.mode !== 'interval'} className={clsx(inputCls, 'w-20 text-center disabled:opacity-40')} />
                <span>{isRtl ? 'دقيقة' : 'min'}</span>
                <label className="flex items-center gap-1.5 cursor-pointer ms-2">
                  <input type="radio" name="sched" checked={form.mode === 'daily'} onChange={() => setForm(f => ({ ...f, mode: 'daily' }))} />
                  {isRtl ? 'يومياً الساعة' : 'Daily at'}
                </label>
                <input type="time" value={form.dailyAt} onChange={e => setForm(f => ({ ...f, dailyAt: e.target.value }))}
                  disabled={form.mode !== 'daily'} className={clsx(inputCls, 'w-28 text-center disabled:opacity-40')} dir="ltr" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={create} disabled={busy} className="px-3.5 py-2 rounded-lg bg-primary hover:brightness-110 disabled:opacity-50 text-primary-fg text-xs font-semibold transition-colors">
                  {editingId ? (isRtl ? 'حفظ التعديلات' : 'Save changes') : (isRtl ? 'إنشاء' : 'Create')}
                </button>
                <button onClick={() => { setShowForm(false); setEditingId(null) }} className="px-3 py-2 rounded-lg bg-surface2 text-muted hover:bg-surface2/70 text-xs transition-colors">
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setEditingId(null); setForm({ name: '', kind: 'ai', deviceId: '', payload: '', mode: 'interval', intervalMin: 30, dailyAt: '09:00' }); setShowForm(true) }} className="flex items-center gap-1.5 text-xs text-info hover:text-info transition-colors">
              <Plus size={13} /> {isRtl ? 'مهمة جديدة' : 'New task'}
            </button>
          )}
          {msg && <div className="text-xs text-success">{msg}</div>}
          {err && <div className="text-xs text-danger">{err}</div>}
        </div>
      )}
    </Sec>
  )
}
