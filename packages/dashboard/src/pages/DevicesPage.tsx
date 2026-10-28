import { useState, useEffect } from 'react'
import { Monitor, Plus, Copy, Trash2, Check, X, ExternalLink, Terminal, BookOpen, Laptop, Zap, Loader2, Ban, Power } from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, SkeletonRows } from '../components/ui'
import { clsx } from 'clsx'
import { Link, useNavigate } from 'react-router-dom'
import type { Device } from '@airemote/shared'
import { useT } from '../lib/i18n'
import { useAuthStore } from '../store/authStore'

function WolModal({ device, token, onClose }: { device: Device; token: string; onClose: () => void }) {
  const t = useT()
  // v3.5 — prefill from the agent info (when available) and remember the last MAC
  const [mac, setMac] = useState(() => {
    try { return (device as unknown as { info?: { mac?: string } }).info?.mac || localStorage.getItem('wol-mac-' + device.id) || '' } catch { return '' }
  })
  const [broadcast, setBroadcast] = useState(() => {
    try { return (device as unknown as { info?: { broadcast?: string } }).info?.broadcast || '255.255.255.255' } catch { return '255.255.255.255' }
  })
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setSending(true); setResult(null)
    try {
      const r = await fetch(`/api/devices/${device.id}/wol`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ macAddress: mac.trim(), broadcast: broadcast.trim() || '255.255.255.255' })
      })
      const data = await r.json()
      if (r.ok) {
        try { localStorage.setItem('wol-mac-' + device.id, mac.trim()) } catch {}
        setResult({ ok: true, msg: data.message || t('wol_success') })
      }
      else       setResult({ ok: false, msg: data.error  || t('wol_fail') })
    } catch {
      setResult({ ok: false, msg: t('wol_network_error') })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-warning/15 flex items-center justify-center">
              <Zap size={16} className="text-warning" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">Wake-on-LAN</h3>
              <p className="text-xs text-muted mt-0.5">{device.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors"><X size={18} /></button>
        </div>

        <form onSubmit={handleSend} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">MAC Address</label>
            <input
              value={mac} onChange={e => setMac(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
              dir="ltr"
              className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-muted/70 font-mono focus:outline-none focus:border-warning/50"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Broadcast IP <span className="text-muted/70">({t('wol_optional')})</span></label>
            <input
              value={broadcast} onChange={e => setBroadcast(e.target.value)}
              placeholder="255.255.255.255"
              dir="ltr"
              className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-muted/70 font-mono focus:outline-none focus:border-warning/50"
            />
          </div>

          <div className="rounded-lg border border-line bg-surface2 px-3 py-2 text-[11px] leading-5 text-muted">
            {t('wol_hint')}
          </div>

          {result && (
            <div className={clsx(
              'text-xs px-3 py-2 rounded-lg',
              result.ok ? 'bg-success/10 text-success border border-success/20' : 'bg-danger/10 text-danger border border-danger/20'
            )}>
              {result.msg}
            </div>
          )}

          <button
            type="submit" disabled={sending || !mac.trim()}
            className="w-full flex items-center justify-center gap-2 bg-warning/15 hover:bg-warning/20 disabled:opacity-40 disabled:cursor-not-allowed text-warning text-sm font-medium py-2.5 rounded-lg transition-colors border border-warning/30"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {sending ? t('wol_sending') : t('wol_send')}
          </button>
        </form>
      </div>
    </div>
  )
}

function AgentInstallModal({ device, onClose }: { device: Device; onClose: () => void }) {
  const t = useT()
  const [copied, setCopied] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState(window.location.origin)
  const [addresses, setAddresses] = useState<string[]>([])
  useEffect(() => {
    const h = window.location.hostname
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1') {
      fetch('/api/health').then(r => r.json()).then(j => {
        if (j && j.localIp) setServerUrl('http://' + j.localIp + (window.location.port ? ':' + window.location.port : ''))
      }).catch(() => {})
    }
  }, [])
  const wsUrl = serverUrl.replace(/^https?:\/\//, m => m === 'https://' ? 'wss://' : 'ws://') + '/ws'

  const scripts = {
    linux: `# Install AiRemote Agent on Linux/macOS
curl -fsSL ${serverUrl}/agent-install.sh | bash -s -- \\
  --token "${device.token}" \\
  --server "${serverUrl}"

# Or manually:
npm install -g @airemote/agent
airemote-agent start \\
  --token "${device.token}" \\
  --server "${serverUrl}"`,

    docker: `# Run Agent in Docker
docker run -d \\
  --name airemote-agent \\
  --restart unless-stopped \\
  -e AIREMOTE_TOKEN="${device.token}" \\
  -e AIREMOTE_SERVER="${serverUrl}" \\
  ghcr.io/airemote/agent:latest`,

    env: `# .env file for Agent
AIREMOTE_TOKEN=${device.token}
AIREMOTE_SERVER=${serverUrl}
AIREMOTE_LOG_LEVEL=info`
  }

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2500)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <BookOpen size={16} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">Agent - {device.name}</h3>
              {addresses.length > 0 && (
                <p className="text-[10px] text-muted font-mono mt-0.5" dir="ltr">{addresses.join('  ·  ')}</p>
              )}
              <p className="text-xs text-muted mt-0.5">{t('tab_terminal')}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Windows Agent — highlighted box */}
          <div className="bg-brand-teal/5 border border-brand-teal/25 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Laptop size={15} className="text-brand-teal" />
              <span className="text-sm font-semibold text-brand-teal">Windows Agent (Desktop App)</span>
            </div>

            {/* WS URL */}
            <div>
              <label className="block text-xs text-muted mb-1.5">① Server URL</label>
              <div className="flex items-center gap-2 bg-canvas rounded-lg p-2.5 border border-brand-teal/30">
                <code className="text-xs font-mono text-brand-teal flex-1 break-all" dir="ltr">{wsUrl}</code>
                <button
                  onClick={() => copy('wsurl', wsUrl)}
                  className="text-muted hover:text-brand-teal p-1.5 transition-colors flex-shrink-0"
                >
                  {copied === 'wsurl' ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            {/* Token */}
            <div>
              <label className="block text-xs text-muted mb-1.5">② Device Token</label>
              <div className="flex items-center gap-2 bg-canvas rounded-lg p-2.5 border border-line">
                <code className="text-xs font-mono text-ink flex-1 break-all" dir="ltr">{device.token}</code>
                <button
                  onClick={() => copy('token', device.token)}
                  className="text-muted hover:text-ink p-1.5 transition-colors flex-shrink-0"
                >
                  {copied === 'token' ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            <p className="text-xs text-muted">
              {t('agent_install_hint')}
            </p>
          </div>

          {/* Linux/macOS */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-primary text-primary-fg text-xs flex items-center justify-center font-bold">2</div>
              <span className="text-sm font-medium text-ink">Linux / macOS</span>
            </div>
            <div className="relative">
              <pre className="bg-[#0a0f1e] rounded-lg p-3 text-xs font-mono text-ink/90 overflow-x-auto border border-line leading-relaxed">
                {scripts.linux}
              </pre>
              <button
                onClick={() => copy('linux', scripts.linux)}
                className="absolute top-2 end-2 p-1.5 text-muted hover:text-ink bg-surface2 rounded-md transition-colors"
              >
                {copied === 'linux' ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Docker */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-muted ms-7">Docker:</span>
            </div>
            <div className="relative">
              <pre className="bg-[#0a0f1e] rounded-lg p-3 text-xs font-mono text-ink/90 overflow-x-auto border border-line leading-relaxed">
                {scripts.docker}
              </pre>
              <button
                onClick={() => copy('docker', scripts.docker)}
                className="absolute top-2 end-2 p-1.5 text-muted hover:text-ink bg-surface2 rounded-md transition-colors"
              >
                {copied === 'docker' ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Env file */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-primary text-primary-fg text-xs flex items-center justify-center font-bold">3</div>
              <span className="text-sm font-medium text-ink"><code className="text-brand-teal">.env</code></span>
            </div>
            <div className="relative">
              <pre className="bg-[#0a0f1e] rounded-lg p-3 text-xs font-mono text-ink/90 overflow-x-auto border border-line">
                {scripts.env}
              </pre>
              <button
                onClick={() => copy('env', scripts.env)}
                className="absolute top-2 end-2 p-1.5 text-muted hover:text-ink bg-surface2 rounded-md transition-colors"
              >
                {copied === 'env' ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-xs text-muted space-y-1">
            <p className="text-primary font-medium mb-2">{t('device_online')} ✓</p>
            <p>• {t('tab_commands')}: {t('execute')}</p>
            <p>• SSH Terminal: {t('connect')}</p>
          </div>
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full bg-primary text-primary-fg hover:brightness-110 text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DevicesPage() {
  const navigate = useNavigate()
  const t = useT()
  const { token, user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [connBusyId, setConnBusyId] = useState<string | null>(null)

  async function connAction(id: string, action: 'disconnect' | 'block' | 'unblock') {
    if (connBusyId) return
    setConnBusyId(id)
    try {
      const r = await fetch('/api/devices/' + id + '/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: '{}'
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      // Refresh immediately; the agent re-registers a few seconds after unblock.
      await fetchDevices()
      window.setTimeout(() => { fetchDevices().catch(() => {}) }, 1500)
      window.setTimeout(() => { fetchDevices().catch(() => {}) }, 5000)
    } catch {
      // Keep UI responsive; the store refresh reflects the real state.
    } finally {
      setConnBusyId(null)
    }
  }
  const { devices, loading, error, fetchDevices, addDevice, deleteDevice } = useDeviceStore()
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [installDevice, setInstallDevice] = useState<Device | null>(null)
  const [wolDevice, setWolDevice] = useState<Device | null>(null)

  useEffect(() => { fetchDevices() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    try {
      const device = await addDevice(newName.trim())
      setNewName('')
      setShowAdd(false)
      setInstallDevice(device)
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`${t('device_delete_confirm')} "${name}"?`)) return
    await deleteDevice(id)
  }

  const online = devices.filter(d => d.status === 'online').length

  return (
    <div className="cr-page">
      {installDevice && (
        <AgentInstallModal device={installDevice} onClose={() => setInstallDevice(null)} />
      )}
      {wolDevice && token && (
        <WolModal device={wolDevice} token={token} onClose={() => setWolDevice(null)} />
      )}

      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">{t('devices_title')}</h2>
          <p className="mt-1 text-sm text-muted">
            {devices.length} {t('devices')} · <span className="text-success">{online} {t('online')}</span>
          </p>
        </div>
        <Button variant="primary" size="md" icon={<Plus size={15} />} onClick={() => setShowAdd(true)}>
          {t('add_device_btn')}
        </Button>
      </div>

      {error && <Alert tone="danger" className="mb-4" title="تعذّر تحميل الأجهزة">{error}</Alert>}

      {showAdd && (
        <Card className="mb-4">
          <CardBody>
            <h3 className="mb-3 text-[13px] font-medium text-ink">{t('add_device')}</h3>
            <form onSubmit={handleAdd} className="flex items-center gap-2">
              <Input
                autoFocus type="text" value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder={t('device_name')}
                aria-label={t('device_name')}
                className="flex-1"
              />
              <Button type="submit" variant="primary" size="md" loading={adding}>{t('add')}</Button>
              <Button variant="ghost" size="md" aria-label="إغلاق" icon={<X size={16} />} onClick={() => setShowAdd(false)} />
            </form>
          </CardBody>
        </Card>
      )}

      {loading && (
        <Card>
          <CardBody><SkeletonRows rows={5} /></CardBody>
        </Card>
      )}

      {!loading && devices.length === 0 && (
        <Card>
          <EmptyState
            icon={<Monitor size={26} />}
            title={t('no_devices_yet')}
            description={t('no_devices_desc')}
            action={<Button variant="primary" size="md" icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>{t('add_device_btn')}</Button>}
          />
        </Card>
      )}

      {!loading && devices.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-4 py-3 text-start text-xs font-medium text-muted">{t('devices')}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-muted">{t('platform')}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-muted">{t('stat_connected')}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-muted">{t('hostname')}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-muted">{t('last_seen')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.id} className="border-b border-line/60 hover:bg-surface2 transition-colors group cursor-pointer"
                onClick={(e) => { if ((e.target as HTMLElement).closest('button,a')) return; navigate(`/devices/${d.id}`) }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center', d.status === 'online' ? 'bg-primary/15' : 'bg-surface2')}>
                        <Monitor size={13} className={d.status === 'online' ? 'text-primary' : 'text-muted'} />
                      </div>
                      <div>
                        <div className="font-medium text-ink">{d.name}</div>
                        <div className="text-xs text-muted/70 font-mono">{d.id.slice(0, 8)}...</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {d.info?.platform || '—'} {d.info?.arch || ''}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={d.status === 'online' ? 'success' : d.status === 'blocked' ? 'danger' : 'neutral'}>
                      <span className={clsx('h-1.5 w-1.5 rounded-full', d.status === 'online' ? 'animate-pulse bg-success' : 'bg-muted')} />
                      {d.status === 'online' ? t('online') : d.status === 'blocked' ? 'محجوب' : t('offline')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted font-mono">{d.info?.hostname || '—'}
                    {(d as unknown as { remoteIp?: string }).remoteIp && (
                      <div className="text-[10px] text-muted/70">{String((d as unknown as { remoteIp?: string }).remoteIp).replace('::ffff:', '')}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {d.lastSeen ? new Date(d.lastSeen).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => setInstallDevice(d)}
                        className="p-1.5 text-muted/70 hover:text-brand-teal transition-colors rounded"
                        title="Agent" aria-label="Agent install"
                      >
                        <Terminal size={13} />
                      </button>
                      {isAdmin && (
                      <button
                        onClick={() => connAction(d.id, d.status === 'blocked' ? 'unblock' : 'block')}
                        disabled={connBusyId === d.id}
                        className={clsx('p-1.5 transition-colors rounded disabled:opacity-40 disabled:cursor-wait', d.status === 'blocked' ? 'text-success hover:text-success' : 'text-muted/70 hover:text-danger')}
                        title={d.status === 'blocked' ? 'Unblock device' : 'Block device'} aria-label={d.status === 'blocked' ? 'Unblock device' : 'Block device'}
                      >
                        {connBusyId === d.id ? <Loader2 size={13} className="animate-spin" /> : d.status === 'blocked' ? <Check size={13} /> : <Power size={13} />}
                      </button>
                      )}
                      {d.status === 'offline' && (
                        <button
                          onClick={() => setWolDevice(d)}
                          className="p-1.5 text-muted/70 hover:text-warning transition-colors rounded"
                          title="Wake-on-LAN" aria-label="Wake-on-LAN"
                        >
                          <Zap size={13} />
                        </button>
                      )}
                      <Link
                        to={`/devices/${d.id}`}
                        className="p-1.5 text-muted/70 hover:text-primary transition-colors rounded"
                        title={t('tab_overview')} aria-label={t('tab_overview')}
                      >
                        <ExternalLink size={13} />
                      </Link>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(d.id, d.name)}
                          className="p-1.5 text-muted/70 hover:text-danger transition-colors rounded"
                          title={t('delete')} aria-label={t('delete')}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
