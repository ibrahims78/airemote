import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Maximize2, Minimize2, Monitor, MonitorPlay, Play, Plus, Square, X } from 'lucide-react'
import type { Device } from '@airemote/shared'
import { useUIStore } from '../store/uiStore'
import { useT } from '../lib/i18n'
import { clsx } from 'clsx'
import { ScreenViewer } from './ScreenViewer'

interface ActiveScreen { sessionId: string; viewers?: number }
interface Stats { cpuPercent?: number; ramPercent?: number }

const MAX_TILES = 6
const BOARD_STORAGE_KEY = 'airemote-live-board-v1'
type Size = 'sm' | 'md' | 'lg'
interface Tile { key: string; deviceId: string; running: boolean }

interface Props {
  devices: Device[]
  statsMap: Record<string, Stats | undefined>
  activeScreens: Record<string, ActiveScreen>
  loading?: boolean
  hasError?: boolean
  onOpen: (deviceId: string) => void
  onRetry: () => void
}

const PLATFORM_RANK: Record<string, number> = { windows: 0, macos: 1, linux: 1, android: 2 }

/**
 * ترتيب المرجع (D53): سطح المكتب أولًا ثم أندرويد — design/server.html
 * يعرض WIN10 · WIN11 · Android من اليمين إلى اليسار. الترتيب مستقر.
 */
function wallRank (d: Device): number {
  const platform = String(d.info?.platform || '').toLowerCase()
  return PLATFORM_RANK[platform] ?? 1
}

function newKey (): string {
  return Math.random().toString(36).slice(2, 10)
}

function loadSnapshot (): { tiles: Tile[]; size: Size } {
  try {
    const raw = localStorage.getItem(BOARD_STORAGE_KEY)
    if (!raw) return { tiles: [], size: 'lg' }
    const parsed = JSON.parse(raw) as { tiles?: Partial<Tile>[]; size?: Size }
    const tiles = (parsed.tiles || [])
      .filter(t => t && typeof t.key === 'string' && typeof t.deviceId === 'string')
      .slice(0, MAX_TILES)
      // 3.13.1 — always hydrate idle: returning to the page must not resume any stream.
      .map(t => ({ key: String(t.key), deviceId: String(t.deviceId), running: false }))
    const size: Size = parsed.size === 'sm' || parsed.size === 'md' || parsed.size === 'lg' ? parsed.size : 'lg'
    return { tiles, size }
  } catch {
    return { tiles: [], size: 'lg' }
  }
}

/**
 * جسم غرفة العمليات — بنية design/server.html: `.dash-head` ثم `.fleet` ثم `.wall`.
 * 3.14.0 — كل صنف من المرجع (control-room-ref.css)؛ لا قياس بلا قبل/بعد (D54).
 */
export function ControlRoomBody ({ devices, statsMap, activeScreens, hasError, onOpen, onRetry }: Props) {
  const { lang } = useUIStore()
  const T = useT()
  const isRtl = lang === 'ar'
  const tr = (ar: string, en: string) => (isRtl ? ar : en)

  const onlineDevices = useMemo(() => devices.filter(d => d.status === 'online'), [devices])
  const preferred = useMemo(() => (
    onlineDevices.find(d => String(d.info?.platform || '').toLowerCase() === 'android' && !/emulator/i.test(d.name))
    || onlineDevices[0]
    || devices[0]
  ), [devices, onlineDevices])

  const [tiles, setTiles] = useState<Tile[]>(() => loadSnapshot().tiles)
  const [size, setSize] = useState<Size>(() => loadSnapshot().size)
  const [maxKey, setMaxKey] = useState<string | null>(null)

  const liveCount = Object.keys(activeScreens).length
  const alerts = onlineDevices.filter(d => {
    const s = statsMap[d.id] || d.stats
    return !!s && ((s.cpuPercent ?? 0) > 85 || (s.ramPercent ?? 0) > 85)
  }).length

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
      const seed = [...onlineDevices].sort((a, b) => wallRank(a) - wallRank(b)).slice(0, 3)
      if (seed.length === 0) return [{ key: newKey(), deviceId: preferred.id, running: false }]
      return seed.map(d => ({ key: newKey(), deviceId: d.id, running: false }))
    })
  }, [preferred, devices, onlineDevices])

  useEffect(() => {
    if (!maxKey) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMaxKey(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maxKey])

  function addTile () {
    if (tiles.length >= MAX_TILES) return
    const used = new Set(tiles.map(t => t.deviceId))
    const next = [...onlineDevices].sort((a, b) => wallRank(a) - wallRank(b)).find(d => !used.has(d.id)) || preferred
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
    <>
      <div className="dash-head">
        <h1>{T('ov_room')}</h1>
        <div className="metrics">
          <div className="metric">
            <b>{onlineDevices.length}</b>
            <span>{tr('أجهزة متصلة', 'devices online')}</span>
            <a className="linkbtn" href="/devices">{T('view_all')}</a>
          </div>
          <div className="metric"><b>{liveCount}</b><span>{tr('بث نشط', 'active stream')}</span></div>
          <div className="metric"><b>{alerts}</b><span>{tr('تنبيهات', 'alerts')}</span></div>
        </div>
        <div className="grow" />
        <div className="seg" role="group" aria-label={tr('حجم المربّع', 'Tile size')}>
          {(['sm', 'md', 'lg'] as Size[]).map(s => (
            <button key={s} type="button" onClick={() => setSize(s)} className={size === s ? 'on' : undefined} aria-pressed={size === s}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
        <button type="button" className="btn primary" onClick={addTile} disabled={tiles.length >= MAX_TILES}>
          <Plus size={12} /> {tr('إضافة بث', 'Add stream')}
        </button>
      </div>

      {hasError && (
        <div className="aibar on" role="alert">
          <X size={14} />
          <span>{tr('تعذّر الاتصال بالسيرفر — إعادة المحاولة', 'Could not reach the server — retry')}</span>
          <button type="button" className="btn ghost sm" onClick={onRetry}>{tr('إعادة المحاولة', 'Retry')}</button>
        </div>
      )}

      <div className="fleet">
        {devices.map(device => {
          const online = device.status === 'online'
          const stats = statsMap[device.id] || device.stats
          const cpu = stats && typeof stats.cpuPercent === 'number' ? `${Math.round(stats.cpuPercent)}%` : '—'
          const ram = stats && typeof stats.ramPercent === 'number' ? `${Math.round(stats.ramPercent)}%` : '—'
          return (
            <div className="fcard" key={device.id}>
              <div className="top">
                <Monitor size={12} />
                <span className="nm">{device.name}</span>
                <div className="grow" />
                <span className={clsx('chip', online ? 'ok' : 'off')}>
                  <span className="dot" />{online ? tr('مباشر', 'Live') : tr('غير متصل', 'Offline')}
                </span>
              </div>
              <div className="rows">
                <div><b>{tr('النظام', 'OS')}</b> {device.info?.platform || '—'}{device.info?.arch ? ` · ${device.info.arch}` : ''}</div>
                <div><b>{tr('المضيف', 'Host')}</b> {device.info?.hostname || device.id.slice(0, 12)}</div>
                <div><b>{tr('الموارد', 'Resources')}</b> {online ? `${cpu} · ${ram}` : '—'}</div>
              </div>
              <div className="acts">
                <button type="button" className="btn ghost sm" onClick={() => onOpen(device.id)}>
                  <ExternalLink size={12} /> {tr('فتح', 'Open')}
                </button>
                {online && (
                  <button type="button" className="btn ghost sm" onClick={() => onOpen(device.id)}>
                    <MonitorPlay size={12} /> {tr('بث', 'Stream')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {tiles.length === 0 ? (
        <div className="ph" style={{ padding: '32px 0' }}>
          <div className="big">{tr('لا أجهزة للمراقبة — أضف جهازًا', 'No devices to monitor — add a device')}</div>
        </div>
      ) : (
        <div className="wall">
          {tiles.map(tile => {
            const device = devices.find(d => d.id === tile.deviceId)
            const online = !!device && device.status === 'online'
            const live = !!activeScreens[tile.deviceId]
            const maximized = maxKey === tile.key
            const name = device?.name || tile.deviceId.slice(0, 10)
            const state = !online ? tr('غير متصل', 'Offline') : live ? tr('مباشر', 'Live') : tr('متوقف', 'Stopped')
            return (
              <div key={tile.key} className={clsx('tile', maximized && 'is-max')}>
                <div className="screen">
                  {online && device && tile.running ? (
                    <div className="cr-wall-live">
                      <ScreenViewer
                        key={`${tile.key}:run`}
                        preview
                        autoStart
                        deviceId={device.id}
                        deviceName={device.name}
                      />
                    </div>
                  ) : (
                    <div className="ph">
                      <div className="big">{name}</div>
                      <div>{online ? tr('لا بث — اضغط تشغيل', 'No stream — press play') : tr('غير متصل', 'Offline')}</div>
                    </div>
                  )}
                </div>
                <div className="foot">
                  <span className="name">{name}</span>
                  <span className={clsx('chip', online && live ? 'ok' : 'off')}>
                    <span className="dot" />
                    {state}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleRun(tile.key)}
                    title={tile.running ? tr('إيقاف البث', 'Stop stream') : tr('تشغيل البث', 'Start stream')}
                    aria-label={tile.running ? tr('إيقاف البث', 'Stop stream') : tr('تشغيل البث', 'Start stream')}
                    aria-pressed={tile.running}
                    className={clsx('tool', tile.running ? 'on' : 'play')}
                  >
                    {tile.running ? <Square size={12} /> : <Play size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaxKey(prev => prev === tile.key ? null : tile.key)}
                    title={maximized ? tr('تصغير', 'Restore') : tr('تكبير', 'Maximize')}
                    aria-label={maximized ? tr('تصغير', 'Restore') : tr('تكبير', 'Maximize')}
                    className="tool"
                  >
                    {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpen(tile.deviceId)}
                    title={tr('فتح الشاشة', 'Open screen')}
                    aria-label={tr('فتح الشاشة', 'Open screen')}
                    className="tool"
                  >
                    <ExternalLink size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTile(tile.key)}
                    disabled={tiles.length <= 1}
                    title={tr('إزالة', 'Remove')}
                    aria-label={tr('إزالة', 'Remove')}
                    className="tool"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
