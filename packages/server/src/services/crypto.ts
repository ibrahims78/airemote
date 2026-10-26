import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const k = process.env.CREDENTIALS_KEY
  if (k && k.length > 0) {
    return crypto.createHash('sha256').update(k).digest()
  }
  if (process.env.NODE_ENV === 'production') {
    // Never silently derive long-lived data keys from the session secret in
    // production: rotating JWT_SECRET would make stored credentials unreadable.
    throw new Error('CREDENTIALS_KEY is required in production to encrypt stored secrets')
  }
  const seed = process.env.JWT_SECRET || 'airemote-dev-credentials-key-fallback'
  return crypto.createHash('sha256').update(seed).digest()
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv  = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':')
}

export function decryptSecret(encoded: string): string {
  const parts = encoded.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted format')
  const [ivHex, tagHex, dataHex] = parts
  const key     = getKey()
  const iv      = Buffer.from(ivHex, 'hex')
  const tag     = Buffer.from(tagHex, 'hex')
  const data    = Buffer.from(dataHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data).toString('utf8') + decipher.final('utf8')
}

const SEAL_PREFIX = 'enc1:'

/** Encrypt a value for storage. Idempotent: already-sealed values pass through. */
export function sealSecret(plaintext: string): string {
  if (!plaintext) return plaintext
  if (plaintext.startsWith(SEAL_PREFIX)) return plaintext
  return SEAL_PREFIX + encryptSecret(plaintext)
}

/** Decrypt a sealed value; plain-text legacy values are returned unchanged. */
export function unsealSecret(stored: string): string {
  if (!stored) return stored
  if (!stored.startsWith(SEAL_PREFIX)) return stored
  return decryptSecret(stored.slice(SEAL_PREFIX.length))
}
