/**
 * v3.7.0 — WebSocket handshakes must carry a single-use ticket, never the JWT.
 * Keeps tokens out of access logs, proxy logs and tunnel providers.
 */
export async function fetchWsTicket(token: string | null | undefined): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/ws-ticket', {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    })
    if (!res.ok) return null
    const data = await res.json() as { ticket?: string }
    return data.ticket || null
  } catch {
    return null
  }
}
