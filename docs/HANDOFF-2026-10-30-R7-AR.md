# حزمة تسليم AiRemote — نهاية جلسة R7 (2026-10-30)

**المستودع:** `D:\autoclaw projects-new\AiRemote` · **الفرع:** `checkpoint/3.8.1-2026-10-26`
**آخر التزام:** `5ffceb5 docs(3.8.35): R7 close-out report` · **الشجرة:** نظيفة · **Git محلي فقط** (لا remote، لا push)
**السيرفر المثبَّت:** **3.8.35** على `https://127.0.0.1:3001` · `/health` ok · `/ready` ready:true · مخطط **v2**

---

## 1) حالة اللحظة (مقيسة عند التسليم)

| المكوّن | القيمة |
|---|---|
| السيرفر المثبَّت | **3.8.35** · Electron 44.3.0 · fastify 5 · محرّك القاعدة `node:sqlite` |
| اللوحة | 3.8.35 (مدمجة) |
| وكيل ويندوز | **3.8.28** على WIN10-VM · WIN11-VM |
| وكيل أندرويد | **3.8.28** (vc24) على TECNO-KL4 · Android-Emulator |
| الأجهزة | الأربعة **online** |
| البطارية | **27/27** · ألوان **0** · تباين **22/22** |
| البيان | `releases/manifest.json` = 3.8.35 · 5 حزم · `--verify` = signature OK |
| النسخ الاحتياطية | 4 في `%APPDATA%\AiRemote-Server\backups` (أحدثها 4.3MB) |
| مجلد التحديث | `%APPDATA%\AiRemote-Server\updates\source` = بيان 3.8.35 + حزم 3.8.32/33/34/35 (أهداف رجوع) |

> **فرق إصدار مقصود:** السيرفر 3.8.35 والوكلاء 3.8.28 — لأن ملفات الوكلاء لم تتغيّر منذ 3.8.28.
> `AGENT_VERSION` في `server.js` = `3.8.28` عمداً (اسم حزمة الوكيل القابلة للتنزيل، ليس إصدار السيرفر).

---

## 2) ما أُنجز في هذه الجلسة

| الإصدار | الشريحة | الدليل |
|---|---|---|
| 3.8.27 | توحيد الإصدار على الأجهزة الأربعة (بعد كشف موضع تاسع: `AGENT_VERSION` كان 3.8.7) | `outputs/verify-2026-10-30/unify-3.8.27/` |
| 3.8.28 | **قصّ رباعي الحواف** في أندرويد (كان الشريط الأسود يظهر يساراً عند التدوير) | `outputs/verify-2026-10-30/r7-android-insets/` |
| 3.8.28 | `/ready` + `/metrics` | `r7-android-insets/` |
| 3.8.29 | نسخ احتياطي مجدول + استعادة مُختبرة (VACUUM INTO + تحقق) | `outputs/verify-2026-10-30/r7-backup/` |
| 3.8.30 | هجرات مخطط `up/down` على `PRAGMA user_version` | `outputs/verify-2026-10-30/r7-migrations/` |
| 3.8.31 | تحديث موقَّع من مجلد داخلي + تراجع تلقائي | `outputs/verify-2026-10-30/r7-updates/` |
| 3.8.32 | سياسة احتفاظ (30/180 يوماً) بتنبيه مسبق | `outputs/verify-2026-10-30/r7-retention/` |
| 3.8.35 | تنبيه الفشل المتكرر + **Runbook مُجرَّب** + 3 إصلاحات في المحدّث | `outputs/verify-2026-10-30/r7-closure/` |

**R7 مغلقة** ببوابتها الأربع: استعادة تعيد الأجهزة · ترقية من 3.8.21 تعمل (30s) ثم 3.8.35 (31s) · `/metrics` يعطي الأرقام · Runbook اجتاز أربعة تمارين.

---

## 3) ما تبقّى

### R8 — ميزات المنافسة (لم يبدأ)
تعدد الشاشات (اختيار/تبديل/عرض مركّب) · الحافظة المتزامنة باتجاه واحد + مفتاح عكسي · ليزر وتعليقات · قفل الإدخال المحلي وتعتيم الشاشة · علامة مائية للمتصل · جلسات في نوافذ مستقلة (البنية موجودة عبر `/view/`) · اختصارات موثّقة · سجل جلسات قابل للبحث والتصدير · مكافئات أندرويد (حافظة، SAF، إشعارات، دردشة عائمة) · `docs/ANDROID-LIMITATIONS.md`.

### R9 — التحقق والإطلاق (لم يبدأ)
مصفوفة §7 كاملة · حمل بسقف السعة · مراجعة أمنية داخلية · ترحيل تجريبي 5–10 مستخدمين · حزم وملاحظات إصدار + دليل مستخدم ومدير · تمرين رجوع.

### دين تقني صغير
- `node:sqlite` افتراضياً وإزالة `better-sqlite3` (معلّق بشرط أسبوع استقرار؛ المحوّل ما زال يسقط تلقائياً ويطبع `[db] … using node:sqlite`).
- `docs/PLAN-STATUS.md` قديم (يصف 3.8.12) — يحتاج تحديثاً.
- المحاكي: يحتاج إعادة منح التقاط الشاشة يدوياً بعد كل تثبيت APK.
- اختبار النقر عبر البثّ (تحقق إحداثيات اللمس) لم يُنفَّذ بنقرة حقيقية (يحتاج تفعيل «تحكم» على الجهاز).

---

## 4) البيئة والأدوات (مسارات مؤكدة)

| العنصر | المسار |
|---|---|
| المستودع | `D:\autoclaw projects-new\AiRemote` |
| أدوات البناء | `D:\autoclaw projects\offline-build-tools\android-toolchain` → `jdk` · `sdk\build-tools\34.0.0` · `sdk\platform-tools\adb.exe` · `gradle` · `android-init.gradle` |
| Electron 44 | `packages\server-desktop\node_modules\electron\dist` (واردة) · نسخة احتياطية `.cache\electron44` |
| Gradle cache | `.cache\gradle-home` |
| Chrome (CDP) | `C:\Program Files\Google\Chrome\Application\chrome.exe` |
| مفتاح الإصدار | `C:\Users\admin\AppData\Roaming\AiRemote\signing\airemote-release.jks` (alias `airemote`) — **لا تُطبع كلمته** |
| بيانات المختبر | `C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json` — **تُقرأ ولا تُطبع** |
| بيانات السيرفر | `C:\Users\admin\AppData\Roaming\AiRemote-Server\{airemote.db, tls\, backups\, updates\, secret.key}` |
| التثبيت | `C:\Users\admin\AppData\Local\Programs\AiRemote Server\` |

### أوامر أساسية

```powershell
# البطارية (27 خطوة) والبوابات
cd 'D:\autoclaw projects-new\AiRemote'
node scripts/scan-ui-colors.cjs      # 0
node scripts/check-contrast.cjs      # 22/22
node scripts/verify.js               # 27/27

# لوحة + حزمة السيرفر
pnpm --filter @airemote/dashboard build
node packages/server-desktop/scripts/copy-dashboard.js
node packages/server-desktop/scripts/bundle.js
cd packages\server-desktop; $env:CSC_IDENTITY_AUTO_DISCOVERY='false'; pnpm exec electron-builder --win --x64

# APK (vc يرفع في build.gradle)
$tc='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME="$tc\jdk"; $env:ANDROID_HOME="$tc\sdk"; $env:GRADLE_USER_HOME='D:\autoclaw projects-new\AiRemote\.cache\gradle-home'
& "$tc\gradle\bin\gradle.bat" assembleRelease --init-script "$tc\android-init.gradle" -p 'D:\autoclaw projects-new\AiRemote\packages\android-agent'
# التوقيع
$env:KS_PW=(Get-Content 'C:\Users\admin\AppData\Roaming\AiRemote\signing\keystore-password.txt' -Raw).Trim()
& "$tc\sdk\build-tools\34.0.0\apksigner.bat" sign --ks "...airemote-release.jks" --ks-key-alias airemote --ks-pass env:KS_PW --out releases\android-agent\AiRemote-Agent-Android-v<ver>.apk <unsigned>
Remove-Item Env:\KS_PW

# أدوات تشغيلية
node scripts/release-manifest.js [--verify]
node scripts/migrate.cjs --db <path> --status|--up|--down
node scripts/restore-backup.cjs <backup.db> <targetDir> [--force]
node scripts/boot-check.cjs            # BOOT_DB + BOOT_PORT + BOOT_EMAIL/PASS + BOOT_SCHEME=http
node scripts/push-file.cjs <device> <local> <remote>
node scripts/remote-exec.cjs <device> "<cmd>"
```

**أدوات صغيرة كُتبت هذه الجلسة (في مجلد العمل، وليست في المستودع):**
`capture-frames.cjs` + `compose_frames.py` (تجميع حزم WebP في صورة وقياس الحواف) · `devinfo.cjs` (قائمة الأجهزة) · `db-version.cjs` · `update-drill.cjs` · `helper-drill.cjs` · `cert-drill.cjs` · `metrics-check.cjs` · `backup-live-check.cjs` · `retention-live-check.cjs` · `android-frame-check.cjs` · `save-frame.cjs` · `click-test.cjs`.
نسخ منها محفوظة داخل `outputs/verify-2026-10-30/*/`.

---

## 5) الأجهزة (للسكربتات)

| الاسم | ID | ملاحظة |
|---|---|---|
| WIN10-VM | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | 3.8.28 · 192.168.0.176 |
| WIN11-VM | `d147684b-2451-4418-a628-86f11aa66a4e` | 3.8.28 · 192.168.0.175 |
| TECNO-KL4 | `07f8ae91-5b64-41d9-97df-ce649772b0d3` | 3.8.28 · vc24 · adb `12927374CM001019` |
| Android-Emulator | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` | 3.8.28 · vc24 · `emulator-5554` |

**بعد كل تثبيت APK:** يُلغى إذن الالتقاط. على TECNO: افتح التطبيق ← «معالج التهيئة (كل الصلاحيات)» (360,356) ← «فتح الإعداد» لصف «التقاط الشاشة» (172,867) ← «البدء الآن» (174,1267) — بانتظار ثانيتين بين النقرات. على المحاكي تُلغى النافذة تلقائياً؛ `adb shell appops set com.airemote.agent PROJECT_MEDIA allow` يساعد لكن التطبيق يحتاج المرور بالمعالج.

---

## 6) إعدادات المشروع الافتراضية (كما هي الآن)

| المفتاح | الافتراضي | ملاحظة |
|---|---|---|
| `AIREMOTE_DB` | غير مضبوط | `sqlite3` أو `node`؛ يسقط تلقائياً إلى `node:sqlite` عند اختلاف ABI |
| `AIREMOTE_BACKUP_DIR` | `<dataDir>/backups` | احتفاظ 7 · دورة 24h (`AIREMOTE_BACKUP_KEEP` · `AIREMOTE_BACKUP_INTERVAL_HOURS` · `AIREMOTE_BACKUP_DISABLE=1`) |
| `AIREMOTE_UPDATE_DIR` | `<dataDir>/updates/source` | مجلد التوزيع (بيان + توقيع + حزم) |
| `config.retention` | true | تسجيلات 30 · تدقيق 180 · تنبيه 3 (`config.recordingsDays` …) |
| عتبة التنبيه | 10 أخطاء 5xx / 5 دقائق · تهدئة 30 دقيقة | `config.alertThreshold` … |
| مخطط القاعدة | `user_version = 2` | الأساس 1 = مخطط 3.8.x · 2 = فهارس |

---

## 7) الفخاخ المؤكدة (كل واحدة كلّفت وقتاً فعلاً هذه الجلسة)

1. **`taskkill` بلا `/F` لا يُنهي السيرفر** (رسالة إغلاق النافذة تُتجاهل). استخدم `/F`.
2. **`$env:APPDATA` فارغ في بعض الأصداف** ⇒ المسار ينهار إلى `D:\...`. استخدم المسار المطلق `C:\Users\admin\AppData\Roaming`.
3. **مسار أدوات البناء** فيه `projects\offline-build-tools` (شرطة مائلة عكسية ثم اسم يبدأ بـ`offline`) — كتابته `projects-offline` تُنتج «not recognized».
4. **أدوات الملفات مقيّدة بمجلد العمل**: أي تعديل داخل `D:\autoclaw projects-new\AiRemote` يُكتب عبر سكربت Node أو PowerShell، لا عبر أداة الكتابة.
5. **PowerShell 5.1 يقرأ UTF-8 كـANSI** إن لم تحدّد `-Encoding` ⇒ عربية مشوّهة. للتعديل الآمن: `fs.readFileSync(p,'utf8')` في Node، أو `[System.IO.File]::WriteAllText(..., UTF8Encoding($false))`.
6. **أسطر CHANGELOG/PROJECT_STATE تختلف (LF/CRLF)** ⇒ اقرأ الملف واحسب `eol` قبل الاستبدال.
7. **`copy-dashboard` يغيّر `packages/server-desktop/static` المتتبَّع** — دعه جزءاً من التزام الإصدار (هذا هو التقليد)، لا تُرجعه بـ`checkout`.
8. **`server.bundle.js` هو ما يُحزم**: بعد أي تعديل في `server.js` أو `lib/*` أعد `bundle.js` قبل `electron-builder`.
9. **التحديث**: المساعد يجب أن يعمل بصورة محايدة (`updater.exe`) وإلا `taskkill /IM` يقتله · فحص الصحة على شهادة ذاتية يحتاج تجاهل التحقق محلياً · لا تُورّث `ELECTRON_RUN_AS_NODE` للتطبيق المُقلَع.
10. **`\d` في قوالب JS** تفقد الشرطة عند التوليد ⇒ صيغ regex تُكتب بـ`String.raw`.
11. **الهجرات**: لا تُعِد استخدام اسم فهرس موجود في المخطط القديم (`idx_sessions_device`) وإلا حذفه `down`.
12. **اختبارات تُثبّت رقم الإصدار** تنكسر مع كل إصدار — اقرأه من `package.json`.
13. **أندرويد**: الشريط الأسود يتبع الدوران (محور الشريط لا الأعلى فقط) · عمقه الحقيقي 106px في البورتريه وليس 72 · أعد القياس عند كل جلسة لا عند الدوران فقط.
14. **الاختبارات تحتاج Electon binary**: `electron.exe <test> ` مع `ELECTRON_RUN_AS_NODE=1` (better-sqlite3 ABI 119 لا يعمل على Node 24؛ المحوّل يسقط إلى `node:sqlite`).

---

## 8) تحقق الاستئناف (ابدأ به)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -3; git status --short
node scripts/scan-ui-colors.cjs     # 0
node scripts/check-contrast.cjs     # 22/22
node scripts/verify.js              # 27/27
curl.exe -sk https://127.0.0.1:3001/health   # 3.8.35
curl.exe -sk https://127.0.0.1:3001/ready    # ready:true
node scripts/list-devices.cjs       # 4 online
```

---

## 9) نقطة الاستئناف

**R7 مغلقة على 3.8.35. التالي R8.** اقتراحي: ابدأ بـ**تعدد الشاشات** (أكبر أثر: اختيار/تبديل/عرض مركّب) أو **الحافظة المتزامنة** (الأرخص إثباتاً). معيار كل شريحة كما في §7 من هذا المستند: بوابات خضراء + دليل في `outputs/` + `PROJECT_STATE` و`CHANGELOG` + التزام واحد.