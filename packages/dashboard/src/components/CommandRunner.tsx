import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Terminal, Play, RotateCcw, ChevronRight, Clock,
  CheckCircle2, XCircle, AlertCircle, Copy, ChevronDown, ChevronUp, Loader2
} from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'

interface CommandResult {
  id: string
  command: string
  stdout: string
  stderr: string
  exitCode: number
  duration: number
  timestamp: Date
  status: 'running' | 'success' | 'error' | 'timeout'
  collapsed?: boolean
}

interface Props {
  deviceId: string
  deviceName: string
  platform?: 'windows' | 'linux' | 'macos'
}

const QUICK_LINUX = [
  { key: 'cmd_cpu' as const,   cmd: 'top -bn1 | head -20' },
  { key: 'cmd_mem' as const,  cmd: 'free -h' },
  { key: 'cmd_disk' as const,    cmd: 'df -h' },
  { key: 'cmd_net' as const,   cmd: 'ss -tulpn' },
  { key: 'cmd_proc' as const, cmd: 'ps aux --sort=-%cpu | head -15' },
  { key: 'cmd_logs' as const,  cmd: 'journalctl -n 50 --no-pager' },
  { key: 'cmd_uptime' as const,   cmd: 'uptime && uname -a' },
  { key: 'cmd_ip' as const,       cmd: 'ip addr show' },
]

const QUICK_WINDOWS = [
  { key: 'cmd_cpu' as const,   cmd: 'wmic cpu get name,loadpercentage /format:list' },
  { key: 'cmd_mem' as const,  cmd: 'wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /format:list' },
  { key: 'cmd_disk' as const,    cmd: 'wmic logicaldisk get caption,size,freespace /format:list' },
  { key: 'cmd_net' as const,   cmd: 'netstat -an' },
  { key: 'cmd_proc' as const, cmd: 'tasklist /v' },
  { key: 'cmd_logs' as const,  cmd: 'wevtutil qe System /c:20 /f:text /rd:true' },
  { key: 'cmd_uptime' as const,   cmd: 'net statistics workstation' },
  { key: 'cmd_ip' as const,       cmd: 'ipconfig' },
]

const LONG_OUTPUT_THRESHOLD = 25

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function CommandRunner({ deviceId, deviceName, platform }: Props) {
  const t = useT()
  const [input, setInput]   = useState('')
  const [history, setHistory] = useState<CommandResult[]>([])
  const [running, setRunning] = useState(false)
  const [histIdx, setHistIdx] = useState(-1)
  const [copied, setCopied]   = useState<string | null>(null)

  const inputRef   = useRef<HTMLInputElement>(null)
  const scrollRef  = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  const isWindows = platform === 'windows'
  const QUICK_COMMANDS = isWindows ? QUICK_WINDOWS : QUICK_LINUX
  const cmdHistory = history.map(h => h.command).reverse()

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distFromBottom < 120
  }, [])

  useEffect(() => {
    if (!isNearBottomRef.current) return
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    })
  }, [history])

  function toggleCollapse(id: string) {
    setHistory(prev => prev.map(h => h.id === id ? { ...h, collapsed: !h.collapsed } : h))
  }

  function handleCopy(id: string, text: string) {
    copyToClipboard(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  async function execute(cmd: string) {
    const command = cmd.trim()
    if (!command || running) return

    const id = Date.now().toString()
    const entry: CommandResult = {
      id, command,
      stdout: '', stderr: '',
      exitCode: -1, duration: 0,
      timestamp: new Date(),
      status: 'running',
      collapsed: false,
    }

    isNearBottomRef.current = true
    setHistory(prev => [...prev, entry])
    setRunning(true)
    setInput('')
    setHistIdx(-1)

    try {
      const res = await api.post(`/api/devices/${deviceId}/exec`, { command, timeoutMs: 60000 })
      const d = res.data
      const lines = (d.stdout || '').split('\n').length
      setHistory(prev => prev.map(h => h.id === id ? {
        ...h,
        stdout: d.stdout || '',
        stderr: d.stderr || '',
        exitCode: d.exitCode,
        duration: d.duration,
        status: d.exitCode === 0 ? 'success' : 'error',
        collapsed: lines > LONG_OUTPUT_THRESHOLD,
      } : h))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      const msg = err.response?.data?.error || err.message || t('cr_exec_failed')
      setHistory(prev => prev.map(h => h.id === id ? {
        ...h, stderr: msg, exitCode: -1, status: 'timeout', collapsed: false,
      } : h))
    } finally {
      setRunning(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { execute(input); return }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newIdx = Math.min(histIdx + 1, cmdHistory.length - 1)
      setHistIdx(newIdx)
      setInput(cmdHistory[newIdx] || '')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newIdx = Math.max(histIdx - 1, -1)
      setHistIdx(newIdx)
      setInput(newIdx === -1 ? '' : cmdHistory[newIdx])
    }
  }

  return (
    <div className="flex flex-col h-full bg-canvas rounded-xl border border-line overflow-hidden">

      {/* ── Title bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-line flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-danger/70"   />
            <div className="w-3 h-3 rounded-full bg-warning/70"/>
            <div className="w-3 h-3 rounded-full bg-success/70" />
          </div>
          <Terminal size={13} className="text-primary opacity-80" />
          <span className="text-xs text-ink font-mono">
            {deviceName}
          </span>
          {isWindows && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-info/15 text-info border border-info/30 font-mono leading-none">
              Windows
            </span>
          )}
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setHistory([])}
            className="flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors py-1 px-2 rounded hover:bg-surface2"
          >
            <RotateCcw size={11} />
            <span>{t('cr_clear')}</span>
          </button>
        )}
      </div>

      {/* ── Quick commands ────────────────────────────────────── */}
      <div className="flex gap-1.5 px-3 py-2 border-b border-line flex-shrink-0 overflow-x-auto scrollbar-thin">
        {QUICK_COMMANDS.map(q => (
          <button
            key={q.cmd}
            onClick={() => execute(q.cmd)}
            disabled={running}
            title={q.cmd}
            className="flex-shrink-0 text-[11px] px-2.5 py-1 rounded-md bg-surface2 hover:bg-surface2 text-muted hover:text-ink border border-line hover:border-line transition-all disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            {t(q.key)}
          </button>
        ))}
      </div>

      {/* ── Output area ───────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs"
      >
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 select-none">
            <div className="w-12 h-12 rounded-xl bg-surface2 flex items-center justify-center border border-line">
              <Terminal size={22} className="text-muted" />
            </div>
            <div>
              <p className="text-muted text-sm font-sans">{t('cr_empty_hint')}</p>
              <p className="text-muted text-[11px] mt-1 font-sans">{t('cr_empty_note')}</p>
            </div>
          </div>
        )}

        {history.map((entry, idx) => {
          const outputLines = entry.stdout ? entry.stdout.split('\n').length : 0
          const isLong = outputLines > LONG_OUTPUT_THRESHOLD
          const showOutput = !entry.collapsed
          const outputText = [entry.stdout, entry.stderr].filter(Boolean).join('\n')

          return (
            <div
              key={entry.id}
              className={clsx(
                'rounded-lg border transition-colors',
                entry.status === 'running'
                  ? 'border-line bg-surface2/60'
                  : entry.status === 'success'
                  ? 'border-line bg-surface2/60'
                  : entry.status === 'error'
                  ? 'border-danger/30 bg-danger/10'
                  : 'border-warning/25 bg-warning/10'
              )}
            >
              {/* Command line */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
                <ChevronRight size={11} className="text-primary flex-shrink-0" />
                <span className="text-primary flex-1 truncate" title={entry.command}>
                  {entry.command}
                </span>
                <span className="flex items-center gap-1 text-muted text-[10px] flex-shrink-0 ml-2">
                  <Clock size={9} />
                  {entry.timestamp.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              {/* Status bar */}
              <div className="flex items-center justify-between px-3 py-1.5">
                {entry.status === 'running' ? (
                  <span className="flex items-center gap-1.5 text-muted text-[11px]">
                    <Loader2 size={11} className="animate-spin text-primary" />
                    {t('cr_running')}
                  </span>
                ) : (
                  <span className={clsx(
                    'flex items-center gap-1.5 text-[11px] font-medium',
                    entry.status === 'success' ? 'text-success' :
                    entry.status === 'error'   ? 'text-danger' : 'text-warning'
                  )}>
                    {entry.status === 'success' ? <CheckCircle2 size={11} /> :
                     entry.status === 'timeout' ? <AlertCircle size={11} /> : <XCircle size={11} />}
                    <span>
                      {entry.status === 'success' ? t('cr_status_success') : entry.status === 'error' ? t('cr_status_error') : t('cr_status_timeout')}
                    </span>
                    <span className="text-muted font-normal">·</span>
                    <span className="text-muted font-normal">exit {entry.exitCode}</span>
                    <span className="text-muted font-normal">·</span>
                    <span className="text-muted font-normal">{formatDuration(entry.duration)}</span>
                  </span>
                )}

                {entry.status !== 'running' && outputText && (
                  <div className="flex items-center gap-1">
                    {isLong && (
                      <button
                        onClick={() => toggleCollapse(entry.id)}
                        className="flex items-center gap-1 text-[10px] text-muted hover:text-ink px-1.5 py-0.5 rounded hover:bg-surface2 transition-colors"
                      >
                        {entry.collapsed
                          ? <><ChevronDown size={10} /><span>{t('cr_lines', { n: outputLines })}</span></>
                          : <><ChevronUp size={10} /><span>{t('cr_collapse')}</span></>
                        }
                      </button>
                    )}
                    <button
                      onClick={() => handleCopy(entry.id, outputText)}
                      className={clsx(
                        'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors',
                        copied === entry.id
                          ? 'text-success bg-success/15'
                          : 'text-muted hover:text-ink hover:bg-surface2'
                      )}
                    >
                      <Copy size={10} />
                      <span>{copied === entry.id ? t('cr_copied') : t('cr_copy')}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Output */}
              {entry.status !== 'running' && showOutput && (entry.stdout || entry.stderr) && (
                <div className={clsx(
                  'mx-3 mb-3 rounded-md overflow-hidden border border-line',
                  isLong && 'max-h-72 overflow-y-auto'
                )}>
                  {entry.stdout && (
                    <pre className="px-3 py-2.5 text-ink whitespace-pre-wrap break-all leading-relaxed bg-surface/40 text-[11px]">
                      {entry.stdout}
                    </pre>
                  )}
                  {entry.stderr && (
                    <pre className={clsx(
                      'px-3 py-2.5 whitespace-pre-wrap break-all leading-relaxed text-[11px]',
                      entry.stdout ? 'border-t border-danger/25' : '',
                      'text-danger bg-danger/10'
                    )}>
                      {entry.stderr}
                    </pre>
                  )}
                </div>
              )}

              {entry.status !== 'running' && isLong && entry.collapsed && (
                <button
                  onClick={() => toggleCollapse(entry.id)}
                  className="w-full text-center text-[10px] text-muted hover:text-ink py-1.5 border-t border-line hover:bg-surface2/70 transition-colors"
                >
                  {t('cr_lines', { n: outputLines })} ▾
                </button>
              )}
            </div>
          )
        })}

        {/* Invisible scroll anchor */}
        <div className="h-1" />
      </div>

      {/* ── Input bar ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-line bg-surface/60 px-3 py-2.5">
        <div className="flex items-center gap-2 bg-surface2/70 hover:bg-surface2 border border-line hover:border-line focus-within:border-primary/60 focus-within:bg-surface2/70 rounded-lg px-3 py-2 transition-all">
          <span className="text-primary text-sm font-mono flex-shrink-0 select-none opacity-70">
            {isWindows ? '>' : '$'}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={running}
            placeholder={isWindows
              ? t('cr_ph_windows')
              : t('cr_ph_generic')}
            className="flex-1 bg-transparent text-ink text-xs font-mono placeholder:text-muted focus:outline-none min-w-0"
            dir="ltr"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button
            onClick={() => execute(input)}
            disabled={!input.trim() || running}
            className={clsx(
              'flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-all',
              input.trim() && !running
                ? 'bg-primary/15 hover:bg-primary/25 text-primary'
                : 'text-muted cursor-not-allowed'
            )}
            title={t('cr_run_title')}
          >
            {running
              ? <Loader2 size={13} className="animate-spin text-primary" />
              : <Play size={13} />
            }
          </button>
        </div>
        <p className="text-[10px] text-muted mt-1.5 px-1 select-none">
          {running ? t('cr_wait') : t('cr_hint_keys')}
        </p>
      </div>
    </div>
  )
}
