import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BookOpen, Search, HelpCircle, Info, X, Zap, Monitor, Bot,
  Server, Smartphone, ChevronLeft, Power, CheckCircle2
} from 'lucide-react'
import { clsx } from 'clsx'
import { useUIStore } from '../store/uiStore'
import { api } from '../lib/api'
import { APP_VERSION } from '../lib/version'
import { HELP_MARKDOWN } from './helpContent'

interface Section { id: string; title: string; body: string }

function splitSections(md: string): Section[] {
  const lines = md.split('\n')
  const sections: Section[] = []
  let current: Section | null = null
  for (const line of lines) {
    const m = /^##\s+(.+)$/.exec(line)
    if (m) {
      if (current) sections.push(current)
      current = { id: `help-${sections.length + 1}`, title: m[1].trim(), body: '' }
    } else if (current) {
      current.body += line + '\n'
    }
  }
  if (current) sections.push(current)
  return sections
}

function inline(text: string, isLight: boolean): ReactNode[] {
  const out: ReactNode[] = []
  const rx = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) {
      out.push(<strong key={key++} className={isLight ? 'font-semibold text-slate-900' : 'font-semibold text-white'}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('`')) {
      out.push(<code key={key++} dir="ltr" className={clsx('px-1.5 py-0.5 rounded text-[0.85em] font-mono', isLight ? 'bg-slate-100 text-teal-700 border border-slate-200' : 'bg-slate-800 text-brand-teal border border-slate-700/60')}>{tok.slice(1, -1)}</code>)
    } else {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)
      if (lm) out.push(<a key={key++} href={lm[2]} target="_blank" rel="noreferrer" className={clsx('underline underline-offset-2', isLight ? 'text-teal-600 hover:text-teal-700' : 'text-brand-teal hover:text-teal-300')}>{lm[1]}</a>)
      else out.push(tok)
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function Markdown({ text, isLight }: { text: string; isLight: boolean }) {
  const blocks = useMemo(() => {
    const lines = text.split('\n')
    const out: ReactNode[] = []
    let i = 0
    let key = 0
    const h2 = (t: string) => <h2 key={key++} className={clsx('text-lg font-bold mt-7 mb-2.5 scroll-mt-24', isLight ? 'text-slate-900' : 'text-white')}>{inline(t, isLight)}</h2>
    const h3 = (t: string) => <h3 key={key++} className={clsx('text-sm font-semibold mt-5 mb-1.5', isLight ? 'text-slate-800' : 'text-slate-100')}>{inline(t, isLight)}</h3>
    const p = (t: string) => <p key={key++} className={clsx('text-[13.5px] leading-7 mb-2.5', isLight ? 'text-slate-600' : 'text-slate-300')}>{inline(t, isLight)}</p>

    while (i < lines.length) {
      const raw = lines[i]
      const line = raw.trimEnd()
      if (!line.trim()) { i++; continue }
      if (line.startsWith('### ')) { out.push(h3(line.slice(4))); i++; continue }
      if (line.startsWith('## ')) { out.push(h2(line.slice(3))); i++; continue }
      if (line.startsWith('```')) {
        const lang = line.slice(3).trim()
        const buf: string[] = []
        i++
        while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++ }
        i++
        out.push(
          <pre key={key++} dir="ltr" className={clsx('rounded-xl border p-3 my-3 overflow-x-auto text-[12px] leading-6 font-mono', isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-[#0d1117] border-slate-700/60 text-slate-200')}>
            {lang && <div className={clsx('text-[10px] mb-1.5 uppercase tracking-wide', isLight ? 'text-slate-400' : 'text-slate-500')}>{lang}</div>}
            {buf.join('\n')}
          </pre>
        )
        continue
      }
      if (line.startsWith('|')) {
        const rows: string[] = []
        while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].trim()); i++ }
        const cells = rows
          .map(r => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()))
          .filter(r => !r.every(c => /^:?-{2,}:?$/.test(c)))
        if (cells.length) {
          const [head, ...body] = cells
          out.push(
            <div key={key++} className={clsx('my-3 overflow-x-auto rounded-xl border', isLight ? 'border-slate-200' : 'border-slate-700/60')}>
              <table className="w-full text-[12.5px]">
                <thead className={isLight ? 'bg-slate-50' : 'bg-slate-800/60'}>
                  <tr>{head.map((h, hi) => <th key={hi} className={clsx('text-start px-3 py-2 font-semibold', isLight ? 'text-slate-700' : 'text-slate-200')}>{inline(h, isLight)}</th>)}</tr>
                </thead>
                <tbody>
                  {body.map((r, ri) => (
                    <tr key={ri} className={clsx('border-t', isLight ? 'border-slate-200' : 'border-slate-700/40')}>
                      {r.map((c, ci) => <td key={ci} className={clsx('px-3 py-2 align-top', isLight ? 'text-slate-600' : 'text-slate-300')}>{inline(c, isLight)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        continue
      }
      if (/^>\s?/.test(line)) {
        const buf: string[] = []
        while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++ }
        out.push(
          <blockquote key={key++} className={clsx('my-3 rounded-xl border-s-4 px-4 py-3 text-[12.5px] leading-6', isLight ? 'bg-amber-50 border-amber-400 text-amber-800' : 'bg-amber-500/10 border-amber-400/70 text-amber-200')}>
            {buf.map((b, bi) => <p key={bi} className="mb-1 last:mb-0">{inline(b, isLight)}</p>)}
          </blockquote>
        )
        continue
      }
      if (/^[-*]\s+/.test(line)) {
        const items: string[] = []
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++ }
        out.push(
          <ul key={key++} className="my-2 space-y-1.5">
            {items.map((it, ii) => (
              <li key={ii} className={clsx('flex gap-2 text-[13.5px] leading-7', isLight ? 'text-slate-600' : 'text-slate-300')}>
                <span className={clsx('mt-2.5 w-1.5 h-1.5 rounded-full flex-shrink-0', isLight ? 'bg-teal-500' : 'bg-brand-teal')} />
                <span>{inline(it, isLight)}</span>
              </li>
            ))}
          </ul>
        )
        continue
      }
      if (/^\d+\.\s+/.test(line)) {
        const items: string[] = []
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++ }
        out.push(
          <ol key={key++} className="my-2 space-y-1.5 list-decimal ps-6">
            {items.map((it, ii) => <li key={ii} className={clsx('text-[13.5px] leading-7', isLight ? 'text-slate-600' : 'text-slate-300')}>{inline(it, isLight)}</li>)}
          </ol>
        )
        continue
      }
      if (/^---+$/.test(line.trim())) { out.push(<hr key={key++} className={clsx('my-6 border-t', isLight ? 'border-slate-200' : 'border-slate-700/50')} />); i++; continue }
      const buf: string[] = []
      while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|```|\||>|[-*]\s|\d+\.\s|---)/.test(lines[i].trim())) { buf.push(lines[i]); i++ }
      if (buf.length) out.push(p(buf.join(' ')))
      else i++
    }
    return out
  }, [text, isLight])

  return <div>{blocks}</div>
}

const QUICK_LINKS = [
  { key: 'نظرة عامة', icon: BookOpen, color: 'from-teal-500 to-emerald-500' },
  { key: 'تثبيت', icon: Server, color: 'from-blue-500 to-indigo-500' },
  { key: 'ربط الوكيل', icon: Smartphone, color: 'from-violet-500 to-purple-500' },
  { key: 'البث', icon: Monitor, color: 'from-cyan-500 to-sky-500' },
  { key: 'المساعد الذكي', icon: Bot, color: 'from-fuchsia-500 to-pink-500' },
  { key: 'Wake-on-LAN', icon: Power, color: 'from-amber-500 to-orange-500' },
]

export function HelpPage() {
  const isLight = useUIStore(s => s.theme === 'light')
  const lang = useUIStore(s => s.lang)
  const isAr = lang === 'ar'
  const [query, setQuery] = useState('')
  const [aboutOpen, setAboutOpen] = useState(false)
  const [serverVersion, setServerVersion] = useState('')

  const sections = useMemo(() => splitSections(HELP_MARKDOWN), [])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sections
    return sections.filter(s => (s.title + ' ' + s.body).toLowerCase().includes(q))
  }, [sections, query])

  useEffect(() => {
    if (!aboutOpen) return
    api.get('/api/health').then(r => setServerVersion(r.data?.version || '')).catch(() => {})
  }, [aboutOpen])

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const quickTarget = (keyword: string) => {
    const s = sections.find(x => x.title.includes(keyword))
    if (s) go(s.id)
  }

  return (
    <div className="h-full overflow-y-auto" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Hero */}
      <div className={clsx('relative overflow-hidden border-b', isLight ? 'border-slate-200 bg-gradient-to-br from-teal-50 via-white to-blue-50' : 'border-slate-700/50 bg-gradient-to-br from-navy-800 via-navy-900 to-[#0b1a2b]')}>
        <div className="absolute -top-24 -end-16 w-72 h-72 rounded-full bg-brand-teal/10 blur-3xl" />
        <div className="absolute -bottom-24 start-1/4 w-72 h-72 rounded-full bg-brand-blue/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-teal to-brand-blue flex items-center justify-center shadow-lg shadow-brand-teal/25 flex-shrink-0">
              <HelpCircle size={22} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className={clsx('text-2xl font-bold', isLight ? 'text-slate-900' : 'text-white')}>{isAr ? 'مركز المساعدة' : 'Help Center'}</h1>
                <span className={clsx('text-[10px] px-2 py-0.5 rounded-full border font-medium', isLight ? 'bg-white/70 border-slate-200 text-slate-500' : 'bg-white/5 border-slate-600/50 text-slate-400')}>
                  v{APP_VERSION}
                </span>
              </div>
              <p className={clsx('text-sm mt-1 max-w-2xl', isLight ? 'text-slate-600' : 'text-slate-400')}>
                {isAr
                  ? 'دليل شامل للتثبيت والإعداد وربط الوكلاء، وشرح كل ميزة في AiRemote مع أمثلة عملية وحلول للمشاكل الشائعة.'
                  : 'A complete guide to installing, configuring, linking agents, and using every AiRemote feature with practical examples.'}
              </p>
            </div>
            <button
              onClick={() => setAboutOpen(true)}
              className={clsx('hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-medium transition-all',
                isLight ? 'bg-white/80 border-slate-200 text-slate-600 hover:border-teal-400 hover:text-teal-700' : 'bg-white/5 border-slate-600/60 text-slate-300 hover:border-brand-teal/60 hover:text-brand-teal')}
            >
              <Info size={14} />
              {isAr ? 'حول AiRemote' : 'About AiRemote'}
            </button>
          </div>

          {/* Search */}
          <div className="mt-5 max-w-xl relative">
            <Search size={15} className={clsx('absolute top-1/2 -translate-y-1/2', isAr ? 'right-3.5' : 'left-3.5', isLight ? 'text-slate-400' : 'text-slate-500')} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={isAr ? 'ابحث في الدليل… (مثال: ZeroTier، Wake-on-LAN، كلمة مرور التحكم)' : 'Search the guide…'}
              className={clsx('w-full rounded-xl border py-2.5 text-sm focus:outline-none transition-colors',
                isAr ? 'pr-10 pl-4' : 'pl-10 pr-4',
                isLight ? 'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-teal-500' : 'bg-navy-900/80 border-slate-600/60 text-slate-100 placeholder:text-slate-500 focus:border-brand-teal')}
            />
          </div>

          {/* Quick links */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {QUICK_LINKS.map(q => {
              const Icon = q.icon
              return (
                <button key={q.key} onClick={() => quickTarget(q.key)}
                  className={clsx('group flex items-center gap-2 px-3 py-2.5 rounded-xl border text-start transition-all',
                    isLight ? 'bg-white/70 border-slate-200 hover:border-teal-300 hover:shadow-sm' : 'bg-white/[0.03] border-slate-700/50 hover:border-brand-teal/40 hover:bg-white/[0.06]')}>
                  <span className={clsx('w-7 h-7 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0 text-white shadow-sm', q.color)}>
                    <Icon size={13} />
                  </span>
                  <span className={clsx('text-[11.5px] font-medium leading-tight', isLight ? 'text-slate-700' : 'text-slate-300')}>{q.key}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
        {/* TOC */}
        <aside className="hidden lg:block">
          <div className={clsx('sticky top-4 rounded-2xl border p-3', isLight ? 'bg-white border-slate-200' : 'bg-navy-800/60 border-slate-700/50')}>
            <p className={clsx('text-[10px] font-semibold uppercase tracking-wider px-2 mb-2', isLight ? 'text-slate-400' : 'text-slate-500')}>{isAr ? 'محتويات الدليل' : 'Contents'}</p>
            <nav className="space-y-0.5 max-h-[70vh] overflow-y-auto">
              {sections.map((s, i) => (
                <button key={s.id} onClick={() => go(s.id)}
                  className={clsx('w-full flex items-start gap-2 text-start px-2 py-1.5 rounded-lg text-[11.5px] leading-5 transition-colors',
                    isLight ? 'text-slate-600 hover:bg-slate-50 hover:text-teal-700' : 'text-slate-400 hover:bg-slate-700/30 hover:text-slate-200')}>
                  <span className={clsx('font-mono text-[9px] mt-0.5 flex-shrink-0', isLight ? 'text-slate-300' : 'text-slate-600')}>{String(i + 1).padStart(2, '0')}</span>
                  <span className="flex-1">{s.title}</span>
                  <ChevronLeft size={11} className={clsx('mt-1 opacity-0 group-hover:opacity-100', isAr ? '' : 'rotate-180')} />
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0">
          {filtered.length === 0 && (
            <div className={clsx('rounded-2xl border p-10 text-center', isLight ? 'bg-white border-slate-200' : 'bg-navy-800/50 border-slate-700/50')}>
              <Search size={26} className={clsx('mx-auto mb-3', isLight ? 'text-slate-300' : 'text-slate-600')} />
              <p className={clsx('text-sm font-medium', isLight ? 'text-slate-700' : 'text-slate-200')}>{isAr ? 'لا توجد نتائج مطابقة' : 'No matching results'}</p>
              <p className={clsx('text-xs mt-1', isLight ? 'text-slate-500' : 'text-slate-500')}>{isAr ? 'جرّب كلمة أقصر مثل «البث» أو «الوكيل».' : 'Try a shorter keyword.'}</p>
            </div>
          )}
          <div className="space-y-3">
            {filtered.map((s, si) => (
              <section key={s.id} id={s.id}
                className={clsx('rounded-2xl border p-5 scroll-mt-4', isLight ? 'bg-white border-slate-200' : 'bg-navy-800/45 border-slate-700/50')}>
                <div className="flex items-center gap-2.5 mb-1">
                  <span className={clsx('w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono flex-shrink-0',
                    isLight ? 'bg-teal-50 text-teal-600 border border-teal-100' : 'bg-brand-teal/10 text-brand-teal border border-brand-teal/20')}>
                    {String(sections.indexOf(s) + 1).padStart(2, '0')}
                  </span>
                  <h2 className={clsx('text-base font-bold', isLight ? 'text-slate-900' : 'text-white')}>{s.title}</h2>
                </div>
                <Markdown text={s.body} isLight={isLight} />
              </section>
            ))}
          </div>

          <div className={clsx('mt-6 rounded-2xl border p-5 flex items-start gap-3', isLight ? 'bg-teal-50/60 border-teal-100' : 'bg-brand-teal/[0.06] border-brand-teal/20')}>
            <CheckCircle2 size={18} className={clsx('flex-shrink-0 mt-0.5', isLight ? 'text-teal-600' : 'text-brand-teal')} />
            <div>
              <p className={clsx('text-sm font-semibold', isLight ? 'text-teal-900' : 'text-teal-100')}>{isAr ? 'هل تحتاج المزيد؟' : 'Need more help?'}</p>
              <p className={clsx('text-xs mt-1 leading-6', isLight ? 'text-teal-800/80' : 'text-teal-200/70')}>
                {isAr
                  ? 'افتح «المساعد الذكي» واسأل بالعربية عن أي ميزة أو خطأ يظهر لك — يمكنه قراءة حالة الجهاز واقتراح خطوات الإصلاح.'
                  : 'Open the AI assistant and ask about any feature or error — it can read device state and suggest fixes.'}
              </p>
            </div>
          </div>
        </main>
      </div>

      {/* About modal — moved here from the sidebar (v3.5) */}
      {aboutOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAboutOpen(false)} />
          <div className={clsx('relative w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden', isLight ? 'bg-white border-slate-200' : 'bg-navy-800 border-slate-600/50')}>
            <div className="relative p-6 text-center bg-gradient-to-br from-brand-blue to-brand-teal">
              <button onClick={() => setAboutOpen(false)} className="absolute top-3 end-3 text-white/70 hover:text-white transition-colors"><X size={18} /></button>
              <div className="w-16 h-16 mx-auto rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shadow-lg">
                <Zap size={30} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-white mt-3">AiRemote</h2>
              <p className="text-xs text-white/80 mt-1">{isAr ? 'وصول وإدارة عن بُعد + مساعد ذكي' : 'Remote Access + AI'}</p>
            </div>
            <div className="p-5 space-y-4">
              <p className={clsx('text-xs leading-6', isLight ? 'text-slate-600' : 'text-slate-400')}>
                {isAr
                  ? 'منصة ذاتية الاستضافة تتيح إدارة أجهزة Windows وAndroid من لوحة واحدة: بث الشاشة والتحكم، مدير الملفات، الطرفية، Wake-on-LAN، ومساعد ذكاء اصطناعي يعمل على أجهزتك.'
                  : 'Self-hosted management for Windows and Android devices: screen streaming and control, file manager, terminal, Wake-on-LAN, and an AI assistant.'}
              </p>
              <div className={clsx('rounded-xl border divide-y', isLight ? 'border-slate-200 divide-slate-100' : 'border-slate-700/50 divide-slate-700/40')}>
                <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{isAr ? 'إصدار الواجهة' : 'Dashboard version'}</span>
                  <span className={clsx('font-mono', isLight ? 'text-slate-800' : 'text-white')} dir="ltr">v{APP_VERSION}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{isAr ? 'إصدار الخادم' : 'Server version'}</span>
                  <span className={clsx('font-mono', isLight ? 'text-slate-800' : 'text-white')} dir="ltr">v{serverVersion || '…'}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['Self-hosted', 'Windows', 'Android', 'AI', 'ZeroTier', 'WOL'].map(tag => (
                  <span key={tag} className={clsx('text-[10px] px-2 py-1 rounded-full border', isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-700/30 border-slate-600/50 text-slate-400')}>{tag}</span>
                ))}
              </div>
              <button onClick={() => setAboutOpen(false)} className="w-full py-2.5 rounded-xl bg-brand-blue hover:bg-blue-500 text-white text-sm font-semibold transition-all">
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
