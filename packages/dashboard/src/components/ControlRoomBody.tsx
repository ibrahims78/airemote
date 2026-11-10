import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Device } from '@airemote/shared'
import { useUIStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { toast } from '../store/toastStore'
import { useBoardStore, nextDeviceId, MAX_TILES } from '../store/boardStore'
import { useT, formatRelativeLang } from '../lib/i18n'
import { clsx } from 'clsx'
import { api } from '../lib/api'
import { Monitor, Terminal, FolderOpen, MousePointer2, Sun } from 'lucide-react'
import { ScreenViewer } from './ScreenViewer'
import { EmptyState, SkeletonRows } from './ui'

type RefName = 'play' | 'stop' | 'max' | 'restore' | 'open' | 'x' | 'plus' | 'monitor'

/**
 * أيقونات التذييل من مجموعة المرجع نفسها (design/server.html: `#ic-*`) لا من lucide:
 * العدد والمقاس والترتيب كانت مطابقة، واختلاف الشكل وحده كان يكلّف 10.71% في نطاق y=600.
 * `restore` ليس في المرجع (حالة تكبير خاصة بالتطبيق) ويستعمل `#ic-minus`.
 */
const REF_PATHS: Record<RefName, ReactNode> = {
  play: <path d="M7 4.5v15l13-7.5z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  max: <path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" />,
  restore: <path d="M5 12h14" />,
  open: <path d="M14 4h6v6M20 4l-8 8M10 5H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M9 20h6M12 16v4" /></>
}

function RefIcon ({ name }: { name: RefName }) {
  return (
    <svg className="i sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {REF_PATHS[name]}
    </svg>
  )
}

interface ActiveScreen { sessionId: string; viewers?: number }
interface Stats { cpuPercent?: number; ramPercent?: number }

// 3.14.0 — D65: six cards at most, and only the owner hides a card (D53 kept).
const FLEET_MAX = 6
const FLEET_HIDDEN_KEY = 'airemote-fleet-hidden-v1'
// 2026-11-08 (D3) — حُذف مُحدِّد حجم البلاطة (SM/MD/LG): كان يُحفظ ولا يُطبَّق على أي عنصر.

interface Props {
  devices: Device[]
  statsMap: Record<string, Stats | undefined>
  activeScreens: Record<string, ActiveScreen>
  loading?: boolean
  hasError?: boolean
  onOpen: (deviceId: string) => void
  // 2026-11-08 (D2) — «فتح» يذهب لمساحة عمل الجهاز، و«بث» يفتح العارض. كانا يستدعيان دالة واحدة.
  onOpenDevice: (deviceId: string) => void
  onRetry: () => void
}

const PLATFORM_RANK: Record<string, number> = { windows: 0, macos: 1, linux: 1, android: 2 }

/** 3.16.8 — SQLite writes 'YYYY-MM-DD HH:MM:SS' in UTC with no zone; read it as UTC. */
function asUtc (value?: string | null): string {
  if (!value) return ''
  const s = String(value)
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) return s
  return s.replace(' ', 'T') + 'Z'
}

/**
 * ترتيب المرجع (D53): سطح المكتب أولًا ثم أندرويد — design/server.html
 * يعرض WIN10 · WIN11 · Android من اليمين إلى اليسار. الترتيب مستقر.
 */
function wallRank (d: Device): number {
  const platform = String(d.info?.platform || '').toLowerCase()
  return PLATFORM_RANK[platform] ?? 1
}

function loadHidden (): string[] {
  try {
    const raw = localStorage.getItem(FLEET_HIDDEN_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * جسم غرفة العمليات — بنية design/server.html: `.dash-head` ثم `.fleet` ثم `.wall`.
 * 3.14.0 — كل صنف من المرجع (control-room-ref.css)؛ لا قياس بلا قبل/بعد (D54).
 */
export function ControlRoomBody ({ devices, statsMap, activeScreens, loading, hasError, onOpen, onOpenDevice, onRetry }: Props) {
  const { lang } = useUIStore()
  const T = useT()
  const isRtl = lang === 'ar'
  const tr = (ar: string, en: string) => (isRtl ? ar : en)
  const navigate = useNavigate()
  const { user } = useAuthStore()
  // 3.16.8 — waking a phone runs exec on the device; the server requires manager for that.
  const canManage = user?.role === 'admin' || user?.role === 'manager'

  const onlineDevices = useMemo(() => devices.filter(d => d.status === 'online'), [devices])
  const preferred = useMemo(() => (
    onlineDevices.find(d => String(d.info?.platform || '').toLowerCase() === 'android' && !/emulator/i.test(d.name))
    || onlineDevices[0]
    || devices[0]
  ), [devices, onlineDevices])

  const tiles = useBoardStore(s => s.tiles)
  const addTileToBoard = useBoardStore(s => s.add)
  const removeTileFromBoard = useBoardStore(s => s.remove)
  const toggleTile = useBoardStore(s => s.toggle)
  const seedBoard = useBoardStore(s => s.seed)
  const replaceOrphans = useBoardStore(s => s.replaceOrphans)
  const [maxKey, setMaxKey] = useState<string | null>(null)
  // 3.14.0 — D65
  const [hidden, setHidden] = useState<string[]>(() => loadHidden())
  const [hiddenOpen, setHiddenOpen] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(FLEET_HIDDEN_KEY, JSON.stringify(hidden)) } catch {}
  }, [hidden])

  const visibleDevices = useMemo(() => {
    const list = devices.filter(d => !hidden.includes(d.id))
    // 3.16.8 — the server sorts by name, so an offline device could take one of the six
    // card slots and push a live one out. Online first, name order kept inside each group.
    return [...list].sort((a, b) => (a.status === 'online' ? 0 : 1) - (b.status === 'online' ? 0 : 1))
  }, [devices, hidden])
  const shownDevices = useMemo(() => visibleDevices.slice(0, FLEET_MAX), [visibleDevices])
  const hiddenDevices = useMemo(() => devices.filter(d => hidden.includes(d.id)), [devices, hidden])
  const fleetMore = visibleDevices.length - shownDevices.length
  function hideDevice (id: string) { setHidden(prev => prev.includes(id) ? prev : [...prev, id]) }
  function showDevice (id: string) { setHidden(prev => prev.filter(x => x !== id)) }

  const liveCount = Object.keys(activeScreens).length
  const alerts = onlineDevices.filter(d => {
    const s = statsMap[d.id] || d.stats
    return !!s && ((s.cpuPercent ?? 0) > 85 || (s.ramPercent ?? 0) > 85)
  }).length
  // 2026-11-08 — بعد إزالة شريط المؤشرات انتقل عدّاد التنبيهات إلى شارة مستقلة في شريط الأدوات.
  // 2026-11-09 — إيقاظ شاشة الجهاز عن بُعد (أندرويد): يُرسل KEYCODE_WAKEUP عبر الوكيل.
  const wakeScreen = async (id: string, name: string) => {
    try {
      await api.post(`/api/devices/${id}/exec`, { command: 'input keyevent KEYCODE_WAKEUP', timeoutMs: 10000 })
      toast.success(tr('أُرسل أمر الإيقاظ', 'Wake command sent'), name)
    } catch {
      // 3.16.8 — a refused wake (no manager role, no control capability) looked like a dead button.
      toast.error(tr('تعذّر إيقاظ الشاشة', 'Could not wake the screen'), name)
    }
  }

  const runningTiles = useMemo(() => tiles.filter(t => t.running), [tiles])

  useEffect(() => {
    if (!preferred) return
    const alive = devices.map(d => d.id)
    if (tiles.length > 0) {
      if (tiles.some(t => !alive.includes(t.deviceId))) replaceOrphans(alive, preferred.id)
      return
    }
    const seed = [...onlineDevices].sort((a, b) => wallRank(a) - wallRank(b)).slice(0, 3)
    seedBoard((seed.length ? seed : [preferred]).map(d => d.id))
  }, [preferred, devices, onlineDevices, tiles, replaceOrphans, seedBoard])

  useEffect(() => {
    if (!maxKey) return
    // 3.16.8 — a maximised tile behaves like a dialog: focus moves in, Tab cycles inside,
    // and closing it hands focus back to whatever had it.
    const previous = document.activeElement as HTMLElement | null
    const el = document.querySelector<HTMLElement>('.tile.is-max')
    el?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMaxKey(null); return }
      if (e.key !== 'Tab' || !el) return
      const focusables = Array.from(
        el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter(n => !n.hasAttribute('disabled'))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [maxKey])

  function addTile () {
    if (tiles.length >= MAX_TILES) return
    const ordered = [...onlineDevices].sort((a, b) => wallRank(a) - wallRank(b)).map(d => d.id)
    const next = nextDeviceId(tiles, ordered, preferred?.id)
    if (!next) return
    addTileToBoard(next)
  }

  function removeTile (key: string) {
    removeTileFromBoard(key)
    setMaxKey(prev => prev === key ? null : prev)
  }

  function toggleRun (key: string) {
    toggleTile(key)
  }

  return (
    <>
      {/* 2026-11-08 — الرأس الجديد: شريط البث أولًا + زر إضافة بث. أُلغي العنوان والمؤشرات الثلاثة ورابط «عرض الكل». */}
      <div className="cr-top">
        {tiles.length > 0 ? (
          <div className="wall-strip">
            {tiles.map(tile => {
              const device = devices.find(d => d.id === tile.deviceId)
              const online = !!device && device.status === 'online'
              const live = !!activeScreens[tile.deviceId]
              const name = device?.name || tile.deviceId.slice(0, 10)
              // 3.16.8 — one source of truth: the badge follows the live session, not the wish.
              const state = !online ? tr('غير متصل', 'Offline')
                : live ? tr('مباشر', 'Live')
                : tile.running ? tr('جارٍ التشغيل', 'Starting')
                : tr('متوقف', 'Stopped')
              return (
                <div className="ws-item" key={tile.key}>
                  <RefIcon name="monitor" />
                  <span className="ws-name">{name}</span>
                  <span className={clsx('chip', online && live ? 'ok' : 'off')}>
                    <span className="dot" />{state}
                  </span>
                  <button
                    type="button"
                    className={clsx('tool', tile.running ? 'on' : 'play')}
                    onClick={() => toggleRun(tile.key)}
                    disabled={!online}
                    title={tile.running ? tr('إيقاف البث', 'Stop stream') : tr('تشغيل البث', 'Start stream')}
                    aria-label={tile.running ? tr('إيقاف البث', 'Stop stream') : tr('تشغيل البث', 'Start stream')}
                    aria-pressed={tile.running}
                  >
                    {tile.running ? <RefIcon name="stop" /> : <RefIcon name="play" />}
                  </button>
                  <button
                    type="button"
                    className="tool"
                    onClick={() => removeTile(tile.key)}
                    disabled={tiles.length <= 1}
                    title={tr('إزالة', 'Remove')}
                    aria-label={tr('إزالة', 'Remove')}
                  >
                    <RefIcon name="x" />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="ws-empty">{tr('لا بث مفتوح بعد', 'No stream open yet')}</div>
        )}
      </div>

      {hasError && (
        <div className="aibar on" role="alert">
          <RefIcon name="x" />
          <span>{tr('تعذّر الاتصال بالسيرفر — إعادة المحاولة', 'Could not reach the server — retry')}</span>
          <button type="button" className="btn ghost sm" onClick={onRetry}>{tr('إعادة المحاولة', 'Retry')}</button>
        </div>
      )}

      {/* 3.14.1 - the two states this surface did not have (PLAN 2.2 rule 5) */}
      {!hasError && loading && devices.length === 0 && (
        <div aria-busy="true" aria-live="polite">
          <SkeletonRows rows={3} />
          <div className="mt-2"><SkeletonRows rows={2} /></div>
        </div>
      )}

      {!hasError && !loading && devices.length === 0 && (
        <EmptyState
          icon={<Monitor size={20} />}
          title={tr('لا أجهزة بعد', 'No devices yet')}
          description={tr('أضف جهازًا من صفحة الأجهزة ليظهر هنا.', 'Add a device from the Devices page to see it here.')}
          action={<button type="button" className="btn primary" onClick={() => navigate('/devices')}>{tr('إضافة جهاز', 'Add device')}</button>}
        />
      )}

      {runningTiles.length > 0 && (
        <div className={clsx('wall', 'wall-' + Math.min(runningTiles.length, 3))}>
          {runningTiles.map(tile => {
            const device = devices.find(d => d.id === tile.deviceId)
            const online = !!device && device.status === 'online'
            const live = !!activeScreens[tile.deviceId]
            const maximized = maxKey === tile.key
            const name = device?.name || tile.deviceId.slice(0, 10)
            const state = !online ? tr('غير متصل', 'Offline')
              : live ? tr('مباشر', 'Live')
              : tile.running ? tr('جارٍ التشغيل', 'Starting')
              : tr('متوقف', 'Stopped')
            return (
              <div
                key={tile.key}
                className={clsx('tile', maximized && 'is-max')}
                role={maximized ? 'dialog' : undefined}
                aria-modal={maximized ? true : undefined}
                aria-label={maximized ? name : undefined}
                tabIndex={maximized ? -1 : undefined}
              >
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
                    disabled={!online}
                    title={tile.running ? tr('إيقاف البث', 'Stop stream') : tr('تشغيل البث', 'Start stream')}
                    aria-label={tile.running ? tr('إيقاف البث', 'Stop stream') : tr('تشغيل البث', 'Start stream')}
                    aria-pressed={tile.running}
                    className={clsx('tool', tile.running ? 'on' : 'play')}
                  >
                    {tile.running ? <RefIcon name="stop" /> : <RefIcon name="play" />}
                  </button>
                  {online && canManage && String(device?.info?.platform || '').toLowerCase() === 'android' && (
                    <button
                      type="button"
                      onClick={() => { void wakeScreen(tile.deviceId, name) }}
                      title={tr('إيقاظ الشاشة', 'Wake screen')}
                      aria-label={tr('إيقاظ الشاشة', 'Wake screen')}
                      className="tool"
                    >
                      <Sun size={13} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setMaxKey(prev => prev === tile.key ? null : tile.key)}
                    title={maximized ? tr('تصغير', 'Restore') : tr('تكبير', 'Maximize')}
                    aria-label={maximized ? tr('تصغير', 'Restore') : tr('تكبير', 'Maximize')}
                    className="tool"
                  >
                    {maximized ? <RefIcon name="restore" /> : <RefIcon name="max" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpen(tile.deviceId)}
                    title={tr('فتح الشاشة', 'Open screen')}
                    aria-label={tr('فتح الشاشة', 'Open screen')}
                    className="tool"
                  >
                    <RefIcon name="open" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTile(tile.key)}
                    disabled={tiles.length <= 1}
                    title={tr('إزالة', 'Remove')}
                    aria-label={tr('إزالة', 'Remove')}
                    className="tool"
                  >
                    <RefIcon name="x" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 3.16.8 — the section keeps its title at any fleet size, and the two counters that
          were computed but never rendered (live sessions, devices under pressure) live here. */}
      <div className="fleet-head">
        <span className="fleet-title">{T('fleet_title')}</span>
        {liveCount > 0 && (
          <span className="hint">{tr(liveCount + ' بث نشط', liveCount + ' live')}</span>
        )}
        {alerts > 0 && (
          <span className="hint">{tr(alerts + ' أجهزة تحت ضغط', alerts + ' under pressure')}</span>
        )}
        {fleetMore > 0 && (
          <span className="hint">{T('fleet_showing', { n: shownDevices.length, total: visibleDevices.length, rest: fleetMore })}</span>
        )}
        {fleetMore > 0 && (
          <button type="button" className="btn ghost sm" onClick={() => navigate('/devices')}>
            {tr('عرض كل الأجهزة', 'View all devices')}
          </button>
        )}
          {hiddenDevices.length > 0 && (
            <div className="fleet-menu-wrap">
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setHiddenOpen(v => !v)}
                aria-expanded={hiddenOpen}
                aria-haspopup="menu"
              >
                <RefIcon name="plus" /> {T('fleet_hidden_heading')} ({hiddenDevices.length})
              </button>
              {hiddenOpen && (
                <div className="fleet-menu" role="menu">
                  <div className="fleet-menu-h">{T('fleet_hidden_heading')}</div>
                  {hiddenDevices.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      role="menuitem"
                      className="fleet-menu-i"
                      onClick={() => { showDevice(d.id); setHiddenOpen(false) }}
                    >
                      <RefIcon name="monitor" />
                      <span className="nm">{d.name}</span>
                      <span className="hint">{T('fleet_show')}</span>
                    </button>
                  ))}
                  <button type="button" className="fleet-menu-i" onClick={() => { setHidden([]); setHiddenOpen(false) }}>
                    {T('fleet_restore_all')}
                  </button>
                </div>
              )}
            </div>
          )}
      </div>

      {/* 3.16.8 — hiding every card left the page blank with no way back. */}
      {visibleDevices.length === 0 && devices.length > 0 && (
        <EmptyState
          icon={<Monitor size={20} />}
          title={tr('كل البطاقات مخفية', 'All cards are hidden')}
          description={tr('استرجعها من قائمة «أجهزة مخفية» أعلاه.', 'Bring them back from the hidden list above.')}
        />
      )}

      <div className="fleet">
        {shownDevices.map(device => {
          const online = device.status === 'online'
          const stats = statsMap[device.id] || device.stats
          const pct = (v?: number) => (typeof v === 'number' ? Math.round(v) : null)
          const cpu = pct(stats?.cpuPercent)
          const ram = pct(stats?.ramPercent)
          const disk = pct((stats as { diskPercent?: number } | undefined)?.diskPercent)
          // 2026-11-08 — حالة البث: من السيرفر إلى الوكيل (مشاهد يشاهد) أو وكيل↔وكيل (relay).
          const screen = activeScreens[device.id]
          const relay = (device as { relay?: { id?: string } | boolean | null }).relay
          const relayOn = !!relay
          const caps = ((device as unknown as { capabilities?: Record<string, unknown> }).capabilities || {}) as Record<string, unknown>
          const canTerm = !!caps.pty || !!caps.shell
          const canFiles = !!caps.fs
          const canControl = !!caps.screenControl
          return (
            <div className="fcard" key={device.id}>
              <button
                type="button"
                className="fcard-hide"
                title={T('fleet_hide')}
                aria-label={T('fleet_hide')}
                onClick={() => hideDevice(device.id)}
              >
                <RefIcon name="x" />
              </button>
              <div className="top">
                <RefIcon name="monitor" />
                <span className="nm">{device.name}</span>
                <div className="grow" />
                <span className={clsx('chip', online ? 'ok' : 'off')}>
                  <span className="dot" />{online ? tr('مباشر', 'Live') : tr('غير متصل', 'Offline')}
                </span>
              </div>
              <div className="rows">
                <div><b>{tr('النظام', 'OS')}</b> {device.info?.platform || '—'}{device.info?.arch ? ` · ${device.info.arch}` : ''}</div>
                <div><b>{tr('المضيف', 'Host')}</b> {device.info?.hostname || device.id.slice(0, 12)}</div>
                {/* 3.16.8 — the server already sends last_seen; the card ignored it. */}
                <div><b>{tr('آخر ظهور', 'Last seen')}</b>{(device as unknown as { lastSeen?: string }).lastSeen
                  ? ' ' + formatRelativeLang(asUtc((device as unknown as { lastSeen?: string }).lastSeen), lang)
                  : ' —'}</div>
              </div>

              {online && (
                <div className="res-bars">
                  {[
                    { key: 'CPU', v: cpu },
                    { key: 'RAM', v: ram },
                    { key: 'DSK', v: disk },
                  ].map(({ key, v }) => (
                    <div className="res-row" key={key}>
                      <span className="res-k">{key}</span>
                      <progress
                        className={clsx('res-bar', v != null && v >= 85 ? 'is-hot' : v != null && v >= 60 ? 'is-warm' : '')}
                        max={100}
                        value={v ?? 0}
                        aria-label={key + ' ' + (v == null ? '—' : v + '%')}
                      />
                      <span className="res-v">{v == null ? '—' : v + '%'}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="cap-row">
                {screen && (
                  <span className="cap-chip is-live" title={tr('بث من السيرفر إلى الوكيل — مشاهد يشاهد هذه الشاشة الآن', 'Server → agent stream — a viewer is watching now')}>
                    <span className="dot" />{tr('بث', 'live')}{typeof screen.viewers === 'number' ? ' · ' + screen.viewers : ''}
                  </span>
                )}
                {relayOn && !screen && (
                  <span className="cap-chip is-relay" title={tr('جلسة وكيل↔وكيل', 'Agent ↔ agent session')}>
                    <span className="dot" />{tr('وكيل↔وكيل', 'agent↔agent')}
                  </span>
                )}
                {canTerm && (
                  <span className="cap-ic" title={tr('طرفية متاحة', 'Shell available')} aria-label={tr('طرفية متاحة', 'Shell available')}>
                    <Terminal size={11} />
                  </span>
                )}
                {canFiles && (
                  <span className="cap-ic" title={tr('مدير ملفات متاح', 'Files available')} aria-label={tr('مدير ملفات متاح', 'Files available')}>
                    <FolderOpen size={11} />
                  </span>
                )}
                {canControl && (
                  <span className="cap-ic" title={tr('تحكّم بالشاشة متاح', 'Screen control available')} aria-label={tr('تحكّم بالشاشة متاح', 'Screen control available')}>
                    <MousePointer2 size={11} />
                  </span>
                )}
              </div>
              <div className="acts">
                <button type="button" className="btn ghost sm" onClick={() => onOpenDevice(device.id)}>
                  <RefIcon name="open" /> {tr('فتح', 'Open')}
                </button>
                {online && (
                  <button type="button" className="btn ghost sm" onClick={() => onOpen(device.id)}>
                    <RefIcon name="play" /> {tr('بث', 'Stream')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

    </>
  )
}
