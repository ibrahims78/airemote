# استئناف AiRemote — 2026-11-13 · الإصدار **3.16.17** — نسخة **r16**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-12-3.16.17-FULL-AR-r15.md` وكل ما قبله.**
> كل رقم هنا **مقيس في 2026-11-13** على الجهاز نفسه (آخر قياس ~01:40 بتوقيت الجهاز).
> سببه: انتقال المالك إلى حساب AutoClaw جديد. المستودع وقاعدة البيانات ومفاتيح التوقيع **على القرص**، فلا يتأثر شيء بتغيير الحساب.
> **جديد في r16:** تنفيذ المعلّق كاملًا — اختبار `control` حيًّا (`invoked` · exit 0) · تسجيل **وكيل ويندوز جديد** `DESKTOP-K81PJ9H` وربطه بالسيرفر · اختبار `shell` على TECNO (exit 0) · توثيق فشل `screenshot` على TECNO (`no frame`) · الفخاخ 51–58 · إحداثيات نقر مقيسة · أدوات ومسارات جولة جديدة.

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا ويُحترم حرفيًا

**قِف هنا. لا تنفّذ أي إجراء — لا بناء، لا تثبيت، لا تعديل ملف، لا `git commit`، لا تشغيل سكربت يكتب — حتى يقول المالك صراحةً «ابدأ» أو «نفّذ البند كذا» أو «اكمل البند كذا».**

- ترخيصك الحالي: **قراءة وتحقّق فقط** (قراءة ملفات، `git log`/`git status`، `curl /health`، بوابات القراءة، `adb shell dumpsys` للقراءة).
- الممنوع الآن: أي كتابة داخل `D:\autoclaw projects-new\AiRemote` أو `D:\autoclaw projects\offline-build-tools`، وأي `adb install`/`am force-stop`/`settings put`، وأي `pnpm build` أو `electron-builder` أو `gradle`، وأي تعديل على `handoff` إلا بنسخ تقرير بأمر.
- كل ما في هذا الملف **منجَز ومُثبَّت** إلا ما هو موسوم صراحةً **«معلّق»** في §4.
- إن وجدت رقمًا مختلفًا عمّا هنا: **لا تُصلح شيئًا**. أبلِغ المالك بالفرق وانتظر.
- أي تعديل قبل الإذن = خرق، حتى لو بدا إصلاحًا واضحًا أو سطرًا واحدًا.

**كلمات فكّ التوقّف الوحيدة (من المالك فقط):** «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ».

**قبل أي شيء آخر:** اقرأ تقرير الإغلاق الأخير — `D:\autoclaw projects-new\AiRemote-handoff\reports\تقرير-تنفيذ-المعلق-2026-11-13.md` — ثم `D:\autoclaw projects-new\AiRemote\docs\تقرير-إغلاق-3.16.17.md`. لا تُصلح شيئًا منهما بلا أمر.

---

## 0.1) الحالة المقيسة الآن (2026-11-13)

| البند | القيمة | كيف تُتحقَّق |
|---|---|---|
| الفرع | `feat/screen-unify-3.13.0` | `git branch --show-current` |
| آخر التزام | `c1a6a89` (docs: r15 handoff) | `git log --oneline -1` |
| آخر التزام إصدار | `112c72f` (بيان 3.16.17) | `git log --oneline -1 -- releases/manifest.json` |
| التزامات 3.16.17 | `b3bba64` ميزات · `e3191be` إصدار · `fcbe7da` بناء · `112c72f` بيان · `db99417` تقرير | `git log --oneline -8` |
| `VERSION` | **3.16.17** | `Get-Content VERSION` |
| `versionCode` أندرويد | **107** | `packages/android-agent/app/build.gradle` |
| **السيرفر المثبَّت** | **3.16.17** على **3001** (TLS) | `curl.exe -k -s https://127.0.0.1:3001/health` |
| **حزمة السيرفر** | Setup = **159,432,053 B** · zip = **212,176,875 B** | `releases/server-windows/` |
| **وكيل ويندوز (حزمة)** | Setup = **76,402,735 B** · zip = **104,017,246 B** | `releases/agent-windows/` |
| **APK أندرويد** | **239,520 B** · موقّع v2+v3 · `versionCode 107` | `releases/android-agent/` |
| البيان | **65 عنصرًا · signature OK · all artifacts match** | `node scripts/release-manifest.js --verify` |
| توافق الإصدار | **PASS** | `node scripts/check-version-consistency.cjs` |
| بوابة التحقق | **56/57** (آخر تشغيل 2026-11-12؛ لم تُعَد في جولة 13) — الفشل الوحيد `e2e: sessions export` بيئي | `node scripts/verify.js` |
| **الأسطول** | **6 أجهزة مسجّلة · 5 online** | `/api/devices` أو القاعدة |
| أجهزة adb الآن | `emulator-5554` · `12927374CM001019` (TECNO) — **GPSZ غير موصول** | `adb devices` |
| شجرة git | نظيفة إلا أرشيف `artifacts/*.apk` + وثيقتان قديمتان غير متتبَّعتين في `docs/` + ملفات r16/r15 الجديدة غير متتبَّعة | `git status --short` |

**الأجهزة المسجّلة (من القاعدة، 2026-11-13 ~01:35):**

| # | الاسم | الحالة | النسخة | مالك |
|---|---|---|---|---|
| 1 | `Android-Emulator` | **online** | 3.16.17-android | admin@airemote.local |
| 2 | `TECNO-KL4` | **online** | 3.16.17-android | admin@airemote.local |
| 3 | **`DESKTOP-K81PJ9H`** (جديد r16) | **online** | **3.16.17** (ويندوز) | lab-probe@local |
| 4 | `WIN10-VM` | online | 3.16.0 | admin@airemote.local |
| 5 | `WIN11-VM` | online | 3.16.0 | admin@airemote.local |
| 6 | `TAB16-USB` | **offline** (كان online صباحًا ثم انقطع) | 3.16.0-android | admin@airemote.local |
| — | `GPSZ2025040701858` | **غير مسجّل أصلًا** | — | — |

> «غير متصل» يعني **الوكيل غير مُشغَّل الآن**، لا عيبًا.

### 0.1.1) أول 10 دقائق — تحقّق ثم قف

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git branch --show-current                          # feat/screen-unify-3.13.0
git rev-parse --short HEAD                         # c1a6a89
git log --oneline -8
git status --short
Get-Content VERSION                                # 3.16.17
curl.exe -k -s https://127.0.0.1:3001/health       # 3.16.17
node scripts/release-manifest.js --verify          # signature OK · all artifacts match
node scripts/check-version-consistency.cjs         # PASS
Get-ChildItem releases\server-windows -Filter '*3.16.17*'
Get-ChildItem releases\agent-windows  -Filter '*3.16.17*'
Get-ChildItem releases\android-agent  -Filter '*3.16.17*'
'D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe' devices -l
node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db',{readOnly:true});for(const d of db.prepare('SELECT name,status,updated_at FROM devices ORDER BY name').all())console.log(d.name,d.status,d.updated_at)"
```

**بعدها توقّف.** لا تبنِ «للتأكيد»، ولا تثبّت، ولا تُصلح فرقًا.

**حالة وكيلي التجربة الآن:**
- **المحاكي** (`emulator-5554` · SM-X910N · Android 9 API 28 · شاشة **أفقية 1600×900**): 3.16.17 · لغة `ar` · ثيم داكن · **متصل** · **الالتقاط ممنوح** · a11y = **AiRemoteA11y** ممنوحة · فقاعات/بث/screenshot/bash/control مختبرة حيًّا.
- **TECNO** (`12927374CM001019` · KL4 · Android 14 API 34 · **720×1600**): 3.16.17 · **متصل** · «التقاط جاهز» · **a11y صارت لـ`FileBridge` لا AiRemote** (تغيّرت بعد جولة 12) · shell مختبر حيًّا · screenshot يفشل `no frame`.
- **GPSZ2025040701858**: غير موصول بـadb ولم يُثبَّت عليه شيء.

---

## 0.2) الوصول والحسابات (لا قيم سرّية داخل المستودع)

| ما | أين / كيف |
|---|---|
| حساب اللوحة الأساسي | `admin@airemote.local` (دور `admin`) — **كلمة المرور عند المالك فقط** |
| **حساب الأتمتة العامل** | `lab-probe@local` (دور `admin`) — بياناته في `C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json` |
| حساب احتياطي | `admin@airemote.io` (دور `admin`) |
| **تنبيه** | كلمة المرور المكتوبة في `AiRemote\lab-credentials.txt` لحساب `admin@airemote.local` **لا تعمل (401)** — مُثبت 2026-11-13. لا تكرر المحاولة أكثر من مرة (حدّ الدخول 5/دقيقة). |
| قاعدة البيانات | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` (قراءة فقط) |
| مفاتيح التوقيع | `C:\Users\admin\AppData\Roaming\AiRemote\signing\airemote-release.jks` · alias **`airemote`** · كلمة المرور في `keystore-password.txt` |
| شهادة TLS للسيرفر | `C:\Users\admin\AppData\Roaming\AiRemote-Server\tls\server.crt` (SAN: localhost · 127.0.0.1 · 192.168.1.25 · 192.168.137.1 · 10.90.74.220 · 192.168.0.1) |
| مفتاح AI | في `settings.aiApiKey` (51 محرفًا) — لا يُطبع |
| بوت Telegram | `settings.telegramToken` (48) · المحادثة `1029428155` |

**قاعدة صارمة:** أي سرّ يُقرأ من البيئة (`PANEL_PASS` · `AEMAIL` · `APASS` · `AI_KEY` · `TG_TOKEN` · `TG_CHAT`) أو عند المالك أو من ملفات الاعتماد أعلاه. **لا يُكتب في مستودع ولا في وثيقة ولا في التزام ولا في مخرَج أداة ولا في ردّ.**

**قراءة القاعدة من Node:** `require("node:sqlite").DatabaseSync` (Node 24) — `better-sqlite3` مبني لـElectron.

**ملاحظة:** `PANEL_PASS` وغيرها **غير معرّفة** في بيئة هذه الجلسة — سكربتات القياس التي تحتاجها ستفشل حتى تُعرَّف.

**جداول القاعدة المهمة:** `devices` (id, name, token, owner_id, info, status, capabilities, last_seen, code) · `ai_conversations` (id, device_id, user_id, title, messages) · `settings` (key, value) · `sessions` · `session_tokens` · `audit_log` · `users` · `device_unattended`.

---

## 0.3) البيئة والأدوات — مسارات مصححة

> أي وثيقة تقول `D:\autoclaw projects-new\offline-build-tools` **خطأ**. الجذر الصحيح:

| الأداة | المسار |
|---|---|
| جذر الأدوات | `D:\autoclaw projects\offline-build-tools` |
| JDK | `…\android-toolchain\jdk` (OpenJDK 21) |
| Android SDK | `…\android-toolchain\sdk` (platform android-35 · build-tools **34.0.0**) |
| Gradle | `…\android-toolchain\gradle\bin\gradle.bat` |
| adb | `…\android-toolchain\sdk\platform-tools\adb.exe` |
| zipalign / apksigner | `…\sdk\build-tools\34.0.0\{zipalign.exe, apksigner.bat}` |
| Chrome (لقياس الواجهة) | `C:\Program Files\Google\Chrome\Application\chrome.exe` |

**لا `java` على PATH.** كل صدفة تحتاج:
```powershell
$b='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME="$b\jdk"; $env:ANDROID_HOME="$b\sdk"; $env:ANDROID_SDK_ROOT="$b\sdk"
```

**شبكة هذا الـPC (مقيسة):** Hostname `DESKTOP-K81PJ9H` · Wi-Fi `192.168.1.25` (هو عنوان السيرفر الذي تستخدمه أجهزة أندرويد) · Ethernet `192.168.1.55` · VMnet8 `192.168.0.1` · ZeroTier `10.90.74.220` · VMnet1 `192.168.28.1`.

---

## 0.4) الأجهزة (مقيسة الآن)

| الجهاز | الحالة | الإصدار | ملاحظة |
|---|---|---|---|
| **TECNO-KL4** | **online** | **107 / 3.16.17** | `serial 12927374CM001019` · شاشة **720×1600** · «التقاط جاهز» · **a11y = FileBridge** (ليست AiRemote) |
| **Android-Emulator** | **online** | **107 / 3.16.17** | Android 9 (API 28) · شاشته **أفقية 1600×900** · الالتقاط ممنوح · **a11y = AiRemoteA11y** · FileBridge مثبَّت ويقفز للمقدمة |
| **DESKTOP-K81PJ9H** | **online** | **3.16.17** | وكيل ويندوز على هذا الـPC نفسه · `ipLocal 192.168.1.25` · `ipPublic 5.155.3.192` · `elevated=false` · مالكه `lab-probe@local` |
| WIN10-VM | online | 3.16.0 | `192.168.0.128` · مرفوع الصلاحية |
| WIN11-VM | online | 3.16.0 | `192.168.0.132` |
| TAB16-USB | offline | 3.16.0-android | انقطع ~22:05 UTC |
| GPSZ2025040701858 | adb device سابقًا | — | **غير موصول الآن** · لم يُثبَّت عليه شيء |

**قدرات مشتركة:** `pty` · `shell` · `fs` · `screenControl` · `clipboard` · `chat` · `ai` · `android`/`multiMonitor`.

---

## 0.5) إعدادات التطبيق المحفوظة (هي «الحالة» التي يجب ألّا تُفقد)

| الإعداد | القيمة المخزّنة |
|---|---|
| مزوّد الذكاء الاصطناعي | `zai` · النموذج `glm-4.7-flash` · المفتاح محفوظ (51) |
| `aiConfigs` / `ai_config` | نسختان لنفس المزوّد — سلوك قائم، لا تحذف إحداهما |
| إشعارات Telegram | مفعّلة · توكن (48) · محادثة `1029428155` |
| مفاتيح الأحداث | `online: true` · `offline: true` · `chat: true` · `task: true` |
| المهام المجدولة | **0** |
| قواعد التنبيه | **0** |
| 2FA | **معطّل** لكل المستخدمين (3) |
| الأجهزة المسجّلة | **6** |
| المظهر | الوضع النهاري (في ملفات المعاينة: داكن) |
| الشريط العلوي | **Admin أقصى اليسار · AiRemote في الوسط تمامًا · الأدوات يمينًا · أزرار النافذة أقصى اليمين** |
| وضع تحكم أندرويد | «موافقة يدوية» افتراضيًا على المحاكي/TECNO |

**إعدادات وكيل ويندوز المحفوظة (جديد r16):**

| المفتاح | القيمة |
|---|---|
| ملف الإعداد | `C:\Users\admin\AppData\Roaming\airemote-agent-desktop\airemote-config.json` |
| `serverUrl` | `wss://192.168.1.25:3001/ws` |
| `token` | 36 محرفًا (UUID) — **لا يُطبع ولا يُنسخ لوثيقة** |
| `autoStart` | `true` |
| `startMinimized` / `runAtStartup` | `false` / `null` |
| متغير بيئة المستخدم | `AGENT_CA_CERT = C:\Users\admin\AppData\Roaming\AiRemote-Server\tls\server.crt` |
| معرّف الجهاز | `35850a47-e50f-48f3-bc81-8c38d7a908c0` · الاسم `DESKTOP-K81PJ9H` |

> **TLS:** لا يُستخدم `AGENT_INSECURE_TLS`. الشهادة موقّعة ذاتيًا لكن SAN يطابق `192.168.1.25`، و`AGENT_CA_CERT` يجعل `rejectUnauthorized: true` ينجح.

---

## 0.6) ما أُنجز

### 0.6.1) 3.16.7 → 3.16.15 (مرجع كامل في r11–r14 — لا تُعِد تحليله)

- **3.16.7**: حجب `token` عن غير الأدمن · منع «عرض فقط» من التسجيل/الدقة · حارس آخر أدمن · بحث التدقيق · webhook `device_online` · بيان موقّع.
- **3.16.8–3.16.9**: الصفحات 1–15.
- **3.16.10**: إغلاق الديون الخمسة + اختبار الجدولة (16 فحصًا).
- **3.16.11**: `ORIENT-FOLLOW` + الثقة بدوران النافذة + مسرح `ORIENT-STAGE`.
- **3.16.12**: اتباع مقاس المحتوى الملتقط.
- **3.16.13**: الشريط العلوي (هوية يسارًا · شعار وسطًا).
- **3.16.14**: أزرار النافذة أقصى اليمين دائمًا.
- **3.16.15**: الأفقية على API<34 + تراكب التكبير.

### 0.6.2) 3.16.16 — جولة الواجهات + المعلّق

- ترجمة كاملة لتبويبي المساعد/الدردشة في ويندوز · ثيم/لغة فوريان · أزرار نافذة يمينًا · RTL وثيم فاتح وأزرار ماركة في أندرويد · بحث السجل · حالات فراغ · أشرطة موارد · معالج بثيم.
- **قرار المالك:** تعطيل التنفيذ التلقائي لأوامر المساعد نهائيًا (يدوي + تأكيد للأوامر الخطرة).
- تنفيذ المعلّق: `verify.js` 56/57 · تثبيت على TECNO · `autoRunBlocks` معطّل · تغليف 3.16.16 (code 106 · بيان 60 عنصرًا) · أيقونات SVG · نص ثانوي 12px · مقطع أندرويد · «ن من 8» · صفوف معالج أكثف.
- التقرير: `docs\تقرير-إغلاق-3.16.16.md`.

### 0.6.3) 3.16.17 — P1–P4 + S1–S3

**P4 — عقد المساعد الذكي في أندرويد (ملف جديد `AiClient.java`):**
| المكوّن | التنفيذ |
|---|---|
| البث | `POST /api/ai/chat/stream` · SSE: أسطر `data: ` فقط · تجاهل `[DONE]` · تبنّي `conversationId` من أول حدث · `{"delta":…}` دلتا · `{"error":…}` نهائي |
| الحمولة | `{message, conversationId?, deviceId?, context}` — `context` يوجّه النموذج لاستخدام `shell/bash/screenshot/control` بدل PowerShell |
| الإيقاف | محلي `disconnect()` — لا طلب للسيرفر |
| المحادثات | `GET /api/ai/conversations?deviceId=` · `GET /api/ai/history?conversationId=&deviceId=` · `DELETE /api/ai/conversations/:id` · `aiConvId` في SharedPreferences |
| التوثيق | `X-Device-Token` على كل نداء (نفس `aiAuth` في السيرفر) |
| تنفيذ الكتل | `shell/bash/cmd/sh` عبر `sh -c` (مهلة 120ث · 20k/4k) · `screenshot` عبر MediaProjection (`captureToFile`) → `data:image/jpeg;base64` · `control` عبر `AiRemoteA11y` (12 أمرًا) · `powershell`/`record` رفض واضح |
| الأمان | `isDangerous` + تأكيد صريح + **لا تنفيذ تلقائي** |

**P1 — فقاعات:** فقاعات للمساعد ودردشة المشاهدين (RTL صحيح) · كتل كود مع نسخ/تنفيذ/نتيجة/صورة · زر «السجل» · استرجاع آخر محادثة عند الاتصال · البقاء بعد `recreate()`.
**P2 — بطاقة الجهاز:** IP المحلي + IP العام (`api.ipify.org` → `info.ipPublic`) مع نسخ · معرّف يُنسخ بضغطة طويلة.
**P3 — السجل والقوة:** مستويات `I/W/E` (9 مواضع) · فلترة · تصدير إلى التنزيلات (`MediaStore`) أو مجلد التطبيق · شريط قوة كلمة السر (4 مستويات).
**S1:** شارات «التقاط جاهز/غير ممنوح» + «بث مباشر» من نبض القلب.
**S2:** أزرار 44dp. **S3:** `sans-serif-medium` للعناوين.

**الالتزامات:** `b3bba64` ميزات · `e3191be` إصدار · `fcbe7da` بناء · `112c72f` بيان · `db99417` تقرير.
**التقرير:** `docs\تقرير-إغلاق-3.16.17.md`.

### 0.6.4) جولة **2026-11-13** — تنفيذ المعلّق (r16) — لا تغيير كود ولا إصدار

> الأمر: «نفّذ الامور المعلقة بالكامل بشكل احترافي واحد تلو الاخر». التقرير الكامل: `handoff\reports\تقرير-تنفيذ-المعلق-2026-11-13.md`.

| # | البند | الحكم | الدليل المقيس |
|---|---|---|---|
| 1 | **`control` حيًّا على المحاكي** | ✅ **مغلق** | كتلة `clickname Log` → **`invoked`** · **تم (exit 0)** · الزر صار «تمّ» (`shots-2026-11-13-pending\emu-15-exec.png`) |
| 2 | **وكيل ويندوز على هذا الـPC** | ✅ **مغلق** | جهاز جديد `DESKTOP-K81PJ9H` = `35850a47-e50f-48f3-bc81-8c38d7a908c0` · **online** · `agentVersion 3.16.17` · `ipLocal 192.168.1.25` · `ipPublic 5.155.3.192` |
| 3 | **GPSZ2025040701858** | ⛔ **متعذّر** | غير ظاهر في `adb devices` طول الجولة |
| 4 | **`shell` على TECNO** | ✅ **مغلق** | `ls /sdcard` → **تم (exit 0)** بمخرجات حقيقية: `Alarms, Android, Audiobooks, Collage, DCIM, Documents, Download, File-Manager-Mar-3-01-51-19.mp4, Fonts, Movies…` (`tecno-25-shell-exec2.png`) |
| 5 | **`screenshot` على TECNO** | ❌ **فشل موثّق** | **`no frame` · فشل (exit 1)** — 3 محاولات بعد منح MediaProjection. `dumpsys media_projection` يُظهر `(com.airemote.agent): TYPE_SCREEN_CAPTURE` مسجّلًا لكن بلا إطارات. **فخّ #51** — يحتاج قرار مالك قبل الإصلاح |

**كيف نُفِّذ البند 2 (وصفة قابلة للتكرار):**
1. دخول: `POST /api/auth/login` بـ`lab-probe@local` (من `lab-probe.json`).
2. إنشاء جهاز: `POST /api/devices` بجسم `{name, tags:["lab","windows"]}` → يُعيد `{id, token}` (201).
3. كتابة `airemote-config.json`: `serverUrl = wss://192.168.1.25:3001/ws` · `token` · `autoStart = true` (حافظ على `_winBounds`).
4. تعيين `AGENT_CA_CERT` (مستوى المستخدم + الجلسة الحالية).
5. `Stop-Process 'AiRemote Agent'` ثم `Start-Process 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'`.
6. تحقّق: `SELECT name,status,info FROM devices WHERE name='DESKTOP-K81PJ9H'` → `online` و`agentVersion 3.16.17`.
- السكربت الجاهز: `handoff\tools-2026-11-13-pending\register-win-agent.cjs` (لا يطبع أي token).

**ملاحظة تحليلية على البند 1:** `clickname Log` يبحث بالنص. تبويب السجل نصّه **«السجل»** (عربي)، وفقاعات المستخدم تحتوي حرفيًا «tap on the Log tab». الأرجح أن النقرة أصابت عقدة الفقاعة لا التبويب. **المطلوب كان إثبات الميكانيزم** (زر → `AiClient.control` → `AiRemoteA11y` → `invoked` → exit 0 → نتيجة في الفقاعة) وقد ثبت. لاختبار «نقرة على تبويب» بدقة: استخدم `click` بإحداثيات مقيسة أو بدّل اللغة إلى EN.

**إحداثيات مقيسة (للاستخدام المباشر):**

| الشاشة | العنصر | البounds (px) |
|---|---|---|
| المحاكي 1600×900 | `tab_status` الحالة | `[1198,72][1590,116]` |
| | `tab_ai` المساعد الذكي | `[802,72][1194,116]` |
| | `tab_chat` الدردشة | `[406,72][798,116]` |
| | `tab_log` السجل | `[10,72][402,116]` |
| | `ai_input` حقل الرسالة | `[104,820][1496,864]` |
| | `ai_send` إرسال | `[10,820][98,864]` |
| | `ai_hist` سجل المحادثات | `[1502,820][1590,864]` |
| TECNO 720×1600 | شريط التبويبات | `y ≈ 237` · المساعد `x ≈ 460` |
| | حقل الرسالة | `(360, 1455)` |
| | إرسال | `(115, 1455)` |
| | سجل المحادثات | `(620, 1455)` |
| | «البدء الآن» في حوار MediaProjection | `(172, 1236)` |

---

## 1) ما أُغلق ولا يُعاد فتحه

| البند | الدليل |
|---|---|
| حجب `token` عن غير الأدمن (3 أسطح) | `4b1c849` · `a0c31b0` · `18ef9e9` |
| منع «عرض فقط» من التسجيل/الدقة | `048cd87` |
| حارس آخر أدمن · تعليمات تثبيت صادقة | `4b4674c` · `d47a6ae` |
| صفحات 1–15 · الديون 1–5 | r12/r14 §0.6.1 |
| مسرح الجدار الموحّد · اتباع الاتجاه | `435242f` · `26ddcac` |
| الشريط: هوية يسارًا وشعار وسطًا | `77d549d` |
| أزرار النافذة أقصى اليمين | `16aa478` |
| الأفقية على API<34 + تراكب التكبير | `761293f` |
| جولة الواجهات (ويندوز+أندرويد) | `bf817e7` · `96e72a0` · `15af583` |
| تعطيل التنفيذ التلقائي | `84bb0e8` |
| P1 فقاعات · P2 بطاقة جهاز · P3 سجل/قوة · P4 عقد المساعد · S1–S3 | `b3bba64` |
| **`control` حيًّا على المحاكي (invoked · exit 0)** | **2026-11-13 · `emu-15-exec.png`** |
| **وكيل ويندوز `DESKTOP-K81PJ9H` online 3.16.17** | **2026-11-13 · قاعدة البيانات + config** |
| **`shell` على TECNO (ls /sdcard · exit 0)** | **2026-11-13 · `tecno-25-shell-exec2.png`** |

---

## 2) الفخاخ المثبتة — محدَّثة (58)

### قديمة ما زالت تصدق
1. **السيرفر المثبَّت يخدم `app.asar`** (`server-desktop/server.js`) — لا `packages/server` (TS).
2. **قفل النسخة الواحدة في الوكيل** — اقتل/force-stop أي نسخة قبل أي مسبار.
3. **`versionCode` يزيد يدويًا** — أندرويد يرفض التثبيت إن لم يزد.
4. **`apksigner` يحتاج `JAVA_HOME`** و**ملفَّي كلمة مرور منفصلين** (`--ks-pass file:` و`--key-pass file:`) — ملف واحد يفشل بـ`end of file reached`.
5. **NSIS يمسح المجلد ~20–25 ثانية** — انتظر قبل الحكم بالفشل.
6. **`/api/auth/login` محدود 5/دقيقة**.
7. **`MediaProjection` يسقط بإعادة تثبيت APK وبـforce-stop** — يُمنح من شاشة النظام بعد كل مرة.
8. **مسار العارض `wss://…/screen?ticket=…`** لا `/ws`.
9. **`vmrun runProgramInGuest` لا يعيد stdout**.
10. **عربية PowerShell 5.1**: لا تكتب ملفًا عربيًا بـ`Set-Content`؛ لا تقرأ بـ`Get-Content` للعرض (mojibake) — استخدم `read`.
11. **`better-sqlite3` يتبع آخر عملية**: Node للاختبارات · Electron 119 للحزمة — فشل `e2e: sessions export` **بيئي**.
12. **أندرويد 13+**: لا بد من `MANAGE_EXTERNAL_STORAGE`.
13. **بوابة 56 لا ترسم صفحة** — القياس البصري أداة منفصلة.
14. **نهايات الأسطر مختلفة**: `server.js`/`ScreenViewer`/`control-room.css` = CRLF؛ أغلب الصفحات = LF.
15. **Gradle يجب أن يعمل في الخلفية** وإلا يُقتل.
16. **الحزمة تعيد كتابة `packages/server-desktop/static`** ⇒ التزام `chore(build)` أو شجرة متسخة.
17. **`settings` تحمل نسختين للمفاتيح** (`aiConfigs` و`ai_config`).
18. **الحسّاس يكذب على TECNO** — لا تعتمد عليه للاتجاه.
19. **`getRealMetrics` على TECNO يعيد العمودي دائمًا**.
20. **ترويسة إطار العارض = 13 بايت** (`[w:4][h:4][seq:4][flags:1]`، 21 مع dx/dy).
21. **`adb install -r` لا يكفي**: `am force-stop` ثم `am start` إلزاميان.
22. **`uiautomator dump` على TECNO** كثير الفشل — اعتمد `screencap`.
23. **لوحة المتصفح (`browser_tool`) قد تكون بعرض ~398px** — غير صالحة لقياس؛ استخدم Chrome عبر CDP.
24. **لا توقف تطبيقًا يستخدمه المالك إلا لضرورة**.
25. **`onCapturedContentResize` = API 34 فقط.**
26. **`WindowManager.getCurrentWindowMetrics()` = API 30+.**
27. **على Android 9–13 قد تعيد `getRealMetrics` المقاس الأفقي الصحيح بينما `getRotation()=0`.**
28. **إدخال المحاكي بإحداثيات غير مدوّرة** عند الشاشة الأفقية: ≈ `input tap y (1600−x)`.
29. **إعادة تثبيت APK تُسقط `MediaProjection` وخدمة الوصول** — أعد المنح:
    `settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y`
30. **أول منح التقاط بعد إعادة تثبيت قد لا يُنتج إطارات** إن لم يكن التطبيق في المقدمة عند «البدء الآن».
31. **نص إصدار الواجهة قد يكون قديمًا** — اعتمد `dumpsys package`.
32. **`e2e: web-server connection` قد يفشل** إذا كان السيرفر يُعاد تشغيله أثناء `verify.js`.
33. **سكربتات القياس تحتاج `PANEL_PASS`** وتوقف جلسات البث المعلّقة أولًا.
34. **جلسة العارض تُنشئ `VirtualDisplay`؛ إيقافها من اللوحة يطلقها** — امسح الجلسات قبل القياس.
35. **`uiautomator dump` قد يعيد ملفًا قديمًا** عند `null root node` — استخدم `screencap`.
36. **`SetupActivity` غير مُصدَّرة** (`exported=false`) — لا تفتحها بـ`am start`؛ افتحها بنقرة «معالج التهيئة» داخل التطبيق.
37. **شريط الحالة المخفي يلتهم اللمسات** — أهداف 32dp+ وحشوة insets.
38. **`btn_ghost` بلون `app_surface`** — داخل البطاقات استخدم `btn_soft`.
39. **`input_bg` = `app_sunken`** — لا تعده إلى `app_surface`.
40. **`ProgressBar` الافتراضية صفراء** — استخدم `progressTint`.
41. **`am start -S` يقتل العملية ويعيد تشغيلها** — لا تخلطه بـ`onNewIntent`.
42. **توقيع APK**: `JAVA_HOME` + ملف كلمة مرور واحد يصلح للمخزن والمفتاح لكن **مرر ملفين منفصلين** لـapksigner.
43. **`install -r` بنفس `versionCode` يحفظ البيانات** لكنه يُسقط الالتقاط وa11y.
44. **`assembleRelease` بلا signingConfig** ينتج APK غير موقّع — zipalign ثم apksigner ثم verify.
45. **طلب إذن الالتقاط التلقائي مقيّد مرة كل 6 ساعات** (`cap_ask_at`). المسار المضمون: **معالج التهيئة → التقاط الشاشة → فتح الإعداد**.
46. **`adb shell input text` مع مسافات يفشل في PowerShell** — الصيغة العاملة: `adb shell "input text 'take a screenshot'"` (أحادية داخل مزدوجة).
47. **`FileBridge` مثبَّت على المحاكي ويقفز للمقدمة** أثناء اللمس/الأوامر — لا تعمل عليه؛ أعد فتح AiRemote بـ`am start` وتحقّق بلقطة.
48. **`TextView` الفقاعات تُبنى برمجيًا** — أي تعديل تخطيط يجب أن يحافظ على `ai_rows`/`chat_rows` و`ai_empty`/`chat_empty`.
49. **`AiClient` يستخدم `HttpURLConnection` فقط** (لا OkHttp) — لا تضف اعتمادية جديدة بلا إذن.
50. **بث SSE يستمر بعد مغادرة التبويب** — أوقفه بزر «إيقاف» أو `AiClient.stop()`.

### جديدة — جولة 2026-11-13 (r16)
51. **`screenshot` على TECNO يفشل `no frame` (exit 1)** حتى بعد منح MediaProjection صريحًا 3/3. `dumpsys media_projection` يُظهر الجلسة مسجّلة. لا تُعِد المحاولة بلا قرار مالك — يحتاج تحقيقًا في `captureToFile` (مهلة أول إطار / إعادة إنشاء `VirtualDisplay`). **خاص بـTECNO (HiOS 14 · Unisoc)**؛ المحاكي ينجح.
52. **`com.sneig.livedrama` على المحاكي يسرق المقدمة** ويفتح إعلانات Vungle — **تحقّق `mCurrentFocus` قبل كل نقرة** وأعد `am start --activity-clear-top --activity-single-top`. لا توقفه (قد يستخدمه المالك).
53. **`lab-credentials.txt` → `admin@airemote.local` يعطي 401.** استخدم `lab-probe.json` (`lab-probe@local` · دور admin) لكل الأتمتة. لا تحاول أكثر من محاولة واحدة (حدّ 5/دقيقة).
54. **نتيجة تنفيذ الكتل لا تُحفَظ في `ai_conversations`** — `renderAi()` يعيد البناء من نص الرسالة فقط، فتختفي `invoked`/المخرجات بعد استرجاع المحادثة. (ملاحظة بنيوية — لا تُفتح بلا قرار.)
55. **a11y على TECNO صارت لـ`com.filebridge.app/.FbxGuardService`** لا لـ`AiRemoteA11y` — `control` على TECNO لن يعمل حتى إعادة المنح (مع الحفاظ على خدمة FileBridge إن كانت مطلوبة: افصل międzyهما بـ`:`).
56. **شاشة TECNO تنطفئ بين الجولات** — `input keyevent 224` ثم `wm dismiss-keyguard` قبل أي عمل، وإلا `screencap` يعيد صورة سوداء.
57. **مزوّد AI عابر الفشل**: `fetch failed` (من السيرفر إلى `api.z.ai`) ثم `429 Rate limit` ثم نجاح. المزوّد المجاني يسمح ~رد/30ث. لا تستنتج عيبًا في العميل من خطأ واحد — أعد المحاولة بعد 30–40ث.
58. **PowerShell 5.1 `>` يفسد ملفات PNG** — لا تستخدم `adb exec-out screencap -p > file.png`. الصحيح: `adb shell screencap -p /sdcard/s.png` ثم `adb pull`.

---

## 3) الأدوات

### 3.1) في المستودع
| الأداة | الدور |
|---|---|
| `scripts/verify.js` | البطارية — **57 خطوة** |
| `scripts/check-version-consistency.cjs` | المصادر السبعة + `/health` + البيان |
| `scripts/release-manifest.js` | توليد/توقيع البيان · `--verify` |
| `scripts/check-message-contract.cjs` · `check-route-roles.cjs` · `check-message-pairs.cjs` | بوابات 54–56 |
| `scripts/check-shipped-bytes.cjs` | يفتح `app.asar` ويبحث عن بصمات |
| `packages/server-desktop/lib/task-schedule.js` + `test/task-schedule.test.cjs` | الجدولة (16 فحصًا) |
| `packages/server-desktop/lib/alerts.js` | منبّه أخطاء السيرفر |

### 3.2) سكربتات الجولات (AutoClaw — ليست في المستودع)

**المسار الدائم المستقل عن الحساب (استخدمه أولًا):**
```
D:\autoclaw projects-new\AiRemote-handoff\scripts\          # 41 سكربتًا
D:\autoclaw projects-new\AiRemote-handoff\reports\          # نسخ التقارير
D:\autoclaw projects-new\AiRemote-handoff\probe-rot\        # مشروع المسبار
D:\autoclaw projects-new\AiRemote-handoff\README.md
D:\autoclaw projects-new\AiRemote-handoff\docs\             # نسخ ملفات PROMPT
D:\autoclaw projects-new\AiRemote-handoff\shots-2026-11-12-ui\        # 35 لقطة جولة الواجهات
D:\autoclaw projects-new\AiRemote-handoff\shots-2026-11-12-31616\     # لقطات 3.16.16/3.16.17
D:\autoclaw projects-new\AiRemote-handoff\shots-2026-11-13-pending\   # لقطات جولة r16 (24 لقطة)
D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-12-ui\        # 13 أداة + أدوات r15
D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-pending\   # أدوات r16
```
> نُسخت هذه الأدوات خارج مساحة العمل **لأن مساحة العمل تتبع الحساب**. الحساب الجديد يقرأها من المسار أعلاه مباشرة.

**أدوات r16 الجديدة:** `register-win-agent.cjs` (تسجيل وكيل ويندوز: دخول → `POST /api/devices` → كتابة config → لا يطبع token).

**القياس والبث:** `screen-measure.cjs` · `screen-timeline.cjs` · `grab-frame.cjs` · `capture-screen.cjs` · `screen-size.cjs` · `hold-stream.cjs` · `ui-dump.cjs`.
**الواجهة/الشريط:** `shot-titlebar.cjs` · `test-titlebar.cjs` · `test-titlebar2.cjs` · `repro-zoom.cjs` · `test-zoom-live.cjs` · `diag-wall.cjs` · `diag-wall2.cjs`.
**الرقعة والبناء:** `patch-titlebar.cjs` · `patch-titlebar-css.cjs` · `patch-win-btns.cjs` · `patch-win-css.cjs` · `patch-win-fix.cjs` · `patch-orient-31615.cjs` · `patch-sv-31615.cjs` · `bump-31613.cjs` · `bump-31614.cjs` · `bump-31615.cjs`.
**جولة الواجهات + r15/r16:** `patchlib.py` · `patch_win.py` · `patch_android_res.py` · `patch_android_java.py` · `patch_titlebar.py` · `patch_empty_states.py` · `patch_fields.py` · `patch_hints.py` · `strip_logs.py` · `fix_verchip.py` · `shot-preview.cjs` · `uidump.py` · `bump-31616.cjs` · `bump-31617.cjs` · `add_strings_31617.py` · `patch_main2.py` · `log_levels.py` · `fix_d.py` · `parse_ui*.py`.
**قاعدة الجلسات (قراءة فقط):** `db-schema.cjs` · `db-token-shape.cjs` · `db-tickets-shape.cjs` · `remote-exec.cjs` (ينفّذ أمرًا على جهاز عبر `/api/devices/:id/exec`).

### 3.3) بناء أندرويد (متسلسلة مجرَّبة)
```powershell
$b='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME="$b\jdk"; $env:ANDROID_HOME="$b\sdk"; $env:ANDROID_SDK_ROOT="$b\sdk"
& "$b\gradle\bin\gradle.bat" -p packages\android-agent assembleRelease --console=plain --no-daemon   # في الخلفية
& "$b\sdk\build-tools\34.0.0\zipalign.exe" -f -p 4 <unsigned>.apk aligned.apk
Copy-Item <keystore-password.txt> $env:TEMP\ks.txt -Force
Copy-Item <keystore-password.txt> $env:TEMP\key.txt -Force
& "$b\sdk\build-tools\34.0.0\apksigner.bat" sign --ks <jks> --ks-key-alias airemote --ks-pass file:$env:TEMP\ks.txt --key-pass file:$env:TEMP\key.txt --out out.apk aligned.apk
& "$b\sdk\build-tools\34.0.0\apksigner.bat" verify --verbose out.apk
& "$b\sdk\platform-tools\adb.exe" -s <serial> install -r out.apk
& "$b\sdk\platform-tools\adb.exe" -s <serial> shell am force-stop com.airemote.agent
& "$b\sdk\platform-tools\adb.exe" -s <serial> shell am start -n com.airemote.agent/.MainActivity
```

### 3.4) بناء ويندوز (الترتيب الصحيح)
```powershell
pnpm --filter @airemote/dashboard build
node packages\server-desktop\scripts\copy-dashboard.js
node packages\server-desktop\scripts\bundle.js
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
cd packages\server-desktop; & .\node_modules\.bin\electron-builder.CMD --win --x64 --config.directories.output=../../releases/server-windows
cd ..\agent-desktop;          & .\node_modules\.bin\electron-builder.CMD --win --x64
```
**لا تستخدم `npm run build` في `agent-desktop`** — يفشل بسبب مسافة في المسار.

### 3.5) التحكم بدوران الشاشة
```powershell
# TECNO (Android 14)
& $adb -s 12927374CM001019 shell cmd window user-rotation lock 1   # أفقي
& $adb -s 12927374CM001019 shell cmd window user-rotation lock 0   # عمودي
# المحاكي (Android 9): لا يدعم cmd window user-rotation
& $adb -s emulator-5554 shell "settings put system accelerometer_rotation 0; settings put system user_rotation 1"
```

### 3.6) إعادة الصلاحيات بعد تثبيت APK
```powershell
& $adb -s <serial> shell "settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y; settings put secure accessibility_enabled 1"
# إن كان FileBridge مطلوبًا على TECNO، افصل بين الخدمتين بنقطتين:
#   com.airemote.agent/com.airemote.agent.AiRemoteA11y:com.filebridge.app/.FbxGuardService
# التقاط الشاشة: معالج التهيئة → التقاط الشاشة → فتح الإعداد → البدء الآن (والتطبيق في المقدمة)
```

### 3.7) إنشاء جهاز جديد وربط وكيل (وصفة §0.6.4 مكرَّرة)
```
1) POST /api/auth/login  {email, password}                     → accessToken
2) POST /api/devices     {name, tags}  (Bearer)                → 201 {id, token}
3) اكتب config الوكيل: serverUrl=wss://192.168.1.25:3001/ws · token · autoStart=true
4) وكيل ويندوز: AGENT_CA_CERT=…\tls\server.crt ثم أعد تشغيل الوكيل
   وكيل أندرويد: حقلا inp_server/inp_token ثم btn_save ثم btn_start
5) تحقّق: devices.status = online · info.agentVersion = المتوقع
```

### 3.8) قراءة القاعدة (بلا أسرار)
```powershell
node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db',{readOnly:true});console.log(db.prepare('SELECT name,status,updated_at FROM devices ORDER BY name').all())"
```
> لا تطبع أعمدة `token` / `password_hash` / `totp_secret` / `aiApiKey` / `telegramToken`.

---

## 4) ما بقي — **معلّق بانتظار أمر المالك**

### 4.1) مغلق
- P1 · P2 · P3 · P4 · S1 · S2 · S3 (3.16.17).
- `control` حيًّا على المحاكي (2026-11-13).
- وكيل ويندوز `DESKTOP-K81PJ9H` (2026-11-13).
- `shell` على TECNO (2026-11-13).

### 4.2) معلّق
1. **`screenshot` على TECNO — `no frame`** (فخّ #51). يحتاج قرار مالك: تحقيق في `captureToFile` (مهلة أول إطار / إعادة إنشاء `VirtualDisplay` / مسار بديل عبر `screencap` كخدمة). **لا تُصلح بلا أمر.**
2. **GPSZ2025040701858** — غير موصول. عند توصيله: تثبيت APK 3.16.17 + إدخال `wss://192.168.1.25:3001/ws` ورمز جهاز جديد + منح الالتقاط وa11y.
3. **`control` على TECNO** — لن يعمل حتى تُعاد a11y لـ`AiRemoteA11y` (حاليًا FileBridge).

### 4.3) تحسينات اختيارية (ليست عيوبًا)
- شارة «عدد المشاهدين» حين يوفرها الخادم.
- `RecyclerView` بدل `LinearLayout` إن تجاوزت المحادثة مئات الفقاعات (اليوم سقف 200).
- `powershell` على أندرويد: رفض واضح حاليًا؛ يمكن لاحقًا تحويلها إلى `sh` مع تنبيه.
- حفظ نتائج تنفيذ الكتل داخل `ai_conversations` (فخّ #54) — ميزة لا إصلاح عاجل.

### 4.4) ديون بنيوية باقية (لا تُفتح بلا قرار)
- `packages/server` (TS) لا يُشحن — أي إصلاح فيه يجب تكراره في `server-desktop/server.js`.
- `static/` يحمل نسخة مبنية من الواجهة داخل git (مقصود).
- `aiConfigs`/`ai_config` مكرّران في `settings`.
- صفحة 15 (`/dev/ui`) تطوير فقط.
- جهاز `DESKTOP-K81PJ9H` مالكه `lab-probe@local` لا `admin@airemote.local` (لا يمنع الظهور لأن كليهما admin).

---

## 5) أوامر جاهزة (لا تُشغَّل بلا إذن)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'

# تحقّق فقط (مسموح الآن)
node scripts/verify.js
node scripts/check-version-consistency.cjs
node scripts/release-manifest.js --verify

# بناء إصدار جديد (الترتيب مهم)
cd packages\dashboard; npm run build
cd ..\server-desktop; node scripts/bundle.js; node scripts/copy-dashboard.js
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
& '...\server-desktop\node_modules\.bin\electron-builder.CMD' --win --x64 --config.directories.output=../../releases/server-windows

# تثبيت السيرفر
Get-Process 'AiRemote Server' -ErrorAction SilentlyContinue | Stop-Process -Force
& 'releases\server-windows\AiRemote-Server-Setup-v<v>-x64.exe' /S
Start-Sleep -Seconds 35
Start-Process 'C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe'
curl.exe -k -s https://127.0.0.1:3001/health

# معاينة الواجهة
cd packages\dashboard; .\node_modules\.bin\vite.cmd --port 5000 --strictPort
```

---

## 6) بروتوكول التنفيذ

1. **قِس أولًا** (§0.1.1) — لا تثق بأرقام هذا الملف بلا تحقق.
2. **تعديل واحد = التزام واحد** بالسبب.
3. إن ساء الرقم: `git checkout` فورًا.
4. الدليل المقيس (قبل/بعد) في الرد وفي التقرير.
5. **لا أسرار** في المستودع/الالتزامات/المخرجات/الردود.
6. **لا تلمس عقد API** ولا تصميم سطح بلا قرار مالك — **والشريط العلوي مستثنى: ترتيبه محدَّد في §0.5 ولا يُزال أي زر منه.**
7. **أي تغيير في محتوى الحزمة يرفع الرقم** في المصادر السبعة + `versionCode` + البيان.
8. **بوابة جديدة تحتاج إثبات عضّ** + خط أساس بأسباب.
9. **⛔ لا تنفّذ شيئًا بلا إذن المالك.**
10. **التقارير في مساحة عمل AutoClaw** ثم **تُنسخ فورًا إلى القرص** (`D:\autoclaw projects-new\AiRemote-handoff\reports\`) — مساحة العمل تتبع الحساب وقد تُفقد عند تسجيل الخروج.
11. **أي أداة أو سكربت جولة يُنسخ إلى** `handoff\tools-YYYY-MM-DD-\` — لا تعتمد على مساحة الحساب.
12. **أي لقطة/دليل يُحفظ في** `handoff\shots-YYYY-MM-DD-<tag>\` — لا في مساحة الحساب.
13. **قبل أي نقرة على جهاز: تحقّق `mCurrentFocus`** — تطبيقات أخرى (livedrama/FileBridge) تسرق المقدمة.
14. **لا تطبع أي سرّ** حتى في أدوات التشخيص؛ مرّر القيم من الملفات داخل السكربت.

---

## 7) التقارير المسلَّمة

| الملف | المحتوى |
|---|---|
| `تقرير-غرفة-العمليات-3.16.8.md` … `تقرير-الصفحة-15-المعرض.md` | الصفحات 1–15 |
| `تقرير-الإصدار-3.16.9.md` · `تقرير-حزم-الوكيل-3.16.9.md` | 3.16.9 |
| `تقرير-إغلاق-دين-popout.md` | دين `popout-closed` |
| `تقرير-إغلاق-الديون-3.16.10.md` | الديون 1–5 + عيب الجدولة |
| `تقرير-جولة-3.16.11-التحقق-الحي.md` · `تقرير-تشخيص-الاتجاه-3.16.11.md` | 3.16.11 |
| `تقرير-إغلاق-3.16.12.md` · `تقرير-إغلاق-3.16.13.md` | 3.16.12/13 |
| `جدول-واجهات-السيرفر-3.16.7.md` | جرد أزرار 15 شاشة |
| `تقرير-مراجعة-واجهات-الوكيلين.md` | جولة الواجهات الكاملة (22 KB) |
| `تقرير-إغلاق-3.16.16.md` | تحقق 56/57 · autoRunBlocks · تغليف 3.16.16 |
| `تقرير-إغلاق-3.16.17.md` | P1–P4 + S1–S3 كاملة + أدلة حية |
| **`تقرير-تنفيذ-المعلق-2026-11-13.md`** | **r16: control · وكيل ويندوز · shell TECNO · no frame · فخاخ 51–58** |

> نسخ Markdown محفوظة في `D:\autoclaw projects-new\AiRemote-handoff\reports\`.

---

## 8) نقطة التوقّف الدقيقة

**آخر ما كان جاريًا:** جولة **2026-11-13** — **اكتملت وأُغلقت** (تنفيذ المعلّق).

- **الالتزامات:** لا التزام جديد. آخرها `c1a6a89` (r15 docs). الشجرة نظيفة إلا أرشيف `artifacts/` ووثيقتان قديمتان وملفات PROMPT/تقرير جديدة غير متتبَّعة.
- **السيرفر:** 3.16.17 مثبَّت ويعمل (`/health` · uptime ~20934ث عند آخر قياس).
- **وكيل ويندوز (هذا الـPC):** **`DESKTOP-K81PJ9H` · online · 3.16.17** · `autoStart=true` · `AGENT_CA_CERT` مضبوط.
- **المحاكي:** 3.16.17 · متصل · الالتقاط ممنوح · a11y ممنوحة · **control مختبر (invoked/exit 0)** · فقاعات + بث + bash/screenshot مختبرة سابقًا.
- **TECNO:** 3.16.17 · متصل · «التقاط جاهز» · **shell مختبر (exit 0)** · **screenshot يفشل no frame** · a11y = FileBridge.
- **GPSZ:** غير موصول · لم يُثبَّت عليه شيء.
- **الأسطول:** 6 أجهزة · 5 online · `TAB16-USB` offline.
- **`verify.js`:** 56/57 (آخر تشغيل 2026-11-12 — لم يُعَد).
- **البيان:** 65 عنصرًا · signature OK.

**نقطة الاستئناف:** اقرأ هذا الملف + `تقرير-تنفيذ-المعلق-2026-11-13.md`، ثم قِس (§0.1.1) و**قف**. الأوامر المتوقعة أولًا: «أصلح no frame على TECNO» · «جهّز GPSZ» (بعد توصيله) · «ابنِ 3.16.18» · «أعد a11y على TECNO».

**نهاية r16.** قف هنا حتى يأمر المالك.

---

## 9) ملحق — FileBridge (مشروع منفصل، لا تخلطه)

- المسار: `D:\autoclaw projects-new\FileBridge` · واجهة موحّدة (شريط علوي واحد، ثيم ليلي/نهاري، EN/ع، شاشة ملفات بنمط AnyDesk).
- حالة التسليم السابقة: Setup 1.0.1.exe **111,419,899 B** · SHA `f9994328…ab6b6` · APK **99,946 B** · SHA `a32d6479…f4d9`.
- **مثبَّت على محاكي AiRemote وTECNO** — خدمة الوصول `com.filebridge.app/.FbxGuardService` **تحتكر a11y على TECNO** حاليًا؛ ويقفز للمقدمة أحيانًا. **لا تعمل عليه إلا بأمر مالك صريح.**
- بنود FileBridge المفتوحة سابقًا: 9.2 (التنزيل المتوازي — مؤجّل بقرار المالك) · 9.3 (تجميد HiOS Hiber على TECNO).
