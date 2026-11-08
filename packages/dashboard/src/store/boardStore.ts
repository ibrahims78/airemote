import { create } from 'zustand'

/**
 * 2026-11-08 — حالة «حائط البث» في مخزن مشترك.
 * السبب: زر «إضافة بث» انتقل إلى الشريط العلوي (DashboardLayout)، والحالة كانت محليّة
 * داخل ControlRoomBody. مصدر واحد يمنع نسختين من الحقيقة.
 */
export const MAX_TILES = 6
const BOARD_STORAGE_KEY = 'airemote-live-board-v1'

export interface BoardTile {
  key: string
  deviceId: string
  running: boolean
}

function newKey (): string {
  return Math.random().toString(36).slice(2, 10)
}

function load (): BoardTile[] {
  try {
    const raw = localStorage.getItem(BOARD_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { tiles?: Partial<BoardTile>[] }
    return (parsed.tiles || [])
      .filter(t => t && typeof t.key === 'string' && typeof t.deviceId === 'string')
      .slice(0, MAX_TILES)
      // 2026-11-08 — بناءً على طلب المالك: تحديث الصفحة لا يُسقط البث؛ تُستعاد حالة التشغيل.
      .map(t => ({ key: String(t.key), deviceId: String(t.deviceId), running: t.running === true }))
  } catch {
    return []
  }
}

function persist (tiles: BoardTile[]) {
  try {
    localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify({ tiles: tiles.map(t => ({ key: t.key, deviceId: t.deviceId, running: t.running })) }))
  } catch {}
}

interface BoardState {
  tiles: BoardTile[]
  add: (deviceId: string) => boolean
  remove: (key: string) => void
  toggle: (key: string) => void
  seed: (deviceIds: string[]) => void
  replaceOrphans: (aliveIds: string[], fallbackId: string) => void
}

export const useBoardStore = create<BoardState>((set, get) => ({
  tiles: load(),

  add: (deviceId) => {
    const tiles = get().tiles
    if (tiles.length >= MAX_TILES) return false
    const next = [...tiles, { key: newKey(), deviceId, running: false }]
    persist(next)
    set({ tiles: next })
    return true
  },

  remove: (key) => {
    const tiles = get().tiles
    if (tiles.length <= 1) return
    const next = tiles.filter(t => t.key !== key)
    persist(next)
    set({ tiles: next })
  },

  toggle: (key) => {
    const next = get().tiles.map(t => (t.key === key ? { ...t, running: !t.running } : t))
    persist(next)
    set({ tiles: next })
  },

  seed: (deviceIds) => {
    if (get().tiles.length > 0) return
    const next = deviceIds.slice(0, 3).map(id => ({ key: newKey(), deviceId: id, running: false }))
    persist(next)
    set({ tiles: next })
  },

  replaceOrphans: (aliveIds, fallbackId) => {
    const tiles = get().tiles
    if (tiles.length === 0) return
    const next = tiles.map(t => (aliveIds.includes(t.deviceId) ? t : { ...t, deviceId: fallbackId }))
    persist(next)
    set({ tiles: next })
  },
}))

/** الجهاز التالي الذي يستحق بلاطة: أول جهاز متصل غير مستخدم، وإلا البديل. */
export function nextDeviceId (tiles: BoardTile[], onlineIds: string[], fallback?: string): string | null {
  const used = new Set(tiles.map(t => t.deviceId))
  return onlineIds.find(id => !used.has(id)) || fallback || null
}
