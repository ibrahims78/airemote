import { useState, useEffect, useCallback } from 'react'
import {
  Bell, BellOff, CheckCheck, Trash2, RefreshCw,
  Cpu, HardDrive, MemoryStick, Wifi, WifiOff, AlertTriangle, Plus
} from 'lucide-react'
import { api } from '../lib/api'
import { clsx } from 'clsx'
import { useT } from '../lib/i18n'
import type { TKey } from '../lib/i18n'
import { formatRelativeLang } from '../lib/i18n'
import { useUIStore } from '../store/uiStore'
import { Alert, Button, Card, CardBody, EmptyState, Field, Input, Select, SkeletonRows } from '../components/ui'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  device_id: string | null
  read: number
  created_at: string
}

interface AlertRule {
  id: string
  type: string
  device_id: string | null
  threshold: number | null
  cooldown_min: number
  channel: string
  webhook_url: string | null
  enabled: number
}

const SEVERITY_STYLES: Record<string, string> = {
  info:     'border-s-info bg-info/[0.04]',
  warning:  'border-s-warning bg-warning/[0.04]',
  critical: 'border-s-danger bg-danger/[0.04]',
}

const SEVERITY_ICON_BG: Record<string, string> = {
  info:     'bg-info/15',
  warning:  'bg-warning/15',
  critical: 'bg-danger/15',
}

const SEVERITY_ICON_COLOR: Record<string, string> = {
  info:     'text-primary',
  warning:  'text-warning',
  critical: 'text-danger',
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  cpu_high:       Cpu,
  ram_high:       MemoryStick,
  disk_high:      HardDrive,
  device_offline: WifiOff,
  device_online:  Wifi,
}

const ALERT_TYPE_LABELS_AR: Record<string, string> = {
  device_offline: 'جهاز ينقطع',
  device_online:  'جهاز يتصل',
  cpu_high:       'المعالج مرتفع',
  ram_high:       'الذاكرة مرتفعة',
  disk_high:      'القرص يمتلئ',
}

const ALERT_TYPE_LABELS_EN: Record<string, string> = {
  device_offline: 'Device Offline',
  device_online:  'Device Online',
  cpu_high:       'CPU High',
  ram_high:       'RAM High',
  disk_high:      'Disk Full',
}

function AlertRuleCard({ rule, onDelete, onToggle, T, lang }: {
  rule: AlertRule
  onDelete: (id: string) => void
  onToggle: (id: string, enabled: boolean) => void
  T: (key: Parameters<ReturnType<typeof useT>>[0]) => string
  lang: string
}) {
  const ALERT_TYPE_LABELS = lang === 'ar' ? ALERT_TYPE_LABELS_AR : ALERT_TYPE_LABELS_EN
  return (
    <Card className={clsx('p-3.5', !rule.enabled && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className={clsx('mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg', rule.enabled ? 'bg-primary/15' : 'bg-surface2')}>
            <AlertTriangle size={14} className={rule.enabled ? 'text-primary' : 'text-muted'} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{ALERT_TYPE_LABELS[rule.type] || rule.type}</p>
            <p className="text-xs text-muted mt-0.5">
              {rule.threshold != null ? `${T('notif_threshold_label')} ${rule.threshold}%` : '—'}
              {' · '}
              {T('notif_every_min')} {rule.cooldown_min} {T('notif_min')}
              {rule.device_id ? ` · ${rule.device_id.slice(0, 8)}…` : ` · ${T('notif_all_devices')}`}
            </p>
            {rule.channel === 'webhook' && rule.webhook_url && (
              <p className="text-[10px] text-primary mt-1 truncate max-w-xs">{rule.webhook_url}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={!!rule.enabled}
            aria-label={ALERT_TYPE_LABELS[rule.type] || rule.type}
            onClick={() => onToggle(rule.id, !rule.enabled)}
            className={clsx(
              'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
              rule.enabled ? 'border-primary/40 bg-primary/25' : 'border-line bg-surface2'
            )}
          >
            <span className={clsx(
              'absolute top-0.5 h-4 w-4 rounded-full transition-all',
              rule.enabled ? 'start-4 bg-primary' : 'start-0.5 bg-muted'
            )} />
          </button>
          <Button
            size="sm" variant="ghost" aria-label={T('delete')}
            onClick={() => onDelete(rule.id)}
            className="text-muted hover:text-danger"
            icon={<Trash2 size={13} />}
          />
        </div>
      </div>
    </Card>
  )
}

export function NotificationsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const T    = useT()
  const lang = useUIStore(s => s.lang)

  const ALERT_TYPE_LABELS = lang === 'ar' ? ALERT_TYPE_LABELS_AR : ALERT_TYPE_LABELS_EN

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [rules, setRules]                 = useState<AlertRule[]>([])
  const [unread, setUnread]               = useState(0)
  const [loading, setLoading]             = useState(false)
  const [rulesLoading, setRulesLoading]   = useState(false)
  const [errorKey, setErrorKey]           = useState<TKey | ''>('')
  const [ruleErrorKey, setRuleErrorKey]   = useState<TKey | ''>('')
  const [tab, setTab]                     = useState<'notifications' | 'rules'>('notifications')
  const [showAddRule, setShowAddRule]     = useState(false)
  const [newRule, setNewRule]             = useState({
    type: 'cpu_high', threshold: 90, cooldownMin: 30, channel: 'in_app', webhookUrl: ''
  })

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    setErrorKey('')
    try {
      const res = await api.get('/api/alerts/notifications')
      setNotifications(res.data.notifications ?? [])
      setUnread(res.data.unread ?? 0)
    } catch {
      setErrorKey('notif_load_failed')
    }
    finally { setLoading(false) }
  }, [])

  const loadRules = useCallback(async () => {
    setRulesLoading(true)
    setRuleErrorKey('')
    try {
      const res = await api.get('/api/alerts')
      setRules(res.data ?? [])
    } catch {
      setRuleErrorKey('notif_rules_load_failed')
    } finally { setRulesLoading(false) }
  }, [])

  useEffect(() => { loadNotifications(); loadRules() }, [loadNotifications, loadRules])

  async function markAllRead() {
    await api.post('/api/alerts/notifications/read', { all: true })
    setNotifications(n => n.map(x => ({ ...x, read: 1 })))
    setUnread(0)
  }

  async function clearRead() {
    await api.delete('/api/alerts/notifications')
    setNotifications(n => n.filter(x => !x.read))
  }

  async function deleteRule(id: string) {
    await api.delete(`/api/alerts/${id}`)
    setRules(r => r.filter(x => x.id !== id))
  }

  async function toggleRule(id: string, enabled: boolean) {
    await api.patch(`/api/alerts/${id}`, { enabled })
    setRules(r => r.map(x => x.id === id ? { ...x, enabled: enabled ? 1 : 0 } : x))
  }

  async function addRule() {
    try {
      await api.post('/api/alerts', {
        type: newRule.type,
        threshold: ['cpu_high', 'ram_high', 'disk_high'].includes(newRule.type) ? newRule.threshold : undefined,
        cooldownMin: newRule.cooldownMin,
        channel: newRule.channel,
        webhookUrl: newRule.webhookUrl || undefined
      })
      setShowAddRule(false)
      loadRules()
    } catch {}
  }

  return (
    <div className={embedded ? 'space-y-4' : 'cr-page space-y-4'}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-warning/15">
            <Bell size={16} className="text-warning" />
            {unread > 0 && (
              <span className="absolute -top-1 -start-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-danger/30 bg-danger/15 px-1 text-[9px] font-bold text-danger">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">{T('notif_title')}</h1>
            <p className="text-xs text-muted">
              {unread > 0 ? `${unread} ${T('notif_unread')}` : T('notif_all_ok')}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="h-8 w-8 px-0"
          aria-label={T('refresh')}
          title={T('refresh')}
          icon={<RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />}
          onClick={() => { void loadNotifications(); void loadRules() }}
        />
      </div>

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-xl border border-line bg-surface2 p-1">
        {(['notifications', 'rules'] as const).map(t => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={clsx(
              'rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition-colors',
              tab === t ? 'bg-primary/15 text-primary' : 'text-muted hover:text-ink'
            )}
          >
            {t === 'notifications'
              ? `${T('notif_tab_notifications')}${unread > 0 ? ` (${unread})` : ''}`
              : T('notif_tab_rules')}
          </button>
        ))}
      </div>

      {tab === 'notifications' && (
        <div className="space-y-3">
          {errorKey && <Alert tone="danger" onClose={() => setErrorKey('')}>{T(errorKey)}</Alert>}

          {notifications.length > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" icon={<CheckCheck size={12} />} onClick={() => void markAllRead()}>
                {T('notif_mark_read')}
              </Button>
              <Button variant="danger" icon={<Trash2 size={12} />} onClick={() => void clearRead()}>
                {T('notif_clear_read')}
              </Button>
            </div>
          )}

          {notifications.length === 0 ? (
            loading ? (
              <Card><CardBody><SkeletonRows rows={6} /></CardBody></Card>
            ) : (
              <Card>
                <EmptyState
                  icon={<BellOff size={26} />}
                  title={T('notif_no_notifications')}
                  description={T('notif_no_notifications_hint')}
                />
              </Card>
            )
          ) : notifications.map(notif => {
            const Icon      = TYPE_ICONS[notif.type] ?? Bell
            const sevStyle  = SEVERITY_STYLES[notif.severity] ?? SEVERITY_STYLES.info
            const iconColor = SEVERITY_ICON_COLOR[notif.severity] ?? 'text-primary'
            const iconBg    = SEVERITY_ICON_BG[notif.severity] ?? SEVERITY_ICON_BG.info
            return (
              <div
                key={notif.id}
                className={clsx('rounded-xl border border-line border-s-2 p-3.5 transition-opacity', sevStyle, notif.read && 'opacity-60')}
              >
                <div className="flex items-start gap-3">
                  <div className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconBg)}>
                    <Icon size={14} className={iconColor} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug text-ink">{notif.title}</p>
                      <span className="shrink-0 whitespace-nowrap text-[10px] text-muted">
                        {formatRelativeLang(notif.created_at, lang)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{notif.message}</p>
                    {notif.device_id && (
                      <p className="mt-1 font-mono text-[10px] text-muted" dir="ltr">{notif.device_id}</p>
                    )}
                  </div>
                  {!notif.read && <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'rules' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="md"
              icon={<Plus size={14} />}
              aria-expanded={showAddRule}
              onClick={() => setShowAddRule(v => !v)}
            >
              {T('notif_add_rule')}
            </Button>
          </div>

          {ruleErrorKey && <Alert tone="danger" onClose={() => setRuleErrorKey('')}>{T(ruleErrorKey)}</Alert>}

          {showAddRule && (
            <Card className="border-primary/20">
              <CardBody className="space-y-3">
                <p className="text-[13px] font-medium text-ink">{T('notif_new_rule')}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={T('notif_rule_type')} htmlFor="rule-type">
                    <Select
                      id="rule-type"
                      value={newRule.type}
                      onChange={e => setNewRule(r => ({ ...r, type: e.target.value }))}
                    >
                      {Object.entries(ALERT_TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </Select>
                  </Field>

                  {['cpu_high', 'ram_high', 'disk_high'].includes(newRule.type) && (
                    <Field label={T('notif_rule_threshold')} htmlFor="rule-threshold">
                      <Input
                        id="rule-threshold"
                        type="number" min={1} max={100} dir="ltr"
                        value={newRule.threshold}
                        onChange={e => setNewRule(r => ({ ...r, threshold: parseInt(e.target.value) || 90 }))}
                      />
                    </Field>
                  )}

                  <Field label={T('notif_rule_cooldown')} htmlFor="rule-cooldown">
                    <Input
                      id="rule-cooldown"
                      type="number" min={1} dir="ltr"
                      value={newRule.cooldownMin}
                      onChange={e => setNewRule(r => ({ ...r, cooldownMin: parseInt(e.target.value) || 30 }))}
                    />
                  </Field>

                  <Field label={T('notif_rule_channel')} htmlFor="rule-channel">
                    <Select
                      id="rule-channel"
                      value={newRule.channel}
                      onChange={e => setNewRule(r => ({ ...r, channel: e.target.value }))}
                    >
                      <option value="in_app">{T('notif_channel_inapp')}</option>
                      <option value="webhook">Webhook (Slack/Discord)</option>
                    </Select>
                  </Field>

                  {newRule.channel === 'webhook' && (
                    <Field label="Webhook URL" htmlFor="rule-webhook" className="sm:col-span-2">
                      <Input
                        id="rule-webhook"
                        type="url" dir="ltr" className="font-mono"
                        placeholder="https://hooks.slack.com/..."
                        value={newRule.webhookUrl}
                        onChange={e => setNewRule(r => ({ ...r, webhookUrl: e.target.value }))}
                      />
                    </Field>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button onClick={() => setShowAddRule(false)}>{T('cancel')}</Button>
                  <Button variant="primary" onClick={() => { void addRule() }}>{T('notif_save_rule')}</Button>
                </div>
              </CardBody>
            </Card>
          )}

          {rulesLoading && rules.length === 0 ? (
            <Card><CardBody><SkeletonRows rows={4} /></CardBody></Card>
          ) : rules.length === 0 ? (
            ruleErrorKey ? null : (
              <Card>
                <EmptyState
                  icon={<AlertTriangle size={26} />}
                  title={T('notif_no_rules')}
                  description={T('notif_no_rules_hint')}
                />
              </Card>
            )
          ) : rules.map(rule => (
            <AlertRuleCard key={rule.id} rule={rule} onDelete={deleteRule} onToggle={toggleRule} T={T} lang={lang} />
          ))}
        </div>
      )}
    </div>
  )
}
