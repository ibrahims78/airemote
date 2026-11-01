import { useState, useEffect } from 'react'
import { Monitor, Plus, Copy, Trash2, Check, X, ExternalLink, Terminal, Laptop, Zap, Loader2, Ban, Power } from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Field, Input, Modal, SkeletonRows } from '../components/ui'
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
    <Modal
      open
      onClose={onClose}
      title="Wake-on-LAN"
      description={device.name}
      size="sm"
      footer={<>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button
          variant="primary"
          type="submit"
          form="wol-form"
          loading={sending}
          disabled={!mac.trim()}
          icon={<Zap size={14} />}
        >
          {sending ? t('wol_sending') : t('wol_send')}
        </Button>
      </>}
    >
      <form id="wol-form" onSubmit={handleSend} className="space-y-3">
        <Field label="MAC Address" htmlFor="wol-mac">
          <Input
            id="wol-mac"
            autoFocus
            value={mac}
            onChange={e => setMac(e.target.value)}
            placeholder="AA:BB:CC:DD:EE:FF"
            dir="ltr"
            className="font-mono"
          />
        </Field>
        <Field label={`Broadcast IP (${t('wol_optional')})`} htmlFor="wol-broadcast">
          <Input
            id="wol-broadcast"
            value={broadcast}
            onChange={e => setBroadcast(e.target.value)}
            placeholder="255.255.255.255"
            dir="ltr"
            className="font-mono"
          />
        </Field>
        <Alert tone="info">{t('wol_hint')}</Alert>
        {result && <Alert tone={result.ok ? 'success' : 'danger'}>{result.msg}</Alert>}
      </form>
    </Modal>
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
    <Modal
      open
      onClose={onClose}
      title={`Agent — ${device.name}`}
      description={t('tab_terminal')}
      size="lg"
      footer={<Button variant="primary" onClick={onClose}>{t('close')}</Button>}
    >
      <div className="max-h-[62vh] space-y-3 overflow-y-auto pe-1">
        {addresses.length > 0 && (
          <p className="font-mono text-[10px] text-muted" dir="ltr">{addresses.join('  ·  ')}</p>
        )}

        {/* Windows agent — the primary path */}
        <Card className="border-primary/25 bg-primary/5">
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <Laptop size={15} className="text-primary" />
              <span className="text-[12px] font-semibold text-ink">Windows Agent (Desktop App)</span>
            </div>

            <div>
              <p className="mb-1 text-[11px] text-muted">Server URL</p>
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-canvas px-2.5 py-2">
                <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-primary" dir="ltr">{wsUrl}</code>
                <Button
                  size="sm" variant="ghost" aria-label={t('copy_server_url')}
                  onClick={() => copy('wsurl', wsUrl)}
                  icon={copied === 'wsurl' ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                />
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] text-muted">Device Token</p>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2">
                <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-ink" dir="ltr">{device.token}</code>
                <Button
                  size="sm" variant="ghost" aria-label={t('copy_device_token')}
                  onClick={() => copy('token', device.token)}
                  icon={copied === 'token' ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                />
              </div>
            </div>

            <p className="text-[11px] leading-5 text-muted">{t('agent_install_hint')}</p>
          </CardBody>
        </Card>

        {[
          { key: 'linux', label: 'Linux / macOS', text: scripts.linux },
          { key: 'docker', label: 'Docker', text: scripts.docker },
          { key: 'env', label: '.env', text: scripts.env },
        ].map(({ key, label, text }) => (
          <div key={key}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-ink">{label}</span>
              <Button
                size="sm" variant="ghost" aria-label={`${t('copy')} ${label}`}
                onClick={() => copy(key, text)}
                icon={copied === key ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              />
            </div>
            <pre className="overflow-x-auto rounded-lg border border-line bg-code p-3 font-mono text-[11px] leading-relaxed text-ink/90" dir="ltr">
              {text}
            </pre>
          </div>
        ))}

        <Alert tone="info" title={t('device_online')}>
          {t('tab_commands')}: {t('execute')} · SSH Terminal: {t('connect')}
        </Alert>
      </div>
    </Modal>
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
                        <div className="text-xs text-muted font-mono">{d.id.slice(0, 8)}...</div>
                        {/* P6-fix — اتصال وكيل↔وكيل: الطرف الآخر ونوع الاتصال وحالته */}
                        {(() => {
                          const r = (d as unknown as { relay?: { state: string; access: string; direction: string; peerName: string } }).relay
                          if (!r) return null
                          const acc = r.access === 'control' ? 'تحكم' : r.access === 'files' ? 'ملفات' : 'عرض'
                          const st = r.state === 'active' ? 'متصل الآن' : r.state === 'requested' ? 'طلب معلّق' : 'معلّقة'
                          return (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                              <span aria-hidden="true">{r.direction === 'out' ? '↗' : '↙'}</span>
                              <span>{r.peerName} · {acc} · {st}</span>
                            </div>
                          )
                        })()}
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
                      <div className="text-[10px] text-muted">{String((d as unknown as { remoteIp?: string }).remoteIp).replace('::ffff:', '')}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {d.lastSeen ? new Date(d.lastSeen).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => setInstallDevice(d)}
                        className="p-1.5 text-muted/70 hover:text-primary transition-colors rounded"
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
