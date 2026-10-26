import 'dotenv/config'
import { buildServer } from './app'

const PORT = parseInt(process.env.PORT || '3001')
const HOST = process.env.HOST || '0.0.0.0'

const INSECURE_SECRETS = new Set([
  'change-this-secret',
  'airemote-dev-secret-change-in-production',
  'secret',
  'changeme',
  'airemote'
])

/**
 * v3.7.0 — refuse to boot in production with a weak or well-known secret.
 * The previous check only rejected one exact dev string, so the value shipped
 * in docker-compose ("change-this-secret") silently passed.
 */
function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== 'production') return

  const jwtSecret = process.env.JWT_SECRET || ''
  if (!jwtSecret || INSECURE_SECRETS.has(jwtSecret) || jwtSecret.length < 32) {
    console.error('FATAL: JWT_SECRET must be a unique value of at least 32 characters when NODE_ENV=production. Refusing to start.')
    process.exit(1)
  }

  const credentialsKey = process.env.CREDENTIALS_KEY || ''
  if (!credentialsKey || INSECURE_SECRETS.has(credentialsKey) || credentialsKey.length < 32) {
    console.error('FATAL: CREDENTIALS_KEY must be a unique value of at least 32 characters when NODE_ENV=production (it encrypts stored provider keys). Refusing to start.')
    process.exit(1)
  }

  if (process.env.JWT_SECRET === process.env.CREDENTIALS_KEY) {
    console.error('FATAL: JWT_SECRET and CREDENTIALS_KEY must be different values.')
    process.exit(1)
  }
}

async function main() {
  assertProductionSecrets()

  if (process.env.JWT_SECRET === 'airemote-dev-secret-change-in-production' || !process.env.JWT_SECRET) {
    console.warn('WARNING: JWT_SECRET is not set. Using an insecure development default — never deploy this outside localhost.')
  }

  const app = await buildServer()
  const tls = (app as unknown as { tlsConfig: { enabled: boolean; cert?: Buffer; key?: Buffer } }).tlsConfig

  try {
    await app.listen({
      port: PORT,
      host: HOST,
      ...(tls && tls.enabled ? { https: { key: tls.key as Buffer, cert: tls.cert as Buffer } } : {})
    })
    const scheme = tls && tls.enabled ? 'https' : 'http'
    console.log('AiRemote Server running on ' + scheme + '://' + HOST + ':' + PORT)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  const shutdown = async (signal: string) => {
    console.log('Received ' + signal + ' — shutting down gracefully')
    try {
      await app.close()
      process.exit(0)
    } catch {
      process.exit(1)
    }
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main()
