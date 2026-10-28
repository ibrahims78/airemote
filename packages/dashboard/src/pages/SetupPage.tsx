import { useState } from 'react'
import { Zap, Eye, EyeOff, Check, Sun, Moon } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { APP_VERSION } from '../lib/version'
import { WindowChrome } from '../components/WindowChrome'

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
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary flex items-center justify-center shadow-sm shadow-brand-blue/25">
            <Zap size={14} className="text-ink" />
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
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary flex items-center justify-center mx-auto mb-5 shadow-xl shadow-brand-blue/20">
              <Zap size={28} className="text-ink" />
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
              <div>
                <label className="block text-sm font-medium text-ink/90 mb-1.5">
                  {isAr ? 'الاسم الكامل' : 'Full Name'}
                </label>
                <input
                  type="text" required
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder={isAr ? 'إبراهيم' : 'John Doe'}
                  className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink/90 mb-1.5">
                  {isAr ? 'البريد الإلكتروني' : 'Email Address'}
                </label>
                <input
                  type="email" required autoComplete="email"
                  value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="admin@airemote.io"
                  className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:border-primary transition-colors"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink/90 mb-1.5">
                  {isAr ? 'كلمة المرور' : 'Password'}
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'} required
                    value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-primary transition-colors"
                    dir="ltr"
                  />
                  <button type="button" onClick={() => setShowPass(s => !s)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink/90 transition-colors">
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
                        <div key={i} className={clsx('flex items-center gap-1.5 text-xs transition-colors', r.test(form.password) ? 'text-success' : 'text-muted/70')}>
                          <Check size={10} className={r.test(form.password) ? 'opacity-100' : 'opacity-20'} />
                          {isAr ? r.label : r.labelEn}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-ink/90 mb-1.5">
                  {isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                </label>
                <input
                  type="password" required
                  value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
                  className={clsx(
                    'w-full bg-canvas border rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none transition-colors',
                    form.confirm && form.password !== form.confirm ? 'border-danger/60 focus:border-danger' : 'border-line focus:border-primary'
                  )}
                  dir="ltr"
                />
                {form.confirm && form.password !== form.confirm && (
                  <p className="text-xs text-danger mt-1">
                    {isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match'}
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-danger/10 border border-danger/25 rounded-xl px-4 py-2.5 text-sm text-danger animate-fade-in">
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full bg-primary hover:brightness-110 disabled:opacity-50 text-ink font-semibold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-blue/20 mt-1"
              >
                {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {loading ? (isAr ? 'جاري الإنشاء...' : 'Creating...') : (isAr ? 'إنشاء الحساب' : 'Create Account')}
              </button>
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
