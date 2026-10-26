import fs from 'fs'

/**
 * v3.7.0 — TLS for the API server.
 *
 * The server either terminates TLS itself (TLS_CERT_PATH / TLS_KEY_PATH) or
 * runs behind a reverse proxy that does (TRUST_PROXY=true). In production one
 * of the two is mandatory; ALLOW_INSECURE_HTTP=1 exists only for local
 * development and prints a loud warning.
 */
export interface TlsConfig {
  enabled: boolean
  cert?: Buffer
  key?: Buffer
  behindProxy: boolean
}

export function loadTlsConfig(env: NodeJS.ProcessEnv = process.env): TlsConfig {
  const certPath = env.TLS_CERT_PATH
  const keyPath = env.TLS_KEY_PATH
  const behindProxy = env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1'

  if (certPath && keyPath) {
    return {
      enabled: true,
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
      behindProxy
    }
  }
  return { enabled: false, behindProxy }
}

export function assertSecureTransport(cfg: TlsConfig, env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return
  if (cfg.enabled || cfg.behindProxy) return
  if (env.ALLOW_INSECURE_HTTP === '1') {
    console.warn('WARNING: ALLOW_INSECURE_HTTP=1 — production is serving plain HTTP. Never expose this to an untrusted network.')
    return
  }
  console.error('FATAL: production requires TLS. Set TLS_CERT_PATH/TLS_KEY_PATH, or TRUST_PROXY=true behind an HTTPS proxy. To override for a local-only test set ALLOW_INSECURE_HTTP=1.')
  process.exit(1)
}
