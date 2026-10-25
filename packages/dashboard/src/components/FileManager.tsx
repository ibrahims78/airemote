import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Folder, FileText, FileImage, FileVideo, FileAudio, FileArchive, FileCode,
  Package, Download, Upload, FolderPlus, Trash2, Pencil, RefreshCw, Home,
  ArrowUp, Search, ArrowUpDown, HardDrive, ChevronRight, X, Check,
  AlertCircle, Loader2
} from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../lib/api'

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
  return d.toLocaleString('ar', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

function EntryIcon({ entry }: { entry: FileEntry }) {
  if (entry.isDirectory) return <Folder size={16} className="text-amber-400" />
  const ext = extOf(entry.name)
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic'].includes(ext)) return <FileImage size={16} className="text-emerald-400" />
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp', 'ts'].includes(ext)) return <FileVideo size={16} className="text-sky-400" />
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus'].includes(ext)) return <FileAudio size={16} className="text-fuchsia-400" />
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return <FileArchive size={16} className="text-orange-400" />
  if (['apk', 'aab', 'ipa', 'exe', 'msi', 'deb', 'rpm'].includes(ext)) return <Package size={16} className="text-rose-400" />
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'kt', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'sh', 'ps1', 'json', 'xml', 'yml', 'yaml', 'html', 'css'].includes(ext)) return <FileCode size={16} className="text-indigo-400" />
  if (['txt', 'md', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext)) return <FileText size={16} className="text-slate-300" />
  return <FileText size={16} className="text-slate-500" />
}

function authToken(): string {
  try {
    const raw = localStorage.getItem('airemote-auth')
    if (!raw) return ''
    const j = JSON.parse(raw)
    return j?.state?.token || ''
  } catch { return '' }
}

export function FileManager({ deviceId, deviceName }: Props) {
  const [path, setPath] = useState('/')
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
    loadDir('/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

  async function loadDir(p: string) {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/devices/${deviceId}/fs/list`, { params: { path: p }, timeout: 20000 })
      setFiles(res.data as FileEntry[])
      setPath(p)
      setQuery('')
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string } }; code?: string; message?: string }
      const serverMsg = err.response?.data?.error || ''
      if (err.code === 'ECONNABORTED' || /timeout|time out/i.test(serverMsg)) {
        setError('انتهت مهلة الاتصال — تأكد من أن الجهاز متصل وأن الوكيل يعمل.')
      } else if (/offline/i.test(serverMsg) || err.response?.status === 503) {
        setError('الجهاز غير متصل — شغّل الوكيل على الجهاز أولاً.')
      } else if (/not permitted|denied|EACCES/i.test(serverMsg)) {
        setError('لا يوجد صلاحية للوصول إلى هذا المسار على الجهاز.')
      } else {
        setError(serverMsg || err.message || 'فشل تحميل الملفات — حاول مجدداً.')
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
      const res = await fetch(`/api/devices/${deviceId}/fs/download?path=${encodeURIComponent(entry.path)}`, {
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
      setError(err.message || 'فشل تنزيل الملف.')
      setDownloadProgress(null)
    } finally {
      setDownloadingFile(null)
    }
  }

  async function doDelete(entry: FileEntry) {
    setConfirmDelete(null)
    setDeletingFile(entry.path)
    try {
      await api.post(`/api/devices/${deviceId}/fs/delete`, { path: entry.path }, { timeout: 20000 })
      await loadDir(path)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || 'فشل حذف العنصر.')
    } finally {
      setDeletingFile(null)
    }
  }

  async function doRename() {
    if (!renamingFile || !renameValue.trim()) return
    const parent = renamingFile.path.slice(0, renamingFile.path.lastIndexOf('/')) || ''
    const newPath = `${parent}/${renameValue.trim()}`
    try {
      await api.post(`/api/devices/${deviceId}/fs/rename`, { oldPath: renamingFile.path, newPath }, { timeout: 20000 })
      setRenamingFile(null)
      setRenameValue('')
      await loadDir(path)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || 'فشل إعادة التسمية.')
    }
  }

  async function uploadFile(file: File) {
    setUploading(true)
    setUploadName(file.name)
    setError('')
    const destPath = path === '/' ? `/${file.name}` : `${path}/${file.name}`
    try {
      await api.post(`/api/devices/${deviceId}/fs/upload?path=${encodeURIComponent(destPath)}`, file, {
        headers: { 'Content-Type': 'application/octet-stream' },
        timeout: 600000
      })
      await loadDir(path)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || 'فشل رفع الملف.')
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
      await api.post(`/api/devices/${deviceId}/fs/mkdir`, { path: newDirPath }, { timeout: 20000 })
      setShowMkdir(false)
      setMkdirName('')
      await loadDir(path)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || 'فشل إنشاء المجلد.')
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
      className="h-full flex flex-col gap-3 relative"
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) uploadFile(f)
      }}
    >
      {/* Breadcrumb + navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => loadDir('/')} className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/70 text-slate-400" title="الجذر">
          <Home size={14} />
        </button>
        <button onClick={goUp} disabled={path === '/'} className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/70 text-slate-400 disabled:opacity-30" title="أعلى">
          <ArrowUp size={14} />
        </button>
        <button onClick={() => loadDir(path)} className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/70 text-slate-400" title="تحديث">
          <RefreshCw size={14} className={clsx(loading && 'animate-spin')} />
        </button>
        <div className="flex items-center gap-1 flex-wrap min-w-0 bg-slate-900/60 border border-slate-700/50 rounded-lg px-2 py-1.5">
          <button onClick={() => loadDir('/')} className="text-[12px] text-slate-400 hover:text-slate-200">الجذر</button>
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight size={11} className="text-slate-600" />
              <button
                onClick={() => loadDir('/' + pathParts.slice(0, i + 1).join('/'))}
                className="text-[12px] text-slate-300 hover:text-white truncate max-w-[140px]"
              >{part}</button>
            </span>
          ))}
        </div>
        <div className="flex-1" />
        <div className="text-[11px] text-slate-500">{dirCount} مجلد · {files.length - dirCount} ملف · {formatSize(totalSize)}</div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 start-2.5 text-slate-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="بحث في المجلد الحالي…"
            className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg ps-8 pe-2 py-1.5 text-[12px] text-slate-200 outline-none focus:border-brand-blue/60"
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-700/50 rounded-lg px-1.5 py-1">
          <ArrowUpDown size={12} className="text-slate-500" />
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} className="bg-transparent text-[12px] text-slate-300 outline-none">
            <option value="name">الاسم</option>
            <option value="size">الحجم</option>
            <option value="modified">التاريخ</option>
          </select>
          <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="text-[11px] text-slate-400 hover:text-slate-200 px-1">
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
        <button onClick={() => setShowMkdir(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 text-[12px]">
          <FolderPlus size={13} /> مجلد جديد
        </button>
        <button onClick={() => uploadRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-blue hover:bg-blue-500 disabled:opacity-50 text-white text-[12px] font-medium">
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? 'جارٍ الرفع…' : 'رفع ملف'}
        </button>
        <input ref={uploadRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
      </div>

      {uploading && (
        <div className="flex items-center gap-2 text-[12px] text-sky-300 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-2">
          <Loader2 size={13} className="animate-spin" /> يتم رفع: <span className="font-mono">{uploadName}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-[12px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={13} /></button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-700/50 bg-slate-900/40">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10">
            <tr className="text-slate-500 text-start">
              <th className="text-start font-medium px-3 py-2">الاسم</th>
              <th className="text-start font-medium px-3 py-2 w-24">الحجم</th>
              <th className="text-start font-medium px-3 py-2 w-44">آخر تعديل</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="py-14 text-center text-slate-500"><Loader2 size={18} className="animate-spin mx-auto mb-2" />جارٍ تحميل الملفات…</td></tr>
            )}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={4} className="py-14 text-center text-slate-500">
                <HardDrive size={26} className="mx-auto mb-2 text-slate-700" />
                {query ? 'لا نتائج مطابقة للبحث' : 'هذا المجلد فارغ — اسحب ملفاً هنا لرفعه'}
              </td></tr>
            )}
            {!loading && shown.map(entry => (
              <tr key={entry.path} className="border-t border-slate-700/30 hover:bg-slate-800/40 group">
                <td className="px-3 py-2">
                  <button
                    onClick={() => entry.isDirectory ? loadDir(entry.path) : download(entry)}
                    className="flex items-center gap-2 text-start w-full"
                    title={entry.path}
                  >
                    <EntryIcon entry={entry} />
                    <span className={clsx('truncate max-w-[360px]', entry.isDirectory ? 'text-slate-100 font-medium' : 'text-slate-300')}>{entry.name}</span>
                  </button>
                </td>
                <td className="px-3 py-2 text-slate-500 font-mono">{entry.isDirectory ? '—' : formatSize(entry.size)}</td>
                <td className="px-3 py-2 text-slate-500">{formatDate(entry.modified)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!entry.isDirectory && (
                      <button onClick={() => download(entry)} disabled={downloadingFile === entry.path} className="p-1.5 rounded text-slate-500 hover:text-sky-400" title="تنزيل">
                        {downloadingFile === entry.path ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                      </button>
                    )}
                    <button onClick={() => { setRenamingFile(entry); setRenameValue(entry.name) }} className="p-1.5 rounded text-slate-500 hover:text-amber-400" title="إعادة تسمية">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setConfirmDelete(entry)} disabled={deletingFile === entry.path} className="p-1.5 rounded text-slate-500 hover:text-rose-400" title="حذف">
                      {deletingFile === entry.path ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Download progress (v3.5) */}
      {downloadProgress && (
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 text-[11.5px]">
            <span className="flex items-center gap-1.5 text-sky-200 truncate">
              <Download size={12} /> {downloadProgress.name}
            </span>
            <span className="font-mono text-sky-300 flex-shrink-0">
              {downloadProgress.percent}% · {formatSize(downloadProgress.received)}{downloadProgress.total ? ' / ' + formatSize(downloadProgress.total) : ''}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-teal-400 transition-all duration-150" style={{ width: Math.max(2, downloadProgress.percent) + '%' }} />
          </div>
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 rounded-xl bg-brand-blue/10 border-2 border-dashed border-brand-blue/50 flex items-center justify-center text-brand-blue text-sm font-medium z-20 pointer-events-none">
          <Upload size={18} className="me-2" /> أفلت الملف هنا لرفعه إلى: {path}
        </div>
      )}

      {/* Rename modal */}
      {renamingFile && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setRenamingFile(null)}>
          <div className="glass rounded-xl p-4 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-3">إعادة تسمية</h3>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setRenamingFile(null) }}
              className="w-full bg-slate-900/70 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-brand-blue/60"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRenamingFile(null)} className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300">إلغاء</button>
              <button onClick={doRename} className="px-3 py-1.5 text-xs rounded-lg bg-brand-blue text-white"><Check size={12} className="inline me-1" />حفظ</button>
            </div>
          </div>
        </div>
      )}

      {/* Mkdir modal */}
      {showMkdir && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowMkdir(false)}>
          <div className="glass rounded-xl p-4 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-3">إنشاء مجلد جديد</h3>
            <input
              autoFocus
              value={mkdirName}
              onChange={e => setMkdirName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doMkdir(); if (e.key === 'Escape') setShowMkdir(false) }}
              placeholder="اسم المجلد"
              className="w-full bg-slate-900/70 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-brand-blue/60"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowMkdir(false)} className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300">إلغاء</button>
              <button onClick={doMkdir} className="px-3 py-1.5 text-xs rounded-lg bg-brand-blue text-white"><Check size={12} className="inline me-1" />إنشاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="glass rounded-xl p-4 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-2">تأكيد الحذف</h3>
            <p className="text-xs text-slate-400 mb-4">سيتم حذف <span className="font-mono text-slate-200">{confirmDelete.name}</span> نهائياً من الجهاز. هل أنت متأكد؟</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300">إلغاء</button>
              <button onClick={() => doDelete(confirmDelete)} className="px-3 py-1.5 text-xs rounded-lg bg-rose-500/90 hover:bg-rose-500 text-white">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
