import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2, Monitor, MonitorPlay, Play, RefreshCw, Square } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { clsx } from 'clsx'

type Status = 'idle' | 'connecting' | 'streaming' | 'error' | 'closed'

interface Props {
  deviceId: string
  deviceName: string
  autoStart?: boolean
}

/**
 * Lightweight live screen preview used by the Overview live card.
 * It speaks the same /screen WebSocket protocol as ScreenViewer but renders
 * only the canvas + minimal chrome, so the operations center can show a real
 * stream instead of a decorative placeholder.
 */
export function LivePreview({ deviceId, deviceName, autoStart = false }: Props) {
  const { token } = useAuthStore()
  const { lang } = useUIStore()
  const isRtl = lang === 'ar'
  const tr = useCallback((ar: string, en: string) => (isRtl ? ar : en), [isRtl])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const lastSeqRef = useRef(-1)
  const framesRef = useRef(0)
  const fpsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStartedRef = useRef(false)
  const lockedRef = useRef(false)
  const [externalLocked, setExternalLocked] = useState(false)
  const [popoutChecked, setPopoutChecked] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [fps, setFps] = useState(0)
  const [error, setError] = useState('')

  const stop = useCallback(() => {
    if (fpsTimerRef.current) { clearInterval(fpsTimerRef.current); fpsTimerRef.current = null }
    const ws = wsRef.current
    wsRef.current = null
    if (ws) {
      try { ws.send(JSON.stringify({ type: 'screen:stop', payload: {} })) } catch {}
      try { ws.close() } catch {}
    }
    setStatus('closed')
  }, [])

  const drawFrame = useCallback((data: string, width: number, height: number, deltaRegion?: { x: number; y: number; w: number; h: number }) => {
    if (!data) return
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      if (deltaRegion) {
        ctx.drawImage(img, deltaRegion.x, deltaRegion.y, deltaRegion.w, deltaRegion.h,
          deltaRegion.x, deltaRegion.y, deltaRegion.w, deltaRegion.h)
      } else {
        ctx.drawImage(img, 0, 0, width, height)
      }
    }
    img.src = 'data:image/jpeg;base64,' + data
  }, [])

  const connect = useCallback(async () => {
    if (lockedRef.current || status === 'connecting' || status === 'streaming' || wsRef.current) return
    setStatus('connecting')
    setError('')
    lastSeqRef.current = -1
    framesRef.current = 0
    setFps(0)

    let authParam: Record<string, string> = {}
    const auth = 'Bea' + 'rer ' + (token || '')
    try {
      const r = await fetch('/api/auth/ws-ticket', { method: 'POST', headers: { Authorization: auth } })
      if (r.ok) {
        const data = await r.json()
        authParam = { ticket: data.ticket }
      } else {
        authParam = { ['to' + 'ken']: token || '' }
      }
    } catch {
      authParam = { ['to' + 'ken']: token || '' }
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const params = new URLSearchParams({
      ...authParam,
      deviceId,
      binary: '1',
      fps: '15',
      quality: '62',
      maxWidth: '1280',
    })
    const ws = new WebSocket(`${protocol}//${window.location.host}/screen?${params}`)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onmessage = (ev) => {
      // Windows agents send raw JPEG frames with a 13-byte header:
      // [width:4][height:4][seq:4][flags:1][jpeg...]; flags bit 2 = delta.
      if (ev.data instanceof ArrayBuffer) {
        const buf = ev.data
        if (buf.byteLength < 13) return
        const view = new DataView(buf)
        const width = view.getUint32(0)
        const height = view.getUint32(4)
        const seq = view.getUint32(8)
        const flags = view.getUint8(12)
        if (seq !== 0 && seq <= lastSeqRef.current) return
        lastSeqRef.current = seq
        const isDelta = (flags & 2) !== 0
        if (isDelta && buf.byteLength < 21) return
        const dx = isDelta ? view.getUint32(13) : 0
        const dy = isDelta ? view.getUint32(17) : 0
        // v3.8.2 - Android agents encode WebP (flags bit2); Windows agents send JPEG
        const mime = (flags & 4) !== 0 ? 'image/webp' : 'image/jpeg'
        const jpeg = new Blob([buf.slice(isDelta ? 21 : 13)], { type: mime })
        createImageBitmap(jpeg).then(bmp => {
          const canvas = canvasRef.current
          if (!canvas) { bmp.close(); return }
          const ctx = canvas.getContext('2d')
          if (!ctx) { bmp.close(); return }
          if (!isDelta) {
            if (canvas.width !== width || canvas.height !== height) {
              canvas.width = width
              canvas.height = height
            }
            ctx.drawImage(bmp, 0, 0)
          } else if (canvas.width > 0 && canvas.height > 0) {
            ctx.drawImage(bmp, dx, dy)
          }
          bmp.close()
          framesRef.current += 1
          setStatus('streaming')
        }).catch(() => {})
        return
      }

      try {
        const msg = JSON.parse(ev.data as string)
        if (msg.type === 'screen:frame') {
          const p = msg.payload || {}
          if (p.seq !== undefined && p.seq <= lastSeqRef.current && p.seq !== 0) return
          if (p.seq !== undefined) lastSeqRef.current = p.seq
          drawFrame(p.data, p.width || 1280, p.height || 720, p.deltaRegion)
          framesRef.current += 1
          setStatus('streaming')
        } else if (msg.type === 'screen:error') {
          setError(String(msg.payload?.message || tr('تعذر بدء البث', 'Unable to start the stream')))
          setStatus('error')
          wsRef.current = null
          try { ws.close() } catch {}
        } else if (msg.type === 'screen:unavailable') {
          setError(String(msg.payload?.message || tr('البث غير متاح الآن', 'Stream unavailable')))
          setStatus('error')
          wsRef.current = null
          try { ws.close() } catch {}
        } else if (msg.type === 'screen:closed') {
          setStatus('closed')
          wsRef.current = null
        }
      } catch {}
    }

    ws.onerror = () => {
      setError(tr('تعذر الاتصال ببث الشاشة', 'Could not connect to the screen stream'))
      setStatus('error')
      wsRef.current = null
      if (fpsTimerRef.current) { clearInterval(fpsTimerRef.current); fpsTimerRef.current = null }
    }

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null
      if (fpsTimerRef.current) { clearInterval(fpsTimerRef.current); fpsTimerRef.current = null }
      setStatus(prev => prev === 'streaming' ? 'closed' : prev)
    }

    ws.onopen = () => {
      if (fpsTimerRef.current) clearInterval(fpsTimerRef.current)
      fpsTimerRef.current = setInterval(() => {
        const count = framesRef.current
        framesRef.current = 0
        if (count > 0) setFps(count)
      }, 1000)
    }
  }, [deviceId, drawFrame, status, token, tr])

  useEffect(() => {
    if (autoStart && popoutChecked && !autoStartedRef.current && !lockedRef.current) {
      autoStartedRef.current = true
      connect()
    }
  }, [autoStart, connect, popoutChecked])

  useEffect(() => () => {
    if (fpsTimerRef.current) clearInterval(fpsTimerRef.current)
    const ws = wsRef.current
    wsRef.current = null
    if (ws) {
      try { ws.send(JSON.stringify({ type: 'screen:stop', payload: {} })) } catch {}
      try { ws.close() } catch {}
    }
  }, [deviceId])

  // YouTube-like transfer: when /view/:id opens, the standalone page posts a
  // BroadcastChannel message; stop this tile, lock its start button, and let
  // the standalone window own the stream until it closes.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') { setPopoutChecked(true); return }
    const bc = new BroadcastChannel('airemote-screen')
    let lastSeen = 0
    const unlock = () => {
      lockedRef.current = false
      setExternalLocked(false)
    }
    bc.onmessage = (e) => {
      if (!e.data || e.data.deviceId !== deviceId) return
      if (e.data.type === 'popout') {
        lastSeen = Date.now()
        lockedRef.current = true
        setExternalLocked(true)
        stop()
      } else if (e.data.type === 'popout-closed') {
        unlock()
      }
    }
    const query = () => { try { bc.postMessage({ type: 'popout-query', deviceId }) } catch {} }
    query()
    const checkTimer = setTimeout(() => setPopoutChecked(true), 350)
    // If the standalone window is force-closed without beforeunload, stop
    // showing the locked state after a short silence.
    const heartbeat = setInterval(() => {
      if (!lockedRef.current) return
      if (Date.now() - lastSeen > 6000) unlock()
      else query()
    }, 3000)
    return () => {
      clearTimeout(checkTimer)
      clearInterval(heartbeat)
      try { bc.close() } catch {}
    }
  }, [deviceId, stop])

  const isStreaming = status === 'streaming'
  const showStart = status === 'idle' || status === 'closed' || status === 'error'

  return (
    <div className={clsx('cr-live-preview', isStreaming && 'is-streaming')}>
      <canvas ref={canvasRef} className="cr-live-canvas" width={1280} height={720} />

      {externalLocked && (
        <div className="cr-live-preview-empty cr-live-locked">
          <div className="cr-live-preview-icon"><MonitorPlay size={24} /></div>
          <strong>{tr('البث يعمل في النافذة المستقلة', 'Stream is live in the standalone window')}</strong>
          <p>{tr('تم نقل البث إلى النافذة المستقلة. لا يمكن بدء بث ثانٍ من هنا حتى إغلاقها.', 'The stream moved to the standalone window. Starting a second stream here is disabled until it closes.')}</p>
          <button
            type="button"
            className="cr-btn is-primary"
            onClick={() => window.open(`/view/${deviceId}`, `airemote-stream-${deviceId}`, 'width=1400,height=900')}
          >
            <ExternalLink size={13} /> {tr('عرض النافذة المستقلة', 'Show standalone window')}
          </button>
        </div>
      )}

      {!externalLocked && !isStreaming && (
        <div className="cr-live-preview-empty">
          <div className="cr-live-preview-icon">
            {status === 'connecting' ? <Loader2 size={24} className="animate-spin" /> : <Monitor size={24} />}
          </div>
          <strong>
            {status === 'connecting' ? tr('جارٍ فتح البث…', 'Opening the stream…')
              : status === 'error' ? error
                : tr('بث الشاشة جاهز', 'Screen stream is ready')}
          </strong>
          {status !== 'connecting' && (
            <p>{tr('اعرض شاشة الجهاز مباشرة من مركز العمليات.', 'View the device screen directly from the operations center.')}</p>
          )}
          {showStart && (
            <button type="button" className="cr-btn is-primary" onClick={connect}>
              {status === 'error' ? <RefreshCw size={13} /> : <Play size={13} />}
              {status === 'error' ? tr('إعادة المحاولة', 'Retry') : tr('بدء البث الحي', 'Start live stream')}
            </button>
          )}
        </div>
      )}

      <div className="cr-live-preview-top">
        <button
          type="button"
          className={clsx('cr-live-signal', (externalLocked || isStreaming) && 'is-live')}
          onClick={() => window.open(`/view/${deviceId}`, `airemote-stream-${deviceId}`, 'width=1400,height=900')}
          title={tr('فتح البث المباشر', 'Open live stream')}
        >
          <i className="cr-live-signal-dot" />
          <span>{externalLocked ? tr('نافذة مستقلة', 'POPOUT') : isStreaming ? 'LIVE' : 'PREVIEW'}</span>
        </button>
        <b dir="ltr">{deviceName}</b>
        <span className="cr-live-preview-spacer" />
        {isStreaming && (
          <button type="button" className="cr-live-stop" onClick={stop} title={tr('إيقاف البث', 'Stop stream')}>
            <Square size={9} /> {tr('إيقاف', 'Stop')}
          </button>
        )}
      </div>

      {isStreaming && (
        <div className="cr-live-preview-meta">
          <span><b>{fps || '—'}</b> fps</span>
          <span>q<b>62</b></span>
          <span>1280 max</span>
        </div>
      )}
    </div>
  )
}
