import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Eye, EyeOff, Maximize2, Plus, RotateCw, Square, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Device } from '@airemote/shared'
import { useUIStore } from '../store/uiStore'
import { clsx } from 'clsx'
import { LivePreview } from './LivePreview'

interface ActiveScreen { sessionId: string; viewers?: number }

const MAX_TILES = 6

interface Props {
  devices: Device[]
  activeScreens: Record<string, ActiveScreen>
  onOpen: (deviceId: string) => void
}

type Size = 'sm' | 'md' | 'lg'

interface Tile {
  key: string
  deviceId: string
  hidden: boolean
  rotated: boolean
  audioMuted: boolean
}

type BoardSnapshot = { tiles: Tile[]; size: Size }
const BOARD_STORAGE_KEY = 'airemote-live-board-v1'

function loadBoardSnapshot(): BoardSnapshot {
  try {
    const raw = localStorage.getItem(BOARD_STORAGE_KEY)
    if (!raw) return { tiles: [], size: 'lg' }
    const parsed = JSON.parse(raw) as { tiles?: Partial<Tile>[]; size?: Size }
    const tiles = (parsed.tiles || [])
      .filter(t => t && typeof t.key === 'string' && typeof t.deviceId === 'string')
      .slice(0, MAX_TILES)
      .map(t => ({
        key: String(t.key),
        deviceId: String(t.deviceId),
        hidden: !!t.hidden,
        rotated: !!t.rotated,
        audioMuted: t.audioMuted !== false,
      }))
    const size: Size = parsed.size === 'sm' || parsed.size === 'md' || parsed.size === 'lg' ? parsed.size : 'lg'
    return { tiles, size }
  } catch {
    return { tiles: [], size: 'lg' }
  }
}

function newKey() {
  try { return crypto.randomUUID() } catch { return 'tile-' + Math.random().toString(36).slice(2) }
}

export function LivePreviewBoard({ devices, activeScreens, onOpen }: Props) {
  const { lang } = useUIStore()
  const isRtl = lang === 'ar'
  const tr = (ar: string, en: string) => (isRtl ? ar : en)

  const onlineDevices = useMemo(() => devices.filter(d => d.status === 'online'), [devices])
  const preferred = useMemo(() => (
    onlineDevices.find(d => String(d.info?.platform || '').toLowerCase() === 'android' && !/emulator/i.test(d.name))
    || onlineDevices[0]
    || devices[0]
  ), [devices, onlineDevices])

  const [tiles, setTiles] = useState<Tile[]>(() => loadBoardSnapshot().tiles)
  const [size, setSize] = useState<Size>(() => loadBoardSnapshot().size)

  useEffect(() => {
    try { localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify({ tiles, size })) } catch {}
  }, [tiles, size])

  useEffect(() => {
    if (!preferred) return
    setTiles(prev => {
      if (prev.length > 0) {
        // Keep selections valid if a device disappears.
        return prev.map(t => devices.some(d => d.id === t.deviceId) ? t : { ...t, deviceId: preferred.id })
      }
      return [{ key: newKey(), deviceId: preferred.id, hidden: false, rotated: false, audioMuted: true }]
    })
  }, [preferred, devices])

  function addTile() {
    if (tiles.length >= MAX_TILES) return
    const used = new Set(tiles.map(t => t.deviceId))
    const next = onlineDevices.find(d => !used.has(d.id)) || preferred
    if (!next) return
    setTiles(prev => [...prev, { key: newKey(), deviceId: next.id, hidden: false, rotated: false, audioMuted: true }])
  }

  function removeTile(key: string) {
    setTiles(prev => prev.length > 1 ? prev.filter(t => t.key !== key) : prev)
  }

  function setDevice(key: string, deviceId: string) {
    setTiles(prev => prev.map(t => t.key === key ? { ...t, deviceId } : t))
  }

  function toggleHidden(key: string) {
    setTiles(prev => prev.map(t => t.key === key ? { ...t, hidden: !t.hidden } : t))
  }

  function toggleRotate(key: string) {
    setTiles(prev => prev.map(t => t.key === key ? { ...t, rotated: !t.rotated } : t))
  }

  function toggleAudio(key: string) {
    setTiles(prev => prev.map(t => t.key === key ? { ...t, audioMuted: !t.audioMuted } : t))
  }

  function toggleFullscreen(event: React.MouseEvent<HTMLButtonElement>) {
    const node = event.currentTarget.closest('.cr-live-tile') as HTMLElement | null
    const wc = (window as unknown as { airemote?: { windowCtl?: { setFullscreen?: (on: boolean) => void } } }).airemote?.windowCtl
    if (wc?.setFullscreen) {
      const next = node?.dataset.fullscreen !== 'true'
      wc.setFullscreen(next)
      if (node) node.dataset.fullscreen = String(next)
      return
    }
    if (!document.fullscreenElement) node?.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.().catch(() => {})
  }

  function toggleStream(event: React.MouseEvent<HTMLButtonElement>) {
    const tile = event.currentTarget.closest('.cr-live-tile') as HTMLElement | null
    if (!tile) return
    const stop = tile.querySelector('.cr-live-stop') as HTMLButtonElement | null
    if (stop) { stop.click(); return }
    const start = tile.querySelector('.cr-live-preview .cr-btn.is-primary') as HTMLButtonElement | null
    start?.click()
  }

  function renderControls(tile: Tile, deviceId: string) {
    return (
      <div className="cr-live-tile-controls">
        <button type="button" className="cr-live-ctl" onClick={toggleStream} title={tr('إيقاف/تشغيل البث', 'Stop/start stream')}>
          <Square size={9} /> {tr('إيقاف', 'Stop')}
        </button>
        <button type="button" className={clsx('cr-live-ctl', tile.audioMuted && 'is-muted')} onClick={() => toggleAudio(tile.key)} title={tr('كتم/تشغيل الصوت', 'Mute/unmute audio')}>
          {tile.audioMuted ? <VolumeX size={11} /> : <Volume2 size={11} />} {tile.audioMuted ? tr('الصوت مكتوم', 'Muted') : tr('الصوت', 'Audio')}
        </button>
        <button type="button" className="cr-live-ctl" onClick={() => toggleRotate(tile.key)} title={tr('تدوير العرض', 'Rotate view')}>
          <RotateCw size={11} /> {tr('تدوير', 'Rotate')}
        </button>
        <button type="button" className="cr-live-ctl" onClick={toggleFullscreen} title={tr('ملء الشاشة', 'Fullscreen')}>
          <Maximize2 size={11} /> {tr('ملء الشاشة', 'Fullscreen')}
        </button>
        <button type="button" className="cr-live-ctl" onClick={() => onOpen(deviceId)} title={tr('فتح النافذة المستقلة', 'Open standalone window')}>
          <ExternalLink size={11} /> {tr('نافذة مستقلة', 'Standalone')}
        </button>
      </div>
    )
  }

  return (
    <div className="cr-live-board">
      <div className="cr-live-board-tools">
        <span className="cr-live-board-count">{tiles.length} {tr('شاشات', 'screens')}</span>
        <div className="cr-live-size-group" role="group" aria-label={tr('حجم العرض', 'Preview size')}>
          {(['sm', 'md', 'lg'] as Size[]).map(s => (
            <button
              key={s}
              type="button"
              className={clsx('cr-live-size-btn', size === s && 'is-active')}
              onClick={() => setSize(s)}
              title={s === 'sm' ? tr('صغير', 'Small') : s === 'md' ? tr('متوسط', 'Medium') : tr('كبير', 'Large')}
            >
              {s === 'sm' ? 'S' : s === 'md' ? 'M' : 'L'}
            </button>
          ))}
        </div>
        <span className="cr-live-board-spacer" />
        <button type="button" className="cr-live-tool-btn" onClick={addTile} disabled={tiles.length >= MAX_TILES} title={tr('إضافة بث', 'Add stream')} aria-label={tr('إضافة بث', 'Add stream')}>
          <Plus size={12} /> {tr('إضافة بث', 'Add stream')}
        </button>
      </div>

      <div className={clsx('cr-live-board-grid', `is-${size}`, tiles.length > 1 && 'is-multi')}>
        {tiles.map(tile => {
          const device = devices.find(d => d.id === tile.deviceId)
          if (!device) return null
          return (
            <div className={clsx('cr-live-tile', tile.rotated && 'is-rotated')} key={tile.key}>
              <div className="cr-live-tile-head">
                <select
                  value={tile.deviceId}
                  onChange={e => setDevice(tile.key, e.target.value)}
                  className="cr-live-device-select"
                  aria-label={tr('اختيار الجهاز', 'Select device')}
                >
                  {onlineDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button
                  type="button"
                  className="cr-live-icon-btn"
                  onClick={() => toggleHidden(tile.key)}
                  title={tile.hidden ? tr('إظهار البث', 'Show stream') : tr('إخفاء البث', 'Hide stream')}
                >
                  {tile.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button
                  type="button"
                  className="cr-live-icon-btn"
                  onClick={toggleFullscreen}
                  title={tr('ملء الشاشة', 'Fullscreen')}
                  aria-label={tr('ملء الشاشة', 'Fullscreen')}
                >
                  <Maximize2 size={13} />
                </button>
                {tiles.length > 1 && (
                  <button
                    type="button"
                    className="cr-live-icon-btn is-danger"
                    onClick={() => removeTile(tile.key)}
                    title={tr('إزالة البث', 'Remove stream')}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {renderControls(tile, tile.deviceId)}

              {tile.hidden ? (
                <div className="cr-live-hidden">
                  <EyeOff size={22} />
                  <strong>{tr('البث مخفي', 'Stream hidden')}</strong>
                  <button type="button" className="cr-btn" onClick={() => toggleHidden(tile.key)}>
                    <Eye size={12} /> {tr('إظهار', 'Show')}
                  </button>
                </div>
              ) : (
                <LivePreview
                  key={tile.deviceId}
                  deviceId={tile.deviceId}
                  deviceName={device.name}
                  autoStart={!!activeScreens[tile.deviceId]}
                />
              )}

              <div className="cr-live-tile-foot">
                <Link to={`/devices/${tile.deviceId}`} className="cr-live-foot-btn">
                  {tr('مساحة الجهاز', 'Device workspace')}
                </Link>
                <span className="cr-live-board-spacer" />
                {tile.hidden && <span className="cr-live-hidden-tag"><Trash2 size={10} /> {tr('مخفي', 'hidden')}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
