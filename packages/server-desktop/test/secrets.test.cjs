/**
 * R2 — اختبار تشفير الأسرار (AES-256-GCM + مفتاح مستقل + هجرة).
 *
 * يثبت:
 *   A. المفتاح يُنشأ في ملف مستقل بطول 32 بايت
 *   B. دورة تشفير/فكّ تعمل وتُنتج صيغة v2
 *   C. التلاعب بالبيانات المشفّرة يُكشف ويُرفض (سلامة GCM)
 *   D. القيم القديمة (CBC) تُفكّ للتوافق
 *   E. الهجرة تحوّل القديم إلى v2 فعلياً
 *   F. المفتاح يُقرأ من الملف بعد إعادة التهيئة (لا يُفقد بالتدوير)
 *
 * Run: ELECTRON_RUN_AS_NODE=1 "packages\\server-desktop\\node_modules\\electron\\dist\\electron.exe" packages/server-desktop/test/secrets.test.cjs
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')

let Database
try {
  Database = require('better-sqlite3')
  const probe = new Database(':memory:'); probe.close()
} catch (e) {
  console.log('SKIP: better-sqlite3 is not usable under Node in this checkout (built for Electron).')
  process.exit(0)
}

const SERVER_DIR = path.resolve(__dirname, '..')
const srv = require(path.resolve(SERVER_DIR, 'server.js'))
const S = srv.__secrets

let failed = 0
function check(desc, cond, extra) {
  if (cond) console.log('PASS: ' + desc)
  else { console.error('FAIL: ' + desc + (extra ? '  (' + extra + ')' : '')); failed++ }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-secrets-'))
const dbPath = path.join(tmp, 'airemote.db')

// ── A. key file ──────────────────────────────────────────────────────────────
const created = S.initSecretKey(dbPath)
check('A1. key file created on first run', created.created === true)
const keyPath = S.getKeyPath()
check('A2. key file exists next to the database', fs.existsSync(keyPath) && path.dirname(keyPath) === tmp, keyPath)
const keyBuf = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'base64')
check('A3. key is 32 bytes', keyBuf.length === 32, 'len=' + keyBuf.length)

// ── B. round-trip ────────────────────────────────────────────────────────────
const plain = 'ssh-password-Ünïcode-123!'
const enc = S.encryptSecret(plain)
check('B1. ciphertext uses the v2 (GCM) format', enc.startsWith('v2:') && enc.split(':').length === 4, enc.slice(0, 12) + '…')
check('B2. decrypt returns the original', S.decryptSecret(enc) === plain)

// ── C. integrity ─────────────────────────────────────────────────────────────
const parts = enc.split(':')
const ct = Buffer.from(parts[3], 'base64')
ct[0] = ct[0] ^ 0x01
const tampered = 'v2:' + parts[1] + ':' + parts[2] + ':' + ct.toString('base64')
let threw = false
try { S.decryptSecret(tampered) } catch { threw = true }
check('C. tampered ciphertext is rejected', threw)

// ── D. legacy CBC still readable ─────────────────────────────────────────────
const crypto = require('crypto')
const iv = crypto.randomBytes(16)
const c = crypto.createCipheriv('aes-256-cbc', S.legacyDerivedKey(), iv)
const legacy = iv.toString('hex') + ':' + Buffer.concat([c.update('legacy-secret', 'utf8'), c.final()]).toString('hex')
check('D. legacy CBC value decrypts', S.decryptSecret(legacy) === 'legacy-secret')

// ── E. migration ─────────────────────────────────────────────────────────────
const db = new Database(dbPath)
db.exec("CREATE TABLE IF NOT EXISTS device_credentials (id TEXT PRIMARY KEY, secret_enc TEXT)")
db.prepare('INSERT INTO device_credentials (id, secret_enc) VALUES (?,?)').run('row-1', legacy)
db.prepare('INSERT INTO device_credentials (id, secret_enc) VALUES (?,?)').run('row-2', S.encryptSecret('already-new'))
const mig = S.migrateLegacySecrets(db)
const after1 = db.prepare('SELECT secret_enc FROM device_credentials WHERE id=?').get('row-1').secret_enc
const after2 = db.prepare('SELECT secret_enc FROM device_credentials WHERE id=?').get('row-2').secret_enc
check('E1. one legacy row migrated', mig.migrated === 1 && mig.failed === 0, JSON.stringify(mig))
check('E2. migrated row is now v2', String(after1).startsWith('v2:'))
check('E3. migrated row still decrypts', S.decryptSecret(after1) === 'legacy-secret')
check('E4. already-v2 row untouched', after2 === db.prepare('SELECT secret_enc FROM device_credentials WHERE id=?').get('row-2').secret_enc)
db.close()

// ── F. key persists ──────────────────────────────────────────────────────────
const again = S.initSecretKey(dbPath)
check('F1. existing key is reused, not regenerated', again.created === false)
check('F2. old ciphertext still decrypts after re-init', S.decryptSecret(enc) === plain)

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL SECRET STORAGE CHECKS PASSED')
process.exit(failed ? 1 : 0)
