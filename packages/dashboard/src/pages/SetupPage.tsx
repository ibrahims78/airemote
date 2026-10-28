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

const REQUIREMENTS = [
  { label: '8 أحرف على الأقل', labelEn: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'حرف كبير (A-Z)', labelEn: 'Uppercase letter (A-Z)', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'رقم (0-9)', labelEn: 'Number (0-9)', test: (p: string) => /[0-9]/.test(p) },
]

export function SetupPage({ onComplete }: { onComplete: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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
      onComplete()
      navigate('/')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || (isAr ? 'حدث خطأ، يرجى المحاولة مجدداً' : 'An error occurred. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const strengthColor = metCount === 3 ? 'bg-success' : metCount >= 2 ? 'bg-warning' : 'bg-warning'

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
                    <div className="mt-2 flex gap-1">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className={clsx('h-1 flex-1 rounded-full transition-all duration-300', i < metCount ? strengthColor : 'bg-surface2')} />
                      ))}
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
