import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Bot, Send, Trash2, User, Loader, ChevronDown, Key, Zap,
  Copy, Play, Check, Terminal, AlertCircle, Wifi, WifiOff,
  Sparkles, Settings2, Square, Camera, RefreshCw, Download, ZoomIn, Video, History, Plus, MousePointer2, Monitor
} from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../lib/api'
import { openScreenWindow } from '../lib/screenWindow'
import { useUIStore } from '../store/uiStore'
import { useT } from '../lib/i18n'
import type { TKey } from '../lib/i18n'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  error?: boolean
  streaming?: boolean
  live?: boolean
  execResult?: { command: string; stdout: string; stderr: string; exitCode: number }
}

interface AIConfig {
  provider: 'openai' | 'gemini' | 'ollama' | 'zai'
  model: string
  apiKey?: string
  baseUrl?: string
}

interface DeviceStatsMini {
  cpuPercent?: number
  ramPercent?: number
  diskPercent?: number
}

interface ProviderDef { value: string; label?: string; labelKey?: TKey; models: string[] }

const PROVIDERS: ProviderDef[] = [
  { value: 'openai',  label: 'OpenAI',        models: ['openai', 'openai-fast', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'] },
  { value: 'gemini',  label: 'Google Gemini', models: ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'] },
  { value: 'zai',     label: 'Z.ai (GLM)',    models: ['glm-4.7-flash', 'glm-4.5-flash', 'glm-4.6v-flash', 'glm-5.3-flash', 'glm-4.7', 'glm-5.3'] },
  { value: 'ollama',  labelKey: 'chat_provider_ollama_local', models: ['qwen3', 'deepseek-r1', 'gemma3', 'llama3.3', 'phi4', 'gpt-oss'] },
]

function providerLabel(p: ProviderDef | undefined, tr: (k: TKey) => string): string {
  if (!p) return ''
  return p.labelKey ? tr(p.labelKey) : (p.label ?? '')
}

const CONFIG_KEY = 'airemote-ai-config'

function loadSavedConfig(): AIConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return { provider: 'openai', model: 'gpt-4o', apiKey: '', baseUrl: '' }
}

const THREAD_KEY_PREFIX = 'airemote-ai-thread-v1:'

function threadKey(deviceId?: string) {
  return THREAD_KEY_PREFIX + (deviceId || 'global')
}

function loadCachedThread(deviceId?: string): { messages: Message[]; conversationId?: string } {
  try {
    const raw = localStorage.getItem(threadKey(deviceId))
    if (!raw) return { messages: [] }
    const parsed = JSON.parse(raw) as { messages?: Message[]; conversationId?: string }
    const messages = (parsed.messages || [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system') && typeof m.content === 'string' && m.content.trim().length > 0)
      .map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
    return { messages, conversationId: parsed.conversationId }
  } catch {
    return { messages: [] }
  }
}

function saveCachedThread(deviceId: string | undefined, messages: Message[], conversationId?: string) {
  try {
    localStorage.setItem(threadKey(deviceId), JSON.stringify({ messages, conversationId }))
  } catch {}
}

function clearCachedThread(deviceId?: string) {
  try { localStorage.removeItem(threadKey(deviceId)) } catch {}
}

function getAuthToken(): string {
  try {
    const stored = localStorage.getItem('airemote-auth')
    if (!stored) return ''
    const auth = JSON.parse(stored)
    return auth?.state?.token || ''
  } catch { return '' }
}

function buildSuggestions(stats: DeviceStatsMini | null): TKey[] {
  if (!stats) return []
  const s: TKey[] = []
  if ((stats.cpuPercent ?? 0) > 75)  s.push('chat_sugg_top_cpu')
  if ((stats.ramPercent ?? 0) > 80)  s.push('chat_sugg_memory')
  if ((stats.diskPercent ?? 0) > 85) s.push('chat_sugg_disk')
  return s.slice(0, 3)
}

const QUICK_PROMPT_KEYS: TKey[] = [
  'chat_quick_specs',
  'chat_quick_server',
  'chat_quick_mem_cpu',
  'chat_quick_logs',
  'chat_sugg_top_cpu',
  'chat_quick_screenshot',
]

interface ContentPart {
  type: 'text' | 'code'
  content: string
  lang?: string
}

function parseContent(text: string): ContentPart[] {
  const parts: ContentPart[] = []
  const regex = /```(\w*)\n?([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', content: text.slice(last, m.index) })
    parts.push({ type: 'code', lang: m[1] || 'bash', content: m[2].trim() })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last) })
  return parts.length > 0 ? parts : [{ type: 'text', content: text }]
}

// ── CodeBlock ──────────────────────────────────────────────────────────────
// v3.3.5 — detect control-command blocks even when the model mislabels the fence as text
function looksLikeControlLines(content: string): boolean {
  const lines = (content || '').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))
  if (!lines.length) return false
  const RX = /^(click|rclick|dclick|move|drag|scroll|focus|info|type|key|wait|clickname)\b/i
  return lines.every(l => RX.test(l))
}

// v3.3.5 — compact progress note: renders execution feedback as a clean stage card
function ProgressNote({ text, isLight }: { text: string; isLight: boolean }) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const firstLine = (text.split('\n')[0] || '').replace(/^\[|\]$/g, '').slice(0, 70)
  return (
    <div data-progress-note="1" className={clsx('rounded-xl border px-3 py-1.5', isLight ? 'border-line bg-surface2' : 'border-line bg-code')}>
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 w-full text-start">
        <span className={clsx('text-[11px] font-medium truncate', isLight ? 'text-muted' : 'text-ink')}>{tr('chat_progress_stage', { stage: firstLine })}</span>
        <span className={clsx('text-[10px] ms-auto flex-shrink-0', 'text-muted')}>{open ? tr('chat_hide') : tr('chat_details')}</span>
      </button>
      {open && <pre className={clsx('mt-1.5 text-[10px] whitespace-pre-wrap break-all rounded-lg p-2 max-h-64 overflow-y-auto', isLight ? 'bg-surface text-muted border border-line' : 'bg-code text-muted border border-line')}>{text}</pre>}
    </div>
  )
}

// v3.3.4 — fullscreen preview with zoom, before download
function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const tr = useT()
  const [zoom, setZoom]     = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const clamp = (z: number) => Math.min(8, Math.max(0.2, z))
  return (
    <div className="fixed inset-0 z-[120] bg-overlay/85 flex items-center justify-center select-none"
      onClick={onClose}
      onWheel={e => { e.stopPropagation(); setZoom(z => clamp(z + (e.deltaY < 0 ? 0.25 : -0.25))) }}>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[121] flex items-center gap-1.5 bg-overlay/70 text-ink rounded-full px-3 py-1.5 text-xs"
        onClick={e => e.stopPropagation()}>
        <button onClick={() => setZoom(z => clamp(z - 0.25))} className="px-2 py-0.5 rounded hover:bg-surface/15 font-bold">-</button>
        <span className="font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => clamp(z + 0.25))} className="px-2 py-0.5 rounded hover:bg-surface/15 font-bold">+</button>
        <button onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }} className="px-2 py-0.5 rounded hover:bg-surface/15">1:1</button>
        <a href={url} download="airemote-screenshot.jpg" className="px-2 py-0.5 rounded hover:bg-surface/15" onClick={e => e.stopPropagation()}>{tr('chat_download')}</a>
        <button onClick={onClose} className="px-2 py-0.5 rounded hover:bg-surface/15">{tr('chat_close')}</button>
      </div>
      <img src={url} draggable={false} alt={tr('chat_preview')}
        className="max-h-[90vh] max-w-[94vw] rounded shadow-2xl"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transition: 'transform 0.12s ease-out', cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
        onClick={e => e.stopPropagation()}
        onDoubleClick={e => { e.stopPropagation(); setZoom(z => (z > 1 ? 1 : 2)) }}
        onMouseDown={e => { e.stopPropagation(); dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y } }}
        onMouseMove={e => { if (dragRef.current) setOffset({ x: dragRef.current.ox + (e.clientX - dragRef.current.sx), y: dragRef.current.oy + (e.clientY - dragRef.current.sy) }) }}
        onMouseUp={() => { dragRef.current = null }}
        onMouseLeave={() => { dragRef.current = null }}
      />
    </div>
  )
}
// v3.3.4 — AI control block: real mouse/keyboard actions through the agent
function parseControlLine(line: string): Record<string, unknown> | null {
  const m = /^([a-zA-Z]+)\s*([\s\S]*)$/.exec(line.trim())
  if (!m) return null
  let action = m[1].toLowerCase()
  let rest = (m[2] || '').trim()
  // v3.3.5 — tolerate squished commands like "focusUntitled" or "keyEnter" from small models
  const KNOWN = ['clickname', 'rclick', 'dclick', 'drag', 'click', 'move', 'scroll', 'focus', 'type', 'key', 'wait', 'info']
  if (!KNOWN.includes(action)) {
    for (const k of KNOWN) {
      if (action.startsWith(k) && action.length > k.length) {
        rest = (action.slice(k.length) + (rest ? ' ' + rest : '')).trim()
        action = k
        break
      }
    }
  }
  const nums = rest.split(/[\s,]+/).map(Number)
  if (['move', 'click', 'rclick', 'dclick'].includes(action)) {
    if (nums.length < 2 || !isFinite(nums[0]) || !isFinite(nums[1])) return null
    return { action, x: nums[0], y: nums[1] }
  }
  if (action === 'drag') {
    if (nums.length < 4 || nums.some(n => !isFinite(n))) return null
    return { action, x: nums[0], y: nums[1], x2: nums[2], y2: nums[3] }
  }
  if (action === 'type') return { action, text: rest }
  if (action === 'focus') return { action, text: rest }
  if (action === 'key') return { action, key: rest }
  if (action === 'scroll') return { action, amount: parseInt(rest) || -3 }
  if (action === 'wait') return { action, seconds: Math.min(Math.max(parseInt(rest) || 2, 1), 20) }
  if (action === 'clickname') return { action, name: rest }
  if (action === 'info') return { action }
  return null
}

function ControlBlock({ deviceId, isLight, autoCapture, raw, onDone }: {
  deviceId?: string
  isLight: boolean
  autoCapture?: boolean
  raw?: string
  onDone?: (summary: string) => void
}) {
  const tr = useT()
  const lines = (raw || '').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))
  const [steps, setSteps]     = useState<{ line: string; status: 'pending' | 'running' | 'ok' | 'error'; out: string; img?: string }[]>(() => lines.map(l => ({ line: l, status: 'pending' as const, out: '' })))
  const [running, setRunning] = useState(false)
  const [done, setDone]       = useState(false)
  const tried = useRef(false)

  const run = useCallback(async () => {
    if (!deviceId || running) return
    const cmds = lines.slice(0, 12)
    if (!cmds.length) return
    setRunning(true)
    setSteps(cmds.map(l => ({ line: l, status: 'pending' as const, out: '' })))
    const results: string[] = []
    const token = getAuthToken()
    for (let i = 0; i < cmds.length; i++) {
      setSteps(prev => { const n = [...prev]; n[i] = { ...n[i], status: 'running' }; return n })
      if (/^screenshot\b/i.test(cmds[i].trim())) {
        try {
          const resS = await fetch(`/api/devices/${deviceId}/screenshot`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
          if (!resS.ok) throw new Error('HTTP ' + resS.status)
          const url = URL.createObjectURL(await resS.blob())
          setSteps(prev => { const n = [...prev]; n[i] = { ...n[i], status: 'ok', out: tr('chat_screenshot_shown'), img: url }; return n })
          results.push(tr('chat_cmd_screenshot_ok'))
        } catch (eS) {
          setSteps(prev => { const n = [...prev]; n[i] = { ...n[i], status: 'error', out: (eS as Error).message || tr('chat_capture_failed') }; return n })
          results.push(tr('chat_cmd_screenshot_err') + ((eS as Error).message || ''))
        }
        await new Promise(r => setTimeout(r, 260))
        continue
      }
      const body = parseControlLine(cmds[i])
      let out = '', ok = false
      if (!body) { out = tr('chat_cmd_unknown') }
      else {
        try {
          const res = await fetch(`/api/devices/${deviceId}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(body)
          })
          const j = await res.json().catch(() => ({} as { ok?: boolean; stdout?: string; stderr?: string; error?: string }))
          ok  = res.ok && j.ok === true
          out = String(j.stdout || j.error || j.stderr || '').trim()
        } catch (e) { out = (e as Error).message || tr('chat_failed') }
      }
      setSteps(prev => { const n = [...prev]; n[i] = { ...n[i], status: ok ? 'ok' : 'error', out: out.slice(0, 700) }; return n })
      results.push(cmds[i] + ' => ' + (ok ? 'OK' : tr('chat_error')) + (out ? ' :: ' + out.slice(0, 350) : ''))
      await new Promise(r => setTimeout(r, 260))
    }
    setRunning(false)
    setDone(true)
    if (onDone) onDone(results.join('\n'))
  }, [deviceId, raw, running, onDone])

  useEffect(() => { if (autoCapture && deviceId && !tried.current) { tried.current = true; run() } }, [autoCapture, deviceId, run])

  return (
    <div className={clsx('rounded-xl overflow-hidden border my-1.5', 'border-line')}>
      <div className={clsx(
        'flex items-center justify-between px-3 py-1.5 text-[11px] font-mono border-b',
        isLight ? 'bg-surface2 border-line text-muted' : 'bg-code border-line text-muted'
      )}>
        <div className="flex items-center gap-1.5">
          <MousePointer2 size={10} />
          <span>{tr('chat_control_commands', { n: lines.length })}</span>
        </div>
        <button onClick={run} disabled={running || !deviceId}
          className={clsx('flex items-center gap-1 px-2 py-0.5 rounded transition-colors text-[10px] disabled:opacity-50',
            'bg-primary/15 text-primary hover:bg-primary/25')}>
          {running ? <><Loader size={9} className="animate-spin" /> {tr('chat_working')}</> : <><Play size={9} /> {done ? tr('chat_rerun') : tr('chat_run')}</>}
        </button>
      </div>
      <div className={clsx('px-3 py-2 space-y-1', isLight ? 'bg-surface2' : 'bg-code')}>
        {steps.map((st, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={clsx('mt-0.5 flex-shrink-0',
              st.status === 'ok' ? 'text-success' : st.status === 'error' ? 'text-danger' : st.status === 'running' ? 'text-warning' : isLight ? 'text-ink' : 'text-muted')}>
              {st.status === 'running' ? <Loader size={10} className="animate-spin" /> : st.status === 'ok' ? <Check size={10} /> : st.status === 'error' ? <AlertCircle size={10} /> : <Square size={10} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={clsx('font-mono text-[11px] whitespace-pre-wrap break-all', 'text-ink')} dir="ltr">{st.line}</p>
              {st.out && <p className={clsx('font-mono text-[10px] whitespace-pre-wrap break-all mt-0.5', st.status === 'error' ? ('text-danger') : ('text-muted'))}>{st.out}</p>}
              {st.img && <img src={st.img} alt={tr('chat_verify_shot_alt')} className="mt-1 rounded-lg border border-line max-h-72 object-contain" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
// v3.3.4 — desktop video recording: samples screenshots, encodes to WebM via MediaRecorder
// v3.5 - AI can start a live screen stream on request
function StreamBlock({ deviceId, isLight }: { deviceId?: string; isLight: boolean }) {
  const tr = useT()
  const [opened, setOpened] = useState(false)
  function openStream() {
    if (!deviceId) return
    const w = openScreenWindow(deviceId)
    if (w) { try { w.focus() } catch {} }
    setOpened(true)
  }
  return (
    <div className={clsx('my-2 rounded-xl border overflow-hidden', isLight ? 'border-primary/25 bg-primary/10' : 'border-primary/25 bg-primary/5')}>
      <div className="flex items-center gap-3 px-3 py-3">
        <div className={clsx('w-9 h-9 rounded-lg grid place-items-center flex-shrink-0', 'bg-primary/15 text-primary')}>
          <Monitor size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={clsx('text-xs font-semibold', 'text-ink')}>{tr('chat_live_stream_title')}</p>
          <p className={clsx('text-[11px] mt-0.5', 'text-muted')}>
            {opened ? tr('chat_stream_opened') : tr('chat_stream_open_desc')}
          </p>
        </div>
        <button onClick={openStream} disabled={!deviceId}
          className={clsx('px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors',
            isLight ? 'border-primary/40 text-primary hover:bg-primary/15' : 'border-primary/35 text-primary hover:bg-primary/10',
            !deviceId && 'opacity-50 cursor-not-allowed')}>
          {opened ? tr('chat_open_again') : tr('chat_start_stream')}
        </button>
      </div>
    </div>
  )
}

function RecordBlock({ deviceId, isLight, autoCapture, raw }: {
  deviceId?: string
  isLight: boolean
  autoCapture?: boolean
  raw?: string
}) {
  const tr = useT()
  const [state, setState]       = useState<'idle' | 'recording' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [err, setErr]           = useState<string | null>(null)
  const tried   = useRef(false)
  const stopRef = useRef(false)
  const audioElRef  = useRef<HTMLAudioElement | null>(null)
  const audioWsRef  = useRef<WebSocket | null>(null)
  const audioMsRef  = useRef<MediaSource | null>(null)
  const audioSbRef  = useRef<SourceBuffer | null>(null)
  const audioQRef   = useRef<ArrayBuffer[]>([])
  const audioUrlRef = useRef<string | null>(null)

  const region = (() => {
    const m = /(?:region|المنطقة)\s*[:=]?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(raw || '')
    return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null
  })()
  const duration = (() => {
    const m = /(?:duration|المدة|مدة)\s*[:=]?\s*(\d+)/i.exec(raw || '') || /(\d+)\s*(?:ثانية|ثواني|ثوان|sec)/i.exec(raw || '')
    return Math.min(Math.max(m ? +m[1] : 8, 3), 30)
  })()

  const flushAudio = () => {
    const sb = audioSbRef.current
    if (!sb || sb.updating) return
    const next = audioQRef.current.shift()
    if (!next) return
    try { sb.appendBuffer(next) } catch { audioQRef.current = [] }
  }
  const stopAudio = () => {
    try { audioWsRef.current?.close() } catch {}
    audioWsRef.current = null
    try { audioElRef.current?.pause() } catch {}
    audioElRef.current = null
    if (audioUrlRef.current) { try { URL.revokeObjectURL(audioUrlRef.current) } catch {}; audioUrlRef.current = null }
    audioMsRef.current = null; audioSbRef.current = null; audioQRef.current = []
  }
  const startAudio = async (): Promise<MediaStreamTrack[]> => {
    if (!deviceId) return []
    try {
      const token = getAuthToken()
      const t = await fetch('/api/auth/ws-ticket', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.json())
      if (!t?.ticket) return []
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/screen?` + new URLSearchParams({ ticket: t.ticket, deviceId, fps: '2', quality: '20', maxWidth: '480' }))
      audioWsRef.current = ws
      const el = document.createElement('audio')
      el.autoplay = true
      audioElRef.current = el
      const ms = new MediaSource()
      audioMsRef.current = ms
      audioUrlRef.current = URL.createObjectURL(ms)
      el.src = audioUrlRef.current
      ms.addEventListener('sourceopen', () => {
        try {
          const sb = ms.addSourceBuffer('audio/webm; codecs=opus')
          audioSbRef.current = sb
          sb.addEventListener('updateend', flushAudio)
          flushAudio()
        } catch {}
      })
      ws.onmessage = ev => {
        if (typeof ev.data !== 'string') return
        try {
          const j = JSON.parse(ev.data)
          if (j.type !== 'screen:audio') return
          const bytes = Uint8Array.from(atob(String(j.payload?.data || '')), c => c.charCodeAt(0))
          if (bytes.length) { audioQRef.current.push(bytes.buffer); flushAudio() }
        } catch {}
      }
      await new Promise(r => setTimeout(r, 1600))
      el.play().catch(() => {})
      const anyEl = el as any
      return typeof anyEl.captureStream === 'function' ? anyEl.captureStream().getAudioTracks() : []
    } catch { return [] }
  }

  const capture = useCallback(async () => {
    if (!deviceId) return
    setState('recording'); setErr(null); setProgress(0); setVideoUrl(null); stopRef.current = false
    const token = getAuthToken()
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
    const grab = async (): Promise<Blob | null> => {
      try {
        const res = await fetch(`/api/devices/${deviceId}/screenshot`, { headers })
        if (!res.ok) return null
        return await res.blob()
      } catch { return null }
    }
    try {
      const first = await grab()
      if (!first) throw new Error(tr('chat_rec_start_failed'))
      const bmp = await createImageBitmap(first)
      const sx = region ? Math.min(region.x, bmp.width - 1) : 0
      const sy = region ? Math.min(region.y, bmp.height - 1) : 0
      const sw = region ? Math.max(16, Math.min(region.w, bmp.width - sx)) : bmp.width
      const sh = region ? Math.max(16, Math.min(region.h, bmp.height - sy)) : bmp.height
      const canvas = document.createElement('canvas')
      canvas.width = sw; canvas.height = sh
      const ctx = canvas.getContext('2d')!
      const stream = (canvas as HTMLCanvasElement).captureStream(0) as MediaStream
      const track  = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
      const audioTracks = await startAudio()
      const recStream = new MediaStream([...stream.getVideoTracks(), ...audioTracks])
      const wantAudio = audioTracks.length > 0
      const mime = wantAudio && MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
      const rec = new MediaRecorder(recStream, { mimeType: mime, videoBitsPerSecond: 2500000 })
      const chunks: BlobPart[] = []
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      const finished = new Promise<Blob>(resolve => { rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
      rec.start(500)
      const drawFrame = (img: ImageBitmap) => { ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh); track.requestFrame() }
      drawFrame(bmp); if (bmp.close) bmp.close()
      const t0 = Date.now()
      while (!stopRef.current && Date.now() - t0 < duration * 1000) {
        await new Promise(r => setTimeout(r, 650))
        const blob = await grab()
        if (blob) { const im = await createImageBitmap(blob); drawFrame(im); if (im.close) im.close() }
        setProgress(Math.min(100, Math.round((Date.now() - t0) / (duration * 10))))
      }
      rec.stop()
      stopAudio()
      const out = await finished
      setVideoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(out) })
      setState('done')
    } catch (e) {
      stopAudio()
      setErr((e as Error).message || 'record failed'); setState('error')
    }
  }, [deviceId, duration, region?.x, region?.y, region?.w, region?.h])

  useEffect(() => {
    if (autoCapture && deviceId && !tried.current) { tried.current = true; capture() }
  }, [autoCapture, deviceId, capture])

  return (
    <div className={clsx('rounded-xl overflow-hidden border my-1.5', 'border-line')}>
      <div className={clsx(
        'flex items-center justify-between px-3 py-1.5 text-[11px] font-mono border-b',
        isLight ? 'bg-surface2 border-line text-muted' : 'bg-code border-line text-muted'
      )}>
        <div className="flex items-center gap-1.5">
          <Video size={10} />
          <span>{tr('chat_rec_video_label', { s: duration })}{region ? tr('chat_rec_region', { w: region.w, h: region.h }) : ''}</span>
        </div>
        <div className="flex items-center gap-1">
          {videoUrl && (
            <a href={videoUrl} download="airemote-recording.webm" title={tr('chat_download_video')} className={clsx('p-1 rounded transition-colors', isLight ? 'hover:bg-line' : 'hover:bg-surface2')}>
              <Download size={10} />
            </a>
          )}
          {state === 'recording' ? (
            <button onClick={() => { stopRef.current = true }} className={clsx('flex items-center gap-1 px-2 py-0.5 rounded text-[10px]', isLight ? 'bg-danger/15 text-danger hover:bg-danger/20' : 'bg-danger/100/15 text-danger hover:bg-danger/100/25')}>
              <Square size={9} /> {tr('chat_stop')}
            </button>
          ) : (
            <button onClick={capture} disabled={!deviceId} className={clsx('flex items-center gap-1 px-2 py-0.5 rounded transition-colors text-[10px] disabled:opacity-50', 'bg-primary/15 text-primary hover:bg-primary/25')}>
              <Video size={9} /> {state === 'done' || state === 'error' ? tr('chat_new_recording') : tr('chat_start_recording')}
            </button>
          )}
        </div>
      </div>
      {state === 'recording' && (
        <div className="px-3 py-2">
          <div className={clsx('w-full h-1.5 rounded-full', isLight ? 'bg-line' : 'bg-surface2')}>
            <div className="h-full rounded-full bg-danger/100 transition-all" style={{ width: progress + '%' }} />
          </div>
          <p className={clsx('text-[10px] mt-1.5', 'text-muted')}>{tr('chat_recording_progress', { p: progress })}</p>
        </div>
      )}
      {err && <p className={clsx('px-3 py-3 text-[11px]', 'text-danger')}>{err}</p>}
      {videoUrl && <video controls src={videoUrl} className="w-full block bg-code" />}
      {state === 'idle' && !autoCapture && (
        <div className={clsx('flex items-center justify-center py-6', 'text-muted')}>
          <button onClick={capture} className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border transition-colors',
            isLight ? 'border-line hover:border-primary/50 hover:text-primary' : 'border-line hover:border-primary hover:text-primary')}>
            <Video size={11} /> {tr('chat_start_video_recording')}
          </button>
        </div>
      )}
    </div>
  )
}
// v3.3.4 — live screenshot block: captures a real screenshot of the remote device
function ScreenshotBlock({ deviceId, isLight, autoCapture, caption }: {
  deviceId?: string
  isLight: boolean
  autoCapture?: boolean
  caption?: string
}) {
  const tr = useT()
  const [url, setUrl]         = useState<string | null>(null)
  const [err, setErr]         = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const tried = useRef(false)

  const capture = useCallback(async () => {
    if (!deviceId) return
    setLoading(true); setErr(null)
    try {
      const token = getAuthToken()
      const res = await fetch(`/api/devices/${deviceId}/screenshot`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }))
        throw new Error((j && j.error) || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const obj = URL.createObjectURL(blob)
      setUrl(prev => { if (prev) URL.revokeObjectURL(prev); return obj })
    } catch (e: unknown) {
      setErr((e as Error).message || 'capture failed')
    } finally { setLoading(false) }
  }, [deviceId])

  useEffect(() => {
    if (autoCapture && deviceId && !tried.current) { tried.current = true; capture() }
  }, [autoCapture, deviceId, capture])

  return (
    <div className={clsx('rounded-xl overflow-hidden border my-1.5', 'border-line')}>
      <div className={clsx(
        'flex items-center justify-between px-3 py-1.5 text-[11px] font-mono border-b',
        isLight ? 'bg-surface2 border-line text-muted' : 'bg-code border-line text-muted'
      )}>
        <div className="flex items-center gap-1.5">
          <Camera size={10} />
          <span>{tr('chat_shot_from_device')}</span>
        </div>
        <div className="flex items-center gap-1">
          {url && (
            <button onClick={() => setLightbox(true)} title={tr('chat_preview_zoom_before_download')} className={clsx('p-1 rounded transition-colors', isLight ? 'hover:bg-line' : 'hover:bg-surface2')}>
              <ZoomIn size={10} />
            </button>
          )}
          {url && (
            <a href={url} download="airemote-screenshot.jpg" title={tr('chat_save_shot')} className={clsx('p-1 rounded transition-colors', isLight ? 'hover:bg-line' : 'hover:bg-surface2')}>
              <Download size={10} />
            </a>
          )}
          <button onClick={capture} disabled={loading || !deviceId} title={tr('chat_recapture')}
            className={clsx('flex items-center gap-1 px-2 py-0.5 rounded transition-colors text-[10px] disabled:opacity-50',
              'bg-primary/15 text-primary hover:bg-primary/25')}>
            {loading ? <><Loader size={9} className="animate-spin" /> {tr('chat_working')}</> : <><RefreshCw size={9} /> {tr('chat_capture')}</>}
          </button>
        </div>
      </div>
      {caption && <p className={clsx('px-3 pt-2 text-[11px]', 'text-muted')}>{caption}</p>}
      {err && <p className={clsx('px-3 py-3 text-[11px]', 'text-danger')}>{err}</p>}
      {url && <img src={url} alt={tr('chat_device_screenshot')} className="w-full block cursor-zoom-in" title={tr('chat_click_to_preview')} onClick={() => setLightbox(true)} />}
      {url && <div className={clsx('px-3 py-1.5 text-[10px] border-t', 'border-line text-muted')}>{tr('chat_click_image_preview')}</div>}
      {!url && !err && loading && (
        <div className={clsx('flex items-center justify-center py-8 text-[11px]', 'text-muted')}>
          <Loader size={12} className="animate-spin me-2" /> {tr('chat_capturing_from_device')}
        </div>
      )}
      {!url && !err && !loading && !autoCapture && (
        <div className={clsx('flex items-center justify-center py-6', 'text-muted')}>
          <button onClick={capture} className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border transition-colors',
            isLight ? 'border-line hover:border-primary/50 hover:text-primary' : 'border-line hover:border-primary hover:text-primary')}>
            <Camera size={11} /> {tr('chat_capture_now')}
          </button>
        </div>
      )}
      {lightbox && url && <ImageLightbox url={url} onClose={() => setLightbox(false)} />}
    </div>
  )
}
function isDangerousCmd(code: string): boolean {
  return /(\brm\s+-rf|\bdel\s+[^\n]*\/[fqs]|Remove-Item|\brd\s+\/s|rmdir\s+\/s|\bformat\b\s+[a-zA-Z]:|diskpart|Clear-Disk|Initialize-Disk|\bshutdown\b|Stop-Computer|Restart-Computer|taskkill[^\n]*\/f|\breg\s+delete|\bsc\s+delete|net\s+user[^\n]*\/delete|cipher\s+\/w|bcdedit|\bgit\s+reset\s+--hard)/i.test(code || '')
}

function CodeBlock({ code, lang, deviceId, isLight, autoExecEnabled, onFeedback }: {
  code: string
  lang: string
  deviceId?: string
  isLight: boolean
  autoExecEnabled?: boolean
  onFeedback?: (payload: { code: string; stdout: string; stderr: string; exitCode: number }) => void
}) {
  const tr = useT()
  const [copied,    setCopied]    = useState(false)
  const [executing, setExecuting] = useState(false)
  const [result,    setResult]    = useState<{ stdout: string; stderr: string; exitCode: number } | null>(null)
  const [showResult, setShowResult] = useState(true)
  const [needConfirm, setNeedConfirm] = useState(false)
  const autoExeced = useRef(false)
  const wasAutoRef = useRef(false)

  const isExecutable = ['bash', 'sh', 'shell', 'zsh', 'powershell', 'powershell.exe', 'ps1', 'pwsh', 'cmd', 'bat', ''].includes(lang.toLowerCase())

  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function execute(skipConfirm?: boolean) {
    if (!deviceId || executing) return
    if (!skipConfirm && isDangerousCmd(code)) { setNeedConfirm(true); return }
    setNeedConfirm(false)
    setExecuting(true)
    try {
      const res = await api.post(`/api/devices/${deviceId}/exec`, { command: code, timeoutMs: 60000 })
      const payload = { stdout: res.data.stdout || '', stderr: res.data.stderr || '', exitCode: res.data.exitCode ?? 0 }
      setResult(payload)
      setShowResult(true)
      if (wasAutoRef.current) onFeedback?.({ code, ...payload })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      const payload = { stdout: '', stderr: err.response?.data?.error || 'Execution failed', exitCode: 1 }
      setResult(payload)
      setShowResult(true)
      if (wasAutoRef.current) onFeedback?.({ code, ...payload })
    } finally {
      setExecuting(false)
    }
  }

  // Auto-execute when enabled (only once per block)
  useEffect(() => {
    const metaWords = ['screenshot', 'record', 'video', 'recording', 'screen']
    if (autoExecEnabled && isExecutable && deviceId && !autoExeced.current && !result && !isDangerousCmd(code) && !metaWords.includes(code.trim().toLowerCase())) {
      autoExeced.current = true
      wasAutoRef.current = true
      execute()
    }
  }, [autoExecEnabled])

  const headerCls = clsx(
    'flex items-center justify-between px-3 py-1.5 text-[11px] font-mono border-b',
    isLight ? 'bg-surface2 border-line text-muted' : 'bg-code border-line text-muted'
  )

  return (
    <div className={clsx(
      'rounded-xl overflow-hidden border text-[12px] my-1.5',
      'border-line'
    )}>
      {/* Header */}
      <div className={headerCls}>
        <div className="flex items-center gap-1.5">
          <Terminal size={10} />
          <span>{lang || 'bash'}</span>
          {autoExecEnabled && isExecutable && (
            <span className="text-warning flex items-center gap-1">
              <Zap size={8} /> auto
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={copy} title={tr('chat_copy')}
            className={clsx('p-1 rounded transition-colors', isLight ? 'hover:bg-line' : 'hover:bg-surface2')}>
            {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
          </button>
          {isExecutable && deviceId && (
            <button onClick={() => execute()} disabled={executing}
              title={tr('chat_run_remote')}
              className={clsx(
                'flex items-center gap-1 px-2 py-0.5 rounded transition-colors text-[10px] disabled:opacity-50',
                'bg-primary/15 text-primary hover:bg-primary/25'
              )}>
              {executing
                ? <><Loader size={9} className="animate-spin" /> {tr('chat_working')}</>
                : <><Play size={9} /> {tr('chat_run_now')}</>}
            </button>
          )}
        </div>
      </div>

      {/* Code */}
      <pre className={clsx(
        'px-4 py-3 font-mono overflow-x-auto whitespace-pre leading-relaxed',
        isLight ? 'text-ink bg-surface2' : 'text-ink bg-code'
      )}>
        {code}
      </pre>

      {/* Dangerous-confirm (v3.4.0) */}
      {needConfirm && (
        <div className={clsx('border-t px-3 py-2.5 text-[11px]', isLight ? 'border-warning/30 bg-warning/10 text-warning' : 'border-warning/20 bg-warning/100/10 text-warning')}>
          <div className="flex items-center gap-1.5 font-medium">
            <AlertCircle size={11} />
            <span>{tr('chat_danger_confirm')}</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button onClick={() => execute(true)} className="px-2.5 py-1 rounded bg-danger/100/90 hover:bg-danger/100 text-ink text-[10px] font-semibold transition-colors">
              {tr('chat_confirm_run')}
            </button>
            <button onClick={() => setNeedConfirm(false)} className="px-2.5 py-1 rounded bg-line/70 hover:bg-line text-[10px] transition-colors">
              {tr('chat_cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={clsx('border-t', 'border-line')}>
          <div className={clsx(
            'flex items-center justify-between px-3 py-1.5',
            result.exitCode === 0
              ? isLight ? 'bg-success/10 text-success' : 'bg-success/100/8 text-success'
              : isLight ? 'bg-danger/10 text-danger'         : 'bg-danger/100/8 text-danger'
          )}>
            <div className="flex items-center gap-1.5">
              {result.exitCode === 0 ? <Check size={10} /> : <AlertCircle size={10} />}
              <span className="font-mono">exit {result.exitCode}</span>
            </div>
            <div className="flex items-center gap-2">
              {!autoExecEnabled && onFeedback && (
                <button
                  onClick={() => onFeedback({ code, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode })}
                  className="text-[10px] px-2 py-0.5 rounded bg-surface/10 hover:bg-surface/20 transition-colors"
                >
                  {tr('chat_send_result_to_ai')}
                </button>
              )}
              <button onClick={() => setShowResult(v => !v)} className="opacity-60 hover:opacity-100 transition-opacity">
                <ChevronDown size={11} className={clsx('transition-transform', showResult ? '' : '-rotate-90')} />
              </button>
            </div>
          </div>
          {showResult && (result.stdout || result.stderr) && (
            <pre className={clsx(
              'px-3 py-2 font-mono text-[10px] whitespace-pre-wrap overflow-x-auto max-h-48',
              isLight ? 'bg-surface2 text-muted' : 'bg-code text-ink'
            )}>
              {result.stdout && <span className={'text-ink'}>{result.stdout.slice(0, 2000)}{result.stdout.length > 2000 ? '\n…' : ''}</span>}
              {result.stderr && <span className={'text-danger'}>{result.stderr}</span>}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  deviceId?: string
  conversationId?: string
  initialPrompt?: string
}

// v3.3.2 — translate common AI errors into clear, actionable text
function translateAiError(msg: string, tr: (k: TKey) => string): string {
  if (/FREE_LIMIT|1 reply every 30 seconds|Retry after/i.test(msg)) {
    return tr('chat_err_rate_limit')
  }
  const m = String(msg || '')
  if (/location is not supported/i.test(m)) {
    return tr('chat_err_region')
  }
  if (/AI not configured/i.test(m)) return tr('chat_err_no_provider')
  if (/fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|network|Failed to fetch/i.test(m)) return tr('chat_err_no_network')
  return m || (tr('chat_err_unexpected'))
}

export function AiChatPanel({ deviceId, conversationId, initialPrompt }: Props) {
  const tr = useT()
  const isLight = useUIStore(s => s.theme === 'light')
  const isAr    = useUIStore(s => s.lang === 'ar')

  const cachedThreadRef = useRef(loadCachedThread(deviceId))
  const [messages,       setMessages]       = useState<Message[]>(cachedThreadRef.current.messages)
  const [input,          setInput]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [showConfig,     setShowConfig]     = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [config,         setConfig]         = useState<AIConfig>(loadSavedConfig)
  const [cfgMap,         setCfgMap]         = useState<Record<string, { apiKey?: string; model?: string; baseUrl?: string }>>({})
  const [validating,     setValidating]     = useState(false)
  const [validateOk,     setValidateOk]     = useState<boolean | null>(null)
  const [autoExec,       setAutoExec]       = useState(() => localStorage.getItem('airemote-ai-autoexec') !== 'false')
  const [suggestions,    setSuggestions]    = useState<string[]>([])
  const [copiedIdx,      setCopiedIdx]      = useState<number | null>(null)
  const [queueHint,      setQueueHint]      = useState(false)
  const [showConvs,      setShowConvs]      = useState(false)
  const [convs,          setConvs]          = useState<Array<{ id: string; title?: string; updated_at?: string }>>([])
  const [activeConvId,   setActiveConvId]   = useState<string | undefined>(conversationId || cachedThreadRef.current.conversationId)

  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const scrollBoxRef    = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLTextAreaElement>(null)
  const userScrolled    = useRef(false)
  const abortRef        = useRef<AbortController | null>(null)
  const execChainRef    = useRef(0)
  const skipReloadRef   = useRef(false)
  // v3.5 — track the conversation id without re-triggering the history effect mid-stream
  const convIdRef       = useRef<string | undefined>(conversationId)
  const initialPromptSent = useRef(false)

  // ── Load AI config from server (sync on mount) ─────────────────────────
  useEffect(() => {
    api.get('/api/settings').then(res => {
      const d = res.data
      if (d.aiConfigs && typeof d.aiConfigs === 'object') setCfgMap(d.aiConfigs)
      const local = loadSavedConfig()
      const hasLocal = !!localStorage.getItem(CONFIG_KEY)

      if (d.aiProvider && (d.aiApiKey || d.aiProvider === 'ollama' || d.ollamaUrl || d.aiModel || d.aiConfigs?.[d.aiProvider]?.baseUrl)) {
        const serverCfg: AIConfig = {
          provider: d.aiProvider,
          model:    d.aiModel || (d.aiProvider === 'gemini' ? 'gemini-2.5-flash' : d.aiProvider === 'zai' ? 'glm-4.7-flash' : d.aiProvider === 'ollama' ? 'llama3' : 'gpt-4o'),
          apiKey:   d.aiApiKey || '',
          baseUrl:  d.ollamaUrl || '',
        }
        const needsUpdate = !hasLocal
          || local.provider !== serverCfg.provider
          || (!local.apiKey && serverCfg.apiKey)
          || (!local.model && !!serverCfg.model)
          || (!local.baseUrl && !!serverCfg.baseUrl)
        if (needsUpdate) {
          setConfig(serverCfg)
          localStorage.setItem(CONFIG_KEY, JSON.stringify(serverCfg))
        }
      }
    }).catch(() => {})
  }, [])

  // ── Auto-resize textarea ───────────────────────────────────────────────
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 128) + 'px'
    }
  }, [input])

  // ── Smart scroll ───────────────────────────────────────────────────────
  useEffect(() => {
    const box = scrollBoxRef.current
    if (!box) return
    const isNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150
    if (!userScrolled.current && (!isNearBottom || loading)) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading])

  useEffect(() => {
    const box = scrollBoxRef.current
    if (!box) return
    const onScroll = () => {
      const isNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80
      userScrolled.current = !isNearBottom
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => box.removeEventListener('scroll', onScroll)
  }, [])

  // v3.5 — conversations belong to a device: reset when the device changes
  const prevDeviceRef = useRef(deviceId)
  useEffect(() => {
    if (prevDeviceRef.current === deviceId) return
    prevDeviceRef.current = deviceId
    const cached = loadCachedThread(deviceId)
    convIdRef.current = cached.conversationId
    setActiveConvId(cached.conversationId)
    setMessages(cached.messages)
    setSuggestions([])
  }, [deviceId])

  // ── Load conversation history ──────────────────────────────────────────
  useEffect(() => {
    if (skipReloadRef.current) { skipReloadRef.current = false; setLoadingHistory(false); return }
    setLoadingHistory(true)
    const cached = loadCachedThread(deviceId)
    setMessages(cached.messages)
    setSuggestions([])
    userScrolled.current = false
    const params = new URLSearchParams()
    if (activeConvId) params.set('conversationId', activeConvId)
    if (deviceId)     params.set('deviceId', deviceId)

    api.get(`/api/ai/history?${params.toString()}`).then(res => {
      const msgs = res.data.messages || []
      const serverMessages = msgs.map((m: { role: string; content: string; timestamp: string }) => ({
        role: m.role, content: m.content, timestamp: new Date(m.timestamp)
      }))
      // Keep local messages that the server has not persisted yet (for example
      // when the user leaves the page while the stream is still running).
      const merged = [...serverMessages]
      for (const local of cached.messages) {
        if (!merged.some(m => m.role === local.role && m.content === local.content)) merged.push(local)
      }
      merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      setMessages(merged)
      if (res.data.conversationId) {
        convIdRef.current = res.data.conversationId
        setActiveConvId(res.data.conversationId)
      }
    }).catch(() => {}).finally(() => setLoadingHistory(false))
  }, [deviceId, activeConvId])

  // Persist the thread across route changes/unmounts.
  useEffect(() => {
    if (messages.length > 0) saveCachedThread(deviceId, messages, activeConvId)
  }, [messages, activeConvId, deviceId])

  // Cleanup abort on unmount
  useEffect(() => () => { abortRef.current?.abort() }, [])

  const selectedProvider = PROVIDERS.find(p => p.value === config.provider)!

  const saveConfig = useCallback((cfg: AIConfig) => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
    setConfig(cfg)
    setValidateOk(null)
    // PUT /api/settings replaces the row; merge first so saving AI fields
    // never wipes Telegram notifications or other settings.
    api.get('/api/settings').then(r => api.put('/api/settings', {
      ...r.data,
      aiProvider: cfg.provider, aiModel: cfg.model,
      aiApiKey: cfg.apiKey || '', ollamaUrl: cfg.baseUrl || '',
    })).catch(() => {})
  }, [])

  async function handleValidate() {
    setValidating(true)
    setValidateOk(null)
    try {
      await api.post('/api/ai/validate', { config: { provider: config.provider, model: config.model, apiKey: config.apiKey || undefined, baseUrl: config.baseUrl || undefined } })
      setValidateOk(true)
    } catch { setValidateOk(false) }
    finally { setValidating(false) }
  }

  // ── Streaming send ─────────────────────────────────────────────────────
  async function handleSend(text?: string, opts?: { fromExec?: boolean }) {
    const msg = (text || input).trim()
    if (!opts?.fromExec) execChainRef.current = 0
    if (!msg || loading) return
    if (suggestions.length) setSuggestions([])
    userScrolled.current = false

    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: new Date() }])
    setInput('')
    setLoading(true)

    // Placeholder streaming message
    setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date(), streaming: true, live: true }])

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const token = getAuthToken()
      const res = await fetch('/api/ai/chat/stream', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          message: msg, deviceId, conversationId: convIdRef.current,
          config: { provider: config.provider, model: config.model, apiKey: config.apiKey || undefined, baseUrl: config.baseUrl || undefined }
        }),
        signal: ctrl.signal
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: tr('chat_err_connection') }))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf  = ''
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            // v3.5 — keep the id in a ref; updating state here used to reset the
            // message list via the history effect and made the chat appear empty.
            if (data.conversationId) convIdRef.current = data.conversationId
            if (data.chunk) {
              full += data.chunk
              const content = full
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { ...next[next.length - 1], content }
                return next
              })
            }
            if (data.error) throw new Error(data.error)
            if (data.done) {
              setMessages(prev => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last && !String(last.content || '').trim()) {
                  next[next.length - 1] = { ...last, streaming: false, error: true, content: tr('chat_err_no_reply') }
                } else if (last) {
                  next[next.length - 1] = { ...last, streaming: false }
                }
                return next
              })
              if (data.stats) setSuggestions(buildSuggestions(data.stats).map(k => tr(k)))
            }
          } catch (parseErr) {
            if ((parseErr as Error).name !== 'SyntaxError') throw parseErr
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return
      const err = e as Error
      setMessages(prev => {
        const next = [...prev]
        const lastIdx = next.length - 1
        if (next[lastIdx]?.streaming !== undefined) {
          next[lastIdx] = {
            role: 'assistant', content: translateAiError(err.message, tr),
            timestamp: new Date(), error: true, streaming: false
          }
        } else {
          next.push({ role: 'assistant', content: translateAiError(err.message, tr), timestamp: new Date(), error: true })
        }
        return next
      })
    } finally {
      // v3.5 — promote a newly created conversation id only after the stream ends,
      // and skip the history reload so the local transcript stays visible.
      if (convIdRef.current && convIdRef.current !== activeConvId) {
        skipReloadRef.current = true
        setActiveConvId(convIdRef.current)
      }
      setLoading(false)
      abortRef.current = null
      inputRef.current?.focus()
    }
  }

  useEffect(() => {
    if (!initialPrompt || initialPromptSent.current || loadingHistory) return
    const timer = window.setTimeout(() => {
      if (initialPromptSent.current) return
      initialPromptSent.current = true
      void handleSend(initialPrompt)
    }, 650)
    return () => window.clearTimeout(timer)
  }, [initialPrompt, loadingHistory])

  function copyMessage(text: string, idx: number) {
    try { navigator.clipboard.writeText(text) } catch {}
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 1600)
  }

  async function toggleConvs() {
    const v = !showConvs
    setShowConvs(v)
    if (v) {
      try { const res = await api.get(`/api/ai/conversations${deviceId ? '?deviceId=' + deviceId : ''}`); setConvs(res.data || []) } catch {}
    }
  }

  function openConv(id: string) {
    setShowConvs(false)
    convIdRef.current = id
    setActiveConvId(id)
  }

  function startNewConv() {
    setShowConvs(false)
    convIdRef.current = undefined
    setActiveConvId(undefined)
    setMessages([])
    setSuggestions([])
  }

  // v3.3.4 — control-block results feed back to the AI like command results
  function handleControlFeedback(summary: string) {
    if (!deviceId) return
    if (execChainRef.current >= 6) return
    execChainRef.current += 1
    handleSend(tr('chat_prompt_control_header') + summary + tr('chat_prompt_control_followup'), { fromExec: true })
  }

  // v3.3.4 — execution feedback loop: send command results back to the AI
  function handleExecFeedback(payload: { code: string; stdout: string; stderr: string; exitCode: number }) {
    if (!deviceId) return
    if (execChainRef.current >= 6) {
      setMessages(prev => [...prev, { role: 'assistant', content: tr('chat_autoexec_stopped'), timestamp: new Date() }])
      return
    }
    execChainRef.current += 1
    const fb = [
      tr('chat_prompt_cmd_header'),
      tr('chat_prompt_cmd_label'),
      '```',
      payload.code,
      '```',
      tr('chat_prompt_stdout') + (payload.stdout ? payload.stdout.slice(0, 3000) : tr('chat_empty_paren')),
      tr('chat_prompt_stderr') + (payload.stderr ? payload.stderr.slice(0, 1200) : tr('chat_none_paren')),
      tr('chat_prompt_exit_code') + payload.exitCode,
      tr('chat_prompt_cmd_followup'),
    ].join('\n')
    void handleSend(fb, { fromExec: true })
  }

  function stopStreaming() {
    abortRef.current?.abort()
    setMessages(prev => {
      const next = [...prev]
      if (next[next.length - 1]?.streaming) {
        next[next.length - 1] = { ...next[next.length - 1], streaming: false }
      }
      return next
    })
    setLoading(false)
  }

  async function clearHistory() {
    if (!confirm(tr('chat_clear_confirm'))) return
    try {
      const params = new URLSearchParams()
      if (deviceId) params.set('deviceId', deviceId)
      else if (activeConvId) params.set('conversationId', activeConvId)
      await api.delete(`/api/ai/history?${params.toString()}`)
      skipReloadRef.current = true
      convIdRef.current = undefined
      clearCachedThread(deviceId)
      setMessages([])
      setSuggestions([])
      setConvs([])
      setActiveConvId(undefined)
    } catch {}
  }

  function handleKey(e: React.KeyboardEvent) {
    if ((e.nativeEvent as KeyboardEvent).isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (loading) { setQueueHint(true); setTimeout(() => setQueueHint(false), 2800); return }
      handleSend()
    }
  }

  function renderMessageContent(msg: Message, msgAutoExec = false, isLastMsg = false) {
    const parts = parseContent(msg.content)
    return (
      <div className={clsx(
        'text-[13px] leading-relaxed space-y-2',
        msg.error
          ? ('text-danger')
          : isLight
            ? msg.role === 'user' ? 'text-ink' : 'text-ink'
            : msg.role === 'user' ? 'text-ink' : 'text-ink'
      )}>
        {parts.map((part, i) => {
          const isLastPart = i === parts.length - 1
          const plang = (part.lang || '').toLowerCase()
          const ptrim = part.content.trim()
          const isShot = plang === 'screenshot' || ((plang === 'text' || plang === '') && /^screenshot$/i.test(ptrim))
          const isStream = plang === 'stream' || ((plang === 'text' || plang === '') && /^(stream|بث)/i.test(ptrim))
          const isRec  = plang === 'record' || ((plang === 'text' || plang === '') && /^(record|المدة)/i.test(ptrim))
          const isCtrl = plang === 'control' || ((plang === 'text' || plang === '') && looksLikeControlLines(part.content))
          return part.type === 'code'
            ? (isShot
                ? <ScreenshotBlock key={i} deviceId={deviceId} isLight={isLight}
                    autoCapture={isLastMsg && !msg.streaming && !!msg.live} caption={ptrim || undefined} />
                : isStream
                  ? <StreamBlock key={i} deviceId={deviceId} isLight={isLight} />
                : isRec
                  ? <RecordBlock key={i} deviceId={deviceId} isLight={isLight}
                      autoCapture={isLastMsg && !msg.streaming && !!msg.live} raw={part.content} />
                  : isCtrl
                    ? <ControlBlock key={i} deviceId={deviceId} isLight={isLight}
                        autoCapture={isLastMsg && !msg.streaming && !!msg.live} raw={part.content} onDone={handleControlFeedback} />
                    : <CodeBlock key={i} code={part.content} lang={part.lang || 'bash'} deviceId={deviceId} isLight={isLight}
                      autoExecEnabled={msgAutoExec && !msg.streaming && !!msg.live} onFeedback={handleExecFeedback} />)
            : <p key={i} className="whitespace-pre-wrap">
                {part.content}
                {msg.streaming && isLastPart && (
                  <span className={clsx(
                    'inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse',
                    isLight ? 'bg-primary/100' : 'bg-primary'
                  )} />
                )}
              </p>
        })}
        {/* Cursor when content is empty (just started streaming) */}
        {msg.streaming && msg.content === '' && (
          <span className={clsx(
            'inline-block w-0.5 h-3.5 animate-pulse',
            isLight ? 'bg-primary/100' : 'bg-primary'
          )} />
        )}
      </div>
    )
  }

  // ── Input field classes ────────────────────────────────────────────────
  const inputCls = clsx(
    'w-full border rounded-2xl px-4 py-3 text-sm resize-none overflow-hidden transition-all',
    'placeholder:text-muted focus:outline-none',
    isLight
      ? 'bg-surface border-line text-ink focus:border-primary/60 focus:ring-2 focus:ring-primary/20 shadow-sm'
      : 'bg-canvas border-line text-ink focus:border-primary focus:ring-2 focus:ring-primary/15'
  )

  const cfgFieldCls = clsx(
    'w-full border rounded-xl px-3 py-2 text-xs transition-colors focus:outline-none',
    isLight
      ? 'bg-surface border-line text-ink focus:border-primary/60'
      : 'bg-canvas border-line text-ink focus:border-primary'
  )

  return (
    <div className="relative flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={clsx(
        'flex items-center justify-between px-4 py-3 border-b flex-shrink-0',
        'border-line'
      )}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-info flex items-center justify-center shadow-sm shadow-primary/30">
            <Sparkles size={14} className="text-ink" />
          </div>
          <div>
            <h3 className={clsx('text-sm font-semibold', 'text-ink')}>
              {tr('chat_ai_assistant')}
            </h3>
            <p className={clsx('text-[11px]', 'text-muted')}>
              {providerLabel(selectedProvider, tr)} · {config.model}
            </p>
          </div>
          {deviceId && (
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/25 px-2 py-0.5 rounded-full font-medium">
              {tr('chat_device_context')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Conversations history (v3.3.4) */}
          <button onClick={toggleConvs} title={tr('chat_history_title')}
            className={clsx('p-1.5 rounded-lg transition-colors',
              showConvs ? 'bg-info/15 text-info'
                : isLight ? 'text-muted hover:text-muted hover:bg-surface2' : 'text-muted hover:text-ink hover:bg-surface2/70')}>
            <History size={14} />
          </button>
          {/* Auto-exec toggle (only when connected to a device) */}
          {deviceId && (
            <button
              onClick={() => {
                const v = !autoExec
                setAutoExec(v)
                localStorage.setItem('airemote-ai-autoexec', String(v))
              }}
              title={autoExec ? tr('chat_autoexec_on') : tr('chat_autoexec_off')}
              className={clsx(
                'p-1.5 rounded-lg transition-colors border text-[10px] flex items-center gap-1',
                autoExec
                  ? 'bg-warning/100/12 border-warning/30 text-warning'
                  : isLight
                    ? 'border-transparent text-muted hover:text-muted hover:bg-surface2'
                    : 'border-transparent text-muted hover:text-ink hover:bg-surface2/70'
              )}
            >
              <Zap size={13} />
              {autoExec && <span className="hidden sm:inline font-medium">Auto</span>}
            </button>
          )}
          <button
            onClick={() => setShowConfig(s => !s)}
            className={clsx(
              'p-1.5 rounded-lg transition-colors',
              showConfig
                ? 'bg-info/15 text-info'
                : isLight
                  ? 'text-muted hover:text-muted hover:bg-surface2'
                  : 'text-muted hover:text-ink hover:bg-surface2/70'
            )}
            title={tr('chat_ai_settings')}
          >
            <Settings2 size={14} />
          </button>
          <button
            onClick={clearHistory}
            disabled={messages.length === 0}
            className={clsx(
              'p-1.5 rounded-lg transition-colors disabled:opacity-30',
              'text-muted hover:text-danger hover:bg-danger/10'
            )}
            title={tr('chat_clear_chat')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {showConvs && (
        <div className={clsx('absolute top-14 z-30 w-80 max-h-[420px] overflow-y-auto rounded-xl border shadow-2xl', 'bg-surface border-line')} style={{ insetInlineEnd: 12 }}>
          <button onClick={startNewConv}
            className={clsx('w-full flex items-center gap-2 px-3 py-2.5 text-xs border-b transition-colors', isLight ? 'border-line text-primary hover:bg-primary/10' : 'border-line text-primary hover:bg-surface2/70')}>
            <Plus size={12} /> {tr('chat_new_conversation')}
          </button>
          {deviceId && <div className={clsx('px-3 py-1.5 text-[10px]', 'text-muted')}>{tr('chat_memory_hint')}</div>}
          {convs.length === 0 && <p className={clsx('px-3 py-3 text-xs', 'text-muted')}>{tr('chat_no_conversations')}</p>}
          {convs.map(cv => (
            <div key={cv.id} className={clsx('flex items-stretch border-b last:border-b-0', 'border-line', activeConvId === cv.id && ('bg-primary/10'))}>
              <button onClick={() => openConv(cv.id)} className={clsx('flex-1 min-w-0 text-start px-3 py-2 transition-colors', isLight ? 'hover:bg-surface2' : 'hover:bg-surface2/70')}>
                <p className={clsx('text-xs truncate', 'text-ink')}>{cv.title || tr('chat_conversation')}</p>
                <p className={clsx('text-[10px] mt-0.5', 'text-muted')} dir="ltr">{String(cv.updated_at || '').slice(0, 16)}</p>
              </button>
              <button
                onClick={async (ev) => {
                  ev.stopPropagation()
                  try { await api.delete(`/api/ai/history?conversationId=${cv.id}`) } catch {}
                  setConvs(prev => prev.filter(c => c.id !== cv.id))
                  if (activeConvId === cv.id) { skipReloadRef.current = true; setActiveConvId(undefined); setMessages([]) }
                }}
                title={tr('chat_delete_conversation')}
                className={clsx('px-2 transition-colors', isLight ? 'text-ink hover:text-danger hover:bg-danger/10' : 'text-muted hover:text-danger hover:bg-danger/10')}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Config panel ────────────────────────────────────────────────── */}
      {showConfig && (
        <div className={clsx(
          'px-4 py-3.5 border-b space-y-3 flex-shrink-0',
          isLight ? 'bg-surface2 border-line' : 'bg-canvas/70 border-line'
        )}>
          <div className="flex items-center gap-2 mb-1">
            <Key size={12} className={'text-muted'} />
            <span className={clsx('text-xs font-medium', 'text-muted')}>{tr('chat_model_settings')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={clsx('text-[11px] block mb-1', 'text-muted')}>{tr('chat_provider')}</label>
              <select
                value={config.provider}
                onChange={e => {
                  const prov = e.target.value as AIConfig['provider']
                  const p = PROVIDERS.find(x => x.value === prov)!
                  const map = { ...cfgMap, [config.provider]: { apiKey: config.apiKey || '', model: config.model, baseUrl: config.baseUrl || '' } }
                  setCfgMap(map)
                  const sv = map[prov]
                  saveConfig({ provider: prov, model: sv?.model || p.models[0], apiKey: sv?.apiKey || '', baseUrl: sv?.baseUrl || '' })
                }}
                className={cfgFieldCls} dir="ltr"
              >
                {PROVIDERS.map(p => <option key={p.value} value={p.value}>{providerLabel(p, tr)}</option>)}
              </select>
            </div>
            <div>
              <label className={clsx('text-[11px] block mb-1', 'text-muted')}>{tr('chat_model')}</label>
              <select
                value={config.model}
                onChange={e => saveConfig({ ...config, model: e.target.value })}
                className={cfgFieldCls} dir="ltr"
              >
                {selectedProvider?.models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={clsx('text-[11px] block mb-1', 'text-muted')}>
              {config.provider === 'ollama' ? 'Ollama URL' : 'API Key'}
            </label>
            <input
              type="password"
              value={config.provider === 'ollama' ? (config.baseUrl || '') : (config.apiKey || '')}
              onChange={e => saveConfig(config.provider === 'ollama' ? { ...config, baseUrl: e.target.value } : { ...config, apiKey: e.target.value })}
              placeholder={config.provider === 'ollama' ? 'http://localhost:11434' : config.provider === 'zai' ? 'Z.ai API key' : 'sk-...'}
              className={clsx(cfgFieldCls, 'font-mono')} dir="ltr"
            />
          </div>
          <div className="flex gap-2 pt-0.5">
            <button
              onClick={handleValidate}
              disabled={validating || (config.provider !== 'ollama' && !config.apiKey?.trim())}
              className={clsx(
                'flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-all disabled:opacity-40',
                validateOk === true  ? 'bg-success/100/10 border-success/30 text-success' :
                validateOk === false ? 'bg-danger/100/10 border-danger/30 text-danger' :
                isLight ? 'border-line text-muted hover:border-primary/60 hover:text-primary'
                        : 'border-line text-muted hover:border-primary hover:text-primary'
              )}
            >
              {validating  ? <><Loader size={10} className="animate-spin" /> {tr('chat_working')}</> :
               validateOk === true  ? <><Wifi size={10} /> {tr('chat_validate_ok')}</> :
               validateOk === false ? <><WifiOff size={10} /> {tr('chat_validate_fail')}</> :
               <><Wifi size={10} /> {tr('chat_validate_test')}</>}
            </button>
            <button
              onClick={() => setShowConfig(false)}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg transition-colors',
                isLight
                  ? 'bg-primary/10 hover:bg-primary/15 text-primary border border-primary/25'
                  : 'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20'
              )}
            >
              <ChevronDown size={12} /> {tr('chat_save_close')}
            </button>
          </div>
        </div>
      )}

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div
        ref={scrollBoxRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
      >
        {loadingHistory && (
          <div className="flex justify-center py-8">
            <div className={clsx('w-5 h-5 border-2 border-t-transparent rounded-full animate-spin', isLight ? 'border-primary/60' : 'border-primary')} />
          </div>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-6">
            <div className="w-full max-w-2xl mx-auto">
              <div className="flex flex-col items-center text-center">
                <div className={clsx(
                  'w-16 h-16 rounded-2xl flex items-center justify-center mb-3 border shadow-sm',
                  isLight
                    ? 'bg-gradient-to-br from-primary/10 to-blue-50 border-line'
                    : 'bg-gradient-to-br from-primary/15 to-info/15 border-line'
                )}>
                  <Bot size={28} className={'text-primary'} />
                </div>
                <h3 className={clsx('text-base font-bold', 'text-ink')}>
                  {tr('chat_greeting_title')}
                </h3>
                <p className={clsx('text-xs leading-relaxed mt-1.5 max-w-md', 'text-muted')}>
                  {deviceId
                    ? (tr('chat_greeting_connected'))
                    : (tr('chat_greeting_disconnected'))}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3">
                  {[tr('chat_cap_commands'), tr('chat_cap_screenshots'), tr('chat_cap_mouse'), tr('chat_cap_files'), tr('chat_cap_diagnostics')].map(c => (
                    <span key={c} className={clsx('text-[10px] px-2 py-1 rounded-full border', isLight ? 'bg-surface border-line text-muted' : 'bg-surface/[0.03] border-line text-muted')}>{c}</span>
                  ))}
                </div>
              </div>

              <p className={clsx('text-[11px] font-semibold uppercase tracking-wider mt-6 mb-2', 'text-muted')}>
                {tr('chat_quick_prompts_label')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {QUICK_PROMPT_KEYS.map(k => tr(k)).map((s, i) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); inputRef.current?.focus() }}
                    className={clsx(
                      'group text-start px-3.5 py-3 rounded-xl border transition-all flex items-start gap-2.5',
                      isLight
                        ? 'bg-surface border-line text-muted hover:border-primary/40 hover:bg-primary/10 hover:text-primary shadow-sm'
                        : 'bg-surface/80 border-line text-ink hover:border-primary/40 hover:bg-surface2/70 hover:text-ink'
                    )}
                  >
                    <span className={clsx('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-mono font-bold',
                      'bg-surface2 text-muted group-hover:bg-primary/15 group-hover:text-primary')}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[12px] leading-5 flex-1">{s}</span>
                    <Zap size={10} className={clsx('mt-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity', 'text-primary')} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          // v3.5 — an empty streaming placeholder is rendered by the typing indicator below
          if (msg.role === 'assistant' && msg.streaming && !msg.content) return null
          const isLastMsg    = i === messages.length - 1
          const msgAutoExec  = autoExec && isLastMsg && msg.role === 'assistant' && !msg.streaming
          const isProgUser   = msg.role === 'user' && /^\[(نتيجة تنفيذ|تم تنفيذ)/.test(msg.content || '')
          return (
            <div key={i} className={clsx('flex gap-2.5', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
              {/* Avatar */}
              <div className={clsx(
                'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border',
                msg.role === 'user'
                  ? 'bg-info/20 border-info/30'
                  : msg.error
                    ? 'bg-danger/100/15 border-danger/25'
                    : isLight
                      ? 'bg-primary/10 border-primary/25'
                      : 'bg-primary/15 border-primary/25'
              )}>
                {msg.role === 'user'
                  ? <User size={12} className="text-info" />
                  : <Bot size={12} className={msg.error ? 'text-danger' : 'text-primary'} />
                }
              </div>

              {/* Bubble */}
              <div className={clsx(
                'group max-w-[88%]',
                isProgUser
                  ? 'py-0.5 max-w-[96%]'
                  : 'rounded-2xl px-3.5 py-2.5 shadow-sm',
                isProgUser
                  ? ''
                  : msg.role === 'user'
                    ? 'bg-info text-primary-fg rounded-tr-sm'
                  : msg.error
                    ? isLight ? 'bg-danger/10 border border-danger/25 text-danger rounded-tl-sm' : 'bg-danger/100/10 border border-danger/20 rounded-tl-sm'
                    : isLight ? 'bg-surface border border-line text-ink rounded-tl-sm' : 'bg-surface border border-line rounded-tl-sm'
              )}>
                {isProgUser
                  ? <ProgressNote text={msg.content} isLight={isLight} />
                  : renderMessageContent(msg, msgAutoExec, isLastMsg)}
                <p className={clsx(
                  'text-[10px] mt-1.5 select-none',
                  msg.role === 'user'
                    ? 'text-blue-200'
                    : 'text-muted'
                )}>
                  {msg.timestamp instanceof Date
                    ? msg.timestamp.toLocaleTimeString('ar')
                    : new Date(msg.timestamp).toLocaleTimeString('ar')}
                </p>
                <div className={clsx('mt-1 flex items-center gap-2 transition-opacity',
                  msg.role === 'user' ? 'justify-end text-ink/70' : ('text-muted'),
                  msg.streaming ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100')}>
                  <button onClick={() => copyMessage(msg.content, i)} title={tr('chat_copy')} className="hover:opacity-80 transition-opacity flex items-center gap-0.5">
                    {copiedIdx === i
                      ? <><Check size={11} /><span className="text-[9px]">{tr('chat_copied')}</span></>
                      : <Copy size={11} />}
                  </button>
                  {msg.role === 'user' && !/^\[(نتيجة تنفيذ|تم تنفيذ)/.test(msg.content || '') && (
                    <button onClick={() => handleSend(msg.content)} disabled={loading} title={tr('chat_resend')} className="hover:opacity-80 transition-opacity disabled:opacity-40">
                      <RefreshCw size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Typing indicator (only while waiting for first chunk) */}
        {loading && messages[messages.length - 1]?.content === '' && messages[messages.length - 1]?.streaming && (
          <div className="flex gap-2.5">
            <div className={clsx(
              'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border',
              isLight ? 'bg-primary/10 border-primary/25' : 'bg-primary/15 border-primary/25'
            )}>
              <Loader size={12} className={clsx('animate-spin', 'text-primary')} />
            </div>
            <div className={clsx(
              'rounded-2xl rounded-tl-sm px-4 py-3 border',
              isLight ? 'bg-surface border-line shadow-sm' : 'bg-surface border-line'
            )}>
              <div className="flex gap-1.5 items-center h-4">
                {[0, 150, 300].map(d => (
                  <div key={d}
                    className={clsx('w-2 h-2 rounded-full animate-bounce', 'bg-primary')}
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Proactive suggestion chips */}
        {suggestions.length > 0 && !loading && (
          <div className="flex flex-wrap gap-1.5 pl-10 pr-2 pt-1">
            <span className={clsx('text-[11px] w-full mb-0.5', 'text-muted')}>{tr('chat_suggestions_from_state')}</span>
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => { setSuggestions([]); handleSend(s) }}
                className={clsx(
                  'text-[11px] px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5',
                  isLight
                    ? 'border-primary/25 text-primary bg-primary/10 hover:bg-primary/15 hover:border-primary/40'
                    : 'border-primary/30 text-primary bg-primary/8 hover:bg-primary/15'
                )}
              >
                <Zap size={9} />
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ───────────────────────────────────────────────────────── */}
      <div className={clsx(
        'p-3 border-t flex-shrink-0',
        isLight ? 'border-line bg-surface2' : 'border-line'
      )}>
        {queueHint && (
          <p className={clsx('text-[10px] mb-1.5', 'text-warning')}>{tr('chat_stream_busy')}</p>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={deviceId
              ? tr('chat_placeholder_device')
              : tr('chat_placeholder_plain')}
            rows={1}
            className={inputCls}
            style={{ minHeight: '44px', maxHeight: '128px' }}
          />
          {loading ? (
            <button
              onClick={stopStreaming}
              title={tr('chat_stop_reply')}
              className={clsx(
                'p-3 rounded-2xl transition-all flex-shrink-0',
                isLight
                  ? 'bg-danger/15 hover:bg-danger/20 text-danger border border-danger/25'
                  : 'bg-danger/100/15 hover:bg-danger/100/25 text-danger border border-danger/20'
              )}
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className={clsx(
                'p-3 rounded-2xl transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed',
                'bg-primary hover:brightness-110 text-primary-fg shadow-sm shadow-primary/25'
              )}
            >
              <Send size={15} />
            </button>
          )}
        </div>
        <p className={clsx('text-[10px] mt-1.5 text-center', 'text-muted')}>
          {tr('chat_input_hint')}
          {autoExec && deviceId && <span className="text-warning mr-2">{tr('chat_autoexec_badge')}</span>}
        </p>
      </div>
    </div>
  )
}
