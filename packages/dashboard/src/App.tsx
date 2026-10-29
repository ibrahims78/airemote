import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useUIStore } from './store/uiStore'
import { lazy, Suspense } from 'react'
import { SetupPage } from './pages/SetupPage'
import { LoginPage } from './pages/LoginPage'
import { DashboardLayout } from './layouts/DashboardLayout'
// v3.4.0 — code splitting: each page loads as its own chunk
const OverviewPage        = lazy(() => import('./pages/OverviewPage').then(m => ({ default: m.OverviewPage })))
const DevicesPage         = lazy(() => import('./pages/DevicesPage').then(m => ({ default: m.DevicesPage })))
const DeviceWorkspacePage = lazy(() => import('./pages/DeviceWorkspacePage').then(m => ({ default: m.DeviceWorkspacePage })))
const AiPage              = lazy(() => import('./pages/AiPage').then(m => ({ default: m.AiPage })))
const SessionsPage        = lazy(() => import('./pages/SessionsPage').then(m => ({ default: m.SessionsPage })))
const UsersPage           = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })))
const SettingsPage        = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const AuditPage           = lazy(() => import('./pages/AuditPage').then(m => ({ default: m.AuditPage })))
const NotificationsPage   = lazy(() => import('./pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })))
const HelpPage            = lazy(() => import('./pages/HelpPage').then(m => ({ default: m.HelpPage })))
const ScreenPopoutPage    = lazy(() => import('./pages/ScreenPopoutPage').then(m => ({ default: m.ScreenPopoutPage })))
import { ErrorBoundary } from './components/ErrorBoundary'
import { useEffect, useState } from 'react'
import { api } from './lib/api'
import { applyTheme, applyLang } from './store/uiStore'

function PageLoader() {
  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="h-7 w-48 rounded-lg bg-line/60 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-28 rounded-xl bg-line/40 animate-pulse" style={{ animationDelay: (i * 120) + 'ms' }} />
        ))}
      </div>
      <div className="h-40 rounded-xl bg-line/40 animate-pulse" />
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null)
  const { theme, lang } = useUIStore()

  useEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => { applyLang(lang) }, [lang])

  useEffect(() => {
    api.get('/api/auth/setup-status')
      .then(r => setSetupRequired(r.data.setupRequired))
      .catch(() => setSetupRequired(false))
  }, [])

  if (setupRequired === null) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div className="flex items-center gap-2.5 text-muted text-sm">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Loading AiRemote...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        {setupRequired  && <Route path="/setup" element={<SetupPage onComplete={() => setSetupRequired(false)} />} />}
        {setupRequired  && <Route path="*" element={<Navigate to="/setup" replace />} />}
        {!setupRequired && (
          <>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/view/:deviceId" element={<RequireAuth><ScreenPopoutPage /></RequireAuth>} />
            <Route path="/" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
              <Route index                             element={<ErrorBoundary><OverviewPage /></ErrorBoundary>} />
              <Route path="devices"                   element={<ErrorBoundary><DevicesPage /></ErrorBoundary>} />
              <Route path="devices/:deviceId"         element={<DeviceWorkspacePage />} />
              <Route path="ai"                        element={<ErrorBoundary><AiPage /></ErrorBoundary>} />
              <Route path="sessions"                  element={<ErrorBoundary><SessionsPage /></ErrorBoundary>} />
              <Route path="notifications"             element={<ErrorBoundary><NotificationsPage /></ErrorBoundary>} />
              <Route path="audit"                     element={<RequireAdmin><ErrorBoundary><AuditPage /></ErrorBoundary></RequireAdmin>} />
              <Route path="users"                     element={<RequireAdmin><ErrorBoundary><UsersPage /></ErrorBoundary></RequireAdmin>} />
              <Route path="settings"                  element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
              <Route path="help"                    element={<ErrorBoundary><HelpPage /></ErrorBoundary>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
