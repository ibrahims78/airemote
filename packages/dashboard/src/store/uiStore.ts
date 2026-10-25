import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'dark' | 'light'
export type Lang = 'ar' | 'en'

interface UIStore {
  theme: Theme
  lang: Lang
  sidebarOpen: boolean
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setLang: (l: Lang) => void
  toggleLang: () => void
  setSidebarOpen: (v: boolean) => void
  toggleSidebar: () => void
}

export function applyTheme(theme: Theme) {
  const html = document.documentElement
  if (theme === 'light') {
    html.classList.add('light')
    html.classList.remove('dark')
  } else {
    html.classList.remove('light')
    html.classList.add('dark')
  }
}

export function applyLang(lang: Lang) {
  const html = document.documentElement
  html.dir = lang === 'ar' ? 'rtl' : 'ltr'
  html.lang = lang
}

const initialTheme: Theme = (() => {
  try {
    const s = localStorage.getItem('airemote-ui')
    if (s) {
      const t = JSON.parse(s)?.state?.theme
      if (t === 'light' || t === 'dark') return t
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  } catch {}
  return 'dark'
})()

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      theme: initialTheme,
      lang: 'ar',
      sidebarOpen: true,
      setTheme: (theme) => { set({ theme }); applyTheme(theme) },
      toggleTheme: () => {
        const t = get().theme === 'dark' ? 'light' : 'dark'
        set({ theme: t }); applyTheme(t)
      },
      setLang: (lang) => { set({ lang }); applyLang(lang) },
      toggleLang: () => {
        const l = get().lang === 'ar' ? 'en' : 'ar'
        set({ lang: l }); applyLang(l)
      },
      setSidebarOpen: (v) => set({ sidebarOpen: v }),
      toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    { name: 'airemote-ui' }
  )
)

// Apply persisted settings immediately on module load (before React renders)
;(function initUI() {
  try {
    const stored = localStorage.getItem('airemote-ui')
    if (stored) {
      const { state } = JSON.parse(stored)
      if (state?.theme) applyTheme(state.theme)
      if (state?.lang) applyLang(state.lang)
    } else {
      applyLang('ar')
      applyTheme(initialTheme)
    }
  } catch {
    applyLang('ar')
  }
})()
