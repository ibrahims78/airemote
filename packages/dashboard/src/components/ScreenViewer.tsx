/**
 * ScreenViewer.tsx — v3.1.0
 *  ✅ Live screen streaming (MJPEG over WebSocket, up to 30fps)
 *  ✅ Mouse control (move, click, drag, double-click, scroll, right-click)
 *  ✅ Keyboard control (all keys + modifier combos)
 *  ✅ Clipboard sync (read remote / write to remote)
 *  ✅ Multi-monitor selector
 *  ✅ Privacy mode (blank remote screen)
 *  ✅ Client-side recording (MediaRecorder → WebM download)
 *  ✅ Server-side recording (JPEG frames → ZIP download via /api/recordings)
 *  ✅ Fullscreen mode · Idle timeout warning (5 min)
 *  ✅ v3.0.0: Permission consent before control
 *  ✅ v3.0.0: Adaptive quality — auto-adjusts fps based on RTT latency
 *  ✅ v3.0.0: Drag & drop file upload → agent Desktop folder
 *  ✅ v3.0.0: Up to 30fps streaming
 *  ✅ T006: In-session text chat (dashboard ↔ agent)
 *  ✅ T001: Bandwidth meter with delta/keyframe stats
 *  ✅ T008: Server-side recording controls
 */
import {
  useEffect, useRef, useState, useCallback,
  MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent
} from 'react'
import {
  Monitor, Maximize2, Minimize2, RefreshCw, Wifi, WifiOff, ExternalLink, ArrowLeftRight, PenLine, Eraser, Crosshair, Trash2, Fingerprint,
  AlertTriangle, Loader2, Settings2,
  Clipboard, ClipboardPaste, EyeOff, Eye,
  Video, Tv2, Mouse, Keyboard, ChevronDown, ChevronUp, Undo2, Home, Layers, Circle,
  Upload, Shield, Zap, CheckCircle2, Pin, PinOff,
  MessageSquare, Send, Download, Activity, X, PlayCircle, Square, Volume2, VolumeX, RotateCw, Sun, Scaling
} from 'lucide-react'
import { clsx } from 'clsx'
import { createPortal } from 'react-dom'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import type { TKey } from '../lib/i18n'
import { useAuthStore } from '../store/authStore'
import AnnotationLayer, { type AnnotationTool, type AnnotationStroke, type AnnotationEvent } from './AnnotationLayer'

interface Props {
  deviceId:   string
  deviceName: string
  popout?:    boolean
  sessionTicket?: string
  sessionResumeKey?: string
  sessionAccess?: '' | 'view' | 'control' | 'files'
}

// 3.9.0 — رسائل التحكم التي لا تُرسل من جلسة «عرض فقط» (السيرفر يرفضها أيضاً).
const SESSION_CONTROL_TYPES = new Set([
  'screen:mouse_event', 'screen:key_event', 'screen:clipboard_write', 'screen:clipboard_read',
  'screen:privacy', 'screen:control_request', 'screen:rotate', 'screen:rotate_auto',
  'screen:brightness', 'screen:audio_control', 'screen:set_quality', 'screen:set_monitor',
  'screen:clipboard_sync_enable', 'screen:clipboard_sync_direction', 'screen:clipboard_sync_reverse', 'screen:clipboard_local',
])

type Status          = 'connecting' | 'streaming' | 'error' | 'unavailable' | 'disconnected'
type PermissionState = 'idle' | 'requesting' | 'granted'

interface ClipboardSyncState {
  enabled: boolean
  direction: 'to-device' | 'to-viewer'
  sent: number
  received: number
  blocked: number
  duplicates: number
  lastLen: number
  lastAt: number
  agentWatching: boolean
  lastHash: string
  lastReason: string
}

interface MonitorInfo {
  id: number; x: number; y: number
  width: number; height: number
  primary: boolean; name: string
}

interface QualityPreset {
  id: string; labelKey: TKey; fps: number; quality: number; maxWidth: number
}

interface ChatMessage {
  text:   string
  sender: 'viewer' | 'host'
  ts:     number
}

interface RecordingMeta {
  sessionId:   string
  frameCount:  number
  durationSec: number
  totalBytes:  number
  active:      boolean
}

// maxWidth controls the agent-side resize — smaller = less bandwidth + faster encode
const QUALITY_PRESETS: QualityPreset[] = [
  { id: 'saver',    labelKey: 'viewer_q_saver',     fps: 12, quality: 55, maxWidth: 1280 },
  { id: 'balanced', labelKey: 'viewer_q_balanced',  fps: 20, quality: 72, maxWidth: 1920 },
  { id: 'high',     labelKey: 'viewer_q_high',      fps: 25, quality: 78, maxWidth: 1920 },
  { id: 'best',     labelKey: 'viewer_q_excellent', fps: 30, quality: 72, maxWidth: 1920 },
  { id: 'smooth',   labelKey: 'viewer_q_smooth',    fps: 30, quality: 60, maxWidth: 1600 }
]

const IDLE_TIMEOUT_MS = 5 * 60 * 1000

function fmtBytes(bytes: number): string {
  if (bytes < 1024)       return `${bytes}B/s`
  if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(1)}KB/s`
  return `${(bytes/1024/1024).toFixed(2)}MB/s`
}

export function ScreenViewer({ deviceId, deviceName, popout = false, sessionTicket, sessionResumeKey, sessionAccess }: Props) {
  const tr = useT()
  const { token, user } = useAuthStore()
  // الوضع العادي: بلا تذكرة. وضع الجلسة: التذكرة تأتي من الرابط وتُستخدم بدل JWT.
  const ticketMode = !!(sessionTicket || sessionResumeKey)
  const viewOnly = ticketMode && sessionAccess !== 'control'
  // 3.9.3 — جلسة أُنشئت بـaccess=control: الموافقة تمّت عند قبول الجلسة، فلا نطلب
  // موافقة ثانية (كانت البوابة تبقى مغلقة فتُسقط كل نقرة/حركة في نافذة الجلسة).
  useEffect(() => {
    if (ticketMode && sessionAccess === 'control') {
      setControlEnabled(true)
      setKeyboardMode(true)
    }
  }, [ticketMode, sessionAccess])
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const wsRef         = useRef<WebSocket | null>(null)
  const imgRef        = useRef<HTMLImageElement>(new Image())
  const containerRef  = useRef<HTMLDivElement>(null)
  const canvasAreaRef = useRef<HTMLDivElement>(null)
  const startedRef    = useRef(false)   // mirror of `started` for event handlers

  // ── Streaming ─────────────────────────────────────────────────────────────
  const [status,         setStatus]         = useState<Status>('connecting')
  const [errorMsg,       setErrorMsg]       = useState('')
  const [fps,            setFps]            = useState(0)
  const [frameCount,     setFrameCount]     = useState(0)
  const [resolution,     setResolution]     = useState({ w: 0, h: 0 })
  const [latency,        setLatency]        = useState(-1)
  const [viewerCount,    setViewerCount]    = useState(1)

  // ── UI ────────────────────────────────────────────────────────────────────
  const [fullscreen,     setFullscreen]     = useState(!!popout)
  // v3.8.11 — the bar floats over the image, so it must not stay: it auto-hides and
  // comes back on hover, which leaves the desktop edge-to-edge and unobstructed.
  const [pinned,         setPinned]         = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [showSettings,   setShowSettings]   = useState(false)
  const [showMonitors,   setShowMonitors]   = useState(false)
  const [showClipboard,  setShowClipboard]  = useState(false)
  const [showHint,       setShowHint]       = useState(false)
  const [idleWarning,    setIdleWarning]    = useState(false)

  // v3.8.0 — how the remote image fills the viewport. The canvas used to keep
  // its intrinsic pixel size and only be capped by max-w/max-h, so a 1600x900
  // stream sat in the middle of a bigger screen with black bands all around.
  //   fit    = largest size that keeps the aspect ratio (no cropping)
  //   fill   = cover the viewport (no black edges at any aspect, crops overflow)
  //   actual = 1:1 pixels
  // v3.8.14 - the standalone window opens edge-to-edge: with 'fit' a maximised
  // popout on a differently-shaped screen showed black bands. 'fill' covers the
  // viewport and crops the overflow; the user can still pick 'fit' per device.
  const [fitMode,        setFitMode]        = useState<'fit' | 'fill' | 'actual'>(() => {
    try {
      const v = localStorage.getItem('airemote.screen.fit')
      return (v === 'fill' || v === 'actual' || v === 'fit') ? v : (popout ? 'fill' : 'fit')
    } catch { return popout ? 'fill' : 'fit' }
  })
  const [canvasBox,      setCanvasBox]      = useState<{ w: number; h: number } | null>(null)
  // 3.9.4 — قياس منطقة العرض نفسها، لأن «ملاءمة» تحتاج نسبة أبعاد حقيقية لا شدّاً.
  const [areaSize,       setAreaSize]       = useState({ w: 0, h: 0 })
  // v3.8.24 - the remote machine's own display modes (Windows), so the desktop can be
  // switched to the shape of this window instead of being cropped or letterboxed.
  const [deviceModes,    setDeviceModes]    = useState<string[]>([])
  const [deviceRes,      setDeviceRes]      = useState('')
  const [resBusy,        setResBusy]        = useState(false)
  const [popoutHint,     setPopoutHint]     = useState(!!popout)

  // ── Control ───────────────────────────────────────────────────────────────
  const [preset,          setPreset]          = useState<QualityPreset>(QUALITY_PRESETS[1])
  const [qualityPos,      setQualityPos]      = useState<{ top: number; left: number } | null>(null)
  const qualityBtnRef = useRef<HTMLButtonElement>(null)
  const [controlEnabled,  setControlEnabled]  = useState(false)
  const [pwModal,         setPwModal]         = useState(false)
  const [pwInput,         setPwInput]         = useState('')
  const [pwBusy,          setPwBusy]          = useState(false)
  const [pwError,         setPwError]         = useState('')
  const [keyboardMode,    setKeyboardMode]    = useState(false)
  const [privacyOn,       setPrivacyOn]       = useState(false)
  const [recording,       setRecording]       = useState(false)
  const [audioEnabled,    setAudioEnabled]    = useState(false)
  const [audioNotice,     setAudioNotice]     = useState<string | null>(null)
  const [autoRotate,      setAutoRotate]      = useState(true)
  const [rotateNotice,    setRotateNotice]    = useState<string | null>(null)
  const [brightness,      setBrightness]      = useState(255)
  const [showBrightness,  setShowBrightness]  = useState(false)
  const [recDuration,     setRecDuration]     = useState(0)
  const [monitors,        setMonitors]        = useState<MonitorInfo[]>([])
  const [selectedMonitor, setSelectedMonitor] = useState(0)
  const [clipboardText,   setClipboardText]   = useState('')
  // v3.8.36 (R8) — one-way clipboard sync state, mirrored from the server.
  const [clipSync,        setClipSync]        = useState<ClipboardSyncState>({
    enabled: false, direction: 'to-device', sent: 0, received: 0, blocked: 0,
    duplicates: 0, lastLen: 0, lastAt: 0, agentWatching: false, lastHash: '', lastReason: ''
  })
  const clipWatchStopRef = useRef<null | (() => void)>(null)
  // v3.8.37 (R8.2) — laser / annotations, shared with every viewer of this session
  const [annoTool,    setAnnoTool]    = useState<AnnotationTool>('off')
  const [annoColor,   setAnnoColor]   = useState('#f43f5e')
  const [annoStrokes, setAnnoStrokes] = useState<AnnotationStroke[]>([])
  const [showAnno,    setShowAnno]    = useState(false)
  // v3.8.38 (R8.3) — watermark: who is watching this stream, refreshed every 30s.
  const [wmOn, setWmOn] = useState<boolean>(() => {
    try { return localStorage.getItem('airemote.screen.watermark') !== '0' } catch { return true }
  })
  const [wmClock, setWmClock] = useState<string>(() => new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))

  // ── v3.0.0 state ──────────────────────────────────────────────────────────
  const [permissionState, setPermissionState] = useState<PermissionState>('idle')
  const [dragOver,        setDragOver]        = useState(false)
  const [uploadProgress,  setUploadProgress]  = useState<number | null>(null)
  const [uploadFileName,  setUploadFileName]  = useState('')
  const [adaptiveMode,    setAdaptiveMode]    = useState(false)

  // ── T006: In-session chat ─────────────────────────────────────────────────
  const [chatOpen,     setChatOpen]     = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput,    setChatInput]    = useState('')
  const [unreadChat,   setUnreadChat]   = useState(0)

  // ── T008: Server-side recording ───────────────────────────────────────────
  const [svrRecording, setSvrRecording] = useState(false)
  const [svrRecMeta,   setSvrRecMeta]   = useState<RecordingMeta | null>(null)

  // ── Cursor overlay ────────────────────────────────────────────────────────
  const [cursorPos,     setCursorPos]     = useState({ x: -100, y: -100 })
  const [cursorVisible, setCursorVisible] = useState(false)
  const [screenLocked,  setScreenLocked]  = useState(false)
  const [screenLockSecure, setScreenLockSecure] = useState(false)
  // 3.9.4 — رسالة الحالة (جهاز مقفل/بث محمي) تختفي تلقائياً بدل أن تظل فوق الصورة.
  const [lockNoticeVisible, setLockNoticeVisible] = useState(false)
  useEffect(() => {
    if (!screenLocked) { setLockNoticeVisible(false); return }
    setLockNoticeVisible(true)
    const t = setTimeout(() => setLockNoticeVisible(false), 6000)
    return () => clearTimeout(t)
  }, [screenLocked])

  // v3.4.3 — Android devices: the stream has no built-in cursor → show the overlay
  const [remoteIsAndroid, setRemoteIsAndroid] = useState(false)
  useEffect(() => {
    let live = true
    api.get('/api/devices/' + deviceId)
      .then(r => { if (live) setRemoteIsAndroid(String((r.data && r.data.info && r.data.info.platform) || '').toLowerCase().includes('android')) })
      .catch(() => {})
    return () => { live = false }
  }, [deviceId])

  // ── T001: Bandwidth meter ─────────────────────────────────────────────────
  const [bwDisplay,   setBwDisplay]   = useState(0)   // bytes/sec
  const [frameStats,  setFrameStats]  = useState({ keyframes: 0, total: 0 })

  // ── Start gate — user must press "Start" before any WS connection opens ───
  // Persist per-device: auto-restart if the user was streaming before leaving
  const sessionKey = `screen:active:${deviceId}`
  const [started, setStarted] = useState(() => popout || sessionStorage.getItem(sessionKey) === '1')

  // ── Refs ──────────────────────────────────────────────────────────────────
  const fpsCountRef        = useRef(0)
  const statsTotalRef      = useRef(0)
  const statsKeyRef        = useRef(0)
  const fpsTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const pingTimerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSeqRef         = useRef(-1)
  const mediaRecRef        = useRef<MediaRecorder | null>(null)
  const audioElRef         = useRef<HTMLAudioElement | null>(null)
  const audioMsRef         = useRef<MediaSource | null>(null)
  const audioSbRef         = useRef<SourceBuffer | null>(null)
  const audioQueueRef      = useRef<ArrayBuffer[]>([])
  const pcmCtxRef          = useRef<AudioContext | null>(null)
  const pcmDestRef         = useRef<MediaStreamAudioDestinationNode | null>(null)
  const pcmGainRef         = useRef<GainNode | null>(null)
  const pcmNextRef         = useRef(0)
  const recChunksRef       = useRef<Blob[]>([])
  const recTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const recStartRef        = useRef(0)
  const idleTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moveThrottleRef    = useRef(0)
  const localCursorRef     = useRef<HTMLDivElement | null>(null)
  const cursorIdleRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const permissionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pwActiveRef        = useRef(false)
  const presetRef          = useRef(preset)
  const popoutFitOrientationRef = useRef('')
  const selectedMonRef     = useRef(selectedMonitor)
  const connectIdRef       = useRef(0)
  const controlsHideRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cursorTrackRef     = useRef(0)   // 3.9.4 — throttle for the remote-cursor overlay
  const chatEndRef         = useRef<HTMLDivElement>(null)
  const bwBytesRef         = useRef(0)
  const bwTimerRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Monotonically increasing draw-call counter — used to discard stale
  // createImageBitmap promises that complete out-of-order (race condition fix).
  const drawSeqRef         = useRef(0)
  const reconnectCountRef  = useRef(0)
  const intentionalCloseRef = useRef(false)
  const lastFrameAtRef     = useRef(0)
  const staleTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  // 1-in-flight decode guard: skip incoming frames while a decode is running.
  // This prevents the drawId race where 30fps arrivals stack up faster than
  // createImageBitmap resolves, causing every frame to be discarded as stale.
  const decodingRef        = useRef(false)

  // Keep startedRef in sync so event handlers (visibilitychange) can read it
  useEffect(() => { startedRef.current = started }, [started])
  // Persist streaming state in sessionStorage so it survives navigation / HMR
  useEffect(() => {
    if (started) sessionStorage.setItem(sessionKey, '1')
    else         sessionStorage.removeItem(sessionKey)
  }, [started, sessionKey])

  // The standalone window must follow the remote screen through portrait and
  // landscape. Resizing only for the first frame leaves the old window shape
  // in place after a phone rotation and makes the stream look tiny.
  useEffect(() => {
    if (!popout || !resolution.w || !resolution.h) return
    const orientation = resolution.w > resolution.h ? 'landscape' : 'portrait'
    if (popoutFitOrientationRef.current === orientation) return
    popoutFitOrientationRef.current = orientation
    if (!window.opener) return

    const timer = window.setTimeout(() => {
      try {
        const chromeW = Math.max(0, window.outerWidth - window.innerWidth)
        const chromeH = Math.max(0, window.outerHeight - window.innerHeight)
        const availW  = Math.max(640, (window.screen.availWidth || 1440) - 40)
        const availH  = Math.max(480, (window.screen.availHeight || 900) - 80)
        const ratio   = resolution.w / resolution.h
        let innerH    = Math.min(availH, orientation === 'portrait' ? 980 : 820)
        let innerW    = innerH * ratio
        if (innerW > availW) {
          innerW = availW
          innerH = innerW / ratio
        }
        const targetW = Math.max(360, Math.round(innerW + chromeW))
        const targetH = Math.max(320, Math.round(innerH + chromeH))
        window.resizeTo(targetW, targetH)
        const left = Math.max(0, Math.round(((window.screen.availWidth || targetW) - targetW) / 2))
        const top  = Math.max(0, Math.round(((window.screen.availHeight || targetH) - targetH) / 2))
        window.moveTo(left, top)
      } catch {}
    }, 120)
    return () => window.clearTimeout(timer)
  }, [popout, resolution.w, resolution.h])

  // v3.8.0 — scale the canvas to the viewport (edge-free fullscreen).
  useEffect(() => {
    if (!started) { setCanvasBox(null); return }
    const area = canvasAreaRef.current
    if (!area || !resolution.w || !resolution.h) return
    const compute = () => {
      // v3.8.9 - the measured box must exclude padding, otherwise the canvas is
      // taller than the visible area and overflow-hidden clips the bottom of the
      // remote desktop (the 'not the whole screen' symptom in the popout).
      const cs = getComputedStyle(area)
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
      const availW = Math.max(1, area.clientWidth - padX)
      const availH = Math.max(1, area.clientHeight - padY)
      if (!availW || !availH) return
      const iw = resolution.w, ih = resolution.h
      let w = iw, h = ih
      if (fitMode !== 'actual') {
        const scale = fitMode === 'fill'
          ? Math.max(availW / iw, availH / ih)
          : Math.min(availW / iw, availH / ih)
        w = iw * scale; h = ih * scale
      }
      const nw = Math.max(1, Math.round(w)), nh = Math.max(1, Math.round(h))
      setCanvasBox((prev) => (prev && prev.w === nw && prev.h === nh) ? prev : { w: nw, h: nh })
    }
    compute()
    let ro: ResizeObserver | null = null
    try { ro = new ResizeObserver(compute); ro.observe(area) } catch {}
    window.addEventListener('resize', compute)
    return () => {
      try { ro?.disconnect() } catch {}
      window.removeEventListener('resize', compute)
    }
  }, [started, resolution.w, resolution.h, fitMode])

  const cycleFit = useCallback(() => {
    setFitMode((m) => {
      const next = m === 'fit' ? 'fill' : m === 'fill' ? 'actual' : 'fit'
      try { localStorage.setItem('airemote.screen.fit', next) } catch {}
      return next
    })
  }, [])



  // The help toast on entering the standalone window fades out on its own.
  useEffect(() => {
    if (!popout || !popoutHint) return
    const timer = window.setTimeout(() => setPopoutHint(false), 4200)
    return () => window.clearTimeout(timer)
  }, [popout, popoutHint])

  useEffect(() => { presetRef.current     = preset        }, [preset])
  useEffect(() => { selectedMonRef.current = selectedMonitor }, [selectedMonitor])

  // ── Auto-scroll chat ──────────────────────────────────────────────────────
  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatOpen])

  // ── FPS counter ───────────────────────────────────────────────────────────
  const startFpsCounter = useCallback(() => {
    if (fpsTimerRef.current) return
    fpsTimerRef.current = setInterval(() => {
      setFps(fpsCountRef.current)
      fpsCountRef.current = 0
      // one batched update per second instead of two React renders per frame
      setFrameStats({ total: statsTotalRef.current, keyframes: statsKeyRef.current })
      setFrameCount(statsTotalRef.current)
    }, 1000)
  }, [])

  // ── Bandwidth counter ─────────────────────────────────────────────────────
  const startBwCounter = useCallback(() => {
    if (bwTimerRef.current) return
    bwTimerRef.current = setInterval(() => {
      setBwDisplay(bwBytesRef.current)
      bwBytesRef.current = 0
    }, 1000)
  }, [])

  // ── Stale-frame watchdog ──────────────────────────────────────────────────
  // If no frame arrives within 8 s while we think we're streaming, the agent
  // has silently stopped sending (e.g. PS crash, proxy drop).  Reconnect.
  const startStaleWatchdog = useCallback((myId: number) => {
    if (staleTimerRef.current) clearInterval(staleTimerRef.current)
    lastFrameAtRef.current = Date.now()
    staleTimerRef.current = setInterval(() => {
      if (intentionalCloseRef.current) return
      if (connectIdRef.current !== myId) return
      const elapsed = Date.now() - lastFrameAtRef.current
      if (elapsed > 20_000) {
        console.warn(`[screen] stale: no frame for ${Math.round(elapsed / 1000)}s — reconnecting`)
        if (staleTimerRef.current) { clearInterval(staleTimerRef.current); staleTimerRef.current = null }
        wsRef.current?.close()
      }
    }, 2_000)
  }, [])

  // ── Draw frame (createImageBitmap — faster decoding, no layout thrash) ───
  // Each call gets a unique drawId; the .then() callback discards its result if
  // a newer frame has already started decoding (prevents out-of-order redraws).
  const drawFrame = useCallback((base64: string, width: number, height: number) => {
    if (decodingRef.current) return  // skip — previous frame still decoding
    const canvas = canvasRef.current; if (!canvas) return
    const ctx    = canvas.getContext('2d'); if (!ctx) return
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height
      setResolution({ w: width, h: height })
    }
    const byteStr = atob(base64)
    const bytes   = new Uint8Array(byteStr.length)
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'image/jpeg' })
    decodingRef.current = true
    createImageBitmap(blob).then(bmp => {
      decodingRef.current = false
      ctx.drawImage(bmp, 0, 0)
      bmp.close()
      fpsCountRef.current++
      setFrameCount(c => c + 1)
    }).catch(() => {
      decodingRef.current = false
      const img = imgRef.current
      img.onload = () => { ctx.drawImage(img, 0, 0); fpsCountRef.current++; setFrameCount(c => c + 1) }
      img.src = `data:image/jpeg;base64,${base64}`
    })
  }, [])

  // ── Draw delta frame (partial update — only the changed region) ───────────
  // The JPEG covers exactly (delta.w × delta.h) pixels. We stamp it at
  // (delta.x, delta.y) on the existing canvas without resizing or clearing.
  const drawDeltaFrame = useCallback((
    base64: string,
    delta:  { x: number; y: number; w: number; h: number }
  ) => {
    if (decodingRef.current) return  // skip — previous frame still decoding
    const canvas = canvasRef.current; if (!canvas) return
    const ctx    = canvas.getContext('2d'); if (!ctx) return
    const byteStr = atob(base64)
    const bytes   = new Uint8Array(byteStr.length)
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'image/jpeg' })
    decodingRef.current = true
    createImageBitmap(blob).then(bmp => {
      decodingRef.current = false
      // Stamp the cropped region at its origin in full-screen coordinates
      ctx.drawImage(bmp, delta.x, delta.y)
      bmp.close()
      fpsCountRef.current++
      setFrameCount(c => c + 1)
    }).catch(() => { decodingRef.current = false })
  }, [])

  // ── Send WS ───────────────────────────────────────────────────────────────
  const sendWs = useCallback((msg: object) => {
    if (viewOnly && SESSION_CONTROL_TYPES.has(String((msg as { type?: string }).type || ''))) return
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg))
  }, [viewOnly])

  // Ctrl+Alt+Shift+V reverses the clipboard direction. It is captured before the
  // remote-keyboard handler so the chord never reaches the remote machine.
  useEffect(() => {
    const onReverse = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey && ev.altKey && ev.shiftKey)) return
      if (String(ev.key).toLowerCase() !== 'v') return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      sendWs({ type: 'screen:clipboard_sync_reverse', payload: {} })
    }
    window.addEventListener('keydown', onReverse, { capture: true })
    return () => window.removeEventListener('keydown', onReverse, { capture: true })
  }, [sendWs])

  // Desktop shell only: mirror local clipboard changes while pushing to the device.
  useEffect(() => {
    const bridge = (window as unknown as { airemote?: { clipboard?: { watch?: (cb: (t: string) => void) => () => void } } }).airemote?.clipboard
    const stop = () => { try { clipWatchStopRef.current?.() } catch {} ; clipWatchStopRef.current = null }
    if (!bridge?.watch || !clipSync.enabled || clipSync.direction !== 'to-device') { stop(); return }
    clipWatchStopRef.current = bridge.watch((value: string) => {
      if (value) sendWs({ type: 'screen:clipboard_local', payload: { text: value } })
    })
    return stop
  }, [clipSync.enabled, clipSync.direction, sendWs])

  // ── Idle reset ────────────────────────────────────────────────────────────
  // Idle overlay is intentionally disabled: an operator watching a remote
  // screen must never be covered by a 5-minute inactivity message.
  const resetIdle = useCallback(() => {
    setIdleWarning(false)
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null }
  }, [])


  // ── WebSocket connect ─────────────────────────────────────────────────────
  const connect = useCallback(async (p: QualityPreset, monitorId = 0) => {
    const myId = ++connectIdRef.current
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null }
    setStatus('connecting'); setErrorMsg(''); lastSeqRef.current = -1
    setAnnoStrokes([])
    setViewerCount(1)
    setControlEnabled(false); setPermissionState('idle')
    setAudioEnabled(false)
    if (permissionTimerRef.current) { clearTimeout(permissionTimerRef.current); permissionTimerRef.current = null }

    let authParam: Record<string, string> = {}
    try {
      const r = await fetch('/api/auth/ws-ticket', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (r.ok) {
        const { ticket } = await r.json()
        authParam = { ticket }
      } else {
        authParam = { token: token || '' }
      }
    } catch {
      authParam = { token: token || '' }
    }

    if (ticketMode) {
      // 3.9.1 — التذكرة للفتح الأول فقط، ومفتاح الإعادة (rk) يبقى صالحاً بعد إعادة التحميل.
      // نرسل الاثنين: السيرفر يفضّل التذكرة ثم يسقط إلى المفتاح بدل ticket_reused.
      authParam = {}
      if (sessionTicket) authParam.rt = sessionTicket
      if (sessionResumeKey) authParam.rk = sessionResumeKey
    }
    if (myId !== connectIdRef.current) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const params   = new URLSearchParams({ ...authParam, deviceId, binary: '1', fps: String(p.fps), quality: String(p.quality), maxWidth: String(p.maxWidth) })
    const ws       = new WebSocket(`${protocol}//${window.location.host}/screen?${params}`)
    ws.binaryType  = 'arraybuffer'   // receive binary frames as ArrayBuffer, not Blob
    wsRef.current  = ws

    ws.onopen = () => {
      // 3.9.1 — بعد قبول التذكرة أزل rt من العنوان: أي إعادة تحميل تستخدم rk
      // (وإلا عاد المستخدم بتذكرة مستهلكة). الوصول يبقى محكوماً بمفتاح الجلسة.
      if (ticketMode && sessionTicket) {
        try {
          const u = new URL(window.location.href)
          if (u.searchParams.has('rt')) { u.searchParams.delete('rt'); window.history.replaceState({}, '', u.toString()) }
        } catch {}
      }
      setTimeout(() => sendWs({ type: 'screen:get_monitors', payload: {} }), 800)
      setTimeout(() => sendWs({ type: 'screen:clipboard_sync_state', payload: {} }), 600)
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      pingTimerRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN)
          wsRef.current.send(JSON.stringify({ type: 'screen:ping', payload: { ts: Date.now() } }))
      }, 3000)
      startStaleWatchdog(myId)
    }

    ws.onmessage = (ev) => {
      // ── Binary frame: v3.1+ server sends raw JPEG with 13-byte header ─────
      // Header layout: [width:4][height:4][seq:4][flags:1][JPEG bytes...]
      // No JSON.parse, no atob(), no Uint8Array conversion — direct Blob path.
      if (ev.data instanceof ArrayBuffer) {
        const buf = ev.data
        if (buf.byteLength < 13) return
        const view   = new DataView(buf)
        const width  = view.getUint32(0)
        const height = view.getUint32(4)
        const seq    = view.getUint32(8)
        const flags  = view.getUint8(12)
        if (seq !== 0 && seq <= lastSeqRef.current) return
        lastSeqRef.current = seq
        if (reconnectCountRef.current > 0) reconnectCountRef.current = 0
        lastFrameAtRef.current = Date.now()
        setStatus('streaming'); startFpsCounter(); startBwCounter()
        bwBytesRef.current += buf.byteLength - 13
        statsTotalRef.current++
        if (flags & 1) statsKeyRef.current++
        if (decodingRef.current) return   // skip — previous frame still decoding
        // v3.3.2 — delta frames (flags bit1): [x:4][y:4] then the JPEG of just the changed region
        const isDelta = (flags & 2) !== 0
        const dx = isDelta ? view.getUint32(13) : 0
        const dy = isDelta ? view.getUint32(17) : 0
        // v3.8.2 - Android agents encode WebP (flags bit2); Windows agents send JPEG
        const mime = (flags & 4) !== 0 ? 'image/webp' : 'image/jpeg'
        const jpeg = new Blob([buf.slice(isDelta ? 21 : 13)], { type: mime })
        decodingRef.current = true
        createImageBitmap(jpeg).then(bmp => {
          decodingRef.current = false
          const canvas = canvasRef.current; if (!canvas) { bmp.close(); return }
          const ctx    = canvas.getContext('2d'); if (!ctx) { bmp.close(); return }
          // IMPORTANT: for a delta frame width/height are the size of the
          // changed rectangle, not the full screen. Resizing the canvas from
          // that header makes the rest of the screen black (the cursor-only
          // symptom on Windows). Only full frames may resize the backing store.
          if (!isDelta) {
            if (canvas.width !== width || canvas.height !== height) {
              canvas.width = width; canvas.height = height
              setResolution({ w: width, h: height })
            }
            ctx.drawImage(bmp, 0, 0)
          } else if (canvas.width > 0 && canvas.height > 0) {
            ctx.drawImage(bmp, dx, dy)
          }
          bmp.close()
          fpsCountRef.current++
        }).catch(() => { decodingRef.current = false })
        return
      }

      // ── JSON text message (control / status) ──────────────────────────────
      try {
        const msg = JSON.parse(ev.data as string)
        switch (msg.type) {
          case 'screen:frame': {
            // JSON frame path: legacy agents + headless agent delta frames
            if (reconnectCountRef.current > 0) reconnectCountRef.current = 0
            lastFrameAtRef.current = Date.now()
            setStatus('streaming'); startFpsCounter(); startBwCounter()
            const { data, width, height, seq, keyframe, deltaRegion } = msg.payload
            if (seq <= lastSeqRef.current && seq !== 0) break
            lastSeqRef.current = seq
            if (deltaRegion) {
              // Partial update: stamp only the changed region on the existing canvas
              drawDeltaFrame(data, deltaRegion)
            } else {
              drawFrame(data, width, height)
            }
            bwBytesRef.current += Math.ceil((data?.length ?? 0) * 3 / 4)
            statsTotalRef.current++
            if (keyframe) statsKeyRef.current++
            break
          }
          case 'screen:audio':
            feedAudio(msg.payload?.data || '', msg.payload?.format, msg.payload?.sampleRate)
            break
          case 'screen:audio_status':
            setAudioEnabled(!!msg.payload?.enabled)
            if (msg.payload && msg.payload.ok === false && msg.payload.reason) {
              setAudioNotice(String(msg.payload.reason))
              setTimeout(() => setAudioNotice(null), 4000)
            }
            break
          case 'screen:rotate_status': {
            setAutoRotate(!!msg.payload?.enabled)
            if (msg.payload?.ok === false && msg.payload?.reason) {
              const reason = String(msg.payload.reason)
              setRotateNotice(reason === 'write-settings-not-granted'
                ? tr('viewer_rotate_grant')
                : reason)
              setTimeout(() => setRotateNotice(null), 6000)
            }
            break
          }
          case 'screen:brightness_status':
            setBrightness(Math.max(0, Math.min(255, Number(msg.payload?.value ?? 255))))
            break
          case 'screen:rotate_result':
            if (msg.payload?.ok === false) {
              const reason = String(msg.payload?.reason || '')
              setRotateNotice(reason === 'write-settings-not-granted'
                ? tr('viewer_rotate_grant_short')
                : reason || tr('viewer_rotate_failed'))
              setTimeout(() => setRotateNotice(null), 6000)
            } else {
              setRotateNotice(null)
            }
            break
          case 'screen:error':
            setStatus('error'); setErrorMsg(msg.payload?.message || tr('viewer_unknown_error')); break
          case 'screen:unavailable':
            setStatus('unavailable'); setErrorMsg(msg.payload?.message || tr('viewer_share_unavailable')); break
          case 'screen:closed':
            setStatus('disconnected')
            // Auto-reconnect unless the user explicitly clicked Stop
            if (!intentionalCloseRef.current) {
              reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null
                if (!intentionalCloseRef.current) connect(presetRef.current, selectedMonRef.current)
              }, 2000)
            }
            break
          case 'screen:resolutions': {
            const modes = Array.isArray(msg.payload?.modes) ? msg.payload.modes : []
            setDeviceModes(modes)
            if (msg.payload?.current) setDeviceRes(String(msg.payload.current))
            setResBusy(false)
            break
          }
          case 'screen:resolution_applied': {
            if (msg.payload?.ok && msg.payload?.current) setDeviceRes(String(msg.payload.current))
            setResBusy(false)
            break
          }
          case 'screen:monitors':
            setMonitors(msg.payload?.monitors || []); break
          case 'screen:state':
            setScreenLocked(!!msg.payload?.keyguardLocked)
            setScreenLockSecure(!!msg.payload?.keyguardSecure)
            break
          case 'screen:clipboard':
            setClipboardText(msg.payload?.text || ''); setShowClipboard(true); break
          case 'screen:annotate':
            applyAnnoEvent(msg.payload as AnnotationEvent); break
          case 'screen:clipboard_sync':
            setClipSync(prev => ({ ...prev, ...(msg.payload || {}) })); break
          case 'screen:clipboard_apply': {
            const incoming = String(msg.payload?.text ?? '')
            if (incoming) { setClipboardText(incoming); void applyLocalClipboard(incoming) }
            break
          }
          case 'screen:pong':
            // Pong proves the relay is alive even when the remote screen is
            // static and no video frames are produced for a while.
            lastFrameAtRef.current = Date.now()
            setLatency(Date.now() - (msg.payload?.clientTs ?? Date.now())); break
          case 'screen:viewer_count':
            setViewerCount(msg.payload?.count ?? 1); break

          // ── v3.0.0 Permission responses ──────────────────────────────────
          case 'screen:control_granted':
            if (permissionTimerRef.current) { clearTimeout(permissionTimerRef.current); permissionTimerRef.current = null }
            setPermissionState('granted')
            setControlEnabled(true); setKeyboardMode(true); setShowHint(true)
            if (pwActiveRef.current) { pwActiveRef.current = false; setPwModal(false); setPwBusy(false) }
            setTimeout(() => { setPermissionState('idle'); setShowHint(false) }, 3000)
            break
          case 'screen:control_denied':
            if (permissionTimerRef.current) { clearTimeout(permissionTimerRef.current); permissionTimerRef.current = null }
            setPermissionState('idle')
            setControlEnabled(false); setKeyboardMode(false)
            if (pwActiveRef.current) {
              setPwBusy(false)
              setPwError(msg.payload?.reason === 'bad_password' ? tr('viewer_pw_wrong') : msg.payload?.reason === 'rate_limited' ? tr('viewer_pw_rate_limited') : tr('viewer_pw_denied'))
            }
            break

          // ── T006: In-session chat ─────────────────────────────────────────
          case 'screen:chat_history': {
            const hist = (msg.payload?.messages || []) as ChatMessage[]
            if (Array.isArray(hist) && hist.length) setChatMessages(hist.slice(-200))
            break
          }

          case 'screen:chat': {
            const { text, sender, ts } = msg.payload as ChatMessage
            if (!text) break
            setChatMessages(prev => [...prev.slice(-99), { text, sender: sender || 'host', ts: ts || Date.now() }])
            setChatOpen(prev => {
              if (!prev) setUnreadChat(c => c + 1)
              return prev
            })
            break
          }

          // ── T008: Server-side recording status ────────────────────────────
          case 'screen:record_status': {
            const { recording: rec, meta } = msg.payload as { recording: boolean; meta?: RecordingMeta }
            setSvrRecording(rec)
            if (meta) setSvrRecMeta(meta)
            break
          }
        }
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      if (fpsTimerRef.current)   { clearInterval(fpsTimerRef.current);   fpsTimerRef.current   = null }
      if (pingTimerRef.current)  { clearInterval(pingTimerRef.current);  pingTimerRef.current  = null }
      if (bwTimerRef.current)    { clearInterval(bwTimerRef.current);    bwTimerRef.current    = null }
      if (staleTimerRef.current) { clearInterval(staleTimerRef.current); staleTimerRef.current = null }
      setFps(0); setLatency(-1); setBwDisplay(0)

      // If the close was intentional (component unmount / user stop) or due to a
      // hard error / unavailability, don't reconnect.
      setStatus(s => {
        if (s === 'error' || s === 'unavailable') return s
        return 'disconnected'
      })

      if (!intentionalCloseRef.current && myId === connectIdRef.current) {
        const attempt = reconnectCountRef.current + 1
        // No cap on reconnect attempts — keep trying until intentional stop
        {
          reconnectCountRef.current = attempt
          const delay = Math.min(1500 * attempt, 8_000)
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null
            if (!intentionalCloseRef.current && myId === connectIdRef.current) {
              connect(presetRef.current, selectedMonRef.current)
            }
          }, delay)
        }
      }
    }
    ws.onerror = () => { setStatus('error'); setErrorMsg(tr('viewer_ws_failed')) }
  }, [deviceId, token, ticketMode, sessionTicket, sessionResumeKey, drawFrame, startFpsCounter, startBwCounter, sendWs, startStaleWatchdog])

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return   // wait for user to press "Start"
    intentionalCloseRef.current = false
    reconnectCountRef.current   = 0
    connect(preset, 0)
    return () => {
      intentionalCloseRef.current = true   // suppress auto-reconnect on cleanup
      if (reconnectTimerRef.current)  { clearTimeout(reconnectTimerRef.current);  reconnectTimerRef.current  = null }
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null }
      if (fpsTimerRef.current)        clearInterval(fpsTimerRef.current)
      if (pingTimerRef.current)       clearInterval(pingTimerRef.current)
      if (recTimerRef.current)        clearInterval(recTimerRef.current)
      if (idleTimerRef.current)       clearTimeout(idleTimerRef.current)
      if (permissionTimerRef.current) clearTimeout(permissionTimerRef.current)
      if (bwTimerRef.current)         clearInterval(bwTimerRef.current)
      if (staleTimerRef.current)      clearInterval(staleTimerRef.current)
    }
  }, [started]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reconnect on tab focus or network restore ─────────────────────────────
  useEffect(() => {
    const tryReconnect = () => {
      if (!startedRef.current) return
      if (intentionalCloseRef.current) return
      if (wsRef.current?.readyState === WebSocket.OPEN) return
      if (wsRef.current?.readyState === WebSocket.CONNECTING) return
      if (reconnectTimerRef.current) return   // already scheduled
      reconnectCountRef.current = 0
      connect(presetRef.current, selectedMonRef.current)
    }
    const onVisible = () => { if (!document.hidden) tryReconnect() }
    const onOnline  = () => tryReconnect()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [connect])

  // ── Fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const wc = (window as any).airemote?.windowCtl
    if (popout && wc && typeof wc.setFullscreen === 'function') {
      wc.setFullscreen(fullscreen)
      return
    }
    const el = containerRef.current; if (!el) return
    if (fullscreen) el.requestFullscreen?.()
    else if (document.fullscreenElement) document.exitFullscreen?.()
  }, [fullscreen, popout])

  // v3.5 — immersive mode. In the standalone window the toolbar must NOT
  // reappear when the pointer moves over the remote screen; it only opens
  // when the pointer is over the small handle or the toolbar itself.
  const scheduleControlsHide = useCallback((ms = 2500) => {
    if (controlsHideRef.current) clearTimeout(controlsHideRef.current)
    controlsHideRef.current = setTimeout(() => {
      controlsHideRef.current = null
      setControlsVisible(false)
    }, ms)
  }, [])
  const revealControls = useCallback(() => {
    setControlsVisible(true)
    if (!pinned) scheduleControlsHide()
  }, [pinned, scheduleControlsHide])
  useEffect(() => {
    if (!fullscreen && !popout) { setControlsVisible(true); return }
    if (popout) {
      revealControls()
      return () => { if (controlsHideRef.current) { clearTimeout(controlsHideRef.current); controlsHideRef.current = null } }
    }
    let t: ReturnType<typeof setTimeout> | null = null
    const show = () => {
      setControlsVisible(true)
      if (t) clearTimeout(t)
      t = setTimeout(() => setControlsVisible(false), 2500)
    }
    show()
    window.addEventListener('mousemove', show)
    window.addEventListener('keydown', show)
    return () => {
      if (t) clearTimeout(t)
      window.removeEventListener('mousemove', show)
      window.removeEventListener('keydown', show)
    }
  }, [fullscreen, popout, revealControls])
  useEffect(() => {
    if (!pinned) return
    if (controlsHideRef.current) { clearTimeout(controlsHideRef.current); controlsHideRef.current = null }
    setControlsVisible(true)
  }, [pinned])
  useEffect(() => {
    // Only promote to true when the browser actually entered fullscreen;
    // never reset on a null event (Electron may reject the request when the
    // click is not trusted, and we still want the CSS immersive mode).
    const h = () => { if (document.fullscreenElement) setFullscreen(true) }
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  // ── Keyboard capture ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!keyboardMode || !controlEnabled) return

    const getMods = (e: KeyboardEvent) => {
      const m: string[] = []
      if (e.ctrlKey)  m.push('ctrl')
      if (e.altKey)   m.push('alt')
      if (e.shiftKey) m.push('shift')
      if (e.metaKey)  m.push('meta')
      return m.length ? m : undefined
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // v3.5 — do not block local input: the server keyboard and the remote
      // keyboard work simultaneously (the user can keep typing locally).
      resetIdle()
      const mods = getMods(e)
      const hasAccel = !!(mods && mods.some(m => m === 'ctrl' || m === 'alt' || m === 'meta'))
      if (e.key.length === 1 && !hasAccel) {
        // Printable text (incl. Arabic/Unicode): a single semantic "press".
        // Sending down+press together used to duplicate input on every agent.
        sendWs({ type: 'screen:key_event', payload: { type: 'press', key: e.key, modifiers: mods } })
        return
      }
      // Physical keys: modifiers, accelerators (Ctrl+C …) and special keys.
      sendWs({ type: 'screen:key_event', payload: { type: 'down', key: e.key, modifiers: mods } })
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const mods = getMods(e)
      const hasAccel = !!(mods && mods.some(m => m === 'ctrl' || m === 'alt' || m === 'meta'))
      if (e.key.length === 1 && !hasAccel) return // completed by the single 'press'
      sendWs({ type: 'screen:key_event', payload: { type: 'up', key: e.key, modifiers: mods } })
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup',   handleKeyUp,   { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('keyup',   handleKeyUp,   { capture: true })
    }
  }, [keyboardMode, controlEnabled, sendWs, resetIdle])

  // ── Adaptive quality — v3.0.0 ─────────────────────────────────────────────
  useEffect(() => {
    if (!adaptiveMode || status !== 'streaming' || latency < 0) return
    const p = presetRef.current
    // v3.5 — adapt against the preset target (up to 30 fps) instead of ratcheting
    // the preset itself down to 15 fps.
    const target = Math.max(3, Math.min(30, p.fps))
    let newFps = target
    if      (latency > 350) newFps = Math.max(3,  Math.min(target, p.fps - 4))
    else if (latency > 180) newFps = Math.max(5,  Math.min(target, p.fps - 2))
    else if (latency <  70) newFps = Math.min(target, p.fps + 2)
    if (newFps !== p.fps) {
      const adj = { ...p, label: tr('viewer_adaptive_fps', { fps: newFps }), fps: newFps }
      setPreset(adj)
      // Reset seq so frames from the restarted capture loop are not dropped.
      lastSeqRef.current = -1
      sendWs({ type: 'screen:set_quality', payload: { fps: newFps, quality: p.quality, maxWidth: p.maxWidth, monitorId: selectedMonRef.current } })
    }
  }, [latency]) // eslint-disable-line react-hooks/exhaustive-deps

  // 3.9.4 — قبل هذا كانت الحاوية تُقیَّد بالعرض والارتفاع معاً (max-width/max-height)،
  // فيُشدّ الإطار إلى نسبة شاشة المُشاهد: صورة ممدودة وإحداثيات لمس تنزلق.
  useEffect(() => {
    const el = canvasAreaRef.current
    if (!el) return
    const update = () => setAreaSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (ro) ro.observe(el)
    window.addEventListener('resize', update)
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', update) }
  }, [started, fullscreen, popout, pinned])

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const getContentRect = (c: HTMLCanvasElement) => {
    // 3.9.3 — اللوحة تُملأ العنصر (CSS 100%)، فمستطيل العنصر هو المساحة المرسومة بالضبط.
    // حساب letterbox القديم كان يخالف ذلك فتُرسل إحداثيات بعيدة عن اللمسة.
    const r = c.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width || 1, height: r.height || 1 }
  }
  const getPos = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const r = getContentRect(canvasRef.current!)
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }
  const sendMouse = useCallback((type: string, e: ReactMouseEvent<HTMLCanvasElement>, extra?: object) => {
    if (!controlEnabled) return; resetIdle()
    const { x, y } = getPos(e)
    sendWs({ type: 'screen:mouse_event', payload: { type, x, y, button: e.button, ...extra } })
  }, [controlEnabled, sendWs, resetIdle])

  const handleMouseMove = useCallback((e: ReactMouseEvent<HTMLCanvasElement>) => {
    // Always update cursor overlay — position relative to canvas area div
    const area = canvasAreaRef.current
    if (area) {
      const r = area.getBoundingClientRect()
      setCursorPos({ x: e.clientX - r.left, y: e.clientY - r.top })
    }

    if (!controlEnabled) return
    // v3.8.21 - the remote cursor can only move when a frame arrives (8-20 fps), which
    // reads as lag. A local overlay follows the pointer at event rate and hides itself
    // once the pointer rests, so the feel is direct without faking the remote state.
    const dot = localCursorRef.current
    if (dot) {
      const area = canvasAreaRef.current
      const box = area ? area.getBoundingClientRect() : null
      if (box) {
        dot.style.transform = `translate(${e.clientX - box.left}px, ${e.clientY - box.top}px)`
        dot.style.opacity = '1'
      }
      if (cursorIdleRef.current) clearTimeout(cursorIdleRef.current)
      cursorIdleRef.current = setTimeout(() => { if (dot) dot.style.opacity = '0' }, 1200)
    }
    // 60 Hz with the unchanged coalescing guard is smooth without flooding the socket.
    const now = performance.now(); if (now - moveThrottleRef.current < 16) return; moveThrottleRef.current = now
    sendMouse('move', e)
  }, [controlEnabled, sendMouse])

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!controlEnabled) return; e.preventDefault(); resetIdle()
    const canvas = canvasRef.current; if (!canvas) return
    const r = canvas.getBoundingClientRect()
    // 3.9.3 — الوكيل يضرب deltaY في -120، فالقيمة تُرسل «نقرات» لا بكسل: نقرة = ±1.
    const notches = e.deltaY > 0 ? 1 : -1
    sendWs({ type: 'screen:mouse_event', payload: { type: 'scroll', x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, deltaY: notches } })
  }, [controlEnabled, sendWs, resetIdle])

  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    c.addEventListener('wheel', handleWheel, { passive: false })
    return () => c.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── 3.9.3 — تحكم لمس احترافي (Pointer Events) ────────────────────────────
  // نقرة = زر أيسر · ضغط مطوّل 550ms = زر أيمن · سحب = زر أيسر مضغوط ·
  // إصبعان: قرصة = تكبير، تحريك = إزاحة. الماوس يبقى كما هو (hover + أزرار).
  const [viewZoom,   setViewZoom]   = useState(1)
  const [viewPan,    setViewPan]    = useState({ x: 0, y: 0 })
  const [viewOrigin, setViewOrigin] = useState({ x: 0.5, y: 0.5 })
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gestureRef = useRef({
    downX: 0, downY: 0, moved: false, dragging: false, longFired: false,
    longPress: null as ReturnType<typeof setTimeout> | null,
    twoFinger: false, pinchDist: 0, zoomStart: 1, panStart: { x: 0, y: 0 },
    midX: 0, midY: 0,
    tapAt: 0, tapMoved: false, tapMid: { x: 0, y: 0 },
  })

  const clearLongPress = () => {
    const g = gestureRef.current
    if (g.longPress) { clearTimeout(g.longPress); g.longPress = null }
  }

  // 3.9.4 — بعد انتقال 3.9.3 إلى Pointer Events لم يبقَ من يحدّث المؤشّر المرسوم إلا
  // معالج الفأرة القديم (الميت)، فتجمد المؤشّر تحت الإصبع. هنا يُحدَّث لكل نوع مؤشّر،
  // بحدّ 30Hz كي لا يزيد عدد إعادات الرسم أثناء السحب/القرص.
  const trackPointerCursor = (clientX: number, clientY: number) => {
    const area = canvasAreaRef.current
    if (!area) return
    const now = performance.now()
    if (now - cursorTrackRef.current < 33) return
    cursorTrackRef.current = now
    const r = area.getBoundingClientRect()
    setCursorPos({ x: clientX - r.left, y: clientY - r.top })
    const dot = localCursorRef.current
    if (!dot) return
    dot.style.transform = `translate(${clientX - r.left}px, ${clientY - r.top}px)`
    dot.style.opacity = '1'
    if (cursorIdleRef.current) clearTimeout(cursorIdleRef.current)
    cursorIdleRef.current = setTimeout(() => { if (dot) dot.style.opacity = '0' }, 1200)
  }

  const sendMouseAt = (type: string, cx: number, cy: number, button = 0, extra?: object) => {
    if (!controlEnabled) return
    const c = canvasRef.current; if (!c) return
    const r = getContentRect(c)
    const x = (cx - r.left) / r.width
    const y = (cy - r.top) / r.height
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return
    sendWs({ type: 'screen:mouse_event', payload: { type, x, y, button, ...extra } })
  }

  const resetView = () => { setViewZoom(1); setViewPan({ x: 0, y: 0 }); setViewOrigin({ x: 0.5, y: 0.5 }) }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current; if (!c) return
    try { c.setPointerCapture(e.pointerId) } catch {}
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gestureRef.current
    if (!controlEnabled) return
    resetIdle()

    if (pointersRef.current.size === 1) {
      g.downX = e.clientX; g.downY = e.clientY
      g.moved = false; g.dragging = false; g.longFired = false; g.twoFinger = false
      if (e.pointerType === 'touch') {
        clearLongPress()
        g.longPress = setTimeout(() => {
          const gg = gestureRef.current
          gg.longPress = null
          if (gg.moved || gg.dragging) return
          gg.longFired = true
          // ضغط مطوّل = نقرة زر أيمن (قائمة السياق) — سلوك AnyDesk/TeamViewer.
          sendMouseAt('down', gg.downX, gg.downY, 2)
          sendMouseAt('up', gg.downX, gg.downY, 2)
        }, 500)
      }
      return
    }

    if (pointersRef.current.size === 2) {
      clearLongPress()
      if (g.dragging) { sendMouseAt('up', g.downX, g.downY, 0); g.dragging = false }
      g.twoFinger = true
      const pts = Array.from(pointersRef.current.values())
      g.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      g.zoomStart = viewZoom
      g.panStart = { ...viewPan }
      g.midX = (pts[0].x + pts[1].x) / 2
      g.midY = (pts[0].y + pts[1].y) / 2
      g.tapAt = Date.now()
      g.tapMoved = false
      g.tapMid = { x: g.midX, y: g.midY }
      const r = c.getBoundingClientRect()
      setViewOrigin({ x: g.midX - r.left, y: g.midY - r.top })
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gestureRef.current
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    trackPointerCursor(e.clientX, e.clientY)
    if (!controlEnabled) return

    if (g.twoFinger && pointersRef.current.size >= 2) {
      const pts = Array.from(pointersRef.current.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      const midX = (pts[0].x + pts[1].x) / 2
      const midY = (pts[0].y + pts[1].y) / 2
      const ratio = dist / g.pinchDist
      if (Math.abs(midX - g.tapMid.x) > 10 || Math.abs(midY - g.tapMid.y) > 10) g.tapMoved = true
      if (Math.abs(dist - g.pinchDist) > 10) {
        setViewZoom(Math.min(4, Math.max(1, g.zoomStart * ratio)))
      }
      setViewPan({ x: g.panStart.x + (midX - g.midX), y: g.panStart.y + (midY - g.midY) })
      return
    }

    if (!g.downX && !g.downY) {
      // ماوس فقط: حركة hover بلا زر
      if (e.pointerType === 'mouse') {
        const now = performance.now(); if (now - moveThrottleRef.current < 16) return; moveThrottleRef.current = now
        sendMouseAt('move', e.clientX, e.clientY, 0)
      }
      return
    }

    const dx = e.clientX - g.downX, dy = e.clientY - g.downY
    if (!g.moved && Math.hypot(dx, dy) > 10) {
      g.moved = true
      clearLongPress()
      g.dragging = true
      sendMouseAt('down', g.downX, g.downY, 0)
    }
    if (g.dragging) {
      const now = performance.now(); if (now - moveThrottleRef.current < 16) return; moveThrottleRef.current = now
      sendMouseAt('move', e.clientX, e.clientY, 0)
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gestureRef.current
    pointersRef.current.delete(e.pointerId)
    clearLongPress()

    if (g.twoFinger) {
      if (pointersRef.current.size === 0) {
        g.twoFinger = false
        // نقرة بإصبعين (بلا تحريك) = زر أيمن — السلوك المعتاد في برامج التحكم.
        if (controlEnabled && !g.tapMoved && g.tapAt && Date.now() - g.tapAt < 350) {
          sendMouseAt('down', g.tapMid.x, g.tapMid.y, 2)
          sendMouseAt('up', g.tapMid.x, g.tapMid.y, 2)
        }
        g.tapAt = 0
      }
      return
    }
    if (!controlEnabled) return
    if (g.dragging) {
      sendMouseAt('up', e.clientX, e.clientY, 0)
      g.dragging = false
    } else if (!g.longFired && Math.hypot(e.clientX - g.downX, e.clientY - g.downY) <= 10) {
      // نقرة واحدة = زر أيسر (أمر واحد على الوكيل = أقل زمن وصول).
      sendMouseAt('click', e.clientX, e.clientY, 0)
    }
    g.moved = false; g.downX = 0; g.downY = 0
  }

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gestureRef.current
    pointersRef.current.delete(e.pointerId)
    clearLongPress()
    if (g.dragging) { sendMouseAt('up', g.downX, g.downY, 0); g.dragging = false }
    if (pointersRef.current.size === 0) g.twoFinger = false
    g.moved = false; g.downX = 0; g.downY = 0
  }

  // تغيير وضع الملاءمة يعيد التكبير/الإزاحة (وإلا بقي المشهد مقصوصاً بلا سبب).
  useEffect(() => { setViewZoom(1); setViewPan({ x: 0, y: 0 }) }, [fitMode])

  // ── Monitor selection ─────────────────────────────────────────────────────
  const selectMonitor = (id: number) => {
    setSelectedMonitor(id); setShowMonitors(false)
    // Reset seq so frames from the restarted capture loop are not dropped.
    lastSeqRef.current = -1
    sendWs({ type: 'screen:set_monitor', payload: { monitorId: id, fps: preset.fps, quality: preset.quality, maxWidth: preset.maxWidth } })
  }

  // ── Clipboard ─────────────────────────────────────────────────────────────
  const readRemoteClipboard  = () => sendWs({ type: 'screen:clipboard_read',  payload: {} })
  const writeRemoteClipboard = () => { sendWs({ type: 'screen:clipboard_write', payload: { text: clipboardText } }); setShowClipboard(false) }
  const copyToLocal          = async () => { try { await navigator.clipboard.writeText(clipboardText) } catch { /* denied */ } }

  // ── v3.8.36 (R8) — clipboard sync, one direction at a time ──────────────
  // Pull writes straight into the local clipboard; push reads it from here.
  // In a plain browser the read side needs a user gesture, so the panel keeps
  // an explicit 'send now' button; the desktop shell exposes a watcher bridge.
  const applyLocalClipboard = async (value: string) => {
    try {
      const bridge = (window as unknown as { airemote?: { clipboard?: { write?: (t: string) => Promise<void> } } }).airemote?.clipboard
      if (bridge?.write) { await bridge.write(value); return }
      await navigator.clipboard.writeText(value)
    } catch { /* clipboard permission denied — the text stays in the panel */ }
  }

  const setClipSyncEnabled = (on: boolean) => sendWs({ type: 'screen:clipboard_sync_enable', payload: { enabled: on } })
  const setClipDirection   = (direction: 'to-device' | 'to-viewer') => sendWs({ type: 'screen:clipboard_sync_direction', payload: { direction } })
  const reverseClipSync    = () => sendWs({ type: 'screen:clipboard_sync_reverse', payload: {} })

  const pushLocalClipboard = async () => {
    try {
      const bridge = (window as unknown as { airemote?: { clipboard?: { read?: () => Promise<string> } } }).airemote?.clipboard
      const value = bridge?.read ? await bridge.read() : await navigator.clipboard.readText()
      if (value) sendWs({ type: 'screen:clipboard_local', payload: { text: value } })
    } catch { /* no clipboard permission — use the text box below */ }
  }

  useEffect(() => {
    if (!wmOn) return
    const t = setInterval(() => setWmClock(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })), 30000)
    return () => clearInterval(t)
  }, [wmOn])

  // ── v3.8.37 (R8.2) — annotations ─────────────────────────────────────────
  // Local echo is applied immediately; the server relays the same event to the
  // other viewers. Nothing is sent to the remote machine.
  const applyAnnoEvent = useCallback((ev: AnnotationEvent) => {
    if (ev.tool === 'clear') { setAnnoStrokes([]); return }
    const x = Number(ev.x), y = Number(ev.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    const id = ev.id || 'remote'
    const point = { x, y, t: Date.now() }
    setAnnoStrokes(prev => {
      const idx = prev.findIndex(s => s.id === id)
      if (idx < 0) {
        if (ev.phase === 'end') return prev
        const stroke: AnnotationStroke = { id, tool: ev.tool === 'pen' ? 'pen' : 'laser', color: ev.color || '#f43f5e', points: [point] }
        return prev.length >= 80 ? [...prev.slice(prev.length - 79), stroke] : [...prev, stroke]
      }
      const next = prev.slice()
      next[idx] = { ...next[idx], points: [...next[idx].points, point].slice(-800) }
      return next
    })
  }, [])

  const emitAnno = useCallback((ev: AnnotationEvent) => {
    applyAnnoEvent(ev)
    sendWs({ type: 'screen:annotate', payload: ev })
  }, [applyAnnoEvent, sendWs])

  const eraseAnno = useCallback((x: number, y: number) => {
    setAnnoStrokes(prev => prev.filter(s => !s.points.some(p => Math.hypot(p.x - x, p.y - y) < 0.02)))
  }, [])

  const clearAnno = useCallback(() => {
    applyAnnoEvent({ tool: 'clear' })
    sendWs({ type: 'screen:annotate', payload: { tool: 'clear' } })
  }, [applyAnnoEvent, sendWs])

  // Esc leaves fullscreen, F11 toggles it — even when the canvas owns focus.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        const k = String(ev.key).toLowerCase()
        if (k === 'l') { ev.preventDefault(); setAnnoTool(t => t === 'laser' ? 'off' : 'laser'); return }
        if (k === 'p') { ev.preventDefault(); setAnnoTool(t => t === 'pen' ? 'off' : 'pen'); return }
        if (k === 'e') { ev.preventDefault(); setAnnoTool(t => t === 'eraser' ? 'off' : 'eraser'); return }
        if (k === 'c') { ev.preventDefault(); clearAnno(); return }
      }
      if (ev.key === 'Escape' && annoTool !== 'off') { ev.preventDefault(); setAnnoTool('off'); return }
      if (ev.key === 'Escape' && fullscreen) { ev.preventDefault(); setFullscreen(false) }
      else if (ev.key === 'F11') { ev.preventDefault(); setFullscreen((f) => !f) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, annoTool, clearAnno])

  // ── Privacy ───────────────────────────────────────────────────────────────
  const togglePrivacy = () => { const next = !privacyOn; setPrivacyOn(next); sendWs({ type: 'screen:privacy', payload: { enable: next } }) }

  // ── Remote system audio (v3.5) ────────────────────────────────────────────
  const flushAudio = () => {
    const sb = audioSbRef.current
    if (!sb || sb.updating) return
    const next = audioQueueRef.current.shift()
    if (!next) return
    try { sb.appendBuffer(next) } catch { audioQueueRef.current = [] }
  }
  const ensurePcmContext = (rate = 16000) => {
    let ctx = pcmCtxRef.current
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: rate || 16000 })
      pcmCtxRef.current = ctx
      const dest = ctx.createMediaStreamDestination()
      pcmDestRef.current = dest
      const gain = ctx.createGain()
      gain.gain.value = 1
      // dest is only a MediaStreamAudioDestinationNode used for recording.
      // Without the connection to ctx.destination the PCM is decoded but
      // never reaches the speakers (the remote-audio silent bug).
      gain.connect(dest)
      gain.connect(ctx.destination)
      pcmGainRef.current = gain
    }
    ctx.resume().catch(() => {})
    return ctx
  }
  const feedPcm = (b64: string, rate = 16000) => {
    try {
      const bin = atob(b64)
      const n = Math.floor(bin.length / 2)
      if (!n) return
      const ctx = ensurePcmContext(rate)
      if (!ctx) return
      const pcm = new Int16Array(n)
      for (let i = 0; i < n; i++) pcm[i] = (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) << 16 >> 16
      const f32 = new Float32Array(n)
      for (let i = 0; i < n; i++) f32[i] = pcm[i] / 32768
      const buf = ctx.createBuffer(1, n, rate || 16000)
      buf.copyToChannel(f32, 0)
      const src = ctx.createBufferSource()
      src.buffer = buf
      // Route exactly once: source -> gain -> destination. Connecting the
      // source directly to destination as well doubles the signal and clips.
      src.connect(pcmGainRef.current || ctx.destination)
      // A small jitter buffer absorbs network/WebSocket delivery variance.
      if (!pcmNextRef.current) pcmNextRef.current = ctx.currentTime + 0.28
      let start = Math.max(ctx.currentTime + 0.02, pcmNextRef.current)
      if (start > ctx.currentTime + 1.0) start = ctx.currentTime + 0.28
      src.start(start)
      pcmNextRef.current = start + buf.duration
      // Do NOT call setState for every audio packet: Android sends ~10-50
      // PCM chunks/second, and re-rendering this large viewer on each chunk
      // starves canvas decoding and makes the screen look frozen. The audio
      // status event already updates the toolbar state.
    } catch {}
  }
  const feedAudio = (b64: string, format?: string, rate?: number) => {
    if (format === 'pcm16') { feedPcm(b64, rate || 16000); return }
    try {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      if (!bytes.length) return
      let el = audioElRef.current
      if (!el) {
        el = document.createElement('audio')
        el.autoplay = true
        el.muted = false
        el.style.display = 'none'
        document.body.appendChild(el)
        audioElRef.current = el
        const ms = new MediaSource()
        audioMsRef.current = ms
        el.src = URL.createObjectURL(ms)
        ms.addEventListener('sourceopen', () => {
          try {
            const sb = ms.addSourceBuffer('audio/webm; codecs=opus')
            audioSbRef.current = sb
            sb.addEventListener('updateend', flushAudio)
            flushAudio()
          } catch {}
        })
        el.play().catch(() => {})
      }
      audioQueueRef.current.push(bytes.buffer)
      flushAudio()
    } catch {}
  }
  const startRecording = () => {
    const canvas = canvasRef.current; if (!canvas) return
    try {
      const videoStream = canvas.captureStream(preset.fps)
      const tracks = [...videoStream.getVideoTracks()]
      try {
        const el = audioElRef.current as any
        if (el && typeof el.captureStream === 'function') {
          const as = el.captureStream()
          tracks.push(...as.getAudioTracks())
        } else if (pcmDestRef.current) {
          tracks.push(...pcmDestRef.current.stream.getAudioTracks())
        }
      } catch {}
      const stream = new MediaStream(tracks)
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm'
      const rec    = new MediaRecorder(stream, { mimeType: mime })
      recChunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) recChunksRef.current.push(e.data) }
      rec.onstop = () => {
        const blob = new Blob(recChunksRef.current, { type: 'video/webm' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href = url; a.download = `airemote-${deviceName}-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.webm`
        a.click(); URL.revokeObjectURL(url)
      }
      rec.start(1000); mediaRecRef.current = rec; setRecording(true)
      recStartRef.current = Date.now(); setRecDuration(0)
      recTimerRef.current = setInterval(() => setRecDuration(Math.floor((Date.now() - recStartRef.current) / 1000)), 1000)
    } catch (err) { console.error('[rec]', err) }
  }
  const stopRecording = () => {
    mediaRecRef.current?.stop(); mediaRecRef.current = null; setRecording(false)
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
  }

  // ── T008: Server-side recording ───────────────────────────────────────────
  const startServerRecording = () => {
    // v3.8.14 - no frame cap: a long session is bounded by disk, not by 600 frames
    sendWs({ type: 'screen:record_start', payload: { maxFrames: 0 } })
    setSvrRecording(true)
  }
  const stopServerRecording = () => {
    sendWs({ type: 'screen:record_stop', payload: {} })
    setSvrRecording(false)
  }
  // v3.8.11 — the MP4 is muxed asynchronously after stop, so poll until the server
  // serves video/mp4 instead of handing out the ZIP the moment the user clicks.
  const [mp4State, setMp4State] = useState<'idle' | 'preparing' | 'ready'>('idle')
  const downloadServerRecording = async () => {
    if (!svrRecMeta?.sessionId) return
    setMp4State('preparing')
    // v3.8.14 - wait on the cheap status probe instead of re-downloading the ZIP.
    // Long sessions need minutes of x264, so the budget is 15 min, not 36 s.
    let state = 'muxing'
    for (let i = 0; i < 600; i++) {
      try {
        const sr = await fetch(`/api/recordings/${svrRecMeta.sessionId}/status`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (sr.ok) {
          const js = await sr.json()
          state = js.state || 'missing'
          if (state === 'mp4' || state === 'zip' || state === 'missing') break
        }
      } catch {}
      await new Promise(res => setTimeout(res, 1500))
    }
    if (state === 'missing') { setMp4State('idle'); return }
    const r = await fetch(`/api/recordings/${svrRecMeta.sessionId}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!r.ok) { setMp4State('idle'); return }
    const blob = await r.blob()
    const isMp4 = (r.headers.get('content-type') || '').startsWith('video/mp4')
    setMp4State('ready')
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    a.href = url; a.download = `AiRemote-${deviceName}-${stamp}.${isMp4 ? 'mp4' : 'zip'}`
    a.click(); URL.revokeObjectURL(url)
    setSvrRecMeta(null)
  }

  const fmt = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  // ── T006: Chat ────────────────────────────────────────────────────────────
  const sendChat = useCallback(() => {
    const text = chatInput.trim()
    if (!text) return
    setChatMessages(prev => [...prev.slice(-99), { text, sender: 'viewer', ts: Date.now() }])
    sendWs({ type: 'screen:chat', payload: { text } })
    setChatInput('')
  }, [chatInput, sendWs])

  const handleChatKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }
  }

  const openChat = () => {
    setChatOpen(true)
    setUnreadChat(0)
  }

  // ── Permission request — v3.2.2 (real consent on the remote machine) ──────
  const doRequestControl = useCallback((password?: string) => {
    setPermissionState('requesting')
    const requestId = Math.random().toString(36).slice(2, 10)
    sendWs({ type: 'screen:request_control', payload: { requestId, password } })
    if (permissionTimerRef.current) clearTimeout(permissionTimerRef.current)
    permissionTimerRef.current = setTimeout(() => {
      setPermissionState(p => (p === 'requesting' ? 'idle' : p))
      if (pwActiveRef.current) { setPwBusy(false); setPwError(tr('viewer_timeout_retry')) }
    }, 60000)
  }, [sendWs])

  const requestControl = useCallback(async () => {
    if (controlEnabled) {
      setControlEnabled(false); setKeyboardMode(false); setPermissionState('idle')
      if (permissionTimerRef.current) { clearTimeout(permissionTimerRef.current); permissionTimerRef.current = null }
      return
    }
    if (permissionState === 'requesting') return
    // v3.3.0 — password-based control mode support
    let mode: 'consent' | 'password' = 'consent'
    try {
      const res = await api.get(`/api/devices/${deviceId}`)
      if (res.data?.capabilities?.controlAuth === 'password') mode = 'password'
    } catch { /* fall back to consent */ }
    if (mode === 'password') {
      pwActiveRef.current = true
      setPwModal(true); setPwInput(''); setPwError(''); setPwBusy(false)
      return
    }
    doRequestControl()
  }, [controlEnabled, permissionState, sendWs, deviceId, doRequestControl])

  const submitPw = useCallback(() => {
    if (pwBusy) return
    const pw = pwInput.trim()
    if (!pw) return
    setPwBusy(true); setPwError('')
    doRequestControl(pw)
  }, [pwInput, pwBusy, doRequestControl])

  // ── Drag & drop file upload — v3.0.0 ─────────────────────────────────────
  const handleFileDrop = useCallback(async (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault(); setDragOver(false)
    if (!controlEnabled) return
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    for (const file of files.slice(0, 5)) {
      setUploadFileName(file.name); setUploadProgress(0)
      const destPath = '/Desktop/' + file.name
      try {
        const resp = await fetch(`/api/devices/${deviceId}/fs/upload?path=${encodeURIComponent(destPath)}`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: file
        })
        if (resp.ok) { setUploadProgress(100); setTimeout(() => setUploadProgress(null), 1800) }
        else           setTimeout(() => setUploadProgress(null), 2000)
      } catch {    setTimeout(() => setUploadProgress(null), 2000) }
    }
  }, [controlEnabled, deviceId, token])

  // ── Stop streaming — clean shutdown ──────────────────────────────────────
  const stopStream = useCallback((keepAgent = false) => {
    intentionalCloseRef.current = true
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
    // Tell server to cleanly stop capturing on the agent side — unless the
    // standalone window is taking over the same capture session.
    if (!keepAgent && wsRef.current?.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ type: 'screen:stop', payload: {} })) } catch {}
    }
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null }
    if (fpsTimerRef.current)  { clearInterval(fpsTimerRef.current);  fpsTimerRef.current  = null }
    if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null }
    if (bwTimerRef.current)   { clearInterval(bwTimerRef.current);   bwTimerRef.current   = null }
    setFps(0); setLatency(-1); setBwDisplay(0)
    setFrameCount(0); setFrameStats({ keyframes: 0, total: 0 })
    setControlEnabled(false); setKeyboardMode(false)
    setStarted(false)   // return to the start splash
  }, [])

  // v3.5 — opening the standalone window must stop the main-tab stream.
  useEffect(() => {
    if (popout || typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel('airemote-screen')
    bc.onmessage = (e) => {
      if (e.data && e.data.type === 'popout' && e.data.deviceId === deviceId) stopStream(true)
    }
    return () => { try { bc.close() } catch {} }
  }, [deviceId, popout, stopStream])

  // ── Refresh — stop current session cleanly then reconnect ────────────────
  const refreshStream = useCallback(() => {
    // Explicitly send screen:stop so the server cleans up the old session
    // before the new one starts — prevents a brief period of two capture loops.
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ type: 'screen:stop', payload: {} })) } catch {}
    }
    connect(preset, selectedMonitor)
  }, [connect, preset, selectedMonitor])

  // ── Apply preset — send quality update without reconnecting ──────────────
  const applyPreset = (p: QualityPreset) => {
    setPreset(p); setAdaptiveMode(false); setShowSettings(false)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Reset seq tracker so frames from the restarted capture loop (seq starts
      // at 0 again on the agent) are not silently dropped by the seq guard.
      lastSeqRef.current = -1
      // Already connected — just tell the agent to change quality, no reconnect
      sendWs({
        type:    'screen:set_quality',
        payload: { fps: p.fps, quality: p.quality, maxWidth: p.maxWidth, monitorId: selectedMonRef.current }
      })
    } else {
      // Not connected — do a full reconnect
      connect(p, selectedMonitor)
    }
  }

  // 3.9.4 — حجم المسرح: «ملاءمة» = احتواء يحفظ النسبة (letterbox)، «ملء» = 100%،
  // «فعلي» = بكسل 1:1. أي أن الإطار لم يعد يُشدّ إلى نسبة شاشة المُشاهد.
  const stageSize = (() => {
    if (!canvasBox) return null
    if (fitMode === 'actual') return { w: canvasBox.w, h: canvasBox.h }
    if (!areaSize.w || !areaSize.h) return null
    // «ملاءمة» = احتواء (letterbox) · «ملء» = تغطية تُقصّ الزائد (crop).
    // الاثنان يحفظان النسبة؛ الشدّ إلى نسبة الشاشة كان خطأ 3.9.3.
    const s = fitMode === 'fill'
      ? Math.max(areaSize.w / canvasBox.w, areaSize.h / canvasBox.h)
      : Math.min(areaSize.w / canvasBox.w, areaSize.h / canvasBox.h)
    return { w: Math.max(1, Math.round(canvasBox.w * s)), h: Math.max(1, Math.round(canvasBox.h * s)) }
  })()

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={clsx(
      'flex flex-col bg-code overflow-hidden',
      (fullscreen || popout) ? 'fixed inset-0 z-[100] rounded-none' : 'relative h-full rounded-xl'
    )}>

      {/* ── Start splash — shown before user initiates screen sharing ── */}
      {!started && (
        <div className="flex flex-col items-center justify-center h-full gap-6 bg-canvas rounded-xl select-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-2xl bg-info/10 border border-info/20 flex items-center justify-center">
              <Tv2 size={36} className="text-info/70" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-ink">{deviceName}</p>
              <p className="text-xs text-muted mt-1">{tr('viewer_share_screen')}</p>
            </div>
          </div>

          <button
            onClick={() => setStarted(true)}
            className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-info hover:bg-info/90 active:scale-95 transition-all text-ink font-medium text-sm shadow-lg shadow-info/20"
          >
            <PlayCircle size={18} />
            {tr('viewer_start_share')}
          </button>

          <p className="text-xs text-muted max-w-xs text-center">
            {tr('viewer_start_share_desc')}
          </p>
        </div>
      )}

      {/* v3.8.0 — no permanent chrome: the standalone window stays completely
          edge-free. Moving the mouse to the top edge brings the toolbar back. */}
      {popout && started && !controlsVisible && (
        <div
          onMouseEnter={revealControls}
          onClick={revealControls}
          className="absolute top-0 left-0 right-0 z-[60] h-2.5"
          aria-hidden
        />
      )}

      {popout && started && popoutHint && status === 'streaming' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-full bg-overlay/60 text-[11px] text-ink backdrop-blur-sm select-none pointer-events-none">
          {tr('viewer_fullscreen_hint')}
        </div>
      )}

      {/* ── Toolbar ── */}
      {started && <div onMouseEnter={revealControls} onMouseLeave={() => { if (!pinned) scheduleControlsHide(1000) }} className={clsx(
        'flex items-center gap-2 px-3 py-2 bg-canvas/95 backdrop-blur border border-line z-10 flex-wrap transition-all duration-200',
        popout ? 'absolute top-2 left-1/2 -translate-x-1/2 w-auto max-w-[96%] rounded-xl shadow-2xl overflow-x-auto flex-nowrap whitespace-nowrap' : 'border-b',
        fullscreen && !controlsVisible && !pinned && !showSettings && 'opacity-0 -translate-y-2 pointer-events-none'
      )}>
        <Monitor size={14} className="text-info shrink-0"/>
        <span className="text-sm font-medium text-ink truncate max-w-[100px]">{deviceName}</span>

        <button
          type="button"
          onClick={() => {
            if (popout) setFullscreen(true)
            else window.open(`/view/${deviceId}`, `airemote-stream-${deviceId}`, 'width=1400,height=900')
          }}
          className={clsx(
            'cr-live-signal shrink-0',
            status === 'streaming' && 'is-live',
            status === 'connecting' && 'is-buffering'
          )}
          title={status === 'streaming' ? tr('viewer_live_open_popout') : tr('viewer_offline')}
        >
          <i className="cr-live-signal-dot" />
        </button>

        {/* v3.8.9 — one obvious control for how the remote desktop fits */}
        {status === 'streaming' && (
          <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface/70 p-0.5 shrink-0"
               role="group" aria-label={tr('viewer_display_mode')}>
            <Scaling size={12} className="text-muted mx-1" />
            {([
              { id: 'fit',    label: tr('viewer_fit'), hint: tr('viewer_fit_hint') },
              { id: 'fill',   label: tr('viewer_fill'),    hint: tr('viewer_fill_hint') },
              { id: 'actual', label: '1:1',    hint: tr('viewer_actual_hint') },
            ] as const).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { setFitMode(o.id); try { localStorage.setItem('airemote.screen.fit', o.id) } catch {} }}
                title={o.hint + (o.id === 'fit' ? tr('viewer_default_suffix') : '')}
                aria-pressed={fitMode === o.id}
                className={clsx('px-2 py-0.5 rounded-md text-[11px] leading-5 transition-colors',
                  fitMode === o.id
                    ? 'bg-info/20 text-info font-medium ring-1 ring-info/40'
                    : 'text-muted hover:text-ink hover:bg-surface2')}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {/* T001: Bandwidth meter + FPS + latency */}
        {status === 'streaming' && (
          <span className="flex items-center gap-2 text-xs font-mono text-muted shrink-0 tabular-nums">
            <span className="inline-block w-[4.4em] text-right">{fps}fps</span>
            <span className="inline-block w-[7.2em] text-right">{resolution.w}×{resolution.h}</span>
            {latency >= 0 && (
              <span className={clsx(
                'inline-block w-[3.4em] text-right',
                latency < 50  ? 'text-success' :
                latency < 150 ? 'text-warning'   :
                latency < 300 ? 'text-warning'  : 'text-danger'
              )}>{latency}ms</span>
            )}
            <span className="inline-block w-[5.6em] text-right text-muted" title={`${frameStats.keyframes} keyframes / ${frameStats.total} total frames`}>
              {bwDisplay > 0 ? fmtBytes(bwDisplay) : '—'}
            </span>
          </span>
        )}

        {remoteIsAndroid && status === 'streaming' && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => sendWs({ type: 'screen:key_event', payload: { type: 'press', key: 'Escape' } })}
              disabled={!controlEnabled} title={tr('viewer_back')}
              className="flex items-center gap-1 px-1.5 py-1 rounded text-ink hover:text-ink hover:bg-surface2 disabled:opacity-40 transition-colors">
              <Undo2 size={11} /><span className="hidden 2xl:inline text-[10px]">{tr('viewer_back')}</span>
            </button>
            <button onClick={() => sendWs({ type: 'screen:key_event', payload: { type: 'press', key: 'Home' } })}
              disabled={!controlEnabled} title={tr('viewer_home')}
              className="flex items-center gap-1 px-1.5 py-1 rounded text-ink hover:text-ink hover:bg-surface2 disabled:opacity-40 transition-colors">
              <Home size={11} /><span className="hidden 2xl:inline text-[10px]">{tr('viewer_home')}</span>
            </button>
            <button onClick={() => sendWs({ type: 'screen:key_event', payload: { type: 'press', key: 'Meta' } })}
              disabled={!controlEnabled} title={tr('viewer_open_apps')}
              className="flex items-center gap-1 px-1.5 py-1 rounded text-ink hover:text-ink hover:bg-surface2 disabled:opacity-40 transition-colors">
              <Layers size={11} /><span className="hidden 2xl:inline text-[10px]">{tr('viewer_apps')}</span>
            </button>
            <button
              onClick={() => sendWs({ type: 'screen:rotate', payload: {} })}
              title={tr('viewer_rotate_90')}
              className="flex items-center gap-1 px-1.5 py-1 rounded text-ink hover:text-ink hover:bg-surface2 disabled:opacity-40 transition-colors">
              <RotateCw size={11} /><span className="hidden 2xl:inline text-[10px]">{tr('viewer_rotate')}</span>
            </button>
            <button
              onClick={() => {
                const next = !autoRotate
                setAutoRotate(next)
                sendWs({ type: 'screen:rotate_auto', payload: { enabled: next } })
              }}
              title={autoRotate ? tr('viewer_autorotate_on') : tr('viewer_autorotate_off')}
              className={clsx('flex items-center gap-1 px-1.5 py-1 rounded transition-colors disabled:opacity-40',
                autoRotate ? 'text-success bg-success/100/10 hover:bg-success/100/20' : 'text-ink hover:text-ink hover:bg-surface2')}>
              <RefreshCw size={11} />
              <span className="hidden 2xl:inline text-[10px]">{tr('viewer_auto')}</span>
            </button>
            <button
              onClick={() => setShowBrightness(v => !v)}
              title={tr('viewer_brightness_title')}
              className={clsx('flex items-center gap-1 px-1.5 py-1 rounded transition-colors',
                showBrightness ? 'text-warning bg-warning/100/15' : 'text-ink hover:text-ink hover:bg-surface2')}>
              <Sun size={11} /><span className="hidden xl:inline text-[10px]">{tr('viewer_brightness')}</span>
            </button>
            {showBrightness && createPortal(
              <div className="fixed inset-0 z-[120] flex items-center justify-center bg-overlay/55 p-4" onClick={() => setShowBrightness(false)}>
                <div className="w-full max-w-sm rounded-2xl border border-line bg-canvas p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-sm font-bold text-ink">{tr('viewer_android_brightness')}</div>
                      <div className="text-[11px] text-muted mt-1">{tr('viewer_brightness_desc')}</div>
                    </div>
                    <div className="text-2xl font-bold text-warning">{brightness}</div>
                  </div>
                  <input
                    type="range" min={0} max={255} step={1} value={brightness}
                    onChange={e => {
                      const value = Number(e.target.value)
                      setBrightness(value)
                      sendWs({ type: 'screen:brightness', payload: { value } })
                    }}
                    className="w-full accent-warning"
                    autoFocus
                  />
                  <div className="flex justify-between text-[10px] text-muted mt-2"><span>0</span><span>255</span></div>
                  <div className="flex justify-end mt-4">
                    <button onClick={() => setShowBrightness(false)}
                      className="px-4 py-2 rounded-lg bg-surface2 text-ink text-xs hover:bg-line">
                      {tr('viewer_close')}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
            {rotateNotice && (
              <span className="text-[10px] text-warning max-w-[180px] truncate" title={rotateNotice}>{rotateNotice}</span>
            )}
          </div>
        )}

        <div className="flex-1"/>
        <div className={clsx('flex items-center gap-1', popout ? 'flex-nowrap' : 'flex-wrap')}>

          {/* v3.5 — standalone viewer window */}
          {!popout && status === 'streaming' && (
            <button onClick={() => window.open('/view/' + deviceId, '_blank', 'width=1400,height=900')}
              title={tr('viewer_popout_title')}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted hover:text-ink hover:bg-surface2 transition-colors">
              <ExternalLink size={12}/> {tr('viewer_popout')}
            </button>
          )}

          {/* T006: Chat button */}
          {status === 'streaming' && (
            <button onClick={openChat}
              title={tr('viewer_chat_during_session')}
              className={clsx('relative flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                chatOpen ? 'bg-info/20 text-info' : 'text-muted hover:text-ink hover:bg-surface2'
              )}>
              <MessageSquare size={12}/>
              {unreadChat > 0 && !chatOpen && (
                <span className="absolute -top-1 -right-1 bg-info text-primary-fg rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold">
                  {unreadChat > 9 ? '9+' : unreadChat}
                </span>
              )}
            </button>
          )}

          {/* Client recording */}
          {status === 'streaming' && (
            <>
                    {status === 'streaming' && (
                      <button
                        onClick={() => {
                          const next = !audioEnabled
                          setAudioEnabled(next)
                          if (next) ensurePcmContext(16000)
                          sendWs({ type: 'screen:audio_control', payload: { enabled: next } })
                        }}
                        title={audioEnabled ? tr('viewer_audio_off') : tr('viewer_audio_on')}
                        className={clsx('flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                          audioEnabled ? 'bg-primary/100/20 text-primary' : 'text-muted hover:text-ink hover:bg-surface2')}>
                        {audioEnabled ? <Volume2 size={12}/> : <VolumeX size={12}/>}
                        <span className="hidden xl:inline">{audioEnabled ? tr('viewer_device_audio') : tr('viewer_play_audio')}</span>
                      </button>
                    )}
                    {audioNotice && (
                      <span className="text-[10px] text-warning max-w-[220px] truncate" title={audioNotice}>{audioNotice}</span>
                    )}
            <button onClick={recording ? stopRecording : startRecording}
              title={recording ? tr('viewer_stop_recording_time', { t: fmt(recDuration) }) : tr('viewer_record_webm')}
              className={clsx('flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                recording ? 'bg-danger/100/20 text-danger hover:bg-danger/100/30' : 'text-muted hover:text-ink hover:bg-surface2'
              )}>
              {recording ? <><Circle size={8} className="fill-danger animate-pulse"/> {fmt(recDuration)}</> : <Video size={12}/>}
            </button>
            </>
          )}

          {/* T008: Server recording */}
          {status === 'streaming' && (
            svrRecMeta && !svrRecording ? (
              <button onClick={downloadServerRecording} disabled={mp4State === 'preparing'}
                title={tr('viewer_download_mp4_hint')}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-success/100/20 text-success hover:bg-success/100/30 disabled:opacity-60 transition-colors">
                {mp4State === 'preparing' ? <><Loader2 size={11} className="animate-spin"/> {tr('viewer_preparing')}</> : <><Download size={11}/> {tr('viewer_download_mp4')}</>}
              </button>
            ) : (
              <button onClick={svrRecording ? stopServerRecording : startServerRecording}
                title={svrRecording ? tr('viewer_stop_recording_av') : tr('viewer_record_mp4_zip')}
                className={clsx('flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                  svrRecording ? 'bg-warning/20 text-warning hover:bg-warning/30' : 'text-muted hover:text-ink hover:bg-surface2'
                )}>
                {svrRecording ? <><Circle size={8} className="fill-warning animate-pulse"/> {tr('viewer_server')}</> : <Activity size={12}/>}
              </button>
            )
          )}

          {/* Privacy (Windows agent only; Android has its own screen-off control) */}
          {status === 'streaming' && !remoteIsAndroid && (
            <button onClick={togglePrivacy} title={privacyOn ? tr('viewer_privacy_off') : tr('viewer_privacy_on')}
              className={clsx('p-1.5 rounded transition-colors', privacyOn ? 'bg-primary/20 text-primary' : 'text-muted hover:text-ink hover:bg-surface2')}>
              {privacyOn ? <Eye size={13}/> : <EyeOff size={13}/>}
            </button>
          )}

          {/* Viewer watermark (R8.3) */}
          {status === 'streaming' && (
            <button
              onClick={() => {
                const next = !wmOn
                setWmOn(next)
                try { localStorage.setItem('airemote.screen.watermark', next ? '1' : '0') } catch {}
              }}
              title={wmOn ? tr('viewer_watermark_off') : tr('viewer_watermark_on')}
              className={clsx('p-1.5 rounded transition-colors', wmOn ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink hover:bg-surface2')}>
              <Fingerprint size={13}/>
            </button>
          )}

          {/* Laser & annotations (R8.2) */}
          {status === 'streaming' && (
            <div className="relative">
              <button onClick={() => setShowAnno(s => !s)}
                title={tr('viewer_annotate')}
                className={clsx('p-1.5 rounded transition-colors',
                  annoTool !== 'off' ? 'bg-info/20 text-info' : showAnno ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink hover:bg-surface2')}>
                <PenLine size={13}/>
              </button>
              {showAnno && (
                <div className="absolute top-full right-0 mt-1 bg-surface border border-line rounded-lg shadow-xl z-30 w-72" onClick={e => e.stopPropagation()}>
                  <div className="px-3 py-2 text-xs text-muted border-b border-line flex items-center justify-between">
                    <span>{tr('viewer_annotate')}</span>
                    <button onClick={() => setShowAnno(false)} className="text-muted hover:text-muted text-base leading-none">✕</button>
                  </div>
                  <div className="p-2 grid grid-cols-2 gap-1.5">
                    {([
                      { id: 'laser',  icon: <Crosshair size={12}/>, label: tr('viewer_anno_laser') },
                      { id: 'pen',    icon: <PenLine size={12}/>,   label: tr('viewer_anno_pen') },
                      { id: 'eraser', icon: <Eraser size={12}/>,    label: tr('viewer_anno_eraser') },
                      { id: 'off',    icon: <X size={12}/>,         label: tr('viewer_anno_off') },
                    ] as const).map(o => (
                      <button key={o.id} onClick={() => setAnnoTool(o.id)}
                        className={clsx('flex items-center justify-center gap-1.5 text-xs py-1.5 rounded transition-colors',
                          annoTool === o.id ? 'bg-info/20 text-info' : 'bg-surface2 text-muted hover:text-ink')}>
                        {o.icon}{o.label}
                      </button>
                    ))}
                  </div>
                  <div className="px-2 pb-2 flex items-center gap-1.5">
                    {['#f43f5e', '#22d3ee', '#facc15', '#4ade80'].map(c => (
                      <button key={c} onClick={() => setAnnoColor(c)} title={c}
                        className={clsx('h-5 w-5 rounded-full border transition-transform', annoColor === c ? 'border-ink scale-110' : 'border-line')}
                        style={{ background: c }} />
                    ))}
                    <button onClick={clearAnno} className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded bg-surface2 text-muted hover:text-ink transition-colors">
                      <Trash2 size={11}/>{tr('viewer_anno_clear')}
                    </button>
                  </div>
                  <div className="px-3 pb-2 text-[10px] text-muted flex items-center justify-between">
                    <span>{tr('viewer_anno_hint')}</span>
                    <span>{tr('viewer_anno_shared')}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Clipboard */}
          {status === 'streaming' && (
            <div className="relative">
              <button onClick={() => { setShowClipboard(s => !s); if (!showClipboard) readRemoteClipboard() }}
                title={tr('viewer_clipboard_sync')}
                className={clsx('p-1.5 rounded transition-colors', showClipboard ? 'bg-info/20 text-info' : 'text-muted hover:text-ink hover:bg-surface2')}>
                <Clipboard size={13}/>
              </button>
              {showClipboard && (
                <div className="absolute top-full right-0 mt-1 bg-surface border border-line rounded-lg shadow-xl z-30 w-80" onClick={e => e.stopPropagation()}>
                  <div className="px-3 py-2 text-xs text-muted border-b border-line flex items-center justify-between">
                    <span>{tr('viewer_clipboard_sync')}</span>
                    <button onClick={() => setShowClipboard(false)} className="text-muted hover:text-muted text-base leading-none">✕</button>
                  </div>

                  <div className="px-3 pt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setClipSyncEnabled(!clipSync.enabled)}
                        className={clsx('flex-1 text-xs py-1.5 rounded transition-colors',
                          clipSync.enabled ? 'bg-success/20 text-success' : 'bg-surface2 text-muted hover:text-ink')}>
                        {clipSync.enabled ? tr('viewer_clip_sync_on') : tr('viewer_clip_sync_off')}
                      </button>
                      <button onClick={reverseClipSync} title={tr('viewer_clip_reverse')}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs rounded bg-surface2 hover:bg-surface2 text-ink transition-colors">
                        <ArrowLeftRight size={11}/>
                        <span className="font-mono text-[10px]">{tr('viewer_clip_reverse_hint')}</span>
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => setClipDirection('to-device')}
                        className={clsx('flex-1 text-xs py-1.5 rounded transition-colors',
                          clipSync.direction === 'to-device' ? 'bg-info/20 text-info' : 'bg-surface2 text-muted hover:text-ink')}>
                        {tr('viewer_clip_dir_to_device')}
                      </button>
                      <button onClick={() => setClipDirection('to-viewer')} disabled={remoteIsAndroid}
                        title={remoteIsAndroid ? tr('viewer_clip_bg_denied') : ''}
                        className={clsx('flex-1 text-xs py-1.5 rounded transition-colors',
                          remoteIsAndroid ? 'bg-surface2 text-muted opacity-50 cursor-not-allowed'
                            : clipSync.direction === 'to-viewer' ? 'bg-info/20 text-info' : 'bg-surface2 text-muted hover:text-ink')}>
                        {tr('viewer_clip_dir_to_viewer')}
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-muted">
                      <span>{tr('viewer_clip_one_way')}</span>
                      <span className="font-mono">{tr('viewer_clip_stats', { sent: clipSync.sent, received: clipSync.received, blocked: clipSync.blocked })}</span>
                    </div>

                    {clipSync.enabled && !clipSync.agentWatching && (
                      <div className="text-[10px] text-warning">
                        {clipSync.lastReason === 'background-denied' || remoteIsAndroid
                          ? tr('viewer_clip_bg_denied')
                          : tr('viewer_clip_waiting_agent')}
                      </div>
                    )}
                    {clipSync.enabled && clipSync.direction === 'to-viewer' && (
                      <div className="text-[10px] text-success">{tr('viewer_clip_auto_pull')}</div>
                    )}
                  </div>

                  <div className="p-3 space-y-2">
                    <textarea value={clipboardText} onChange={e => setClipboardText(e.target.value)} placeholder={tr('viewer_clipboard_placeholder')}
                      className="w-full h-20 bg-surface/50 border border-line rounded text-xs text-ink p-2 resize-none font-mono"/>
                    <div className="flex gap-2">
                      <button onClick={copyToLocal} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-surface2 hover:bg-surface2 rounded text-ink transition-colors">
                        <Clipboard size={10}/> {tr('viewer_copy_local')}
                      </button>
                      <button onClick={() => { void pushLocalClipboard() }} title={tr('viewer_clip_send_now')}
                        className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-surface2 hover:bg-surface2 rounded text-ink transition-colors">
                        <ArrowLeftRight size={10}/> {tr('viewer_clip_send_now')}
                      </button>
                    </div>
                    <button onClick={writeRemoteClipboard} className="w-full flex items-center justify-center gap-1 text-xs py-1.5 bg-info/20 hover:bg-info/30 rounded text-info transition-colors">
                      <ClipboardPaste size={10}/> {tr('viewer_send_to_device')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Monitor selector */}
          {status === 'streaming' && monitors.length > 1 && (
            <div className="relative">
              <button onClick={() => setShowMonitors(s => !s)} title={tr('viewer_pick_monitor')}
                className={clsx('flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors', showMonitors ? 'bg-info/20 text-info' : 'text-muted hover:text-ink hover:bg-surface2')}>
                <Tv2 size={12}/> <span>{tr('viewer_monitor_n', { n: selectedMonitor + 1 })}</span> <ChevronDown size={10}/>
              </button>
              {showMonitors && (
                <div className="absolute top-full right-0 mt-1 bg-surface border border-line rounded-lg shadow-xl z-30 min-w-[190px]" onClick={e => e.stopPropagation()}>
                  <div className="px-3 py-2 text-xs text-muted border-b border-line">{tr('viewer_select_monitor')}</div>
                  {monitors.map(mon => (
                    <button key={mon.id} onClick={() => selectMonitor(mon.id)}
                      className={clsx('w-full text-left px-3 py-2 text-xs hover:bg-surface2 transition-colors flex items-center justify-between gap-2', selectedMonitor === mon.id ? 'text-info' : 'text-ink')}>
                      <span>{mon.name || tr('viewer_monitor_n', { n: mon.id + 1 })}</span>
                      <span className="text-muted font-mono text-[10px]">{mon.width}×{mon.height}</span>
                      {mon.primary && <span className="text-[9px] bg-success/20 text-success px-1 rounded">{tr('viewer_primary')}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Control toggle */}
          {status === 'streaming' && (
            <button onClick={requestControl}
              title={controlEnabled ? tr('viewer_control_stop') : permissionState === 'requesting' ? tr('viewer_requesting_perm') : tr('viewer_control_enable')}
              disabled={permissionState === 'requesting'}
              className={clsx('flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                controlEnabled               ? 'bg-success/100/20 text-success hover:bg-success/100/30' :
                permissionState === 'requesting' ? 'bg-warning/100/20 text-warning cursor-wait' :
                'text-muted hover:text-ink hover:bg-surface2'
              )}>
              {permissionState === 'requesting'
                ? <><Loader2 size={11} className="animate-spin"/> {tr('viewer_requesting_perm_short')}</>
                : controlEnabled ? <><Mouse size={12}/> {tr('viewer_controlling')}</> : <><Shield size={12}/> {tr('viewer_control')}</>
              }
            </button>
          )}

          {/* Keyboard mode */}
          {status === 'streaming' && controlEnabled && (
            <button onClick={() => setKeyboardMode(k => !k)} title={keyboardMode ? tr('viewer_keyboard_off') : tr('viewer_keyboard_on')}
              className={clsx('p-1.5 rounded transition-colors', keyboardMode ? 'bg-warning/100/20 text-warning' : 'text-muted hover:text-ink hover:bg-surface2')}>
              <Keyboard size={13}/>
            </button>
          )}

          {/* Quality settings — rendered in a portal so the toolbar never clips it */}
          <div className="relative">
            <button
              ref={qualityBtnRef}
              onClick={() => {
                if (showSettings) { setShowSettings(false); return }
                const r = qualityBtnRef.current?.getBoundingClientRect()
                const W = 268
                const left = Math.max(8, Math.min(r ? r.right - W : 12, window.innerWidth - W - 8))
                const top  = Math.max(8, Math.min(r ? r.bottom + 6 : 64, window.innerHeight - 120))
                setQualityPos({ top, left })
                setShowSettings(true)
              }}
              className="p-1.5 rounded text-muted hover:text-ink hover:bg-surface2 transition-colors"
              title={tr('viewer_quality_settings')}>
              <Settings2 size={13}/>
            </button>
            {showSettings && qualityPos && (() => { try { sendWs({ type: 'screen:get_resolutions', payload: {} }) } catch {} ; return true })() && createPortal(
              <div className="fixed inset-0 z-[300]" onClick={() => setShowSettings(false)} onContextMenu={e => e.preventDefault()}>
                <div className="absolute rounded-xl border shadow-2xl"
                     style={{ top: qualityPos.top, left: qualityPos.left, width: 268, maxHeight: 'min(72vh, 460px)', overflowY: 'auto',
                              background: '#0b1622', borderColor: 'rgba(148,163,184,0.35)', color: '#e2e8f0' }}
                     onClick={e => e.stopPropagation()}>
                <div className="px-3 py-2 border-b border-line">
                  <label className="block text-[10px] uppercase tracking-wider text-muted mb-1.5">
                    {tr('viewer_device_resolution')}
                  </label>
                  <select
                    value={deviceRes}
                    disabled={resBusy || deviceModes.length === 0}
                    onChange={e => {
                      const [w, h] = String(e.target.value).split('x').map(Number)
                      if (!w || !h) return
                      setResBusy(true)
                      sendWs({ type: 'screen:set_resolution', payload: { width: w, height: h } })
                    }}
                    className="w-full text-xs rounded-lg px-2 py-1.5 bg-surface2 text-ink border border-line outline-none focus:border-primary disabled:opacity-60">
                    {deviceModes.length === 0 && <option value="">{tr('viewer_device_resolution_na')}</option>}
                    {deviceModes.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <p className="text-[10px] text-muted mt-1">
                    {resBusy ? tr('viewer_device_resolution_busy') : tr('viewer_device_resolution_hint')}
                  </p>
                </div>
                <div className="px-3 py-2 border-b border-line">
                  <label className="block text-[10px] uppercase tracking-wider text-muted mb-1.5">
                    {tr('viewer_quality_resolution')}
                  </label>
                  <select
                    value={String(preset.maxWidth >= (resolution.w || 99999) ? 0 : preset.maxWidth)}
                    onChange={e => {
                      const v = Number(e.target.value)
                      const maxWidth = v === 0 ? Math.max(640, resolution.w || 1920) : v
                      applyPreset({
                        id: 'res-' + v,
                        labelKey: preset.labelKey,
                        fps: preset.fps,
                        quality: Math.max(preset.quality, v >= 1920 || v === 0 ? 78 : preset.quality),
                        maxWidth
                      })
                      try { localStorage.setItem('airemote.screen.res', String(v)) } catch {}
                    }}
                    className="w-full text-xs rounded-lg px-2 py-1.5 bg-surface2 text-ink border border-line outline-none focus:border-primary">
                    <option value="854">480p · 854 px</option>
                    <option value="1280">720p · 1280 px</option>
                    <option value="1600">900p · 1600 px</option>
                    <option value="1920">1080p · 1920 px</option>
                    <option value="2560">1440p · 2560 px</option>
                    <option value="0">{tr('viewer_quality_original')} · {resolution.w || '?'} px</option>
                  </select>
                  <p className="text-[10px] text-muted mt-1">
                    {preset.maxWidth}px · {preset.fps}fps · q{preset.quality}
                  </p>
                </div>
                <button onClick={() => applyPreset({ id: 'original', labelKey: 'viewer_quality_original', fps: preset.fps, quality: Math.max(72, preset.quality), maxWidth: Math.max(640, resolution.w || 1920) })}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-surface2 transition-colors flex items-center justify-between text-ink">
                  <span>{tr('viewer_original_no_scale')}</span>
                  <span className="font-mono text-[10px] text-muted">{resolution.w || '?'}px</span>
                </button>
                {QUALITY_PRESETS.map(p => (
                  <button key={p.id} onClick={() => applyPreset(p)}
                    className={clsx('w-full text-left px-3 py-2 text-xs hover:bg-surface2 transition-colors flex items-center justify-between',
                      !adaptiveMode && preset.id === p.id ? 'text-info' : 'text-ink'
                    )}>
                    <span className="flex items-center gap-1.5">
                      {p.fps === 30 && <Zap size={9} className="text-warning"/>}
                      {tr(p.labelKey)}
                    </span>
                    <span className="text-muted font-mono text-[10px]">{p.fps}fps · q{p.quality} · {p.maxWidth}px</span>
                  </button>
                ))}
                <div className="border-t border-line px-3 py-2 space-y-1.5">
                  <button onClick={() => { setAdaptiveMode(a => !a); setShowSettings(false) }}
                    className={clsx('w-full text-left text-xs flex items-center gap-2 py-0.5',
                      adaptiveMode ? 'text-info' : 'text-muted hover:text-ink'
                    )}>
                    <Zap size={10}/> {tr('viewer_adaptive_quality')}
                    {adaptiveMode && <span className="ml-auto text-[9px] bg-info/20 text-info px-1.5 py-0.5 rounded-full">{tr('viewer_on')}</span>}
                  </button>
                  {/* T001: delta stats */}
                  {frameStats.total > 0 && (
                    <div className="text-[10px] text-muted font-mono pt-1 border-t border-line/60">
                      {frameStats.keyframes} keyframe / {frameStats.total} frames
                      · {frameStats.total > 0 ? Math.round(frameStats.keyframes / frameStats.total * 100) : 0}% full
                    </div>
                  )}
                </div>
              </div></div>,
              document.body
            )}
          </div>

          {viewerCount > 1 && (
            <div title={tr('viewer_viewers_active', { n: viewerCount })}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-info/20 text-info text-[11px] font-medium select-none">
              <Eye size={10}/>{viewerCount}
            </div>
          )}
          <button onClick={refreshStream} className="p-1.5 rounded text-muted hover:text-ink hover:bg-surface2 transition-colors" title={tr('viewer_reconnect')}><RefreshCw size={13}/></button>
          <button onClick={() => stopStream()}
            title={tr('viewer_stop_stream')}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-danger hover:text-danger hover:bg-danger/100/15 transition-colors text-[11px] font-medium">
            <Square size={12} className="fill-current"/>
            <span>{tr('viewer_stop')}</span>
          </button>
          <button onClick={() => setPinned(v => !v)} className={clsx('p-1.5 rounded transition-colors', pinned ? 'bg-warning/100/20 text-warning' : 'text-muted hover:text-ink hover:bg-surface2')} title={pinned ? tr('viewer_unpin_toolbar') : tr('viewer_pin_toolbar')}>
            {pinned ? <Pin size={13}/> : <PinOff size={13}/>}
          </button>
          <button onClick={() => setFullscreen(f => !f)} className="p-1.5 rounded text-muted hover:text-ink hover:bg-surface2 transition-colors" title={fullscreen ? tr('viewer_exit_fullscreen') : tr('viewer_fullscreen')}>
            {fullscreen ? <Minimize2 size={13}/> : <Maximize2 size={13}/>}
          </button>
        </div>
      </div>}



      {/* ── Canvas area ── */}
      {started && <div ref={canvasAreaRef} className={clsx('flex-1 min-h-0 relative flex items-center justify-center bg-canvas', fitMode === 'actual' ? 'overflow-auto' : 'overflow-hidden', popout && pinned && 'pt-14')}
        onClick={() => { setShowSettings(false); setShowMonitors(false); setShowClipboard(false) }}>

        <div
          ref={localCursorRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink/70 bg-primary/80 opacity-0 transition-opacity duration-200 shadow-lg"
          style={{ willChange: 'transform' }}
        />
        <div className="relative shrink-0" style={stageSize ? {
          width: stageSize.w + 'px',
          height: stageSize.h + 'px',
        } : {
          width: '100%',
          height: '100%',
        }}>
        <canvas ref={canvasRef}
          className={clsx(
            'block shrink-0 transition-opacity duration-300',
            status === 'streaming' ? 'opacity-100' : 'opacity-20',
            dragOver && 'ring-2 ring-info/60 ring-dashed',
            (status === 'streaming' && !controlsVisible && !pinned) ? 'cursor-none' : ''
          )}
          style={{
            width: '100%',
            height: '100%',
            imageRendering: 'auto',
            // 3.9.3 — اللمس يذهب إلى الجلسة لا إلى تمرير الصفحة/تكبيرها.
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            transform: (viewZoom !== 1 || viewPan.x !== 0 || viewPan.y !== 0)
              ? `translate(${viewPan.x}px, ${viewPan.y}px) scale(${viewZoom})`
              : undefined,
            transformOrigin: `${viewOrigin.x}px ${viewOrigin.y}px`,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onMouseEnter={e => { setCursorVisible(true); if (controlEnabled) sendMouse('move', e) }}
          onMouseLeave={() => { setCursorVisible(false); if (localCursorRef.current) localCursorRef.current.style.opacity = '0' }}
          onContextMenu={e => e.preventDefault()}
          onDragOver={e => { e.preventDefault(); if (controlEnabled) setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
        />
        {/* 3.9.4 — على الأندرويد لا يوجد hover: حين يختفي الشريط لا سبيل لإرجاعه.
            الزر أعلى الشاشة، صغير (32px) وشبه شفاف كي لا يحجب البث. */}
        {started && !controlsVisible && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); revealControls() }}
            aria-label={tr('viewer_show_toolbar')}
            title={tr('viewer_show_toolbar')}
            className="absolute top-1 left-1/2 z-[30] flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-ink/10 bg-surface2/40 text-ink/70 opacity-60 backdrop-blur-sm transition-opacity active:opacity-100"
          >
            <ChevronDown size={14} />
          </button>
        )}
        {viewZoom !== 1 && (
          <button
            type="button"
            onClick={resetView}
            aria-label="reset zoom"
            className="absolute top-2 left-2 z-[16] rounded-lg bg-canvas/70 px-2.5 py-1 text-xs font-medium text-ink backdrop-blur-sm"
          >
            {Math.round(viewZoom * 100)}% ↺
          </button>
        )}
        {wmOn && status === 'streaming' && (
          <div
            aria-hidden
            className="absolute bottom-2 left-2 z-[15] pointer-events-none select-none max-w-[70%] truncate rounded bg-canvas/55 px-2 py-0.5 text-[10px] font-medium text-ink/75 backdrop-blur-sm"
            dir="ltr"
          >
            {user?.email || ''} · {deviceName} · {wmClock}
          </div>
        )}
        <AnnotationLayer
          strokes={annoStrokes}
          tool={annoTool}
          color={annoColor}
          onEvent={emitAnno}
          onErase={eraseAnno}
        />
        </div>

        {/* ── Windows-style cursor overlay ── */}
        {/* v3.3.0: custom cursor overlay disabled - the remote frames already include the real cursor (single-cursor UX) */}
        {annoTool !== 'off' && status === 'streaming' && (
          <div className="absolute top-3 right-3 z-40 bg-info/20 border border-info/50 text-ink text-[11px] px-3 py-1.5 rounded-lg pointer-events-none">
            {tr('viewer_anno_active')}
          </div>
        )}
        {screenLocked && status === 'streaming' && (
          <div className={clsx('absolute top-11 left-1/2 z-40 max-w-[92%] -translate-x-1/2 rounded-xl border border-warning/50 bg-warning/100/20 px-4 py-2 text-center text-xs leading-6 text-ink shadow-lg pointer-events-none transition-opacity duration-700', lockNoticeVisible ? 'opacity-100' : 'opacity-0')}>
            {tr('viewer_locked_note')}
            {screenLockSecure ? tr('viewer_secure_lock_note') : ''}
          </div>
        )}

      {cursorVisible && status === 'streaming' && remoteIsAndroid && (
          <div
            className="absolute pointer-events-none z-50"
            style={{
              left: cursorPos.x,
              top:  cursorPos.y,
              willChange: 'left, top',
            }}
          >
            {(
              /* Windows arrow cursor when viewing only */
              <svg width="16" height="20" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(1px 1px 1px rgba(0,0,0,0.8))' }}>
                <path d="M0 0 L0 16 L4 12 L7 19 L9 18 L6 11 L11 11 Z" fill="white" stroke="black" strokeWidth="1" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        )}

        {/* Control watermark */}
        {!popout && status === 'streaming' && controlEnabled && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-success/100/20 border border-success/30 text-success text-[10px] px-2 py-1 rounded-full pointer-events-none">
            <Mouse size={9}/> {tr('viewer_controlling_by', { name: user?.name || 'User' })}
          </div>
        )}

        {/* Adaptive mode badge */}
        {!popout && adaptiveMode && status === 'streaming' && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-info/20 border border-info/30 text-info text-[10px] px-2 py-1 rounded-full pointer-events-none">
            <Zap size={8} className="fill-info"/> {tr('viewer_adaptive')} · {preset.fps}fps
          </div>
        )}

        {/* Recording badge */}
        {recording && (
          <div className={clsx('absolute flex items-center gap-1 bg-danger/100/20 border border-danger/30 text-danger text-[10px] px-2 py-1 rounded-full pointer-events-none',
            adaptiveMode && status === 'streaming' ? 'top-8 left-2' : 'top-2 left-2')}>
            <Circle size={8} className="fill-danger animate-pulse"/> WebM {fmt(recDuration)}
          </div>
        )}

        {/* Server recording badge */}
        {svrRecording && (
          <div className={clsx('absolute flex items-center gap-1 bg-warning/20 border border-warning/30 text-warning text-[10px] px-2 py-1 rounded-full pointer-events-none',
            recording ? 'top-8 left-16' : adaptiveMode ? 'top-8 left-2' : 'top-2 left-2')}>
            <Circle size={8} className="fill-warning animate-pulse"/> JPEG
          </div>
        )}

        {/* Privacy overlay */}
        {privacyOn && status === 'streaming' && (
          <div className="absolute bottom-2 left-3 flex items-center gap-1.5 bg-primary/20 border border-primary/40 text-primary text-[10px] px-2.5 py-1 rounded-full pointer-events-none z-10">
            <EyeOff size={10}/> {tr('viewer_privacy_badge')}
          </div>
        )}

        {/* Drag & drop overlay */}
        {dragOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-info/15 border-2 border-info/60 border-dashed z-20 pointer-events-none rounded-b-xl">
            <Upload size={40} className="text-info mb-3"/>
            <p className="text-info text-sm font-semibold">{tr('viewer_drop_file')}</p>
            <p className="text-ink0 text-xs mt-1">{tr('viewer_drop_saved')}</p>
          </div>
        )}

        {/* File upload progress */}
        {uploadProgress !== null && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2.5 bg-canvas/95 border border-line text-xs px-4 py-2.5 rounded-xl shadow-xl z-30 min-w-[240px]">
            {uploadProgress === 100
              ? <><CheckCircle2 size={15} className="text-success shrink-0"/><span className="text-success">{tr('viewer_upload_done', { name: uploadFileName })}</span></>
              : <><Loader2 size={14} className="text-info animate-spin shrink-0"/><span className="text-ink truncate max-w-[190px]">{tr('viewer_uploading', { name: uploadFileName })}...</span></>
            }
          </div>
        )}

        {/* Control hint toast */}
        {!popout && showHint && (
          <div className={clsx('absolute bottom-10 left-1/2 -translate-x-1/2 text-xs px-3 py-1.5 rounded-full pointer-events-none transition-all',
            controlEnabled ? 'bg-success/100/20 text-success border border-success/30' : 'bg-surface2/80 text-ink')}>
            {controlEnabled ? tr('viewer_control_badge_on') : tr('viewer_control_badge_off')}
          </div>
        )}

        {/* Awaiting remote approval */}
        {permissionState === 'requesting' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-warning/100/25 border border-warning/50 text-warning text-xs px-4 py-2 rounded-xl pointer-events-none z-50 shadow-lg">
            {tr('viewer_waiting_approval')}
          </div>
        )}

        {/* Keyboard banner */}
        {!popout && keyboardMode && controlEnabled && status === 'streaming' && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-warning/100/20 border border-warning/30 text-warning text-xs px-3 py-1.5 rounded-full pointer-events-none">
            <Keyboard size={11}/> {tr('viewer_keyboard_badge')}
          </div>
        )}

        {/* Status overlay (connecting / error / disconnected) */}
        {status !== 'streaming' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            {status === 'connecting'   && <><Loader2 size={28} className="text-info animate-spin"/><p className="text-muted text-sm">{tr('viewer_connecting')}</p></>}
            {status === 'disconnected' && <><WifiOff size={28} className="text-muted"/><p className="text-muted text-sm">{tr('viewer_disconnected')}</p></>}
            {status === 'error'        && <><WifiOff size={28} className="text-danger"/><p className="text-danger text-sm">{errorMsg}</p></>}
            {status === 'unavailable'  && <><AlertTriangle size={28} className="text-warning"/><p className="text-warning text-sm text-center px-8">{errorMsg}</p></>}
          </div>
        )}

        {/* ── T006: In-session chat panel ── */}
        {/* Password prompt — password-based control (v3.3.0) */}
        {pwModal && (
          <div className="absolute inset-0 flex items-center justify-center bg-overlay/50 z-40" onClick={e => e.stopPropagation()}>
            <div className="bg-canvas border border-line rounded-2xl shadow-2xl w-[330px] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={15} className="text-success"/>
                <span className="text-sm font-semibold text-ink">{tr('viewer_pw_control')}</span>
              </div>
              <p className="text-xs text-muted mb-3">{tr('viewer_pw_desc')}</p>
              <input
                type="password"
                autoFocus
                value={pwInput}
                onChange={e => setPwInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitPw(); if (e.key === 'Escape') { pwActiveRef.current = false; setPwModal(false) } }}
                placeholder={tr('viewer_pw_placeholder')}
                className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-success/60"
                dir="ltr"
              />
              {pwError && <p className="text-xs text-danger mt-2">{pwError}</p>}
              <div className="flex gap-2 mt-4">
                <button onClick={submitPw} disabled={pwBusy || !pwInput.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg bg-success/100/15 border border-success/30 text-success hover:bg-success/100/25 disabled:opacity-40 transition-colors">
                  {pwBusy ? <Loader2 size={12} className="animate-spin"/> : <Shield size={12}/>}
                  {pwBusy ? tr('viewer_pw_verifying') : tr('viewer_pw_send')}
                </button>
                <button onClick={() => { pwActiveRef.current = false; setPwModal(false) }}
                  className="px-3 py-2 text-xs rounded-lg text-muted hover:text-ink hover:bg-surface2/70 transition-colors">
                  {tr('viewer_cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {chatOpen && (
          <div
            className="absolute bottom-3 right-3 z-40 flex flex-col w-80 rounded-2xl shadow-2xl overflow-hidden"
            style={{ height: '360px', background: 'rgba(8,12,28,0.97)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(56,189,248,0.15)' }}>
                  <MessageSquare size={11} className="text-info"/>
                </div>
                <span className="text-xs font-semibold text-ink tracking-wide">{tr('viewer_session_chat')}</span>
                {chatMessages.length > 0 && (
                  <span className="text-[10px] text-muted">{chatMessages.length}</span>
                )}
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="w-5 h-5 rounded-full flex items-center justify-center text-muted hover:text-ink transition-all"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <X size={11}/>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/50">
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 opacity-40">
                  <MessageSquare size={22} className="text-muted"/>
                  <p className="text-muted text-xs">{tr('viewer_no_messages')}</p>
                </div>
              ) : chatMessages.map((m, i) => (
                <div key={i} className={clsx('flex flex-col gap-1', m.sender === 'viewer' ? 'items-end' : 'items-start')}>
                  <div className={clsx('flex items-center gap-1.5 text-[10px] text-muted', m.sender === 'viewer' ? 'flex-row-reverse' : 'flex-row')}>
                    <div className={clsx(
                      'w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold',
                      m.sender === 'viewer' ? 'bg-info/25 text-info' : 'bg-line text-muted'
                    )}>
                      {m.sender === 'viewer' ? tr('viewer_avatar_you') : tr('viewer_avatar_device')}
                    </div>
                    <span>{m.sender === 'viewer' ? tr('viewer_you') : tr('viewer_device')}</span>
                    <span className="opacity-50">
                      {new Date(m.ts).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  </div>
                  <div className={clsx(
                    'max-w-[82%] text-xs leading-relaxed px-3 py-2 rounded-2xl',
                    m.sender === 'viewer'
                      ? 'bg-info/20 text-ink rounded-tr-sm'
                      : 'bg-surface2 text-ink rounded-tl-sm'
                  )} style={{
                    border: m.sender === 'viewer'
                      ? '1px solid rgba(56,189,248,0.18)'
                      : '1px solid rgba(100,116,139,0.25)'
                  }}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef}/>
            </div>

            {/* Input */}
            <div className="flex gap-2 p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleChatKey}
                placeholder={tr('viewer_chat_placeholder')}
                className="flex-1 rounded-xl px-3 py-2 text-xs text-ink placeholder:text-muted outline-none transition-all"
                style={{
                  background: 'rgba(30,41,59,0.7)',
                  border: '1px solid rgba(100,116,139,0.3)',
                }}
                onFocus={e => { e.currentTarget.style.border = '1px solid rgba(56,189,248,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(56,189,248,0.08)' }}
                onBlur={e => { e.currentTarget.style.border = '1px solid rgba(100,116,139,0.3)'; e.currentTarget.style.boxShadow = 'none' }}
              />
              <button
                onClick={sendChat}
                disabled={!chatInput.trim()}
                className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-info transition-all disabled:opacity-25 disabled:cursor-not-allowed"
                style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.2)' }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = 'rgba(56,189,248,0.25)'; e.currentTarget.style.borderColor = 'rgba(56,189,248,0.4)' } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(56,189,248,0.15)'; e.currentTarget.style.borderColor = 'rgba(56,189,248,0.2)' }}
              >
                <Send size={13}/>
              </button>
            </div>
          </div>
        )}
      </div>}
    </div>
  )
}
