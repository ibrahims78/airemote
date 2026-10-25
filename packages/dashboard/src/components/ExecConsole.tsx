import { useState } from 'react'
import { useAuthStore } from '../store/authStore'

export function ExecConsole({ deviceId }: { deviceId: string }) {
  const { token } = useAuthStore()
  const [cmd, setCmd] = useState('')
  const [out, setOut] = useState('')
  const [busy, setBusy] = useState(false)

  async function run() {
    if (!cmd.trim() || busy) return
    setBusy(true)
    setOut(o => o + '\n$ ' + cmd + '\n')
    try {
      const r = await fetch('/api/devices/' + deviceId + '/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ command: cmd, timeoutMs: 30000 })
      })
      const j = await r.json()
      if (!r.ok) setOut(o => o + '[error] ' + (j.error || r.status))
      else setOut(o => o + (j.stdout || '') + (j.stderr ? '\n[stderr] ' + j.stderr : '') + '\n[exit ' + (j.exitCode ?? 0) + ']')
    } catch (e: unknown) {
      setOut(o => o + '[error] ' + (e instanceof Error ? e.message : String(e)))
    }
    setBusy(false)
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={cmd}
          onChange={e => setCmd(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') run() }}
          placeholder="أدخل أمر shell للجهاز (مثال: getprop ro.product.model)"
          className="flex-1 bg-slate-900/70 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono outline-none focus:border-brand-blue/60"
          dir="ltr"
        />
        <button
          onClick={run}
          disabled={busy || !cmd.trim()}
          className="px-4 py-2 rounded-lg bg-brand-blue hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium"
        >{busy ? '...' : 'تنفيذ'}</button>
      </div>
      <pre className="flex-1 overflow-auto bg-black/60 border border-slate-800 rounded-lg p-3 text-[12px] leading-5 text-emerald-300 font-mono whitespace-pre-wrap" dir="ltr">
        {out || 'الطرفية تعمل عبر تنفيذ أوامر الوكيل (بدون SSH). اكتب أمراً بالأعلى.'}
      </pre>
    </div>
  )
}
