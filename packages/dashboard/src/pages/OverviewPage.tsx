import { useEffect, useState } from 'react'
import { useDeviceStore } from '../store/deviceStore'
import { api } from '../lib/api'
import { openScreenWindow } from '../lib/screenWindow'
import { ControlRoomBody } from '../components/ControlRoomBody'

interface ActiveScreen {
  sessionId: string
  viewers?: number
}

/**
 * غرفة العمليات — الصفحة تجلب البيانات فقط؛ الشكل كله في ControlRoomBody
 * بأصناف design/server.html (3.14.0 · §4.1(أ)).
 */
export function OverviewPage () {
  const { devices, loading, error, fetchDevices, statsMap } = useDeviceStore()
  const [activeScreens, setActiveScreens] = useState<Record<string, ActiveScreen>>({})

  useEffect(() => {
    fetchDevices()
    const loadActive = () => {
      api.get('/api/sessions/screen/active')
        .then(r => {
          const map: Record<string, ActiveScreen> = {}
          for (const x of (r.data || [])) {
            if (x && x.deviceId) map[x.deviceId] = { sessionId: x.sessionId, viewers: x.viewers }
          }
          setActiveScreens(map)
        })
        .catch(() => {})
    }
    loadActive()
    const timer = setInterval(loadActive, 10_000)
    return () => clearInterval(timer)
  }, [fetchDevices])

  return (
    <div className="cr-page">
      <ControlRoomBody
        devices={devices}
        statsMap={statsMap}
        activeScreens={activeScreens}
        loading={loading}
        hasError={!!error}
        onOpen={openScreenWindow}
        onRetry={() => fetchDevices()}
      />
    </div>
  )
}
