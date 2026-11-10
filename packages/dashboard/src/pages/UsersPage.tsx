import { useState, useEffect } from 'react'
import { Users, Plus, Trash2, X, Shield, Eye, Settings2, Check, ChevronDown, KeyRound } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from '../store/toastStore'
import type { User, UserRole } from '@airemote/shared'
import { clsx } from 'clsx'
import { useT } from '../lib/i18n'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { Alert, Button, Card, EmptyState, Input, Modal, Select, SkeletonRows } from '../components/ui'

function RoleDropdown({ user, onUpdate, locked }: { user: User; onUpdate: (updated: User) => void; locked?: boolean }) {
  const t = useT()
  const { lang } = useUIStore()
  const isRtl = lang === 'ar'
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const ROLES = [
    { value: 'admin' as UserRole,   label: t('role_admin'),   color: 'text-danger bg-danger/10 border-danger/25',         icon: Shield    },
    { value: 'manager' as UserRole, label: t('role_manager'), color: 'text-primary bg-primary/10 border-primary/25', icon: Settings2 },
    { value: 'viewer' as UserRole,  label: t('role_viewer'),  color: 'text-muted bg-surface2 border-line',    icon: Eye       },
  ]

  const current = ROLES.find(r => r.value === user.role) ?? ROLES[2]
  const Icon = current.icon

  async function changeRole(role: UserRole) {
    if (locked) return
    if (role === user.role) { setOpen(false); return }
    setSaving(true)
    try {
      const res = await api.patch(`/api/users/${user.id}`, { role })
      onUpdate(res.data)
      toast.success(t('toast_role_changed'), `${user.name} → ${ROLES.find(r => r.value === role)?.label}`)
    } catch (e: unknown) {
      // 3.16.7 — the server refuses self-demotion and removing the last admin; show why.
      const why = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(t('toast_fail_save'), why)
    } finally {
      setSaving(false)
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving || locked}
        title={locked ? (isRtl ? 'لا يمكنك تغيير دورك' : 'You cannot change your own role') : undefined}
        className={clsx(
          'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all disabled:opacity-60',
          current.color
        )}
      >
        {saving
          ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          : <Icon size={10} />
        }
        {current.label}
        <ChevronDown size={9} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1.5 end-0 w-48 rounded-xl border border-line bg-surface border border-line shadow-2xl z-20 overflow-hidden">
            {ROLES.map(r => {
              const RIcon = r.icon
              return (
                <button
                  key={r.value}
                  onClick={() => changeRole(r.value)}
                  className={clsx(
                    'w-full text-start flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface2 transition-colors',
                    r.value === user.role && 'bg-surface2'
                  )}
                >
                  <div className={clsx('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 border', r.color)}>
                    <RIcon size={11} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-ink">{r.label}</span>
                    {r.value === user.role && <Check size={10} className="text-success" />}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function PasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const t = useT()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 12) { toast.error(t('password_min')); return }
    if (password !== confirm) { toast.error(t('passwords_mismatch')); return }
    setSaving(true)
    try {
      await api.patch(`/api/users/${user.id}`, { password })
      toast.success(t('toast_password_changed'), user.name)
      onClose()
    } catch {
      toast.error(t('toast_fail_save'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('change_password')}
      description={user.name}
      size="sm"
      footer={<>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="primary" type="submit" form="pw-form" loading={saving} disabled={!password || password !== confirm}>
          {t('save')}
        </Button>
      </>}
    >
        <form id="pw-form" onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-muted block mb-1">{t('new_password')}</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={t('password_min')} required
              className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">{t('password_confirm')}</label>
            <input
              type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder={t('password_confirm')} required
              className={clsx(
                'w-full bg-canvas border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none transition-colors',
                confirm && password !== confirm ? 'border-danger/60 focus:border-danger' : 'border-line focus:border-primary'
              )}
            />
            {confirm && password !== confirm && (
              <p className="text-xs text-danger mt-1">{t('passwords_mismatch')}</p>
            )}
          </div>
        </form>
    </Modal>
  )
}

export function UsersPage({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useT()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' as UserRole })
  const [adding, setAdding] = useState(false)
  const [pwModal, setPwModal] = useState<User | null>(null)
  const { user: me } = useAuthStore()
  const { lang } = useUIStore()
  const isRtl = lang === 'ar'
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all')

  function load () {
    setLoading(true)
    setLoadError(false)
    api.get('/api/users')
      .then(r => setUsers(r.data))
      .catch(() => { setLoadError(true); toast.error(t('toast_fail_load')) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (form.password.length < 12) { toast.error(t('password_min')); return }
    setAdding(true)
    try {
      await api.post('/api/users', form)
      setShowAdd(false)
      setForm({ name: '', email: '', password: '', role: 'viewer' })
      // 3.16.8 — POST returns no createdAt, so appending the response invented one.
      load()
      toast.success(t('toast_user_added'), form.name)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(t('toast_fail_save'), err.response?.data?.error)
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`${t('user_delete_confirm')} "${name}"?`)) return
    try {
      await api.delete(`/api/users/${id}`)
      // 3.16.8 — reload so the table always shows what the server actually holds.
      load()
      toast.success(t('toast_user_deleted'), name)
    } catch {
      toast.error(t('toast_fail_save'))
    }
  }

  const adminCount = users.filter(u => u.role === 'admin').length
  const managerCount = users.filter(u => u.role === 'manager').length
  const viewerCount = users.filter(u => u.role === 'viewer').length
  const needle = q.trim().toLowerCase()
  const visible = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    if (!needle) return true
    return (u.name + ' ' + u.email).toLowerCase().includes(needle)
  })

  return (
    <div className={embedded ? '' : 'cr-page'}>
      {pwModal && <PasswordModal user={pwModal} onClose={() => setPwModal(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-primary-fg">{t('users_title')}</h2>
          <p className="text-muted text-sm mt-1">{t('users_subtitle')}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-primary hover:brightness-110 text-primary-fg text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} /> {t('add_user')}
        </button>
      </div>

      {/* 3.16.8 — with more than a handful of accounts the table had no way to narrow down. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          type="search" value={q} onChange={e => setQ(e.target.value)}
          placeholder={isRtl ? 'ابحث بالاسم أو البريد' : 'Search by name or email'}
          aria-label={isRtl ? 'بحث في المستخدمين' : 'Search users'}
          className="h-9 min-w-[200px] flex-1"
        />
        <div className="flex gap-1 rounded-lg border border-line bg-canvas p-0.5" role="group">
          {([['all', isRtl ? 'الكل' : 'All'], ['admin', t('role_admin')], ['manager', t('role_manager')], ['viewer', t('role_viewer')]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setRoleFilter(k)} aria-pressed={roleFilter === k}
              className={'h-8 rounded-md px-3 text-[11.5px] transition-colors ' + (roleFilter === k ? 'bg-primary text-primary-fg font-medium' : 'text-muted hover:text-ink')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {users.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: t('role_admin'),   count: adminCount,   color: 'text-danger',    bg: 'bg-danger/10',    icon: Shield    },
            { label: t('role_manager'), count: managerCount, color: 'text-primary', bg: 'bg-primary/10', icon: Settings2 },
            { label: t('role_viewer'),  count: viewerCount,  color: 'text-muted',  bg: 'bg-surface2',  icon: Eye       },
          ].map(s => {
            const SIcon = s.icon
            return (
              <div key={s.label} className={clsx('rounded-xl border border-line bg-surface p-3 flex items-center gap-3', s.bg)}>
                <SIcon size={18} className={s.color} />
                <div>
                  <div className={clsx('text-xl font-bold', s.color)}>{s.count}</div>
                  <div className="text-xs text-muted">{s.label}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <Card className="mb-4">
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-medium text-ink">{t('add_user')}</h3>
              <Button variant="ghost" size="sm" aria-label={t('ui_close')} icon={<X size={15} />} onClick={() => setShowAdd(false)} />
            </div>
            <form onSubmit={handleAdd} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input required placeholder={t('user_name')} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              <Input required type="email" dir="ltr" placeholder={t('user_email')} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              <Input required type="password" placeholder={t('password') + ' (12+)'} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
              <Select className="h-9" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as UserRole }))}>
                <option value="viewer">{t('role_viewer')}</option>
                <option value="manager">{t('role_manager')}</option>
                <option value="admin">{t('role_admin')}</option>
              </Select>
              <div className="col-span-full flex gap-2">
                <Button type="submit" variant="primary" size="md" loading={adding}>{adding ? t('creating') : t('add')}</Button>
                <Button type="button" variant="secondary" size="md" onClick={() => setShowAdd(false)}>{t('cancel')}</Button>
              </div>
            </form>
            {/* PWD-HINT — 2026-11-10: شرط كلمة المرور ظاهر دائمًا بدل Toast عابر */}
            <p className="mt-2 text-[11px] text-muted">كلمة المرور: 12 حرفًا على الأقل — وإلا لن يُنشأ الحساب.</p>
          </div>
        </Card>
      )}

      {loadError && (
        <Alert tone="danger" className="mb-3">
          <div className="flex items-center gap-2">
            <span>{t('users_load_failed')}</span>
            <button type="button" onClick={load} className="underline underline-offset-2">{t('ui_retry')}</button>
          </div>
        </Alert>
      )}

      {loading ? (
        <Card><div className="p-3"><SkeletonRows rows={5} /></div></Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-start text-xs text-muted font-medium px-4 py-3">{t('user_name')}</th>
                <th className="text-start text-xs text-muted font-medium px-4 py-3">{t('user_role')}</th>
                <th className="text-start text-xs text-muted font-medium px-4 py-3">2FA</th>
                <th className="text-start text-xs text-muted font-medium px-4 py-3">{t('user_created')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && !loadError && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState icon={<Users size={26} />} title={users.length ? (isRtl ? 'لا نتائج مطابقة' : 'No matching users') : t('no_users_yet')} />
                  </td>
                </tr>
              )}
              {visible.map(u => (
                <tr key={u.id} className="border-b border-line/60 hover:bg-surface2 group transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-fg flex-shrink-0">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-ink">{u.name}</div>
                        <div className="text-xs text-muted" dir="ltr">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <RoleDropdown user={u} locked={u.id === me?.id} onUpdate={() => load()} />
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      // 3.16.8 — the server sends totp_enabled; nothing displayed it.
                      const totp = (u as unknown as { totpEnabled?: boolean; totp_enabled?: number }).totpEnabled
                        || (u as unknown as { totp_enabled?: number }).totp_enabled
                      return totp
                        ? <span className="rounded-full border border-success/20 bg-success/10 px-1.5 py-0.5 text-[10px] text-success">2FA</span>
                        : <span className="text-[11px] text-muted">—</span>
                    })()}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {new Date(u.createdAt || (u as unknown as { created_at?: string }).created_at || Date.now()).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <button
                        onClick={() => setPwModal(u)}
                        className="p-1.5 text-muted/70 hover:text-primary transition-colors rounded"
                        title={t('change_password')}
                      >
                        <KeyRound size={13} />
                      </button>
                      {u.id !== me?.id && (
                        <button
                          onClick={() => handleDelete(u.id, u.name)}
                          className="p-1.5 text-muted/70 hover:text-danger transition-colors rounded"
                          title={t('delete')}
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
