# استئناف AiRemote — 2026-11-13/14 · الإصدار **3.16.19** — نسخة **r19**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-13-3.16.18-FULL-AR-r18.md` وكل ما قبله.**
> كل رقم هنا **مقيس في 2026-11-13 ~23:45 بتوقيت الجهاز** على الجهاز نفسه.
> **جديد في r19:** إغلاق الفخاخ **78 · 79 · 80** بكود وقياس · إصدار **3.16.19 (109)** مبني وموقَّع · تثبيت على **6/6** · البيان **75** · **PASS** · فخاخ جديدة **82–85**.

### خلاصة في عشرة أسطر

1. السيرفر **3.16.19** يعمل على 3001 (TLS) — `/health` يؤكد.
2. كل الأجهزة الستة **3.16.19** · **6/6 online**.
3. البيان **3.16.19 · 75 عنصرًا · موقَّع**، و`check-version-consistency` **PASS**.
4. **فخّ 80 مغلق:** AISHOT على TAB16 صار **1280×800** بعد أن كان 1280×1280.
5. **فخّ 79 مغلق:** الالتقاط يُطلب **مرة في كل عملية** بعد أي `force-stop`.
6. **فخّ 78 مغلق:** المعالج يشترط a11y **مربوطة** لا «مسجَّلة» فقط.
7. `lab-probe` ما زال الحساب العامل؛ حدّ الدخول **5/دقيقة** يضرب دفعات النقل.
8. `verify.js` **لم يُعَد** هذه الجولة (آخر خط أساس 56/57).
9. **المطلوب منك الآن: التحقق ثم التوقف.** لا بناء، لا تثبيت، لا تعديل.
10. بنود معلّقة بانتظار المالك: بقايا WIN11 · إعادة `verify.js` · أي بند جديد.

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا ويُحترم حرفيًا

**قِف هنا. لا تنفّذ أي إجراء — لا بناء، لا تثبيت، لا تعديل ملف، لا `git commit`، لا تشغيل سكربت يكتب — حتى يقول المالك صراحةً «ابدأ» أو «نفّذ البند كذا» أو «اكمل البند كذا».**

- ترخيصك الحالي: **قراءة وتحقّق فقط** (قراءة ملفات، `git log`/`git status`، `curl /health`، بوابات القراءة، `adb shell dumpsys` للقراءة، `remote-exec`/`vm-exec` **بأمر المالك فقط**).
- الممنوع الآن: أي كتابة داخل `D:\autoclaw projects-new\AiRemote` أو `D:\autoclaw projects\offline-build-tools`، وأي `adb install`/`am force-stop`/`settings put`، وأي `pnpm build`/`electron-builder`/`gradle`، وأي تعديل على `handoff` إلا بنسخ تقرير بأمر.
- كل ما في هذا الملف **منجَز ومُثبَّت** إلا ما هو موسوم صراحةً **«معلّق»** في §4.
- إن وجدت رقمًا مختلفًا: **لا تُصلح شيئًا**. أبلِغ المالك بالفرق وانتظر.

**كلمات فكّ التوقّف الوحيدة (من المالك فقط):** «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ» · «ثبّت».

**قبل أي شيء آخر:** اقرأ التقارير الخمسة بالترتيب، ثم هذا الملف، ثم قِس (§0.1.1) و**قف**:

1. `…-handoff\reports\تقرير-جولة-3.16.18.md` (r17 — البناء والإصلاحات)
2. `…-handoff\reports\تقرير-تثبيت-3.16.18.md` (r18 — التثبيت والبيان والمحاكي)
3. `…-handoff\reports\تقرير-ترقية-WIN10-WIN11-3.16.18.md` (r18 — ترقية الـVMs)
4. `…-handoff\reports\تقرير-TAB16-3.16.18.md` (r18 — TAB16)
5. `…-handoff\reports\تقرير-جولة-3.16.19.md` (**r19 — الإصلاحات والإصدار**)

---

## 0.1) الحالة المقيسة الآن (2026-11-13 ~23:45)

| البند | القيمة | كيف تُتحقَّق |
|---|---|---|
| الفرع | `feat/screen-unify-3.13.0` | `git branch --show-current` |
| آخر التزام | **`8864292`** (sign the 3.16.19 manifest) | `git log --oneline -5` |
| `VERSION` | **3.16.19** | `Get-Content VERSION` |
| `versionCode` أندرويد | **109** | `packages/android-agent/app/build.gradle` |
| **السيرفر المثبَّت** | **3.16.19** على **3001** (TLS) | `curl.exe -k -s https://127.0.0.1:3001/health` |
| **البيان** | **3.16.19 · 75 عنصرًا · موقَّع** | `node scripts/release-manifest.js --verify` |
| **توافق الإصدار** | **PASS** | `node scripts/check-version-consistency.cjs` |
| حزمة السيرفر | Setup **159,432,663 B** · zip **212,176,753 B** | `releases/server-windows/` |
| حزمة وكيل ويندوز | Setup **76,402,728 B** · zip **104,017,306 B** | `releases/agent-windows/` |
| **APK أندرويد** | **239,520 B** · v2+v3 · `109` · SHA256 `A4B6AC1372B58122BBB38BD0EB86D9B916E9C1CD029FF7E65E57CA187C32404A` | `releases/android-agent/` |
| **الأسطول** | **6 أجهزة · 6 online** — كلها **3.16.19** | `/api/devices` أو القاعدة |
| أجهزة adb | `12927374CM001019` (TECNO) · `GPSZ2025040701858` (TAB16) · `emulator-5554` + `127.0.0.1:5555` (نفس المحاكي — فخّ #64) | `adb devices -l` |
| شجرة git | نظيفة في الجوهر؛ غير المتتبَّع: `artifacts/*` + `docs/PROMPT-*` + `docs/تقرير-*` | `git status --short` |
| `verify.js` | **لم يُعَد** — آخر خط أساس **56/57** | — |

**الأجهزة المسجّلة (من القاعدة):**

| # | الاسم | الحالة | النسخة | IP |
|---|---|---|---|---|
| 1 | Android-Emulator | **online** | **3.16.19-android** | 192.168.1.12 |
| 2 | TECNO-KL4 | **online** | **3.16.19-android (109)** | 192.168.1.101 |
| 3 | DESKTOP-K81PJ9H | **online** | **3.16.19** | 192.168.1.25 |
| 4 | WIN10-VM | **online** | **3.16.19** | **192.168.1.102** |
| 5 | WIN11-VM | **online** | **3.16.19** | **192.168.1.106** |
| 6 | TAB16-USB | **online** | **3.16.19-android (109)** | 192.168.1.100 |

> TAB16-USB = اللوحي `GPSZ2025040701858` (model TAB16) — قرار المالك: **الإبقاء على التسجيل والرمز كما هما** (بلا رمز جديد ولا إعادة تسمية).

### 0.1.1) أول 10 دقائق — تحقّق ثم قف

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git branch --show-current                          # feat/screen-unify-3.13.0
git rev-parse --short HEAD                         # 8864292
git log --oneline -5
git status --short
Get-Content VERSION                                # 3.16.19
curl.exe -k -s https://127.0.0.1:3001/health       # 3.16.19
node scripts/release-manifest.js --verify          # signature OK · all artifacts match (75)
node scripts/check-version-consistency.cjs         # PASS
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe' devices -l
node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db',{readOnly:true});for(const d of db.prepare('SELECT name,status,info FROM devices ORDER BY name').all()){const i=JSON.parse(d.info||'{}');console.log(d.name,d.status,i.agentVersion||'?',i.ipLocal||'')}"
```

**المتوقَّع:** HEAD `8864292` · `/health` 3.16.19 · بيان 75 موقَّع · **PASS** · **6/6 online** كلها 3.16.19.

**بعدها توقّف.**

---

## 0.1.2) ما ينتقل مع تغيير الحساب وما لا ينتقل

**ينتقل (على القرص — لا علاقة له بالحساب):**
- المستودع `D:\autoclaw projects-new\AiRemote` (بكل الالتزامات حتى `8864292`).
- `D:\autoclaw projects-new\AiRemote-handoff`: التقارير · الأدوات (`tools-2026-11-13-31618-install` و`tools-2026-11-14-31619`) · اللقطات · نسخ PROMPT.
- القاعدة `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` (قراءة فقط) · مفاتيح التوقيع `…\AiRemote\signing\` · شهادة TLS · اعتماد `lab-probe.json`.
- الحزم المبنية في `releases\`.

**لا ينتقل (مرتبط بحساب AutoClaw الحالي):**
- **ذاكرة مساحة العمل** (وفيها قرار المالك بشأن TAB16) — لكنه مكتوب نصًّا في §0.1 أعلاه، فلا تعتمد على الذاكرة.
- سجل المحادثات والمرفقات و«الوكلاء المحفوظون» في الحساب القديم.
- سجلات `.zwork\background\*` ومساحة العمل نفسها (`…\accounts\<hash>\projects\…`).

**لذلك في الحساب الجديد:** لا تعتمد على أي مرجع داخل مساحة عمل قديمة، ولا على ذاكرة؛ اقرأ هذا الملف والتقارير من المسارات أعلاه، ونفّذ §0.1.1 ثم قف. أول أمر متوقّع من المالك: «تحقّق ثم قف» أو اسم بند صريح.

---

## 0.2) الوصول والحسابات (لا قيم سرّية داخل المستودع)

كما r18 بلا تغيير: `admin@airemote.local` (كلمة المرور عند المالك) · **`lab-probe@local`** بياناته في `C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json` · القاعدة read-only · مفاتيح التوقيع في `…\AiRemote\signing\` · شهادة TLS في `…\AiRemote-Server\tls\server.crt`.

**قاعدة صارمة:** أي سرّ يُقرأ من البيئة/المالك/ملفات الاعتماد. **لا يُكتب في مستودع ولا وثيقة ولا التزام ولا مخرَج أداة ولا ردّ.**

**حدّ الدخول: 5/دقيقة** على `lab-probe` — كل `push-file` = دخول واحد (فخّ #84).

---

## 0.3) البيئة والأدوات

| الأداة | المسار |
|---|---|
| جذر الأدوات | `D:\autoclaw projects\offline-build-tools` (**ليس** `offline-build-tools` تحت `projects-new`) |
| JDK | `…\android-toolchain\jdk` (OpenJDK 21) |
| Android SDK | `…\android-toolchain\sdk` (platform android-35 · build-tools **34.0.0**) |
| Gradle | `…\android-toolchain\gradle\bin\gradle.bat` |
| adb | `…\sdk\platform-tools\adb.exe` |
| zipalign / apksigner | `…\sdk\build-tools\34.0.0\` |

**أدوات الجولة r19:** `D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-14-31619\`
`upgrade-31619.ps1` · `upgrade-31619.cmd` · `trigger-upgrade-high.ps1` · `trigger-upgrade-plain.ps1` · `probe-31619.ps1` · `collect-31619.ps1` · `logonly.ps1` · `deltask.ps1` · `del-31619.cmd` · `del-trigger.ps1` · `del2.cmd` · `del2-trigger.ps1` · **`fetch-log.cjs`** (قراءة ملف من جهاز عبر `GET /api/devices/:id/fs/download`).

**أدوات r18 (ما زالت لازمة):** `tools-2026-11-13-31618-install\` → `vm-exec.cjs` (**base64 إلزامي**) · `push-file.cjs` (R5).

```powershell
cd 'D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-31618-install'
node vm-exec.cjs WIN10-VM '<local-ps1>' 90000     # يقرأ الملف المحلي ويحوّله EncodedCommand
node push-file.cjs WIN11-VM '<local>' 'C:/Users/Public/<name>'
node '..\tools-2026-11-14-31619\fetch-log.cjs' WIN11-VM 'C:/Users/Public/x.log'
```

---

## 0.4) الأجهزة (مقيسة)

| الجهاز | الحالة | النسخة | ملاحظة |
|---|---|---|---|
| **TECNO-KL4** | online | 3.16.19 (109) | `serial 12927374CM001019` · 720×1600 · AISHOT 342/95ثم · a11y 33 (خدمة AiRemote وحدها) |
| **Android-Emulator** | online | 3.16.19 (109) | Android 9 · 1600×900 · AISHOT 415/131ثم · a11y 33 (+ FileBridge guard) |
| **DESKTOP-K81PJ9H** | online | 3.16.19 | مهمة مرتفعة · `AGENT_CA_CERT` لازم عند الإطلاق اليدوي (فخّ 76) |
| **WIN10-VM** | online | 3.16.19 | `DESKTOP-IFE3GNE` · **192.168.1.102** · مهمة مرتفعة · `elevated=True` |
| **WIN11-VM** | online | 3.16.19 | `DESKTOP-P7Q6D6U` · **192.168.1.106** · Run key `--autostart` · `elevated=False` |
| **TAB16-USB** | online | 3.16.19 (109) | `GPSZ2025040701858` · model TAB16 · 800×1280 (أفقي 1280×800) · **AISHOT 1280×800** · a11y 33 (+ FileBridge) |

---

## 0.5) إعدادات التطبيق المحفوظة (هي «الحالة» التي يجب ألّا تُفقد)

كما r18: `zai`/`glm-4.7-flash` · Telegram مفعّل · مهام مجدولة 0 · قواعد تنبيه 0 · 2FA معطّل · 3 مستخدمين · 6 أجهزة · المظهر نهاري على TECNO · الشريط العلوي بشكله · الشريط السفلي مخفي · البطاقات قابلة للطيّ · وضع التحكم «موافقة يدوية».

---

## 0.6) ما أُنجز في r19 — بندًا بندًا

| # | البند | النتيجة |
|---|---|---|
| 1 | **فخّ 80** — لقطة مربّعة | `AgentService`: تطبيع long/short بدل `Math.max` المتقاطع + `Display.getRealMetrics()` في `ensureCaptureSession` · **AISHOT 1280×800** |
| 2 | **فخّ 79** — الالتقاط يموت بعد الإيقاف | `MainActivity`: `askedCaptureThisProcess` → طلب واحد مضمون لكل عملية |
| 3 | **فخّ 78** — a11y «مفعّلة» لا «مربوطة» | `SetupActivity`: `a11yEnabled() && AiRemoteA11y.I != null` |
| 4 | رفع الإصدار | 3.16.19 في المصادر السبعة + `versionCode 109` + `activity_main.xml` |
| 5 | البناء | dashboard (vite 1m54s) · server bundle+static+electron-builder · agent (gdi+electron-builder) · APK (gradle) · zipalign+apksigner |
| 6 | البيان | 75 عنصرًا · `signature OK` · `all artifacts match` |
| 7 | التوافق | **PASS** |
| 8 | التثبيت | السيرفر + وكيل الـPC + WIN10 + WIN11 + 3 أجهزة أندرويد |
| 9 | التحقق | 6/6 online · AISHOT ×2 على كل أندرويد · a11y 33 على الثلاثة |

**الالتزامات:** `bc17d36` (إصلاح Android) · `f0399fe` (3.16.19) · `7a1531d` (static/bundles) · `8864292` (توقيع البيان).

**سجلات الترقية على الـVMs:** `C:\Users\Public\airemote-upgrade-31619.log`
WIN10: `before=3.16.18 · installerExit=0 · after=3.16.19 · relaunch=task · caEnv=True`
WIN11: `before=3.16.18 · installerExit=0 · after=3.16.19 · relaunch=runkey · caEnv=True`

---

## 0.7) إعدادات الاختبار

| البند | القيمة |
|---|---|
| تنفيذ حي (أندرويد) | `handoff\scripts\remote-exec.cjs` → `AISHOT:` · `AICTL:<base64 JSON>` |
| تنفيذ حي (ويندوز) | `vm-exec.cjs` (**base64 إلزامي**؛ مهلة الوكيل ~30ث — فخّ 83) |
| نقل ملفات | `push-file.cjs` (R5) — لا SMB/UNC |
| قراءة ملف من جهاز | `tools-2026-11-14-31619\fetch-log.cjs <device> <path>` |
| لقطات | `adb shell screencap` + `adb pull` (لا `>` في PS 5.1 — فخّ 58) |
| بوابة الإصدار | `check-version-consistency.cjs` = **PASS** · `release-manifest.js --verify` = OK |
| بوابة الاختبار الكاملة | `node scripts/verify.js` → **لم يُعَد هذه الجولة** (56/57 خط الأساس) |

---

## 0.8) الفخاخ في r19 (78 مُغلق · 79 مُغلق · 80 مُغلق · 82–85 جديدة)

| # | الحالة | الخلاصة |
|---|---|---|
| 78 | **مُغلق بكود** | `force-stop`/تحديث الحزمة يُسقط a11y (crashed → removed). المعالج الآن يشترط **مربوطة**. عند كل إصدار: **أعد التمكين بعد آخر تثبيت**. |
| 79 | **مُغلق بكود** | إذن MediaProjection يُفقد مع العملية؛ الطلب التلقائي مقيَّد 6 ساعات. الآن: طلب واحد مضمون لكل عملية + `--ez requestCapture true` للتشغيل اليدوي. |
| 80 | **مُغلق بكود** | `Math.max(mw, mode.w)` يخلط أبعادًا مدوَّرة بأخرى أصلية → مربّع 1280×1280. الآن تطبيع long/short + `getRealMetrics()`. |
| 81 | مفتوح (خارج نطاقنا) | خدمة FileBridge الحارسة تُسجّل نفسها عند تفعيل a11y وترفع واجهتها — لا نلمسها. |
| 82 | قاعدة | تحديث الحزمة = إسقاط a11y على كل أندرويد. ترتيب: تثبيت ← إعدادات ← a11y ← التقاط ← إعادة تشغيل. |
| 83 | قاعدة | `vm-exec` على WIN11 يقطع عند ~30ث (`main.js:2083`) حتى لأمر قصير. **الحل:** مهمة مجدولة + قراءة الناتج من ملف. |
| 84 | قاعدة | حدّ الدخول 5/دقيقة يضرب دفعات `push-file` (كل ملف = دخول). ادفع بفاصل ≥12ث. |
| 85 | قاعدة | `getResources().getDisplayMetrics()` في خدمة يبقى عموديًا بعد الدوران — استخدم `Display.getRealMetrics()`. |

**قديمة ما زالت تصدق:** 51–77 كما في r17/r18 (منها 71 الاقتباسات · 72/73 الرفع · 74 مهلة 30ث · 75 Run key · 76 `AGENT_CA_CERT` · 77 DHCP).

---

## 1) ما أُغلق ولا يُعاد فتحه

| البند | الدليل |
|---|---|
| كل مغلق في r16–r18 | `handoff\reports\` |
| **3.16.19 مبني وموقَّع ومثبَّت على 6/6** | `/health` · البيان 75 · PASS · القاعدة |
| **فخّ 80** | AISHOT 1280×800 على TAB16 (`tab16-31619-1.jpg`) |
| **فخّ 79** | ظهور حوار الالتقاط تلقائيًا بعد الإقلاع على TECNO |
| **فخّ 78** | المعالج يميّز «مربوطة» من «مسجَّلة» |
| **TAB16 على 3.16.19** | a11y 33 · AISHOT ×2 · 8/8 |

---

## 2) الفخاخ المثبتة — **85**

1–77 كما في r17/r18. جديدة: **78–81** (r18، و78–80 أُغلقت بكود في r19) و**82–85** (r19).

---

## 3) الأدوات

### 3.1) في المستودع
`verify.js` · `check-version-consistency.cjs` · `release-manifest.js` · `copy-dashboard` · `scripts/run-electron-builder.cjs` (**يفشل مع مسافة في المسار — استخدم `npx electron-builder`**).

### 3.2) مجلدات الجولات (خارج مساحة الحساب)

```
D:\autoclaw projects-new\AiRemote-handoff\scripts\                        # remote-exec.cjs + 41 سكربتًا
D:\autoclaw projects-new\AiRemote-handoff\reports\                        # التقارير (ومنها تقرير r19)
D:\autoclaw projects-new\AiRemote-handoff\docs\                           # نسخ ملفات PROMPT
D:\autoclaw projects-new\AiRemote-handoff\shots-2026-11-13-31618\         # لقطات r17
D:\autoclaw projects-new\AiRemote-handoff\shots-2026-11-13-31618-install\ # لقطات r18 (المحاكي)
D:\autoclaw projects-new\AiRemote-handoff\shots-2026-11-13-tab16\         # لقطات TAB16 (r18)
D:\autoclaw projects-new\AiRemote-handoff\shots-2026-11-14-31619\         # لقطات/أدلة r19
D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-31618-install\ # vm-exec · push-file · trigger 3.16.18
D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-14-31619\         # أدوات r19 (§0.3)
```

### 3.3) بناء أندرويد (متسلسلة مجرَّبة)
```powershell
$b='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME="$b\jdk"; $env:ANDROID_HOME="$b\sdk"; $env:ANDROID_SDK_ROOT="$b\sdk"
cd 'D:\autoclaw projects-new\AiRemote\packages\android-agent'
& "$b\gradle\bin\gradle.bat" assembleRelease --console=plain
# zipalign -f 4 → apksigner sign --ks …\airemote-release.jks --ks-key-alias airemote → apksigner verify -v
```
**كلمة المرور:** من `…\AiRemote\signing\keystore-password.txt` (سطر واحد) — لا تُطبع.

### 3.4) بناء ويندوز
```powershell
pnpm --filter @airemote/shared build; pnpm --filter @airemote/ai-engine build; pnpm --filter @airemote/dashboard build
cd packages\server-desktop; node scripts/bundle.js; node scripts/copy-dashboard.js; npx electron-builder --win --x64
cd packages\agent-desktop; node ../../scripts/build-gdi-worker.cjs; npx electron-builder --win --x64
```

---

## 4) ما بقي — **معلّق بانتظار المالك**

### 4.1) مغلق
كل r16–r18 + **فخاخ 78/79/80** + **إصدار 3.16.19 وتثبيته على 6/6**.

### 4.2) معلّق

1. **بقايا WIN11:** مهمة لمرة واحدة `DelTask31619b` (وقتها مضى) + ملفات `C:\Users\Public\*31619*` على الجهازين (76 MB لكل جهاز). **بأمر المالك فقط.**
2. **`verify.js`** — لم يُعَد منذ 3.16.17 (56/57). إعادته تحتاج أمرًا.
3. **GPSZ كجهاز منفصل** — قرار المالك: لا تسجيل جديد (TAB16-USB هو نفسه).
4. **FileBridge** — فخّ 81: لا نلمسه.

### 4.3) تحسينات اختيارية (ليست عيوبًا)
حفظ نتائج تنفيذ الكتل في `ai_conversations` · شارة عدد المشاهدين · RecyclerView · powershell→sh على أندرويد.

### 4.4) ديون بنيوية باقية (لا تُفتح بلا قرار)
`packages/server` (TS) لا يُشحن · `static/` نسخة مبنية داخل git (مقصود) · `aiConfigs`/`ai_config` مكرّران · صفحة `/dev/ui` تطوير فقط · جهاز DESKTOP-K81PJ9H مالكه `lab-probe@local` · **`run-electron-builder.cjs` لا يتعامل مع المسارات ذات المسافة**.

---

## 5) أوامر جاهزة (لا تُشغَّل بلا إذن)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'

# تحقّق فقط (مسموح الآن)
curl.exe -k -s https://127.0.0.1:3001/health          # 3.16.19
node scripts/release-manifest.js --verify              # OK · 75
node scripts/check-version-consistency.cjs             # PASS

# تثبيت APK (بأمر المالك)
$adb='D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe'
& $adb -s <serial> install -r 'releases\android-agent\AiRemote-Agent-Android-v3.16.19.apk'
& $adb -s <serial> shell am force-stop com.airemote.agent
& $adb -s <serial> shell am start -n com.airemote.agent/.MainActivity --ez requestCapture true

# ترقية جهاز ويندوز (وصفة r19)
cd 'D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-31618-install'
node push-file.cjs <device> 'D:\autoclaw projects-new\AiRemote\releases\agent-windows\AiRemote-Agent-Setup-v3.16.19-x64.exe' 'C:/Users/Public/AiRemote-Agent-Setup-v3.16.19-x64.exe'
node push-file.cjs <device> '..\tools-2026-11-14-31619\upgrade-31619.ps1' 'C:/Users/Public/upgrade-31619.ps1'
node push-file.cjs <device> '..\tools-2026-11-14-31619\upgrade-31619.cmd' 'C:/Users/Public/upgrade-31619.cmd'
node vm-exec.cjs <device> '..\tools-2026-11-14-31619\trigger-upgrade-high.ps1' 90000
```

---

## 6) بروتوكول التنفيذ

1. **قِس أولًا** (§0.1.1) — لا تثق بأرقام هذا الملف بلا تحقق.
2. **تعديل واحد = التزام واحد** بالسبب.
3. إن ساء الرقم: `git checkout` فورًا.
4. الدليل المقيس (قبل/بعد) في الرد وفي التقرير.
5. **لا أسرار** في المستودع/الالتزامات/المخرجات/الردود.
6. **لا تلمس عقد API** ولا تصميم سطح بلا قرار مالك.
7. أي تغيير في محتوى الحزمة يرفع الرقم في المصادر السبعة + `versionCode` + البيان.
8. بوابة جديدة تحتاج إثبات عضّ + خط أساس بأسباب.
9. **⛔ لا تنفّذ شيئًا بلا إذن المالك.**
10. التقارير في `handoff\reports\` فورًا.
11. أدوات الجولة → `handoff\tools-YYYY-MM-DD-<tag>\` · اللقطات → `handoff\shots-YYYY-MM-DD-<tag>\`.
12. **قبل أي نقرة على جهاز: تحقّق `mCurrentFocus`**.
13. **أوامر ويندوز عبر الوكيل: base64 فقط** — وللأوامر الطويلة استخدم مهمة مجدولة (فخّ 83).
14. **نقل الملفات: R5 فقط** — وافصل الدفعات ≥12ث (فخّ 84).
15. **قبل ترقية وكيل ويندوز:** اعرف آلية إقلاعه (مهمة مرتفعة أم Run key) وأعد التشغيل بنفس الآلية.
16. **بعد أي تثبيت أندرويد:** أعد تمكين a11y ثم الالتقاط ثم تحقّق (فخّ 82).
17. لا تطبع أي سرّ.
18. **سلّط السلامة (Zwork Safety Guard):** أوامر تدميرية مرفوضة دائمًا؛ أوامر الكتابة الخطرة قد تطلب تأكيدًا.

---

## 7) التقارير المسلَّمة

| الملف | المحتوى |
|---|---|
| كل تقارير r16 وما قبلها | `handoff\reports\` |
| `تقرير-جولة-3.16.18.md` | r17: إصلاح no frame · 3.16.18 · الفاتح · الشريط · الطيّ |
| `تقرير-تثبيت-3.16.18.md` | r18: تثبيت السيرفر والوكيل · البيان · المحاكي · verify.js |
| `تقرير-ترقية-WIN10-WIN11-3.16.18.md` | r18: ترقية الـVMs · الفخاخ 71–75 |
| `تقرير-TAB16-3.16.18.md` | r18: TAB16 · الفخاخ 78–81 |
| **`تقرير-جولة-3.16.19.md`** | **r19: إصلاح 78/79/80 · 3.16.19 · التثبيت على 6/6 · الفخاخ 82–85** |

---

## 8) نقطة التوقّف الدقيقة

- **الالتزامات:** آخرها `8864292`. لا التزام جديد بعد هذا الملف.
- **السيرفر:** 3.16.19 يعمل على 3001 · `/health` يؤكد.
- **كل الأجهزة:** 3.16.19 · **6/6 online**.
- **البيان:** 3.16.19 · 75 عنصرًا · موقَّع. **التوافق:** PASS.
- **`verify.js`:** آخر خط أساس 56/57 (لم يُعَد).
- **بقايا معروفة:** مهمة `DelTask31619b` على WIN11 + ملفات `C:\Users\Public` على الـVMs.

**نقطة الاستئناف:** اقرأ التقارير الخمسة، ثم هذا الملف، ثم قِس (§0.1.1) و**قف**. الأوامر المتوقّعة أولًا: «شغّل verify.js» · «نظّف بقايا WIN11» · «افتح بندًا جديدًا».

**نهاية r19.** قف هنا حتى يأمر المالك.
