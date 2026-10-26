/**
 * Security primitives shared by REST routes and WebSocket handlers.
 *
 * v3.7.0 — role model, SSRF guard and small helpers. Keep this module free of
 * imports from routes/ws to avoid cycles.
 */

export const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  user: 1,
  manager: 2,
  admin: 3
}

export function roleRank(role: string | undefined | null): number {
  if (!role) return 0
  return ROLE_RANK[role] ?? 0
}

export function atLeast(role: string | undefined | null, minimum: 'viewer' | 'manager' | 'admin'): boolean {
  return roleRank(role) >= roleRank(minimum)
}

export function isReadOnlyRole(role: string | undefined | null): boolean {
  return roleRank(role) < roleRank('manager')
}

// ── SSRF guard ───────────────────────────────────────────────────────────────

const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback',
  'metadata', 'metadata.google.internal', 'instance-data'
])

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let out = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    out = (out << 8) + n
  }
  return out >>> 0
}

function inCidr(value: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base)
  if (b === null) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (value & mask) === (b & mask)
}

const PRIVATE_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
]

export function isPrivateAddress(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (BLOCKED_HOSTNAMES.has(host)) return true
  if (host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return true
  if (host === '::1' || host === '::' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true

  const v4 = ipv4ToInt(host)
  if (v4 !== null) {
    return PRIVATE_V4.some(([base, bits]) => inCidr(v4, base, bits))
  }
  return false
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

/**
 * Validate a user-supplied outbound URL (AI provider base URL, webhook target).
 * Rejects non-HTTP(S) schemes, credentials in the URL and private/loopback
 * addresses so the server cannot be used as an SSRF proxy.
 */
export function assertSafeOutboundUrl(
  raw: string | undefined | null,
  options: { allowPrivate?: boolean; allowHosts?: string[] } = {}
): URL {
  if (!raw || typeof raw !== 'string') throw new UnsafeUrlError('URL مطلوب')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeUrlError('صيغة URL غير صالحة')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('يُسمح ببروتوكول http أو https فقط')
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('لا يُسمح ببيانات دخول داخل URL')
  }
  const host = url.hostname.toLowerCase()
  if (options.allowHosts && options.allowHosts.some(h => host === h || host.endsWith('.' + h))) {
    return url
  }
  if (!options.allowPrivate && isPrivateAddress(host)) {
    throw new UnsafeUrlError('عنوان داخلي/محلي غير مسموح')
  }
  return url
}

/**
 * Addresses that are legitimate AI provider endpoints. Anything else must be
 * an explicit, public HTTPS URL.
 */
export const AI_PROVIDER_HOSTS = [
  'api.openai.com',
  'api.z.ai',
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  'api.anthropic.com',
  'text.pollinations.ai',
  'image.pollinations.ai'
]
