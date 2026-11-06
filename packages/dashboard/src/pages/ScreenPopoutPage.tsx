import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ScreenViewer } from '../components/ScreenViewer'
import { api } from '../lib/api'
import { StateSurface } from '../components/ui'
import type { SurfaceState } from '../components/ui'
import { useT } from '../lib/i18n'

export function ScreenPopoutPage() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const [search] = useSearchParams()
  const sessionTicket = search.get('rt') || ''
  // 3.9.2 (H1) — المفتاح في fragment؛ لا يُرسل إلى السيرفر. search يبقى توافقاً للروابط القديمة.
  const sessionResumeKey = (() => {
    const hash = window.location.hash.replace(/^#/, '')
    const fromHash = new URLSearchParams(hash).get('rk') || ''
    return fromHash || search.get('rk') || ''
  })()
  const sessionAccess = (search.get('access') || '') as '' | 'view' | 'control' | 'files'
  const [name, setName] = useState('')
  // 3.14.1 - the window used to return null on a missing id and show nothing at all
  const t = useT()
  const [phase, setPhase] = useState<SurfaceState>(deviceId ? 'loading' : 'empty')

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
    if (sessionTicket || sessionResumeKey) setPhase('ready')
    if (!sessionTicket && !sessionResumeKey) {
      api.get('/api/devices').then(r => {
        const d = (r.data as Array<{ id: string; name: string }>).find(x => x.id === deviceId)
        if (d) { setName(d.name); try { document.title = d.name + ' — AiRemote' } catch {} }
      }).then(() => setPhase(p => (p === 'loading' ? 'ready' : p))).catch(() => setPhase('error'))
    }
    return () => {
      closed()
      window.removeEventListener('beforeunload', closed)
      try { bc?.close() } catch {}
    }
  }, [deviceId, sessionTicket])

  if (!deviceId) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-code">
        <div className="w-[360px]">
          <StateSurface
            state="empty"
            emptyTitle={t('popout_no_device_title')}
            emptyDescription={t('popout_no_device_desc')}
            emptyAction={<a className="btn primary" href="/devices">{t('popout_pick_device')}</a>}
          >
            <span />
          </StateSurface>
        </div>
      </div>
    )
  }
  return (
    <div className="fixed inset-0 bg-code">
      {phase !== 'ready' ? (
        <div className="flex h-full items-center justify-center">
          <div className="w-[380px]">
            <StateSurface
              state={phase}
              rows={5}
              errorTitle={t('popout_failed_title')}
              retryLabel={t('ov_retry')}
              onRetry={() => window.location.reload()}
              emptyTitle={t('popout_no_device_title')}
              emptyDescription={t('popout_no_device_desc')}
            >
              <span />
            </StateSurface>
          </div>
        </div>
      ) : (
        <ScreenViewer deviceId={deviceId} deviceName={name || deviceId} popout sessionTicket={sessionTicket} sessionResumeKey={sessionResumeKey} sessionAccess={sessionAccess} />
      )}
    </div>
  )
}
