import { useState } from 'react'
import { Zap, Eye, EyeOff, Check, Sun, Moon } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { APP_VERSION } from '../lib/version'
import { WindowChrome } from '../components/WindowChrome'
import { Alert, Button, Field, Input } from '../components/ui'

// 2026-11-11 — page 14: the form demanded an uppercase letter and a digit while the
// server only enforces twelve characters, so it rejected passwords the server accepts.
// The checklist now mirrors the server rule exactly.
const REQUIREMENTS = [
  { label: '12 حرفاً على الأقل', labelEn: 'At least 12 characters', test: (p: string) => p.length >= 12 },
]

function setupErrorText(err: unknown, isAr: boolean): string {
  const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string }
  if (!e.response) return isAr ? 'تعذّر الوصول إلى الخادم — تحقّق من الاتصال ثم أعد المحاولة.' : 'Cannot reach the server — check the connection and try again.'
  const status = e.response.status
  const raw = e.response.data?.error || ''
  if (status === 429) return isAr ? 'محاولات كثيرة جدًا — انتظر دقيقة ثم أعد المحاولة.' : 'Too many attempts — wait a minute, then try again.'
  if (/already initialized/i.test(raw)) return isAr ? 'الخادم مُهيَّأ بالفعل — سجّل الدخول بحسابك.' : 'This server is already set up — sign in instead.'
  if (/at least 12/i.test(raw)) return isAr ? 'كلمة المرور يجب أن تكون 12 حرفًا على الأقل.' : 'The password must be at least 12 characters.'
  if (/required/i.test(raw)) return isAr ? 'أدخل البريد الإلكتروني وكلمة المرور.' : 'Enter both email and password.'
  if (status && status >= 500) return isAr ? 'خطأ في الخادم — حاول بعد قليل.' : 'Server error — try again shortly.'
  return raw || (isAr ? 'تعذّر إنشاء الحساب.' : 'Could not create the account.')
}

export function SetupPage({ onComplete }: { onComplete: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(false)
  const { setAuth } = useAuthStore()
  const { theme, toggleTheme, lang, toggleLang } = useUIStore()
  const navigate = useNavigate()
  const isAr = lang === 'ar'

  const metCount = REQUIREMENTS.filter(r => r.test(form.password)).length
  const strong = metCount === REQUIREMENTS.length

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirm) {
      setError(isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match')
      return
    }
    if (!strong) {
      setError(isAr ? 'كلمة المرور لا تستوفي المتطلبات' : 'Password does not meet requirements')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/api/auth/setup', { name: form.name, email: form.email, password: form.password })
      setAuth(res.data.token, res.data.user, res.data.refreshToken)
      // 2026-11-11 — page 14: recommend 2FA before leaving the wizard.
      setCreated(true)
    } catch (err: unknown) {
      setError(setupErrorText(err, isAr))
    } finally {
      setLoading(false)
    }
  }

  const strengthColor = form.password.length >= 12 ? 'bg-success' : 'bg-warning'

  if (created) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col">
        <WindowChrome />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md glass rounded-2xl p-6 shadow-2xl text-center animate-fade-in">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-success/15 text-success">
              <Check size={22} />
            </div>
            <h1 className="text-xl font-bold text-ink">{isAr ? 'تم إنشاء حساب المسؤول' : 'Admin account created'}</h1>
            <p className="mt-2 text-sm text-muted">
              {isAr ? 'خطوة أخيرة موصى بها: فعّل التحقق بخطوتين لحماية اللوحة.' : 'One recommended step: enable two-factor authentication for the dashboard.'}
            </p>
            <div className="mt-5 space-y-2">
              <Button variant="primary" className="w-full justify-center" onClick={() => { onComplete(); navigate('/settings') }}>
                {isAr ? 'تفعيل التحقق بخطوتين' : 'Enable two-factor'}
              </Button>
              <Button variant="ghost" className="w-full justify-center" onClick={() => { onComplete(); navigate('/') }}>
                {isAr ? 'ابدأ الآن' : 'Start now'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <WindowChrome />
      {/* Top bar */}
      <div className="flex items-center justify-between ps-6 pe-32 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary flex items-center justify-center shadow-sm shadow-primary/25">
            <Zap size={14} className="text-primary-fg" />
          </div>
          <span className="font-bold text-ink text-sm">AiRemote</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 text-muted hover:text-ink hover:bg-surface2 rounded-lg transition-all"
            title={theme === 'dark' ? (isAr ? 'وضع نهاري' : 'Light Mode') : (isAr ? 'وضع ليلي' : 'Dark Mode')}
          >
            {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button
            onClick={toggleLang}
            className="px-2.5 py-1.5 text-xs font-mono font-medium text-muted hover:text-ink hover:bg-surface2 rounded-lg transition-all"
          >
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md animate-fade-in">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary flex items-center justify-center mx-auto mb-5 shadow-xl shadow-primary/20">
              <Zap size={28} className="text-primary-fg" />
            </div>
            <h1 className="text-2xl font-bold text-ink">
              {isAr ? 'مرحباً بك في AiRemote' : 'Welcome to AiRemote'}
            </h1>
            <p className="text-muted mt-2 text-sm">
              {isAr ? 'إعداد حساب المسؤول الأول' : 'Create your admin account to get started'}
            </p>
          </div>

          <div className="glass rounded-2xl p-6 shadow-2xl">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label={isAr ? 'الاسم الكامل' : 'Full Name'} htmlFor="setup-name" required>
                <Input
                  id="setup-name"
                  type="text" required
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder={isAr ? 'إبراهيم' : 'John Doe'}
                  autoComplete="name"
                />
              </Field>

              <Field label={isAr ? 'البريد الإلكتروني' : 'Email Address'} htmlFor="setup-email" required>
                <Input
                  id="setup-email"
                  type="email" required autoComplete="email" dir="ltr"
                  value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="admin@airemote.io"
                />
              </Field>

              <Field
                label={isAr ? 'كلمة المرور' : 'Password'}
                htmlFor="setup-password"
                required
                error={form.confirm && form.password !== form.confirm ? (isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match') : undefined}
              >
                <div className="relative">
                  <Input
                    id="setup-password"
                    type={showPass ? 'text' : 'password'} required dir="ltr"
                    className="pl-10"
                    value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    aria-label={showPass ? (isAr ? 'إخفاء كلمة المرور' : 'Hide password') : (isAr ? 'إظهار كلمة المرور' : 'Show password')}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition-colors hover:text-ink"
                  >
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {form.password && (
                  <>
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface2">
                      <div
                        className={clsx('h-full rounded-full transition-all duration-300', strengthColor)}
                        style={{ width: Math.min(100, Math.round((form.password.length / 12) * 100)) + '%' }}
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1">
                      {REQUIREMENTS.map((r, i) => (
                        <div key={i} className={clsx('flex items-center gap-1.5 text-[11px] transition-colors', r.test(form.password) ? 'text-success' : 'text-muted')}>
                          <Check size={10} className={r.test(form.password) ? 'opacity-100' : 'opacity-20'} />
                          {isAr ? r.label : r.labelEn}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Field>

              <Field label={isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'} htmlFor="setup-confirm" required>
                <Input
                  id="setup-confirm"
                  type="password" required dir="ltr"
                  value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
                  autoComplete="new-password"
                  invalid={!!form.confirm && form.password !== form.confirm}
                />
              </Field>

              {error && <Alert tone="danger" onClose={() => setError('')}>{error}</Alert>}

              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={loading}
                disabled={!form.name.trim() || !form.email.trim()}
                className="mt-1 w-full justify-center"
              >
                {loading
                  ? (isAr ? 'جاري الإنشاء...' : 'Creating...')
                  : (isAr ? 'إنشاء الحساب' : 'Create Account')}
              </Button>
            </form>
          </div>

          <p className="text-center text-xs text-muted mt-6">
            AiRemote v{APP_VERSION} — Open Source Self-hosted Remote Access + AI
          </p>
        </div>
      </div>
    </div>
  )
}
