import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import { notifyTelegram, invalidateTelegramCache, getTelegramConfig } from '../services/telegramNotifier'
import { getDb } from '../db/database'
import type { AuthTokenPayload } from '@airemote/shared'
import { sealSecret, unsealSecret } from '../services/crypto'

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  // Get settings for current user
  fastify.get('/', async (request) => {
    const user = request.user as unknown as AuthTokenPayload
    const db = getDb()
    const result = await db.execute({
      sql: 'SELECT value FROM settings WHERE key = ?',
      args: [`user:${user.userId}`]
    })
    const row = result.rows[0] as unknown as { value: string } | undefined
    if (!row) return { aiProvider: 'openai', aiModel: 'gpt-4o', aiApiKey: '', ollamaUrl: '' }
    try {
      const parsed = JSON.parse(row.value) as Record<string, unknown>
      if (typeof parsed.aiApiKey === 'string') parsed.aiApiKey = unsealSecret(parsed.aiApiKey)
      return parsed
    } catch { return {} }
  })

  // Save settings for current user
  fastify.put<{ Body: Record<string, unknown> }>('/', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const db = getDb()
    const now = new Date().toISOString()
    // v3.7.0 — provider keys are encrypted at rest with CREDENTIALS_KEY
    const payload = { ...(request.body as Record<string, unknown>) }
    if (typeof payload.aiApiKey === 'string') payload.aiApiKey = sealSecret(payload.aiApiKey)
    const valueJson = JSON.stringify(payload)

    await db.execute({
      sql: `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      args: [`user:${user.userId}`, valueJson, now]
    })
    invalidateTelegramCache()
    return reply.send({ ok: true })
  })

  // Get global system settings (admin only)
  fastify.get('/system', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Admin required' })
    const db = getDb()
    const result = await db.execute({ sql: 'SELECT key, value, updated_at FROM settings WHERE key NOT LIKE ?', args: ['user:%'] })
    const out: Record<string, unknown> = {}
    for (const row of result.rows as unknown as { key: string; value: string }[]) {
      try { out[row.key] = JSON.parse(row.value) } catch { out[row.key] = row.value }
    }
    return out
  })

  // 2026-11-10 — المسار كان مفقودًا: زر «اختبار» في الواجهة كان يرمي 404 دائمًا.
  fastify.post<{ Body: { token?: string; chatId?: string } }>('/telegram/test', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Admin required' })
    const { token, chatId } = request.body || {}
    if (!token || !chatId) return reply.code(400).send({ error: 'token and chatId are required' })
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: 'اختبار AiRemote — إشعار تجريبي ✅',
          disable_notification: false,
        }),
      })
      const j = await res.json() as { ok?: boolean; description?: string; result?: { message_id?: number } }
      if (!res.ok || !j.ok) return reply.code(400).send({ error: j.description || 'Telegram rejected the message' })
      return { ok: true, messageId: j.result?.message_id ?? null }
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message })
    }
  })

  // 2026-11-10 — إطلاق إشعار من نوع محدد لاختبار كل الأحداث (مدير فقط).
  fastify.post<{ Body: { kind?: 'online' | 'offline' | 'chat'; subject?: string; detail?: string } }>('/telegram/notify', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Admin required' })
    const kind = request.body?.kind || 'chat'
    const ok = await notifyTelegram(kind, request.body?.subject || 'اختبار', request.body?.detail || '')
    return ok ? { ok: true, kind } : reply.code(400).send({ ok: false, kind, error: 'not sent (check enabled/events/token/chat)' })
  })

  // 2026-11-10 — تشخيص: هل المُرسِل يرى إعدادات صالحة؟ (لا يكشف الرمز)
  fastify.get('/telegram/status', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Admin required' })
    const cfg = await getTelegramConfig()
    return {
      enabled: cfg.enabled,
      hasToken: cfg.token.length > 0,
      tokenLength: cfg.token.length,
      chatId: cfg.chatId,
      events: cfg.events,
    }
  })
}
