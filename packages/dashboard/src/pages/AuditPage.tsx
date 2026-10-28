import { Fragment, useState, useEffect, useCallback } from 'react'
import { Shield, Download, Filter, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
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
  alert_deleted:     { label: 'حذف قاعدة',      tone: 'danger' }
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
  alert_deleted:     { label: 'Alert Deleted',    tone: 'danger' }
}

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
  const [filterAction, setFilterAction] = useState('')
  const [expandedRow, setExpandedRow]   = useState<number | null>(null)

  const perPage = 50

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (filterAction) params.set('action', filterAction)
      if (search) params.set('userId', search)
      const res = await api.get(`/api/audit?${params}`)
      setEntries(res.data.entries ?? [])
      setTotal(res.data.total ?? 0)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || (isRtl ? 'فشل تحميل سجل التدقيق.' : 'Failed to load the audit log.'))
      setEntries([])
    } finally { setLoading(false) }
  }, [page, filterAction, search, isRtl])

  useEffect(() => { void load() }, [load])

  async function exportCsv() {
    const params = new URLSearchParams()
    if (filterAction) params.set('action', filterAction)
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
    } catch { /* التنزيل يفشل بصمت كما كان */ }
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
          <Button variant="secondary" icon={<Download size={13} />} onClick={() => void exportCsv()}>
            {T('audit_export_csv')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
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
        <div className="relative">
          <Filter size={13} className="pointer-events-none absolute top-1/2 start-2.5 -translate-y-1/2 text-muted" aria-hidden />
          <select
            className="h-9 min-w-[150px] appearance-none rounded-lg border border-line bg-surface ps-8 pe-3 text-[13px] text-ink outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            value={filterAction}
            aria-label={T('audit_all_actions')}
            onChange={e => { setFilterAction(e.target.value); setPage(1) }}
          >
            <option value="">{T('audit_all_actions')}</option>
            {actions.map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
            ))}
          </select>
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
                        <Button onClick={() => { setSearch(''); setFilterAction(''); setPage(1) }}>
                          {isRtl ? 'مسح عوامل التصفية' : 'Clear filters'}
                        </Button>
                      ) : undefined}
                    />
                  </td>
                </tr>
              )}

              {entries.map(entry => {
                const action = ACTION_LABELS[entry.action] ?? { label: entry.action, tone: 'neutral' as Tone }
                let details: Record<string, unknown> = {}
                try { details = JSON.parse(entry.details || '{}') } catch {}
                const isExpanded = expandedRow === entry.id
                const detailText = Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(' · ')

                return (
                  <Fragment key={entry.id}>
                    <tr
                      key={entry.id}
                      className={clsx('cursor-pointer border-b border-line/50 transition-colors hover:bg-surface2/60', isExpanded && 'bg-surface2/60')}
                      onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
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
