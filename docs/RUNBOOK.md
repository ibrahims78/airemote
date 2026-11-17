# RUNBOOK — AiRemote

> أُنشئ ضمن W2-8 (2026-11-17). مصادره: `docker/docker-compose.yml` · `packages/server-desktop/lib/backup-manager.js` · `scripts/restore-backup.cjs` · `docs/CI.md` · `docs/gitea-server-install/INSTALL-RUNBOOK.md` · r19 §0.3 · فخاخ 82–85.

---

## 1) التشغيل

### الإنتاج (ويندوز — المسار المشحون)
- المثبّتات في `releases/server-windows/` و`releases/agent-windows/` و`releases/android-agent/`.
- السيرفر الحيّ: `packages/server-desktop` (Electron) على **:3001 TLS**.
- `/health` = مؤشر الحياة: `curl.exe -k -s https://127.0.0.1:3001/health`.
- وكيل ويندوز: مهمة مجدولة مرتفعة (WIN10) أو Run key `--autostart` (WIN11) — **أعد التشغيل بنفس آلية الإقلاع** (فخّ 75).
- `AGENT_CA_CERT` لازم عند الإطلاق اليدوي للوكيل على المضيف (فخّ 76).

### التطوير
```powershell
pnpm install
pnpm --filter @airemote/shared build; pnpm --filter @airemote/ai-engine build; pnpm --filter @airemote/dashboard build
cd packages/server-desktop; pnpm start      # الحيّ
pnpm --filter @airemote/dashboard dev       # اللوحة :5000
```

### Docker (معزول — لا على قاعدة الإنتاج)
```powershell
export JWT_SECRET=$(openssl rand -hex 32)
export CREDENTIALS_KEY=$(openssl rand -hex 32)
docker compose -f docker/docker-compose.yml up -d
```
يرفض الإقلاع بلا المفتاحين. **صورة Docker تبني حالياً الحزمة المرجعية TS لا `server-desktop`** — `docs/ADR/DUAL-SERVER.md`.

---

## 2) المنافذ

| المنفذ | الخدمة | ملاحظة |
|---|---|---|
| **3001** | سيرفر الإنتاج (TLS) | **لا يُوقف بلا أمر المالك**. اختبار W2 على منفذ مثل 3997 |
| 5000 / 5173 | لوحة تطوير | لا على الإنتاج |
| 8080 | Docker dashboard (compose) | تجربة معزولة |
| 3000 | Gitea | `http://localhost:3000` — انظر RUNBOOK الخاص |

---

## 3) فحص الصحة

```powershell
curl.exe -k -s https://127.0.0.1:3001/health        # إصدار السيرفر الحيّ
curl.exe -s http://localhost:3000/api/healthz       # Gitea
node scripts/check-version-consistency.cjs --allow-missing-server
node scripts/release-manifest.js --verify           # البيان: signature OK
```

إن كان `/health` UNREACHABLE: **لا تشغّل شيئاً بلا أمر** — قد يكون الإنتاج موقوفاً عمداً (سجل الحالة كما هي).

---

## 4) أعطال شائعة

| العَرَض | السبب الغالب | التصرف |
|---|---|---|
| `/health` UNREACHABLE | السيرفر متوقف | سجّل كما هو؛ لا تشغّل بلا أمر |
| فشل `git push` Authentication failed | GCM يتقدّم على store helper، أو كلمة المرور فيها `@` بلا URL-encoding، أو الملف CRLF | انظر `docs/gitea-server-install/INSTALL-RUNBOOK.md` §10 |
| `vm-exec` على WIN11 يقطع ~30ث | فخّ 83 (`main.js` مهلة) | مهمة مجدولة + قراءة ملف |
| `push-file` يضرب حد 5/دقيقة | فخّ 84 | فاصل ≥12ث بين ملفات |
| تحديث أندرويد يُسقط a11y | فخّ 82 | تثبيت ← إعدادات ← a11y مربوطة ← التقاط ← إعادة تشغيل |
| لقطة مربّعة 1280×1280 | فخّ 80 (مغلق بكود r19 — لا يُفتح) | `Display.getRealMetrics()` — لا `getDisplayMetrics()` |
| `run-electron-builder.cjs` يفشل | مسافة في المسار | استخدم `npx electron-builder` |
| بوتس الإنتاج بلا JWT/TLS | FATAL مقصود | لا تعطّل الحارس |

---

## 5) النسخ الاحتياطي والاستعادة

### النسخ
- `packages/server-desktop/lib/backup-manager.js` — VACUUM INTO + تدوير 7 نسخ.
- الموضع: `<dataDir>/backups/airemote-YYYYMMDD-HHmmss[-reason].db`
- الإنتاج: `C:\Users\admin\AppData\Roaming\AiRemote-Server\backups\`

### الاستعادة (G5 — مجرَّبة 2026-11-17)
```powershell
# على نسخة TEMP — لا القاعدة الحيّة
node scripts/restore-backup.cjs `
  'C:\Users\admin\AppData\Roaming\AiRemote-Server\backups\airemote-20261114-093008-auto.db' `
  "$env:TEMP\airemote-restore-test"
```

**نتيجة القياس 2026-11-17:** `RESTORED` · integrity ok · **COUNTS {users:3, devices:6, sessions:3498, audit:5966}** · الحجم 32,260,096B · القاعدة الحيّة لم تُلمس (mtime بقي 2026-11-14 23:09).
- `--force` يكتب فوق هدف موجود — لا تستخدمه على الإنتاج.
- `secret.key` **ليست** جزءاً من لقطة القاعدة — انسخها من مجلد البيانات المصدر إن كانت اعتمادات مخزّنة يجب أن تبقى قابلة للفك.
- better-sqlite3 bindings قد تكون غائبة (ignoredBuiltDependencies) — المحوّل يسقط إلى `node:sqlite` تلقائياً (قيِد في مخرَج الاستعادة).

**الدليل:** `outputs/verify-2026-11-17/W2-8/`

---

## 6) تراجع إصدار

- كل بند = التزام واحد؛ الرجوع بـ`git revert`.
- الحزم السابقة تبقى في `releases/` — ثبّت النسخة السابقة منها (لا تعيد بناء قديماً بلا أمر).
- **لا تقلص versionCode أندرويد** (أندرويد يرفض التثبيت إن لم يزد — تعليق build.gradle).
- بعد أي تثبيت أندرويد: فخّ 82 (a11y ثم التقاط).

---


## 7.1) CORS — قياس حيّ (W3-5 · 2026-11-17)

الكود: `server.js:3914` → `origin: false, credentials: true` (نفس الأصل فقط).

قياس على 3001 الحيّ (3.16.19 — نفس الكود في 3.17.0، لم يُلمس):

| الطلب | النتيجة |
|---|---|
| `Origin: https://evil.example` | **لا `Access-Control-Allow-Origin`** — المتصفح يحجب القراءة العابرة ✓ |
| `Origin: http://localhost:5000` (اللوحة) | **لا ACAO** — الإنتاج يخدم اللوحة same-origin (static مدمجة) فلا حاجة CORS عابرة ✓ |
| بلا Origin (same-origin) | 200 طبيعي ✓ |
| HSTS + nosniff | موجودة ✓ |

**الحكم:** سلوك CORS آمن ومقيس فعلياً — نفس الأصل فقط. لو فُتحت اللوحة على منفذ مختلف ستتطلب إعداد origin صريح (قرار مستقبلي بلا تنفيذ).
## 7) TLS

- الإنتاج: TLS إلزامي — البوتس بلا JWT_SECRET أو TLS = FATAL (`e2e-connection` يحميها).
- الشهادة: `…\AiRemote-Server\tls\server.crt` (قراءة فقط).
- `TRUST_PROXY=true` فقط خلف proxy HTTPS.

---

## 8) Gitea

تشغيل/إيقاف/اعتمادات/دفع: `docs/gitea-server-install/INSTALL-RUNBOOK.md`.
بعد كل checkpoint: `git push origin --all` + `--tags`.
