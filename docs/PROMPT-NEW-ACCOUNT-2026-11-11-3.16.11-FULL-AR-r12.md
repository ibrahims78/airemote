# استئناف AiRemote — 2026-11-11 · الإصدار **3.16.11** — نسخة **r12**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-11-3.16.8-FULL-AR-r11.md` و`PROMPT-NEW-ACCOUNT-2026-11-11-r12-STOP.md` وكل ما قبلهما.**
> كل رقم هنا **مقيس في 2026-11-11** على الجهاز نفسه، لا منقولًا من وثيقة.
> سببه: انتقال المالك إلى حساب AutoClaw جديد. المستودع وقاعدة البيانات ومفاتيح التوقيع **على القرص**، فلا يتأثر شيء بتغيير الحساب.

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا ويُحترم حرفيًا

**قِف هنا. لا تنفّذ أي إجراء — لا بناء، لا تثبيت، لا تعديل ملف، لا `git commit`، لا تشغيل سكربت يكتب — حتى يقول المالك صراحةً «ابدأ» أو «نفّذ البند كذا» أو «اكمل البند كذا».**

- ترخيصك الحالي: **قراءة وتحقّق فقط** (قراءة ملفات، `git log`/`git status`، `curl /health`، بوابات القراءة، `adb shell dumpsys` للقراءة).
- الممنوع الآن: أي كتابة داخل `D:\autoclaw projects-new\AiRemote` أو `D:\autoclaw projects\offline-build-tools`، وأي `adb install`/`am force-stop`/`settings put`.
- كل ما في هذا الملف **منجَز ومُثبَّت** إلا ما هو موسوم صراحةً **«معلّق»** في §4 و§8. لا شيء قيد التنفيذ الآن.
- إن وجدت رقمًا مختلفًا عمّا هنا: **لا تُصلح شيئًا**. أبلِغ المالك بالفرق وانتظر.
- أي تعديل قبل الإذن = خرق، حتى لو بدا إصلاحًا واضحًا أو سطرًا واحدًا.

**كلمات فكّ التوقّف الوحيدة (من المالك فقط):** «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ».

---

## 0.1) الحالة المقيسة الآن (2026-11-11 · بعد r12)

| البند | القيمة | كيف تُتحقَّق |
|---|---|---|
| الفرع | `feat/screen-unify-3.13.0` | `git branch --show-current` |
| آخر التزام | **`282735d`** (قبل إضافة ملف r12؛ إضافته تُنتج التزامًا واحدًا بعده) | `git rev-parse --short HEAD` |
| `VERSION` | **3.16.11** | `Get-Content VERSION` |
| `versionCode` أندرويد | **100** | `packages/android-agent/app/build.gradle` |
| **السيرفر المثبَّت** | **3.16.10** على **3001** (TLS) — ⚠️ ليس 3.16.11 | `curl.exe -k -s https://127.0.0.1:3001/health` |
| **حزمة 3.16.11** | `AiRemote-Server-Setup-v3.16.11-x64.exe` = **159,432,505 B (~152.03 MB)** · zip = **212,176,602 B (~202.35 MB)** — **مبنية وجاهزة، غير مثبَّتة** | `releases/server-windows/` |
| **APK أندرويد** | `AiRemote-Agent-Android-v3.16.11.apk` = **202,023 B** · موقّع v2+v3 · **مثبَّت على TECNO** (code 100) | `releases/android-agent/` + `adb shell dumpsys package` |
| معاينة Vite | **5000** (dev · بروكسي إلى 3001) — تحمل **جدار ORIENT-STAGE الجديد** | `Get-NetTCPConnection -LocalPort 5000 -State Listen` |
| البيان | **3.16.10 · 34 عنصرًا · signature OK** — ⚠️ **لم يُعَد توليده لـ3.16.11** | `node scripts/release-manifest.js --verify` |
| توافق الإصدار | سابقًا **PASS** حتى 3.16.10 — ⚠️ **لم يُعَد تشغيله بعد رفع 3.16.11** | `node scripts/check-version-consistency.cjs` |
| بوابة التحقق | **56/57** عند 3.16.10 (الفشل الوحيد بيئي) — ⚠️ **لم تُعَد بعد تغييرات 3.16.11** | `node scripts/verify.js` |
| الأسطول | **5 أجهزة · 2 متصلان الآن** (Android-Emulator · TECNO-KL4) | `/api/devices` |
| المستخدمون | **3** كلهم `admin` · 2FA معطّل | `/api/users` |
| المهام المجدولة | **0** (أُنشئت مهمة اختبار ثم حُذفت) | `/api/tasks` |
| قواعد التنبيه | **0** (أُنشئت قاعدة اختبار ثم حُذفت) | `/api/alerts` |
| شجرة git | نظيفة إلا `docs/PROMPT-...-r12-STOP.md` غير المتتبَّع (سابق) | `git status --short` |

> «غير متصل» يعني **الوكيل غير مُشغَّل الآن**، لا عيبًا.

### 0.1.1) أول 10 دقائق — تحقّق ثم قف

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git branch --show-current                          # feat/screen-unify-3.13.0
git rev-parse --short HEAD                         # 282735d قبل إضافة r12
Get-Content VERSION                                # 3.16.11
curl.exe -k -s https://127.0.0.1:3001/health       # 3.16.10 — مثبَّت أقدم من المصدر (مقصود)
Get-ChildItem releases\server-windows -Filter '*3.16.11*'
Get-ChildItem releases\android-agent -Filter '*3.16.11*'
node scripts/release-manifest.js --verify          # 3.16.10 · signature OK
```

**بعدها توقّف.** لا تبنِ «للتأكيد»، ولا تثبّت، ولا تُصلح فرقًا.

### 0.1.2) لماذا الأرقام «غير متطابقة» عمدًا الآن

- **المصدر 3.16.11 · المثبَّت 3.16.10**: حزمة 3.16.11 بُنيت لكن **التثبيت لم يُنفَّذ** لأن المالك أوقف الجولة في أثناء التحقق من البث. هذا هو الوضع الصحيح الموروث، لا خطأ.
- **البيان 3.16.10**: يُعاد توليده وتوقيعه **بعد** تثبيت الحزمة (وإلا أشار إلى عنصر غير موجود).
- **`e2e: sessions export`** يفشل بعد كل حزمة لأن `electron-builder` يعيد بناء `better-sqlite3` لـElectron ABI 119. يُصلَح بـ`pnpm rebuild better-sqlite3` ثم يُعاد كسره في الحزمة التالية. **بيئي، ليس عيبًا.**

---

## 0.2) الوصول والحسابات (لا قيم سرّية داخل المستودع)

| ما | أين / كيف |
|---|---|
| حساب اللوحة | `admin@airemote.local` (دور `admin`) — **كلمة المرور عند المالك فقط** |
| حسابان احتياطيان | `admin@airemote.io` · `lab-probe@local` |
| الحساب المؤقت `ui-audit@local` | **حُذف نهائيًا** |
| قاعدة البيانات | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` (قراءة فقط) |
| مفاتيح التوقيع | `C:\Users\admin\AppData\Roaming\AiRemote\signing\airemote-release.jks` · alias **`airemote`** · كلمة المرور في `keystore-password.txt` (64 محرفًا + CRLF) |
| مفتاح AI | في `settings.aiApiKey` (51 محرفًا) — لا يُطبع |
| بوت Telegram | `settings.telegramToken` (48) · المحادثة `1029428155` |

**قاعدة صارمة:** أي سرّ يُقرأ من البيئة (`AEMAIL` · `APASS` · `AI_KEY` · `TG_TOKEN` · `TG_CHAT`) أو عند المالك. لا يُكتب في مستودع ولا في وثيقة ولا في التزام ولا في مخرَج أداة.

**قراءة القاعدة من Node:** `require("node:sqlite").DatabaseSync` (Node 24) — `better-sqlite3` قد يكون مبنيًا لـElectron.

---

## 0.3) البيئة والأدوات — **مسارات مصححة**

> أي وثيقة تقول `D:\autoclaw projects-new\offline-build-tools` **خطأ**. الجذر الصحيح:

| الأداة | المسار |
|---|---|
| جذر الأدوات | `D:\autoclaw projects\offline-build-tools` |
| JDK | `…\android-toolchain\jdk` (OpenJDK 21) |
| Android SDK | `…\android-toolchain\sdk` (platform android-35 · build-tools **34.0.0**) |
| Gradle | `…\android-toolchain\gradle\bin\gradle.bat` |
| adb | `…\android-toolchain\sdk\platform-tools\adb.exe` |
| zipalign / apksigner | `…\sdk\build-tools\34.0.0\{zipalign.exe, apksigner.bat}` |
| LDPlayer (احتياط) | `D:\LDPlayer\LDPlayer9\{ldconsole.exe, adb.exe}` |
| VMware | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` |
| VMs | `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` · `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx` |

**لا `java` على PATH.** كل صدفة تحتاج:
```powershell
$b='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME="$b\jdk"; $env:ANDROID_HOME="$b\sdk"; $env:ANDROID_SDK_ROOT="$b\sdk"
```

---

## 0.4) الأجهزة (مقيسة الآن)

| الجهاز | الحالة | النظام | ملاحظة |
|---|---|---|---|
| Android-Emulator | **online** | Android 9 (API 28) | وكيل **3.16.0** · عمود فقري للاختبار |
| TECNO-KL4 | **online** | Android 14 (API 34) | وكيل **3.16.11 / code 100** · `serial 12927374CM001019` · **`MediaProjection` غير ممنوح الآن** |
| TAB16-USB | offline | Android 8.1 (API 27) | خارج الخدمة |
| WIN10-VM | offline | Windows 10 19045 | يحتاج دفعة إقلاع |
| WIN11-VM | offline | Windows 11 22000 | |

**شاشة TECNO الحالية:** `user_rotation=0` (عمودي) و`accelerometer_rotation=1` (تلقائي). ضُبطت أثناء الاختبار وبقيت كذلك.
**ملاحظة أثر جانبي:** أُوقف تطبيق WhatsApp مرة واحدة على TECNO أثناء الاختبار (force-stop) لإحضار وكيل AiRemote للمقدمة. أعد فتحه عند الحاجة — لا بيانات فُقدت.

**قدرات مشتركة:** `pty` · `shell` · `fs` · `screenControl` · `clipboard` · `chat` · `ai` · `android`/`multiMonitor`.

---

## 0.5) إعدادات التطبيق المحفوظة الآن (هي «الحالة» التي يجب ألّا تُفقد)

| الإعداد | القيمة المخزّنة |
|---|---|
| مزوّد الذكاء الاصطناعي | **`zai`** · النموذج **`glm-4.7-flash`** · المفتاح محفوظ (51) |
| `aiConfigs` / `ai_config` | نسختان لنفس المزوّد (`zai`) — سلوك قائم، لا تحذف إحداهما |
| إشعارات Telegram | **مفعّلة** · توكن (48) · محادثة `1029428155` |
| مفاتيح الأحداث | `online: true` · `offline: true` · `chat: true` · `task: true` |
| المهام المجدولة | **0** |
| قواعد التنبيه | **0** |
| 2FA | **معطّل** لكل المستخدمين (3) |
| الأجهزة | 5 مسجّلة |
| المظهر | الوضع النهاري |

---

## 0.6) ما أُنجز — من 3.16.7 إلى 3.16.11

### 0.6.1) 3.16.7 + 3.16.8 (مرجع كامل في r11 — لا تُعِد تحليله)

- **3.16.7**: حجب `token` عن غير الأدمن في ثلاثة أسطح · منع «عرض فقط» من تسجيل/تغيير الدقة · حارس آخر أدمن · تعليمات تثبيت صادقة · بحث التدقيق بالمستخدم · webhook `device_online` · بيان موقّع.
- **3.16.8**: الصفحات 1–8 (غرفة العمليات · الأجهزة · مساحة الجهاز · الملفات/TECNO · الجلسات · الإعدادات · المستخدمون · العارض · التنبيهات) + `FileManager` يحترم `initialPath` + `MANAGE_EXTERNAL_STORAGE` + **APK 3.16.8 (98)**.

### 0.6.2) 3.16.9 — الصفحات 9–15

| # | الصفحة | الالتزامات | أبرز ما نُفِّذ |
|---|---|---|---|
| 9 | سجل التدقيق | `45a9838` · `a019732` | فلتر الجهاز والمدى الزمني · تعريب ~60 حدثًا · توسيع بلوحة المفاتيح · تصدير مطابق |
| 10 | المساعد | `61f1b3c` | إظهار offline معطّلة · مصالحة معرّف ميت · `?prompt` مرة واحدة · مهلة «جارٍ الاتصال» 8 ث |
| 11 | المساعدة | `f8a5dae` | فهرس يتبع البحث · روابط عميقة `#help-N` · طباعة + `print:hidden` |
| 12 | الملفات | `77ff04e` | `rk` مقروء · طابور النقل لجلسات اللوحة فقط · رفع متعدد · تنزيل متدفق |
| 13 | الدخول | `39d0f8b` | استثناء مسارات الدخول من اعتراض 401 · رسائل خطأ دقيقة · TOTP معطّل قبل 6 أرقام |
| 14 | التهيئة | `49429f6` | سياسة 12 حرفًا · «نسيت» بثلاث خطوات · شاشة نجاح + 2FA |
| 15 | المعرض | توثيق فقط | `import.meta.env.DEV` — خارج المنتج |
| — | الإصدار | `10b199c` · `ee9a1fe` · `1d5f4d0` | 3.16.9 + static + بيان (29 عنصرًا) · APK 3.16.9 (99) |

### 0.6.3) 3.16.10 — إغلاق الديون الخمسة الأولى

| # | الدين | الحل | الالتزام | الدليل |
|---|---|---|---|---|
| 1 | `packages/server` (TS) لا يُشحن | نُسخ تغيير الإشعارات إليه | `940c0de` | `tsc --noEmit` → exit 0 |
| 2 | `runTask`/`taskNextDue` بلا اختبار | استُخرج إلى `lib/task-schedule.js` + **16 فحصًا** + بوابة جديدة في `verify.js` | `743fc31` | الاختبار يكشف عيبًا حقيقيًا وأُصلح |
| 3 | `server_errors` بـ`user_id=NULL` لا تظهر | المشرف يقرأ صفوف البثّ في القائمة والعدّاد والتعليم والمسح | `efb2f55` | صفّ `user_id=NULL` ظهر ثم حُذف |
| 4 | لا استهداف جهاز في قاعدة تنبيه | منتقي جهاز + `deviceId` في الطلب | `b0ed90f` | POST 201 · `device_id` مخزَّن |
| 5 | لا تعديل للمهمة | زر تعديل + `PUT` كامل | `548a124` | PUT 200 · الاسم/الفاصل/المحتوى تغيّرت |

**عيب حقيقي اكتُشف بالاختبار:** مهمة يومية موعدها لاحق اليوم كانت تُؤجَّل لغدٍ في كل نبضة فلا تُنفَّذ أبدًا. صار: موعد اليوم إن لم يحن · موعد اليوم (متأخر) إن فات · غدًا فقط بعد التنفيذ. C1/C2 فشلا قبل الإصلاح ومرّا بعده.

### 0.6.4) 3.16.11 — جدار البث: ORIENT-FOLLOW + ORIENT-STAGE

**شكوى المالك:** العمودي مقصوص أعلى/أسفل · الأفقي مقصوص مع بقايا الاتجاه السابق وتراكب · لا تناسق مع بقية الأجهزة · التبديل بطيء.

**السبب الجذري (وكيل):** `FIXED-ORIENT` كان يثبّت `VirtualDisplay` أفقيًا (1600×720) لكل الجلسة، ثم:
- `GHOST-CROP` يقصّ نافذة عمودية من المخزن الأفقي ⇒ **قصّ أعلى/أسفل فعلي**.
- `measureCrops` يقصّ شريط الحالة ⇒ قصّ إضافي من الأعلى.
- `hysteresis` 3000ms قبل تطبيق الاتجاه ⇒ **بطء وبقايا الاتجاه السابق**.
- الدلتا بعد التدوير تبقى حتى `FULL-RESCAN` كل 8 ثوانٍ ⇒ **تراكب/شبح**.

**السبب الجذري (جدار):** خمس طبقات CSS متعارضة (`fit-v3` · `tile-shape-v4` · `unified-wall-v5` · `landscape-fill` · تدرّجات العمودي):
- `object-fit: cover` للأفقي ⇒ **قصّ**.
- `height: 82%` ثم `100%` للعمودي · `:has()` يعيد تشكيل شبكة الجدار كلها · تدرّجات تُقرأ كخلفية متبقية.

**ما نُفِّذ:**

| المحور | الالتزام | المحتوى |
|---|---|---|
| الوكيل | `67388bf` | `ORIENT-FOLLOW`: يبدأ بشكل الشاشة الحالي · يعيد بناء `VirtualDisplay` عند تغيّر الاتجاه بعد **350ms** (resize، وإن رفضه الـOEM يُنشأ عرض جديد من نفس الإذن) · يتخطى **180ms** من إطارات الانتقال (قطع حاد) · **بلا `GHOST-CROP`** · **بلا قصّ شريط حالة** · **بلا دوران برمجي** |
| الوكيل | `1810934` | `wantLand` يثق **بدوران النافذة** (0/180 عمودي · 90/270 أفقي)، والحسّاس احتياط فقط. السبب: على TECNO قال الحسّاس «أفقي» والنافذة عمودية 0 فقلب الجلسة إلى مسرح أفقي = القصّ الأصلي |
| الجدار | `435242f` | `ORIENT-STAGE`: مسرح واحد **16:9** لكل الأجهزة والاتجاهين · `object-fit: contain` دائمًا (لا `cover`) · بلا `:has()` يعيد التشكيل · خلفية واحدة `#060b10` (نهاري `#0b1420`) · `transition: none` · `ScreenViewer` يمسح اللوحة صريحًا عند تغيّر الشكل |

**المقيس حيًّا (3.16.11):**
- بعد تشغيل نظيف (force-stop ثم بدء): إطار كامل **720×1600 عمودي** — بلا قصّ من أي طرف.
- عند محاولة الحسّاس الكذب ظهر `orient-follow 720×1600 → 1600×720 rot=0 land=true` — وهو العيب الذي أُصلح في `1810934`.
- **لم يُتحقق بعد** التبديل العمودي↔الأفقي بعد إصلاح `wantLand`، لأن `MediaProjection` سقط بإعادة التثبيت وتوقّف التنفيذ قبل منحه.

---

## 0.7) آلية العمل المتفق عليها مع المالك

1. **صفحة/بند بند** بترتيب الخطة. لا قفز.
2. **المعاينة الحيّة إلزامية**: `http://localhost:5000` (Vite). تعديلات الواجهة تظهر فورًا؛ تعديلات الخادم **لا** تظهر حتى البناء والتثبيت.
3. **المالك لا يريد حلقات موافقة بعد إذن التنفيذ**: قلّم القرار القابل للعكس، نفّذ، ووثّق. اسأل فقط عند قرار غير قابل للعكس أو توسيع نطاق.
4. **تعديل واحد = التزام واحد** برسالة إنجليزية تشرح **السبب** لا التغيير.
5. **تقرير Markdown يُسلَّم** بعد كل جولة (في مساحة عمل AutoClaw، لا داخل المستودع).
6. **البناء عند الأمر فقط**: رفع الإصدار في المصادر السبعة + `versionCode`، ثم dashboard → server-desktop، ثم تثبيت، ثم بيان موقّع، ثم البوابات.
7. **لا أسرار** في المستودع/الالتزامات/المخرجات.

---

## 1) ما أُغلق ولا يُعاد فتحه

| البند | الدليل |
|---|---|
| حجب `token` عن غير الأدمن (3 أسطح) | `4b1c849` · `a0c31b0` · `18ef9e9` |
| منع «عرض فقط» من التسجيل/الدقة | `048cd87` |
| حارس آخر أدمن | `4b4674c` |
| تعليمات تثبيت صادقة | `d47a6ae` |
| بحث التدقيق + webhook online | `72bd404` · `5f284c5` |
| صفحات 1–15 | 0.6.1–0.6.2 |
| الديون 1–5 | 0.6.3 |
| مسرح الجدار الموحّد + متابعة الاتجاه | 0.6.4 |
| دين `popout-closed` | `ec55350` (داخل 3.16.10+ وليس في 3.16.9 المثبَّت سابقًا) |

---

## 2) الفخاخ المثبتة — محدَّثة

### قديمة ما زالت تصدق
1. **السيرفر المثبَّت يخدم `app.asar`** (`server-desktop/server.js`) — لا `packages/server` (TS).
2. **قفل النسخة الواحدة في الوكيل** — اقتل/force-stop أي نسخة قبل أي مسبار.
3. **`versionCode` يزيد يدويًا** (100 الآن) — أندرويد يرفض التثبيت إن لم يزد.
4. **`apksigner` يحتاج `JAVA_HOME`** و**ملفَّي كلمة مرور منفصلين** (`--ks-pass file:` و`--key-pass file:`).
5. **NSIS يمسح المجلد ~20–25 ثانية** — انتظر قبل الحكم بالفشل.
6. **`/api/auth/login` محدود 5/دقيقة**.
7. **`MediaProjection` يسقط بإعادة تثبيت APK وبـforce-stop** — يُمنح من شاشة النظام بعد كل مرة.
8. **مسار العارض `wss://…/screen?ticket=…`** لا `/ws`.
9. **`vmrun runProgramInGuest` لا يعيد stdout**.
10. **عربية PowerShell 5.1**: لا تكتب ملفًا عربيًا بـ`Set-Content`؛ لا تقرأ بـ`Get-Content` للعرض (mojibake) — استخدم `read`.

### جديدة — 3.16.9 إلى 3.16.11
11. **`better-sqlite3` يتبع آخر عملية**: Node للاختبارات · Electron 119 للحزمة. فشل `e2e: sessions export` بعد الحزمة **بيئي**.
12. **أندرويد 13+**: لا بد من `MANAGE_EXTERNAL_STORAGE` (لا يكفي `targetSdk` أقل).
13. **بوابة 56 لا ترسم صفحة** — أي كسر بصري يمرّ منها.
14. **نهايات الأسطر مختلفة**: `server.js`/`ScreenViewer`/`control-room.css` = CRLF؛ أغلب الصفحات = LF.
15. **Gradle يجب أن يعمل في الخلفية** وإلا يُقتل بـ`exec_process_tree_termination_unconfirmed`.
16. **الحزمة تعيد كتابة `packages/server-desktop/static`** ⇒ التزام `chore(build)` أو شجرة متسخة.
17. **`settings` تحمل نسختين للمفاتيح** (`aiConfigs` و`ai_config`).
18. **الحسّاس يكذب على TECNO** (مستلقٍ/مائل) — الاتجاه يُقرأ من `Display.getRotation()` لا من `Accelerometer`. هذا أصل عيب القصّ.
19. **`getRealMetrics` على TECNO يعيد العمودي دائمًا** (720×1600) مهما كان الدوران ⇒ للاتجاه استخدم `getRotation`، وللمقاس استخدم `max/min` للأبعاد الفيزيائية.
20. **ترويسة الإطار من السيرفر إلى العارض = 13 بايت**: `[w:4][h:4][seq:4][flags:1]` — ليست ترويسة الوكيل (37+ بايت). أي قياس خارجي يجب أن يستخدم 13.
21. **`adb install -r` لا يكفي وحده**: قد تبقى الخدمة القديمة حيّة. `am force-stop` ثم `am start` إلزاميان لتحميل الكود الجديد (وإلا يظل `VirtualDisplay` القديم ويعمل الكود القديم).
22. **`uiautomator dump` هو وسيلة قراءة شاشة TECNO** — `read` على PNG يفشل هنا (`filesystem_binary_file`).
23. **لوحة المتصفح (browser pane) قد لا تتصل** (`browser_host_unavailable`) — البديل: قياس عبر WebSocket مباشرة (السكربتات في §3.3).
24. **إيقاف التطبيقات الأخرى على الهاتف**: لا توقف تطبيقًا يستخدمه المالك إلا لضرورة إحضار الوكيل للمقدمة، وأبلِغه.

---

## 3) الأدوات

### 3.1) في المستودع
| الأداة | الدور |
|---|---|
| `scripts/verify.js` | البطارية — **57 خطوة** الآن (أُضيفت `unit: task schedule`) |
| `scripts/check-version-consistency.cjs` | كل المصادر + `/health` + البيان |
| `scripts/release-manifest.js` | توليد/توقيع البيان · `--verify` |
| `scripts/check-message-contract.cjs` · `check-route-roles.cjs` · `check-message-pairs.cjs` | بوابات 54–56 |
| `scripts/check-shipped-bytes.cjs` | يفتح `app.asar` ويبحث عن بصمات |
| `packages/server-desktop/lib/task-schedule.js` | قواعد الجدولة (مستخرجة ومختبَرة) |
| `packages/server-desktop/test/task-schedule.test.cjs` | 16 فحصًا |
| `packages/server-desktop/lib/alerts.js` | منبّه أخطاء السيرفر |

### 3.2) سكربتات مساحة العمل (AutoClaw — ليست في المستودع)
المسار: `C:\Users\admin\AppData\Roaming\AutoClaw-oversea-official\accounts\<الحساب>\projects\Default\verify-3.16.8\`

| الملف | الدور |
|---|---|
| `verify-debts-live.js` | تحقق حي من الديون 3/4/5 على 3001 (إشعار بثّ · قاعدة بجهاز · تحديث مهمة) |
| `measure-frames.js` | يتصل بمسار `/screen` ويطبع مقاسات الإطارات الكاملة |
| `rotate-measure.js` | يدوّر TECNO عبر adb ويقيس زمن انتقال الشكل |
| `patch-debt-notify2.js` · `patch-debts-45.js` · `patch-debt-test.js` · `patch-debt-ts-parity.js` | رقع الديون |
| `patch-orient-follow.js` · `patch-wantland.js` | رقع 3.16.11 |
| `verify14.js` · `verify-release.js` · `verify-audit-filter.js` · `step1b-login.js` | تحقق الصفحات السابقة |

### 3.3) بناء أندرويد (متسلسلة مجرَّبة)
```powershell
$b='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME="$b\jdk"; $env:ANDROID_HOME="$b\sdk"; $env:ANDROID_SDK_ROOT="$b\sdk"
# 1) البناء — في الخلفية دائمًا
& "$b\gradle\bin\gradle.bat" -p packages\android-agent assembleRelease --console=plain --no-daemon
# 2) التوقيع — ملفان منفصلان لكلمة المرور (تُحذف بعد التوقيع)
& "$b\sdk\build-tools\34.0.0\zipalign.exe" -f -p 4 <unsigned>.apk aligned.apk
& "$b\sdk\build-tools\34.0.0\apksigner.bat" sign --ks <jks> --ks-pass file:<f1> --key-pass file:<f2> --out AiRemote-Agent-Android-v<ver>.apk aligned.apk
& "$b\sdk\build-tools\34.0.0\apksigner.bat" verify --verbose <out>.apk
# 3) التثبيت + تحميل الكود الجديد
& "$b\sdk\platform-tools\adb.exe" -s 12927374CM001019 install -r <out>.apk
& "$b\sdk\platform-tools\adb.exe" -s 12927374CM001019 shell am force-stop com.airemote.agent
& "$b\sdk\platform-tools\adb.exe" -s 12927374CM001019 shell am start -n com.airemote.agent/.MainActivity
```

### 3.4) التحكم بدوران TECNO (للاختبار)
```powershell
& "$adb" -s 12927374CM001019 shell "settings put system accelerometer_rotation 0; settings put system user_rotation 0"   # عمودي
& "$adb" -s 12927374CM001019 shell "settings put system user_rotation 1"                                                 # أفقي
& "$adb" -s 12927374CM001019 shell "settings put system accelerometer_rotation 1"                                        # إعادة التلقائي
```

---

## 4) ما بقي — **معلّق بانتظار أمر المالك**

### 4.1) إكمال التحقق من 3.16.11 (يحتاج نقرة على الهاتف)
1. **منح `MediaProjection`**: افتح تطبيق الوكيل على TECNO → «معالج التهيئة (كل الصلاحيات)» → «التقاط الشاشة» → «فتح الإعداد» → شاشة النظام «السماح». عبر adb: `am start` ثم `uiautomator dump` لمعرفة الإحداثيات والنقر.
2. **معيار القبول (عمودي)**: إطار كامل `720×1600` بلا قصّ من أي طرف — الشاشة كاملة.
3. **معيار القبول (أفقي)**: `settings put system user_rotation 1` ⇒ إطار `1600×720` خلال **~400ms** (350ms debounce + إطار) بلا شبح ولا بقايا.
4. **العودة**: `user_rotation 0` ⇒ `720×1600` بلا أثر للاتجاه السابق.
5. **تناسق الجدار**: كل الأجهزة في مسرح 16:9 واحد بـ`contain` — لا `cover` ولا قصّ؛ العمودي يظهر كعمود هاتف كامل في الوسط، والأفقي يملأ المسرح كالمحاكي.

### 4.2) إغلاق إصدار 3.16.11 (بالترتيب)
1. تثبيت حزمة السيرفر `AiRemote-Server-Setup-v3.16.11-x64.exe` (`/S`) ثم تشغيلها والتأكد `/health = 3.16.11`.
2. `node scripts/check-version-consistency.cjs` → PASS.
3. `node scripts/verify.js` → يُتوقَّع 56/57 (الفشل البيئي فقط).
4. `node scripts/release-manifest.js` (توليد + توقيع) ثم `--verify` → signature OK · all artifacts match.
5. تحديث `releases/manifest.json` والتزام `chore(release)`.
6. التحقق البصري على المثبَّت 3001 (جدار + بث TECNO عمودي/أفقي).

### 4.3) الدين السادس — **لم يُحدَّد**
«شعار الترحيل مختلط الاتجاه»: لم يُعثر على «شعار ترحيل» في اللوحة بعد بحث. **يحتاج إشارة المالك** (لقطة/مسار) قبل أي تعديل.

### 4.4) ديون بنيوية باقية (لا تُفتح بلا قرار)
- `packages/server` (TS) لا يُشحن — أي إصلاح فيه يجب تكراره في `server-desktop/server.js` (تمّت مطابقة الإشعارات فقط).
- `static/` يحمل نسخة مبنية من الواجهة داخل git (مقصود حاليًا).
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
& 'D:\autoclaw projects-new\AiRemote\packages\agent-desktop\node_modules\.bin\electron-builder.CMD' --win --x64   # في الخلفية

# تثبيت
Get-Process 'AiRemote Server' -ErrorAction SilentlyContinue | Stop-Process -Force
& 'releases\server-windows\AiRemote-Server-Setup-v<v>-x64.exe' /S
Start-Sleep -Seconds 35
Start-Process 'C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe'
curl.exe -k -s https://127.0.0.1:3001/health

# معاينة الواجهة (تبقى على 5000)
cd packages\dashboard; .\node_modules\.bin\vite.cmd --port 5000 --strictPort
```

---

## 6) بروتوكول التنفيذ

1. **قِس أولًا** (§0.1.1) — لا تثق بأرقام هذا الملف بلا تحقق.
2. **تعديل واحد = التزام واحد** بالسبب.
3. إن ساء الرقم: `git checkout` فورًا.
4. الدليل المقيس (قبل/بعد) في الرد وفي التقرير.
5. **لا أسرار** في المستودع/الالتزامات/المخرجات.
6. **لا تلمس عقد API** ولا تصميم سطح بلا قرار مالك.
7. **أي تغيير في محتوى الحزمة يرفع الرقم** في المصادر السبعة + `versionCode` + البيان.
8. **بوابة جديدة تحتاج إثبات عضّ** + خط أساس بأسباب.
9. **⛔ لا تنفّذ شيئًا بلا إذن المالك.**

---

## 7) التقارير المسلَّمة (في مساحة عمل AutoClaw)

| الملف | المحتوى |
|---|---|
| `تقرير-غرفة-العمليات-3.16.8.md` | الصفحة 1 |
| `تقرير-صفحة-الأجهزة-3.16.8.md` | الصفحة 2 |
| `تقرير-الصفحتين-3-و-4-3.16.8.md` | المساحة + الملفات/TECNO + الجلسات |
| `تقرير-صفحة-الإعدادات-3.16.8.md` | الصفحة 5 |
| `تقرير-صفحة-المستخدمين-3.16.8.md` | الصفحة 6 |
| `تقرير-صفحة-العارض-3.16.8.md` | الصفحة 7 |
| `تقرير-التنبيهات-وإصدار-3.16.8.md` | الصفحة 8 + الإصدار |
| `تقرير-الصفحة-9-سجل-التدقيق.md` … `تقرير-الصفحة-15-المعرض.md` | الصفحات 9–15 |
| `تقرير-الإصدار-3.16.9.md` · `تقرير-حزم-الوكيل-3.16.9.md` | 3.16.9 |
| `تقرير-إغلاق-دين-popout.md` | دين `popout-closed` |
| **`تقرير-إغلاق-الديون-3.16.10.md`** | **الديون 1–5 + عيب الجدولة اليومية** |
| `جدول-واجهات-السيرفر-3.16.7.md` | جرد أزرار 15 شاشة |

---

## 8) نقطة التوقّف الدقيقة

**آخر ما كان جاريًا:** التحقق الحي من `ORIENT-FOLLOW` على TECNO ضمن 3.16.11.
- البناء: **تم** (APK 3.16.11 code 100 موقّع ومثبَّت · حزمة سيرفر 3.16.11 مبنية).
- القياس: **تم جزئيًا** — بعد تشغيل نظيف ظهر إطار كامل `720×1600` عمودي بلا قصّ، ثم كشف السجل كذب الحسّاس فقلب المسرح إلى `1600×720` (`rot=0 land=true`).
- الإصلاح: **تم** (`1810934` — الثقة بدوران النافذة).
- **المتبقي:** إعادة بناء/تثبيت APK بعد `1810934`؟ **لا** — الـAPK المثبَّت **يتضمن** `1810934` (بُني بعده). المتبقي هو **منح `MediaProjection`** ثم قياس التبديل.
- **التنفيذ توقّف بأمر المالك** (أداة أُلغيت) عند محاولة إعادة تشغيل الوكيل ومنح الإذن. لا شيء نصف مكتوب في المستودع: الشجرة نظيفة عند `282735d`.

**آخر قياسات مؤكدة:**
- `/health` = **3.16.10** (المثبَّت) · المصدر **3.16.11**.
- TECNO: `versionCode=100` · `versionName=3.16.11` · متصل · `MediaProjection` **غير ممنوح** (رسالة `screen:error: screen capture permission is required`).
- شاشة TECNO: `user_rotation=0` · `accelerometer_rotation=1`.
- البيان: **3.16.10 · 34 عنصرًا · signature OK**.
- الأسطول: **5 أجهزة · متصلان** (Android-Emulator 3.16.0 · TECNO 3.16.11).

**نهاية r12.** قف هنا حتى يأمر المالك.

---

## 9) ملحق — FileBridge (مشروع منفصل، لا تخلطه)

- المسار: `D:\autoclaw projects-new\FileBridge` · واجهة موحّدة (شريط علوي واحد، ثيم ليلي/نهاري، EN/ع، شاشة ملفات بنمط AnyDesk).
- حالة التسليم السابقة: Setup 1.0.1.exe **111,419,899 B** · SHA `f9994328…ab6b6` · APK **99,946 B** · SHA `a32d6479…f4d9`.
- تحقق حي: المضيف 6 أزرار + 62 صفًا · TECNO 27/27 (تنزيل/إيقاف/استئناف/رفع/اتجاه معاكس).
- **لا تعمل عليه** إلا بأمر مالك صريح — هذه الوثيقة عن AiRemote.
