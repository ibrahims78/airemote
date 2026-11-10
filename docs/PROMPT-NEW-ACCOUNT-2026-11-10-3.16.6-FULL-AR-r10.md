# استئناف AiRemote — 2026-11-10 · الإصدار **3.16.6** — نسخة **r10**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-08-3.16.0-FULL-AR-r9.md` وكل ما قبله.**
> كل رقم هنا مقيس في جلسة 2026-11-10 على السيرفر المثبَّت نفسه، لا منقولًا من وثيقة.

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا ويُحترم حرفيًا

**قِف هنا. لا تنفّذ أي إجراء — لا بناء، لا تثبيت، لا تعديل ملف، لا تشغيل سكربت يكتب — حتى يقول المالك صراحةً «ابدأ» أو «نفّذ البند كذا».**

- ترخيصك الحالي: **قراءة وتحقّق فقط** (قراءة ملفات، `git log`، `/health`، `/api/devices`، تشغيل بوابات القراءة).
- كل ما في هذا الملف **منجَز ومُثبَّت**. لا شيء قيد التنفيذ. لا بناء جارٍ. لا تثبيت معلّق.
- إن وجدت رقمًا مختلفًا عمّا هنا: **لا تُصلح شيئًا**. أبلِغ المالك بالفرق وانتظر.
- أي تعديل قبل الإذن = خرق، حتى لو بدا إصلاحًا واضحًا أو سطرًا واحدًا.

---

## 0.1) الحالة المقيسة الآن (2026-11-10)

| البند | القيمة | كيف تُتحقَّق |
|---|---|---|
| الفرع | `feat/screen-unify-3.13.0` | `git branch --show-current` |
| آخر التزام | **`10de8ab`** | `git rev-parse --short HEAD` |
| التزامات منذ r9 (`b8dd3e4`) | **95** | `git log --oneline b8dd3e4..HEAD \| Measure-Object -Line` |
| `VERSION` | **3.16.6** | `Get-Content VERSION` |
| `versionCode` أندرويد | **97** | `packages/android-agent/app/build.gradle` |
| السيرفر المثبَّت | **3.16.6** على **3001** (TLS) | `curl.exe -k -s https://127.0.0.1:3001/health` |
| معاينة Vite | **5000** (dev · pid 44300 وقت القياس) | `Get-NetTCPConnection -LocalPort 5000` |
| بوابة التحقق | **56/56 PASSED** | `node scripts/verify.js` |
| توافق الإصدار | **PASS** في كل المصادر | `node scripts/check-version-consistency.cjs` |
| الحزمة | `AiRemote-Server-Setup-v3.16.6-x64.exe` — **152.04 MB** · zip **202.34 MB** | `releases/server-windows/` |
| الأسطول | **5 أجهزة · 4 متصلة** (TAB16 offline) | `/api/devices` |
| المستخدمون | **3** كلهم `admin` (لا حساب مؤقت) | `/api/users` |
| المهام المجدولة | **0** | `/api/tasks` |

### 0.1.1) أول 10 دقائق — تحقّق ثم قف

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git rev-parse --short HEAD                              # 10de8ab
git log --oneline b8dd3e4..HEAD | Measure-Object -Line   # 95
Get-Content VERSION                                      # 3.16.6
curl.exe -k -s https://127.0.0.1:3001/health             # version 3.16.6 · port 3001 · tls true
node scripts/verify.js                                   # ALL VERIFICATION STEPS PASSED (56/56)
node scripts/check-version-consistency.cjs               # PASS كل المصادر تحمل 3.16.6
node scripts/release-manifest.js --verify                # signature OK · all artifacts match
```

**بعدها توقّف.** لا تُصلح أي فرق، ولا تُشغّل بناءً «للتأكد».

---

## 0.2) الوصول والحسابات (لا قيم سرّية داخل المستودع)

| ما | أين / كيف |
|---|---|
| حساب اللوحة | `admin@airemote.local` (دور `admin`) — **كلمة المرور عند المالك فقط** |
| حسابان احتياطيان | `admin@airemote.io` · `lab-probe@local` |
| الحساب المؤقت `ui-audit@local` | **حُذف نهائيًا** (204) في 3.16.5 — لا تحاول استخدامه |
| قاعدة البيانات | `%APPDATA%\AiRemote-Server\airemote.db` (قراءة فقط) |
| مفاتيح التوقيع | `secrets\airemote-release.jks` + `secrets\keystore-password.txt` — لا تُنسخ |
| مفتاح AI | محفوظ في قاعدة السيرفر (49 محرفًا) — لا يُطبع ولا يُكتب في ملف |
| بوت Telegram | التوكن في إعدادات السيرفر · المحادثة `1029428155` |

**قاعدة صارمة:** أي سرّ يُقرأ من البيئة (`AEMAIL` · `APASS` · `AI_KEY` · `TG_TOKEN` · `TG_CHAT`) أو عند المالك. لا يُكتب في مستودع ولا في وثيقة ولا في التزام.

**لأدوات الفحص:** تحتاج ضبط `AEMAIL` و`APASS` في البيئة، لأن السكربتات القديمة كانت تستخدم الحساب المؤقت المحذوف.

---

## 0.3) البيئة

- Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Electron: `packages\<pkg>\node_modules\electron\dist\electron.exe`
- adb: `D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe`
- JDK/SDK/gradle/apksigner: `D:\autoclaw projects\offline-build-tools\android-toolchain\{jdk, sdk, gradle\bin\gradle.bat, sdk\build-tools\34.0.0\apksigner.bat}`
- VMware: `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe`
- VMs: `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` · `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx`
- LDPlayer: `D:\LDPlayer\LDPlayer9\ldconsole.exe`
- مجلد الأدوات الافتراضي: `D:\autoclaw projects\offline-build-tools` · لقطة هذه الجلسة: `…\airemote-lab\session-2026-11-10`

---

## 0.4) الأجهزة (مقيسة الآن)

| الجهاز | الحالة | المعرّف | ملاحظة |
|---|---|---|---|
| Android-Emulator | **online** | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` | عمود فقري لكل اختبارات التنفيذ |
| TECNO-KL4 | **online** | `07f8ae91-5b64-41d9-97df-ce649772b0d3` | وكيل أندرويد v97 · يطلب إذن MediaProjection بعد كل تثبيت |
| TAB16-USB | **offline** | `7fc54b40-e7c1-4db6-9f55-78f377c4f4ad` | كان online في جلسات سابقة |
| WIN10-VM | **online** | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | يحتاج دفعة إقلاع بعد كل ترقية |
| WIN11-VM | **online** | `d147684b-2451-4418-a628-86f11aa66a4e` | |

**قدرات مشتركة:** `pty` · `shell` · `fs` · `screenControl` · `clipboard` · `chat` — وويندوز يزيد `multiMonitor`.

---

## 0.5) إعدادات التطبيق المحفوظة الآن (هي «الحالة» التي يجب ألّا تُفقد)

| الإعداد | القيمة المخزّنة |
|---|---|
| مزوّد الذكاء الاصطناعي | **`zai`** · النموذج **`glm-4.7-flash`** · المفتاح محفوظ (49) · `hasKey: true` |
| إشعارات Telegram | **مفعّلة** · توكن بوت محفوظ (46) · محادثة **`1029428155`** |
| مفاتيح الأحداث | `online: true` · `offline: true` · `chat: true` · `task: true` |
| المهام المجدولة | **0** (نظيفة — كل مهام الاختبار حُذفت) |
| 2FA | **معطّل** لكل المستخدمين |
| الأجهزة | 5 (بعد حذف جهازَي اختبار `TG-TEST-*`) |
| المظهر | الوضع النهاري (كما في لقطة التسليم) |

### 0.5.1) نقطة توقّف دقيقة
- آخر عمل: إصدار **3.16.6** وتثبيته، ثم تصدير لقطة الأدوات إلى مجلد `offline-build-tools`.
- آخر قياس: بوابة **56/56** · إصدار **3.16.6** · أسطول **5/4** · مهام **0**.
- **لا شيء قيد التنفيذ.**

---

## 0.6) ما أُنجز في هذه الجلسة (3.16.1 → 3.16.6)

| الإصدار | المحتوى | الالتزامات |
|---|---|---|
| 3.16.1–3.16.4 | إصلاحات الحائط/البث · تثبيت مقاس إطار TECNO (v97) · صفحات الأجهزة/المساحة/الجلسات | `c82f467` … `f7245ad` |
| **3.16.5** | Telegram: مسار اختبار مفقود · `chat_id` صحيح · إرسال مباشر عند الاتصال/الانقطاع · قاعدة كلمة مرور «إضافة مستخدم» (12) · شارة مزوّد AI · إصلاح نمطين سطريين (بوابة 51) · رفع كل مصادر الإصدار | `e1da712` · `45999b1` · `dd8c0f4` · `363799d` · `c4fc854` · `9ae5168` |
| **3.16.6** | نتيجة المهمة المجدولة تصل Telegram (حدث `task` + مفتاح رابع في الإعدادات) | `f0879d8` |

### 0.6.1) العيوب الحقيقية التي اكتُشفت وأُصلحت (دليل كل عيب)
1. **مسار `POST /api/settings/telegram/test` لم يكن موجودًا** في `packages/server` → زر «اختبار» يفشل دائمًا.
2. **`chat_id` خاطئ** (`718040496615`) → `400 chat not found` · `getUpdates = 0` → الصحيح `1029428155`.
3. **إشعار اتصال/انقطاع كان مشروطًا بوجود قاعدة تنبيه** (`telegramEvent` داخل `for (const rule of rules)`) → لا إشعار أبدًا بلا قاعدة.
4. **المُجدِّل لم يكن ينفّذ أي مهمة تلقائيًا**: `taskNextDue` تحسب `now + interval` عند غياب `last_run_at`، فلا يتحقق `now >= due` أبدًا (مهمة «كل دقيقة» بلا تنفيذ 200 ثانية) → الأساس صار `created_at` بتوقيت UTC + نبضة **15 ثانية**.
5. **شارة مزوّد AI في الواجهة** كانت `OpenAI · gpt-4o` بينما السيرفر `zai` (خلل مزامنة بعد إعادة تركيب اللوحة بمفتاح الجهاز) → `CONFIG-SYNC`.
6. **رسالة مهلة التحقق** تقول «9 ثوانٍ» والمهلة الفعلية 30 → صُحّحت.
7. **نموذج إضافة مستخدم** يعلن `(8+)` والتحقق يرفض أقل من 12 → وُحّد + نص دائم.
8. **نمطان سطريان** في `ScreenViewer` يُفشلان البوابة 51 → أصناف `.sv-more-menu` / `.sv-more-scroll`.
9. **`releases/manifest.json`** كان 3.16.0 → 3.16.5 ثم 3.16.6.
10. **تشويه النص العربي في رسائل Telegram** لم يكن في السيرفر (0 × `U+FFFD`، 0 × `Ø/Ù`) بل في سكربت اختبار مرّ عبر PowerShell بترميز ANSI.

### 0.6.2) ما اختُبر بالكامل وأُثبت
| الميزة | الإثبات |
|---|---|
| إشعارات Telegram (4 أحداث) | `200` لكل حدث · تعطيل `chat` ⇒ `400 not sent` · رسائل عربية مقروءة وصلت («وصلت سليمة» من المالك) |
| دورة وكيل حقيقية | `agent:register` → `server:registered` · `agent:screen_chat` · إغلاق ⇒ `offline` |
| الذكاء الاصطناعي | حفظ/قراءة `200` · محادثة **«تم»** · بث 25 مقطعًا · `429` عند ازدحام المزوّد (ليس عيبًا) |
| 2FA | setup (سر 16 + QR PNG) → رفض رمز خاطئ `400` → تفعيل `200` → دخول يطلب TOTP → verify `401/200` → تعطيل `200` |
| المهام المجدولة | CRUD + رفض `400` + `exec` على المحاكي `exit=0` + **تنفيذ تلقائي عند +75s و+135s** |
| شعار الترحيل | جلسة `view` حقيقية → `active` → الشارة «قطع · عرض · LIVE · admin@airemote.local» → إغلاق `200` |
| الواجهة | 4 تبويبات إعدادات · 6 أقسام في «عام» · لقطات في `ui-shots/` |

---

## 1) ما أُغلق ولا يُعاد فتحه

| البند | الدليل |
|---|---|
| الموجة P0 الخمسة (fs/pty · SFTP · الاعتمادات · `/files` · سجل الجلسات) | r9 §1 — كلها مثبَّتة |
| العقد 186 نوعًا · بوابتا P1-4 | `4914c96` · `7d9cc37` |
| عيب زر «بدء مع ويندوز» لأندرويد | `13384b5` |
| Telegram: مسار الاختبار + `chat_id` + الإرسال المباشر | `e1da712` · `45999b1` · `dd8c0f4` |
| قاعدة كلمة المرور في «إضافة مستخدم» | `363799d` |
| شارة مزوّد AI | `c4fc854` |
| المُجدِّل التلقائي + رسالة المهلة | `9c1e2a8` |
| إشعار نتيجة المهمة | `f0879d8` |
| حذف الحساب المؤقت | `204` ثم دخول `401` |
| بوابة 51 (نمطان سطريان) | `9ae5168` |

---

## 2) الفخاخ المثبتة — محدَّثة (القديمة الباقية + الجديدة)

### قديمة ما زالت تصدق
1. **السيرفر المثبَّت يخدم `app.asar`** الذي يحمل `server.bundle.js` (esbuild لـ`server-desktop/server.js`).
2. **`packages/server` (TS) لا يُشحن في أي حزمة** — أي إصلاح فيه يغيّر صفرًا على الجهاز المثبَّت.
3. **قفل النسخة الواحدة في الوكيل** — اقتل أي `AiRemote Agent` قبل أي مسبار.
4. **`versionCode` يزيد يدويًا** (97 الآن) — أندرويد يرفض التثبيت إن لم يزد.
5. **`apksigner` يحتاج `JAVA_HOME` في كل صدفة**.
6. **NSIS يمسح المجلد ~20–25 ثانية** — انتظر قبل الحكم بالفشل.
7. **`/api/auth/login` محدود 5/دقيقة** — تشغيل اختبارين متتاليين يعطي `429` كاذبًا.
8. **`MediaProjection` يسقط بإعادة تثبيت APK** ولا يُمنح بـadb.
9. **مسار العارض `wss://…/screen?ticket=…`** لا `/ws`.
10. **`vmrun runProgramInGuest` لا يعيد stdout** — اكتب سجلًّا في الضيف ثم انسخه.

### جديدة — تعلّمتها هذه الجلسة (كل واحدة كلّفت وقتًا فعليًا)
11. **لا تكتب ملفًا يحتوي عربيًا عبر `Set-Content`/`Get-Content` في PowerShell 5.1** — يقرأ ANSI فيحوّل `رسالة` إلى `Ø±Ø³Ø§Ù„Ø©`. هذا سبب «الكلمات غير المفهومة» في Telegram. اكتب UTF-8 من Node أو من أداة كتابة UTF-8.
12. **`.ps1` يحتوي عربيًا يجب أن يُحفظ بـBOM** وإلا يفشل تحليله في PowerShell 5.1 (`The string is missing the terminator`).
13. **`chat_id` ≠ معرّف المستخدم**: يُستخرج من `getUpdates` بعد أن يضغط المالك **Start**؛ لا يمكن للبوت بدء محادثة.
14. **مخزنان للإعدادات**: السيرفر المثبَّت يخزّن مفاتيح عالمية في جدول `settings`، و`packages/server` يخزّن لكل مستخدم تحت `user:<id>`. كل مُرسِل يقرأ من مخزنه — لا تخلط.
15. **SQLite يكتب `datetime('now')` بلا منطقة زمنية** — أضف `Z` قبل `new Date()` وإلا انزاح الحساب 3 ساعات.
16. **ترتيب البناء**: `packages/dashboard` أولًا (vite build) ثم `server-desktop` (`bundle` + `copy-dashboard` + electron-builder). لو عكست، تُشحن واجهة قديمة.
17. **`node --check` لا يكفي**: بعد كل تعديل شغّل `tsc --noEmit` للواجهة و`node --check` للسيرفر.
18. **مُحدِّدات DOM لا تعتمد على نص عربي** (يتشوّه عبر الأدوات) — استخدم `type=submit` أو `data-*`.
19. **لا يمكن للمستخدم حذف نفسه** (`Cannot delete yourself` = 400) — احذف من حساب مسؤول آخر.
20. **`scripts/verify.js` بوابة 51 ترفض أي `style={{}}` ثابت** — استخدم صنف CSS.
21. **`check-version-consistency` يقرأ `/health` الحيّ** — فلا يكتمل إلا بعد تثبيت النسخة الجديدة.
22. **حقل `relay` يُقرأ من `/api/devices`**؛ `null` يعني «لا جلسة» لا «عيب».

---

## 3) الأدوات

### 3.1) في المستودع (بوابات)
| الأداة | الدور |
|---|---|
| `scripts/verify.js` | البطارية — **56 خطوة** |
| `scripts/check-version-consistency.cjs` | كل المصادر = 3.16.6 (يقرأ `/health` أيضًا) |
| `scripts/check-message-contract.cjs` | بوابة 54 — نوع مستخدم بلا إعلان يفشل |
| `scripts/check-route-roles.cjs` | بوابة 55 — مسار كتابة بلا حراسة يفشل |
| `scripts/check-message-pairs.cjs` | بوابة 56 — رسالة بلا معالج تفشل |
| `scripts/check-shipped-bytes.cjs` | يفتح `app.asar` المثبَّت ويبحث عن بصمات الإصلاح |
| `scripts/release-manifest.js` | توليد/توقيع البيان · `--verify` |
| `tools/install-agent.bat` | ترقية صامتة داخل الضيف |

### 3.2) لقطة الأدوات المستقلة — **جديدة هذه الجلسة**
`D:\autoclaw projects\offline-build-tools\airemote-lab\session-2026-11-10`

| الأداة | الغرض |
|---|---|
| `bin\shot.cjs` | صورة صفحة بعد تسجيل الدخول (`node bin\shot.cjs /devices devices`) |
| `bin\ui-probe.cjs` | تقييم تعبير JS داخل الصفحة |
| `bin\ai-verify.cjs` | إعدادات AI + محادثة + بث |
| `bin\twofa-verify.cjs` | دورة 2FA كاملة مع تنظيف في `finally` |
| `bin\tasks-verify.cjs` | CRUD + تشغيل + `--watch` لمراقبة المُجدِّل |
| `bin\telegram-verify.cjs` | 4 أحداث + احترام مفاتيح التعطيل |
| `bin\relay-verify.cjs` | جلسة ترحيل حقيقية وقراءة `relay` |
| `bin\agent-ws-probe.cjs` | دورة وكيل عبر WebSocket |
| `bin\release-check.cjs` | بوابات + `/health` + بصمة الأصل + الأسطول |
| `bin\legacy\` | 8 سكربتات الجلسة الأصلية (مرجع) |

التشغيل: `.\run.ps1 release-check` بعد ضبط `env\session.local.ps1` (نسخة من `session.example.ps1`).
الملف يحتوي `README-AR.md` · `docs\TOOLS-MAP-AR.md` · `MANIFEST.csv` · `CHECKSUMS-SHA256.txt` (24 ملفًا، 0 اختلاف).

---

## 4) ما بقي — كله يحتاج قرار المالك (لا يُنفَّذ بلا كلمة)

| البند | الحالة | يحتاج |
|---|---|---|
| شعار الترحيل: نص RTL مختلط (`قطع · عرض · LIVE`) | وظيفي، غير جميل | قرار تجميلي |
| TAB16-USB offline | خارج الخدمة الآن | إعادة توصيل/تشغيل من المالك |
| MediaProjection على TECNO بعد كل APK | سلوك أندرويد | نقرة على الجهاز |
| تحديث تلقائي للوكلاء | غير موجود (لا `autoUpdater`) | قرار معماري |
| جسر أسماء fs/pty القديمة | باقٍ عمدًا | قرار (خطر كسر وكلاء 3.14.3) |
| نقل `runTask`/`taskNextDue` إلى وحدة مستقلة | داخل `server.js` | قرار هندسي |
| `relay` شعار للأسطول كله | اختُبر على WIN10 فقط | اختبار موسّع |

---

## 5) أوامر جاهزة (لا تُشغَّل بلا إذن)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'

# تحقّق فقط
node scripts/verify.js
node scripts/check-version-consistency.cjs
node scripts/release-manifest.js --verify

# بناء حزمة السيرفر (الترتيب مهم — فخ 16)
cd packages\dashboard; npm run build
cd ..\server; npm run build
cd ..\server-desktop; $env:CSC_IDENTITY_AUTO_DISCOVERY='false'; npm run build:win:nodownload

# تثبيت (فخ 6)
Get-Process 'AiRemote Server' -ErrorAction SilentlyContinue | Stop-Process -Force
& 'releases\server-windows\AiRemote-Server-Setup-v<v>-x64.exe' /S
Start-Sleep -Seconds 25
Start-Process 'C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe'
curl.exe -k -s https://127.0.0.1:3001/health

# معاينة الواجهة (تبقى على 5000)
cd packages\dashboard; .\node_modules\.bin\vite.cmd --port 5000

# لقطة الأدوات
cd 'D:\autoclaw projects\offline-build-tools\airemote-lab\session-2026-11-10'
Copy-Item env\session.example.ps1 env\session.local.ps1   # املأ APASS عندك
.\run.ps1 release-check
```

---

## 6) بروتوكول التنفيذ

1. **قِس أولًا** — لا تثق بأرقام هذا الملف بلا تحقّق (§0.1.1).
2. **تعديل واحد = التزام واحد** برسالة إنجليزية تشرح **السبب** لا التغيير فقط.
3. إن ساء الرقم: `git checkout` فورًا.
4. الدليل المقيس (قبل/بعد) في الرد وفي `ui-shots/` أو `docs/`.
5. **لا أسرار** في المستودع ولا في الالتزامات ولا في المخرجات.
6. **لا تلمس عقد API** ولا تصميم سطح بلا قرار مالك.
7. **أي تغيير في محتوى الحزمة يرفع الرقم** في كل المصادر الثمانية + `manifest.json`.
8. **بوابة جديدة تحتاج إثبات عضّ** + خط أساس بأسباب.
9. **⛔ لا تنفّذ شيئًا بلا إذن المالك.**

---

## 7) خريطة ملفات الجلسة

| الملف | الدور |
|---|---|
| `docs/RELEASE-3.16.5-AR.md` | ملاحظات إصدار 3.16.5 |
| `docs/RELEASE-3.16.6-AR.md` | ملاحظات 3.16.6 + دليل شعار الترحيل |
| `docs/TELEGRAM-ALERTS-2026-11-10-AR.md` | تقرير إشعارات Telegram والعيوب الخمسة |
| `docs/VERIFY-AI-2FA-TASKS-2026-11-10-AR.md` | فحص AI و2FA والمهام (API + واجهة) |
| `docs/PAGES-INVENTORY-2026-11-09-AR.md` | جرد الصفحات |
| `docs/UI-AUDIT-2026-11-08-OVERVIEW-AR.md` | تدقيق الواجهة (§10 الجولة 7) |
| `docs/AGENT-WIN-RESOLUTION-2026-11-09-AR.md` | دقة وكيل ويندوز |
| `docs/RELEASE-3.16.1-AR.md` | أول إصدار في السلسلة |
| `ui-shots/` | لقطات الإثبات (منها `settings-v3166.png` · `devices-relay.png`) |
| `outputs/verify-2026-11-08/` | أدلة جلسة r9 |
| `…\offline-build-tools\airemote-lab\session-2026-11-10\` | لقطة الأدوات + التوثيق + البصمات |

---

## 8) ديون معروفة (لا تُخفى)

| الدين | الأثر |
|---|---|
| `packages/server` (TS) لا يُشحن | أي إصلاح فيه لا يظهر في الحزمة — يجب تكراره في `server-desktop/server.js` |
| `runTask` و`taskNextDue` داخل `server.js` | لا اختبار وحدة؛ يُختبر فقط عبر `tasks-verify.cjs --watch` |
| شعار الترحيل مختلط الاتجاه | تجميلي |
| TAB16 offline | الأسطول 4/5 |
| MediaProjection | يحتاج نقرة مالك بعد كل APK |
| لا تحديث تلقائي للوكلاء | أي وكيل قديم يبقى قديمًا حتى ترقية يدوية |
| `bin\legacy\*` في لقطة الأدوات | محدّدات DOM تاريخية قد لا تطابق الواجهة الحالية |

---

## 9) تسليم الحساب الجديد — ماذا تفعل بالضبط

1. اقرأ §0 و§0.1 فقط.
2. نفّذ أوامر §0.1.1 للتحقق (قراءة فقط).
3. قارن الأرقام. إن طابقت: **أبلِغ المالك «الحالة مطابقة، بانتظار أمرك» ثم توقّف.**
4. إن اختلفت: أبلِغ بالفرق **دون أي إصلاح** وانتظر.
5. لا تفتح ملفًا للتعديل، ولا تُشغّل بناءً، ولا تُثبّت حزمة، ولا ترسل رسالة اختبار إلى Telegram، ولا تُنشئ مهمة مجدولة — كل هذه **أفعال** تحتاج إذنًا.

**نهاية r10.** الحالة: 3.16.6 مثبَّتة · 56/56 · 5 أجهزة (4 متصلة) · 0 مهام · Telegram مفعّل (4 أحداث) · AI = zai/glm-4.7-flash. **قف هنا.**
