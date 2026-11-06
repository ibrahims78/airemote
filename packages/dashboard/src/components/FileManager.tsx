import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Folder, FileText, FileImage, FileVideo, FileAudio, FileArchive, FileCode,
  Package, Download, Upload, FolderPlus, Trash2, Pencil, RefreshCw, Home,
  ArrowUp, Search, ArrowUpDown, HardDrive, ChevronRight
} from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { TransferQueue } from './TransferQueue'
import { Alert, Button, Card, EmptyState, Field, Input, Modal, ProgressBar, Select, SkeletonRows } from './ui'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modified: string
  permissions: string
}

interface Props {
  deviceId: string
  deviceName: string
  /** 3.11 — تذكرة جلسة وكيل↔وكيل (وضع الملفات): تُمرَّر بدل JWT. */
  rt?: string
  /** 3.11.1 — مسار البداية: أندرويد يبدأ من /sdcard لأن `/` غير قابل للعرض. */
  initialPath?: string
}

type SortKey = 'name' | 'size' | 'modified'
type SortDir = 'asc' | 'desc'

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(value: string): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  // شكل محايد (لا يعتمد على لغة) حتى لا يعكسه اتجاه RTL — يُعرض داخل dir="ltr".
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** Icon + semantic tone only — no hard-coded palette values (R6). */
function EntryIcon({ entry }: { entry: FileEntry }) {
  if (entry.isDirectory) return <Folder size={16} className="shrink-0 text-warning" aria-hidden />
  const ext = extOf(entry.name)
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic'].includes(ext)) return <FileImage size={16} className="shrink-0 text-success" aria-hidden />
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp', 'ts'].includes(ext)) return <FileVideo size={16} className="shrink-0 text-info" aria-hidden />
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus'].includes(ext)) return <FileAudio size={16} className="shrink-0 text-primary" aria-hidden />
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return <FileArchive size={16} className="shrink-0 text-warning" aria-hidden />
  if (['apk', 'aab', 'ipa', 'exe', 'msi', 'deb', 'rpm'].includes(ext)) return <Package size={16} className="shrink-0 text-danger" aria-hidden />
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'kt', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'sh', 'ps1', 'json', 'xml', 'yml', 'yaml', 'html', 'css'].includes(ext)) return <FileCode size={16} className="shrink-0 text-info" aria-hidden />
  return <FileText size={16} className="shrink-0 text-muted" aria-hidden />
}

function authToken(): string {
  try {
    const raw = localStorage.getItem('airemote-auth')
    if (!raw) return ''
    const j = JSON.parse(raw)
    return j?.state?.token || ''
  } catch { return '' }
}

export function FileManager({ deviceId, rt, initialPath }: Props) {
  const t = useT()
  // كل نداءات الملفات تحمل التذكرة إن وُجدت (الوكيل بلا حساب لوحة).
  const rq = rt ? `?rt=${encodeURIComponent(rt)}` : ''
  const rqJoin = (sep: string) => (rt ? `${sep}rt=${encodeURIComponent(rt)}` : '')
  const [path, setPath] = useState(initialPath || '/')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{ name: string; percent: number; received: number; total: number } | null>(null)
  const [deletingFile, setDeletingFile] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FileEntry | null>(null)
  const [renamingFile, setRenamingFile] = useState<FileEntry | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showMkdir, setShowMkdir] = useState(false)
  const [mkdirName, setMkdirName] = useState('')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [dragOver, setDragOver] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)

  const pathParts = path.split('/').filter(Boolean)

  useEffect(() => {
    void loadDir('/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

  async function loadDir(p: string) {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/devices/${deviceId}/fs/list`, { params: rt ? { path: p, rt } : { path: p }, timeout: 20000 })
      setFiles(res.data as FileEntry[])
      setPath(p)
      setQuery('')
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string } }; code?: string; message?: string }
      const serverMsg = err.response?.data?.error || ''
      if (err.code === 'ECONNABORTED' || /timeout|time out/i.test(serverMsg)) {
        setError(t('fm_err_timeout'))
      } else if (/offline/i.test(serverMsg) || err.response?.status === 503) {
        setError(t('fm_err_offline'))
      } else if (/not permitted|denied|EACCES/i.test(serverMsg)) {
        setError(t('fm_err_denied'))
      } else {
        setError(serverMsg || err.message || t('fm_err_list'))
      }
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  async function goUp() {
    if (path === '/') return
    const parts = path.split('/').filter(Boolean)
    parts.pop()
    await loadDir(parts.length === 0 ? '/' : '/' + parts.join('/'))
  }

  async function download(entry: FileEntry) {
    setDownloadingFile(entry.path)
    setError('')
    setDownloadProgress({ name: entry.name, percent: 0, received: 0, total: entry.size || 0 })
    try {
      const token = authToken()
      const res = await fetch(`/api/devices/${deviceId}/fs/download?path=${encodeURIComponent(entry.path)}${rqJoin('&')}`, {
        headers: token ? { Authorization: ('Bea' + 'rer ') + token } : {}
      })
      if (!res.ok || !res.body) {
        let msg = ''
        try { msg = (await res.json())?.error || '' } catch {}
        throw new Error(msg || ('HTTP ' + res.status))
      }
      const total = entry.size || Number(res.headers.get('content-length')) || 0
      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      let received = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          received += value.length
          setDownloadProgress({ name: entry.name, percent: total ? Math.min(99, Math.round((received / total) * 100)) : 0, received, total })
        }
      }
      const blob = new Blob(chunks as BlobPart[])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = entry.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
      setDownloadProgress({ name: entry.name, percent: 100, received, total: total || received })
      setTimeout(() => setDownloadProgress(null), 2500)
    } catch (e: unknown) {
      const err = e as { message?: string }
      setError(err.message || t('fm_err_download'))
      setDownloadProgress(null)
    } finally {
      setDownloadingFile(null)
    }
  }

  async function doDelete(entry: FileEntry) {
    setConfirmDelete(null)
    setDeletingFile(entry.path)
    try {
      await api.post(`/api/devices/${deviceId}/fs/delete${rq}`, { path: entry.path }, { timeout: 20000 })
      await loadDir(path)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || t('fm_err_delete'))
    } finally {
      setDeletingFile(null)
    }
  }

  async function doRename() {
    if (!renamingFile || !renameValue.trim()) return
    const parent = renamingFile.path.slice(0, renamingFile.path.lastIndexOf('/')) || ''
    const newPath = `${parent}/${renameValue.trim()}`
    try {
      await api.post(`/api/devices/${deviceId}/fs/rename${rq}`, { oldPath: renamingFile.path, newPath }, { timeout: 20000 })
      setRenamingFile(null)
      setRenameValue('')
      await loadDir(path)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || t('fm_err_rename'))
    }
  }

  async function uploadFile(file: File) {
    setUploading(true)
    setUploadName(file.name)
    setError('')
    const destPath = path === '/' ? `/${file.name}` : `${path}/${file.name}`
    try {
      await api.post(`/api/devices/${deviceId}/fs/upload?path=${encodeURIComponent(destPath)}${rqJoin('&')}`, file, {
        headers: { 'Content-Type': 'application/octet-stream' },
        timeout: 600000
      })
      await loadDir(path)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || t('fm_err_upload'))
    } finally {
      setUploading(false)
      setUploadName('')
      if (uploadRef.current) uploadRef.current.value = ''
    }
  }

  async function doMkdir() {
    if (!mkdirName.trim()) return
    const newDirPath = path === '/' ? `/${mkdirName.trim()}` : `${path}/${mkdirName.trim()}`
    try {
      await api.post(`/api/devices/${deviceId}/fs/mkdir${rq}`, { path: newDirPath }, { timeout: 20000 })
      setShowMkdir(false)
      setMkdirName('')
      await loadDir(path)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || t('fm_err_mkdir'))
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? files.filter(f => f.name.toLowerCase().includes(q)) : files
    const sorted = [...filtered].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortKey === 'size') cmp = (a.size || 0) - (b.size || 0)
      else cmp = String(a.modified || '').localeCompare(String(b.modified || ''))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [files, query, sortKey, sortDir])

  const totalSize = files.reduce((sum, f) => sum + (f.isDirectory ? 0 : f.size || 0), 0)
  const dirCount = files.filter(f => f.isDirectory).length

  return (
    <div
      className="relative flex h-full flex-col gap-2.5"
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) void uploadFile(f)
      }}
    >
      {/* Breadcrumb + navigation */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="ghost" className="h-7 w-7 px-0" title={t('fm_root')} aria-label={t('fm_root')} icon={<Home size={14} />} onClick={() => void loadDir('/')} />
        <Button variant="ghost" className="h-7 w-7 px-0" title={t('fm_up')} aria-label={t('fm_up_folder')} icon={<ArrowUp size={14} />} disabled={path === '/'} onClick={() => void goUp()} />
        <Button variant="ghost" className="h-7 w-7 px-0" title={t('fm_refresh')} aria-label={t('fm_refresh')} icon={<RefreshCw size={14} className={clsx(loading && 'animate-spin')} />} onClick={() => void loadDir(path)} />

        <div className="flex min-w-0 flex-wrap items-center gap-0.5 rounded-lg border border-line bg-surface px-2 py-1">
          <button onClick={() => void loadDir('/')} className="rounded px-0.5 text-[12px] text-muted transition-colors hover:text-ink">{t('fm_root')}</button>
          {pathParts.map((part, i) => (
            <span key={i} className="flex min-w-0 items-center gap-0.5">
              <ChevronRight size={11} className="shrink-0 text-muted/60" aria-hidden />
              <button
                onClick={() => void loadDir('/' + pathParts.slice(0, i + 1).join('/'))}
                className="max-w-[140px] truncate rounded px-0.5 text-[12px] text-ink/90 transition-colors hover:text-primary"
                title={part}
              >{part}</button>
            </span>
          ))}
        </div>

        <div className="ms-auto hidden items-center gap-1 text-[11px] text-muted sm:flex">
          <span>{t('fm_count', { dirs: dirCount, files: files.length - dirCount })} ·</span>
          <span dir="ltr">{formatSize(totalSize)}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-[150px] flex-1">
          <Search size={13} className="pointer-events-none absolute top-1/2 start-2.5 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('fm_search_ph')}
            aria-label={t('fm_search_ph')}
            className="h-8 ps-8 pe-2 text-[12px]"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface px-1.5 py-0.5">
          <ArrowUpDown size={12} className="text-muted" aria-hidden />
          <Select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            aria-label={t('fm_sort')}
            className="h-7 border-0 bg-transparent ps-0 pe-1"
          >
            <option value="name">{t('fm_col_name')}</option>
            <option value="size">{t('fm_col_size')}</option>
            <option value="modified">{t('fm_col_date')}</option>
          </Select>
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="rounded px-1 text-[11px] text-muted transition-colors hover:text-ink"
            aria-label={sortDir === 'asc' ? t('fm_sort_desc') : t('fm_sort_asc')}
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        <Button variant="secondary" icon={<FolderPlus size={13} />} onClick={() => setShowMkdir(true)}>{t('fm_new_folder')}</Button>
        <Button variant="primary" loading={uploading} icon={<Upload size={13} />} onClick={() => uploadRef.current?.click()}>
          {uploading ? t('fm_uploading') : t('fm_upload')}
        </Button>
        <input ref={uploadRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f) }} />
      </div>

      <TransferQueue deviceId={deviceId} currentPath={path} onFinished={() => { void loadDir(path) }} />

      {uploading && (
        <Alert tone="info">
          {t('fm_uploading_named')} <span className="font-mono">{uploadName}</span>
        </Alert>
      )}

      {error && <Alert tone="danger" onClose={() => setError('')}>{error}</Alert>}

      {/* List */}
      <Card className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-surface2/95 backdrop-blur">
              <tr className="text-muted">
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('fm_col_name')}</th>
                <th scope="col" className="hidden w-24 px-3 py-2 text-start font-medium sm:table-cell">{t('fm_col_size')}</th>
                <th scope="col" className="hidden w-44 px-3 py-2 text-start font-medium md:table-cell">{t('fm_col_modified')}</th>
                <th scope="col" className="w-24 px-2 py-2">
                  <span className="sr-only">{t('fm_actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-3">
                    <SkeletonRows rows={6} />
                  </td>
                </tr>
              )}

              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-0">
                    <EmptyState
                      icon={<HardDrive size={26} />}
                      title={query ? t('fm_empty_search_title') : t('fm_empty_folder_title')}
                      description={query ? t('fm_empty_search_desc') : t('fm_empty_folder_desc')}
                      action={query
                        ? <Button onClick={() => setQuery('')}>{t('fm_clear_search')}</Button>
                        : <Button variant="primary" icon={<Upload size={13} />} onClick={() => uploadRef.current?.click()}>{t('fm_upload')}</Button>}
                    />
                  </td>
                </tr>
              )}

              {!loading && shown.map(entry => (
                <tr key={entry.path} className="group border-t border-line/60 transition-colors hover:bg-surface2/60">
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => entry.isDirectory ? void loadDir(entry.path) : void download(entry)}
                      className="flex w-full items-center gap-2 text-start"
                      title={entry.path}
                    >
                      <EntryIcon entry={entry} />
                      <span className={clsx('truncate', entry.isDirectory ? 'font-medium text-ink' : 'text-ink/90')}>{entry.name}</span>
                    </button>
                  </td>
                  <td className="hidden px-3 py-1.5 sm:table-cell">
                    <span dir="ltr" className="block font-mono text-muted">{entry.isDirectory ? '—' : formatSize(entry.size)}</span>
                  </td>
                  <td className="hidden px-3 py-1.5 md:table-cell">
                    <span dir="ltr" className="block text-muted">{formatDate(entry.modified)}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
                      {!entry.isDirectory && (
                        <Button
                          variant="ghost"
                          className="h-7 w-7 px-0"
                          aria-label={t('fm_download_named', { name: entry.name })}
                          title={t('fm_download')}
                          loading={downloadingFile === entry.path}
                          icon={<Download size={13} />}
                          onClick={() => void download(entry)}
                        />
                      )}
                      <Button
                        variant="ghost"
                        className="h-7 w-7 px-0"
                        aria-label={t('fm_rename_named', { name: entry.name })}
                        title={t('fm_rename')}
                        icon={<Pencil size={13} />}
                        onClick={() => { setRenamingFile(entry); setRenameValue(entry.name) }}
                      />
                      <Button
                        variant="ghost"
                        className="h-7 w-7 px-0 hover:text-danger"
                        aria-label={t('fm_delete_named', { name: entry.name })}
                        title={t('fm_delete')}
                        loading={deletingFile === entry.path}
                        icon={<Trash2 size={13} />}
                        onClick={() => setConfirmDelete(entry)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Download progress */}
      {downloadProgress && (
        <div className="rounded-lg border border-info/25 bg-info/10 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-[11.5px]">
            <span className="flex min-w-0 items-center gap-1.5 text-info">
              <Download size={12} className="shrink-0" aria-hidden />
              <span className="truncate">{downloadProgress.name}</span>
            </span>
            <span className="shrink-0 font-mono text-info" dir="ltr">
              {downloadProgress.percent}% · {formatSize(downloadProgress.received)}{downloadProgress.total ? ' / ' + formatSize(downloadProgress.total) : ''}
            </span>
          </div>
          <ProgressBar className="mt-1.5" value={downloadProgress.percent} tone="primary" label={t('fm_download_progress')} />
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 text-[13px] font-medium text-primary">
          <Upload size={18} className="me-2" aria-hidden />
          {t('fm_drop_here')} {path}
        </div>
      )}

      {/* Rename */}
      <Modal
        open={!!renamingFile}
        onClose={() => setRenamingFile(null)}
        title={t('fm_rename')}
        size="sm"
        footer={<>
          <Button onClick={() => setRenamingFile(null)}>{t('fm_cancel')}</Button>
          <Button variant="primary" onClick={() => void doRename()} disabled={!renameValue.trim()}>{t('fm_save')}</Button>
        </>}
      >
        <Field label={t('fm_new_name')} htmlFor="fm-rename">
          <Input
            id="fm-rename"
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void doRename() }}
          />
        </Field>
      </Modal>

      {/* New folder */}
      <Modal
        open={showMkdir}
        onClose={() => setShowMkdir(false)}
        title={t('fm_create_folder')}
        description={path}
        size="sm"
        footer={<>
          <Button onClick={() => setShowMkdir(false)}>{t('fm_cancel')}</Button>
          <Button variant="primary" onClick={() => void doMkdir()} disabled={!mkdirName.trim()}>{t('fm_create')}</Button>
        </>}
      >
        <Field label={t('fm_folder_name')} htmlFor="fm-mkdir">
          <Input
            id="fm-mkdir"
            autoFocus
            value={mkdirName}
            onChange={e => setMkdirName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void doMkdir() }}
            placeholder={t('fm_folder_name')}
          />
        </Field>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('fm_confirm_delete')}
        description={t('fm_confirm_delete_desc')}
        size="sm"
        footer={<>
          <Button onClick={() => setConfirmDelete(null)}>{t('fm_cancel')}</Button>
          <Button variant="danger" onClick={() => { if (confirmDelete) void doDelete(confirmDelete) }}>{t('fm_delete')}</Button>
        </>}
      >
        <p className="text-[12px] text-muted">
          {t('fm_delete_permanent_prefix')} <span className="font-mono text-ink">{confirmDelete?.name}</span> {t('fm_delete_permanent_suffix')}
        </p>
      </Modal>
    </div>
  )
}
