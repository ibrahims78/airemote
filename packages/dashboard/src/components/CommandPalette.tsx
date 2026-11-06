import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutDashboard, Monitor, Bot, History, Bell, Shield, Users, Settings, Sun, Moon, LogOut, Search, CornerDownLeft
} from 'lucide-react'
import { clsx } from 'clsx'

interface CommandPaletteProps {
  isRtl: boolean
  onClose: () => void
  onNavigate: (path: string) => void
  onToggleTheme: () => void
  onToggleLang: () => void
  onLogout: () => void
  canSeeAudit: boolean
  canSeeUsers: boolean
}

interface Cmd {
  id: string
  label: string
  keywords: string
  icon: React.ElementType
  run: () => void
}

export function CommandPalette({ isRtl, onClose, onNavigate, onToggleTheme, onToggleLang, onLogout, canSeeAudit, canSeeUsers }: CommandPaletteProps) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands: Cmd[] = useMemo(() => {
    const list: Cmd[] = [
      { id: 'overview', label: isRtl ? 'لوحة المعاينة' : 'Overview', keywords: 'overview dashboard home الرئيسية المعاينة لوحة', icon: LayoutDashboard, run: () => onNavigate('/') },
      { id: 'devices', label: isRtl ? 'الأجهزة' : 'Devices', keywords: 'devices الأجهزة جهاز', icon: Monitor, run: () => onNavigate('/devices') },
      { id: 'ai', label: isRtl ? 'الذكاء الاصطناعي' : 'AI Assistant', keywords: 'ai assistant chat الذكاء المساعد دردشة محادثة', icon: Bot, run: () => onNavigate('/ai') },
      { id: 'sessions', label: isRtl ? 'الجلسات' : 'Sessions', keywords: 'sessions الجلسات جلسة', icon: History, run: () => onNavigate('/sessions') },
      { id: 'notifications', label: isRtl ? 'الإشعارات' : 'Notifications', keywords: 'notifications الإشعارات تنبيه', icon: Bell, run: () => onNavigate('/notifications') },
      ...(canSeeAudit ? [{ id: 'audit', label: isRtl ? 'سجل التدقيق' : 'Audit Log', keywords: 'audit تدقيق سجل', icon: Shield, run: () => onNavigate('/audit') }] : []),
      ...(canSeeUsers ? [{ id: 'users', label: isRtl ? 'المستخدمون' : 'Users', keywords: 'users المستخدمون', icon: Users, run: () => onNavigate('/users') }] : []),
      { id: 'settings', label: isRtl ? 'الإعدادات' : 'Settings', keywords: 'settings الإعدادات ضبط', icon: Settings, run: () => onNavigate('/settings') },
      { id: 'theme', label: isRtl ? 'تبديل الثيم (فاتح/داكن)' : 'Toggle theme (light/dark)', keywords: 'theme dark light الثيم الوضع فاتح داكن', icon: document.documentElement.classList.contains('light') ? Moon : Sun, run: () => { onToggleTheme(); onClose() } },
      { id: 'lang', label: isRtl ? 'تبديل اللغة (عربي/إنجليزي)' : 'Toggle language (ar/en)', keywords: 'language lang اللغة عربي english تبديل', icon: Search, run: () => { onToggleLang(); onClose() } },
      { id: 'logout', label: isRtl ? 'تسجيل الخروج' : 'Log out', keywords: 'logout خروج تسجيل', icon: LogOut, run: () => onLogout() },
    ]
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRtl, canSeeAudit, canSeeUsers])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return commands
    return commands.filter(c => (c.label + ' ' + c.keywords).toLowerCase().includes(s))
  }, [q, commands])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setSel(0) }, [q])

  function runAt(i: number) {
    const c = filtered[i]
    if (!c) return
    c.run()
    if (c.id !== 'theme' && c.id !== 'lang') onClose()
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); runAt(sel) }
    else if (e.key === 'Escape') { onClose() }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center pt-[15vh] p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-overlay/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden animate-fade-in">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
          <Search size={15} className="text-muted flex-shrink-0" />
          <input
            ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder={isRtl ? 'اكتب أمراً أو ابحث عن صفحة…' : 'Type a command or search…'}
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-muted"
          />
          <kbd className="text-[10px] text-muted border border-line rounded px-1.5 py-0.5 font-mono">ESC</kbd>
        </div>
        <div className="max-h-[46vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <div className="text-center text-xs text-muted py-6">{isRtl ? 'لا نتائج' : 'No results'}</div>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id} onClick={() => runAt(i)} onMouseEnter={() => setSel(i)}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                i === sel ? 'bg-primary/15 text-primary' : 'text-ink hover:bg-surface2'
              )}
            >
              <c.icon size={15} className="flex-shrink-0 opacity-80" />
              <span className="flex-1 text-start">{c.label}</span>
              {i === sel && <CornerDownLeft size={12} className="opacity-60" />}
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-line text-[10px] text-muted flex items-center gap-3">
          <span>↑↓ {isRtl ? 'تنقل' : 'navigate'}</span>
          <span>Enter {isRtl ? 'تشغيل' : 'run'}</span>
          <span className="flex-1" />
          <span dir="ltr" className="font-mono">Ctrl+K</span>
        </div>
      </div>
    </div>
  )
}
