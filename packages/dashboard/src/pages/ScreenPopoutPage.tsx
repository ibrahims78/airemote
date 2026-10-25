import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ScreenViewer } from '../components/ScreenViewer'
import { api } from '../lib/api'

export function ScreenPopoutPage() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const [name, setName] = useState('')

  useEffect(() => {
    if (!deviceId) return
    // Tell the dashboard this device moved to the standalone window. The
    // dashboard locks its tile so it cannot start a second stream, and asks
    // this window to re-announce if it loads after the dashboard.
    let bc: BroadcastChannel | null = null
    const announce = () => { try { bc?.postMessage({ type: 'popout', deviceId }) } catch {} }
    const closed = () => { try { bc?.postMessage({ type: 'popout-closed', deviceId }) } catch {} }
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('airemote-screen')
        bc.onmessage = (e) => {
          if (e.data && e.data.type === 'popout-query' && e.data.deviceId === deviceId) announce()
        }
        announce()
        window.addEventListener('beforeunload', closed)
      }
    } catch {}
    api.get('/api/devices').then(r => {
      const d = (r.data as Array<{ id: string; name: string }>).find(x => x.id === deviceId)
      if (d) { setName(d.name); try { document.title = d.name + ' — AiRemote' } catch {} }
    }).catch(() => {})
    return () => {
      closed()
      window.removeEventListener('beforeunload', closed)
      try { bc?.close() } catch {}
    }
  }, [deviceId])

  if (!deviceId) return null
  return (
    <div className="fixed inset-0 bg-black">
      <ScreenViewer deviceId={deviceId} deviceName={name || deviceId} popout />
    </div>
  )
}
