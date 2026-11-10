import { useParams, useSearchParams } from 'react-router-dom'
import { FolderOpen, ShieldAlert } from 'lucide-react'
import { FileManager } from '../components/FileManager'
import { useT } from '../lib/i18n'

/**
 * 3.11 — صفحة ملفات جلسة وكيل↔وكيل.
 * تُفتح من الوكيل بعد قبول جلسة access=files، وتُصادَق بتذكرة الجلسة (rt)
 * بدل تسجيل دخول اللوحة — فلا يحتاج جهاز الطالب حساباً.
 */
export function FilesPage() {
  const t = useT()
  const { deviceId = '' } = useParams()
  const [params] = useSearchParams()
  const rt = params.get('rt') || ''
  const name = params.get('name') || ''
  // 3.11.1 — هدف أندرويد لا يعرض `/` (جذر نظام فارغ)؛ نبدأ من /sdcard.
  const platform = (params.get('platform') || '').toLowerCase()
  const initialPath = platform === 'android' ? '/sdcard' : '/'
  const short = deviceId ? deviceId.slice(0, 8) : ''

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line/60 bg-surface/70 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <FolderOpen size={16} className="text-primary" />
          <div className="text-sm font-medium">{t('files_session_title')}</div>
          <div className="text-xs text-muted font-mono">{name || short}</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4">
        {!rt ? (
          <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
            <ShieldAlert size={16} className="mt-0.5 text-warning" />
            <div>
              <div className="font-medium">{t('files_ticket_missing')}</div>
              <div className="text-muted">{t('files_ticket_hint')}</div>
            </div>
          </div>
        ) : (
          <FileManager deviceId={deviceId} deviceName={name || short} rt={rt} initialPath={initialPath} platform={platform} />
        )}
      </main>
    </div>
  )
}
