import { useCallback, useEffect, useState } from 'react'
import type { ElementType, ReactNode } from 'react'
import { ShieldCheck, CalendarClock, Plus, Trash2, Play, X } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../lib/api'
import { useUIStore } from '../store/uiStore'
import { useDeviceStore } from '../store/deviceStore'

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

const inputCls = 'w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-blue transition-colors'

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
    try { const r = await api.get('/api/auth/2fa/status'); setEnabled(!!r.data.enabled) } catch { setEnabled(false) }
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
    <Sec icon={ShieldCheck} color="text-emerald-400" title={isRtl ? 'التحقق بخطوتين (2FA)' : 'Two-factor authentication'}>
      {enabled === null ? (
        <div className="h-4 w-40 rounded bg-slate-700/25 animate-pulse" />
      ) : enabled ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <ShieldCheck size={14} />
            <span>{isRtl ? 'مفعّل — حسابك محمي برمز متغير' : 'Enabled — your account is protected'}</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder={isRtl ? 'كلمة المرور لإلغاء التفعيل' : 'Password to disable'} className={clsx(inputCls, 'max-w-[240px]')} dir="ltr" />
            <button onClick={disable} disabled={busy || !pw.trim()} className="px-3 py-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 disabled:opacity-40 text-xs font-medium transition-colors">
              {isRtl ? 'إلغاء التفعيل' : 'Disable'}
            </button>
          </div>
        </div>
      ) : qr ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-5">
            <img src={qr} alt="2FA QR" className="w-44 h-44 rounded-xl border border-slate-600/50 bg-white p-2" />
            <div className="space-y-2 flex-1 min-w-[220px]">
              <p className="text-xs text-slate-400">{isRtl ? 'أو أدخل المفتاح يدوياً في تطبيق المصادقة:' : 'Or enter this key manually:'}</p>
              <code className="block text-xs font-mono bg-navy-900 border border-slate-600/50 rounded-lg px-3 py-2 select-all break-all" dir="ltr">{secret}</code>
              <div className="flex items-center gap-2 pt-1">
                <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className={clsx(inputCls, 'max-w-[140px] font-mono text-center tracking-widest')} dir="ltr" />
                <button onClick={enable} disabled={busy || code.length < 6} className="px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-40 text-xs font-medium transition-colors">
                  {isRtl ? 'تفعيل' : 'Enable'}
                </button>
                <button onClick={() => { setQr(''); setSecret(''); setCode(''); setMsg('') }} className="px-3 py-2 rounded-lg bg-slate-700/30 text-slate-400 hover:bg-slate-700/50 text-xs transition-colors">
                  <X size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-slate-400 max-w-md">{isRtl ? 'أضف طبقة حماية ثانية: رمز متغير كل 30 ثانية من تطبيق المصادقة (Google Authenticator أو ما يماثله) عند تسجيل الدخول.' : 'Add a second layer: a rotating code from your authenticator app at sign-in.'}</p>
          <button onClick={startSetup} disabled={busy} className="px-3.5 py-2 rounded-lg bg-brand-blue/15 text-brand-blue hover:bg-brand-blue/25 disabled:opacity-50 text-xs font-medium transition-colors">
            {busy ? '…' : (isRtl ? 'بدء الإعداد' : 'Set up')}
          </button>
        </div>
      )}
      {msg && !qr && <div className="mt-3 text-xs text-emerald-400">{msg}</div>}
      {err && <div className="mt-3 text-xs text-red-400">{err}</div>}
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
  const [form, setForm] = useState({ name: '', kind: 'ai', deviceId: '', payload: '', mode: 'interval', intervalMin: 30, dailyAt: '09:00' })

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/api/tasks'); setTasks(Array.isArray(r.data) ? r.data : []) } catch { setTasks([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function create() {
    if (!form.name.trim() || !form.payload.trim()) { setErr(isRtl ? 'الاسم والمحتوى مطلوبان' : 'Name and content required'); return }
    setBusy(true); setErr(''); setMsg('')
    try {
      await api.post('/api/tasks', {
        name: form.name.trim(), kind: form.kind,
        deviceId: form.deviceId || null,
        payload: form.payload,
        intervalMin: form.mode === 'interval' ? Number(form.intervalMin) || 30 : 0,
        dailyAt: form.mode === 'daily' ? form.dailyAt : null,
      })
      setMsg(isRtl ? 'أُنشئت المهمة' : 'Task created')
      setShowForm(false)
      setForm({ name: '', kind: 'ai', deviceId: '', payload: '', mode: 'interval', intervalMin: 30, dailyAt: '09:00' })
      load()
    } catch (e) {
      const ee = e as { response?: { data?: { error?: string } } }
      setErr(ee.response?.data?.error || 'Error')
    } finally { setBusy(false) }
  }

  async function toggle(t: TaskRow) {
    try { await api.put(`/api/tasks/${t.id}`, { enabled: t.enabled ? 0 : 1 }); load() } catch {}
  }
  async function runNow(t: TaskRow) {
    try { await api.post(`/api/tasks/${t.id}/run`, {}); setMsg(isRtl ? 'بدأ التنفيذ — ستصل النتيجة كإشعار' : 'Running — result will arrive as a notification') } catch {}
  }
  async function del(t: TaskRow) {
    try { await api.delete(`/api/tasks/${t.id}`); load() } catch {}
  }

  function schedText(t: TaskRow) {
    if (t.daily_at) return (isRtl ? 'يومياً ' : 'daily ') + t.daily_at
    if (t.interval_min > 0) return (isRtl ? 'كل ' : 'every ') + t.interval_min + (isRtl ? ' دقيقة' : ' min')
    return isRtl ? 'يدوي' : 'manual'
  }

  return (
    <Sec icon={CalendarClock} color="text-brand-purple" title={isRtl ? 'المهام المجدولة' : 'Scheduled tasks'}>
      {loading ? (
        <div className="space-y-2">
          {[0, 1].map(i => <div key={i} className="h-10 rounded-lg bg-slate-700/20 animate-pulse" style={{ animationDelay: (i * 120) + 'ms' }} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.length === 0 && !showForm && (
            <p className="text-xs text-slate-400">{isRtl ? 'لا مهام بعد — أنشئ مهمة لفحص دوري أو طلب ذكاء مجدول (مثال: «كل يوم 9 صباحاً افحص القرص وأرسل ملخصاً»).' : 'No tasks yet.'}</p>
          )}
          {tasks.map(t => (
            <div key={t.id} className="rounded-lg border border-slate-700/50 bg-navy-900/40 px-3 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-medium', t.kind === 'ai' ? 'bg-brand-blue/15 text-brand-blue' : 'bg-amber-400/15 text-amber-400')}>
                  {t.kind === 'ai' ? (isRtl ? 'ذكاء' : 'AI') : (isRtl ? 'أمر' : 'Exec')}
                </span>
                <span className="text-sm font-medium text-slate-200 flex-1 truncate">{t.name}</span>
                <span className="text-[11px] text-slate-500">{schedText(t)}</span>
                <button onClick={() => toggle(t)} className={clsx('w-9 h-5 rounded-full transition-colors relative', t.enabled ? 'bg-emerald-500/70' : 'bg-slate-600/50')} title={t.enabled ? 'إيقاف' : 'تشغيل'}>
                  <span className={clsx('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', t.enabled ? (isRtl ? 'left-0.5' : 'right-0.5') : (isRtl ? 'left-[18px]' : 'left-0.5'))} />
                </button>
                <button onClick={() => runNow(t)} className="p-1.5 rounded text-slate-400 hover:text-emerald-400 hover:bg-slate-700/40 transition-colors" title={isRtl ? 'تشغيل الآن' : 'Run now'}><Play size={13} /></button>
                <button onClick={() => del(t)} className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700/40 transition-colors" title={isRtl ? 'حذف' : 'Delete'}><Trash2 size={13} /></button>
              </div>
              {t.last_result && (
                <div className="mt-1.5 text-[10px] text-slate-500 whitespace-pre-wrap max-h-16 overflow-hidden">{t.last_result.slice(0, 300)}</div>
              )}
            </div>
          ))}

          {showForm ? (
            <div className="rounded-lg border border-brand-blue/30 bg-navy-900/60 p-3 space-y-2.5">
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
              <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400">
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
                <button onClick={create} disabled={busy} className="px-3.5 py-2 rounded-lg bg-brand-blue hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
                  {isRtl ? 'إنشاء' : 'Create'}
                </button>
                <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded-lg bg-slate-700/30 text-slate-400 hover:bg-slate-700/50 text-xs transition-colors">
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-xs text-brand-blue hover:text-blue-400 transition-colors">
              <Plus size={13} /> {isRtl ? 'مهمة جديدة' : 'New task'}
            </button>
          )}
          {msg && <div className="text-xs text-emerald-400">{msg}</div>}
          {err && <div className="text-xs text-red-400">{err}</div>}
        </div>
      )}
    </Sec>
  )
}
