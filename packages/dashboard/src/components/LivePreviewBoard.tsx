import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Maximize2, Minimize2, MonitorPlay, Play, Plus, Square, X } from 'lucide-react'
import type { Device } from '@airemote/shared'
import { useUIStore } from '../store/uiStore'
import { clsx } from 'clsx'
import { ScreenViewer } from './ScreenViewer'

interface ActiveScreen { sessionId: string; viewers?: number }

const MAX_TILES = 6
const BOARD_STORAGE_KEY = 'airemote-live-board-v1'

type Size = 'sm' | 'md' | 'lg'
interface Tile { key: string; deviceId: string; running: boolean }

interface Props {
  devices: Device[]
  activeScreens: Record<string, ActiveScreen>
  onOpen: (deviceId: string) => void
}

function newKey (): string {
  return Math.random().toString(36).slice(2, 10)
}

function loadBoardSnapshot (): { tiles: Tile[]; size: Size } {
  try {
    const raw = localStorage.getItem(BOARD_STORAGE_KEY)
    if (!raw) return { tiles: [], size: 'lg' }
    const parsed = JSON.parse(raw) as { tiles?: Partial<Tile>[]; size?: Size }
    const tiles = (parsed.tiles || [])
      .filter(t => t && typeof t.key === 'string' && typeof t.deviceId === 'string')
      .slice(0, MAX_TILES)
      // 3.13.1 — always hydrate idle: coming back to the page must not resume any stream.
      .map(t => ({ key: String(t.key), deviceId: String(t.deviceId), running: false }))
    const size: Size = parsed.size === 'sm' || parsed.size === 'md' || parsed.size === 'lg' ? parsed.size : 'lg'
    return { tiles, size }
  } catch {
    return { tiles: [], size: 'lg' }
  }
}

/**
 * جدار المراقبة.
 * 3.13.0 — عارض واحد (ScreenViewer بوضع preview) بدل مكوّن ثانٍ.
 * 3.13.1 — استعادة ما فُقد: لا بث بلا ضغطة، تشغيل/إيقاف لكل مربع، تكبير، وبحد أقصى 3 أجهزة في الصف.
 */
export function LivePreviewBoard ({ devices, activeScreens, onOpen }: Props) {
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
  const [maxKey, setMaxKey] = useState<string | null>(null)

  // Persist the layout only — `running` is deliberately never saved.
  useEffect(() => {
    try {
      localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify({
        tiles: tiles.map(t => ({ key: t.key, deviceId: t.deviceId })),
        size
      }))
    } catch {}
  }, [tiles, size])

  useEffect(() => {
    if (!preferred) return
    setTiles(prev => {
      if (prev.length > 0) {
        return prev.map(t => devices.some(d => d.id === t.deviceId) ? t : { ...t, deviceId: preferred.id })
      }
      return [{ key: newKey(), deviceId: preferred.id, running: false }]
    })
  }, [preferred, devices])

  useEffect(() => {
    if (!maxKey) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMaxKey(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maxKey])

  function addTile () {
    if (tiles.length >= MAX_TILES) return
    const used = new Set(tiles.map(t => t.deviceId))
    const next = onlineDevices.find(d => !used.has(d.id)) || preferred
    if (!next) return
    setTiles(prev => [...prev, { key: newKey(), deviceId: next.id, running: false }])
  }

  function removeTile (key: string) {
    setTiles(prev => prev.length > 1 ? prev.filter(t => t.key !== key) : prev)
    setMaxKey(prev => prev === key ? null : prev)
  }

  function toggleRun (key: string) {
    setTiles(prev => prev.map(t => t.key === key ? { ...t, running: !t.running } : t))
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <MonitorPlay size={13} className="text-info" />
        <span className="text-xs font-semibold text-ink">{tr('جدار المراقبة', 'Monitor wall')}</span>
        <span className="text-[10px] text-muted" dir="ltr">{tiles.length}/{MAX_TILES}</span>
        <div className="ms-auto flex items-center gap-1">
          {(['sm', 'md', 'lg'] as Size[]).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              aria-pressed={size === s}
              title={s === 'sm' ? tr('مصغّر', 'Small') : s === 'md' ? tr('متوسط', 'Medium') : tr('كبير', 'Large')}
              className={clsx('h-6 w-6 rounded text-[10px] font-medium transition-colors',
                size === s ? 'bg-info/20 text-info' : 'text-muted hover:bg-surface2 hover:text-ink')}
            >
              {s === 'sm' ? 'S' : s === 'md' ? 'M' : 'L'}
            </button>
          ))}
          <button
            type="button"
            onClick={addTile}
            disabled={tiles.length >= MAX_TILES}
            title={tr('إضافة بث', 'Add stream')}
            className="rounded p-1 text-muted transition-colors hover:bg-surface2 hover:text-ink disabled:opacity-40"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {tiles.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-line py-8 text-xs text-muted">
          {tr('لا أجهزة للمراقبة', 'No devices to monitor')}
        </div>
      ) : (
        <div className={clsx(
          'grid gap-3',
          // 3.13.1 — never more than three devices per row.
          size === 'sm' && 'grid-cols-2 md:grid-cols-3',
          size === 'md' && 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
          size === 'lg' && 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3'
        )}>
          {tiles.map(tile => {
            const device = devices.find(d => d.id === tile.deviceId)
            const online = !!device && device.status === 'online'
            const live = !!activeScreens[tile.deviceId]
            const maximized = maxKey === tile.key
            return (
              <div
                key={tile.key}
                className={clsx(
                  'overflow-hidden rounded-xl border border-line bg-surface',
                  maximized && 'fixed inset-0 z-[95] flex flex-col rounded-none border-0 bg-canvas p-2'
                )}
              >
                <div className={clsx('relative bg-code', maximized ? 'min-h-0 flex-1' : 'aspect-video')}>
                  {online && device ? (
                    <ScreenViewer
                      key={`${tile.key}:${tile.running ? 'run' : 'idle'}`}
                      preview
                      autoStart={tile.running}
                      deviceId={device.id}
                      deviceName={device.name}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-muted">
                      {tr('غير متصل', 'Offline')}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">
                    {device?.name || tile.deviceId.slice(0, 10)}
                  </span>
                  {live && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" title={tr('بث نشط', 'Live')} />}
                  <button
                    type="button"
                    onClick={() => toggleRun(tile.key)}
                    title={tile.running ? tr('إيقاف البث', 'Stop stream') : tr('تشغيل البث', 'Start stream')}
                    aria-label={tile.running ? tr('إيقاف البث', 'Stop stream') : tr('تشغيل البث', 'Start stream')}
                    aria-pressed={tile.running}
                    className={clsx('rounded p-1 transition-colors',
                      tile.running
                        ? 'text-danger hover:bg-danger/15'
                        : 'text-muted hover:bg-surface2 hover:text-ink')}
                  >
                    {tile.running ? <Square size={12} /> : <Play size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaxKey(prev => prev === tile.key ? null : tile.key)}
                    title={maximized ? tr('تصغير', 'Restore') : tr('تكبير', 'Maximize')}
                    aria-label={maximized ? tr('تصغير', 'Restore') : tr('تكبير', 'Maximize')}
                    className="rounded p-1 text-muted transition-colors hover:bg-surface2 hover:text-ink"
                  >
                    {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpen(tile.deviceId)}
                    title={tr('فتح الشاشة', 'Open screen')}
                    className="rounded p-1 text-muted transition-colors hover:bg-surface2 hover:text-ink"
                  >
                    <ExternalLink size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTile(tile.key)}
                    disabled={tiles.length <= 1}
                    title={tr('إزالة', 'Remove')}
                    className="rounded p-1 text-muted transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-40"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
