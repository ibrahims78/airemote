import type { FastifyInstance } from 'fastify'

/**
 * v3.7.0 — security headers for every HTTP response.
 *
 * Applied to the web server (the desktop server sets its own headers next to
 * the static handler). CSP keeps scripts self-hosted; the dashboard is a
 * single-page app served from the same origin, so 'self' is enough.
 */
export function registerSecurityHeaders(app: FastifyInstance, opts: { hsts: boolean }): void {
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self' ws: wss:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "form-action 'self'"
    ].join('; '))
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'SAMEORIGIN')
    reply.header('Referrer-Policy', 'no-referrer')
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    reply.header('Cross-Origin-Opener-Policy', 'same-origin')
    if (opts.hsts) {
      reply.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
    }
    return payload
  })
}
