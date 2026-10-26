import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'

/**
 * v3.7.0 — refresh tokens.
 *
 * Format: `<tokenId>.<secret>` where tokenId is a UUID stored in an indexed
 * column and secret is 32 random bytes (base64url). Only SHA-256(secret+pepper)
 * is persisted, so a database leak does not expose usable tokens.
 *
 * The old implementation ran up to 50 bcrypt comparisons per request on an
 * unauthenticated endpoint (measured: 3.3 s for one request), which allowed a
 * trivial event-loop DoS. Lookup is now a single indexed SELECT + one SHA-256.
 */

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

function pepper(): string {
  return process.env.REFRESH_TOKEN_PEPPER
    || process.env.CREDENTIALS_KEY
    || process.env.JWT_SECRET
    || 'airemote-dev-refresh-pepper'
}

function hashSecret(secret: string): string {
  return crypto.createHmac('sha256', pepper()).update(secret).digest('hex')
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  if (ba.length !== bb.length || ba.length === 0) return false
  return crypto.timingSafeEqual(ba, bb)
}

export interface RefreshRecord {
  id: string
  user_id: string
}

export async function createRefreshToken(userId: string): Promise<string> {
  const db = getDb()
  const tokenId = uuidv4()
  const secret = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString()

  await db.execute({
    sql: `INSERT INTO refresh_tokens (id, user_id, token_id, token_hash, expires_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [uuidv4(), userId, tokenId, hashSecret(secret), expiresAt]
  })

  return tokenId + '.' + secret
}

function splitToken(token: string): { tokenId: string; secret: string } | null {
  const idx = token.indexOf('.')
  if (idx <= 0 || idx === token.length - 1) return null
  return { tokenId: token.slice(0, idx), secret: token.slice(idx + 1) }
}

/**
 * Verify a refresh token in O(1). Returns the row, or null.
 * On a token-id hit with a mismatching secret we treat it as a stolen token and
 * revoke every refresh token of that user.
 */
export async function verifyRefreshToken(token: string): Promise<RefreshRecord | null> {
  const parts = splitToken(token)
  if (!parts) return null

  const db = getDb()
  const res = await db.execute({
    sql: `SELECT id, user_id, token_hash FROM refresh_tokens
          WHERE token_id = ? AND expires_at > ? LIMIT 1`,
    args: [parts.tokenId, new Date().toISOString()]
  })
  const row = res.rows[0] as unknown as { id: string; user_id: string; token_hash: string } | undefined
  if (!row) return null

  if (!timingSafeEqualHex(hashSecret(parts.secret), row.token_hash)) {
    await revokeAllForUser(row.user_id)
    return null
  }
  return { id: row.id, user_id: row.user_id }
}

export async function revokeRefreshToken(id: string): Promise<void> {
  await getDb().execute({ sql: 'DELETE FROM refresh_tokens WHERE id = ?', args: [id] })
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await getDb().execute({ sql: 'DELETE FROM refresh_tokens WHERE user_id = ?', args: [userId] })
}

/** Remove pre-3.7.0 bcrypt rows that have no token_id. */
export async function purgeLegacyRefreshTokens(): Promise<number> {
  const res = await getDb().execute({
    sql: `DELETE FROM refresh_tokens WHERE token_id IS NULL OR token_id = ''`
  })
  return Number(res.rowsAffected ?? 0)
}
