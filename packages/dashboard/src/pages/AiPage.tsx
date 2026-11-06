import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDeviceStore } from '../store/deviceStore'
import { AiChatPanel } from '../components/AiChatPanel'
import { Bot, Circle, Monitor, Wifi, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '../lib/i18n'
import { useUIStore } from '../store/uiStore'
import { Alert, SkeletonRows } from '../components/ui'

export function AiPage() {
  const t    = useT()
  const isAr = useUIStore(s => s.lang === 'ar')
  const { devices, statsMap, loading, error, fetchDevices } = useDeviceStore()
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(() => {
    try { return localStorage.getItem('airemote-ai-device-v1') || undefined } catch { return undefined }
  })
  const [searchParams] = useSearchParams()
  const initialPrompt = searchParams.get('prompt') || undefined
  const autoPickedRef = useRef(false)

  const onlineDevices = devices.filter(d => d.status === 'online')
  // 3.14.1 - device list states (PLAN 2.2 rule 5): the empty one already existed below
  const listLoading = loading && devices.length === 0
  const listError = !listLoading && !!error

  useEffect(() => {
    try {
      if (selectedDeviceId) localStorage.setItem('airemote-ai-device-v1', selectedDeviceId)
      else localStorage.removeItem('airemote-ai-device-v1')
    } catch {}
  }, [selectedDeviceId])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  // v3.3.4 — auto-attach to the first online device so device questions get real
  // context out of the box (the user can switch back to global manually).
  useEffect(() => {
    if (!autoPickedRef.current && !selectedDeviceId && onlineDevices.length > 0) {
      autoPickedRef.current = true
      setSelectedDeviceId(onlineDevices[0].id)
    }
  }, [onlineDevices, selectedDeviceId])
  const selectedDevice = selectedDeviceId ? devices.find(d => d.id === selectedDeviceId) : undefined

  return (
    <div className="ai-page-shell flex h-full">

      {/* ── Main chat area ───────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">

        <div className="ai-page-head">
          <div className="ai-page-head-main">
            <span className="cr-eyebrow"><span /> AIREMOTE / COPILOT</span>
            <div className="ai-page-title-row">
              <span className="ai-page-title-icon"><Bot size={15} /></span>
              <h2>{t('ai_title')}</h2>
              <span className="ai-ready"><Circle size={5} className="fill-current" /> {isAr ? 'جاهز' : 'Ready'}</span>
            </div>
            <p>
              {selectedDevice ? (
                <>{t('ai_context')}: <b>{selectedDevice.name}</b></>
              ) : t('ai_global_desc')}
            </p>
          </div>
          <div className="ai-page-head-actions">
            <span className="ai-page-online"><Monitor size={11} /> {onlineDevices.length} {isAr ? 'متصل' : 'online'}</span>
            {selectedDeviceId && (
              <button type="button" className="ai-page-cancel" onClick={() => setSelectedDeviceId(undefined)}>
                <X size={11} /> {t('ai_cancel_device')}
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <AiChatPanel deviceId={selectedDeviceId} key={selectedDeviceId || 'global'} initialPrompt={initialPrompt} />
        </div>
      </div>

      {/* ── Devices sidebar ──────────────────────────────────────────────── */}
      <div className="flex w-64 flex-shrink-0 flex-col border-s border-line bg-surface/50">
        <div className="flex-shrink-0 border-b border-line px-4 py-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t('ai_connected_devices')}
          </h3>
          {onlineDevices.length > 0 && (
            <p className="mt-0.5 text-[10px] text-muted">{t('ai_select_device_hint')}</p>
          )}
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto p-3">

          {/* Global option */}
          <button
            type="button"
            onClick={() => setSelectedDeviceId(undefined)}
            aria-pressed={!selectedDeviceId}
            className={clsx(
              'w-full rounded-xl border p-2.5 text-start transition-colors',
              !selectedDeviceId
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-transparent text-muted hover:border-line hover:bg-surface2'
            )}
          >
            <div className="flex items-center gap-2">
              <Bot size={12} />
              <span className="text-xs font-medium">{t('ai_global')}</span>
            </div>
          </button>

          {listLoading && <SkeletonRows rows={3} />}

          {listError && (
            <Alert tone="danger" title={t('ai_load_failed')}>
              <button type="button" className="mt-1 text-[11.5px] underline underline-offset-2" onClick={() => fetchDevices()}>
                {t('ov_retry')}
              </button>
            </Alert>
          )}

          {!listLoading && !listError && onlineDevices.length === 0 && (
            <div className="py-6 text-center">
              <Monitor size={22} className="mx-auto mb-2 text-muted/70" />
              <p className="text-xs text-muted">{t('no_devices_yet')}</p>
            </div>
          )}

          {onlineDevices.map(d => {
            const stats      = statsMap[d.id]
            const isSelected = selectedDeviceId === d.id
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDeviceId(d.id)}
                aria-pressed={isSelected}
                className={clsx(
                  'w-full rounded-xl border p-3 text-start transition-colors',
                  isSelected
                    ? 'border-primary/30 bg-primary/10'
                    : 'border-transparent hover:border-line hover:bg-surface2'
                )}
              >
                {/* Device name + status */}
                <div className="mb-2 flex items-center gap-2">
                  <div className={clsx(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg',
                    isSelected ? 'bg-primary/15' : 'bg-surface2'
                  )}>
                    <Monitor size={11} className={isSelected ? 'text-primary' : 'text-muted'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={clsx('truncate text-xs font-medium', isSelected ? 'text-primary' : 'text-ink')}>
                      {d.name}
                    </p>
                    <div className="flex items-center gap-1">
                      <Circle size={5} className="fill-current text-success" />
                      <span className="text-[10px] text-success">{t('online')}</span>
                    </div>
                  </div>
                </div>

                {/* Stats mini bars */}
                {stats ? (
                  <div className="grid grid-cols-3 gap-1 text-center">
                    {[
                      { label: 'CPU',  value: stats.cpuPercent,  tone: 'bg-info' },
                      { label: 'RAM',  value: stats.ramPercent,  tone: 'bg-primary' },
                      { label: 'Disk', value: stats.diskPercent, tone: stats.diskPercent > 85 ? 'bg-warning' : 'bg-info' },
                    ].map(item => (
                      <div key={item.label}>
                        <div className="font-mono text-[10px] font-bold text-ink">{item.value}%</div>
                        <div className="text-[10px] text-muted">{item.label}</div>
                        <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface2">
                          <div
                            className={clsx('h-full rounded-full transition-all', item.tone)}
                            style={{ width: `${Math.min(item.value, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[10px] text-muted">
                    <Wifi size={9} />
                    {t('connecting')}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
