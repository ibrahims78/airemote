import 'dotenv/config'
import { buildServer } from './app'

const PORT = parseInt(process.env.PORT || '3001')
const HOST = process.env.HOST || '0.0.0.0'

function assertProductionSecret(): void {
  const jwtSecret = process.env.JWT_SECRET
  const usingDefault = !jwtSecret || jwtSecret === 'airemote-dev-secret-change-in-production'
  if (usingDefault) {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ FATAL: JWT_SECRET must be a strong unique value when NODE_ENV=production. Refusing to start with an insecure default secret.')
      process.exit(1)
    }
    console.warn('⚠️  WARNING: JWT_SECRET is not set. Using insecure default — set JWT_SECRET in .env before deploying to production!')
  }
}

async function main() {
  assertProductionSecret()

  const app = await buildServer()
  try {
    await app.listen({ port: PORT, host: HOST })
    console.log(`🚀 AiRemote Server running on http://${HOST}:${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
