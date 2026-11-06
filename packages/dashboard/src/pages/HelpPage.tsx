import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BookOpen, Search, HelpCircle, Info, Monitor, Bot,
  Server, Smartphone, ChevronLeft, Power, CheckCircle2
} from 'lucide-react'
import { clsx } from 'clsx'
import { useUIStore } from '../store/uiStore'
import { api } from '../lib/api'
import { APP_VERSION } from '../lib/version'
import { HELP_MARKDOWN } from './helpContent'
import { Alert, Button, Input, Modal } from '../components/ui'

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

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const rx = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) {
      out.push(<strong key={key++} className={'font-semibold text-ink'}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('`')) {
      out.push(<code key={key++} dir="ltr" className={clsx('px-1.5 py-0.5 rounded text-[0.85em] font-mono', 'bg-surface2 text-primary border border-line')}>{tok.slice(1, -1)}</code>)
    } else {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)
      if (lm) out.push(<a key={key++} href={lm[2]} target="_blank" rel="noreferrer" className={clsx('underline underline-offset-2', 'text-primary hover:text-primary')}>{lm[1]}</a>)
      else out.push(tok)
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const lines = text.split('\n')
    const out: ReactNode[] = []
    let i = 0
    let key = 0
    const h2 = (t: string) => <h2 key={key++} className={clsx('text-lg font-bold mt-7 mb-2.5 scroll-mt-24', 'text-ink')}>{inline(t)}</h2>
    const h3 = (t: string) => <h3 key={key++} className={clsx('text-sm font-semibold mt-5 mb-1.5', 'text-ink')}>{inline(t)}</h3>
    const p = (t: string) => <p key={key++} className={clsx('text-[13.5px] leading-7 mb-2.5', 'text-muted')}>{inline(t)}</p>

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
          <pre key={key++} dir="ltr" className={clsx('rounded-xl border p-3 my-3 overflow-x-auto text-[12px] leading-6 font-mono', 'bg-code border-line text-ink/90')}>
            {lang && <div className={clsx('text-[10px] mb-1.5 uppercase tracking-wide', 'text-muted')}>{lang}</div>}
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
            <div key={key++} className={clsx('my-3 overflow-x-auto rounded-xl border', 'border-line')}>
              <table className="w-full text-[12.5px]">
                <thead className={'bg-surface2'}>
                  <tr>{head.map((h, hi) => <th key={hi} className={clsx('text-start px-3 py-2 font-semibold', 'text-ink')}>{inline(h)}</th>)}</tr>
                </thead>
                <tbody>
                  {body.map((r, ri) => (
                    <tr key={ri} className={clsx('border-t', 'border-line')}>
                      {r.map((c, ci) => <td key={ci} className={clsx('px-3 py-2 align-top', 'text-muted')}>{inline(c)}</td>)}
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
          <blockquote key={key++} className={clsx('my-3 rounded-xl border-s-4 px-4 py-3 text-[12.5px] leading-6', 'bg-warning/10 border-warning/50 text-warning')}>
            {buf.map((b, bi) => <p key={bi} className="mb-1 last:mb-0">{inline(b)}</p>)}
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
              <li key={ii} className={clsx('flex gap-2 text-[13.5px] leading-7', 'text-muted')}>
                <span className={clsx('mt-2.5 w-1.5 h-1.5 rounded-full flex-shrink-0', 'bg-primary')} />
                <span>{inline(it)}</span>
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
            {items.map((it, ii) => <li key={ii} className={clsx('text-[13.5px] leading-7', 'text-muted')}>{inline(it)}</li>)}
          </ol>
        )
        continue
      }
      if (/^---+$/.test(line.trim())) { out.push(<hr key={key++} className={clsx('my-6 border-t', 'border-line')} />); i++; continue }
      const buf: string[] = []
      while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|```|\||>|[-*]\s|\d+\.\s|---)/.test(lines[i].trim())) { buf.push(lines[i]); i++ }
      if (buf.length) out.push(p(buf.join(' ')))
      else i++
    }
    return out
  }, [text])

  return <div>{blocks}</div>
}

const QUICK_LINKS = [
  { key: 'نظرة عامة', icon: BookOpen, color: 'from-primary to-primary' },
  { key: 'تثبيت', icon: Server, color: 'from-primary to-primary' },
  { key: 'ربط الوكيل', icon: Smartphone, color: 'from-primary to-primary' },
  { key: 'البث', icon: Monitor, color: 'from-primary to-primary' },
  { key: 'المساعد الذكي', icon: Bot, color: 'from-primary to-primary' },
  { key: 'Wake-on-LAN', icon: Power, color: 'from-primary to-primary' },
]

export function HelpPage() {
  const lang = useUIStore(s => s.lang)
  const isAr = lang === 'ar'
  const [query, setQuery] = useState('')
  const [aboutOpen, setAboutOpen] = useState(false)
  const [serverVersion, setServerVersion] = useState('')

  // 3.14.1 - a malformed guide must say so instead of rendering an empty page
  const { sections, sectionsError } = useMemo(() => {
    try { return { sections: splitSections(HELP_MARKDOWN), sectionsError: false } }
    catch { return { sections: [] as Section[], sectionsError: true } }
  }, [])
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
      <div className={clsx('relative overflow-hidden border-b', 'border-line bg-gradient-to-br from-primary/[0.07] via-surface to-canvas')}>
        <div className="absolute -top-24 -end-16 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-24 start-1/4 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary flex items-center justify-center shadow-lg shadow-primary/25 flex-shrink-0">
              <HelpCircle size={22} className="text-primary-fg" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className={clsx('text-2xl font-bold', 'text-ink')}>{isAr ? 'مركز المساعدة' : 'Help Center'}</h1>
                <span className={clsx('text-[10px] px-2 py-0.5 rounded-full border font-medium', 'bg-surface border-line text-muted')}>
                  v{APP_VERSION}
                </span>
              </div>
              <p className={clsx('text-sm mt-1 max-w-2xl', 'text-muted')}>
                {isAr
                  ? 'دليل شامل للتثبيت والإعداد وربط الوكلاء، وشرح كل ميزة في AiRemote مع أمثلة عملية وحلول للمشاكل الشائعة.'
                  : 'A complete guide to installing, configuring, linking agents, and using every AiRemote feature with practical examples.'}
              </p>
            </div>
            <Button
              variant="secondary"
              className="hidden h-9 rounded-xl border-line bg-surface/80 px-3.5 sm:inline-flex"
              icon={<Info size={14} />}
              onClick={() => setAboutOpen(true)}
            >
              {isAr ? 'حول AiRemote' : 'About AiRemote'}
            </Button>
          </div>

          {/* Search */}
          <div className="mt-5 max-w-xl relative">
            <Search size={15} className={clsx('absolute top-1/2 -translate-y-1/2', isAr ? 'right-3.5' : 'left-3.5', 'text-muted')} />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={isAr ? 'ابحث في الدليل… (مثال: ZeroTier، Wake-on-LAN، كلمة مرور التحكم)' : 'Search the guide…'}
              aria-label={isAr ? 'بحث في الدليل' : 'Search the guide'}
              className={clsx('h-11 rounded-xl text-sm', isAr ? 'pr-10 pl-4' : 'pl-10 pr-4')}
            />
          </div>

          {/* 3.14.0 — the guide body is authored in Arabic only; be explicit in English */}
          {!isAr && (
            <div className="mt-4 max-w-2xl rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-ink2">
              The guide body below is authored in Arabic only. The table of contents, search and every screen it describes stay fully bilingual.
            </div>
          )}

          {/* Quick links */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {QUICK_LINKS.map(q => {
              const Icon = q.icon
              return (
                <button key={q.key} onClick={() => quickTarget(q.key)}
                  className={clsx('group flex items-center gap-2 px-3 py-2.5 rounded-xl border text-start transition-all',
                    'bg-surface border-line hover:border-primary/40 hover:bg-surface2')}>
                  <span className={clsx('w-7 h-7 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0 text-primary-fg shadow-sm', q.color)}>
                    <Icon size={13} />
                  </span>
                  <span className={clsx('text-[11.5px] font-medium leading-tight', 'text-muted')}>{q.key}</span>
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
          <div className={clsx('sticky top-4 rounded-2xl border p-3', 'bg-surface border-line')}>
            <p className={clsx('text-[10px] font-semibold uppercase tracking-wider px-2 mb-2', 'text-muted')}>{isAr ? 'محتويات الدليل' : 'Contents'}</p>
            <nav className="space-y-0.5 max-h-[70vh] overflow-y-auto">
              {sections.map((s, i) => (
                <button key={s.id} onClick={() => go(s.id)}
                  className={clsx('w-full flex items-start gap-2 text-start px-2 py-1.5 rounded-lg text-[11.5px] leading-5 transition-colors',
                    'text-muted hover:bg-surface2 hover:text-ink')}>
                  <span className={clsx('font-mono text-[9px] mt-0.5 flex-shrink-0', 'text-muted')}>{String(i + 1).padStart(2, '0')}</span>
                  <span className="flex-1">{s.title}</span>
                  <ChevronLeft size={11} className={clsx('mt-1 opacity-0 group-hover:opacity-100', isAr ? '' : 'rotate-180')} />
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0">
          {sectionsError && (
            <Alert tone="danger" title={isAr ? 'تعذّر تحميل دليل المساعدة' : 'Could not load the help guide'}>
              <button type="button" className="mt-1 text-[11.5px] underline underline-offset-2" onClick={() => window.location.reload()}>
                {isAr ? 'إعادة المحاولة' : 'Retry'}
              </button>
            </Alert>
          )}
          {!sectionsError && filtered.length === 0 && (
            <div className={clsx('rounded-2xl border p-10 text-center', 'bg-surface border-line')}>
              <Search size={26} className={clsx('mx-auto mb-3', 'text-muted')} />
              <p className={clsx('text-sm font-medium', 'text-ink')}>{isAr ? 'لا توجد نتائج مطابقة' : 'No matching results'}</p>
              <p className={clsx('text-xs mt-1', 'text-muted')}>{isAr ? 'جرّب كلمة أقصر مثل «البث» أو «الوكيل».' : 'Try a shorter keyword.'}</p>
            </div>
          )}
          <div className="space-y-3">
            {filtered.map((s, si) => (
              <section key={s.id} id={s.id}
                className={clsx('rounded-2xl border p-5 scroll-mt-4', 'bg-surface border-line')}>
                <div className="flex items-center gap-2.5 mb-1">
                  <span className={clsx('w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono flex-shrink-0',
                    'bg-primary/10 text-primary border border-primary/20')}>
                    {String(sections.indexOf(s) + 1).padStart(2, '0')}
                  </span>
                  <h2 className={clsx('text-base font-bold', 'text-ink')}>{s.title}</h2>
                </div>
                <Markdown text={s.body} />
              </section>
            ))}
          </div>

          <div className={clsx('mt-6 rounded-2xl border p-5 flex items-start gap-3', 'bg-primary/10 border-primary/20')}>
            <CheckCircle2 size={18} className={clsx('flex-shrink-0 mt-0.5', 'text-primary')} />
            <div>
              <p className={clsx('text-sm font-semibold', 'text-ink')}>{isAr ? 'هل تحتاج المزيد؟' : 'Need more help?'}</p>
              <p className={clsx('text-xs mt-1 leading-6', 'text-muted')}>
                {isAr
                  ? 'افتح «المساعد الذكي» واسأل بالعربية عن أي ميزة أو خطأ يظهر لك — يمكنه قراءة حالة الجهاز واقتراح خطوات الإصلاح.'
                  : 'Open the AI assistant and ask about any feature or error — it can read device state and suggest fixes.'}
              </p>
            </div>
          </div>
        </main>
      </div>

      {/* About modal — moved here from the sidebar (v3.5), now on the shared Modal */}
      <Modal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title="AiRemote"
        description={isAr ? 'وصول وإدارة عن بُعد + مساعد ذكي' : 'Remote Access + AI'}
        size="sm"
        footer={<Button variant="primary" onClick={() => setAboutOpen(false)}>{isAr ? 'إغلاق' : 'Close'}</Button>}
      >
        <div className="space-y-3">
          <p className="text-[12px] leading-6 text-muted">
            {isAr
              ? 'منصة ذاتية الاستضافة تتيح إدارة أجهزة Windows وAndroid من لوحة واحدة: بث الشاشة والتحكم، مدير الملفات، الطرفية، Wake-on-LAN، ومساعد ذكاء اصطناعي يعمل على أجهزتك.'
              : 'Self-hosted management for Windows and Android devices: screen streaming and control, file manager, terminal, Wake-on-LAN, and an AI assistant.'}
          </p>
          <div className="divide-y divide-line rounded-lg border border-line">
            <div className="flex items-center justify-between px-3 py-2 text-[11px]">
              <span className="text-muted">{isAr ? 'إصدار الواجهة' : 'Dashboard version'}</span>
              <span className="font-mono text-ink" dir="ltr">v{APP_VERSION}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 text-[11px]">
              <span className="text-muted">{isAr ? 'إصدار الخادم' : 'Server version'}</span>
              <span className="font-mono text-ink" dir="ltr">v{serverVersion || '…'}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['Self-hosted', 'Windows', 'Android', 'AI', 'ZeroTier', 'WOL'].map(tag => (
              <span key={tag} className="rounded-full border border-line bg-surface2 px-2 py-1 text-[10px] text-muted">{tag}</span>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
