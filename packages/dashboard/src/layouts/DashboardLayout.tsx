import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import {
  LayoutDashboard, Monitor, Settings, LogOut, Minus, Maximize2, Minimize2,
  Bot, Menu, ChevronDown, Bell, HelpCircle, Search, History, X,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useDeviceStore } from '../store/deviceStore'
import { useUIStore } from '../store/uiStore'
import { connectWebSocket, disconnectWebSocket } from '../lib/websocket'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { APP_VERSION } from '../lib/version'
import { CommandPalette } from '../components/CommandPalette'
import { ToastContainer } from '../components/ToastContainer'
import { clsx } from 'clsx'

type WindowCtl = {
  minimize?: () => void
  maximize?: () => void
  close?: () => void
  isMaximized?: () => Promise<boolean>
  onMaximized?: (cb: (value: boolean) => void) => () => void
}

export function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, token, logout } = useAuthStore()
  const { devices } = useDeviceStore()
  const { theme, toggleTheme, lang, toggleLang } = useUIStore()
  const T = useT()
  const isRtl = lang === 'ar'

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [appMenuOpen, setAppMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [serverVersion, setServerVersion] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  const desktopApi = typeof window !== 'undefined'
    ? (window as unknown as { airemote?: { windowCtl?: WindowCtl } }).airemote
    : undefined
  const windowCtl = desktopApi?.windowCtl

  const onlineCount = devices.filter(d => d.status === 'online').length
  const roleLabel = user?.role === 'admin'
    ? (isRtl ? 'مسؤول' : 'Administrator')
    : user?.role === 'manager'
      ? (isRtl ? 'مشرف' : 'Manager')
      : (isRtl ? 'مشاهد' : 'Viewer')

  const pathname = location.pathname
  const search = location.search
  const isTab = (path: string, tab?: string) => pathname === path && (!tab || search.includes(`tab=${tab}`))
  const isPath = (path: string) => pathname === path || (path !== '/' && pathname.startsWith(path + '/'))

  useEffect(() => {
    let alive = true
    const loadUnread = () => {
      api.get('/api/alerts/notifications')
        .then(r => { if (alive) setUnreadCount(Number(r.data?.unread || 0)) })
        .catch(() => {})
    }
    loadUnread()
    const timer = setInterval(loadUnread, 30_000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  useEffect(() => {
    let alive = true
    api.get('/api/health')
      .then(r => { if (alive) setServerVersion(String(r.data?.version || '')) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!windowCtl) return
    windowCtl.isMaximized?.().then(setMaximized).catch(() => {})
    const off = windowCtl.onMaximized?.(setMaximized)
    return () => { off?.() }
  }, [windowCtl])

  useEffect(() => {
    if (!user?.id || !token) return
    connectWebSocket(user.id, token)
    return () => disconnectWebSocket()
  }, [user?.id, token])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
      if (event.key === 'Escape') {
        setAppMenuOpen(false)
        setUserMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleLogout() {
    const stored = localStorage.getItem('airemote-auth')
    const refreshToken = stored ? JSON.parse(stored)?.state?.refreshToken : undefined
    try { await api.post('/api/auth/logout', { refreshToken }) } catch {}
    disconnectWebSocket()
    logout()
    navigate('/login')
  }

  const navItems = [
    { to: '/devices', label: T('devices'), icon: Monitor },
    { to: '/ai', label: T('ai_assistant'), icon: Bot },
    { to: '/sessions', label: isRtl ? 'سجل الجلسات' : 'Session log', icon: History },
  ]

  const menuAction = (action: () => void) => {
    setAppMenuOpen(false)
    action()
  }

  return (
    <div className="app-shell flex flex-col h-screen bg-canvas overflow-hidden">
      <header
        className="app-titlebar"
        dir="ltr"
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest('button,a')) return
          windowCtl?.maximize?.()
        }}
      >
        <div className="app-titlebar-left">
          <button type="button" className="app-titlebar-brand" onClick={() => navigate('/')} title="AiRemote">
            <span className="app-brand-mark"><LayoutDashboard size={15} /></span>
            <span className="app-brand-copy">
              <strong>AiRemote</strong>
              <small dir="ltr">v{serverVersion || APP_VERSION}</small>
            </span>
          </button>

          {navItems.map(item => {
            const Icon = item.icon
            const active = isPath(item.to)
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => navigate(item.to)}
                className={clsx('app-titlebar-link', active && 'is-active')}
                title={item.label}
              >
                <Icon size={14} />
                <span className="app-titlebar-label">{item.label}</span>
              </button>
            )
          })}
        </div>

        <div className="app-titlebar-actions">
          <button type="button" className="app-titlebar-action" onClick={() => navigate('/help')} title={isRtl ? 'مركز المساعدة' : 'Help'}>
            <HelpCircle size={14} />
            <span className="app-titlebar-label">{isRtl ? 'المساعدة' : 'Help'}</span>
          </button>
          <button type="button" className="app-titlebar-icon" onClick={() => setPaletteOpen(true)} title={isRtl ? 'بحث' : 'Search'}>
            <Search size={15} />
          </button>
          <button type="button" className="app-titlebar-icon app-notify-btn" onClick={() => navigate('/settings?tab=notifications')} title={isRtl ? 'التنبيهات' : 'Notifications'}>
            <Bell size={15} />
            {unreadCount > 0 && <span className="app-notify-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          <button type="button" className="app-titlebar-action" onClick={() => navigate('/settings')} title={isRtl ? 'الإعدادات' : 'Settings'}>
            <Settings size={14} />
            <span className="app-titlebar-label">{isRtl ? 'الإعدادات' : 'Settings'}</span>
          </button>

          <div className="app-user-wrap">
            <button type="button" className="app-user-btn" onClick={() => setUserMenuOpen(v => !v)}>
              <span className="app-user-avatar">{user?.name?.charAt(0)?.toUpperCase() || 'A'}</span>
              <span className="app-user-copy">
                <strong>{user?.name || 'Admin'}</strong>
                <small>{roleLabel}</small>
              </span>
              <ChevronDown size={12} />
            </button>
            {userMenuOpen && (
              <>
                <div className="app-menu-backdrop" onClick={() => setUserMenuOpen(false)} />
                <div className="app-user-pop" role="menu">
                  <div className="app-user-pop-head">
                    <strong>{user?.name || 'Admin'}</strong>
                    <span dir="ltr">{user?.email || ''}</span>
                    <em>{roleLabel} · v{serverVersion || APP_VERSION}</em>
                  </div>
                  <button type="button" onClick={() => { setUserMenuOpen(false); navigate('/settings') }}>
                    <Settings size={13} /> {T('settings')}
                  </button>
                  <button type="button" onClick={() => { setUserMenuOpen(false); handleLogout() }}>
                    <LogOut size={13} /> {T('logout')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="app-titlebar-spacer" />

        <div className="app-window-controls">
          <button
            type="button"
            className="app-window-btn app-menu-trigger"
            onClick={() => setAppMenuOpen(v => !v)}
            title={isRtl ? 'قائمة التطبيق' : 'Application menu'}
          >
            <Menu size={15} />
          </button>
          {windowCtl && (
            <>
              <button type="button" className="app-window-btn" onClick={() => windowCtl.minimize?.()} title={isRtl ? 'تصغير' : 'Minimize'}>
                <Minus size={15} />
              </button>
              <button type="button" className="app-window-btn" onClick={() => windowCtl.maximize?.()} title={maximized ? (isRtl ? 'استعادة' : 'Restore') : (isRtl ? 'تكبير' : 'Maximize')}>
                {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <button type="button" className="app-window-btn is-close" onClick={() => windowCtl.close?.()} title={isRtl ? 'إغلاق' : 'Close'}>
                <X size={15} />
              </button>
            </>
          )}
          {appMenuOpen && (
            <>
              <div className="app-menu-backdrop" onClick={() => setAppMenuOpen(false)} />
              <div className="app-menu-pop" role="menu" dir={isRtl ? 'rtl' : 'ltr'}>
                <div className="app-menu-section">{isRtl ? 'ملف' : 'File'}</div>
                <button type="button" onClick={() => menuAction(() => navigate('/'))}>{isRtl ? 'الرئيسية' : 'Home'}</button>
                <button type="button" onClick={() => menuAction(() => navigate('/devices'))}>{T('devices')}</button>
                <button type="button" onClick={() => menuAction(() => navigate('/ai'))}>{T('ai_assistant')}</button>
                <button type="button" onClick={() => menuAction(() => navigate('/settings?tab=sessions'))}>{isRtl ? 'سجل الجلسات' : 'Session log'}</button>
                <button type="button" onClick={() => menuAction(() => navigate('/settings'))}>{T('settings')}</button>
                <button type="button" onClick={() => menuAction(handleLogout)}>{T('logout')}</button>

                <div className="app-menu-section">{isRtl ? 'تحرير' : 'Edit'}</div>
                <button type="button" onClick={() => menuAction(() => navigator.clipboard?.writeText(window.location.href))}>{isRtl ? 'نسخ رابط الصفحة' : 'Copy page URL'}</button>
                <button type="button" onClick={() => menuAction(() => window.location.reload())}>{isRtl ? 'إعادة تحميل' : 'Reload'}</button>

                <div className="app-menu-section">{isRtl ? 'عرض' : 'View'}</div>
                <button type="button" onClick={() => menuAction(toggleTheme)}>{theme === 'dark' ? T('theme_light') : T('theme_dark')}</button>
                <button type="button" onClick={() => menuAction(toggleLang)}>{lang === 'ar' ? 'English' : 'العربية'}</button>
                <button type="button" onClick={() => menuAction(() => document.documentElement.requestFullscreen?.())}>{isRtl ? 'ملء الشاشة' : 'Fullscreen'}</button>

                <div className="app-menu-section">{isRtl ? 'نافذة' : 'Window'}</div>
                <button type="button" onClick={() => menuAction(() => windowCtl?.minimize?.())}>{isRtl ? 'تصغير' : 'Minimize'}</button>
                <button type="button" onClick={() => menuAction(() => windowCtl?.maximize?.())}>{maximized ? (isRtl ? 'استعادة' : 'Restore') : (isRtl ? 'تكبير' : 'Maximize')}</button>
                <button type="button" onClick={() => menuAction(() => windowCtl?.close?.())}>{isRtl ? 'إغلاق' : 'Close'}</button>

                <div className="app-menu-section">{isRtl ? 'مساعدة' : 'Help'}</div>
                <button type="button" onClick={() => menuAction(() => navigate('/help'))}>{isRtl ? 'مركز المساعدة' : 'Help center'}</button>
                <button type="button" onClick={() => menuAction(() => alert('AiRemote v' + (serverVersion || APP_VERSION)))}>{isRtl ? 'حول التطبيق' : 'About AiRemote'}</button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="app-content flex-1 overflow-auto min-w-0">
        <Outlet />
      </main>

      {paletteOpen && (
        <CommandPalette
          isRtl={isRtl}
          onClose={() => setPaletteOpen(false)}
          onNavigate={(path) => { setPaletteOpen(false); navigate(path) }}
          onToggleTheme={toggleTheme}
          onToggleLang={toggleLang}
          onLogout={() => { setPaletteOpen(false); handleLogout() }}
          canSeeAudit={user?.role === 'admin'}
          canSeeUsers={user?.role === 'admin'}
        />
      )}
      <ToastContainer />
    </div>
  )
}
