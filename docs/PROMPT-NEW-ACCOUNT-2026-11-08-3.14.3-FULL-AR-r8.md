# استئناف AiRemote — 2026-11-08 · الإصدار **3.14.3** — نسخة **r8**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-07-3.14.2-FULL-AR-r7.md` وكل ما قبله.**
> كل رقم هنا مقيس في جلسات 2026-11-07/08، ودليله في `outputs/verify-2026-11-07/` و`audit/`.

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا ويُحترم

**لا تنفّذ أي إجراء — لا بناء، لا تثبيت، لا تعديل، لا تشغيل اختبار — قبل أن يقول المالك صراحةً «ابدأ» أو «نفّذ بند كذا».**

- الترخيص الحالي: **قراءة وتحقّق فقط** (قراءة الملفات، `git log`, `git status`, `/health`, `/api/devices`).
- المالك أوقف العمل عند النقطة الموضّحة في §0.6، ويريد أن يستأنف بنفسه.
- أي تعديل قبل إذنه = خرق للتعليمات، حتى لو بدا إصلاحًا واضحًا.

---

## 0) الحالة المقيسة الآن

| البند | القيمة |
|---|---|
| الفرع | `feat/screen-unify-3.13.0` |
| آخر التزام | **`7615e8b`** · **34** التزامًا منذ r7 (`52f1433`) |
| `VERSION` | **3.14.3** — أربعة `package.json` + `APP_VERSION` + احتياطي الوكيل + `versionCode **68**` |
| السيرفر المثبَّت | **3.14.3** · `{"status":"ok","version":"3.14.3","tls":true,"port":3001}` |
| وكيل المضيف | **3.14.3** مثبَّت |
| الأسطول | المضيف · WIN10-VM · WIN11-VM · Android-Emulator · TECNO-KL4 · TAB16-USB — **كلهم 3.14.3** (online) |
| APK | `releases/AiRemote-Agent-3.14.3.apk` · `versionCode 68` · `CN=AiRemote Agent` · مثبَّت على الثلاثة |
| الحِزم | Server Setup **152MB** · Server zip **202.3MB** · Agent Setup **72.9MB** · Agent zip **99.2MB** |
| البطارية | **52/52 — ALL VERIFICATION STEPS PASSED** |
| البيان | `signature OK` · `all artifacts match` (أُعيد توليده وتوقيعه على 3.14.3) |
| بوابة التوحيد | **PASS كل المصادر تحمل 3.14.3** |
| أنماط اللوحة | 14 كائنًا · **0 ثابت** |
| أزرار الوكيل | 49 ظاهرًا · 20 أيقونية · **0 بلا اسم** |
| أندرويد (مرجعي) | 19 عنصرًا · 18 نُقرت · 1 مستثنى · 0 خروج · 0 انهيار · `arabic=true` |
| مسبار الضيوف | `releases/tools/patch-probe.exe` · **93,532,160 بايت** · `--self-test` = ok |

### 0.1) أول 15 دقيقة — تحقّق قبل أي شيء

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git rev-parse --short HEAD                        # 7615e8b
git log --oneline 52f1433..HEAD | Measure-Object -Line   # 34
Get-Content VERSION                               # 3.14.3
curl.exe -k -s https://127.0.0.1:3001/health      # version 3.14.3
node scripts/verify.js                            # 52/52
node scripts/check-version-consistency.cjs        # PASS
node scripts/release-manifest.js --verify         # signature OK · all artifacts match
node tools/lab/session/check-artifacts.cjs        # RESULT: ok
```

**إن اختلف أي رقم:** الحالة تغيّرت ⇒ أعد القياس وأبلِغ المالك، **ولا تصلح شيئًا**.

### 0.2) الوصول والمفاتيح (لا تُنسخ قيمًا سرّية إلى أي ملف في المستودع)

| ما | أين | من يقرأه |
|---|---|---|
| حساب اللوحة (مختبر admin) | `C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json` (`{email,password}`) | `shot-surface` · `audit-buttons` · `lab.cjs` · أي سكربت API |
| نفس الحساب سطرين | `%TEMP%\airemote-lab-probe.txt` | `shot-dashboard` · `probe-view` |
| بيانات ضيوف VMware | `C:\Users\admin\AppData\Roaming\AiRemote\lab-credentials.txt` (`vm_guest_user` · `vm_guest_password`) | `vmrun` |
| قاعدة البيانات | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` | قراءة فقط (`node:sqlite` readOnly) |
| **كلمة مرور التحكّم الموحّدة** | **عند المالك — لا تُكتب في المستودع.** | اختبارات وضع `password` |
| حسابا المالك | `admin@airemote.local` · `admin@airemote.io` — **لم يُلمسا** | — |

**قاعدة صارمة:** أي سرّ (كلمة مرور، رمز جهاز، مفتاح) يبقى في `%TEMP%` أو ملفات المختبر أعلاه — **لا في `outputs/` ولا في التزام**.

### 0.3) البيئة (مسارات مثبتة)

- Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Electron (سيرفر/وكيل): `packages\<pkg>\node_modules\electron\dist\electron.exe`
- adb: `D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe`
  > **تحذير متكرر:** كتابة المسار خطأً (`projects-offline-build-tools`) تسبب أخطاء وهمية. انسخه كما هو.
- JDK/SDK: `D:\autoclaw projects\offline-build-tools\android-toolchain\{jdk,sdk}` · gradle: `...\gradle\bin\gradle.bat` · apksigner: `...\sdk\build-tools\34.0.0\apksigner.bat`
- VMware: `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe`
- VMs: `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` · `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx`
- LDPlayer: `D:\LDPlayer\LDPlayer9\ldconsole.exe` (المحاكي)

### 0.4) إعدادات الأجهزة كما هي الآن

| الجهاز | المعرّف | النسخة | الوضع | ملاحظات |
|---|---|---|---|---|
| المضيف | — | 3.14.3 | — | السيرفر يعمل على 3001 |
| WIN10-VM | guest `admin` | 3.14.3 | password | مُثبَّت عبر NSIS في جلسة المستخدم |
| WIN11-VM | guest `admin` | 3.14.3 | password | نفسه |
| Android-Emulator | `emulator-5554` · `127.0.0.1:5555` | 3.14.3-android | — | **اسمان لنفس الجهاز** (LDPlayer). المرجع القانوني للسطح |
| TECNO-KL4 | USB `12927374CM001019` · شبكة `192.168.1.101:33273` | 3.14.3-android | password | إقران لاسلكي: `adb pair 192.168.1.101:<pairPort> <code>` ثم `adb connect …:33273`. **المنافذ تتغيّر** |
| TAB16-USB | `GPSZ2025040701858` | 3.14.3-android | password | Android 8.1 · شاشة 800×1280 |

- **MediaProjection:** ممنوح على TECNO وTAB16 (نقرة مالك). **يسقط بإعادة تثبيت APK** ويحتاج نقرة جديدة.
- **أوضاع التحكّم:** كل أجهزة أندرويد على `ctrlAuthMode=password`. وضع `consent` مُختبَر على TAB16.
- **نسخ المختبر:** `releases/archive/lab/` (vc63–vc67) — **لا تُنشر** ولا تدخل البيان.

### 0.5) ما تغيّر منذ r7 — الجوهر

1. **قرارات المالك §4.1 و§4.3 نُفِّذت** (كانت في r7 كخطوات):
   - `scripts/build-probe-exe.cjs` جديد ⇒ `releases/tools/patch-probe.exe` (Node SEA · 89.2MB) يعمل على ويندوز بلا Node.
   - `probe-agent-live.cjs`: `--root` · `--out` · `--self-test` · خروج نظيف بعد `--audit`.
   - `android-audit.cjs --baseline`: يثبّت السطح المرجعي (عربي · تبويب الحالة · إعدادات مطوية) ويشترط **19 عنصرًا + العربية** وإلا `exit 3`.
2. **الإصدار 3.14.3:** خمس حِزم مبنية · البيان أُعيد توقيعه · الأسطول كله مُحدَّث · `versionCode 68`.
3. **توحيد آلية التحكّم في وكيل أندرويد** مع ويندوز: وضع صريح `consent|password` (`Prefs.getAuthMode/setAuthMode`) · `grantedSessions` (جلسة مقبولة لا تُسأل مرتين) · صفّ اختيار في الواجهة (`btn_auth_consent` / `btn_auth_password`).
4. **ثلاثة عيوب حقيقية أُصلحت** في وكيل أندرويد:
   - `dlg_who` يستخدم `%3$d` والكود يمرّر `String` ⇒ **كل حوار موافقة كان يفشل** (`IllegalFormatConversionException`).
   - إطلاق سطحين معًا (نشاط + حوار) ⇒ التركيز يرتد ويختفي السطح خلال ~200ms.
   - `dismissSessionOffer("")` يُنشر للطابور فيُغلق الحوار **بعد** إنشائه.
5. **إصلاح السيرفر:** `screen:request_control` كان **يُسقط `password`** ⇒ وضع «كلمة سر» غير قابل للاستخدام من اللوحة. الآن يُمرَّر (`screenHandler.ts`).
6. **فحص شامل (قراءة فقط)** أنتج 13 عيبًا مؤكَّدًا + خطة إصلاح: `docs/خطة-إصلاح-AiRemote-3.14.4-AR.md`.

### 0.6) نقطة التوقّف بالضبط

- **آخر عمل منفَّذ:** تثبيت 3.14.3 على كل الأجهزة + توثيق دليل المسار السيرفر→وكيل (`7615e8b`).
- **لا عمل قيد التنفيذ** — لا بناء جارٍ، لا تثبيت معلّق، لا جلسة مفتوحة.
- **المهمة التالية المتفق عليها:** تنفيذ **P0** من خطة الإصلاح — **بانتظار كلمة المالك**.

---

## 1) ما أُغلق (لا يُعاد فتحه)

| البند | الرقم / الدليل |
|---|---|
| §4.1 مسبار الضيوف | `candidates=50 · clicked=50 · exceptions=0` على المضيف وWIN10 وWIN11 (`w24-probe-exe/`) |
| §4.3 السطح المرجعي | `clickable=19 · tapped=18 · skipped=1 · leftApp=0 · crashes=0 · arabic=true` (`w23-android-baseline/`) |
| §4.2 لغة سجل الوكيل | بلا تغيير — «عربي بقرار مالك 2026-11-07» |
| وضع كلمة السر (وكيل→وكيل) | TAB16 + TECNO: `active` / `bad_password` / `password_required` (`w29-auth-modes/`) |
| وضع الموافقة (وكيل→وكيل) | حوار يظهر ← «سماح» ← `active` |
| المسار السيرفر→وكيل | `screen:control_granted` بكلمة صحيحة · `control_denied bad_password` بخاطئة · 16 إطارًا (`w32-server-agent-auth/`) |
| توقيع APK المثبَّت | مطابق بايتًا لحزمة الإصدار (`1063F159…` سابقًا · vc68 الآن) |
| ترقية TECNO وTAB16 | 3.12.2 → 3.14.3 بلا فقدان بيانات |

---

## 2) الفخاخ المثبتة (محدَّثة — كل واحدة كلّفت وقتًا)

1. **السيرفر المثبَّت يخدم `app.asar`**، لا `packages/server-desktop/static`. أي تعديل لا يظهر قبل إعادة بناء الحزمة وتثبيتها.
2. **قفل النسخة الواحدة في الوكيل**: أي `AiRemote Agent` متبقٍّ يجعل المسبار ينتظر CDP بلا نهاية — اقتله قبل كل تشغيل.
3. **`labelAt` يفضّل `aria-label`/`title`** على `textContent` الأبيض، وإلا بدت الأزرار الأيقونية بلا اسم.
4. **`requestFullscreen` بلا إيماءة يرفض** — التقط الوعد.
5. **`versionCode` لا يتبع `VERSION`** — يزيد يدويًا (68 الآن).
6. **`apksigner` يحتاج `JAVA_HOME` في كل صدفة**.
7. **مثبِّت NSIS يمسح مجلد التثبيت لحظيًا** ثم يعيده — لا تحكم بالفشل من `Start-Process` فوري.
8. **`shot-surface` هو المقياس القانوني** (1700×980 @2×)، و`shot-dashboard` (1416×845) للحالات فقط.

### جديدة — تعلّمتها هذه الجلسة (مهمة جدًا)

9. **تثبيت وكيل في ضيف لا يُقاس بالحجم ولا بترميز الخروج.** العَرَض: `install /S` يعيد `exit 0` ولا يبدو أن `app.asar` تغيّر.
   - **الحقيقة:** التثبيت ينجح، والعملية القديمة تبقى تعمل وتُعلن نسختها القديمة.
   - **القاعدة:** اقرأ `HKCU\…\Uninstall\AiRemote Agent\DisplayVersion` **وتاريخ** `app.asar`، ثم **اقتل العملية وشغّلها**، ثم تحقّق من `info.agentVersion` في `/api/devices`. (الحجم قد يبقى متطابقًا!)
10. **`appops PROJECT_MEDIA` مضلّل.** يبقى `ignore`/`default` حتى مع التقاط ناجح. الدليل الصحيح: `dumpsys media_projection` (سطر `TYPE_SCREEN_CAPTURE`) + تدفّق الإطارات.
11. **MediaProjection يسقط بإعادة تثبيت APK** — يحتاج نقرة مالك جديدة، ولا يُمنح بـ adb.
12. **مسار العارض ليس `/ws`.** العارض الحقيقي: `wss://…/screen?ticket=…&deviceId=…&binary=1&fps=…`، ورسالة التحكّم `screen:request_control` تُحمل `{requestId, password}`.
13. **`android-audit` `leftApp`**: `mCurrentFocus=null` لحظة إعادة الرسم ليست خروجًا عن التطبيق — صار يتجاهلها بعد إعادة قراءة.
14. **بوابة المرجع كانت تقبل سطحًا إنجليزيًّا** لأنها تعدّ العناصر فقط (19 = 19). صارت تشترط العربية أيضًا.
15. **محاكي LDPlayer**: `emulator-5554` و`127.0.0.1:5555` **نفس الجهاز**؛ إذا سقط سقط الاثنان. الإحياء: `ldconsole quit --index 0` ثم `launch --index 0`، ثم `adb connect 127.0.0.1:5555`.
16. **`release-manifest.js` بلا وسيط يعيد التوليد والتوقيع** (لا ـ`--help`) — وقد رفع الرقم تلقائيًّا في هذه الجلسة. لا تُشغّله إلا وأنت تعرف ذلك.
17. **تعارض أسماء رسائل fs/pty**: الوكيل يرسل `agent:fs_response`/`agent:pty_output`، والعقد والسيرفر `agent:fs_result`/`agent:pty_data` ⇒ **مدير الملفات والطرفية معطّلان**. (بند P0-1.)

---

## 3) الأدوات (محدَّثة)

| الأداة | الدور |
|---|---|
| `scripts/verify.js` | البطارية — **52 خطوة** |
| `scripts/check-version-consistency.cjs` | كل المصادر = 3.14.3 (يقرأ `/health` أيضًا) |
| `scripts/check-inline-styles.cjs` | خطوة 51 — أي `style={{}}` حرفي يفشل |
| `scripts/check-agent-a11y.cjs` | خطوة 52 — أي زر بلا نص/اسم يفشل |
| `scripts/build-probe-exe.cjs` | **جديد** — يبني `patch-probe.exe` (Node SEA + postject من `%TEMP%\sea-tools`) |
| `releases/tools/patch-probe.exe` | مسبار مستقل: `--root --out --exe --audit` · `--self-test` |
| `scripts/probe-agent-live.cjs` | `--audit` · `--self-test` · `--root` · `--out` · `--pure` |
| `scripts/android-audit.cjs` | `--baseline` (بوابة 19 + عربية) · بدونها smoke |
| `scripts/probe-view.cjs` | `/view` حيّ: canvas · عدّاد WS · بصمة إطار · استثناءات |
| `scripts/release-manifest.js` | توليد/توقيع البيان (بلا وسيط) · `--verify` للتحقّق |
| `tools/install-agent.bat` | ترقية صامتة في الضيف (taskkill + `/S` + start) |
| `tools/lab/session/check-artifacts.cjs` | `asar` + نسخ |

---

## 4) خطة الإصلاح — الملف الكامل: `docs/خطة-إصلاح-AiRemote-3.14.4-AR.md`

**ملخّصها هنا للسياق فقط — لا تنفّذها بلا إذن.**

| الموجة | البنود | الزمن |
|---|---|---|
| **P0** | `P0-1` توحيد أسماء fs/pty (+جسر توافق) · `P0-2` `requireRole('manager')` على `/api/sftp` + حصر `host` · `P0-3` دور على `/api/credentials` · `P0-4` حارس `/files/:deviceId` · `P0-5` وجهة «سجل الجلسات» | ½ يوم |
| **P1** | تفعيل `requireRole` تدريجيًّا (log-only أولًا) · إزالة 3 واجهات تُضلّل · إعلان 48 نوعًا في العقد · 4 بوابات جديدة | 1 يوم |
| **P2** | قرارات المالك على 56 عنصر سيرفر + 47 قدرة وكيل + 3 مكوّنات مهدورة | حسب القرار |

**الجذر، لا العَرَض:** العقد المشترك (`shared/types/messages.ts`) يُعلن 72 نوعًا؛ 5 ميتة و**48 مستخدمة غير معلنة**. عيب fs/pty عرضٌ لهذا.

---

## 5) أوامر جاهزة (لا تُشغَّل بلا إذن)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'

# تحقّق
node scripts/verify.js
node scripts/check-version-consistency.cjs
node scripts/release-manifest.js --verify

# لوحة + سيرفر (بعد أي تعديل واجهة)
cd packages\dashboard; .\node_modules\.bin\tsc.cmd; .\node_modules\.bin\vite.cmd build
cd ..\server-desktop; node scripts\copy-dashboard.js; node scripts\bundle.js
.\node_modules\.bin\electron-builder.cmd --win --x64

# وكيل ويندوز
cd ..\agent-desktop; .\node_modules\.bin\electron-builder.cmd --win --x64

# APK (JAVA_HOME في كل صدفة)
$env:JAVA_HOME='D:\autoclaw projects\offline-build-tools\android-toolchain\jdk'
cd packages\android-agent
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\gradle\bin\gradle.bat' --offline --no-daemon assembleDebug
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\build-tools\34.0.0\apksigner.bat' sign `
  --ks ..\..\secrets\airemote-release.jks --ks-key-alias airemote `
  --ks-pass file:..\..\secrets\keystore-password.txt `
  --out ..\..\releases\AiRemote-Agent-3.14.4.apk app\build\outputs\apk\debug\app-debug.apk

# البيان بعد البناء
node scripts\release-manifest.js; node scripts\release-manifest.js --verify

# تثبيت السيرفر (أوقف بالمسار لا بالاسم)
Get-Process 'AiRemote Server' | Where-Object { $_.Path -like '*Programs\AiRemote Server*' } | Stop-Process -Force
& 'releases\server-windows\AiRemote-Server-Setup-v3.14.4-x64.exe' /S
Start-Process 'C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe'
curl.exe -k -s https://127.0.0.1:3001/health

# تثبيت في ضيف (الصيغة الصحيحة: الخيار بعد مسار الجهاز)
vmrun -T ws -gu <u> -gp <p> runProgramInGuest <vm.vmx> -interactive `
  'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' '-NoProfile' '-EncodedCommand' <base64>

# مسبار الضيوف
releases\tools\patch-probe.exe --root "<repo>" --out "<dir>" --exe "<agent.exe>" --audit
```

---

## 6) بروتوكول التنفيذ

1. **قِس أولًا** — ولا تثق بأرقام هذا الملف بلا تحقّق.
2. **تعديل واحد = التزام واحد** برسالة إنجليزية تحمل الرقمين (قبل/بعد).
3. إن ساء الرقم: `git checkout` فورًا.
4. الدليل في `outputs/verify-YYYY-MM-DD/`.
5. `design/*.html` للقراءة فقط · Git محلي · **لا أسرار في المخرجات**.
6. **لا تلمس عقد API** ولا تصميم سطح بلا قرار مالك.
7. **أي تغيير في محتوى الحزمة يرفع الرقم** — 3.14.3 ← 3.14.4.
8. **⛔ لا تنفّذ شيئًا بلا إذن المالك (انظر §0).**

---

## 7) خريطة ملفات الجلسة

| الملف | الدور |
|---|---|
| `docs/SESSION-2026-11-07-W23-W24-AR.md` | تقرير الجلسة (قرارات §4.1/§4.3 + Android + الإصدار) |
| `docs/خطة-إصلاح-AiRemote-3.14.4-AR.md` | **خطة الإصلاح الكاملة** (P0/P1/P2 + بوابات + اختبارات) |
| `outputs/verify-2026-11-07/w23-android-baseline/` | السطح المرجعي + بوابة العربية |
| `w24-probe-exe/{host,win10,win11}/` | تدقيق 50/50 ×3 |
| `w25-tecno/` · `w26-tab16/` | ترقية الجهازين |
| `w27-view-tab16/` · `w28-view-tecno/` | بثّ حيّ + دليل MediaProjection |
| `w29-auth-modes/` | وضعا التحكّم + إصلاح الحوار |
| `w30-server-to-agent/` · `w32-server-agent-auth/` | المسار السيرفر→وكيل |
| `w31-fleet-3143/` | الأسطول على 3.14.3 + درس التثبيت |
| `audit/server-surface.md` · `ui-surface.md` · `gap-analysis.md` · `agent-capabilities.md` | مسح الكود (قراءة فقط) |
| `PROJECT_STATE.md` §0.0 (مدخل 2026-11-07 تكملة) | الحالة الرسمية |

---

## 8) ديون معروفة (لا تُخفى)

| الدين | الأثر |
|---|---|
| `CHANGELOG.md` لا يحمل قسم 3.14.3 | سجل الإصدارات ناقص مدخلًا |
| `PROJECT_STATE.md` لا يذكر إصدار 3.14.3 ولا نتيجة المسح | الحالة الرسمية متأخرة عن الواقع |
| عيب fs/pty قائم في 3.14.3 المشحون | مدير الملفات والطرفية معطّلان |
| `/api/sftp` بلا دور | ثغرة صلاحيات |
| إعادة بناء حزمتَي السيرفر تحت 3.14.2 سابقًا | أُزيلت بإصدار 3.14.3 (البيان الآن مطابق) |
| `tools/patch-probe.exe` (89MB) دخل البيان | قرار: يُبقى أو يُستثنى |

---

**نهاية r8.** ابدأ بالقراءة والتحقّق (§0.1) فقط، ثم انتظر كلمة المالك.
