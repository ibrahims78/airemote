# استئناف AiRemote — 2026-11-12 · الإصدار **3.16.17** — نسخة **r15**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-12-3.16.15-FULL-AR-r14.md` وكل ما قبله.**
> كل رقم هنا **مقيس في 2026-11-12** على الجهاز نفسه.
> سببه: انتقال المالك إلى حساب AutoClaw جديد. المستودع وقاعدة البيانات ومفاتيح التوقيع **على القرص**، فلا يتأثر شيء بتغيير الحساب.
> **جديد في r15:** إصدار 3.16.17 كاملًا (P1–P4 + S1–S3)، عقد المساعد الذكي على أندرويد، ملف `AiClient.java`، أدوات السجل والقوة، شارات البث، وأدلة حية على المحاكي وTECNO.

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا ويُحترم حرفيًا

**قِف هنا. لا تنفّذ أي إجراء — لا بناء، لا تثبيت، لا تعديل ملف، لا `git commit`، لا تشغيل سكربت يكتب — حتى يقول المالك صراحةً «ابدأ» أو «نفّذ البند كذا» أو «اكمل البند كذا».**

- ترخيصك الحالي: **قراءة وتحقّق فقط** (قراءة ملفات، `git log`/`git status`، `curl /health`، بوابات القراءة، `adb shell dumpsys` للقراءة).
- الممنوع الآن: أي كتابة داخل `D:\autoclaw projects-new\AiRemote` أو `D:\autoclaw projects\offline-build-tools`، وأي `adb install`/`am force-stop`/`settings put`، وأي `pnpm build` أو `electron-builder` أو `gradle`.
- كل ما في هذا الملف **منجَز ومُثبَّت** إلا ما هو موسوم صراحةً **«معلّق»** في §4.
- إن وجدت رقمًا مختلفًا عمّا هنا: **لا تُصلح شيئًا**. أبلِغ المالك بالفرق وانتظر.
- أي تعديل قبل الإذن = خرق، حتى لو بدا إصلاحًا واضحًا أو سطرًا واحدًا.

**كلمات فكّ التوقّف الوحيدة (من المالك فقط):** «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ».

**قبل أي شيء آخر:** اقرأ تقرير الإغلاق الأخير — `D:\autoclaw projects-new\AiRemote\docs\تقرير-إغلاق-3.16.17.md` — فهو يشرح ما نُفِّذ في الجولة الأخيرة، وما تحقّق حيًّا، وما بقي. لا تُصلح شيئًا منه بلا أمر.

---

## 0.1) الحالة المقيسة الآن (2026-11-12 · بعد r15)

| البند | القيمة | كيف تُتحقَّق |
|---|---|---|
| الفرع | `feat/screen-unify-3.13.0` | `git branch --show-current` |
| آخر التزام (وثيقة) | `db99417` (تقرير 3.16.17) | `git log --oneline -1` |
| آخر التزام (إصدار) | `112c72f` (بيان 3.16.17) | `git log --oneline -1 -- releases/manifest.json` |
| التزام الميزات | `b3bba64` | `git log --oneline -6` |
| `VERSION` | **3.16.17** | `Get-Content VERSION` |
| `versionCode` أندرويد | **107** | `packages/android-agent/app/build.gradle` |
| **السيرفر المثبَّت** | **3.16.17** على **3001** (TLS) | `curl.exe -k -s https://127.0.0.1:3001/health` |
| **حزمة 3.16.17** | Setup = **159,432,053 B** · zip = **212,176,875 B** | `releases/server-windows/` |
| **وكيل ويندوز 3.16.17** | Setup = **76,402,735 B** · zip = **104,017,246 B** · **مثبَّت ويعمل** | `releases/agent-windows/` + `Get-Process` |
| **APK أندرويد 3.16.17** | **239,520 B** · موقّع **v2+v3** · `versionCode 107` · مثبَّت على **المحاكي + TECNO** | `releases/android-agent/` + `adb shell dumpsys` |
| البيان | **3.16.17 · 65 عنصرًا · signature OK · all artifacts match** | `node scripts/release-manifest.js --verify` |
| توافق الإصدار | **PASS** (كل المصادر + `/health` + البيان) | `node scripts/check-version-consistency.cjs` |
| بوابة التحقق | **56/57** — الفشل الوحيد `e2e: sessions export` (بيئي) | `node scripts/verify.js` |
| الأسطول | **5 أجهزة**: Android-Emulator · TECNO-KL4 · WIN10-VM · WIN11-VM · TAB16-USB (offline) | `/api/devices` |
| أجهزة adb الآن | `emulator-5554` · `12927374CM001019` (TECNO) · `GPSZ2025040701858` (جهاز جديد موصول — لم يُستخدم في الجولة) | `adb devices` |
| شجرة git | نظيفة إلا أرشيف `artifacts/*.apk` + وثيقتان قديمتان غير متتبَّعتين في `docs/` | `git status --short` |

> «غير متصل» يعني **الوكيل غير مُشغَّل الآن**، لا عيبًا.

### 0.1.1) أول 10 دقائق — تحقّق ثم قف

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git branch --show-current                          # feat/screen-unify-3.13.0
git rev-parse --short HEAD                         # آخر التزام (docs 3.16.17)
git log --oneline -1 -- releases/manifest.json      # 112c72f
Get-Content VERSION                                # 3.16.17
curl.exe -k -s https://127.0.0.1:3001/health       # 3.16.17
node scripts/release-manifest.js --verify          # 3.16.17 · signature OK
node scripts/check-version-consistency.cjs         # PASS
Get-ChildItem releases\server-windows -Filter '*3.16.17*'
Get-ChildItem releases\agent-windows  -Filter '*3.16.17*'
Get-ChildItem releases\android-agent  -Filter '*3.16.17*'
adb devices                                        # TECNO + emulator + GPSZ…
```

**بعدها توقّف.** لا تبنِ «للتأكيد»، ولا تثبّت، ولا تُصلح فرقًا.

**حالة وكيلي التجربة الآن:**
- **المحاكي** (`emulator-5554`): 3.16.17 · لغة `ar` · ثيم `dark` · متصل · **الالتقاط ممنوح** (تحقق حي: كتلة `screenshot` نُفِّذت وأعادت صورة) · إمكانية الوصول ممنوحة.
- **TECNO** (`12927374CM001019`): 3.16.17 · متصل · **«التقاط جاهز»** · إمكانية الوصول ممنوحة.
- **GPSZ2025040701858**: جهاز adb جديد ظهر في نهاية الجولة — **لم يُثبَّت عليه شيء ولم يُستخدم**.

---

## 0.2) الوصول والحسابات (لا قيم سرّية داخل المستودع)

| ما | أين / كيف |
|---|---|
| حساب اللوحة | `admin@airemote.local` (دور `admin`) — **كلمة المرور عند المالك فقط** |
| حسابان احتياطيان | `admin@airemote.io` · `lab-probe@local` |
| قاعدة البيانات | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` (قراءة فقط) |
| مفاتيح التوقيع | `C:\Users\admin\AppData\Roaming\AiRemote\signing\airemote-release.jks` · alias **`airemote`** · كلمة المرور في `keystore-password.txt` |
| مفتاح AI | في `settings.aiApiKey` (51 محرفًا) — لا يُطبع |
| بوت Telegram | `settings.telegramToken` (48) · المحادثة `1029428155` |

**قاعدة صارمة:** أي سرّ يُقرأ من البيئة (`PANEL_PASS` · `AEMAIL` · `APASS` · `AI_KEY` · `TG_TOKEN` · `TG_CHAT`) أو عند المالك. لا يُكتب في مستودع ولا في وثيقة ولا في التزام ولا في مخرَج أداة.

**قراءة القاعدة من Node:** `require("node:sqlite").DatabaseSync` (Node 24) — `better-sqlite3` مبني لـElectron.

**ملاحظة عملية:** سكربتات القياس تقرأ كلمة المرور من `$env:PANEL_PASS`. رموز الجلسات في القاعدة **مجزَّأة (hash)** ولا تُعاد.

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

---

## 0.4) الأجهزة (مقيسة الآن)

| الجهاز | الحالة | الإصدار | ملاحظة |
|---|---|---|---|
| **TECNO-KL4** | **online** | **107 / 3.16.17** | `serial 12927374CM001019` · **الالتقاط ممنوح** · إمكانية الوصول ممنوحة |
| **Android-Emulator** | **online** | **107 / 3.16.17** | Android 9 (API 28) · شاشته **أفقية 1600×900** · **الالتقاط ممنوح** · a11y ممنوحة · **FileBridge مثبَّت هنا** |
| GPSZ2025040701858 | adb device | — | ظهر نهاية الجولة · **لم يُستخدم** |
| TAB16-USB | offline | — | خارج الخدمة |
| WIN10-VM | online | غير مقيس | وكيل ويندوز |
| WIN11-VM | online | غير مقيس | وكيل ويندوز |
| **هذا الـPC** | السيرفر 3.16.17 + وكيل ويندوز 3.16.17 | — | الوكيل **مثبَّت ويعمل لكنه «متوقف»** وبلا `serverUrl`/`token` — لم يكن مسجلًا أصلًا |

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
| الأجهزة المسجّلة | 5 |
| المظهر | الوضع النهاري (في ملفات المعاينة: داكن) |
| الشريط العلوي | **Admin أقصى اليسار · AiRemote في الوسط تمامًا · الأدوات يمينًا · أزرار النافذة أقصى اليمين** |
| وضع تحكم أندرويد | «موافقة يدوية» افتراضيًا على المحاكي/TECNO |

---

## 0.6) ما أُنجز

### 0.6.1) 3.16.7 → 3.16.15 (مرجع كامل في r11–r14 — لا تُعِد تحليله)

- **3.16.7**: حجب `token` عن غير الأدمن · منع «عرض فقط» من التسجيل/الدقة · حارس آخر أدمن · بحث التدقيق · webhook `device_online` · بيان موقّع.
- **3.16.8–3.16.9**: الصفحات 1–15.
- **3.16.10**: إغلاق الديون الخمسة + اختبار الجدولة (16 فحصًا).
- **3.16.11**: `ORIENT-FOLLOW` + الثقة بدوران النافذة + مسرح `ORIENT-STAGE`.
- **3.16.12**: اتباع مقاس المحتوى الملتقط (`onCapturedContentResize` → `getCurrentWindowMetrics` → الدوران).
- **3.16.13**: الشريط العلوي (هوية يسارًا · شعار وسطًا).
- **3.16.14**: أزرار النافذة أقصى اليمين دائمًا.
- **3.16.15**: الأفقية على API<34 + تراكب التكبير.

### 0.6.2) 3.16.16 — جولة الواجهات + المعلّق

- **جولة الواجهات:** ترجمة كاملة لتبويبي المساعد/الدردشة في ويندوز · ثيم/لغة فوريان · أزرار نافذة يمينًا · RTL وثيم فاتح وأزرار ماركة في أندرويد · بحث السجل · حالات فراغ · أشرطة موارد · معالج بثيم.
- **قرار المالك:** تعطيل التنفيذ التلقائي لأوامر المساعد نهائيًا (يدوي + تأكيد للأوامر الخطرة).
- **تنفيذ المعلّق:** `verify.js` 56/57 · تثبيت على TECNO · `autoRunBlocks` معطّل · تغليف 3.16.16 (code 106 · بيان 60 عنصرًا) · أيقونات SVG · نص ثانوي 12px · مقطع أندرويد · «n من 8» · صفوف معالج أكثف.
- التقرير: `docs/تقرير-إغلاق-3.16.16.md`.

### 0.6.3) 3.16.17 — P1–P4 + S1–S3 (الجولة الأخيرة)

**P4 — عقد المساعد الذكي في أندرويد (ملف جديد `AiClient.java`):**
| المكوّن | التنفيذ |
|---|---|
| البث | `POST /api/ai/chat/stream` · SSE: أسطر `data: ` فقط · تجاهل `[DONE]` · تبنّي `conversationId` من أول حدث · `{"delta":…}` دلتا · `{"error":…}` نهائي |
| الحمولة | `{message, conversationId?, deviceId?, context}` — `context` يوجّه النموذج لاستخدام `shell/bash/screenshot/control` بدل PowerShell |
| الإيقاف | محلي `disconnect()` — لا طلب للسيرفر (مقابل `AbortController`) |
| المحادثات | `GET /api/ai/conversations?deviceId=` (مصفوفة خام) · `GET /api/ai/history?conversationId=&deviceId=` · `DELETE /api/ai/conversations/:id` · `aiConvId` في SharedPreferences (مقابل `airemote-ai-conv.json`) |
| التوثيق | `X-Device-Token` على كل نداء (نفس `aiAuth` في السيرفر) |
| تنفيذ الكتل | `shell/bash/cmd/sh` عبر `sh -c` (مهلة 120ث · 20k/4k) · `screenshot` عبر MediaProjection (`captureToFile`) → `data:image/jpeg;base64` · `control` عبر `AiRemoteA11y` (12 أمرًا) · `powershell`/`record` رفض واضح |
| الأمان | `isDangerous` (نفس قائمة ويندوز) + تأكيد صريح + **لا تنفيذ تلقائي** |

**P1 — فقاعات:** فقاعات للمساعد ودردشة المشاهدين (RTL صحيح) · كتل كود مع نسخ/تنفيذ/نتيجة/صورة · زر «السجل» (قائمة/تحميل/حذف) · استرجاع آخر محادثة عند الاتصال · البقاء بعد `recreate()`.

**P2 — بطاقة الجهاز:** IP المحلي + IP العام (`api.ipify.org` مرة واحدة → `info.ipPublic`) مع نسخ · معرّف يُنسخ بضغطة طويلة.

**P3 — السجل والقوة:** مستويات `I/W/E` (9 مواضع في الخدمة) · فلترة الكل/معلومات/تحذيرات/أخطاء · تصدير إلى التنزيلات (`MediaStore`, API 29+) أو مجلد التطبيق · شريط قوة كلمة السر (4 مستويات).

**S1:** شارات «التقاط جاهز/غير ممنوح» + «بث مباشر» تتحدث من نبض القلب.
**S2:** أزرار 44dp (XML + المبنية برمجيًا).
**S3:** `sans-serif-medium` للعناوين.

**التحقق الحي (أدلة في `handoff\shots-2026-11-12-31616\`):**
- المحاكي: «hello» → فقاعة زرقاء → رد عربي متدفق → زر إيقاف ظهر واختفى.
- المحاكي: كتلة `screenshot` نُفِّذت → صورة داخل الفقاعة + `screenshot-ok` + تم (exit 0).
- المحاكي: كتلة `bash: ls /sdcard` نُفِّذت → تم (exit 0) + قائمة المجلدات.
- TECNO: v3.16.17 · «التقاط جاهز» · IP محلي/عام.
- المحاكي: شريط القوة «جيدة» لـ`Test1234`.

**الالتزامات:** `b3bba64` (ميزات) · `e3191be` (الإصدار) · `fcbe7da` (البناء) · `112c72f` (البيان) · `db99417` (التقرير).

**التقرير:** `docs/تقرير-إغلاق-3.16.17.md` (ونسخة في `handoff\reports\`).

---

## 1) ما أُغلق ولا يُعاد فتحه

| البند | الدليل |
|---|---|
| حجب `token` عن غير الأدمن (3 أسطح) | `4b1c849` · `a0c31b0` · `18ef9e9` |
| منع «عرض فقط» من التسجيل/الدقة | `048cd87` |
| حارس آخر أدمن · تعليمات تثبيت صادقة | `4b4674c` · `d47a6ae` |
| صفحات 1–15 · الديون 1–5 | r12/r14 §0.6.1 |
| مسرح الجدار الموحّد · اتباع الاتجاه | `435242f` · `26ddcac` |
| الشريط: هوية يسارًا وشعار وسطًا | `77d549d` (3.16.13) |
| أزرار النافذة أقصى اليمين | `16aa478` (3.16.14) |
| الأفقية على API<34 + تراكب التكبير | `761293f` (3.16.15) |
| جولة الواجهات (ويندوز+أندرويد) | `bf817e7` · `96e72a0` · `15af583` |
| تعطيل التنفيذ التلقائي | `84bb0e8` (3.16.16) |
| **P1 فقاعات · P2 بطاقة جهاز · P3 سجل/قوة · P4 عقد المساعد · S1–S3** | **`b3bba64` (3.16.17)** |

---

## 2) الفخاخ المثبتة — محدَّثة

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

### جديدة — 3.16.12 → 3.16.17
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
35. **`uiautomator dump` قد يعيد ملفًا قديمًا** عند `null root node` — **وقعنا فيها في r15**: ملف شاشة الرئيسية قرِئ كأنه الواجهة. لا تثق؛ استخدم `screencap`.
36. **`SetupActivity` غير مُصدَّرة** (`exported=false`) — لا تفتحها بـ`am start` (يفشل صامتًا أو يعيد النشاط الحالي)؛ افتحها بنقرة «معالج التهيئة» داخل التطبيق.
37. **شريط الحالة المخفي يلتهم اللمسات** — أهداف 32dp+ وحشوة insets.
38. **`btn_ghost` بلون `app_surface`** — داخل البطاقات استخدم `btn_soft`.
39. **`input_bg` = `app_sunken`** — لا تعده إلى `app_surface`.
40. **`ProgressBar` الافتراضية صفراء** — استخدم `progressTint`.
41. **`am start -S` يقتل العملية ويعيد تشغيلها** — لا تخلطه بـ`onNewIntent`.
42. **توقيع APK**: `JAVA_HOME` + ملف كلمة مرور واحد يصلح للمخزن والمفتاح لكن **مرر ملفين منفصلين** لـapksigner.
43. **`install -r` بنفس `versionCode` يحفظ البيانات** لكنه يُسقط الالتقاط وa11y.
44. **`assembleRelease` بلا signingConfig** ينتج APK غير موقّع — zipalign ثم apksigner ثم verify.
45. **طلب إذن الالتقاط التلقائي مقيّد مرة كل 6 ساعات** (`cap_ask_at` في SharedPreferences). بعد إعادة التثبيت قد لا يظهر الحوار؛ المسار المضمون: **معالج التهيئة → التقاط الشاشة → فتح الإعداد** (يستدعي `requestCapture` بلا المهلة).
46. **`adb shell input text` مع مسافات يفشل في PowerShell** — الصيغة العاملة: `adb shell "input text 'take a screenshot'"` (أحادية داخل مزدوجة).
47. **`FileBridge` مثبَّت على المحاكي ويقفز للمقدمة** أثناء اللمس/الأوامر — لا تعمل عليه (مشروع المالك المنفصل)؛ أعد فتح AiRemote بـ`am start` وتحقّق بلقطة.
48. **`TextView` الفقاعات تُبنى برمجيًا** — أي تعديل تخطيط يجب أن يحافظ على `ai_rows`/`chat_rows` و`ai_empty`/`chat_empty`.
49. **`AiClient` يستخدم `HttpURLConnection` فقط** (لا OkHttp في المشروع) — لا تضف اعتمادية جديدة بلا إذن.
50. **بث SSE يستمر بعد مغادرة التبويب** — أوقفه بزر «إيقاف» أو `AiClient.stop()`.

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
D:\autoclaw projects-new\AiRemote-handoff\shots-2026-11-12-ui\        # 35 لقطة جولة الواجهات
D:\autoclaw projects-new\AiRemote-handoff\shots-2026-11-12-31616\     # لقطات 3.16.16/3.16.17
D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-12-ui\        # 13 أداة + أدوات r15
```
> نُسخت هذه الأدوات خارج مساحة العمل **لأن مساحة العمل تتبع الحساب**. الحساب الجديد يقرأها من المسار أعلاه مباشرة.

**القياس والبث:** `screen-measure.cjs` · `screen-timeline.cjs` · `grab-frame.cjs` · `capture-screen.cjs` · `screen-size.cjs` · `hold-stream.cjs` · `ui-dump.cjs`.

**الواجهة/الشريط:** `shot-titlebar.cjs` · `test-titlebar.cjs` · `test-titlebar2.cjs` · `repro-zoom.cjs` · `test-zoom-live.cjs` · `diag-wall.cjs` · `diag-wall2.cjs`.

**الرقعة والبناء:** `patch-titlebar.cjs` · `patch-titlebar-css.cjs` · `patch-win-btns.cjs` · `patch-win-css.cjs` · `patch-win-fix.cjs` · `patch-orient-31615.cjs` · `patch-sv-31615.cjs` · `bump-31613.cjs` · `bump-31614.cjs` · `bump-31615.cjs`.

**جولة الواجهات + r15:** `patchlib.py` · `patch_win.py` · `patch_android_res.py` · `patch_android_java.py` · `patch_titlebar.py` · `patch_empty_states.py` · `patch_fields.py` · `patch_hints.py` · `strip_logs.py` · `fix_verchip.py` · `shot-preview.cjs` · `uidump.py` · `bump-31616.cjs` · **`bump-31617.cjs`** · `add_strings_31617.py` · `patch_main2.py` · `log_levels.py` · `fix_d.py` · `parse_ui*.py`.

**قاعدة الجلسات (قراءة فقط):** `db-schema.cjs` · `db-token-shape.cjs` · `db-tickets-shape.cjs`.

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
# التقاط الشاشة: معالج التهيئة → التقاط الشاشة → فتح الإعداد → البدء الآن (والتطبيق في المقدمة)
```

---

## 4) ما بقي — **معلّق بانتظار أمر المالك**

### 4.1) مغلق في 3.16.17
P1 · P2 · P3 · P4 · S1 · S2 · S3 — جميعها منفَّذة ومختبرة حيًّا (عدا بند 4.2/1).

### 4.2) معلّق
1. **اختبار كتلة `control` داخل جلسة حية** — أُرسلت رسالة «tap on the Log tab» إلى المساعد على المحاكي لكن **لم يُضغط زر التنفيذ**؛ الكود جاهز ويعتمد على `AiRemoteA11y`.
2. **تشغيل وكيل ويندوز على هذا الـPC** — مثبَّت 3.16.17 ويعمل لكنه «متوقف» وبلا `serverUrl`/`token`؛ يحتاج **رمز جهاز من المالك** (من اللوحة).
3. **منح التقاط على أي جهاز جديد** (GPSZ…) — لم يُثبَّت عليه شيء.

### 4.3) تحسينات اختيارية (ليست عيوبًا)
- شارة «عدد المشاهدين» حين يوفرها الخادم (اليوم لا تُرسل).
- `RecyclerView` بدل `LinearLayout` إن تجاوزت المحادثة مئات الفقاعات (اليوم سقف 200).
- `powershell` على أندرويد: رفض واضح حاليًا؛ يمكن لاحقًا تحويلها إلى `sh` مع تنبيه.

### 4.4) ديون بنيوية باقية (لا تُفتح بلا قرار)
- `packages/server` (TS) لا يُشحن — أي إصلاح فيه يجب تكراره في `server-desktop/server.js`.
- `static/` يحمل نسخة مبنية من الواجهة داخل git (مقصود).
- `aiConfigs`/`ai_config` مكرّران في `settings`.
- صفحة 15 (`/dev/ui`) تطوير فقط.

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
5. **لا أسرار** في المستودع/الالتزامات/المخرجات.
6. **لا تلمس عقد API** ولا تصميم سطح بلا قرار مالك — **والشريط العلوي مستثنى: ترتيبه محدَّد في §0.5 ولا يُزال أي زر منه.**
7. **أي تغيير في محتوى الحزمة يرفع الرقم** في المصادر السبعة + `versionCode` + البيان.
8. **بوابة جديدة تحتاج إثبات عضّ** + خط أساس بأسباب.
9. **⛔ لا تنفّذ شيئًا بلا إذن المالك.**
10. **التقارير في مساحة عمل AutoClaw** ثم **تُنسخ فورًا إلى القرص** (`D:\autoclaw projects-new\AiRemote-handoff\reports\`) — مساحة العمل تتبع الحساب وقد تُفقد عند تسجيل الخروج.
11. **أي أداة أو سكربت جولة يُنسخ إلى** `handoff\tools-YYYY-MM-DD-\` — لا تعتمد على مساحة الحساب.

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
| **`تقرير-إغلاق-3.16.16.md`** | تنفيذ المعلّق: تحقق 56/57 · autoRunBlocks · تغليف 3.16.16 |
| **`تقرير-إغلاق-3.16.17.md`** | **P1–P4 + S1–S3 كاملة + أدلة حية** |

> نسخ Markdown محفوظة في `D:\autoclaw projects-new\AiRemote-handoff\reports\`.

---

## 8) نقطة التوقّف الدقيقة

**آخر ما كان جاريًا:** جولة 3.16.17 — **اكتملت وأُغلقت**.

- **الالتزامات:** `b3bba64` (الميزات) · `e3191be` (الإصدار) · `fcbe7da` (البناء) · `112c72f` (البيان) · `db99417` (التقرير). الشجرة نظيفة إلا أرشيف `artifacts/` ووثيقتان قديمتان في `docs/`.
- **السيرفر:** 3.16.17 مثبَّت ويعمل (`/health`).
- **وكيل ويندوز (هذا الـPC):** 3.16.17 مثبَّت ويعمل، **«متوقف»** وبلا عنوان/رمز — لم يكن مسجلًا قبل الجولة أصلًا.
- **المحاكي:** 3.16.17 · متصل · **الالتقاط ممنوح** · a11y ممنوحة · فقاعات + بث + screenshot + bash مختبرة حيًّا.
- **TECNO:** 3.16.17 · متصل · «التقاط جاهز» · IP محلي/عام ظاهران.
- **آخر فعل في الجولة:** إرسال «tap on the Log tab» إلى مساعد المحاكي — الرد وصل كتلة `control` **ولم تُنفَّذ** (بقي زر «تنفيذ» غير مضغوط).
- **`verify.js`:** 56/57 (الفشل البيئي فقط).
- **البيان:** 65 عنصرًا · signature OK.

**نقطة الاستئناف:** اقرأ هذا الملف + `تقرير-إغلاق-3.16.17.md`، ثم قِس (§0.1.1) و**قف**. الأوامر المتوقعة أولًا: «اختبر control» أو «شغّل وكيل ويندوز» أو «ابنِ 3.16.18».

**نهاية r15.** قف هنا حتى يأمر المالك.

---

## 9) ملحق — FileBridge (مشروع منفصل، لا تخلطه)

- المسار: `D:\autoclaw projects-new\FileBridge` · واجهة موحّدة (شريط علوي واحد، ثيم ليلي/نهاري، EN/ع، شاشة ملفات بنمط AnyDesk).
- حالة التسليم السابقة: Setup 1.0.1.exe **111,419,899 B** · SHA `f9994328…ab6b6` · APK **99,946 B** · SHA `a32d6479…f4d9`.
- **مثبَّت على محاكي AiRemote** ويقفز للمقدمة أحيانًا (فخّ #47) — لا تعمل عليه إلا بأمر مالك صريح.
