# استئناف AiRemote — 2026-11-11 · الإصدار **3.16.8** — نسخة **r11**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-10-3.16.6-FULL-AR-r10.md` وكل ما قبله.**
> كل رقم هنا **مقيس في 2026-11-11** على السيرفر المثبَّت نفسه، لا منقولًا من وثيقة.

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا ويُحترم حرفيًا

**قِف هنا. لا تنفّذ أي إجراء — لا بناء، لا تثبيت، لا تعديل ملف، لا تشغيل سكربت يكتب — حتى يقول المالك صراحةً «ابدأ» أو «نفّذ البند كذا» أو «اكمل الصفحة رقم كذا».**

- ترخيصك الحالي: **قراءة وتحقّق فقط** (قراءة ملفات، `git log`، `/health`، تشغيل بوابات القراءة).
- كل ما في هذا الملف **منجَز ومُثبَّت**. لا شيء قيد التنفيذ. لا بناء جارٍ. لا تثبيت معلّق.
- إن وجدت رقمًا مختلفًا عمّا هنا: **لا تُصلح شيئًا**. أبلِغ المالك بالفرق وانتظر.
- أي تعديل قبل الإذن = خرق، حتى لو بدا إصلاحًا واضحًا أو سطرًا واحدًا.

---

## 0.1) الحالة المقيسة الآن (2026-11-11)

| البند | القيمة | كيف تُتحقَّق |
|---|---|---|
| الفرع | `feat/screen-unify-3.13.0` | `git branch --show-current` |
| آخر التزام | **`2cd9e60`** (قبل إضافة ملف r11؛ إضافته تُنتج التزامًا إضافيًا واحدًا) | `git rev-parse --short HEAD` |
| التزامات منذ r10 (`907a511`) | **45** قبل r11 · **46** بعده | `git log --oneline 907a511..HEAD \| Measure-Object -Line` |
| `VERSION` | **3.16.8** | `Get-Content VERSION` |
| `versionCode` أندرويد | **98** | `packages/android-agent/app/build.gradle` |
| السيرفر المثبَّت | **3.16.8** على **3001** (TLS) | `curl.exe -k -s https://127.0.0.1:3001/health` |
| معاينة Vite | **5000** (dev · بروكسي إلى 3001) | `Get-NetTCPConnection -LocalPort 5000 -State Listen` |
| بوابة التحقق | **55/56** — الفشل الوحيد بيئي (انظر 0.1.2) | `node scripts/verify.js` |
| توافق الإصدار | **PASS** | `node scripts/check-version-consistency.cjs` |
| البيان | **signature OK · all artifacts match** · 27 عنصرًا | `node scripts/release-manifest.js --verify` |
| حزمة السيرفر | `AiRemote-Server-Setup-v3.16.8-x64.exe` **152.04 MB** · zip **202.34 MB** | `releases/server-windows/` |
| APK أندرويد | `AiRemote-Agent-Android-v3.16.8.apk` **202,023 B** · code 98 | `releases/android-agent/` |
| الأسطول | **5 أجهزة · 1 متصل الآن** (Android-Emulator) | `/api/devices` |
| المستخدمون | **3** كلهم `admin` · 2FA معطّل | `/api/users` |
| المهام المجدولة | **0** | `/api/tasks` |
| قواعد التنبيه | **0** | `/api/alerts` |

> «غير متصل» يعني **الوكيل غير مُشغَّل الآن**، لا عيبًا. الأجهزة الخمسة مسجّلة وتعمل عند تشغيل وكلائها.

### 0.1.1) أول 10 دقائق — تحقّق ثم قف

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git rev-parse --short HEAD                              # 2cd9e60 قبل r11 · التزام الوثيقة بعده
git log --oneline 907a511..HEAD | Measure-Object -Line   # 45 قبل r11 · 46 بعده
Get-Content VERSION                                      # 3.16.8
curl.exe -k -s https://127.0.0.1:3001/health             # version 3.16.8 · port 3001 · tls true
node scripts/verify.js                                   # 55/56 — يُتوقَّع فشل e2e: sessions export
node scripts/check-version-consistency.cjs               # PASS — كل المصادر 3.16.8
node scripts/release-manifest.js --verify                # signature OK · all artifacts match
```

**بعدها توقّف.** لا تُصلح أي فرق، ولا تُشغّل بناءً «للتأكيد».

### 0.1.2) لماذا 55/56 وليس 56/56 — سبب بيئي معروف

`e2e: sessions export (R8)` يفشل بعد كل حزمة، لأن `electron-builder` يُعيد بناء `better-sqlite3` لـ**Electron ABI 119**، فيسقط اختبار Node 24 إلى `node:sqlite` وتختلف تصفية التصدير داخل الاختبار. **ليس عيبًا في الكود.** لتصفير البوابة: `pnpm rebuild better-sqlite3` بعد الحزمة (ثم يُعاد بناؤه لـElectron في الحزمة التالية).

---

## 0.2) الوصول والحسابات (لا قيم سرّية داخل المستودع)

| ما | أين / كيف |
|---|---|
| حساب اللوحة | `admin@airemote.local` (دور `admin`) — **كلمة المرور عند المالك فقط** |
| حسابان احتياطيان | `admin@airemote.io` · `lab-probe@local` |
| الحساب المؤقت `ui-audit@local` | **حُذف نهائيًا** — لا تحاول استخدامه |
| قاعدة البيانات | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` (قراءة فقط) |
| مفاتيح التوقيع | `C:\Users\admin\AppData\Roaming\AiRemote\signing\airemote-release.jks` + `secrets\keystore-password.txt` — لا تُنسخ ولا تُطبع |
| مفتاح AI | محفوظ في قاعدة السيرفر (`settings.aiApiKey`، 51 محرفًا) — لا يُطبع ولا يُكتب في ملف |
| بوت Telegram | التوكن في `settings.telegramToken` (48 محرفًا) · المحادثة `1029428155` |

**قاعدة صارمة:** أي سرّ يُقرأ من البيئة (`AEMAIL` · `APASS` · `AI_KEY` · `TG_TOKEN` · `TG_CHAT`) أو عند المالك. لا يُكتب في مستودع ولا في وثيقة ولا في التزام.

**قراءة القاعدة من Node:** `better-sqlite3` قد يكون مبنياً لـElectron؛ استخدم `require("node:sqlite").DatabaseSync` مع `{readOnly:true}` (يعمل على Node 24 المرفق).

---

## 0.3) البيئة والأدوات — **مسارات مصححة**

> r10 ذكر `D:\autoclaw projects-new\offline-build-tools` وهذا **خطأ**. الجذر الصحيح في هذا الجهاز:

| الأداة | المسار |
|---|---|
| جذر الأدوات | `D:\autoclaw projects\offline-build-tools` |
| JDK | `…\android-toolchain\jdk` (OpenJDK 21) |
| Android SDK | `…\android-toolchain\sdk` (platform android-35 · build-tools **34.0.0**) |
| Gradle | `…\android-toolchain\gradle\bin\gradle.bat` |
| adb | `…\android-toolchain\sdk\platform-tools\adb.exe` |
| zipalign / apksigner | `…\sdk\build-tools\34.0.0\{zipalign.exe, apksigner.bat}` |
| LDPlayer (احتياط) | `D:\LDPlayer\LDPlayer9\{ldconsole.exe, adb.exe}` |
| Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` |
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
| Android-Emulator | **online** | Android 9 (API 28) | عمود فقري للاختبار · يعمل لأنه API 28 (تخزين قديم) |
| TECNO-KL4 | offline | Android 14 (API 34) | وكيل **3.16.8 / code 98** · صلاحية «كل الملفات» ممنوحة · `serial 12927374CM001019` |
| WIN10-VM | offline | Windows 10 19045 | يحتاج دفعة إقلاع بعد كل ترقية |
| WIN11-VM | offline | Windows 11 22000 | |
| TAB16-USB | offline | Android 8.1 (API 27) | خارج الخدمة الآن |

**قدرات مشتركة:** `pty` · `shell` · `fs` · `screenControl` · `clipboard` · `chat` · `ai` · `android`/`multiMonitor`.

**اختبار جهاز حقيقي:** `adb -s 12927374CM001019 …` · منح صلاحية التخزين للتحقق: `adb shell appops set com.airemote.agent MANAGE_EXTERNAL_STORAGE allow`.

---

## 0.5) إعدادات التطبيق المحفوظة الآن (هي «الحالة» التي يجب ألّا تُفقد)

| الإعداد | القيمة المخزّنة |
|---|---|
| مزوّد الذكاء الاصطناعي | **`zai`** · النموذج **`glm-4.7-flash`** · المفتاح محفوظ (51) |
| `aiConfigs` / `ai_config` | نسختان لنفس المزوّد (`zai`) — سلوك قائم |
| إشعارات Telegram | **مفعّلة** · توكن محفوظ (48) · محادثة `1029428155` |
| مفاتيح الأحداث | `online: true` · `offline: true` · `chat: true` · `task: true` |
| المهام المجدولة | **0** |
| قواعد التنبيه | **0** |
| 2FA | **معطّل** لكل المستخدمين (3) |
| الأجهزة | 5 مسجّلة |
| المظهر | الوضع النهاري |

---

## 0.6) ما أُنجز في 3.16.7 و3.16.8 (45 التزامًا)

### 0.6.1) 3.16.7 — الأمن والحقيقة

| المحور | الالتزامات | المحتوى |
|---|---|---|
| رمز الجهاز | `4b1c849` · `a0c31b0` · `18ef9e9` | حجب `token` عن غير الأدمن في **ثلاثة أسطح**: `/api/devices` · `/api/devices/:id` · `server:snapshot` (WS) + إخفاء «تثبيت الوكيل» عن غير الأدمن |
| العارض «عرض فقط» | `048cd87` | `record_start` و`set_resolution` لم يكونا في `CONTROL` ⇒ يُرفضان الآن على الخادم وتُخفى الأداتان |
| المستخدمون | `4b4674c` | لا تخفيض للذات ولا تخفيض/حذف آخر أدمن (خادم) + السبب في Toast |
| تعليمات التثبيت | `d47a6ae` | حذف `/agent-install.sh` المفقود وصورة `ghcr.io` ومفاتيح `AIREMOTE_*` الوهمية → `SERVER_URL/DEVICE_TOKEN/DEVICE_NAME` |
| الإدعاءات الكاذبة | `72bd404` · `5f284c5` | بحث التدقيق يطابق `user_email`/`user_id` · webhook لـ`device_online` يُرسل فعلًا |
| تجميلي | `7dd7723` · `fe4fb14` | خطأ التحميل لا يُعرض مع الفراغ · تسمية علامة المشاهد |
| إصدار | `8c78328` · `cbdbe10` | 3.16.7 + بيان موقّع |

### 0.6.2) 3.16.8 — ثماني صفحات + وكيل أندرويد

| # | الصفحة | الالتزامات | أبرز ما نُفِّذ |
|---|---|---|---|
| 1 | غرفة العمليات `/` | `0c613f8` · `4ced98b` · `8306737` · `c570ff4` · `5640e78` · `328827b` | مسار البث لغير الأدمن (بدل 403) · ترتيب المتصل أولًا · «عرض كل الأجهزة» · عدّادا «بث نشط/تحت ضغط» · «آخر ظهور» · إيقاظ محروس + Toast · مصدر حالة واحد للبلاطة · حوار التكبير (تركيز) · حالة «كل البطاقات مخفية» · SPA · 32px للأزرار · أيقونات قدرات هادئة |
| 2 | الأجهزة `/devices` | `3bbe921` · `b233c44` · `53661be` | رسائل فشل لسبعة أفعال · `api` بدل `fetch` خام (تجديد 401) · آخر اتصال UTC (`asUtc`) · فلتر «محجوب» + عدّاد · تعريب الشريط والفراغ والتذييل · مؤشر انشغال الصف |
| 3 | مساحة الجهاز `/devices/:id` | `9bcc68e` | تحميل/خطأ/غير موجود منفصلة · `?tab` يتبع الرابط · تبويب يحتاج اتصالًا يعود لنظرة عامة · `ErrorBoundary` مفتاح · زر تحديث · حذف تكرار الرسوم · نفق مقروء · إخفاء أرقام offline |
| 3ب | الملفات + TECNO | `cce1255` · `c0c3164` | `FileManager` يحترم `initialPath` · أندرويد يفتح `/sdcard` · تلميح صلاحية · **الوكيل**: `MANAGE_EXTERNAL_STORAGE` + خطوة ثامنة في المعالج + رسالة واضحة · **APK 3.16.8 (98)** |
| 4 | سجل الجلسات `/sessions` | `a21f5aa` | `total` و`offset` و`counts` من الخادم · الشرائح تعيد الجلب · تصدير محروس بالدور · نوع `shell` · توافق رجعي |
| 5 | الإعدادات `/settings` | `b3e86b5` · `a9518eb` | لا حفظ فوق إعدادات لم تُحمّل · الموديل المخزَّن دائمًا في القائمة · «تغييرات غير محفوظة» + `beforeunload` · إظهار توكن البوت · مفاتيح الأحداث مترجمة · المهام: فشل مرئي + تأكيد حذف + «القادم/آخر تشغيل» + رفض «يوميًا» بلا وقت · 2FA: فشل القراءة ≠ معطّل |
| 6 | المستخدمون `/users` | `35e92dd` | جدول من الخادم بعد الإنشاء/التغيير · عمود 2FA · بحث وفلتر دور · صفّك: الدور مقفل والحذف مخفي |
| 7 | العارض `/view/:id` | `0ac685e` · `a4b8420` | زر إعادة المحاولة في كل حالة فشل · اختصارات `L/P/E/C` لا تسرق الحروف أثناء الكتابة البعيدة · التذكرة تُمرَّر للنافذة المستقلة · السطوع شريط يعمل |
| 8 | التنبيهات `/notifications` | `23f1e9f` | ترقيم من الخادم (`offset/total`) · مستمع `broadcast:notification` (تحديث فوري) · تعليم إشعار واحد · تأكيدات الحذف · اسم الجهاز بدل UUID |
| — | الإصدار | `d093061` · `2cd9e60` | رفع الإصدار في المصادر + بناء + تثبيت + بيان موقّع (27 عنصرًا) + مزامنة `static` |

### 0.6.3) الأدلة المقيسة للبناء

- `/health` → `{"status":"ok","version":"3.16.8","tls":true,"port":3001}`.
- الواجهة المخدومة = المبنية (`assets/index-BAL8gZr1.js`).
- حُذفت من بايتات الحزمة: `agent-install.sh` و`ghcr.io/airemote` (تحقّق `rg --binary` على `app.asar`).
- `check-version-consistency` → **PASS** (كل المصادر + `/health` + `manifest`).
- `release-manifest --verify` → **signature OK · all artifacts match** (كان `INVALID` قبل 3.16.7).

---

## 0.7) آلية العمل المتفق عليها مع المالك (مهمة للاستئناف)

1. **صفحة بصفحة** بترتيب الخطة: 1 غرفة العمليات → 2 الأجهزة → 3 المساحة → 4 الجلسات → 5 الإعدادات → 6 المستخدمون → 7 العارض → 8 التنبيهات ✅ **منجزة**، ثم 9 التدقيق → 10 المساعد → 11 المساعدة → 12 الملفات → 13 الدخول → 14 التهيئة → 15 المعرض.
2. **المعاينة الحيّة إلزامية**: `http://localhost:5000` (Vite). تعديلات الواجهة تظهر فورًا؛ تعديلات الخادم **لا** تظهر حتى البناء والتثبيت (المعاينة تُمرِّر `/api` إلى المثبَّت).
3. **المالك لا يريد حلقات موافقة**: قلّم القرار داخل النطاق القابل للعكس، نفّذ، ثم وثّق. سله فقط عند قرار غير قابل للعكس أو توسيع نطاق.
4. **تعديل واحد = التزام واحد** برسالة إنجليزية تشرح **السبب** لا التغيير.
5. **تقرير موثّق بعد كل صفحة** (ملف Markdown يُسلَّم للمالك) يضم: ما نُفِّذ مع الالتزام · ما لم يُنفَّذ وسببه · الحالة.
6. **البناء عند الأمر فقط**: رفع `VERSION` + أربعة `package.json` + `version.ts` + `agent-desktop/renderer/index.html` + `versionCode`، ثم dashboard → server-desktop، ثم تثبيت، ثم إعادة توليد البيان وتوقيعه، ثم البوابات.

---

## 1) ما أُغلق ولا يُعاد فتحه

| البند | الدليل |
|---|---|
| حجب `token` عن غير الأدمن (3 أسطح) | `4b1c849` · `a0c31b0` · `18ef9e9` |
| منع «عرض فقط» من تسجيل الخادم وتغيير الدقة | `048cd87` |
| حارس آخر أدمن ومنع تخفيض الذات | `4b4674c` |
| تعليمات تثبيت صادقة (بلا مسار/صورة وهمية) | `d47a6ae` |
| بحث التدقيق بالمستخدم | `72bd404` |
| webhook لـ`device_online` | `5f284c5` |
| البيان الموقّع (كان INVALID) | `cbdbe10` · `d093061` |
| صلاحية «كل الملفات» على TECNO + APK 3.16.8 | `c0c3164` (اختبار المالك: نجح) |
| صفحات 1–8 | الالتزامات في 0.6.2 |

---

## 2) الفخاخ المثبتة — محدَّثة

### قديمة ما زالت تصدق
1. **السيرفر المثبَّت يخدم `app.asar`** (esbuild لـ`server-desktop/server.js`) — لا `packages/server` (TS).
2. **قفل النسخة الواحدة في الوكيل** — اقتل أي `AiRemote Agent` قبل أي مسبار.
3. **`versionCode` يزيد يدويًا** (98 الآن) — أندرويد يرفض التثبيت إن لم يزد.
4. **`apksigner` يحتاج `JAVA_HOME`** في كل صدفة.
5. **NSIS يمسح المجلد ~20–25 ثانية** — انتظر قبل الحكم بالفشل.
6. **`/api/auth/login` محدود 5/دقيقة**.
7. **`MediaProjection` يسقط بإعادة تثبيت APK** — يُطلب من الجهاز بعد كل تثبيت.
8. **مسار العارض `wss://…/screen?ticket=…`** لا `/ws`.
9. **`vmrun runProgramInGuest` لا يعيد stdout** — اكتب سجلًّا في الضيف.
10. **عربية PowerShell 5.1**: لا تكتب ملفًا عربيًا بـ`Set-Content`؛ اقرأ بـ`read`/`rg` لا `Get-Content` (يطبع mojibake).

### جديدة — 3.16.7/3.16.8
11. **`better-sqlite3` يتبع آخر عملية**: Node (149) للاختبارات · Electron (119) للحزمة. بعد كل حزمة يفشل `e2e: sessions export` حتى `pnpm rebuild better-sqlite3`. **لا تعتبره عيبًا.**
12. **أندرويد 13+ لا يقرأ التخزين المشترك** بـ`READ_EXTERNAL_STORAGE` (سقفه 32). الحل الوحيد: `MANAGE_EXTERNAL_STORAGE` + شاشة النظام. ولا يكفي `targetSdk` أقل.
13. **`appops set … MANAGE_EXTERNAL_STORAGE allow`** يعمل عبر adb للتحقق الفوري دون نقرة.
14. **`FileManager` كان يفرض `/`** عند التركيب ويتجاهل `initialPath`؛ أي شاشة ملفات جديدة يجب أن تمرّر المسار.
15. **بوابة 56 لا تلمس الواجهة**: 30 e2e على API/WS + 7 وحدة + 11 سياسة + 4 بناء + tsc + تباين. لا خطوة ترسم صفحة ⇒ أي كسر بصري يمرّ.
16. **نهايات الأسطر مختلفة**: `server.js` و`ScreenViewer` و`control-room.css` = CRLF؛ أغلب صفحات الواجهة = LF. أداة التعديل تفشل عند عدم التطابق.
17. **Gradle يجب أن يعمل في الخلفية**: التشغيل المتزامن يُقتل ويُفشل بـ`exec_process_tree_termination_unconfirmed`.
18. **`apksigner` يحتاج ملفَّي كلمة مرور منفصلين** (`--ks-pass file:` و`--key-pass file:`)؛ استخدام ملف واحد يعطي «end of file reached».
19. **الحزمة تعيد كتابة `packages/server-desktop/static`** (متعقَّب في git) ⇒ إما التزام `chore(build)` أو شجرة متسخة.
20. **`settings` تحمل نسختين للمفاتيح** (`aiConfigs` و`ai_config`) — لا تحذف إحداهما بلا قرار مالك.

---

## 3) الأدوات

### 3.1) في المستودع
| الأداة | الدور |
|---|---|
| `scripts/verify.js` | البطارية — **55/56** الآن (الفشل البيئي) |
| `scripts/check-version-consistency.cjs` | كل المصادر = 3.16.8 (يقرأ `/health`) |
| `scripts/release-manifest.js` | توليد/توقيع البيان · `--verify` |
| `scripts/check-message-contract.cjs` · `check-route-roles.cjs` · `check-message-pairs.cjs` | بوابات 54–56 |
| `scripts/check-shipped-bytes.cjs` | يفتح `app.asar` ويبحث عن بصمات |

### 3.2) بناء أندرويد (متسلسلة مجرَّبة)
```powershell
$b='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME="$b\jdk"; $env:ANDROID_HOME="$b\sdk"; $env:ANDROID_SDK_ROOT="$b\sdk"
# 1) البناء (في الخلفية دائمًا)
& "$b\gradle\bin\gradle.bat" -p packages\android-agent assembleRelease --console=plain --no-daemon
# 2) التوقيع (ملفان منفصلان لكلمة المرور)
& "$b\sdk\build-tools\34.0.0\zipalign.exe" -f -p 4 app-release-unsigned.apk aligned.apk
& "$b\sdk\build-tools\34.0.0\apksigner.bat" sign --ks <jks> --ks-pass file:<f1> --key-pass file:<f2> --out AiRemote-Agent-Android-v<ver>.apk aligned.apk
& "$b\sdk\build-tools\34.0.0\apksigner.bat" verify --verbose <out.apk>
# 3) التثبيت
& "$b\sdk\platform-tools\adb.exe" -s 12927374CM001019 install -r <out.apk>
```

---

## 4) ما بقي — يحتاج أمر المالك

| # | الصفحة | أبرز ما تبقّى |
|---|---|---|
| 9 | سجل التدقيق `/audit` | مفردات الأحداث (25 تسمية مقابل أحداث كثيرة) · مرشّح `deviceId` ومدى زمني · توسيع الصف بلوحة المفاتيح |
| 10 | المساعد `/ai` | الأجهزة offline مخفية · معرّف محفوظ ميت · `?prompt` مرة واحدة · «جارٍ الاتصال» بلا نهاية |
| 11 | المساعدة `/help` | الفهرس لا يُصفّى مع البحث · لا روابط عميقة/طباعة · روابط سريعة هشّة |
| 12 | الملفات `/files/:id` | `rk` غير مقروء · طابور النقل بلا تذكرة (401 صامت) · تنزيل في الذاكرة · رفع ملف واحد |
| 13 | الدخول `/login` | كل فشل = «بيانات خاطئة» · TOTP<6 · «نسيت» مسدود · لا إعادة توجيه للمسجّل |
| 14 | التهيئة `/setup` | تعارض سياسة كلمة المرور (واجهة تفرض كبير+رقم، خادم 12 حرفًا) · رسائل إنجليزية خام · لا 2FA |
| 15 | المعرض `/dev/ui` | تطوير فقط — خارج المنتج |

### ديون معروفة
- `packages/server` (TS) لا يُشحن — أي إصلاح فيه يجب تكراره في `server-desktop/server.js`.
- `runTask`/`taskNextDue` داخل `server.js` بلا اختبار وحدة.
- إشعارات `server_errors` تُكتب بـ`user_id = NULL` فلا تظهر لأحد.
- لا استهداف لجهاز في قاعدة تنبيه (المحرّك يدعمه، النموذج لا).
- لا تعديل للمهمة بعد إنشائها (`PATCH` يقبل `enabled` فقط).
- شعار الترحيل مختلط الاتجاه · `popout-closed` بلا مستمع · `rt` المحذوف يطرد عند 401.
- `static/` يحمل نسخة مبنية من الواجهة داخل git.

---

## 5) أوامر جاهزة (لا تُشغَّل بلا إذن)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'

# تحقّق فقط
node scripts/verify.js
node scripts/check-version-consistency.cjs
node scripts/release-manifest.js --verify

# بناء إصدار جديد (الترتيب مهم)
cd packages\dashboard; npm run build
cd ..\server-desktop; $env:CSC_IDENTITY_AUTO_DISCOVERY='false'; npm run build:win:nodownload   # في الخلفية

# تثبيت
Get-Process 'AiRemote Server' -ErrorAction SilentlyContinue | Stop-Process -Force
& 'releases\server-windows\AiRemote-Server-Setup-v<v>-x64.exe' /S
Start-Sleep -Seconds 32
Start-Process 'C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe'
curl.exe -k -s https://127.0.0.1:3001/health

# معاينة الواجهة (تبقى على 5000)
cd packages\dashboard; .\node_modules\.bin\vite.cmd --port 5000 --strictPort
```

---

## 6) بروتوكول التنفيذ

1. **قِس أولًا** (§0.1.1) — لا تثق بأرقام هذا الملف بلا تحقق.
2. **تعديل واحد = التزام واحد** برسالة إنجليزية تشرح **السبب**.
3. إن ساء الرقم: `git checkout` فورًا.
4. الدليل المقيس (قبل/بعد) في الرد وفي تقرير الصفحة.
5. **لا أسرار** في المستودع ولا الالتزامات ولا المخرجات.
6. **لا تلمس عقد API** ولا تصميم سطح بلا قرار مالك.
7. **أي تغيير في محتوى الحزمة يرفع الرقم** في المصادر السبعة + `manifest.json` + `versionCode`.
8. **بوابة جديدة تحتاج إثبات عضّ** + خط أساس بأسباب.
9. **⛔ لا تنفّذ شيئًا بلا إذن المالك.**

---

## 7) تقارير الجولات (سُلِّمت للمالك في مساحة العمل، ليست داخل المستودع)

| الملف | المحتوى |
|---|---|
| `تقرير-غرفة-العمليات-3.16.8.md` | الصفحة 1 |
| `تقرير-صفحة-الأجهزة-3.16.8.md` | الصفحة 2 |
| `تقرير-الصفحتين-3-و-4-3.16.8.md` | المساحة + الملفات/TECNO + الجلسات |
| `تقرير-صفحة-الإعدادات-3.16.8.md` | الصفحة 5 |
| `تقرير-صفحة-المستخدمين-3.16.8.md` | الصفحة 6 |
| `تقرير-صفحة-العارض-3.16.8.md` | الصفحة 7 |
| `تقرير-التنبيهات-وإصدار-3.16.8.md` | الصفحة 8 + الإصدار |
| `جدول-واجهات-السيرفر-3.16.7.md` | جرد كل زر في 15 شاشة |

---

## 8) نقطة التوقّف الدقيقة

- آخر عمل: **بناء 3.16.8 وتثبيته**، ثم **إتمام صفحة التنبيهات** وتسليم تقريرها، ثم **كتابة r11 نفسه** (الالتزام الذي يضيف هذا الملف).
- آخر قياس: بوابة **55/56** · إصدار **3.16.8** مثبَّتة · بيان موقّع · أسطول **5/1** (المحاكي فقط متصل الآن) · مهام **0** · قواعد **0** · Telegram مفعّل (4 أحداث) · AI = `zai/glm-4.7-flash` · معاينة على 5000.
- **لا شيء قيد التنفيذ.** الصفحة التالية في الخطة: **9 — سجل التدقيق**.

**نهاية r11.** قف هنا حتى يأمر المالك.
