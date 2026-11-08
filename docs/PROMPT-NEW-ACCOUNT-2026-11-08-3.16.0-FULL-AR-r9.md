# استئناف AiRemote — 2026-11-08 · الإصدار **3.16.0** — نسخة **r9**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-08-3.14.3-FULL-AR-r8.md` وكل ما قبله.**
> كل رقم هنا مقيس في جلسة 2026-11-08، ودليله في `outputs/verify-2026-11-08/`.

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا ويُحترم

**لا تنفّذ أي إجراء — لا بناء، لا تثبيت، لا تعديل — قبل أن يقول المالك صراحةً «ابدأ» أو «نفّذ بند كذا».**

- الترخيص الحالي: **قراءة وتحقّق فقط** (قراءة الملفات، `git log`، `/health`، `/api/devices`، تشغيل البوابات).
- الموجة P0 وP1 (جزئيًا) **أُغلقت ومُثبَّتة**؛ ما بقي قرارات مالك لا تنفيذ.
- أي تعديل قبل إذنه = خرق، حتى لو بدا إصلاحًا واضحًا.

---

## 0) الحالة المقيسة الآن

| البند | القيمة |
|---|---|
| الفرع | `feat/screen-unify-3.13.0` |
| آخر التزام | **`b8dd3e4`** · **35** التزامًا منذ r8 (`3f19702`) |
| `VERSION` | **3.16.0** — ثمانية مصادر + `versionCode **71**` |
| السيرفر المثبَّت | **3.16.0** · `{"status":"ok","version":"3.16.0","tls":true,"port":3001}` |
| وكيلا ويندوز | **3.16.0** (WIN10 · WIN11) · `app.asar` 14:17:36 |
| APK | `releases/AiRemote-Agent-3.16.0.apk` · **vc71** · `CN=AiRemote Agent` · على المحاكي |
| الحِزم | Server Setup **152.04MB** · zip **202.33MB** · Agent Setup **72.86MB** · zip **99.2MB** |
| البطارية | **56/56** (52 أصلية + عقد الرسائل + P0 authz + حراسة المسارات + أزواج الرسائل) |
| البيان | **84** قطعة · `signature OK` · `all artifacts match` |
| العقد | **186** نوعًا معلنًا · **0** مستخدم بلا إعلان |

### 0.1) أول 10 دقائق — تحقّق قبل أي شيء

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git rev-parse --short HEAD                              # b8dd3e4
git log --oneline 3f19702..HEAD | Measure-Object -Line   # 35
Get-Content VERSION                                     # 3.16.0
curl.exe -k -s https://127.0.0.1:3001/health            # version 3.16.0
node scripts/verify.js                                   # 56/56
node scripts/check-version-consistency.cjs               # PASS
node scripts/release-manifest.js --verify                # signature OK · all artifacts match
node scripts/check-shipped-bytes.cjs                     # 13/13 على المثبَّت فعلًا
node tools/lab/session/check-artifacts.cjs               # RESULT: ok
```

**إن اختلف رقم:** الحالة تغيّرت ⇒ أعد القياس وأبلِغ المالك، **ولا تصلح شيئًا**.

### 0.2) الوصول والمفاتيح (لا تُنسخ قيمًا سرّية إلى المستودع)

| ما | أين |
|---|---|
| حساب اللوحة (مختبر) | `C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json` (`{email,password}`) |
| بيانات ضيوف VMware | `C:\Users\admin\AppData\Roaming\AiRemote\lab-credentials.txt` |
| قاعدة البيانات | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` (قراءة فقط) |
| كلمة مرور التحكّم الموحّدة | عند المالك — لا تُكتب في المستودع |

**قاعدة:** أي سرّ يبقى في `%TEMP%` أو ملفات المختبر — لا في `outputs/` ولا في التزام.

### 0.3) البيئة

- Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Electron: `packages\<pkg>\node_modules\electron\dist\electron.exe`
- adb: `D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe`
- JDK/SDK/gradle/apksigner: `D:\autoclaw projects\offline-build-tools\android-toolchain\{jdk,sdk,gradle\bin\gradle.bat,sdk\build-tools\34.0.0\apksigner.bat}`
- VMware: `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe`
- VMs: `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` · `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx`
- LDPlayer: `D:\LDPlayer\LDPlayer9\ldconsole.exe`

### 0.4) الأجهزة

| الجهاز | النسخة | الحالة | ملاحظة |
|---|---|---|---|
| المضيف (السيرفر) | 3.16.0 | يعمل على 3001 | |
| WIN10-VM | 3.16.0 | online | يحتاج دفعة إقلاع بعد كل ترقية (نمط متكرر) |
| WIN11-VM | 3.16.0 | online | |
| Android-Emulator | 3.16.0-android (vc71) | online | `emulator-5554` و`127.0.0.1:5555` نفس الجهاز |
| TAB16-USB | 3.14.3 | **offline** | خارج الخدمة بقرار المالك |
| TECNO-KL4 | 3.14.3 | **offline** | نفسه |

- **`MediaProjection`:** يسقط بإعادة تثبيت APK. لا يُمنح بـadb. **غير مُتحقَّق منه بعد ترقية 3.16.0** — يحتاج جلسة مشاهد + نقرة مالك على الأرجح.
- **`appops PROJECT_MEDIA` مضلّل** (فخ 10) — الدليل الصحيح `dumpsys media_projection` + تدفّق إطارات.

### 0.5) ما تغيّر منذ r8 — الجوهر

1. **الموجة P0 أُغلقت** (خمسة عيوب): توحيد أسماء fs/pty مع جسر إصدار، بوابة دور على SFTP + حصر مضيف، بوابة دور على الاعتمادات + تدقيق، حارس `/files/:deviceId` واعٍ بالتذكرة، وجهة «سجل الجلسات».
2. **تصحيح ثلاث فرضيات في خطة 3.14.4:** أدلة P0-1/P0-2/P0-3 كانت في `packages/server` (TS) **غير المشحون إطلاقًا**؛ وP0-1 لم يكن عيبًا في الزوج المشحون (انحراف عقد)؛ وP0-4 كان عامًّا عن قصد (تذكرة `rt`).
3. **الإصدارات:** 3.14.3 ← **3.14.4** (P0) ← **3.15.0** (العقد + الأسطح الثلاثة) ← **3.16.0** (عيب كشفته بوابة).
4. **أربع بوابات جديدة في البطارية:** عقد الرسائل · P0 authz · حراسة مسارات الكتابة · أزواج الرسائل. البطارية 52 ← **56**.
5. **العقد:** 117 نوعًا كان مستخدمًا بلا إعلان (الخطة قالت 48 — لأنها مسحت الكود غير المشحون) ⇒ أُعلن الكل.
6. **عيب جديد اصطادته البوابة:** زر «بدء مع ويندوز» يُعرض لأجهزة أندرويد المتصلة، والسيرفر يردّ بالنجاح، ووكيل أندرويد بلا معالج ⇒ أُصلح في 3.16.0 (رفض `400 platform_not_supported` + إخفاء الزر).
7. **قياس P2 من قاعدة البيانات:** ستة أسطح صفرية الاستعمال ودون مستدعٍ في اللوحة.

### 0.6) نقطة التوقّف

- **آخر عمل منفَّذ:** تثبيت 3.16.0 على المضيف وWIN10 وWIN11 والمحاكي، بطارية 56/56، ونقل أدوات القبول إلى `tools/lab/accept/`.
- **لا عمل قيد التنفيذ** — لا بناء جارٍ، لا تثبيت معلّق.
- **المهام التالية تحتاج قرار مالك** (§4) — لا تُنفَّذ بلا كلمة.

---

## 1) ما أُغلق (لا يُعاد فتحه)

| البند | الدليل |
|---|---|
| P0-1 أسماء fs/pty | `2beac31` · سرد 32 مدخلًا في 22–32ms · صدى `echo ok` (‏`w3-3150`, `w5-3160`) |
| P0-2 SFTP | `c240d30` · `viewer` 403 `role_too_low` · مضيف خارج القائمة 403 `host_not_allowed` |
| P0-3 الاعتمادات | `eac00fa` · viewer 403 · manager 200 · ثلاثة أسطر تدقيق على القاعدة الحيّة |
| P0-4 `/files` | `8806c37` · بلا جلسة ⇒ `/login` في متصفح حقيقي |
| P0-5 سجل الجلسات | `bc677ae` · الحزمة: 0 × `tab=sessions` |
| P1-2 الأسطح الثلاثة | `ddc9e01` · النقطتان `#34D399`/`#94A3B8` مقيسة بكسلًا (`w4-dots`) |
| P1-3 العقد | `4914c96` · 117 نوعًا · `tsc` = 0 |
| P1-4 بوابتان | `4914c96` · `7d9cc37` · كلتاهما تعضّ (حقن ⇒ `exit 1`) |
| عيب زر البدء | `13384b5` · أندرويد 400 · ويندوز 200 · ومثبَّت كفحص F1/F2 |
| الجسر 3.14.3→3.14.4 | وكيل 3.14.3 أُعلن صراحةً وسرد `/sdcard` = 179 مدخلًا |
| البايتات المشحونة | `4358e96` · 13/13 داخل `app.asar` المثبَّت |

---

## 2) الفخاخ المثبتة — محدَّثة

1. **السيرفر المثبَّت يخدم `app.asar`**، والـasar يحمل `server.bundle.js` (esbuild لـ`server-desktop/server.js`). أي تعديل في غيره لا يظهر.
2. **`packages/server` (TS) لا يُشحن في أي حزمة** — `requireRole` عدده صفر في الـasar. أي إصلاح فيه يغيّر صفرًا. (أكبر درس في هذه الجلسة.)
3. **قفل النسخة الواحدة في الوكيل**: اقتل أي `AiRemote Agent` قبل أي مسبار.
4. **`labelAt` يفضّل `aria-label`/`title`**.
5. **`versionCode` لا يتبع `VERSION`** — يزيد يدويًا (71 الآن).
6. **`apksigner` يحتاج `JAVA_HOME` في كل صدفة.**
7. **مثبِّت NSIS يمسح المجلد ~20–25 ثانية** — لا تحكم بالفشل من `Start-Process` فوري (`Start-Sleep 25` ثم ابدأ).
8. **`shot-surface` هو المقياس القانوني** (1700×980 @2×).
9. **تثبيت وكيل في ضيف لا يُقاس بالحجم ولا بترميز الخروج** — اقرأ تاريخ `app.asar` ثم **أعد تشغيل العملية** ثم `info.agentVersion`.
10. **`appops PROJECT_MEDIA` مضلّل** — الدليل `dumpsys media_projection`.
11. **`MediaProjection` يسقط بإعادة تثبيت APK.**
12. **مسار العارض `wss://…/screen?ticket=…`** لا `/ws`.
13. **`android-audit leftApp`**: `mCurrentFocus=null` لحظة إعادة الرسم ليست خروجًا.
14. **بوابة المرجع تشترط العربية** أيضًا لا العناصر فقط.
15. **محاكي LDPlayer**: إن سقط سقط الاسمان. الإحياء: `ldconsole quit --index 0` ← `launch --index 0` ← `adb connect 127.0.0.1:5555`. (جُرِّب هذه الجلسة ونجح.)
16. **`release-manifest.js` بلا وسيط يعيد التوليد والتوقيع.**
17. **تعارض أسماء fs/pty** — أُغلق، والجسر يقبل الاسمين حتى 3.15.0 (فعليًّا بقي في 3.16.0؛ يُزال لاحقًا).

### جديدة — تعلّمتها هذه الجلسة

18. **`/api/auth/login` محدود بـ5/دقيقة** — تشغيل سكربت قبول مرتين متتاليتين يعطي `429` وفشلًا كاذبًا.
19. **asar يخزّن الحمولة غير مضغوطة** ⇒ يمكن إثبات وجود بصمة في الحزمة المثبَّتة بمسح البايتات، بلا مكتبة `asar`.
20. **الحيّ يستخدم عائلة `*Auth` كاملة** (`authMiddleware` · `ftAuth` · `aiAuth` · `relayAuth` · `fsAuth`) — أي كاشف حراسة يعرف `authMiddleware` وحده يعطي 43 إيجابية كاذبة بدل 7.
21. **Java تكتب `case "server:…"`** باقتباس مزدوج — كاشف يقبل المفرد وحده يقول «أندرويد يعالج 0 نوع»، وهو مستحيل.
22. **`vmrun runProgramInGuest` لا يعيد stdout** — اكتب سجلًّا في الضيف ثم `CopyFileFromGuestToHost`.
23. **`vmrun` يعطي 255** عندما يكون مسار برنامج الضيف خاطئًا (كان `Desktop` مُعاد توجيهه إلى OneDrive) — استخدم `C:\` الجذر.
24. **الوكيل في WIN10 لا يعود وحده بعد الترقية** — شغّله بـ`Start-Process` داخل الضيف ثم انتظر ~25 ثانية.
25. **إثبات واجهة بلون**: `uiautomator dump` للإحداثيات + `screencap` + قراءة البكسل — يثبت الحالة بدل الظن.
26. **رقم إصدار مثبَّت داخل أداة تحقق يتعفّن** — اقرأ `VERSION` من الملف.

---

## 3) الأدوات

| الأداة | الدور |
|---|---|
| `scripts/verify.js` | البطارية — **56 خطوة** |
| `scripts/check-version-consistency.cjs` | كل المصادر = 3.16.0 |
| `scripts/check-message-contract.cjs` | **بوابة 54** — نوع مستخدم بلا إعلان يفشل |
| `scripts/check-route-roles.cjs` | **بوابة 55** — مسار كتابة بلا حراسة يفشل (خط أساس 7 مسارات) |
| `scripts/check-message-pairs.cjs` | **بوابة 56** — رسالة بلا معالج تفشل (خط أساس 5+11) |
| `scripts/check-shipped-bytes.cjs` | يفتح `app.asar` المثبَّت ويبحث عن بصمات الإصلاح (13/13) |
| `scripts/check-db-usage.cjs` | عدّ صفوف لكل جدول — استعمال فعلي لـP2 |
| `scripts/audit-live-surface.cjs` | مسح سطح السيرفر الحيّ (156 مسارًا · 92 كتابة · 8 بلا JWT) |
| `scripts/audit-message-pairs.cjs` | تحليل الأزواج (تقريري) |
| `tools/lab/accept/{fs,pty,authz}.cjs` | **مصفوفة القبول** على أجهزة حقيقية (1–11) |
| `scripts/release-manifest.js` | توليد/توقيع البيان · `--verify` |
| `tools/install-agent.bat` | ترقية صامتة في الضيف |
| `tools/lab/session/check-artifacts.cjs` | `asar` + نسخ |

---

## 4) ما بقي — كله يحتاج المالك

| البند | يحتاج | التفصيل |
|---|---|---|
| **P2 — الأسطح صفرية الاستعمال** | قرار: حذف / إخفاء / إبقاء موثَّق | ستة: `device_credentials` · `alert_rules` · `contacts` · `notifications` · `scheduled_tasks` · `device_permissions` — صفر صفوف + لا يشير إليها كود اللوحة. الدليل: `docs/AUDIT-2026-11-08-LIVE-SURFACE-AR.md` §6 |
| **TAB16 · TECNO** | تشغيلهما | على 3.14.3 خارجهما الخدمة |
| **`MediaProjection`** | نقرة على الجهاز | غير مُتحقَّق بعد 3.16.0 |
| **P1-1 (تدريج الأدوار)** | لا محلّ له | لا مسار كتابة بلا حراسة في الحيّ؛ ما تصفه الخطة يخصّ كودًا غير مشحون |
| **تنظيفان تجميليان** | اختياري | حذف مسار `screen_control` الميت · إسقاط ردّ `server:pong` |

---

## 5) أوامر جاهزة (لا تُشغَّل بلا إذن)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'

# تحقّق
node scripts/verify.js
node scripts/check-shipped-bytes.cjs
node scripts/release-manifest.js --verify

# قبول على الأجهزة
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
node tools/lab/accept/fs.cjs
node tools/lab/accept/pty.cjs
node tools/lab/accept/authz.cjs     # انتظر دقيقة بعد أي تشغيل سابق (حدّ 5/دقيقة)

# بناء حزمة السيرفر
cd packages\dashboard; .\node_modules\.bin\tsc.cmd; .\node_modules\.bin\vite.cmd build
cd ..\server-desktop; node scripts\copy-dashboard.js; node scripts\bundle.js
.\node_modules\.bin\electron-builder.cmd --win --x64

# APK (JAVA_HOME في كل صدفة)
$env:JAVA_HOME='D:\autoclaw projects\offline-build-tools\android-toolchain\jdk'
cd packages\android-agent
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\gradle\bin\gradle.bat' --offline --no-daemon assembleDebug
& '...\sdk\build-tools\34.0.0\apksigner.bat' sign --ks ..\..\secrets\airemote-release.jks --ks-key-alias airemote `
  --ks-pass file:..\..\secrets\keystore-password.txt --out ..\..\releases\AiRemote-Agent-<v>.apk app\build\outputs\apk\debug\app-debug.apk

# تثبيت السيرفر (أوقف بالمسار لا بالاسم)
Get-Process 'AiRemote Server' | Where-Object { $_.Path -like '*Programs\AiRemote Server*' } | Stop-Process -Force
& 'releases\server-windows\AiRemote-Server-Setup-v<v>-x64.exe' /S
Start-Sleep -Seconds 25      # NSIS يمسح المجلد لحظيًا (فخ 7)
Start-Process 'C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe'
curl.exe -k -s https://127.0.0.1:3001/health
```

---

## 6) بروتوكول التنفيذ

1. **قِس أولًا** — ولا تثق بأرقام هذا الملف بلا تحقّق.
2. **تعديل واحد = التزام واحد** برسالة إنجليزية تحمل الرقمين (قبل/بعد).
3. إن ساء الرقم: `git checkout` فورًا.
4. الدليل في `outputs/verify-YYYY-MM-DD/`.
5. `design/*.html` للقراءة فقط · Git محلي · **لا أسرار في المخرجات**.
6. **لا تلمس عقد API** ولا تصميم سطح بلا قرار مالك.
7. **أي تغيير في محتوى الحزمة يرفع الرقم.**
8. **بوابة جديدة تحتاج إثبات عضّ** + خط أساس بأسباب، وتفشل إن تعفّن خط الأساس.
9. **⛔ لا تنفّذ شيئًا بلا إذن المالك.**

---

## 7) خريطة ملفات الجلسة

| الملف | الدور |
|---|---|
| `docs/SESSION-2026-11-08-P0-AR.md` | تقرير الجلسة الكامل (§0–§16) |
| `docs/AUDIT-2026-11-08-LIVE-SURFACE-AR.md` | مسح السطح الحيّ + أزواج الرسائل + استعمال القاعدة + العيب المكتشف |
| `docs/خطة-إصلاح-AiRemote-3.14.4-AR.md` | خطة P0/P1/P2 الأصلية (**أدلّتها تحتاج تصحيحًا** — انظر §0.5) |
| `outputs/verify-2026-11-08/p0/` | بطارية 53 + اختبار P0 authz |
| `outputs/verify-2026-11-08/w1-build-3144/` | بناء 3.14.4 + البيان |
| `outputs/verify-2026-11-08/w2-fleet/` | تثبيت الأسطول + الجسر + authz حيّ |
| `outputs/verify-2026-11-08/w3-3150/` | 3.15.0 + البايتات المشحونة |
| `outputs/verify-2026-11-08/w4-dots/` | لقطات النقطتين (أخضر/رمادي/أخضر) |
| `outputs/verify-2026-11-08/w5-3160/` | 3.16.0 + بطارية 56 + فحص البايتات |
| `outputs/verify-2026-11-08/w6-emu/` | سقوط المحاكي وإحياؤه + واجهة v3.16.0 |
| `PROJECT_STATE.md` §0.0 | مدخل 2026-11-08 (3.16.0) |

---

## 8) ديون معروفة (لا تُخفى)

| الدين | الأثر |
|---|---|
| `audit/*.md` المشار إليها في r8 | **غير موجودة** — أرقام P2 في الخطة لا سند لها |
| أرقام الخطة (72 نوعًا · 48 غير معلن · 56 عنصرًا · 47 قدرة) | كلها من الكود غير المشحون — لا تُستخدم كأساس |
| بقاء جسر `agent:fs_response`/`pty_output` | إزالة في إصدار لاحق (كانت 3.15.0) |
| المسار الميت `screen_control` وردّ `server:pong` | تنظيف تجميلي مؤجَّل |
| TAB16 · TECNO على 3.14.3 | الأسطول غير موحَّد |
| `MediaProjection` بعد 3.16.0 | غير مُتحقَّق |

---

**نهاية r9.** ابدأ بالقراءة والتحقّق (§0.1) فقط، ثم انتظر كلمة المالك.
