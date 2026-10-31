/**
 * AnnotationLayer — laser pointer + pen overlay for a remote screen stream (R8.2).
 *
 * The layer sits exactly over the video canvas and speaks normalised coordinates
 * (0..1), so a mark lands on the same spot for every viewer regardless of window
 * size. It never touches the remote machine: events are relayed viewer-to-viewer
 * by the server.
 */
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export type AnnotationTool = 'off' | 'laser' | 'pen' | 'eraser'
export type AnnotationStrokeTool = 'laser' | 'pen'

export interface AnnotationPoint { x: number; y: number; t: number }
export interface AnnotationStroke {
  id: string
  tool: AnnotationStrokeTool
  color: string
  points: AnnotationPoint[]
}

export interface AnnotationEvent {
  tool: AnnotationStrokeTool | 'clear'
  id?: string
  phase?: 'start' | 'move' | 'end'
  x?: number
  y?: number
  color?: string
}

interface Props {
  strokes: AnnotationStroke[]
  tool: AnnotationTool
  color: string
  onEvent: (ev: AnnotationEvent) => void
  onErase: (x: number, y: number) => void
  className?: string
}

const LASER_TTL_MS = 1400

export default function AnnotationLayer({ strokes, tool, color, onEvent, onErase, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const strokeId = useRef<string>('')
  const drawing = useRef(false)
  const [, force] = useState(0)

  const pointOf = (clientX: number, clientY: number) => {
    const el = svgRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width))),
      y: Math.min(1, Math.max(0, (clientY - r.top) / Math.max(1, r.height)))
    }
  }

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === 'off') return
    e.preventDefault()
    e.stopPropagation()
    const p = pointOf(e.clientX, e.clientY)
    if (tool === 'eraser') { drawing.current = true; onErase(p.x, p.y); return }
    if (tool !== 'laser' && tool !== 'pen') return
    drawing.current = true
    strokeId.current = Math.random().toString(36).slice(2, 10)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
    onEvent({ tool, id: strokeId.current, phase: 'start', x: p.x, y: p.y, color })
  }

  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return
    e.preventDefault()
    e.stopPropagation()
    const p = pointOf(e.clientX, e.clientY)
    if (tool === 'eraser') { onErase(p.x, p.y); return }
    if (tool !== 'laser' && tool !== 'pen') return
    onEvent({ tool, id: strokeId.current, phase: 'move', x: p.x, y: p.y, color })
  }

  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return
    drawing.current = false
    if (tool !== 'laser' && tool !== 'pen') return
    const p = pointOf(e.clientX, e.clientY)
    onEvent({ tool, id: strokeId.current, phase: 'end', x: p.x, y: p.y, color })
  }

  // Laser marks fade: drop expired points on a slow tick so the trail evaporates.
  const hasLaser = strokes.some(s => s.tool === 'laser')
  useEffect(() => {
    if (!hasLaser) return
    const t = setInterval(() => force(n => n + 1), 120)
    return () => clearInterval(t)
  }, [hasLaser])

  const now = Date.now()
  const visible = strokes
    .map(s => s.tool === 'laser'
      ? { ...s, points: s.points.filter(p => now - p.t <= LASER_TTL_MS) }
      : s)
    .filter(s => s.points.length > 0)

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className={className}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        zIndex: 25,
        pointerEvents: tool === 'off' ? 'none' : 'auto',
        cursor: tool === 'off' ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair',
        touchAction: 'none'
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={e => e.preventDefault()}
    >
      {visible.map(s => {
        if (!s.points.length) return null
        if (s.tool === 'pen') {
          return (
            <polyline
              key={s.id}
              points={s.points.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity={0.95}
            />
          )
        }
        const last = s.points[s.points.length - 1]
        return (
          <g key={s.id}>
            {s.points.map((p, i) => {
              const age = Math.min(1, (now - p.t) / LASER_TTL_MS)
              const r = 0.008 * (1 - age * 0.6)
              return <circle key={i} cx={p.x} cy={p.y} r={r} fill={s.color} opacity={(1 - age) * 0.55} />
            })}
            <circle cx={last.x} cy={last.y} r={0.012} fill={s.color} opacity={0.95} />
            <circle cx={last.x} cy={last.y} r={0.026} fill={s.color} opacity={0.18} />
          </g>
        )
      })}
    </svg>
  )
}
