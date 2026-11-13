# استئناف AiRemote — 2026-11-13 · الإصدار **3.16.18** — نسخة **r17**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-13-3.16.17-FULL-AR-r16.md` وكل ما قبله.**
> كل رقم هنا **مقيس في 2026-11-13** على الجهاز نفسه (آخر قياس ~15:15 بتوقيت الجهاز).
> سببه: نقل الحساب. المستودع وقاعدة البيانات ومفاتيح التوقيع **على القرص**، فلا يتأثر شيء بتغيير الحساب.
> **جديد في r17:** تشخيص وإصلاح `no frame` على TECNO (فخّ #51 مُصحَّح جذريًا) · 3.16.18 (versionCode 108) · إصلاح وضوح الوضع الفاتح (Force Dark + أزرار بيضاء على أبيض) · إعادة تصميم الشريط العلوي والسفلي · بطاقات قابلة للطيّ في الوكيلين · إزالة بطاقة «أندرويد فقط» · **٣ لقطات متتالية ناجحة على TECNO** · `control` حيًّا على TECNO (`invoked` · exit 0) · a11y مُعادة إلى `AiRemoteA11y`.

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا ويُحترم حرفيًا

**قِف هنا. لا تنفّذ أي إجراء — لا بناء، لا تثبيت، لا تعديل ملف، لا `git commit`، لا تشغيل سكربت يكتب — حتى يقول المالك صراحةً «ابدأ» أو «نفّذ البند كذا» أو «اكمل البند كذا».**

- ترخيصك الحالي: **قراءة وتحقّق فقط** (قراءة ملفات، `git log`/`git status`، `curl /health`، بوابات القراءة، `adb shell dumpsys` للقراءة، `remote-exec` للاختبار الحي **بأمر المالك فقط**).
- الممنوع الآن: أي كتابة داخل `D:\autoclaw projects-new\AiRemote` أو `D:\autoclaw projects\offline-build-tools`، وأي `adb install`/`am force-stop`/`settings put`، وأي `pnpm build` أو `electron-builder` أو `gradle`، وأي تعديل على `handoff` إلا بنسخ تقرير بأمر.
- كل ما في هذا الملف **منجَز ومُثبَّت** إلا ما هو موسوم صراحةً **«معلّق»** في §4.
- إن وجدت رقمًا مختلفًا عمّا هنا: **لا تُصلح شيئًا**. أبلِغ المالك بالفرق وانتظر.
- أي تعديل قبل الإذن = خرق، حتى لو بدا إصلاحًا واضحًا أو سطرًا واحدًا.

**كلمات فكّ التوقّف الوحيدة (من المالك فقط):** «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ».

**قبل أي شيء آخر:** اقرأ تقرير الجولة `D:\autoclaw projects-new\AiRemote-handoff\reports\تقرير-جولة-3.16.18.md` ثم هذا الملف. لا تُصلح شيئًا منهما بلا أمر.

---

## 0.1) الحالة المقيسة الآن (2026-11-13 ~15:15)

| البند | القيمة | كيف تُتحقَّق |
|---|---|---|
| الفرع | `feat/screen-unify-3.13.0` | `git branch --show-current` |
| آخر التزام | `9ad5e32` (chore(build): dashboard static لـ3.16.18) | `git log --oneline -1` |
| آخر التزام إصدار | `3b212a8` (3.16.18 · versionCode 108) | `git log --oneline -- releases/manifest.json` لا يزال 3.16.17 |
| `VERSION` | **3.16.18** | `Get-Content VERSION` |
| `versionCode` أندرويد | **108** | `packages/android-agent/app/build.gradle` |
| **السيرفر المثبَّت** | **لا يزال 3.16.17** على **3001** (TLS) — **لم يُثبَّت 3.16.18** | `curl.exe -k -s https://127.0.0.1:3001/health` |
| **حزمة السيرفر 3.16.18** | Setup = **159,432,122 B** · zip = **212,177,155 B** — **مبنية وغير مثبتة** | `releases/server-windows/` |
| **وكيل ويندوز 3.16.18** | Setup = **76,402,694 B** · zip = **1,040,173,06 B** — **مبنية وغير مثبتة** | `releases/agent-windows/` |
| **APK أندرويد 3.16.18** | **239,520 B** · موقّع v2+v3 · `versionCode 108` · SHA256 `6C9333791117777B0C12B6BBC726F5E23F9D372E22EC065E25C18D09CC86DBE6` · **مثبَّت على TECNO** | `releases/android-agent/` |
| **البيان** | **لا يزال 3.16.17 (65 عنصرًا)** — **لم يُعَد توليده** | `node scripts/release-manifest.js --verify` |
| توافق الإصدار | **سيُخفق الآن**: `VERSION`=3.16.18 مقابل `/health`=3.16.17 والبيان 3.16.17 — **هذا متوقَّع حتى تُثبَّت الحزم** | `node scripts/check-version-consistency.cjs` |
| **الأسطول** | TECNO-KL4 **online 3.16.18** · Android-Emulator **offline** (APK 3.16.18 مثبَّت لكن adb انقطع) · DESKTOP-K81PJ9H **online 3.16.17** · WIN10-VM online 3.16.0 · WIN11-VM online 3.16.0 · TAB16-USB offline | `/api/devices` أو القاعدة |
| أجهزة adb | `12927374CM001019` (TECNO) · `emulator-5554` + `127.0.0.1:5555` (المحاكي — **offline/متقطع**) — **GPSZ غير موصول** | `adb devices -l` |
| شجرة git | نظيفة في الجوهر؛ قد تبقى `artifacts/*.idsig` وملفات PROMPT غير متتبَّعة (كالجولات السابقة) | `git status --short` |

**الأجهزة المسجّلة (من القاعدة):**

| # | الاسم | الحالة | النسخة | مالك |
|---|---|---|---|---|
| 1 | Android-Emulator | **offline** (adb انقطع أثناء الجولة) | 3.16.18 مثبَّت | admin@airemote.local |
| 2 | TECNO-KL4 | **online** | **3.16.18-android (108)** | admin@airemote.local |
| 3 | DESKTOP-K81PJ9H | **online** | **3.16.17** (ويندوز — لم يُحدَّث) | lab-probe@local |
| 4 | WIN10-VM | online | 3.16.0 | admin@airemote.local |
| 5 | WIN11-VM | online | 3.16.0 | admin@airemote.local |
| 6 | TAB16-USB | **offline** | 3.16.0-android | admin@airemote.local |
| — | GPSZ2025040701858 | **غير مسجّل وغير موصول** | — | — |

> «غير متصل» يعني **الوكيل غير مُشغَّل الآن**، لا عيبًا.

### 0.1.1) أول 10 دقائق — تحقّق ثم قف

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git branch --show-current                          # feat/screen-unify-3.13.0
git rev-parse --short HEAD                         # 9ad5e32
git log --oneline -14
git status --short
Get-Content VERSION                                # 3.16.18
curl.exe -k -s https://127.0.0.1:3001/health       # 3.16.17 (متوقَّع)
node scripts/release-manifest.js --verify          # بيان 3.16.17
Get-ChildItem releases\server-windows -Filter '*3.16.18*'
Get-ChildItem releases\agent-windows  -Filter '*3.16.18*'
Get-ChildItem releases\android-agent -Filter '*3.16.18*'
'D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe' devices -l
node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db',{readOnly:true});for(const d of db.prepare('SELECT name,status FROM devices ORDER BY name').all())console.log(d.name,d.status)"
```

**بعدها توقّف.** لا تبنِ «للتأكيد»، ولا تثبّت، ولا تُصلح فرقًا.

---

## 0.2) الوصول والحسابات (لا قيم سرّية داخل المستودع)

| ما | أين / كيف |
|---|---|
| حساب اللوحة الأساسي | `admin@airemote.local` (دور `admin`) — **كلمة المرور عند المالك فقط** |
| **حساب الأتمتة العامل** | `lab-probe@local` (دور `admin`) — بياناته في `C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json` |
| حساب احتياطي | `admin@airemote.io` (دور `admin`) |
| **تنبيه** | كلمة المرور في `AiRemote\lab-credentials.txt` لحساب `admin@airemote.local` **لا تعمل (401)** — استخدم `lab-probe.json`. حدّ الدخول 5/دقيقة. |
| قاعدة البيانات | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` (قراءة فقط) |
| مفاتيح التوقيع | `C:\Users\admin\AppData\Roaming\AiRemote\signing\airemote-release.jks` · alias **`airemote`** · كلمة المرور في `keystore-password.txt` |
| شهادة TLS | `C:\Users\admin\AppData\Roaming\AiRemote-Server\tls\server.crt` (SAN يشمل 192.168.1.25) |
| مفتاح AI | في `settings.aiApiKey` — لا يُطبع |
| بوت Telegram | `settings.telegramToken` · المحادثة `1029428155` |

**قاعدة صارمة:** أي سرّ يُقرأ من البيئة أو عند المالك أو من ملفات الاعتماد. **لا يُكتب في مستودع ولا في وثيقة ولا في التزام ولا في مخرَج أداة ولا في ردّ.**

**قراءة القاعدة من Node:** `require("node:sqlite").DatabaseSync` (Node 24) — `better-sqlite3` مبني لـElectron.

**جداول القاعدة المهمة:** `devices` · `ai_conversations` · `settings` · `sessions` · `session_tokens` · `audit_log` · `users` · `device_unattended`.

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

**شبكة هذا الـPC (مقيسة):** Hostname `DESKTOP-K81PJ9H` · Wi-Fi `192.168.1.25` · Ethernet `192.168.1.55` · VMnet8 `192.168.0.1` · ZeroTier `10.90.74.220` · VMnet1 `192.168.28.1`.

**أداة التنفيذ الحي without UI (موصى بها للاختبار):** `D:\autoclaw projects-new\AiRemote-handoff\scripts\remote-exec.cjs`
- `node scripts/remote-exec.cjs TECNO-KL4 "AISHOT:/sdcard/x.jpg"` → يمرّر عبر `/api/devices/:id/exec` إلى `handleCommand` نفسه الذي تستخدمه واجهة المساعد.
- `AICTL:<base64 JSON>` → `AiRemoteA11y.runSync` (نفس عقود control).
- لا يطبع أي token.

---

## 0.4) الأجهزة (مقيسة الآن)

| الجهاز | الحالة | الإصدار | ملاحظة |
|---|---|---|---|
| **TECNO-KL4** | **online** | **108 / 3.16.18** | `serial 12927374CM001019` · شاشة **720×1600** · **التقاط 3/3 ناجح** · **a11y = AiRemoteA11y** · **control invoked** |
| Android-Emulator | **offline** (adb انقطع) | 3.16.18 مثبَّت | Android 9 (API 28) · 1600×900 ·serialno `00241cfa` · أعد التوصيل ثم `am start` |
| DESKTOP-K81PJ9H | **online** | **3.16.17** | وكيل ويندوز على هذا الـPC · لم يُحدَّث إلى 3.16.18 |
| WIN10-VM | online | 3.16.0 | `192.168.0.128` |
| WIN11-VM | online | 3.16.0 | `192.168.0.132` |
| TAB16-USB | offline | 3.16.0-android | انقطع منذ 2026-11-12 |
| GPSZ2025040701858 | غير موصول | — | **لم يُثبَّت عليه شيء** |

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
| المظهر | الوضع النهاري على TECNO (Force Dark معطَّل الآن) |
| **الشريط العلوي (جديد r17)** | **زر هوية مميّز أقصى اليسار: «AiRemote Agent» وتحته الإصدار · أقصى اليمين: النقطة الخضراء ثم زر الثيم (شمس/قمر) ثم زر اللغة (زر واحد)** — الشريط **LTR دائمًا** |
| **الشريط السفلي** | **مخفي** (كان يحمل الإصدار وعنوان wss) |
| **البطاقات** | كل بطاقات الواجهة الرئيسية قابلة للطيّ/الفتح مع حفظ الحالة |
| وضع تحكم أندرويد | «موافقة يدوية» افتراضيًا على المحاكي/TECNO |

**إعدادات وكيل ويندوز المحفوظة:**

| المفتاح | القيمة |
|---|---|
| ملف الإعداد | `C:\Users\admin\AppData\Roaming\airemote-agent-desktop\airemote-config.json` |
| `serverUrl` | `wss://192.168.1.25:3001/ws` |
| `token` | 36 محرفًا (UUID) — **لا يُطبع** |
| `autoStart` | `true` |
| متغير بيئة المستخدم | `AGENT_CA_CERT = C:\Users\admin\AppData\Roaming\AiRemote-Server\tls\server.crt` |
| معرّف الجهاز | `35850a47-e50f-48f3-bc81-8c38d7a908c0` · الاسم `DESKTOP-K81PJ9H` |

---

## 0.6) ما أُنجز في جولة r17 (2026-11-13) — بندًا بندًا

### 0.6.1) فخّ #51 — `screenshot` على TECNO (`no frame`) — **مُغلق جذريًا**

**التشخيص المقيس (قبل أي تعديل):**
- إذن جديد → لقطة واحدة `shot-ok` (863ms · 102,070 B) → اللقطة الثانية **فورًا بنفس الكود** → `no frame` (exit 1 · 1211ms).
- السجل: لا استثناء — فقط `Dispatch stop to 0 callbacks`.
- **السبب الجذري:** Android 14 يحرق رمز الموافقة بعد أول `getMediaProjection()`؛ و`captureToFile` كان يستدعي `projection.stop()` في `finally` بعد كل لقطة، فتعيد كل لقطة لاحقة استخدام رمز ميت. **ليس عيب Unisoc/HiOS** (تصحيح توصيف r16). المحاكي (Android 9) لا يفرض ذلك.

**الإصلاح (`AgentService.java` · التزام `615e897`):**
- جلسة التقاط **دافئة واحدة** (`ensureCaptureSession`) تُخزَّن في حقول `active*` المشتركة (البث يتبنّاها عبر فرعه القائم `projection != null`).
- استطلاع أول إطار حتى **3 ثوانٍ** بدل نوم ثابت 600+500ms.
- مقاس الإطار من `Image` نفسه.
- **لا `stop()` بعد اللقطة**؛ تُحرَّر فقط عند تدمير الخدمة أو عند موافقة جديدة (`resetCaptureSession` من `MainActivity.onActivityResult`).

**الاختبار الحي بعد التثبيت (3 مرات متتالية كما أمر المالك):**

| # | النتيجة | المدة | الحجم | المقاس |
|---|---|---|---|---|
| 1 | **shot-ok · exit 0** | 466ms | 74,480 B | 720×1528 |
| 2 | **shot-ok · exit 0** | **98ms** (جلسة دافئة) | 74,556 B | 720×1528 |
| 3 | **shot-ok · exit 0** | 2,679ms | 74,533 B | 720×1528 |

الأدلة: `handoff\shots-2026-11-13-31618\tecno-shot-{1,2,3}.jpg` · `tecno-10-main-v2.png`.

### 0.6.2) 3.16.18 (versionCode 108)

- التزامات: `615e897` الإصلاح · `3b212a8` رفع الرقم في المصادر السبعة + versionCode · `9ad5e32` static اللوحة.
- APK موقّع v2+v3 · 239,520 B · مثبَّت على TECNO (وكان مثبَّتًا على المحاكي قبل انقطاع adb).
- **الحزم مبنية وغير مثبتة:** سيرفر + وكيل ويندوز 3.16.18 في `releases/`. البيان لم يُعَد. `/health` لا يزال 3.16.17.

### 0.6.3) وضوح الوضع الفاتح (شكوى المالك)

| العيب | السبب المقيس | الإصلاح | التزام |
|---|---|---|---|
| معالج التهيئة «لا يُرى بشكل واضح» في الفاتح | **Force Dark** على HiOS يعتم النافذة الفاتحة إلى رمادي (47,47,48) | `AppTheme` بـ`forceDarkAllowed=false` + `decor.setForceDarkAllowed(false)` | `e3cbd93` |
| أزرار المعالج تذوب في البطاقات | `btn_ghost` ملؤه `app_surface` = أبيض داخل بطاقة بيضاء (فخّ #38) | خلفية صفحة `app_sunken` + أزرار الصفوف `btn_soft` | `bdf0ff0` |
| زر «معالج التهيئة» في الرئيسية يختفي | نص أبيض `app_on_accent` على `btn_ghost` أبيض | `btn_primary` (تركواز) | ضمن `7818beb` |

الدليل: `tecno-08-wizard-light-v2.png` (بطاقات بيضاء على خلفية غارقة، أزرار مرئية) · `tecno-03-wizard-after-theme.png` (قبل).

### 0.6.4) الشريط العلوي والسفلي (أوامر المالك المتتالية)

- الهوية **«AiRemote Agent» + الإصدار تحته** في **زر تركواز مميّز أقصى اليسار** (الشريط LTR دائمًا).
- أقصى اليمين: **النقطة الخضراء** ثم **زر الثيم** (شمس/قمر) ثم **زر اللغة** (زر واحد يعرض اللغة الأخرى).
- أُزيل: شعار «Ai» · كلمة «متصل» · زرا `ع`/`EN` المزدوجان · الشريط السفلي (الإصدار + wss).
- التزامات: `e3cbd93` · `a01a2dc`.
- الدليل: `tecno-07-titlebar-clean.png` · `titlebar-v2-crop.png` · `tecno-12-toggle.png`.

### 0.6.5) بطاقات قابلة للطيّ + إزالة بطاقة «أندرويد فقط»

- **أندرويد:** كل بطاقات الرئيسية (معالج التهيئة، الحالة، الاتصال، الأجهزة، الإعدادات) قابلة للطيّ/الفتح بسهم ومتحرك وحفظ حالة. أُزيلت بطاقة «الطرفية والأوامر وWOL غير متاحة على أندرويد» (`note_card`).
- انهيار عند الإقلاع (`child already has a parent`) أُصلح فورًا (`16f73209`).
- **ويندوز:** بطاقة «الاتصال بجهاز آخر» صارت `coll-sec` بنفس نمط معلومات الجهاز/الإعدادات/الموارد (التي كانت قابلة للطيّ مسبقًا).
- التزامات: `7818beb` · `3370766` · `16f73209`.
- الدليل: `tecno-12-toggle.png` (الاتصال مطويّ بعد نقرة، والبقية بأسهم).

### 0.6.6) a11y و`control` على TECNO — **مغلق**

- بعد التثبيت كانت a11y ساقطة؛ أُعيدت إلى `AiRemoteA11y` فقط (FileBridge **ليس** مفعّلًا حاليًا في `enabled_accessibility_services` — إن طلب المالك إعادته يُفصل بـ`:`).
- `Bound services: AiRemote Android · capabilities=33`.
- اختبار `control`: `AICTL` → `{"action":"clickname","text":"السجل"}` → **`invoked` · exit 0 · 98ms** (من شاشة الرئيسية؛ محاولة على معالج التهيئة أعطت `name-not-found` بشكل صحيح لأن التبويب غير موجود هناك).
- الدليل: `tecno-14-after-control.png` · `tecno-ui-after-control2.xml`.

### 0.6.7) GPSZ2025040701858 — **متعذّر (كما r16)**

- غير ظاهر في `adb devices` طول الجولة. لم يُثبَّت عليه شيء.

---

## 1) ما أُغلق ولا يُعاد فتحه

| البند | الدليل |
|---|---|
| كل مغلق في r16 (control المحاكي، وكيل ويندوز، shell TECNO، P1–P4، S1–S3…) | r16 §1 |
| **`screenshot` على TECNO — 3/3 ناجح** | **2026-11-13 · `tecno-shot-{1,2,3}.jpg`** |
| **`control` على TECNO — invoked · exit 0** | **2026-11-13 · `tecno-14-after-control.png`** |
| **a11y = AiRemoteA11y على TECNO** | `dumpsys accessibility` |
| **وضوح الفاتح (Force Dark + أزرار)** | `tecno-08-wizard-light-v2.png` |
| **الشريط العلوي/السفلي بالشكل المطلوب** | `tecno-07-titlebar-clean.png` |
| **بطاقات قابلة للطيّ (أندرويد + ويندوز)** | `tecno-12-toggle.png` |
| **إزالة بطاقة «أندرويد فقط»** | غابت من الرئيسية |

---

## 2) الفخاخ المثبتة — محدَّثة (70)

### قديمة ما زالت تصدق (1–50 كما في r16)

### جديدة أو مُصحَّحة — جولة r17

51. **مُصحَّحة:** `no frame` على TECNO **ليس** خاصًا بـUnisoc/HiOS. السبب: رمز MediaProjection **يُستهلك مرة واحدة** على Android 14 + `projection.stop()` بعد كل لقطة. الإصلاح: جلسة دافئة واحدة. (الوصفة القديمة «مهلة أول إطار / إعادة VirtualDisplay» وحدها لا تكفي).
52. FileBridge يسرق المقدمة **بشكل متكرر** — تحقّق `mCurrentFocus` **قبل كل نقرة/اختبار** وأعد `am start --activity-clear-top --activity-single-top`. لا توقفه.
53. `lab-credentials.txt` → 401. استخدم `lab-probe.json`. محاولة واحدة (حدّ 5/دقيقة).
54. نتيجة تنفيذ الكتل لا تُحفَظ في `ai_conversations` (بنيوي — بلا قرار).
55. a11y على TECNO الآن **AiRemoteA11y فقط**. FileBridge غير مفعّل. لدمجه: `...AiRemoteA11y:com.filebridge.app/.FbxGuardService`.
56. شاشة TECNO تنطفئ بين الجولات — `input keyevent 224` + `wm dismiss-keyguard`.
57. Z.ai عابر الفشل (~رد/30ث) — أعد بعد 30–40ث.
58. PowerShell 5.1 `>` يفسد PNG — `screencap` ثم `adb pull`.
59. **Force Dark على HiOS** يعتم الثيم الفاتح إلى رمادي (47,47,48) ويجعل المعالج غير مقروء. `forceDarkAllowed=false` في `AppTheme` + على الـdecor.
60. **نص أبيض على `btn_ghost`** يختفي في الفاتح (كان زر معالج التهيئة). داخل البطاقات استخدم `btn_soft`؛ للأزرار الأساسية `btn_primary`.
61. **إشعارات Telegram heads-up** تغطي الشاشة وتفسد اللقطات — `cmd statusbar collapse` وانتظر ثوانٍ.
62. **الطيّ البرمجي:** `removeView` **قبل** `addView` دائمًا، وإلا `IllegalStateException: child already has a parent` (انهار التطبيق مرة وأُصلح).
63. `SetupActivity` غير مُصدَّرة — `am start` يُخفق بـSecurityException (تأكيد #36). افتحها بنقرة زر المعالج.
64. `adb` يعرض أحيانًا `127.0.0.1:5555` كوصول ثانٍ **لنفس المحاكي** (`ro.serialno=00241cfa`) — لا تعدّه جهازًا؛ حساب `-s emulator-5554` صراحةً.
65. المحاكي قد ينقطع عن adb (`device offline`) بعد إعادة التثبيت — الوكيل يصير offline حتى يُعاد تشغيل التطبيق/adb.
66. **الاختبار النظيف بدون نقر:** `remote-exec.cjs` بـ`AISHOT:` و`AICTL:` يمرّ في نفس عقود المساعد.
67. `clickname` يبحث في نافذة اللمس الحالية — على معالج التهيئة لن يجد «السجل» (`name-not-found` صحيح).
68. بناء وكيل ويندوز: electron **28.3.3** (السيرفر 44.3.0) — لا تخلط المخرجات.
69. `copy-dashboard` يعيد كتابة `packages/server-desktop/static` ⇒ التزام `chore(build)` (تم).
70. **لا تثبّت سيرفر/وكيل 3.16.18 ولا تعِد البيان إلا بأمر** — التثبيت يوقف الخدمة لحظيًا (فخّ #32).

---

## 3) الأدوات

### 3.1) في المستودع
كما في r16 (`verify.js` · `check-version-consistency.cjs` · `release-manifest.js` · …).

### 3.2) سكربتات الجولات (خارج مساحة الحساب — استخدمها أولًا)

```
D:\autoclaw projects-new\AiRemote-handoff\scripts\          # 41+ سكربتًا (remote-exec.cjs أهمها)
D:\autoclaw projects-new\AiRemote-handoff\reports\
D:\autoclaw projects-new\AiRemote-handoff\docs\             # نسخ ملفات PROMPT
D:\autoclaw projects-new\AiRemote-handoff\shots-2026-11-13-31618\   # لقطات r17 (البطلان + الطيّ + الشريط + 3 لقطات + control)
D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-31618\   # رقع r17 + سجلّا البناء
D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-pending\ # register-win-agent.cjs
```

**رقع r17 (منسوخة إلى `tools-2026-11-13-31618`):** `patch_fix_capture.py` · `patch_fix_capture2.py` · `bump-31618.cjs` · `patch_setup_contrast.py` · `patch_titlebar_android.py` · `patch_titlebar_android2.py` · `patch_titlebar_android3.py` · `patch_force_dark.py` · `patch_btn_setup.py` · `patch_cards_android.py` · `patch_sess_card_win.py` · `patch_collapse_crash.py` · `ui_tap.py`.

### 3.3) بناء أندرويد (متسلسلة مجرَّبة — استُخدمت في r17)
كما في r16 §3.3 (gradle → zipalign → ملفّا كلمة مرور منفصلان → apksigner → verify → install -r → force-stop → am start).
**أضف:** بعد التثبيت لا بد `force-stop` + `am start` وإلا عملت العملية القديمة (فخّ #21).

### 3.4) بناء ويندوز
كما في r16 §3.4. **تم بناء الحزمتين 3.16.18**؛ التثبيت متبقٍ.

### 3.5–3.8) دوران الشاشة، الصلاحيات، إنشاء جهاز، قراءة القاعدة
كما في r16.

---

## 4) ما بقي — **معلّق بانتظار أمر المالك**

### 4.1) مغلق
- كل مغلق r16 **+** إصلاح `no frame` (3/3) · `control` على TECNO · a11y · وضوح الفاتح · الشريطان · الطيّ · إزالة بطاقة الملاحظة · زر المعالج.

### 4.2) معلّق
1. **تثبيت سيرفر 3.16.18** على هذا الـPC (الحزمة جاهزة: `AiRemote-Server-Setup-v3.16.18-x64.exe /S` ثم تشغيل السيرفر) حتى تصير `/health` = 3.16.18.
2. **تثبيت وكيل ويندوز 3.16.18** (`AiRemote-Agent-Setup-v3.16.18-x64.exe`) — سيحدّث `DESKTOP-K81PJ9H` (الإعدادات في AppData تبقى).
3. **إعادة توليد البيان وتوقيعه** (`node scripts/release-manifest.js` ثم `--verify`) — بعد تثبيت الحزم.
4. **`check-version-consistency.cjs`** يجب أن يصير PASS بعد 1–3.
5. **المحاكي:** adb انقطع (`device offline`). عند عودته: `am start` MainActivity وتحقّق 3.16.18 + a11y + التقاط. الوكيل حاليًا offline في القاعدة.
6. **GPSZ2025040701858** — عند توصيله: تثبيت APK 3.16.18 + `wss://192.168.1.25:3001/ws` + رمز جديد + منح الالتقاط وa11y.
7. **`verify.js`** لم يُعَد في هذه الجولة (56/57 آخر مرة على 3.16.17).
8. **نسخ تقرير الجولة** إلى مساحة الحساب الجديد إن لم تجده في `handoff\reports`.

### 4.3) تحسينات اختيارية (ليست عيوبًا) — كما r16 + 
- حفظ نتائج تنفيذ الكتل في `ai_conversations` (فخّ #54).
- شارة عدد المشاهدين · RecyclerView · powershell→sh على أندرويد.

### 4.4) ديون بنيوية باقية (لا تُفتح بلا قرار) — كما r16
- `packages/server` (TS) لا يُشحن.
- `static/` نسخة مبنية داخل git (مقصود).
- `aiConfigs`/`ai_config` مكرّران.
- صفحة 15 `/dev/ui` تطوير فقط.
- جهاز DESKTOP-K81PJ9H مالكه `lab-probe@local`.

---

## 5) أوامر جاهزة (لا تُشغَّل بلا إذن)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'

# تحقّق فقط (مسموح الآن)
node scripts/release-manifest.js --verify
node scripts/check-version-consistency.cjs   # سيُخفق حتى تُثبَّت الحزم — متوقَّع

# تثبيت سيرفر 3.16.18 (الترتيب مهم)
Get-Process 'AiRemote Server' -ErrorAction SilentlyContinue | Stop-Process -Force
& 'releases\server-windows\AiRemote-Server-Setup-v3.16.18-x64.exe' /S
Start-Sleep -Seconds 35
Start-Process 'C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe'
curl.exe -k -s https://127.0.0.1:3001/health

# تثبيت وكيل ويندوز 3.16.18
Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force
& 'releases\agent-windows\AiRemote-Agent-Setup-v3.16.18-x64.exe' /S
Start-Sleep -Seconds 20
Start-Process 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'

# إعادة توليد البيان وتوقيعه (بعد التثبيت)
node scripts/release-manifest.js
node scripts/release-manifest.js --verify
node scripts/check-version-consistency.cjs

# اختبار حي بدون UI (بعد أن يكون TECNO online)
node 'D:\autoclaw projects-new\AiRemote-handoff\scripts\remote-exec.cjs' TECNO-KL4 'AISHOT:/sdcard/x.jpg'
```

---

## 6) بروتوكول التنفيذ — حرفيًا كما r16

1. **قِس أولًا** (§0.1.1) — لا تثق بأرقام هذا الملف بلا تحقق.
2. **تعديل واحد = التزام واحد** بالسبب.
3. إن ساء الرقم: `git checkout` فورًا.
4. الدليل المقيس (قبل/بعد) في الرد وفي التقرير.
5. **لا أسرار** في المستودع/الالتزامات/المخرجات/الردود.
6. **لا تلمس عقد API** ولا تصميم سطح بلا قرار مالك — الشريط العلوي **بشكله الجديد r17** لا يُزال أي زر منه.
7. **أي تغيير في محتوى الحزمة يرفع الرقم** في المصادر السبعة + `versionCode` + البيان.
8. **بوابة جديدة تحتاج إثبات عضّ** + خط أساس بأسباب.
9. **⛔ لا تنفّذ شيئًا بلا إذن المالك.**
10. التقارير في مساحة عمل AutoClaw ثم **تُنسخ فورًا إلى القرص** (`D:\autoclaw projects-new\AiRemote-handoff\reports\`).
11. أي أداة جولة تُنسخ إلى `handoff\tools-YYYY-MM-DD-<tag>\`.
12. أي لقطة تُحفظ في `handoff\shots-YYYY-MM-DD-<tag>\`.
13. **قبل أي نقرة على جهاز: تحقّق `mCurrentFocus`** (FileBridge/livedrama).
14. لا تطبع أي سرّ.
15. **سلّط السلامة (Zwork Safety Guard):** أي أمر تدميري/مسح قرص مرفوض دائمًا؛ أوامر كتابة عالية الخطورة قد تطلب تأكيد المالك.

---

## 7) التقارير المسلَّمة

| الملف | المحتوى |
|---|---|
| كل تقارير r16 وما قبلها | `handoff\reports\` |
| **`تقرير-جولة-3.16.18.md`** | **r17: إصلاح no frame · 3.16.18 · الفاتح · الشريط · الطيّ · control TECNO · المتبقي** |

> نسخ Markdown محفوظة في `D:\autoclaw projects-new\AiRemote-handoff\reports\`.

---

## 8) نقطة التوقّف الدقيقة

**آخر ما كان جاريًا:** جولة **2026-11-13 r17** — **أُغلقت الأمور المغلقة أعلاه**، وبقي التثبيت/البيان/المحاكي كما في §4.2.

- **الالتزامات:** آخرها `9ad5e32`. لا التزام جديد بعد هذا الملف.
- **السيرفر:** 3.16.17 مثبَّت ويعمل؛ **حزمة 3.16.18 مبنية غير مثبتة**.
- **وكيل ويندوز (هذا الـPC):** 3.16.17 online؛ **حزمة 3.16.18 مبنية غير مثبتة**.
- **TECNO:** **3.16.18 · online · التقاط 3/3 · control invoked · a11y AiRemoteA11y**.
- **المحاكي:** 3.16.18 مثبَّت · **offline** (adb انقطع).
- **GPSZ:** غير موصول.
- **الأسطول:** 6 أجهزة · 4 online · TAB16-USB offline · المحاكي offline.
- **البيان:** لا يزال 3.16.17 · 65 عنصرًا.

**نقطة الاستئناف:** اقرأ هذا الملف + `تقرير-جولة-3.16.18.md`، ثم قِس (§0.1.1) و**قف**. الأوامر المتوقعة أولًا: «ثبّت السيرفر والوكيل 3.16.18 وأعد البيان» · «شغّل المحاكي» · «جهّز GPSZ» (بعد توصيله) · «شغّل verify.js».

**نهاية r17.** قف هنا حتى يأمر المالك.

---

## 9) ملحق — FileBridge (مشروع منفصل، لا تخلطه)

- المسار: `D:\autoclaw projects-new\FileBridge` · مثبَّت على محاكي AiRemote وTECNO.
- خدمته `com.filebridge.app/.FbxGuardService` **ليست** ضمن a11y المفعّلة حاليًا على TECNO (AiRemoteA11y فقط).
- يسرق المقدمة أحيانًا (فقاعة وردية + واجهة ملفات). **لا تعمل عليه إلا بأمر مالك صريح.**
- بنوده المفتوحة سابقًا: 9.2 (التنزيل المتوازي — مؤجّل) · 9.3 (تجميد HiOS Hiber على TECNO).
