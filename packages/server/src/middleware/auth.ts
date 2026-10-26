import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthTokenPayload } from '@airemote/shared'
import { consumeWsTicket } from '../lib/wsTickets'
import { atLeast } from '../lib/security'

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const payload = request.user as unknown as AuthTokenPayload
    if (payload.role !== 'admin') {
      reply.code(403).send({ error: 'Forbidden — Admin required' })
    }
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
}

/**
 * v3.7.0 — role gate for operating endpoints (exec, files, terminal, control).
 * viewer is read-only; manager and admin may act on devices they can access.
 */
export function requireRole(minimum: 'viewer' | 'manager' | 'admin') {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
      return
    }
    const payload = request.user as unknown as AuthTokenPayload
    if (!atLeast(payload.role, minimum)) {
      reply.code(403).send({ error: 'Forbidden — ' + minimum + ' role required' })
    }
  }
}

export const requireManager = requireRole('manager')

/**
 * WebSocket auth — ticket only (v3.7.0).
 *
 * Accepting the raw JWT in the query string leaked 15-minute admin-capable
 * tokens into access logs and through Cloudflare quick tunnels. Clients must
 * now call POST /api/auth/ws-ticket and present ?ticket=<uuid>.
 */
export async function requireAuthWs(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { token?: string; ticket?: string }

  if (query.ticket) {
    const data = consumeWsTicket(query.ticket)
    if (!data) {
      reply.code(401).send({ error: 'Invalid or expired WS ticket' })
      return
    }
    ;(request as unknown as { user: AuthTokenPayload }).user = {
      userId: data.userId,
      email: data.email,
      role: data.role
    } as AuthTokenPayload
    return
  }

  if (query.token) {
    reply.code(401).send({ error: 'Query token auth removed in 3.7.0 — use POST /api/auth/ws-ticket' })
    return
  }

  reply.code(401).send({ error: 'WS ticket required' })
}
