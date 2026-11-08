import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import {
  LayoutDashboard, Monitor, Settings, LogOut, Minus, Maximize2, Minimize2,
  Bot, ChevronDown, Bell, HelpCircle, Search, History, X, Plus, Sun, Moon, Languages,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useDeviceStore } from '../store/deviceStore'
import { useBoardStore, nextDeviceId, MAX_TILES } from '../store/boardStore'
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
  // 3.14.1 - the help guide is authored in Arabic only, so the switcher is hidden there.
  const onHelpPage = location.pathname === '/help'
  const { user, token, logout } = useAuthStore()
  const { devices } = useDeviceStore()
  const { theme, toggleTheme, lang, toggleLang } = useUIStore()
  const T = useT()
  const isRtl = lang === 'ar'

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [serverVersion, setServerVersion] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  // 3.13.1 — مخرج احتياطي: لو ابتُلع النقر (منطقة سحب إلكترون) فـEscape يُغلق القوائم.
  useEffect(() => {
    if (!userMenuOpen && !addMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setUserMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [userMenuOpen, addMenuOpen])

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

  // 2026-11-08 — زر «إضافة بث» في الشريط العلوي: نفس مخزن اللوحة الذي تقرأه غرفة العمليات.
  const onControlRoom = location.pathname === '/'
  const boardTiles = useBoardStore(st => st.tiles)
  const addBoardTile = useBoardStore(st => st.add)
  const addDeviceTile = useCallback((id: string) => {
    if (boardTiles.length >= MAX_TILES) return
    if (boardTiles.some(t => t.deviceId === id)) return
    addBoardTile(id)
  }, [boardTiles, addBoardTile])

  const addStream = useCallback(() => {
    if (boardTiles.length >= MAX_TILES) return
    const online = devices.filter(d => d.status === 'online').map(d => d.id)
    const next = nextDeviceId(boardTiles, online, devices[0]?.id)
    if (next) addBoardTile(next)
  }, [boardTiles, devices, addBoardTile])

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


  return (
    <div className="app-shell h-screen bg-canvas overflow-auto">
      <div className="cr-board">
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
          {/* 2026-11-08 — «إضافة بث» انتقل من رأس الصفحة إلى الشريط العلوي: إجراء الصفحة أولًا، ثم الأدوات، ثم الهوية. */}
          {onControlRoom && (
            <>
              <div className="app-add-wrap">
                <button
                  type="button"
                  className="app-titlebar-action app-titlebar-add"
                  onClick={() => setAddMenuOpen(v => !v)}
                  disabled={boardTiles.length >= MAX_TILES}
                  aria-expanded={addMenuOpen}
                  aria-haspopup="menu"
                  title={isRtl ? 'اختر جهازًا لإضافته إلى الحائط' : 'Pick a device for the wall'}
                  aria-label={isRtl ? 'إضافة بث إلى الحائط' : 'Add a stream to the wall'}
                >
                  <Plus size={15} />
                  <span className="app-titlebar-label">{isRtl ? 'إضافة بث' : 'Add stream'}</span>
                  <ChevronDown size={12} />
                </button>
                {addMenuOpen && (
                  <>
                    <div className="app-menu-backdrop" onClick={() => setAddMenuOpen(false)} />
                    <div className="app-menu-pop app-add-pop" role="menu" dir={isRtl ? 'rtl' : 'ltr'}>
                      <div className="app-menu-section">{isRtl ? 'أجهزة الأسطول' : 'Fleet'}</div>
                      {devices.length === 0 && (
                        <div className="app-add-empty">{isRtl ? 'لا أجهزة معرّفة' : 'No devices'}</div>
                      )}
                      {devices.map(d => {
                        const onWall = boardTiles.some(t => t.deviceId === d.id)
                        const offline = d.status !== 'online'
                        const disabled = onWall || offline
                        return (
                          <button
                            key={d.id}
                            type="button"
                            role="menuitem"
                            disabled={disabled}
                            className={clsx('app-add-item', disabled && 'is-off')}
                            onClick={() => { addDeviceTile(d.id); setAddMenuOpen(false) }}
                          >
                            <Monitor size={13} />
                            <span className="app-add-name">{d.name}</span>
                            <span className="app-add-tag">
                              {onWall ? (isRtl ? 'مضاف' : 'added') : offline ? (isRtl ? 'غير متصل' : 'offline') : (isRtl ? 'إضافة' : 'add')}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
              <span className="app-titlebar-sep" aria-hidden="true" />
            </>
          )}
          <button type="button" className="app-titlebar-icon" onClick={() => setPaletteOpen(true)} title={isRtl ? 'بحث' : 'Search'} aria-label={isRtl ? 'بحث' : 'Search'}>
            <Search size={15} />
          </button>
          <button type="button" className="app-titlebar-icon app-notify-btn" onClick={() => navigate('/settings?tab=notifications')} title={isRtl ? 'التنبيهات' : 'Notifications'} aria-label={isRtl ? 'التنبيهات' : 'Notifications'}>
            <Bell size={15} />
            {unreadCount > 0 && <span className="app-notify-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          <button type="button" className="app-titlebar-icon" onClick={() => navigate('/help')} title={isRtl ? 'مركز المساعدة' : 'Help'} aria-label={isRtl ? 'مركز المساعدة' : 'Help'}>
            <HelpCircle size={15} />
          </button>
          <button type="button" className="app-titlebar-icon" onClick={() => navigate('/settings')} title={isRtl ? 'الإعدادات' : 'Settings'} aria-label={isRtl ? 'الإعدادات' : 'Settings'}>
            <Settings size={15} />
          </button>
          {/* 2026-11-08 — الثيم واللغة انتقلا من قائمة التطبيق إلى الشريط العلوي. */}
          <button
            type="button"
            className="app-titlebar-icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? T('theme_light') : T('theme_dark')}
            aria-label={theme === 'dark' ? T('theme_light') : T('theme_dark')}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          {!onHelpPage && (
            <button
              type="button"
              className="app-titlebar-action app-titlebar-lang"
              onClick={toggleLang}
              title={isRtl ? 'Switch to English' : 'التبديل إلى العربية'}
              aria-label={isRtl ? 'Switch to English' : 'التبديل إلى العربية'}
            >
              <Languages size={14} />
              <span className="app-titlebar-label">{lang === 'ar' ? 'EN' : 'ع'}</span>
            </button>
          )}
          <span className="app-titlebar-sep" aria-hidden="true" />

          <div className="app-user-wrap">
            {/* 2026-11-08 (D5) — الاسم الكامل يُبنى من الأبناء بلا فواصل فيصير «UUI Auditمسؤول»؛ aria-label يعطي قارئ الشاشة عبارة مفصولة. */}
            <button type="button" className="app-user-btn" onClick={() => setUserMenuOpen(v => !v)}
              aria-label={(user?.name || 'Admin') + ' — ' + roleLabel}
              title={(user?.name || 'Admin') + ' — ' + roleLabel}>
              <span className="app-user-avatar" aria-hidden="true">{user?.name?.charAt(0)?.toUpperCase() || 'A'}</span>
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
        </div>
      </header>

      <main className="app-content min-w-0">
        <Outlet />
      </main>
      </div>

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
