/**
 * telegramNotifier — 2026-11-10
 * الإعدادات كانت تُحفظ (token/chatId/enabled/events) بلا أي كود يقرأها، فلم يكن هناك
 * إشعار فعلي. هذا الملف هو المُرسِل الوحيد.
 *
 * مهم: جدول settings يخزّن إعدادات كل مستخدم كصف واحد key='user:<id>' بقيمة JSON،
 * وليس مفاتيح عامة — لذا نقرأ صفوف user:* ونختار أول حساب فعّل Telegram.
 */
import { getDb } from '../db/database'

type Kind = 'online' | 'offline' | 'chat'

interface Cfg { token: string; chatId: string; enabled: boolean; events: Record<string, boolean> }

let cache: Cfg | null = null
let cachedAt = 0

async function loadConfig (): Promise<Cfg> {
  if (cache && Date.now() - cachedAt < 30_000) return cache
  let cfg: Cfg = { token: '', chatId: '', enabled: false, events: {} }
  try {
    const db = getDb()
    const res = await db.execute({ sql: "SELECT value FROM settings WHERE key LIKE 'user:%'", args: [] })
    for (const row of res.rows as unknown as { value: string }[]) {
      let v: Record<string, unknown>
      try { v = JSON.parse(row.value) as Record<string, unknown> } catch { continue }
      if (v.telegramEnabled !== true) continue
      const token = typeof v.telegramToken === 'string' ? v.telegramToken : ''
      const chatId = typeof v.telegramChatId === 'string' ? v.telegramChatId : ''
      if (!token || !chatId) continue
      cfg = {
        token,
        chatId,
        enabled: true,
        events: (v.telegramEvents && typeof v.telegramEvents === 'object') ? v.telegramEvents as Record<string, boolean> : {},
      }
      break
    }
  } catch { /* ignore */ }
  cache = cfg
  cachedAt = Date.now()
  return cfg
}

export function invalidateTelegramCache (): void { cache = null; cachedAt = 0 }

export async function getTelegramConfig (): Promise<Cfg> { return loadConfig() }

const ICON: Record<Kind, string> = { online: '🟢', offline: '🔴', chat: '💬' }
const LABEL: Record<Kind, string> = { online: 'اتصل جهاز', offline: 'انقطع جهاز', chat: 'رسالة من الجهاز' }

export async function notifyTelegram (kind: Kind, subject: string, detail = ''): Promise<boolean> {
  const cfg = await loadConfig()
  if (!cfg.enabled || !cfg.token || !cfg.chatId) return false
  if (cfg.events[kind] === false) return false
  const text = `${ICON[kind]} ${LABEL[kind]}: ${subject}${detail ? '\n' + detail : ''}`
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text, disable_notification: false }),
    })
    return res.ok
  } catch { return false }
}
