import { useState, useEffect } from 'react'
import { AGENT_TARGET_VERSION } from '../lib/version'
import { Monitor, Smartphone, Plus, Copy, Trash2, Check, X, ExternalLink, Terminal, Laptop, Zap, Loader2, Ban, Power, Search, RefreshCw, MoreVertical, FolderOpen } from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Field, Input, Modal, SkeletonRows } from '../components/ui'
import { clsx } from 'clsx'
import { Link, useNavigate } from 'react-router-dom'
import type { Device } from '@airemote/shared'
import { useT } from '../lib/i18n'
import { useAuthStore } from '../store/authStore'
import { api } from '../lib/api'
import { openScreenWindow } from '../lib/screenWindow'

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
    linux: `# Linux/macOS - run the agent from this repository
cd packages/agent
npm install
npm run build
SERVER_URL="${serverUrl}" DEVICE_TOKEN="${device.token}" DEVICE_NAME="${device.name}" npm start`,

    env: `# .env file for the agent (packages/agent reads these keys)
SERVER_URL=${serverUrl}
DEVICE_TOKEN=${device.token}
DEVICE_NAME=${device.name}`
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
  const [startupBusyId, setStartupBusyId] = useState<string | null>(null)

  // 3.14.1 - start-with-Windows, toggled from the server and confirmed by the agent
  async function toggleStartup(id: string, enabled: boolean) {
    if (startupBusyId) return
    setStartupBusyId(id)
    try {
      await api.post('/api/devices/' + id + '/startup', { enabled })
      await fetchDevices()
      window.setTimeout(() => { fetchDevices().catch(() => {}) }, 1500)
    } catch { /* offline or forbidden: the row keeps the state the agent reported */ }
    finally { setStartupBusyId(null) }
  }

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
  const [rowMenu, setRowMenu] = useState<string | null>(null)  // قائمة أفعال الصف
  // 2026-11-09 — بث نشط لكل جهاز (نفس مصدر غرفة العمليات).
  const [liveScreens, setLiveScreens] = useState<Record<string, number>>({})
  useEffect(() => {
    let stop = false
    const load = () => {
      api.get('/api/sessions/screen/active')
        .then(r => {
          if (stop) return
          const map: Record<string, number> = {}
          for (const x of (r.data || [])) if (x && x.deviceId) map[x.deviceId] = Number(x.viewers || 1)
          setLiveScreens(map)
        })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 10000)
    return () => { stop = true; clearInterval(timer) }
  }, [])

  const olderThan = (have: string, want: string) => {
    const norm = (x: string) => String(x).split('-')[0].split('.').map(n => parseInt(n, 10) || 0)
    const a = norm(have), b = norm(want)
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] || 0) - (b[i] || 0)
      if (d !== 0) return d < 0
    }
    return false
  }

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

  // 2026-11-09 — أدوات الصفحة: بحث وفلتر حالة (كانت الصفحة بلا أي أدوات).
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all')
  const needle = q.trim().toLowerCase()
  const visible = devices.filter(d => {
    if (statusFilter !== 'all' && (d.status === 'online') !== (statusFilter === 'online')) return false
    if (!needle) return true
    const info = (d.info || {}) as Record<string, unknown>
    const hay = [d.name, info.hostname, info.ipLocal, info.ipPublic, info.platform]
      .filter(Boolean).map(v => String(v).toLowerCase()).join(' ')
    return hay.includes(needle)
  })
  const offline = devices.length - online
  // 2026-11-09 — تحديد متعدد لأفعال جماعية (حجب/حذف).
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [bulkBusy, setBulkBusy] = useState(false)
  const chosen = Object.keys(selected).filter(id => selected[id])
  const allChosen = visible.length > 0 && visible.every(d => selected[d.id])
  const toggleOne = (id: string) => setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  const toggleAll = () => {
    if (allChosen) setSelected({})
    else setSelected(Object.fromEntries(visible.map(d => [d.id, true])))
  }
  const bulkBlock = async (block: boolean) => {
    setBulkBusy(true)
    try { for (const id of chosen) await connAction(id, block ? 'block' : 'unblock') }
    finally { setBulkBusy(false); setSelected({}) }
  }
  const bulkDelete = async () => {
    if (!confirm(`حذف ${chosen.length} جهازًا نهائيًا؟`)) return
    setBulkBusy(true)
    try { for (const id of chosen) await deleteDevice(id) }
    finally { setBulkBusy(false); setSelected({}) }
  }
  // 2026-11-09 — ترتيب بالنقر على العمود (الاسم · الحالة · آخر اتصال).
  const [sortKey, setSortKey] = useState<'name' | 'status' | 'lastSeen' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const toggleSort = (k: 'name' | 'status' | 'lastSeen') => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }
  const rank = (st: string) => (st === 'online' ? 0 : st === 'blocked' ? 1 : 2)
  const sorted = sortKey
    ? [...visible].sort((a, b) => {
        let d = 0
        if (sortKey === 'name') d = String(a.name).localeCompare(String(b.name), 'ar')
        else if (sortKey === 'status') d = rank(a.status) - rank(b.status)
        else {
          const ta = a.lastSeen ? new Date(a.lastSeen as unknown as string).getTime() : 0
          const tb = b.lastSeen ? new Date(b.lastSeen as unknown as string).getTime() : 0
          d = ta - tb
        }
        return sortDir === 'asc' ? d : -d
      })
    : visible

  // اختصار / لتركيز البحث و Esc لمسحه
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = !!el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)
      if (e.key === '/' && !typing) { e.preventDefault(); document.querySelector<HTMLInputElement>('input[type=search]')?.focus() }
      if (e.key === 'Escape' && (el as HTMLInputElement)?.type === 'search') { setQ(''); (el as HTMLInputElement).blur() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // 2026-11-09 — وقت نسبي لآخر اتصال («قبل 3 د») مع التاريخ الكامل في التلميح.
  const relSeen = (v?: string | Date) => {
    if (!v) return '—'
    const d0 = new Date(typeof v === 'string' ? v.replace(' ', 'T') : v)
    if (isNaN(d0.getTime())) return String(v)
    const mins = Math.floor((Date.now() - d0.getTime()) / 60000)
    if (mins < 1) return 'الآن'
    if (mins < 60) return `قبل ${mins} د`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `قبل ${hours} س`
    const days = Math.floor(hours / 24)
    if (days < 30) return `قبل ${days} ي`
    return fmtSeen(v)
  }

  // 2026-11-09 — تنسيق ثابت وواضح لآخر اتصال بدل toLocaleString الافتراضي
  // الذي يُخرج «AM 10:19:39 ,11/9/2026» (فاصلة في غير موضعها وAM لاتينية).
  const fmtSeen = (v?: string | Date) => {
    if (!v) return '—'
    const d0 = new Date(typeof v === 'string' ? v.replace(' ', 'T') : v)
    if (isNaN(d0.getTime())) return String(v)
    const p2 = (n: number) => String(n).padStart(2, '0')
    return `${d0.getFullYear()}-${p2(d0.getMonth() + 1)}-${p2(d0.getDate())} · ${p2(d0.getHours())}:${p2(d0.getMinutes())}`
  }

  return (
    <div className="cr-page">
      {installDevice && (
        <AgentInstallModal device={installDevice} onClose={() => setInstallDevice(null)} />
      )}
      {wolDevice && token && (
        <WolModal device={wolDevice} token={token} onClose={() => setWolDevice(null)} />
      )}

      <div className="mb-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-ink">{t('devices_title')}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
            <span className="rounded-full border border-line bg-surface2 px-2.5 py-1 text-muted">
              الأجهزة <b className="text-ink">{devices.length}</b>
            </span>
            <span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-success">
              متصل <b>{online}</b>
            </span>
            <span className="rounded-full border border-line bg-surface2 px-2.5 py-1 text-muted">
              غير متصل <b>{offline}</b>
            </span>
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>
              {t('add_device_btn')}
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute inset-y-0 my-auto start-3 text-muted" />
          <input
            type="search" value={q} onChange={e => setQ(e.target.value)}
            placeholder="ابحث بالاسم أو المضيف أو IP"
            aria-label="بحث في الأجهزة"
            className="h-9 w-full rounded-lg border border-line bg-canvas ps-9 pe-3 text-[12.5px] text-ink outline-none transition-colors focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-canvas p-0.5" role="group" aria-label="فلتر الحالة">
          {([
            ['all', 'الكل'], ['online', 'متصل'], ['offline', 'غير متصل'],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setStatusFilter(key)}
              aria-pressed={statusFilter === key}
              className={
                'h-8 rounded-md px-3 text-[11.5px] transition-colors ' +
                (statusFilter === key ? 'bg-primary text-primary-fg font-medium' : 'text-muted hover:text-ink')
              }>
              {label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="md" aria-label="تحديث" title="تحديث" icon={<RefreshCw size={14} />} onClick={() => fetchDevices()} />
      </div>

      {/* 3.16.7 - the store only ever sets the code 'load_failed'; the title already says it. */}
      {error && <Alert tone="danger" className="mb-4" title={t('devices_load_failed')} />}

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
              <Button variant="ghost" size="md" aria-label={t('ui_close')} icon={<X size={16} />} onClick={() => setShowAdd(false)} />
            </form>
          </CardBody>
        </Card>
      )}

      {loading && (
        <Card>
          <CardBody><SkeletonRows rows={5} /></CardBody>
        </Card>
      )}

      {!loading && !error && devices.length === 0 && (
        <Card>
          <EmptyState
            icon={<Monitor size={26} />}
            title={t('no_devices_yet')}
            description={t('no_devices_desc')}
            action={<Button variant="primary" size="md" icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>{t('add_device_btn')}</Button>}
          />
        </Card>
      )}

      {/* 2026-11-09 — حالة «لا نتائج»: الفلترة إلى صفر كانت تُفرّغ المساحة بلا رسالة. */}
      {!loading && !error && devices.length > 0 && visible.length === 0 && (
        <Card>
          <EmptyState
            icon={<Search size={26} />}
            title="لا نتائج مطابقة"
            description={
              q.trim()
                ? `لا يوجد جهاز يطابق «${q.trim()}»${statusFilter !== 'all' ? ' ضمن الفلتر الحالي' : ''}.`
                : 'لا يوجد جهاز ضمن هذا الفلتر.'
            }
            action={(
              <Button variant="primary" size="md" icon={<RefreshCw size={14} />}
                onClick={() => { setQ(''); setStatusFilter('all') }}>
                مسح البحث والفلترة
              </Button>
            )}
          />
        </Card>
      )}

      {chosen.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[12px]">
          <span className="text-ink">حُدِّد <b>{chosen.length}</b> جهاز</span>
          <span className="flex-1" />
          {isAdmin && (
            <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={() => bulkBlock(true)}>حجب</Button>
          )}
          {isAdmin && (
            <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={() => bulkBlock(false)}>إلغاء الحجب</Button>
          )}
          {isAdmin && (
            <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={bulkDelete}>حذف</Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setSelected({})}>إلغاء التحديد</Button>
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-line">
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" checked={allChosen} onChange={toggleAll} aria-label="تحديد كل الأجهزة"
                    className="h-3.5 w-3.5 cursor-pointer accent-[var(--b-accent)]" />
                </th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted">
                  <button type="button" onClick={() => toggleSort('name')}
                    className="inline-flex items-center gap-1 hover:text-ink"
                    title="ترتيب حسب الأجهزة">
                    الأجهزة
                    <span className="text-[9px]">{sortKey === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                  </button>
                </th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted">{t('platform')}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted">
                  <button type="button" onClick={() => toggleSort('status')}
                    className="inline-flex items-center gap-1 hover:text-ink"
                    title="ترتيب حسب الحالة">
                    الحالة
                    <span className="text-[9px]">{sortKey === 'status' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                  </button>
                </th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted">{t('hostname')}</th>
                <th className="px-4 py-2.5 text-start text-xs font-medium text-muted">
                  <button type="button" onClick={() => toggleSort('lastSeen')}
                    className="inline-flex items-center gap-1 hover:text-ink"
                    title="ترتيب حسب آخر اتصال">
                    آخر اتصال
                    <span className="text-[9px]">{sortKey === 'lastSeen' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                  </button>
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(d => (
                <tr key={d.id} className="border-b border-line/60 hover:bg-surface2 transition-colors group cursor-pointer"
                onClick={(e) => { if ((e.target as HTMLElement).closest('button,a')) return; navigate(`/devices/${d.id}`) }}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={!!selected[d.id]} onChange={() => toggleOne(d.id)}
                      onClick={(e) => e.stopPropagation()} aria-label={`تحديد ${d.name}`}
                      className="h-3.5 w-3.5 cursor-pointer accent-[var(--b-accent)]" />
                  </td>                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center', d.status === 'online' ? 'bg-primary/15' : 'bg-surface2')}>
                        {/android/i.test(String(d.info?.platform || ''))
                          ? <Smartphone size={13} className={d.status === 'online' ? 'text-primary' : 'text-muted'} />
                          : <Monitor size={13} className={d.status === 'online' ? 'text-primary' : 'text-muted'} />}
                      </div>
                      <div>
                        <div className="font-medium text-ink">{d.name}</div>
                        <div className="text-xs text-muted font-mono">{d.id.slice(0, 8)}...</div>
                        {/* P6-fix — اتصال وكيل↔وكيل: الطرف الآخر ونوع الاتصال وحالته */}
                        {(() => {
                          const r = (d as unknown as { relay?: { state: string; access: string; direction: string; peerName: string } }).relay
                          if (!r) return null
                          const acc = r.access === 'control' ? t('acc_control') : r.access === 'files' ? t('acc_files') : t('acc_view')
                          const live = r.state === 'active'
                          const st = live ? 'LIVE' : r.state === 'requested' ? t('relay_state_pending') : t('relay_state_suspended')
                          return (
                            <div
                              className={clsx(
                                'mt-1 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                                live ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'
                              )}
                              title={live ? t('relay_card_active') : t('relay_card_pending')}
                            >
                              <span aria-hidden="true" className={clsx('h-1.5 w-1.5 rounded-full', live ? 'animate-pulse bg-danger' : 'bg-warning')} />
                              <span aria-hidden="true">{r.direction === 'out' ? '↗' : '↙'}</span>
                              <span>{st} · {r.peerName} · {acc}</span>
                              {/* 3.11.4 — قطع قسري للجلسة من السيرفر */}
                              <button
                                type="button"
                                className="ms-1 rounded border border-primary/40 px-1 text-[10px] hover:bg-primary/20"
                                title={t('relay_end')}
                                onClick={async (ev) => {
                                  ev.stopPropagation()
                                  const sid = (r as unknown as { sessionId?: string }).sessionId || ''
                                  if (!sid) return
                                  try { await api.post('/api/relay/' + sid + '/close', { reason: 'admin_force' }); await fetchDevices() } catch {}
                                }}
                              >{t('relay_end_short')}</button>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted text-xs">
                    {d.info?.platform || '—'} {d.info?.arch || ''}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={d.status === 'online' ? 'success' : d.status === 'blocked' ? 'danger' : 'neutral'}>
                      <span className={clsx('h-1.5 w-1.5 rounded-full', d.status === 'online' ? 'animate-pulse bg-success' : 'bg-muted')} />
                      {d.status === 'online' ? t('online') : d.status === 'blocked' ? 'محجوب' : t('offline')}
                    </Badge>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {liveScreens[d.id] && (
                        <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[9.5px] text-primary" title="بث نشط الآن">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />بث · {liveScreens[d.id]}
                        </span>
                      )}
                      {(() => {
                        const info = (d.info || {}) as Record<string, unknown>
                        const ver = String(info.agentVersion || '')
                        return (ver && olderThan(ver, AGENT_TARGET_VERSION))
                          ? <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9.5px] text-warning" title={`الوكيل ${ver} أقدم من ${AGENT_TARGET_VERSION}`}>تحديث متاح</span>
                          : null
                      })()}
                      {(() => {
                        const info = (d.info || {}) as Record<string, unknown>
                        const ver = String(info.agentVersion || '')
                        const caps = ((d as unknown as { capabilities?: Record<string, unknown> }).capabilities || {}) as Record<string, unknown>
                        const layer = String((d as unknown as { tunnelLayer?: string }).tunnelLayer || '')
                        const tags = Array.isArray(d.tags) ? d.tags.slice(0, 2) : []
                        return (
                          <>
                            {ver && <span className="rounded bg-surface2 px-1.5 py-0.5 text-[9.5px] tabular-nums text-muted" title={`نسخة الوكيل ${ver}`}>v{ver}</span>}
                            {layer && <span className="rounded bg-surface2 px-1.5 py-0.5 text-[9.5px] text-muted" title="نوع الاتصال">{layer === 'lan' ? 'LAN' : 'نفق'}</span>}
                            {info.elevated === true && <span className="rounded bg-success/15 px-1.5 py-0.5 text-[9.5px] text-success" title="صلاحيات مرتفعة">مرتفع</span>}
                            {caps.pty === true && <span title="طرفية"><Terminal size={10} className="text-muted" /></span>}
                            {caps.fs === true && <span title="ملفات"><FolderOpen size={10} className="text-muted" /></span>}
                            {caps.screenControl === true && <span title="تحكم بالشاشة"><Monitor size={10} className="text-muted" /></span>}
                            {tags.map(tg => <span key={tg} className="rounded-full border border-line px-1.5 py-0.5 text-[9px] text-muted">{tg}</span>)}
                          </>
                        )
                      })()}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted font-mono">{d.info?.hostname || '—'}
                    <div className="text-[10px] text-muted">
                      {String(d.info?.ipLocal || (d as unknown as { remoteIp?: string }).remoteIp || '—').replace('::ffff:', '')}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted tabular-nums">
                    <span title={fmtSeen(d.lastSeen)}>{relSeen(d.lastSeen)}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="relative flex items-center justify-end gap-1">
                      {d.status === 'online' && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); openScreenWindow(d.id) }}
                          className="rounded p-1.5 text-muted/80 transition-colors hover:text-info"
                          title={t('devices_open_screen')} aria-label={t('devices_open_screen')}>
                          <Monitor size={14} />
                        </button>
                      )}
                      <button type="button" aria-haspopup="menu" aria-expanded={rowMenu === d.id}
                        onClick={(e) => { e.stopPropagation(); setRowMenu(rowMenu === d.id ? null : d.id) }}
                        className={clsx('rounded p-1.5 transition-colors', rowMenu === d.id ? 'bg-surface2 text-ink' : 'text-muted/80 hover:bg-surface2 hover:text-ink')}
                        title="أفعال الجهاز" aria-label="أفعال الجهاز">
                        <MoreVertical size={15} />
                      </button>

                      {rowMenu === d.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} />
                          <div role="menu" className="absolute end-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-2xl">
                            <button type="button" role="menuitem" onClick={() => { setRowMenu(null); navigate(`/devices/${d.id}`) }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[12px] text-ink hover:bg-surface2">
                              <ExternalLink size={12} className="text-muted" /> فتح التفاصيل
                            </button>
                            {d.status === 'online' && (
                              <>
                                <button type="button" role="menuitem" onClick={() => { setRowMenu(null); openScreenWindow(d.id) }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[12px] text-ink hover:bg-surface2">
                                  <Monitor size={12} className="text-muted" /> بث الشاشة
                                </button>
                                <button type="button" role="menuitem" onClick={() => { setRowMenu(null); navigate(`/files/${d.id}`) }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[12px] text-ink hover:bg-surface2">
                                  <FolderOpen size={12} className="text-muted" /> الملفات
                                </button>
                              </>
                            )}
                            {/* 3.16.7 — the modal needs device.token, and the token is now admin-only. */}
                            {isAdmin && (
                              <button type="button" role="menuitem" onClick={() => { setRowMenu(null); setInstallDevice(d) }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[12px] text-ink hover:bg-surface2">
                                <Terminal size={12} className="text-muted" /> تثبيت الوكيل
                              </button>
                            )}
                            {d.status === 'online' && String(d.info?.platform || '').toLowerCase() === 'windows' && (() => {
                              const on = (d as unknown as { runAtStartup?: boolean | null }).runAtStartup
                              return (
                                <button type="button" role="menuitemcheckbox" aria-checked={!!on} onClick={() => { setRowMenu(null); toggleStartup(d.id, !on) }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[12px] text-ink hover:bg-surface2">
                                  <Power size={12} className="text-muted" /> {on ? 'إيقاف البدء مع ويندوز' : 'البدء مع ويندوز'}
                                </button>
                              )
                            })()}
                            {d.status === 'offline' && (
                              <button type="button" role="menuitem" onClick={() => { setRowMenu(null); setWolDevice(d) }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[12px] text-warning hover:bg-surface2">
                                <Zap size={12} /> إيقاظ (WOL)
                              </button>
                            )}
                            {isAdmin && (
                              <>
                                <div className="my-1 border-t border-line" />
                                <button type="button" role="menuitem" onClick={() => { setRowMenu(null); connAction(d.id, d.status === 'blocked' ? 'unblock' : 'block') }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[12px] text-ink hover:bg-surface2">
                                  <Ban size={12} className="text-muted" /> {d.status === 'blocked' ? 'إلغاء الحجب' : 'حجب الجهاز'}
                                </button>
                                <button type="button" role="menuitem" onClick={() => { setRowMenu(null); handleDelete(d.id, d.name) }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[12px] text-danger hover:bg-danger/10">
                                  <Trash2 size={12} /> حذف الجهاز
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[11.5px] text-muted">
            <span>
              عرض <b className="text-ink">{visible.length}</b> من أصل <b className="text-ink">{devices.length}</b> أجهزة
              {visible.length !== devices.length && (
                <span className="ms-2 rounded-full bg-surface2 px-2 py-0.5">
                  {statusFilter === 'online' ? 'متصل فقط' : statusFilter === 'offline' ? 'غير متصل فقط' : 'نتائج البحث'}
                  {q.trim() ? ` · «${q.trim()}»` : ''}
                </span>
              )}
            </span>
            <span className="tabular-nums">متصل الآن: <b className="text-success">{online}</b> · غير متصل: <b>{offline}</b></span>
          </div>
        </div>
      )}
    </div>
  )
}
