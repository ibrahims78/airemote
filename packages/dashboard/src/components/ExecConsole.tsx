import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { useT } from '../lib/i18n'

export function ExecConsole({ deviceId }: { deviceId: string }) {
  const t = useT()
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
          placeholder={t('exec_placeholder')}
          className="flex-1 bg-code border border-line rounded-lg px-3 py-2 text-sm text-ink font-mono outline-none focus:border-primary/60"
          dir="ltr"
        />
        <button
          onClick={run}
          disabled={busy || !cmd.trim()}
          className="px-4 py-2 rounded-lg bg-primary hover:brightness-110 disabled:opacity-40 text-primary-fg text-sm font-medium"
        >{busy ? '...' : t('exec_run')}</button>
      </div>
      <pre className="flex-1 overflow-auto bg-code border border-line rounded-lg p-3 text-[12px] leading-5 text-success font-mono whitespace-pre-wrap" dir="ltr">
        {out || t('exec_hint')}
      </pre>
    </div>
  )
}
