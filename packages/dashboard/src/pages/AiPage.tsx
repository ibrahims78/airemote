import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDeviceStore } from '../store/deviceStore'
import { AiChatPanel } from '../components/AiChatPanel'
import { Bot, Cpu, MemoryStick, Monitor, Wifi, Circle, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '../lib/i18n'
import { useUIStore } from '../store/uiStore'

export function AiPage() {
  const t       = useT()
  const isLight = useUIStore(s => s.theme === 'light')
  const isAr    = useUIStore(s => s.lang === 'ar')
  const { devices, statsMap, fetchDevices } = useDeviceStore()
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(() => {
    try { return localStorage.getItem('airemote-ai-device-v1') || undefined } catch { return undefined }
  })
  const [searchParams] = useSearchParams()
  const initialPrompt = searchParams.get('prompt') || undefined
  const autoPickedRef = useRef(false)

  const onlineDevices  = devices.filter(d => d.status === 'online')

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
      <div className="flex-1 flex flex-col min-w-0">

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

        <div className="flex-1 min-h-0">
          <AiChatPanel deviceId={selectedDeviceId} key={selectedDeviceId || 'global'} initialPrompt={initialPrompt} />
        </div>
      </div>

      {/* ── Devices sidebar ──────────────────────────────────────────────── */}
      <div className={clsx(
        'w-64 flex-shrink-0 border-s flex flex-col',
        isLight ? 'border-slate-200 bg-slate-50/60' : 'border-slate-700/50 bg-navy-800/40'
      )}>
        <div className={clsx(
          'px-4 py-3 border-b flex-shrink-0',
          isLight ? 'border-slate-200' : 'border-slate-700/50'
        )}>
          <h3 className={clsx('text-xs font-semibold uppercase tracking-wider', isLight ? 'text-slate-500' : 'text-slate-500')}>
            {t('ai_connected_devices')}
          </h3>
          {onlineDevices.length > 0 && (
            <p className={clsx('text-[10px] mt-0.5', isLight ? 'text-slate-400' : 'text-slate-600')}>
              {t('ai_select_device_hint')}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">

          {/* Global option */}
          <button
            onClick={() => setSelectedDeviceId(undefined)}
            className={clsx(
              'w-full text-start p-2.5 rounded-xl border transition-all',
              !selectedDeviceId
                ? 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue'
                : isLight
                  ? 'border-transparent hover:border-slate-200 hover:bg-slate-100 text-slate-500'
                  : 'border-transparent hover:border-slate-700/50 hover:bg-slate-700/20 text-slate-400'
            )}
          >
            <div className="flex items-center gap-2">
              <Bot size={12} className={!selectedDeviceId ? 'text-brand-blue' : isLight ? 'text-slate-400' : 'text-slate-500'} />
              <span className="text-xs font-medium">{t('ai_global')}</span>
            </div>
          </button>

          {onlineDevices.length === 0 && (
            <div className="text-center py-8">
              <Monitor size={24} className={clsx('mx-auto mb-2', isLight ? 'text-slate-300' : 'text-slate-700')} />
              <p className={clsx('text-xs', isLight ? 'text-slate-400' : 'text-slate-600')}>{t('no_devices_yet')}</p>
            </div>
          )}

          {onlineDevices.map(d => {
            const stats      = statsMap[d.id]
            const isSelected = selectedDeviceId === d.id
            return (
              <button
                key={d.id}
                onClick={() => setSelectedDeviceId(d.id)}
                className={clsx(
                  'w-full text-start p-3 rounded-xl border transition-all',
                  isSelected
                    ? isLight
                      ? 'bg-teal-50 border-teal-300'
                      : 'bg-brand-teal/10 border-brand-teal/30'
                    : isLight
                      ? 'border-transparent hover:border-slate-200 hover:bg-slate-100'
                      : 'border-transparent hover:border-slate-700/50 hover:bg-slate-700/20'
                )}
              >
                {/* Device name + status */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={clsx(
                    'w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0',
                    isSelected
                      ? isLight ? 'bg-teal-100' : 'bg-brand-teal/20'
                      : isLight ? 'bg-slate-100' : 'bg-slate-700/60'
                  )}>
                    <Monitor size={11} className={isSelected ? isLight ? 'text-teal-600' : 'text-brand-teal' : isLight ? 'text-slate-400' : 'text-slate-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={clsx(
                      'text-xs font-medium truncate',
                      isSelected ? isLight ? 'text-teal-700' : 'text-brand-teal' : isLight ? 'text-slate-700' : 'text-slate-200'
                    )}>
                      {d.name}
                    </p>
                    <div className="flex items-center gap-1">
                      <Circle size={5} className="text-emerald-500 fill-current" />
                      <span className="text-[10px] text-emerald-500">{t('online')}</span>
                      {isSelected && (
                        <span className={clsx('text-[10px] ms-1', isLight ? 'text-teal-600' : 'text-brand-teal')}>✓</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats mini bars */}
                {stats && (
                  <div className="grid grid-cols-3 gap-1 text-center">
                    {[
                      { label: 'CPU',  value: stats.cpuPercent,  color: '#38bdf8' },
                      { label: 'RAM',  value: stats.ramPercent,  color: '#2dd4bf' },
                      { label: 'Disk', value: stats.diskPercent, color: stats.diskPercent > 85 ? '#fb923c' : '#c084fc' },
                    ].map(item => (
                      <div key={item.label}>
                        <div className={clsx('text-[10px] font-mono font-bold', isLight ? 'text-slate-700' : 'text-slate-200')}>
                          {item.value}%
                        </div>
                        <div className={clsx('text-[10px]', isLight ? 'text-slate-400' : 'text-slate-500')}>
                          {item.label}
                        </div>
                        <div className={clsx('w-full rounded-full h-1 mt-0.5', isLight ? 'bg-slate-200' : 'bg-slate-700/50')}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(item.value, 100)}%`, background: item.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!stats && (
                  <div className={clsx('flex items-center gap-1 text-[10px]', isLight ? 'text-slate-400' : 'text-slate-600')}>
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
