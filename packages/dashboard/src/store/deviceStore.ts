import { create } from 'zustand'
import type { Device, DeviceStats, DeviceStatus, TunnelLayer } from '@airemote/shared'
import { api } from '../lib/api'

interface DeviceState {
  devices: Device[]
  statsMap: Record<string, DeviceStats>
  loading: boolean
  error: string | null
  fetchDevices: () => Promise<void>
  updateDeviceStatus: (id: string, status: DeviceStatus, tunnelLayer?: TunnelLayer) => void
  updateDeviceInfo: (id: string, info: Device['info']) => void
  updateDeviceStats: (id: string, stats: DeviceStats) => void
  addDevice: (name: string) => Promise<Device>
  deleteDevice: (id: string) => Promise<void>
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: [],
  statsMap: {},
  loading: false,
  error: null,

  fetchDevices: async () => {
    set({ loading: true })
    try {
      const res = await api.get('/api/devices')
      // 2026-11-08 (D1) — الـAPI يرسل last_seen، والشيفرة تقرأ lastSeen ⇒ عمود «آخر اتصال» كان فارغًا دائمًا.
      const rows = (Array.isArray(res.data) ? res.data : []).map((d: Device & { last_seen?: string | null }) => ({
        ...d,
        lastSeen: d.lastSeen ?? (d.last_seen ? new Date(d.last_seen) : undefined),
      }))
      set({ devices: rows, loading: false, error: null })
    } catch {
      set({ loading: false, error: 'load_failed' })
    }
  },

  updateDeviceStatus: (id, status, tunnelLayer) => {
    set(state => ({
      devices: state.devices.map(d =>
        d.id === id ? { ...d, status, tunnelLayer: tunnelLayer ?? d.tunnelLayer } : d
      )
    }))
  },

  updateDeviceInfo: (id, info) => {
    if (!info) return
    set(state => ({
      devices: state.devices.map(d =>
        d.id === id ? { ...d, info } : d
      )
    }))
  },

  updateDeviceStats: (id, stats) => {
    set(state => ({ statsMap: { ...state.statsMap, [id]: stats } }))
  },

  addDevice: async (name: string) => {
    const res = await api.post('/api/devices', { name })
    const device = res.data as Device
    set(state => ({ devices: [...state.devices, device] }))
    return device
  },

  deleteDevice: async (id: string) => {
    await api.delete(`/api/devices/${id}`)
    set(state => ({ devices: state.devices.filter(d => d.id !== id) }))
  }
}))
