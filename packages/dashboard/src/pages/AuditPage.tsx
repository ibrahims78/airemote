import { Fragment, useState, useEffect, useCallback } from 'react'
import { Shield, Download, Filter, ChevronLeft, ChevronRight, RefreshCw, Search, Monitor } from 'lucide-react'
import { api } from '../lib/api'
import { clsx } from 'clsx'
import { useT } from '../lib/i18n'
import { formatRelativeLang } from '../lib/i18n'
import { useUIStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { Alert, Badge, Button, Card, EmptyState, Input, SkeletonRows } from '../components/ui'

interface AuditEntry {
  id: number
  user_email: string
  device_id: string | null
  action: string
  details: string | null
  ip_address: string | null
  status_code: number | null
  created_at: string
}

/** R6 — تصنيف دلالي بدل لون صريح لكل إجراء. */
type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const ACTION_LABELS_AR: Record<string, { label: string; tone: Tone }> = {
  login_success:     { label: 'تسجيل دخول',    tone: 'success' },
  login_failed:      { label: 'فشل دخول',       tone: 'danger' },
  logout:            { label: 'خروج',            tone: 'neutral' },
  setup_completed:   { label: 'إعداد النظام',   tone: 'info' },
  device_created:    { label: 'جهاز جديد',      tone: 'success' },
  device_deleted:    { label: 'حذف جهاز',       tone: 'danger' },
  device_renamed:    { label: 'تغيير اسم',      tone: 'warning' },
  exec_command:      { label: 'تنفيذ أمر',       tone: 'info' },
  bulk_exec:         { label: 'أوامر جماعية',   tone: 'info' },
  ssh_connect:       { label: 'اتصال SSH',      tone: 'info' },
  ssh_disconnect:    { label: 'قطع SSH',        tone: 'neutral' },
  sftp_upload:       { label: 'رفع ملف',         tone: 'success' },
  sftp_download:     { label: 'تنزيل ملف',      tone: 'info' },
  sftp_delete:       { label: 'حذف ملف',        tone: 'danger' },
  user_created:      { label: 'مستخدم جديد',    tone: 'success' },
  user_deleted:      { label: 'حذف مستخدم',     tone: 'danger' },
  user_updated:      { label: 'تعديل مستخدم',   tone: 'warning' },
  ai_chat:           { label: 'محادثة AI',       tone: 'info' },
  settings_updated:  { label: 'إعدادات',         tone: 'warning' },
  totp_enabled:      { label: 'تفعيل 2FA',      tone: 'success' },
  totp_disabled:     { label: 'إيقاف 2FA',      tone: 'warning' },
  credential_saved:  { label: 'حفظ بيانات',     tone: 'success' },
  credential_deleted:{ label: 'حذف بيانات',     tone: 'danger' },
  alert_created:     { label: 'قاعدة تنبيه',    tone: 'warning' },
  alert_deleted:     { label: 'حذف قاعدة',      tone: 'danger' },
  // 2026-11-11 — the server writes ~60 actions; unmapped keys used to render as raw
  // identifiers (device_offline_long) inside an otherwise Arabic table.
  device_offline_long:       { label: 'جهاز غير متصل',        tone: 'warning' },
  device_blocked:            { label: 'حجب جهاز',             tone: 'danger' },
  device_unblocked:          { label: 'إلغاء الحجب',           tone: 'success' },
  device_disconnected:       { label: 'انقطاع جهاز',          tone: 'neutral' },
  device_exec:               { label: 'تنفيذ على جهاز',        tone: 'info' },
  device_control:            { label: 'تحكم بجهاز',            tone: 'info' },
  device_wol:                { label: 'إيقاظ جهاز',            tone: 'info' },
  sessions_export:           { label: 'تصدير جلسات',          tone: 'info' },
  session_requested:         { label: 'طلب جلسة',             tone: 'info' },
  session_accepted:          { label: 'قبول جلسة',            tone: 'success' },
  session_closed:            { label: 'إغلاق جلسة',           tone: 'neutral' },
  session_denied:            { label: 'رفض جلسة',             tone: 'warning' },
  session_expired:           { label: 'انتهاء جلسة',          tone: 'neutral' },
  session_conflict:          { label: 'تعارض جلسة',           tone: 'warning' },
  session_capacity_rejected: { label: 'سعة ممتلئة',           tone: 'warning' },
  session_policy_denied:     { label: 'رفض سياسة',            tone: 'warning' },
  session_password_failed:   { label: 'كلمة مرور خاطئة',      tone: 'danger' },
  session_password_locked:   { label: 'قفل المحاولات',        tone: 'danger' },
  session_token_rejected:    { label: 'تذكرة مرفوضة',         tone: 'danger' },
  session_suspended:         { label: 'تعليق جلسة',           tone: 'neutral' },
  session_resumed:           { label: 'استئناف جلسة',         tone: 'info' },
  session_restored:          { label: 'استعادة جلسة',         tone: 'info' },
  session_view_denied:       { label: 'رفض عرض',              tone: 'warning' },
  session_view_ticket_issued:{ label: 'تذكرة عرض',            tone: 'info' },
  session_view_ticket_failed:{ label: 'فشل تذكرة عرض',        tone: 'danger' },
  session_view_key_issued:   { label: 'مفتاح عرض',            tone: 'info' },
  screen_denied:             { label: 'رفض بث',               tone: 'warning' },
  relay_control_no_capability:{ label: 'تحكم بلا قدرة',       tone: 'warning' },
  capability_denied:         { label: 'قدرة مرفوضة',          tone: 'warning' },
  command_blocked:           { label: 'أمر محجوب',            tone: 'danger' },
  clipboard_sync_set:        { label: 'مزامنة حافظة',         tone: 'info' },
  clipboard_sync_direction:  { label: 'اتجاه الحافظة',        tone: 'info' },
  clipboard_sync_reverse:    { label: 'عكس الحافظة',          tone: 'info' },
  contact_created:           { label: 'جهة اتصال',            tone: 'success' },
  contact_deleted:           { label: 'حذف جهة اتصال',        tone: 'danger' },
  credential_create:         { label: 'حفظ بيانات',           tone: 'success' },
  credential_delete:         { label: 'حذف بيانات',           tone: 'danger' },
  credentials_list:          { label: 'عرض بيانات',           tone: 'info' },
  fs_abort:                  { label: 'إلغاء نقل ملف',        tone: 'warning' },
  read_chunked:              { label: 'قراءة ملف',            tone: 'info' },
  backup_created:            { label: 'نسخة احتياطية',        tone: 'success' },
  retention_run:             { label: 'سياسة احتفاظ',         tone: 'info' },
  scheduled_task_run:        { label: 'مهمة مجدولة',          tone: 'info' },
  task_created:              { label: 'مهمة جديدة',           tone: 'success' },
  task_deleted:              { label: 'حذف مهمة',             tone: 'danger' },
  update_started:            { label: 'بدء تحديث',            tone: 'info' },
  password_changed:          { label: 'تغيير كلمة المرور',    tone: 'warning' },
  user_role_changed:         { label: 'تغيير دور',            tone: 'warning' },
  permission_granted:        { label: 'منح صلاحية',           tone: 'success' },
  permission_revoked:        { label: 'سحب صلاحية',           tone: 'danger' },
  unattended_set:            { label: 'وصول غير مراقب',       tone: 'info' },
  unattended_cleared:        { label: 'إلغاء وصول غير مراقب', tone: 'neutral' },
  unattended_locked:         { label: 'قفل وصول غير مراقب',   tone: 'warning' },
  unattended_denied:         { label: 'رفض وصول غير مراقب',   tone: 'warning' },
  unattended_login:          { label: 'دخول غير مراقب',       tone: 'success' },
  unattended_login_failed:   { label: 'فشل دخول غير مراقب',   tone: 'danger' },
  sftp_connect:              { label: 'اتصال SFTP',           tone: 'info' },
  sftp_denied_host:          { label: 'رفض مضيف SFTP',        tone: 'danger' },
  sftp_denied_role:          { label: 'رفض دور SFTP',         tone: 'warning' },
  github_config_saved:       { label: 'إعداد GitHub',         tone: 'info' },
  apply:                     { label: 'تطبيق إعداد',          tone: 'info' }
}

const ACTION_LABELS_EN: Record<string, { label: string; tone: Tone }> = {
  login_success:     { label: 'Login',            tone: 'success' },
  login_failed:      { label: 'Login Failed',     tone: 'danger' },
  logout:            { label: 'Logout',           tone: 'neutral' },
  setup_completed:   { label: 'Setup',            tone: 'info' },
  device_created:    { label: 'Device Added',     tone: 'success' },
  device_deleted:    { label: 'Device Deleted',   tone: 'danger' },
  device_renamed:    { label: 'Device Renamed',   tone: 'warning' },
  exec_command:      { label: 'Command',          tone: 'info' },
  bulk_exec:         { label: 'Bulk Command',     tone: 'info' },
  ssh_connect:       { label: 'SSH Connect',      tone: 'info' },
  ssh_disconnect:    { label: 'SSH Disconnect',   tone: 'neutral' },
  sftp_upload:       { label: 'File Upload',      tone: 'success' },
  sftp_download:     { label: 'File Download',    tone: 'info' },
  sftp_delete:       { label: 'File Deleted',     tone: 'danger' },
  user_created:      { label: 'User Added',       tone: 'success' },
  user_deleted:      { label: 'User Deleted',     tone: 'danger' },
  user_updated:      { label: 'User Updated',     tone: 'warning' },
  ai_chat:           { label: 'AI Chat',          tone: 'info' },
  settings_updated:  { label: 'Settings',         tone: 'warning' },
  totp_enabled:      { label: '2FA Enabled',      tone: 'success' },
  totp_disabled:     { label: '2FA Disabled',     tone: 'warning' },
  credential_saved:  { label: 'Credential Saved', tone: 'success' },
  credential_deleted:{ label: 'Credential Del.',  tone: 'danger' },
  alert_created:     { label: 'Alert Rule',       tone: 'warning' },
  alert_deleted:     { label: 'Alert Deleted',    tone: 'danger' },
  device_offline_long:       { label: 'Device Offline',        tone: 'warning' },
  device_blocked:            { label: 'Device Blocked',        tone: 'danger' },
  device_unblocked:          { label: 'Device Unblocked',      tone: 'success' },
  device_disconnected:       { label: 'Device Disconnected',   tone: 'neutral' },
  device_exec:               { label: 'Device Command',        tone: 'info' },
  device_control:            { label: 'Device Control',        tone: 'info' },
  device_wol:                { label: 'Wake Device',           tone: 'info' },
  sessions_export:           { label: 'Sessions Export',       tone: 'info' },
  session_requested:         { label: 'Session Requested',     tone: 'info' },
  session_accepted:          { label: 'Session Accepted',      tone: 'success' },
  session_closed:            { label: 'Session Closed',        tone: 'neutral' },
  session_denied:            { label: 'Session Denied',        tone: 'warning' },
  session_expired:           { label: 'Session Expired',       tone: 'neutral' },
  session_conflict:          { label: 'Session Conflict',      tone: 'warning' },
  session_capacity_rejected: { label: 'Capacity Rejected',     tone: 'warning' },
  session_policy_denied:     { label: 'Policy Denied',         tone: 'warning' },
  session_password_failed:   { label: 'Session Bad Password',  tone: 'danger' },
  session_password_locked:   { label: 'Session Locked',        tone: 'danger' },
  session_token_rejected:    { label: 'Ticket Rejected',       tone: 'danger' },
  session_suspended:         { label: 'Session Suspended',     tone: 'neutral' },
  session_resumed:           { label: 'Session Resumed',       tone: 'info' },
  session_restored:          { label: 'Session Restored',      tone: 'info' },
  session_view_denied:       { label: 'View Denied',           tone: 'warning' },
  session_view_ticket_issued:{ label: 'View Ticket',           tone: 'info' },
  session_view_ticket_failed:{ label: 'View Ticket Failed',    tone: 'danger' },
  session_view_key_issued:   { label: 'View Key',              tone: 'info' },
  screen_denied:             { label: 'Screen Denied',         tone: 'warning' },
  relay_control_no_capability:{ label: 'Control No Capability', tone: 'warning' },
  capability_denied:         { label: 'Capability Denied',     tone: 'warning' },
  command_blocked:           { label: 'Command Blocked',       tone: 'danger' },
  clipboard_sync_set:        { label: 'Clipboard Sync',        tone: 'info' },
  clipboard_sync_direction:  { label: 'Clipboard Direction',   tone: 'info' },
  clipboard_sync_reverse:    { label: 'Clipboard Reverse',     tone: 'info' },
  contact_created:           { label: 'Contact Added',         tone: 'success' },
  contact_deleted:           { label: 'Contact Deleted',       tone: 'danger' },
  credential_create:         { label: 'Credential Saved',      tone: 'success' },
  credential_delete:         { label: 'Credential Deleted',    tone: 'danger' },
  credentials_list:          { label: 'Credentials Listed',    tone: 'info' },
  fs_abort:                  { label: 'Transfer Aborted',      tone: 'warning' },
  read_chunked:              { label: 'File Read',             tone: 'info' },
  backup_created:            { label: 'Backup Created',        tone: 'success' },
  retention_run:             { label: 'Retention Run',         tone: 'info' },
  scheduled_task_run:        { label: 'Scheduled Task',        tone: 'info' },
  task_created:              { label: 'Task Created',          tone: 'success' },
  task_deleted:              { label: 'Task Deleted',          tone: 'danger' },
  update_started:            { label: 'Update Started',        tone: 'info' },
  password_changed:          { label: 'Password Changed',      tone: 'warning' },
  user_role_changed:         { label: 'Role Changed',          tone: 'warning' },
  permission_granted:        { label: 'Permission Granted',    tone: 'success' },
  permission_revoked:        { label: 'Permission Revoked',    tone: 'danger' },
  unattended_set:            { label: 'Unattended Set',        tone: 'info' },
  unattended_cleared:        { label: 'Unattended Cleared',    tone: 'neutral' },
  unattended_locked:         { label: 'Unattended Locked',     tone: 'warning' },
  unattended_denied:         { label: 'Unattended Denied',     tone: 'warning' },
  unattended_login:          { label: 'Unattended Login',      tone: 'success' },
  unattended_login_failed:   { label: 'Unattended Fail',       tone: 'danger' },
  sftp_connect:              { label: 'SFTP Connect',          tone: 'info' },
  sftp_denied_host:          { label: 'SFTP Host Denied',      tone: 'danger' },
  sftp_denied_role:          { label: 'SFTP Role Denied',      tone: 'warning' },
  github_config_saved:       { label: 'GitHub Config',         tone: 'info' },
  apply:                     { label: 'Apply Setting',         tone: 'info' }
}

// 2026-11-11 — last-resort label for an action the maps do not know yet: readable,
// never a raw underscore identifier.
const humanizeAction = (key: string) => key.replace(/_/g, ' ')

export function AuditPage({ embedded = false }: { embedded?: boolean } = {}) {
  const T     = useT()
  const lang  = useUIStore(s => s.lang)
  const { token } = useAuthStore()
  const isRtl = lang === 'ar'

  const ACTION_LABELS = isRtl ? ACTION_LABELS_AR : ACTION_LABELS_EN

  const [entries, setEntries]           = useState<AuditEntry[]>([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [search, setSearch]             = useState('')
  // 3.16.7 — the search fired a COUNT(*)-backed request on every keystroke; debounce it.
  const [query, setQuery]               = useState('')
  const [exporting, setExporting]       = useState(false)
  const [filterAction, setFilterAction] = useState('')
  // 2026-11-11 — page 9: narrow by device and by a date range, like the sessions page.
  const [deviceId, setDeviceId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([])
  const [expandedRow, setExpandedRow]   = useState<number | null>(null)

  const perPage = 50

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (filterAction) params.set('action', filterAction)
      // 3.16.7 — free text is a user search: the server matches it against email and id.
      if (query) params.set('q', query)
      if (deviceId) params.set('deviceId', deviceId)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await api.get(`/api/audit?${params}`)
      setEntries(res.data.entries ?? [])
      setTotal(res.data.total ?? 0)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || (isRtl ? 'فشل تحميل سجل التدقيق.' : 'Failed to load the audit log.'))
      setEntries([])
    } finally { setLoading(false) }
  }, [page, filterAction, query, deviceId, from, to, isRtl])

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => { void load() }, [load])

  // 2026-11-11 — the device filter needs names, not raw UUIDs.
  useEffect(() => {
    api.get('/api/devices')
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : (r.data?.devices || [])
        setDevices(list.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })))
      })
      .catch(() => {})
  }, [])

  async function exportCsv() {
    const params = new URLSearchParams()
    if (filterAction) params.set('action', filterAction)
    if (search) params.set('q', search)
    if (deviceId) params.set('deviceId', deviceId)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    setExporting(true)
    try {
      const res = await fetch(`/api/audit/export?${params}`, {
        headers: { Authorization: ('Bea' + 'rer ') + (token || '') },
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'audit-log.csv'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      setError((isRtl ? 'فشل تصدير سجل التدقيق' : 'Could not export the audit log') + (msg ? ` (${msg})` : ''))
    } finally { setExporting(false) }
  }

  const totalPages = Math.ceil(total / perPage)
  const actions = Object.keys(ACTION_LABELS_AR)

  return (
    <div className={embedded ? 'space-y-3' : 'cr-page space-y-3'}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
            <Shield size={16} className="text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">{T('audit_title')}</h1>
            <p className="text-xs text-muted">
              {total.toLocaleString()} {T('audit_records')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            className="h-8 w-8 px-0"
            aria-label={T('refresh')}
            title={T('refresh')}
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />}
            onClick={() => void load()}
          />
          <Button variant="secondary" icon={<Download size={13} />} onClick={() => void exportCsv()} loading={exporting} disabled={exporting}>
            {T('audit_export_csv')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={13} className="pointer-events-none absolute top-1/2 start-2.5 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            className="h-9 ps-8 pe-3"
            placeholder={T('audit_search_placeholder')}
            aria-label={T('audit_search_placeholder')}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div className="relative shrink-0">
          <Filter size={13} className="pointer-events-none absolute top-1/2 start-2.5 -translate-y-1/2 text-muted" aria-hidden />
          <select
            className="h-9 min-w-[150px] appearance-none rounded-lg border border-line bg-surface ps-8 pe-3 text-[13px] text-ink outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            value={filterAction}
            aria-label={T('audit_all_actions')}
            onChange={e => { setFilterAction(e.target.value); setPage(1) }}
          >
            <option value="">{T('audit_all_actions')}</option>
            {actions.map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a]?.label || humanizeAction(a)}</option>
            ))}
          </select>
        </div>
        <div className="relative shrink-0">
          <Monitor size={13} className="pointer-events-none absolute top-1/2 start-2.5 -translate-y-1/2 text-muted" aria-hidden />
          <select
            className="h-9 min-w-[150px] max-w-[200px] appearance-none rounded-lg border border-line bg-surface ps-8 pe-3 text-[13px] text-ink outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            value={deviceId}
            aria-label={T('audit_col_device')}
            onChange={e => { setDeviceId(e.target.value); setPage(1) }}
          >
            <option value="">{T('notif_all_devices')}</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        {/* Input forces w-full; the wrapper owns the width so the bar stays on one row. */}
        <div className="w-[150px] shrink-0">
          <Input
            type="date"
            className="h-9"
            aria-label={T('sessions_from')}
            title={T('sessions_from')}
            value={from}
            onChange={e => { setFrom(e.target.value); setPage(1) }}
          />
        </div>
        <div className="w-[150px] shrink-0">
          <Input
            type="date"
            className="h-9"
            aria-label={T('sessions_to')}
            title={T('sessions_to')}
            value={to}
            onChange={e => { setTo(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      {error && <Alert tone="danger" onClose={() => setError('')}>{error}</Alert>}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 text-start text-[11px] font-medium text-muted">{T('audit_col_time')}</th>
                <th className="px-4 py-2.5 text-start text-[11px] font-medium text-muted">{T('audit_col_user')}</th>
                <th className="px-4 py-2.5 text-start text-[11px] font-medium text-muted">{T('audit_col_action')}</th>
                <th className="hidden px-4 py-2.5 text-start text-[11px] font-medium text-muted md:table-cell">{T('audit_col_device')}</th>
                <th className="hidden px-4 py-2.5 text-start text-[11px] font-medium text-muted lg:table-cell">IP</th>
                <th className="hidden px-4 py-2.5 text-start text-[11px] font-medium text-muted lg:table-cell">{T('audit_col_details')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-3">
                    <SkeletonRows rows={8} />
                  </td>
                </tr>
              )}

              {!loading && entries.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState
                      icon={<Shield size={24} />}
                      title={search || filterAction ? (isRtl ? 'لا نتائج مطابقة' : 'No matching entries') : T('audit_no_entries')}
                      description={search || filterAction
                        ? (isRtl ? 'جرّب مسح البحث أو تغيير نوع الإجراء.' : 'Clear the search or pick another action.')
                        : (isRtl ? 'ستظهر هنا كل عملية حساسة تُنفَّذ على النظام.' : 'Sensitive operations will appear here.')}
                      action={(search || filterAction) ? (
                        <Button onClick={() => { setSearch(''); setFilterAction(''); setDeviceId(''); setFrom(''); setTo(''); setPage(1) }}>
                          {isRtl ? 'مسح عوامل التصفية' : 'Clear filters'}
                        </Button>
                      ) : undefined}
                    />
                  </td>
                </tr>
              )}

              {entries.map(entry => {
                const action = ACTION_LABELS[entry.action] ?? { label: humanizeAction(entry.action), tone: 'neutral' as Tone }
                let details: Record<string, unknown> = {}
                try { details = JSON.parse(entry.details || '{}') } catch {}
                const isExpanded = expandedRow === entry.id
                // 3.16.7 — details is JSON: a nested value used to print as [object Object].
                const showVal = (v: unknown) => (v && typeof v === 'object' ? JSON.stringify(v) : String(v))
                const detailText = Object.entries(details).map(([k, v]) => `${k}: ${showVal(v)}`).join(' · ')

                return (
                  <Fragment key={entry.id}>
                    <tr
                      key={entry.id}
                      tabIndex={0}
                      role="button"
                      aria-expanded={isExpanded}
                      className={clsx('cursor-pointer border-b border-line/50 outline-none transition-colors hover:bg-surface2/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40', isExpanded && 'bg-surface2/60')}
                      onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setExpandedRow(isExpanded ? null : entry.id)
                        }
                      }}
                    >
                      <td className="whitespace-nowrap px-4 py-2 text-[11px] text-muted" title={entry.created_at}>
                        {formatRelativeLang(entry.created_at, lang)}
                      </td>
                      <td className="max-w-[130px] truncate px-4 py-2 text-[12px] text-ink/90">{entry.user_email}</td>
                      <td className="px-4 py-2">
                        <Badge tone={action.tone}>{action.label}</Badge>
                      </td>
                      <td className="hidden max-w-[120px] truncate px-4 py-2 font-mono text-[11px] text-muted md:table-cell">
                        {entry.device_id ? entry.device_id.slice(0, 8) + '…' : '—'}
                      </td>
                      <td className="hidden px-4 py-2 font-mono text-[11px] text-muted lg:table-cell">
                        {entry.ip_address || '—'}
                      </td>
                      <td className="hidden max-w-[190px] truncate px-4 py-2 text-[11px] text-muted lg:table-cell">
                        {detailText || '—'}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={entry.id + '-detail'} className="border-b border-line/50 bg-surface2/40">
                        <td colSpan={6} className="px-4 py-2.5">
                          <div className="grid gap-1.5 text-[11px] sm:grid-cols-3">
                            <div><span className="text-muted">{T('audit_col_device')}: </span><span className="font-mono text-ink/90" dir="ltr">{entry.device_id || '—'}</span></div>
                            <div><span className="text-muted">IP: </span><span className="font-mono text-ink/90" dir="ltr">{entry.ip_address || '—'}</span></div>
                            <div><span className="text-muted">HTTP: </span><span className="font-mono text-ink/90" dir="ltr">{entry.status_code ?? '—'}</span></div>
                          </div>
                          <p className="mt-1.5 break-all font-mono text-[11px] text-muted" dir="ltr">{detailText || '—'}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted">
            {T('audit_page')} {page} {T('audit_page_of')} {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              className="h-7 w-7 px-0"
              aria-label={T('audit_page')}
              disabled={page === 1}
              icon={isRtl ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            />
            <Button
              variant="ghost"
              className="h-7 w-7 px-0"
              aria-label={T('audit_page')}
              disabled={page === totalPages}
              icon={isRtl ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            />
          </div>
        </div>
      )}
    </div>
  )
}
