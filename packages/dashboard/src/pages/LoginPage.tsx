import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Eye, EyeOff, Sun, Moon, Mail, Lock, ShieldCheck, Monitor, Wifi } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { useT } from '../lib/i18n'
import { WindowChrome } from '../components/WindowChrome'
import { APP_VERSION } from '../lib/version'

// 2026-11-11 — every failure used to read "invalid credentials", including a dead network,
// a rate limit and a server error. Name the actual cause instead.
function authErrorText(err: unknown, lang: string): string {
  const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string }
  const ar = lang === 'ar'
  if (!e.response) return ar ? 'تعذّر الوصول إلى الخادم — تحقّق من الاتصال ثم أعد المحاولة.' : 'Cannot reach the server — check the connection and try again.'
  const status = e.response.status
  const raw = e.response.data?.error || ''
  if (status === 429) return ar ? 'محاولات كثيرة جدًا — انتظر دقيقة ثم أعد المحاولة.' : 'Too many attempts — wait a minute, then try again.'
  if (status && status >= 500) return ar ? 'خطأ في الخادم — حاول بعد قليل.' : 'Server error — try again shortly.'
  if (status === 400) return ar ? 'أدخل البريد الإلكتروني وكلمة المرور.' : 'Enter both email and password.'
  if (status === 401) return ar ? 'بيانات الدخول غير صحيحة.' : 'Invalid email or password.'
  return raw || (ar ? 'تعذّر تسجيل الدخول.' : 'Sign-in failed.')
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [srvVer, setSrvVer] = useState('')
  const [totpToken, setTotpToken] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetHelp, setResetHelp] = useState(false)
  const { setAuth, token } = useAuthStore()
  const { theme, toggleTheme, lang, toggleLang } = useUIStore()
  const navigate = useNavigate()
  const T = useT()

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => { if (d && d.version) setSrvVer(String(d.version)) })
      .catch(() => {})
  }, [])

  // 2026-11-11 — a signed-in user who opened /login was shown the form again;
  // send them straight to the dashboard instead.
  useEffect(() => {
    if (token) navigate('/', { replace: true })
  }, [token, navigate])

  async function verifyTotp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/api/auth/login/verify-totp', { totpToken, code: totpCode })
      setAuth(res.data.token, res.data.user, res.data.refreshToken)
      navigate('/')
    } catch (err: unknown) {
      const code2 = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(code2 === 'Invalid TOTP code'
        ? (lang === 'ar' ? 'رمز التحقق غير صحيح' : 'Invalid verification code')
        : authErrorText(err, lang))
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/api/auth/login', { email, password })
      if (res.data.requiresTOTP) {
        setTotpToken(res.data.totpToken)
        setLoading(false)
        return
      }
      setAuth(res.data.token, res.data.user, res.data.refreshToken)
      navigate('/')
    } catch (err: unknown) {
      setError(authErrorText(err, lang))
    } finally {
      setLoading(false)
    }
  }

  // 2026-11-11 — the link dropped a red error; show short recovery steps instead.
  function requestReset() {
    setError('')
    setResetHelp(v => !v)
  }

  const version = srvVer || APP_VERSION

  return (
    <div className="login-shell" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <WindowChrome />

      <header className="login-topbar" dir="ltr">
        <div className="login-lockup">
          <span className="login-lockup-mark"><Zap size={15} /></span>
          <div>
            <strong>AiRemote</strong>
            <small>CONTROL ROOM · v{version}</small>
          </div>
        </div>
      </header>

      <main className="login-main">
        <div className="login-card">
          <section className="login-form-panel" aria-labelledby="login-heading">
            <div className="login-form-head">
              <span className="login-kicker">SECURE ACCESS</span>
              <h1 id="login-heading">{T('login_title')}</h1>
              <p>{T('login_subtitle')}</p>
            </div>

            {totpToken ? (
              <form onSubmit={verifyTotp} className="login-form">
                <div className="login-totp-head">
                  <strong>{lang === 'ar' ? 'التحقق بخطوتين مفعّل' : 'Two-factor enabled'}</strong>
                  <p>{lang === 'ar' ? 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.' : 'Enter the 6-digit code from your authenticator app.'}</p>
                </div>
                <label className="login-field">
                  <span>{lang === 'ar' ? 'رمز التحقق' : 'Verification code'}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    required
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    dir="ltr"
                    className="login-totp-input"
                  />
                </label>
                {error && <div className="login-error" role="alert">{error}</div>}
                <button type="submit" disabled={loading || totpCode.length !== 6} className="login-submit"
                  title={totpCode.length !== 6 ? (lang === 'ar' ? 'أدخل الأرقام الستة كاملة' : 'Enter all six digits') : undefined}>
                  {loading && <span className="login-spinner" />}
                  {lang === 'ar' ? 'تأكيد الرمز' : 'Verify code'}
                </button>
                <button type="button" className="login-back" onClick={() => { setTotpToken(''); setTotpCode(''); setError('') }}>
                  {lang === 'ar' ? 'رجوع إلى تسجيل الدخول' : 'Back to sign in'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="login-form">
                <label className="login-field">
                  <span>{T('email')}</span>
                  <div className="login-input-wrap">
                    <Mail size={15} />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="admin@airemote.io"
                      dir="ltr"
                    />
                  </div>
                </label>

                <label className="login-field">
                  <span>{T('password')}</span>
                  <div className="login-input-wrap">
                    <Lock size={15} />
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                    <button type="button" className="login-eye" onClick={() => setShowPass(p => !p)} aria-label={showPass ? (lang === 'ar' ? 'إخفاء كلمة المرور' : 'Hide password') : (lang === 'ar' ? 'إظهار كلمة المرور' : 'Show password')}>
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </label>

                {error && <div className="login-error" role="alert">{error}</div>}

                <div className="login-form-meta">
                  <span><ShieldCheck size={12} /> {lang === 'ar' ? 'اتصال مشفّر' : 'Encrypted connection'}</span>
                  <button type="button" onClick={requestReset} aria-expanded={resetHelp}>{lang === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot password?'}</button>
                </div>

                {resetHelp && (
                  <div className="rounded-xl border border-line bg-surface2/70 px-3.5 py-3 text-[12px] leading-6 text-muted" role="note">
                    <b className="mb-1 block text-ink">{lang === 'ar' ? 'استعادة كلمة المرور' : 'Password recovery'}</b>
                    {lang === 'ar' ? (
                      <ol className="list-decimal space-y-1 ps-4">
                        <li>لا توجد استعادة تلقائية بالبريد في النسخة ذاتية الاستضافة.</li>
                        <li>اطلب من مسؤول النظام إعادة تعيين كلمة المرور من صفحة «المستخدمون».</li>
                        <li>إن لم يوجد مسؤول آخر، تُعاد التهيئة من أداة الخادم على الجهاز المستضيف.</li>
                      </ol>
                    ) : (
                      <ol className="list-decimal space-y-1 ps-4">
                        <li>Self-hosted AiRemote has no e-mail reset.</li>
                        <li>Ask the system administrator to reset it from the Users page.</li>
                        <li>If no admin is reachable, recover it from the server tooling on the host.</li>
                      </ol>
                    )}
                  </div>
                )}

                <button type="submit" disabled={loading} className="login-submit">
                  {loading && <span className="login-spinner" />}
                  {loading ? T('logging_in') : T('login_btn')}
                </button>
              </form>
            )}

            <div className="login-form-foot">
              <span>AiRemote v{version}</span>
              <span>{lang === 'ar' ? 'محمي بـ TLS · 2FA' : 'TLS protected · 2FA'}</span>
            </div>
            <div className="login-preferences" aria-label={lang === 'ar' ? 'المظهر واللغة' : 'Appearance and language'}>
              <button type="button" onClick={toggleTheme} aria-pressed={theme === 'light'}>
                {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
                {theme === 'dark' ? (lang === 'ar' ? 'الوضع الفاتح' : 'Light mode') : (lang === 'ar' ? 'الوضع الداكن' : 'Dark mode')}
              </button>
              <button type="button" onClick={toggleLang} aria-pressed={lang === 'en'}>
                {lang === 'ar' ? 'English' : 'العربية'}
              </button>
            </div>
          </section>

          <aside className="login-brand-panel" aria-label={lang === 'ar' ? 'عن AiRemote' : 'About AiRemote'}>
            <div className="login-brand-grid" />
            <div className="login-brand-copy">
              <span className="login-brand-eyebrow"><span /> AIREMOTE / CONTROL ROOM</span>
              <h2>{lang === 'ar' ? <>شاشتك،<br />ومساعدك،<br />في مساحة واحدة.</> : <>Your screen,<br />your copilot,<br />one workspace.</>}</h2>
              <p>{lang === 'ar' ? 'بث فوري، تحكم كامل، ومساعد ذكي يفهم سياق ما تراه على الشاشة.' : 'Low-latency streaming, full control, and an AI copilot that understands what is on screen.'}</p>

              <div className="login-points">
                <div><span><Monitor size={14} /></span><b>{lang === 'ar' ? 'بث شاشة منخفض التأخير' : 'Low-latency screen streaming'}</b></div>
                <div><span><Zap size={14} /></span><b>{lang === 'ar' ? 'مساعد سياقي لكل جهاز' : 'Context-aware AI per device'}</b></div>
                <div><span><Wifi size={14} /></span><b>{lang === 'ar' ? 'تحكم كامل من أي مكان' : 'Full control from anywhere'}</b></div>
              </div>
            </div>

            <div className="login-preview" aria-hidden="true">
              <div className="login-preview-head">
                <span className="login-preview-dots"><i /><i /><i /></span>
                <b>TECNO-SPARK · LIVE</b>
                <span className="login-preview-live"><i /> 18 FPS</span>
              </div>
              <div className="login-preview-body">
                <div className="login-preview-rail"><i /><i /><i /><i /></div>
                <div className="login-preview-content">
                  <div className="login-preview-window"><span /><span /><span /></div>
                  <div className="login-preview-window is-small"><span /><span /></div>
                  <div className="login-preview-scan" />
                </div>
              </div>
              <div className="login-preview-foot"><span>1080 × 2400</span><span>0.8 Mbps</span><span>AI READY</span></div>
            </div>

            <div className="login-brand-foot">
              <span><ShieldCheck size={12} /> {lang === 'ar' ? 'وصول خاص ومنضبط' : 'Private, controlled access'}</span>
              <span>v{version}</span>
            </div>
          </aside>
        </div>
      </main>

      <footer className="login-footer" dir="ltr">
        <span>AiRemote — Self-hosted Remote Access + AI</span>
        <span>{lang === 'ar' ? 'كل جلسة تحت سيطرتك.' : 'Every session under your control.'}</span>
      </footer>
    </div>
  )
}
