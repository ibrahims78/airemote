/**
 * DB upgrade test — 3.6.0 database  ->  3.7.6 web server (@airemote/server, libsql).
 *
 * Companion to test-db-upgrade.cjs (which covers the Electron desktop server).
 * This layer is the one with real DDL migrations:
 *   - refresh_tokens.token_id            (new column, v3.7.0)
 *   - ux idx_refresh_token_id            (created inside try/catch -> must be proven)
 *   - legacy refresh tokens dropped      (forces one re-login after upgrade)
 *   - audit_log 90d / device_stats_history 30d retention on startup
 *
 * Run: node scripts/test-db-upgrade-web.cjs [--verbose] [--keep]
 * Env: BASE_REF (default 32a9d6a)
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const cp = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const BASE_REF = process.env.BASE_REF || '32a9d6a'
const VERBOSE = process.argv.includes('--verbose')
const KEEP = process.argv.includes('--keep')

const results = []
let pass = 0, fail = 0
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) })
  if (ok) { pass++; if (VERBOSE) console.log('  ok   ' + name + (detail ? '  — ' + detail : '')) }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  — ' + detail : '')) }
  return ok
}
function section(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 66 - t.length))) }

const { createClient } = require(path.join(ROOT, 'packages', 'server', 'node_modules', '@libsql', 'client'))

function oldDdl() {
  const src = cp.execSync('git show ' + BASE_REF + ':packages/server/src/db/database.ts',
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8')
  const m = src.match(/executeMultiple\(\s*`([\s\S]*?)`\s*\)/)
  if (!m) throw new Error('could not extract the 3.6.0 DDL block')
  return { sql: m[1], bytes: src.length }
}

async function snapshot(client) {
  const tbl = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  const tables = tbl.rows.map(r => r.name)
  const schema = {}, counts = {}
  for (const t of tables) {
    const info = await client.execute('PRAGMA table_info(' + JSON.stringify(t) + ')')
    schema[t] = info.rows.map(c => c.name + ':' + c.type)
    const c = await client.execute('SELECT COUNT(*) c FROM "' + t + '"')
    counts[t] = Number(c.rows[0].c)
  }
  const idx = await client.execute("SELECT name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  const indexes = idx.rows.map(r => ({ name: r.name, sql: r.sql || '' }))
  return { tables, schema, counts, indexes }
}

function now(daysAgo) { return new Date(Date.now() - daysAgo * 864e5).toISOString() }

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-webup-'))
  const dbFile = path.join(workDir, 'airemote.db')

  console.log('AiRemote DB upgrade test (web / libsql) — ' + BASE_REF + ' (3.6.0)  ->  dist (3.7.6)')
  console.log('temp dir: ' + workDir)

  const client = createClient({ url: 'file:' + dbFile })

  section('Phase A — build a 3.6.0 database from the 3.6.0 DDL')
  const ddl = oldDdl()
  check('extracted 3.6.0 schema from database.ts', ddl.sql.includes('CREATE TABLE IF NOT EXISTS users'), ddl.bytes + ' bytes of source')
  await client.executeMultiple(ddl.sql)
  const fresh = await snapshot(client)
  check('3.6.0 schema creates 11 tables', fresh.tables.length === 11, fresh.tables.join(','))

  const adminId = 'u-admin-legacy', viewerId = 'u-viewer-legacy'
  await client.execute({ sql: "INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)",
    args: [adminId, 'admin@lab.local', 'Admin', 'admin', '$2a$12$legacy.hash.value.not.real'] })
  await client.execute({ sql: "INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)",
    args: [viewerId, 'viewer@lab.local', 'Viewer', 'viewer', '$2a$12$legacy.hash.value.not.real'] })
  await client.execute({ sql: "INSERT INTO devices (id,name,token,owner_id,status,tags) VALUES (?,?,?,?,?,?)",
    args: ['dev-1', 'LAB-WIN10', 'tok-legacy', adminId, 'offline', '["lab","win10"]'] })
  await client.execute({ sql: "INSERT INTO sessions (id,device_id,user_id,type,started_at) VALUES (?,?,?,?,?)",
    args: ['ses-1', 'dev-1', adminId, 'shell', now(1)] })
  await client.execute({ sql: "INSERT INTO ai_conversations (id,device_id,user_id,messages) VALUES (?,?,?,?)",
    args: ['conv-1', 'dev-1', adminId, JSON.stringify([{ role: 'user', content: 'legacy question' }])] })
  await client.execute({ sql: "INSERT INTO settings (key,value) VALUES (?,?)",
    args: ['user:' + adminId, JSON.stringify({ aiProvider: 'openai', aiApiKey: 'sk-legacy-plain' })] })

  // legacy refresh tokens: bcrypt-era rows with NO token_id
  for (let i = 0; i < 3; i++) {
    await client.execute({ sql: "INSERT INTO refresh_tokens (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)",
      args: ['rt-' + i, adminId, '$2a$10$legacybcrypt' + i, new Date(Date.now() + 30 * 864e5).toISOString()] })
  }
  // audit / stats spread across the retention boundaries
  for (const [days, label] of [[0, 'now'], [30, '30d'], [120, '120d']]) {
    await client.execute({ sql: "INSERT INTO audit_log (user_id,user_email,action,details,created_at) VALUES (?,?,?,?,?)",
      args: [adminId, 'admin@lab.local', 'login', 'legacy ' + label, now(days)] })
  }
  for (const [days, label] of [[0, 'now'], [10, '10d'], [40, '40d']]) {
    await client.execute({ sql: "INSERT INTO device_stats_history (device_id,cpu_percent,recorded_at) VALUES (?,?,?)",
      args: ['dev-1', 10, now(days)] })
  }

  const before = await snapshot(client)
  check('seeded 3.6.0 data', before.counts.refresh_tokens === 3 && before.counts.audit_log === 3 && before.counts.device_stats_history === 3,
    JSON.stringify({ rt: before.counts.refresh_tokens, audit: before.counts.audit_log, stats: before.counts.device_stats_history }))
  check('3.6.0 refresh_tokens has no token_id column', !before.schema.refresh_tokens.some(c => c.startsWith('token_id:')), 'cols=' + before.schema.refresh_tokens.length)
  await client.close()

  section('Phase B — run the 3.7.6 migration on that database')
  process.env.DB_PATH = dbFile
  const dbmod = require(path.join(ROOT, 'packages', 'server', 'dist', 'db', 'database.js'))
  let migErr = null
  try { await dbmod.initDatabase() } catch (e) { migErr = e }
  if (!check('3.7.6 initDatabase() runs on the 3.6.0 database', !migErr, migErr ? (migErr.stack || migErr.message) : '')) {
    return finish(workDir, null)
  }

  const live = dbmod.getDb()
  const after = await snapshot(live)

  check('table count unchanged', after.tables.length === before.tables.length, before.tables.length + ' -> ' + after.tables.length)
  const lost = []
  for (const t of before.tables) {
    const missing = before.schema[t].filter(c => !(after.schema[t] || []).includes(c))
    if (missing.length) lost.push(t + ':' + missing.join('+'))
  }
  check('no 3.6.0 column lost', lost.length === 0, lost.join(', ') || 'none')

  const tokenIdCol = after.schema.refresh_tokens.some(c => c.startsWith('token_id:'))
  check('refresh_tokens.token_id added by migration', tokenIdCol, after.schema.refresh_tokens.join(','))

  const uxIdx = after.indexes.find(i => i.name === 'idx_refresh_token_id')
  check('unique index idx_refresh_token_id actually created (not silently swallowed)', !!uxIdx && /UNIQUE/i.test(uxIdx.sql), uxIdx ? uxIdx.sql : 'MISSING')

  check('legacy (pre-3.7.0) refresh tokens dropped -> one forced re-login', after.counts.refresh_tokens === 0, 'rows ' + before.counts.refresh_tokens + ' -> ' + after.counts.refresh_tokens)

  check('users survive', after.counts.users === before.counts.users, before.counts.users + ' -> ' + after.counts.users)
  check('devices survive with tags intact', after.counts.devices === 1 && (await live.execute("SELECT tags FROM devices WHERE id='dev-1'")).rows[0].tags === '["lab","win10"]')
  check('sessions survive', after.counts.sessions === before.counts.sessions)
  check('AI conversations survive', after.counts.ai_conversations === 1)
  const st = (await live.execute({ sql: 'SELECT value FROM settings WHERE key=?', args: ['user:' + adminId] })).rows[0]
  check('3.6.0 plaintext provider key still readable (unsealSecret passes legacy values through)', !!st && String(st.value).includes('sk-legacy-plain'))

  check('audit_log 90-day retention applied (120d row removed)', after.counts.audit_log === 2, before.counts.audit_log + ' -> ' + after.counts.audit_log)
  check('device_stats_history 30-day retention applied (40d row removed, 10d kept)', after.counts.device_stats_history === 2,
    before.counts.device_stats_history + ' -> ' + after.counts.device_stats_history)

  const integrity = (await live.execute('PRAGMA integrity_check')).rows[0]
  check('integrity_check passes', Object.values(integrity)[0] === 'ok', JSON.stringify(integrity))

  // the unique index must actually bite
  let enforced = false, insErr = ''
  try {
    await live.execute({ sql: "INSERT INTO refresh_tokens (id,user_id,token_hash,expires_at,token_id) VALUES ('x1',?,'h1','2099','dup')", args: [adminId] })
    await live.execute({ sql: "INSERT INTO refresh_tokens (id,user_id,token_hash,expires_at,token_id) VALUES ('x2',?,'h2','2099','dup')", args: [adminId] })
  } catch (e) { insErr = String((e && e.message) || e) }
  const dupRows = Number((await live.execute("SELECT COUNT(*) c FROM refresh_tokens WHERE token_id='dup'")).rows[0].c)
  enforced = dupRows === 1
  check('token_id uniqueness is enforced by the DB', enforced, 'duplicate token_id rows: ' + dupRows + (insErr ? ' | rejected with: ' + insErr : ' | NO error raised'))

  // idempotency: a second startup must be a no-op
  const snapshotBefore2 = await snapshot(live)
  let rerunErr = null
  try { await dbmod.initDatabase() } catch (e) { rerunErr = e }
  const snapshotAfter2 = await snapshot(dbmod.getDb())
  check('second startup is idempotent (no error, no data loss)', !rerunErr && snapshotAfter2.counts.users === snapshotBefore2.counts.users,
    rerunErr ? rerunErr.message : 'users ' + snapshotBefore2.counts.users + ' -> ' + snapshotAfter2.counts.users)

  return finish(workDir, { before, after })
}

function finish(workDir, snaps) {
  const report = {
    generatedAt: new Date().toISOString(),
    layer: 'web (@airemote/server, libsql)',
    baseRef: BASE_REF,
    runtime: { node: process.versions.node },
    totals: { pass, fail },
    checks: results,
    snapshotBefore: snaps ? snaps.before : null,
    snapshotAfter: snaps ? snaps.after : null
  }
  const outDir = path.join(ROOT, 'outputs', 'db-upgrade-3.7.6')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'web-upgrade-report-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json')
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8')
  section('Summary')
  console.log('passed: ' + pass + '   failed: ' + fail)
  console.log('report: ' + outFile)
  if (!KEEP) { try { fs.rmSync(workDir, { recursive: true, force: true }) } catch {} }
  else console.log('kept  : ' + workDir)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.log('FATAL: ' + (e.stack || e.message)); process.exit(1) })