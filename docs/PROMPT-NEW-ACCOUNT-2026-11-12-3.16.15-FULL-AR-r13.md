# استئناف AiRemote — 2026-11-12 · الإصدار **3.16.15** — نسخة **r13**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-11-3.16.11-FULL-AR-r12.md` وكل ما قبله.**
> كل رقم هنا **مقيس في 2026-11-12** على الجهاز نفسه، لا منقولًا من وثيقة.
> سببه: انتقال المالك إلى حساب AutoClaw جديد. المستودع وقاعدة البيانات ومفاتيح التوقيع **على القرص**، فلا يتأثر شيء بتغيير الحساب.

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا ويُحترم حرفيًا

**قِف هنا. لا تنفّذ أي إجراء — لا بناء، لا تثبيت، لا تعديل ملف، لا `git commit`، لا تشغيل سكربت يكتب — حتى يقول المالك صراحةً «ابدأ» أو «نفّذ البند كذا» أو «اكمل البند كذا».**

- ترخيصك الحالي: **قراءة وتحقّق فقط** (قراءة ملفات، `git log`/`git status`، `curl /health`، بوابات القراءة، `adb shell dumpsys` للقراءة).
- الممنوع الآن: أي كتابة داخل `D:\autoclaw projects-new\AiRemote` أو `D:\autoclaw projects\offline-build-tools`، وأي `adb install`/`am force-stop`/`settings put`، وأي `pnpm build` أو `electron-builder` أو `gradle`.
- كل ما في هذا الملف **منجَز ومُثبَّت** إلا ما هو موسوم صراحةً **«معلّق»** في §4. لا شيء قيد التنفيذ الآن.
- إن وجدت رقمًا مختلفًا عمّا هنا: **لا تُصلح شيئًا**. أبلِغ المالك بالفرق وانتظر.
- أي تعديل قبل الإذن = خرق، حتى لو بدا إصلاحًا واضحًا أو سطرًا واحدًا.

**كلمات فكّ التوقّف الوحيدة (من المالك فقط):** «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ».

---

## 0.1) الحالة المقيسة الآن (2026-11-12 · بعد r13)

| البند | القيمة | كيف تُتحقَّق |
|---|---|---|
| الفرع | `feat/screen-unify-3.13.0` | `git branch --show-current` |
| آخر التزام برمجي | **`24f4b28`** (`chore(release): sign the 3.16.15 manifest`) | `git log --oneline -1 -- releases/manifest.json` |
| `VERSION` | **3.16.15** | `Get-Content VERSION` |
| `versionCode` أندرويد | **105** | `packages/android-agent/app/build.gradle` |
| **السيرفر المثبَّت** | **3.16.15** على **3001** (TLS) | `curl.exe -k -s https://127.0.0.1:3001/health` |
| **حزمة 3.16.15** | Setup = **159,432,111 B** · zip = **212,177,580 B** | `releases/server-windows/` |
| **وكيل ويندوز 3.16.15** | Setup = **76,401,404 B** · zip = **104,015,818 B** · **مثبَّت ويعمل** | `releases/agent-windows/` + `Get-Process` |
| **APK أندرويد 3.16.15** | **202,023 B** · موقّع v2+v3 · **مثبَّت على TECNO والمحاكي** | `releases/android-agent/` + `adb shell dumpsys` |
| البيان | **3.16.15 · 55 عنصرًا · signature OK · all artifacts match** | `node scripts/release-manifest.js --verify` |
| توافق الإصدار | **PASS** (كل المصادر + `/health` + البيان) | `node scripts/check-version-consistency.cjs` |
| بوابة التحقق | **لم تُعَد لـ3.16.15** — آخر نتيجة مؤكدة **56/57** عند 3.16.13 (الفشل الوحيد بيئي) | `node scripts/verify.js` |
| الأسطول | **5 أجهزة**: Android-Emulator · TECNO-KL4 · WIN10-VM · WIN11-VM (online) · TAB16-USB (offline) | `/api/devices` |
| مستند r13 | التزام `docs:` لاحق يحتوي هذا الملف (هاشه يتغيّر مع كل تعديل — لا تعتمد عليه) | `git log --oneline -1 -- docs/` |
| شجرة git | نظيفة إلا `packages/server-desktop/tunnel.bundle.js` (معدَّل، أثر بناء) + `docs/PROMPT-...-r12-STOP.md` غير المتتبَّع | `git status --short` |

> «غير متصل» يعني **الوكيل غير مُشغَّل الآن**، لا عيبًا.

### 0.1.1) أول 10 دقائق — تحقّق ثم قف

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git branch --show-current                          # feat/screen-unify-3.13.0
git rev-parse --short HEAD                         # آخر التزام (قد يكون docs r13)
git log --oneline -1 -- releases/manifest.json      # 24f4b28
Get-Content VERSION                                # 3.16.15
curl.exe -k -s https://127.0.0.1:3001/health       # 3.16.15
node scripts/release-manifest.js --verify          # 3.16.15 · signature OK
node scripts/check-version-consistency.cjs         # PASS
Get-ChildItem releases\server-windows -Filter '*3.16.15*'
Get-ChildItem releases\agent-windows  -Filter '*3.16.15*'
Get-ChildItem releases\android-agent  -Filter '*3.16.15*'
adb devices                                        # TECNO + emulator-5554
```

**بعدها توقّف.** لا تبنِ «للتأكيد»، ولا تثبّت، ولا تُصلح فرقًا.

---

## 0.2) الوصول والحسابات (لا قيم سرّية داخل المستودع)

| ما | أين / كيف |
|---|---|
| حساب اللوحة | `admin@airemote.local` (دور `admin`) — **كلمة المرور عند المالك فقط** |
| حسابان احتياطيان | `admin@airemote.io` · `lab-probe@local` |
| الحساب المؤقت `ui-audit@local` | **حُذف نهائيًا** |
| قاعدة البيانات | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` (قراءة فقط) |
| مفاتيح التوقيع | `C:\Users\admin\AppData\Roaming\AiRemote\signing\airemote-release.jks` · alias **`airemote`** · كلمة المرور في `keystore-password.txt` |
| مفتاح AI | في `settings.aiApiKey` (51 محرفًا) — لا يُطبع |
| بوت Telegram | `settings.telegramToken` (48) · المحادثة `1029428155` |

**قاعدة صارمة:** أي سرّ يُقرأ من البيئة (`PANEL_PASS` · `AEMAIL` · `APASS` · `AI_KEY` · `TG_TOKEN` · `TG_CHAT`) أو عند المالك. لا يُكتب في مستودع ولا في وثيقة ولا في التزام ولا في مخرَج أداة.

**قراءة القاعدة من Node:** `require("node:sqlite").DatabaseSync` (Node 24) — `better-sqlite3` قد يكون مبنيًا لـElectron.

**ملاحظة سرّية عملية:** سكربتات القياس تقرأ كلمة المرور من `$env:PANEL_PASS`. لا تُكتب في أي ملف. رموز الجلسات في القاعدة **مجزَّأة (hash)** ولا تُعاد، فالتذكرة/الجلسة لا يمكن استنساخها من القاعدة.

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
| **TECNO-KL4** | **online** | **105 / 3.16.15** | `serial 12927374CM001019` · يحتاج `am force-stop`+`am start` وإعادة منح `MediaProjection` بعد آخر `install -r` |
| **Android-Emulator** | **online** | **105 / 3.16.15** | Android 9 (API 28) · شاشته **أفقية 1600×900** · معالج الصلاحيات مفتوح سابقًا · **الالتقاط غير ممنوح بعد إعادة التثبيت** |
| 127.0.0.1:5555 | كان 105 | — | اتصال شبكي انقطع الآن |
| 192.168.1.12:5555 | كان 105 | — | اتصال شبكي انقطع الآن |
| TAB16-USB | offline | — | خارج الخدمة |
| WIN10-VM | online | غير مقيس | وكيل ويندوز |
| WIN11-VM | online | غير مقيس | وكيل ويندوز |
| **هذا الـPC** | السيرفر 3.16.15 + وكيل ويندوز 3.16.15 | — | كلاهما يعمل |

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

---

## 0.6) ما أُنجز — من 3.16.7 إلى 3.16.15

### 0.6.1) 3.16.7 → 3.16.11 (مرجع كامل في r11/r12 — لا تُعِد تحليله)

- **3.16.7**: حجب `token` عن غير الأدمن · منع «عرض فقط» من التسجيل/الدقة · حارس آخر أدمن · بحث التدقيق · webhook `device_online` · بيان موقّع.
- **3.16.8–3.16.9**: الصفحات 1–15 (غرفة العمليات · الأجهزة · مساحة الجهاز · الملفات · الجلسات · الإعدادات · المستخدمون · العارض · التنبيهات · سجل التدقيق · المساعد · المساعدة · الملفات · الدخول · التهيئة · المعرض).
- **3.16.10**: إغلاق الديون الخمسة (`packages/server` parity · اختبار الجدولة 16 فحصًا · `server_errors` بلا مستخدم · استهداف جهاز في قاعدة التنبيه · تعديل المهمة).
- **3.16.11**: `ORIENT-FOLLOW` (`67388bf`) + الثقة بدوران النافذة (`1810934`) + مسرح `ORIENT-STAGE` على الجدار (`435242f`).

### 0.6.2) 3.16.12 — اتباع مقاس المحتوى الملتقط

**العطب المقيس:** على TECNO، **عملية الوكيل (مالكة `MediaProjection`)** تقرأ `Display.getRotation()=ROTATION_0` و`720×1600` بينما تطبيق آخر على نفس الجهاز يقرأ `rot=1` و`1600×720` في اللحظة نفسها. فبقي المسرح عموديًا والبثّ يرسل الشاشة الأفقية محشورة في شريط أسود.

**الإصلاح (`26ddcac`):** مصدر الحقيقة الأول `MediaProjection.Callback.onCapturedContentResize` (يُطبَّق في نفس الدورة بلا انتظار 350ms)، ثم `WindowManager.getCurrentWindowMetrics()`، ثم دوران الشاشة/الحسّاس. سجل التشخيص صار `diag rot=… land=… src=… mp=WxH wm=WxH phys=… cur=… vd=…`.

**القياس بعد الإصلاح:** عمودي 720×1600 بعد 400ms · أفقي 1600×720 بعد **922ms** · عودة 660ms · لا أشكال وسيطة.

### 0.6.3) 3.16.13 — الشريط العلوي (طلب المالك)

| الالتزام | المحتوى |
|---|---|
| `77d549d` | الشعار في **عمود أوسط مستقل** (grid `1fr auto 1fr`) · الهوية (Admin) أقصى اليسار · التنقل بعدها · الأدوات يمينًا |
| `4f1a778` | `release: 3.16.13` (المصادر السبعة + `versionCode 103`) |
| `636e0a1` | بيان 3.16.13 |

القياس (نافذة 1600×900): مركز الشريط **788** · مركز زر AiRemote **790** (فرق 2px) · Admin عند **33**.

### 0.6.4) 3.16.14 — أزرار النافذة أقصى اليمين

| الالتزام | المحتوى |
|---|---|
| `16aa478` | تصغير/تكبير/إغلاق **أقصى اليمين دائمًا**، بلا شرط `windowCtl` (تظهر في المتصفح أيضًا) · لا زر أُزيل |
| `5c2cd7e` | `release: 3.16.14` (code 104) |
| `5f5f9ff` | بيان 3.16.14 |

**الترتيب النهائي (أمر مالك دائم):** `[Admin] [فاصل] [الأجهزة] [المساعد] [الجلسات] ‖ [AiRemote v] ‖ [إضافة بث] [بحث] [تنبيهات] [مساعدة] [إعدادات] [ثيم] [لغة] ‖ [─][□][✕]`.
**ممنوع إزالة أي زر** — الترتيب فقط مسموح.

### 0.6.5) 3.16.15 — الأفقية على Android 9–13 + تراكب التكبير

**عطب ثانٍ مقيس (المحاكي، API 28، شاشة 1600×900):**
```
diag rot=0 land=false src=rot mp=0x0 wm=0x0 phys=1600x900 cur=900x1600 vd=900x1600
```
`getRealMetrics` أعادت **1600×900** (أفقية صحيحة)، لكن `getRotation()` أعادت 0، والكود كان يقلب الأبعاد حسب `appliedLand` فيحوّل 1600×900 إلى 900×1600.

**السبب البنيوي:** `onCapturedContentResize` **API 34 فقط**، و`getCurrentWindowMetrics` **API 30+**؛ على API 28–33 لا يصلح أي منهما.

**الإصلاح (`761293f`):**
1. **الوكيل:** إذا كانت المقاييس نفسها أفقية (`physW > physH`) تُستخدم كما هي بلا قلب، وتُصبح مصدر الاتجاه `src=phys` بعد `mp` ثم `wm`.
2. **العارض:** مسار الدلتا الثنائي صار يحترم `needKeyRef` (كان مسار JSON فقط)، وعند تغيّر `viewZoom` تُمسح اللوحة ويُطلب إطار كامل — فلا تراكب بعد التكبير/التصغير.

| الالتزام | المحتوى |
|---|---|
| `761293f` | الإصلاحان معًا |
| `fbde1e8` | `release: 3.16.15` (code 105) |
| `ba09ca6` | `chore(build)` نسخة الواجهة في `static` |
| `24f4b28` | بيان 3.16.15 (55 عنصرًا) |

---

## 1) ما أُغلق ولا يُعاد فتحه

| البند | الدليل |
|---|---|
| حجب `token` عن غير الأدمن (3 أسطح) | `4b1c849` · `a0c31b0` · `18ef9e9` |
| منع «عرض فقط» من التسجيل/الدقة | `048cd87` |
| حارس آخر أدمن · تعليمات تثبيت صادقة | `4b4674c` · `d47a6ae` |
| صفحات 1–15 | 0.6.1 |
| الديون 1–5 | 0.6.1 (3.16.10) |
| مسرح الجدار الموحّد | `435242f` |
| اتباع الاتجاه عبر محتوى الإسقاط | `26ddcac` (3.16.12) |
| الشريط: هوية يسارًا وشعار وسطًا | `77d549d` (3.16.13) |
| أزرار النافذة أقصى اليمين | `16aa478` (3.16.14) |
| الأفقية على API<34 + تراكب التكبير | `761293f` (3.16.15) |

---

## 2) الفخاخ المثبتة — محدَّثة

### قديمة ما زالت تصدق
1. **السيرفر المثبَّت يخدم `app.asar`** (`server-desktop/server.js`) — لا `packages/server` (TS).
2. **قفل النسخة الواحدة في الوكيل** — اقتل/force-stop أي نسخة قبل أي مسبار.
3. **`versionCode` يزيد يدويًا** — أندرويد يرفض التثبيت إن لم يزد.
4. **`apksigner` يحتاج `JAVA_HOME`** و**ملفَّي كلمة مرور منفصلين** (`--ks-pass file:` و`--key-pass file:`).
5. **NSIS يمسح المجلد ~20–25 ثانية** — انتظر قبل الحكم بالفشل.
6. **`/api/auth/login` محدود 5/دقيقة**.
7. **`MediaProjection` يسقط بإعادة تثبيت APK وبـforce-stop** — يُمنح من شاشة النظام بعد كل مرة.
8. **مسار العارض `wss://…/screen?ticket=…`** لا `/ws`.
9. **`vmrun runProgramInGuest` لا يعيد stdout**.
10. **عربية PowerShell 5.1**: لا تكتب ملفًا عربيًا بـ`Set-Content`؛ لا تقرأ بـ`Get-Content` للعرض (mojibake) — استخدم `read`.
11. **`better-sqlite3` يتبع آخر عملية**: Node للاختبارات · Electron 119 للحزمة. فشل `e2e: sessions export` بعد الحزمة **بيئي**.
12. **أندرويد 13+**: لا بد من `MANAGE_EXTERNAL_STORAGE`.
13. **بوابة 56 لا ترسم صفحة** — أي كسر بصري يمرّ منها؛ القياس البصري أداة منفصلة.
14. **نهايات الأسطر مختلفة**: `server.js`/`ScreenViewer`/`control-room.css` = CRLF؛ أغلب الصفحات = LF. أي رقعة نصية يجب أن تحترمها (سكربتات `patch-*.cjs` تفعل).
15. **Gradle يجب أن يعمل في الخلفية** وإلا يُقتل.
16. **الحزمة تعيد كتابة `packages/server-desktop/static`** ⇒ التزام `chore(build)` أو شجرة متسخة.
17. **`settings` تحمل نسختين للمفاتيح** (`aiConfigs` و`ai_config`).
18. **الحسّاس يكذب على TECNO** — لا تعتمد عليه للاتجاه.
19. **`getRealMetrics` على TECNO يعيد العمودي دائمًا** (720×1600) مهما كان الدوران.
20. **ترويسة إطار العارض من السيرفر = 13 بايت**: `[w:4][h:4][seq:4][flags:1]` (21 مع dx/dy للدلتا). أي قياس خارجي يجب أن يستخدمها.
21. **`adb install -r` لا يكفي وحده**: `am force-stop` ثم `am start` إلزاميان لتحميل الكود الجديد.
22. **`uiautomator dump` هو وسيلة قراءة شاشة TECNO** — `read` على PNG يفشل هنا.
23. **لوحة المتصفح (`browser_tool`) قد تتصل وتكون بعرض ~398px** — غير صالحة لقياس شريط علوي؛ استخدم Chrome بلا واجهة عبر CDP (`scripts/shot-titlebar.cjs`).
24. **إيقاف التطبيقات الأخرى على الهاتف**: لا توقف تطبيقًا يستخدمه المالك إلا لضرورة، وأبلِغه.

### جديدة — 3.16.12 إلى 3.16.15
25. **`onCapturedContentResize` = API 34 فقط.** على Android 9–13 لا يُنادى أبدًا.
26. **`WindowManager.getCurrentWindowMetrics()` = API 30+.** لا تستدعِه بلا حارس `SDK_INT`.
27. **على Android 9–13 قد تعيد `getRealMetrics` المقاس الأفقي الصحيح (1600×900) بينما `getRotation()=0`** — فالثقة بالمقاس نفسه (`physW > physH`) لا بالدوران.
28. **إدخال المحاكي بإحداثيات غير مدوّرة:** عندما تكون الشاشة أفقية 1600×900، `input tap` يتوقّع فضاءً عموديًا. النقر على (x,y) أفقي ≈ `input tap y (1600−x)`. مثال مؤكد: زر عند (800,440) أفقي ⇒ `input tap 440 800`.
29. **إعادة تثبيت APK تُسقط اثنين:** `MediaProjection` **وخدمة إمكانية الوصول**. إعادة الالتقاط من المعالج والتطبيق في المقدمة، وإعادة الوصول بـ:
    `settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y`
30. **أول منح التقاط بعد إعادة تثبيت قد لا يُنتج إطارات** إن لم يكن التطبيق في المقدمة عند «البدء الآن» (يبقى `mp=0x0`). أعِد المنح بدورة نظيفة.
31. **نص إصدار واجهة الوكيل الأندرويدي**: كانت تُظهر `v3.15.0` من نشاط قديم؛ بعد إعادة التشغيل ظهرت `v3.16.15`. لا تثق بنص قديم على الشاشة — اعتمد `pm list packages --show-versioncode`.
32. **`e2e: web-server connection` قد يفشل** إذا كان السيرفر يُعاد تشغيله أثناء `verify.js` — أعِد التشغيل بعد استقراره.
33. **سكربتات القياس تحتاج `PANEL_PASS`** في البيئة، وتوقف جلسات البث المعلّقة قبل القياس (وإلا التصقت بمقاس قديم).
34. **جلسة العارض تُنشئ `VirtualDisplay`؛ إيقافها من اللوحة يطلقها.** ترْك جلسة معلّقة يجعل القياس التالي يقرأ مقاسًا قديمًا (320 عرضًا مثلًا) — امسح الجلسات أولًا.

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
D:\autoclaw projects-new\AiRemote-handoff\scripts\      # 41 سكربتًا
D:\autoclaw projects-new\AiRemote-handoff\reports\      # نسخ التقارير
D:\autoclaw projects-new\AiRemote-handoff\probe-rot\    # مشروع المسبار (مصدر فقط)
D:\autoclaw projects-new\AiRemote-handoff\README.md
```
> نُسخت هذه الأدوات خارج مساحة العمل **لأن مساحة العمل تتبع الحساب**. الحساب الجديد يقرأها من المسار أعلاه مباشرة.

**النسخة الأصلية (حساب الجولة السابقة، تبقى على القرص):**
`C:\Users\admin\AppData\Roaming\AutoClaw-oversea-official\accounts\0b02e74b…\projects\Default\scripts\`

**القياس والبث:**
| الملف | الدور |
|---|---|
| `scripts/screen-measure.cjs` | عمودي → أفقي → عمودي بالزمن (يوقف الجلسات المعلّقة أولًا) |
| `scripts/screen-timeline.cjs` | خط زمني CSV لكل إطار + علامات التدوير |
| `scripts/grab-frame.cjs` | يحفظ إطارًا كاملًا أثناء الأفقي |
| `scripts/capture-screen.cjs` | لقطة جهاز آمنة ثنائيًا: `node capture-screen.cjs <label> <serial>` |
| `scripts/screen-size.cjs` | يقرأ مقاس الشاشة من IHDR |
| `scripts/hold-stream.cjs` | يُبقي عارضًا متصلًا N ثانية |
| `scripts/ui-dump.cjs` | تفريغ شجرة الواجهة: `node ui-dump.cjs [serial]` |

**الواجهة/الشريط:**
| الملف | الدور |
|---|---|
| `scripts/shot-titlebar.cjs` | Chrome بلا واجهة 1600×900 → يقيس مواقع الأزرار + لقطة + اختبار نقر. `SHOT_BASE` يحدد العنوان (`http://localhost:5000` أو `https://127.0.0.1:3001`) |
| `scripts/test-titlebar.cjs` | نقر كل أزرار الشريط (تنقل/إضافة/بحث/مساعدة/إعدادات/ثيم/لغة) |
| `scripts/test-titlebar2.cjs` | اختبار مركّز: قائمة Admin + التنبيهات |
| `scripts/repro-zoom.cjs` · `test-zoom-live.cjs` | إعادة إنتاج التكبير/التراكب على الجدار |
| `scripts/diag-wall.cjs` · `diag-wall2.cjs` | تشخيص حالة البلاطة/البث |

**الرقعة والبناء:**
`patch-titlebar.cjs` · `patch-titlebar-css.cjs` · `patch-win-btns.cjs` · `patch-win-css.cjs` · `patch-win-fix.cjs` · `patch-orient-31615.cjs` · `patch-sv-31615.cjs` · `bump-31613.cjs` · `bump-31614.cjs` · `bump-31615.cjs`

**مسبار الاتجاه (APK منفصل، أُزيل من الجهاز):** `probe-rot/` — مشروع Gradle صغير يطبع `cfg/rot/realSize/wmBounds`. أثبت أن العطب في عملية الإسقاط لا في النظام.

**قاعدة الجلسات (قراءة فقط):** `db-schema.cjs` · `db-token-shape.cjs` · `db-tickets-shape.cjs`.

### 3.3) بناء أندرويد (متسلسلة مجرَّبة)
```powershell
$b='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME="$b\jdk"; $env:ANDROID_HOME="$b\sdk"; $env:ANDROID_SDK_ROOT="$b\sdk"
& "$b\gradle\bin\gradle.bat" -p packages\android-agent assembleRelease --console=plain --no-daemon   # في الخلفية
& "$b\sdk\build-tools\34.0.0\zipalign.exe" -f -p 4 <unsigned>.apk aligned.apk
& "$b\sdk\build-tools\34.0.0\apksigner.bat" sign --ks <jks> --ks-pass file:<f1> --key-pass file:<f2> --out AiRemote-Agent-Android-v<ver>.apk aligned.apk
& "$b\sdk\build-tools\34.0.0\apksigner.bat" verify --verbose <out>.apk
& "$b\sdk\platform-tools\adb.exe" -s <serial> install -r <out>.apk
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
**لا تستخدم `npm run build` في `agent-desktop`** — يفشل بسبب مسافة في المسار (`'D:\autoclaw' is not recognized`).

### 3.5) التحكم بدوران الشاشة للاختبار
```powershell
# TECNO (Android 14)
& $adb -s 12927374CM001019 shell cmd window user-rotation lock 1   # أفقي
& $adb -s 12927374CM001019 shell cmd window user-rotation lock 0   # عمودي
& $adb -s 12927374CM001019 shell cmd window user-rotation free
# المحاكي (Android 9): لا يدعم cmd window user-rotation
& $adb -s emulator-5554 shell "settings put system accelerometer_rotation 0; settings put system user_rotation 1"
```

### 3.6) إعادة الصلاحيات بعد تثبيت APK
```powershell
# إمكانية الوصول (بعد أي force-stop/تثبيت)
& $adb -s <serial> shell "settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y; settings put secure accessibility_enabled 1"
# التقاط الشاشة: من معالج التهيئة → «التقاط الشاشة» → «فتح الإعداد» → «البدء الآن»، والتطبيق في المقدمة
```

---

## 4) ما بقي — **معلّق بانتظار أمر المالك**

### 4.1) إغلاق التحقق من 3.16.15
1. `node scripts/verify.js` → المتوقع **56/57** (الفشل البيئي فقط). **لم تُعَد لـ3.16.15.**
2. **TECNO**: `am force-stop` + `am start` (لتحميل كود 105) ثم إعادة منح `MediaProjection` من المعالج، والتأكد من **٨/٨**.
3. **TECNO قياس**: عمودي 720×1600 · أفقي 1600×720 خلال ~1s · عودة — عبر `screen-measure.cjs`.
4. **المحاكي (API 28)**: منح الالتقاط، ثم قياس الأفقية — المتوقع بعد `761293f` أن يظهر `src=phys` وإطار **1600×900** بدل 900×1600.
5. **تراكب التكبير**: على الجدار، كبّر البلاطة/اقرص ثم صغّر — المتوقع ألّا يعود التراكب (العارض يمسح ويطلب إطارًا كاملًا).
6. **الجدار 16:9 contain**: كل الأجهزة في مسرح واحد بلا قصّ.

### 4.2) ديون بنيوية باقية (لا تُفتح بلا قرار)
- `packages/server` (TS) لا يُشحن — أي إصلاح فيه يجب تكراره في `server-desktop/server.js`.
- `static/` يحمل نسخة مبنية من الواجهة داخل git (مقصود حاليًا).
- `aiConfigs`/`ai_config` مكرّران في `settings`.
- صفحة 15 (`/dev/ui`) تطوير فقط.
- `packages/server-desktop/tunnel.bundle.js` معدَّل في الشجرة — أثر بناء؛ إما يُلتزَم أو يُرجَع.

### 4.3) الدين السادس — **لم يُحدَّد**
«شعار الترحيل مختلط الاتجاه»: لم يُعثر على «شعار ترحيل» في اللوحة بعد بحث. **يحتاج إشارة المالك**.

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
& 'D:\autoclaw projects-new\AiRemote\packages\server-desktop\node_modules\.bin\electron-builder.CMD' --win --x64 --config.directories.output=../../releases/server-windows

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
6. **لا تلمس عقد API** ولا تصميم سطح بلا قرار مالك — **والشريط العلوي مستثنى: ترتيبه محدَّد في §0.6.4 ولا يُزال أي زر منه.**
7. **أي تغيير في محتوى الحزمة يرفع الرقم** في المصادر السبعة + `versionCode` + البيان.
8. **بوابة جديدة تحتاج إثبات عضّ** + خط أساس بأسباب.
9. **⛔ لا تنفّذ شيئًا بلا إذن المالك.**
10. **التقارير في مساحة عمل AutoClaw** لا داخل المستودع.

---

## 7) التقارير المسلَّمة (في مساحة عمل AutoClaw)

| الملف | المحتوى |
|---|---|
| `تقرير-غرفة-العمليات-3.16.8.md` … `تقرير-الصفحة-15-المعرض.md` | الصفحات 1–15 |
| `تقرير-الإصدار-3.16.9.md` · `تقرير-حزم-الوكيل-3.16.9.md` | 3.16.9 |
| `تقرير-إغلاق-دين-popout.md` | دين `popout-closed` |
| `تقرير-إغلاق-الديون-3.16.10.md` | الديون 1–5 + عيب الجدولة |
| `تقرير-جولة-3.16.11-التحقق-الحي.md` | تحقق 3.16.11 + قياس العمودي/الأفقي |
| `تقرير-تشخيص-الاتجاه-3.16.11.md` | إثبات أن العطب في عملية الإسقاط |
| `تقرير-إغلاق-3.16.12.md` | إصلاح `26ddcac` وقياسه |
| `تقرير-إغلاق-3.16.13.md` | الشريط العلوي + النشر |
| `جدول-واجهات-السيرفر-3.16.7.md` | جرد أزرار 15 شاشة |

> نسخ Markdown من تقارير 3.16.11 → 3.16.13 محفوظة أيضًا في `D:\autoclaw projects-new\AiRemote-handoff\reports\`.
> تقارير 3.16.7 → 3.16.10 كانت في مساحة عمل الحساب السابق ولم تُنسخ (تبقى على القرص بمسارها القديم).

---

## 8) نقطة التوقّف الدقيقة

**آخر ما كان جاريًا:** التحقق من `761293f` (3.16.15) على المحاكي ثم TECNO.

- **البناء:** تمّ بالكامل (سيرفر + وكيل ويندوز + APK 3.16.15 موقّع v2+v3).
- **التثبيت:** السيرفر والوكيل على هذا الـPC · APK على TECNO (105) والمحاكي (105) و127.0.0.1:5555 و192.168.1.12:5555 (انقطعا بعدها).
- **البيان:** 3.16.15 · 55 عنصرًا · signature OK · ملتزَم `24f4b28`.
- **التوحيد:** PASS.
- **`verify.js`:** **لم تُعَد** لـ3.16.15.
- **التحقق الحي لـ3.16.15:** **لم يكتمل.** أُعيد تثبيت APK على المحاكي، فسقط الالتقاط، وكان معالج الصلاحيات مفتوحًا (6 من 7) عند الإيقاف. **لم تُقَس الأفقية بعد `761293f` على أي جهاز.**
- **TECNO:** عاد متصلًا في نهاية الجولة، وثُبّت عليه 105، لكن **لم يُعَد تشغيله ولا مُنح الالتقاط** بعد التثبيت.

**آخر قياسات مؤكدة (3.16.13 قبل تغييرات 3.16.15):**
- TECNO: عمودي 720×1600 / 323ms · أفقي 1600×720 / 966ms · عودة 625ms.
- المحاكي قبل الإصلاح: `rot=0 src=rot phys=1600x900 cur=900x1600` (الشاشة أفقية والإطار عمودي).
- الشريط: 15 زرًا كلها تعمل · الشعار عند 790 مقابل مركز 788 · Admin عند 33 · إغلاق عند 1511 (نافذة 1600).

**نهاية r13.** قف هنا حتى يأمر المالك.

---

## 9) ملحق — FileBridge (مشروع منفصل، لا تخلطه)

- المسار: `D:\autoclaw projects-new\FileBridge` · واجهة موحّدة (شريط علوي واحد، ثيم ليلي/نهاري، EN/ع، شاشة ملفات بنمط AnyDesk).
- حالة التسليم السابقة: Setup 1.0.1.exe **111,419,899 B** · SHA `f9994328…ab6b6` · APK **99,946 B** · SHA `a32d6479…f4d9`.
- تحقق حي: المضيف 6 أزرار + 62 صفًا · TECNO 27/27 · **المحاكي يعرض FileBridge الآن** (تطبيق منفصل مثبَّت هناك).
- **لا تعمل عليه** إلا بأمر مالك صريح — هذه الوثيقة عن AiRemote.
