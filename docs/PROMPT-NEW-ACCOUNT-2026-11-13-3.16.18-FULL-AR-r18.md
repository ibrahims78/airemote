# استئناف AiRemote — 2026-11-13 · الإصدار **3.16.18** — نسخة **r18**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-13-3.16.18-FULL-AR-r17.md` وكل ما قبله.**
> كل رقم هنا **مقيس في 2026-11-13 (~17:55 بتوقيت الجهاز)** على الجهاز نفسه.
> سببه: انتهاء رصيد الحساب. المستودع وقاعدة البيانات ومفاتيح التوقيع **على القرص**، فلا يتأثر شيء بتغيير الحساب.
> **جديد في r18:** تثبيت سيرفر ووكيل ويندوز **3.16.18** · البيان **3.16.18 (70 عنصرًا) موقَّع** · توافق الإصدار **PASS** · إحياء **المحاكي** (التقاط 2/2) · ترقية **WIN10-VM وWIN11-VM** إلى 3.16.18 · أدوات جديدة (`push-file.cjs` · `vm-exec.cjs`) · **٦ فخاخ جديدة (71–76) + واحد (77)** · **TAB16 لم يُوصَل بعد**.

### خلاصة في عشرة أسطر

1. السيرفر المثبَّت **3.16.18** ويعمل على 3001 (TLS) — `/health` يؤكد.
2. وكيل هذا الـPC ووكيلا الـVMs **3.16.18** — ثلاثة أجهزة ويندوز محدَّثة.
3. البيان **3.16.18 · 70 عنصرًا · موقَّع**، و`check-version-consistency` **PASS**.
4. TECNO والمحاكي **3.16.18** · المحاكي أُعيد إحياؤه والتقاطه **2/2**.
5. الأسطول **5/6 online** — الناقص **TAB16-USB** (غير موصول).
6. GPSZ2025040701858 **لم يُوصَل قط**.
7. `verify.js` = **56/57** (الفشل الوحيد المعروف: sessions export — ABI إلكترون).
8. لا تغيير في المصادر هذه الجولة؛ الالتزام الوحيد `4180923` (توقيع البيان).
9. **المطلوب منك الآن: التحقق ثم التوقف.** لا بناء، لا تثبيت، لا تعديل.
10. البند التالي بانتظار المالك: **TAB16** عند توصيله.

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا ويُحترم حرفيًا

**قِف هنا. لا تنفّذ أي إجراء — لا بناء، لا تثبيت، لا تعديل ملف، لا `git commit`، لا تشغيل سكربت يكتب — حتى يقول المالك صراحةً «ابدأ» أو «نفّذ البند كذا» أو «اكمل البند كذا».**

- ترخيصك الحالي: **قراءة وتحقّق فقط** (قراءة ملفات، `git log`/`git status`، `curl /health`، بوابات القراءة، `adb shell dumpsys` للقراءة، `remote-exec`/`vm-exec` للاختبار الحي **بأمر المالك فقط**).
- الممنوع الآن: أي كتابة داخل `D:\autoclaw projects-new\AiRemote` أو `D:\autoclaw projects\offline-build-tools`، وأي `adb install`/`am force-stop`/`settings put`، وأي `pnpm build`/`electron-builder`/`gradle`، وأي تعديل على `handoff` إلا بنسخ تقرير بأمر.
- كل ما في هذا الملف **منجَز ومُثبَّت** إلا ما هو موسوم صراحةً **«معلّق»** في §4.
- إن وجدت رقمًا مختلفًا عمّا هنا: **لا تُصلح شيئًا**. أبلِغ المالك بالفرق وانتظر.
- أي تعديل قبل الإذن = خرق، حتى لو بدا إصلاحًا واضحًا أو سطرًا واحدًا.

**كلمات فكّ التوقّف الوحيدة (من المالك فقط):** «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ» · «ثبّت».

**قبل أي شيء آخر:** اقرأ التقارير الثلاثة بالترتيب، ثم هذا الملف، ثم قِس (§0.1.1) و**قف**:

1. `D:\autoclaw projects-new\AiRemote-handoff\reports\تقرير-جولة-3.16.18.md` (r17 — البناء والإصلاحات)
2. `D:\autoclaw projects-new\AiRemote-handoff\reports\تقرير-تثبيت-3.16.18.md` (r18 — التثبيت والبيان والمحاكي)
3. `D:\autoclaw projects-new\AiRemote-handoff\reports\تقرير-ترقية-WIN10-WIN11-3.16.18.md` (r18 — ترقية الـVMs)

لا تُصلح شيئًا منها بلا أمر.

---

## 0.1) الحالة المقيسة الآن (2026-11-13 ~17:55)

| البند | القيمة | كيف تُتحقَّق |
|---|---|---|
| الفرع | `feat/screen-unify-3.13.0` | `git branch --show-current` |
| آخر التزام | **`4180923`** (chore(release): sign the 3.16.18 manifest) | `git log --oneline -1` |
| `VERSION` | **3.16.18** | `Get-Content VERSION` |
| `versionCode` أندرويد | **108** | `packages/android-agent/app/build.gradle` |
| **السيرفر المثبَّت** | **3.16.18** على **3001** (TLS) — يعمل | `curl.exe -k -s https://127.0.0.1:3001/health` |
| **وكيل هذا الـPC** | **3.16.18** مثبَّت ويعمل · online | الملف أدناه §0.5.1 + القاعدة |
| **البيان** | **3.16.18 · 70 عنصرًا · موقَّع** | `node scripts/release-manifest.js --verify` → `signature OK` / `all artifacts match` |
| **توافق الإصدار** | **PASS** — كل المصادر 3.16.18 | `node scripts/check-version-consistency.cjs` |
| حزمة السيرفر | Setup **159,432,122 B** · zip **212,177,155 B** — **مثبَّتة** | `releases/server-windows/` |
| حزمة وكيل ويندوز | Setup **76,402,694 B** · zip **104,017,306 B** — **مثبَّتة على 3 أجهزة** | `releases/agent-windows/` |
| **APK أندرويد** | **239,520 B** · موقّع v2+v3 · `versionCode 108` · SHA256 `6C9333791117777B0C12B6BBC726F5E23F9D372E22EC065E25C18D09CC86DBE6` | `releases/android-agent/` |
| **الأسطول** | **6 أجهزة · 5 online** — TECNO · المحاكي · هذا الـPC · WIN10-VM · WIN11-VM (**كلها 3.16.18**) · **TAB16-USB offline** | `/api/devices` أو القاعدة |
| أجهزة adb | `12927374CM001019` (TECNO) · `emulator-5554` + `127.0.0.1:5555` (نفس المحاكي — فخّ #64) · **TAB16 غائب** | `adb devices -l` |
| شجرة git | نظيفة في الجوهر؛ غير المتتبَّع كما r17: `artifacts/*.idsig|*.apk` + `docs/PROMPT-*` + `docs/تقرير-*` | `git status --short` |
| `verify.js` | **56/57** — الفشل الوحيد المعروف (sessions export · بيئي) | `node scripts/verify.js` |

**الأجهزة المسجّلة (من القاعدة):**

| # | الاسم | الحالة | النسخة | مالك |
|---|---|---|---|---|
| 1 | Android-Emulator | **online** | **3.16.18-android** | admin@airemote.local |
| 2 | TECNO-KL4 | **online** | **3.16.18-android (108)** | admin@airemote.local |
| 3 | DESKTOP-K81PJ9H | **online** | **3.16.18** | lab-probe@local |
| 4 | WIN10-VM | **online** | **3.16.18** | admin@airemote.local |
| 5 | WIN11-VM | **online** | **3.16.18** | admin@airemote.local |
| 6 | TAB16-USB | **offline** (منذ 2026-11-12) | 3.16.0-android | admin@airemote.local |
| — | GPSZ2025040701858 | **غير مسجّل وغير موصول** | — | — |

> «غير متصل» يعني **الوكيل غير مُشغَّل الآن**، لا عيبًا.

### 0.1.1) أول 10 دقائق — تحقّق ثم قف

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git branch --show-current                          # feat/screen-unify-3.13.0
git rev-parse --short HEAD                         # 4180923
git log --oneline -6
git status --short
Get-Content VERSION                                # 3.16.18
curl.exe -k -s https://127.0.0.1:3001/health       # 3.16.18
node scripts/release-manifest.js --verify          # signature OK · all artifacts match (70)
node scripts/check-version-consistency.cjs         # PASS
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe' devices -l
node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db',{readOnly:true});for(const d of db.prepare('SELECT name,status,info FROM devices ORDER BY name').all()){const i=JSON.parse(d.info||'{}');console.log(d.name,d.status,i.agentVersion||i.version||'?')}"
```

**المتوقَّع:** HEAD `4180923` · `/health` 3.16.18 · بيان 70 موقَّع · **PASS** · 5 online كلها 3.16.18 · TAB16 offline.

**بعدها توقّف.** لا تبنِ «للتأكيد»، ولا تثبّت، ولا تُصلح فرقًا.

---

## 0.2) الوصول والحسابات (لا قيم سرّية داخل المستودع)

| ما | أين / كيف |
|---|---|
| حساب اللوحة الأساسي | `admin@airemote.local` (دور `admin`) — **كلمة المرور عند المالك فقط** |
| **حساب الأتمتة العامل** | `lab-probe@local` (دور `admin`) — بياناته في `C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json` |
| حساب احتياطي | `admin@airemote.io` (دور `admin`) |
| **تنبيه** | `AiRemote\lab-credentials.txt` → **401**. استخدم `lab-probe.json`. حدّ الدخول 5/دقيقة. |
| قاعدة البيانات | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` (**قراءة فقط**) |
| مفاتيح التوقيع | `C:\Users\admin\AppData\Roaming\AiRemote\signing\airemote-release.jks` · alias **`airemote`** · كلمة المرور في `keystore-password.txt` |
| شهادة TLS للسيرفر | `C:\Users\admin\AppData\Roaming\AiRemote-Server\tls\server.crt` (SAN يشمل 192.168.1.25) |
| شهادة CA للوكلاء | هذا الـPC: متغير مستخدم `AGENT_CA_CERT` → `…\AiRemote-Server\tls\server.crt` · الـVMs: `C:\Users\admin\AppData\Roaming\AiRemote Agent\server-ca.pem` |
| مفتاح AI | في `settings.aiApiKey` — لا يُطبع (طوله 49 مقيسًا) |
| بوت Telegram | `settings.telegramToken` (48) · المحادثة `1029428155` |

**قاعدة صارمة:** أي سرّ يُقرأ من البيئة أو عند المالك أو من ملفات الاعتماد. **لا يُكتب في مستودع ولا وثيقة ولا التزام ولا مخرَج أداة ولا ردّ.**

**قراءة القاعدة من Node:** `require("node:sqlite").DatabaseSync` (Node 24) — `better-sqlite3` مبني لـElectron (فخّ معروف في `verify.js`).

**جداول القاعدة المهمة:** `devices` · `ai_conversations` · `settings` · `sessions` · `session_tokens` · `audit_log` · `users` · `device_unattended` · `file_transfers`.

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
| zipalign / apksigner | `…\sdk\build-tools\34.0.0\{zipalign.exe,apksigner.bat}` |
| Chrome (لقياس الواجهة) | `C:\Program Files\Google\Chrome\Application\chrome.exe` |

**لا `java` على PATH.** كل صدفة تحتاج:
```powershell
$b='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME="$b\jdk"; $env:ANDROID_HOME="$b\sdk"; $env:ANDROID_SDK_ROOT="$b\sdk"
```

**شبكة هذا الـPC (مقيسة):** Hostname `DESKTOP-K81PJ9H` · Wi-Fi `192.168.1.25` · Ethernet `192.168.1.55` · VMnet8 `192.168.0.1` · ZeroTier `10.90.74.220` · VMnet1 `192.168.28.1`.

### 0.3.1) أدوات الجولة الجديدة — **مهمة**

`D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-31618-install\`

| الأداة | الوظيفة |
|---|---|
| **`vm-exec.cjs`** | ينفّذ سكربت PowerShell على جهاز عبر `/api/devices/:id/exec`، **مرسَلًا كـ`-EncodedCommand` base64**. إلزامي لأجهزة ويندوز (فخّ #71). |
| **`push-file.cjs`** | يرفع ملفًا إلى جهاز عبر **R5** (`file-transfers`: create → start → مقاطع 1MB → finish بتحقق SHA-256). |
| `upgrade-31618.ps1` / `.cmd` | سكربت الترقية: إيقاف الوكيل ← `/S` ← تحقق النسخة ← إعادة التشغيل بآلية الجهاز. |
| `trigger-upgrade.ps1` · `trigger-upgrade-high.ps1` · `trigger-upgrade-plain.ps1` | إنشاء مهمة مجدولة لمرة واحدة وتشغيلها (عادي / `/rl HIGHEST` / بسيط). |
| `probe-before.ps1` · `probe2.ps1` … `probe6.ps1` · `probe-win11.ps1` | فحوص قبل/بعد (نسخ، إعدادات، صلاحيات، مهام). |
| `snapshot-db.cjs` · `snapshot-db2.cjs` | لقطة قراءة فقط لإعدادات القاعدة. |

**استخدام:**
```powershell
cd 'D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-31618-install'
node vm-exec.cjs WIN10-VM probe-before.ps1 90000
node push-file.cjs WIN10-VM 'C:\path\file.exe' 'C:/Users/Public/file.exe'
```

**أداة التنفيذ الحي بدون UI (TECNO/المحاكي):** `handoff\scripts\remote-exec.cjs`
- `node scripts/remote-exec.cjs TECNO-KL4 "AISHOT:/sdcard/x.jpg"` → عبر `/api/devices/:id/exec`.
- `AICTL:<base64 JSON>` → `AiRemoteA11y.runSync`.
- **للأوامر التي تحوي اقتباسات/شرطات مائلة على ويندوز استخدم `vm-exec.cjs` لا `remote-exec.cjs`** (فخّ #71).
- لا يطبع أي token.

---

## 0.4) الأجهزة (مقيسة الآن)

| الجهاز | الحالة | الإصدار | ملاحظة |
|---|---|---|---|
| **TECNO-KL4** | **online** | **3.16.18 (108)** | `serial 12927374CM001019` · شاشة **720×1600** · التقاط **3/3** (r17) · `control invoked` · a11y = `AiRemoteA11y` |
| **Android-Emulator** | **online** | **3.16.18 (108)** | Android 9 (API 28) · 1600×900 · `ro.serialno 00241cfa` · `product SM-X910N` · a11y مربوطة (`capabilities=33`) · **التقاط ممنوح · AISHOT 2/2 (310ms ثم 78ms · 62,655 B)** |
| **DESKTOP-K81PJ9H** | **online** | **3.16.18** | وكيل ويندوز على هذا الـPC · **مهمة مرتفعة** `AiRemote Agent (Elevated)` |
| **WIN10-VM** | **online** | **3.16.18** | `DESKTOP-IFE3GNE` · **192.168.0.137** (DHCP — فخّ #77) · مهمة **مرتفعة** `AiRemote Agent (Elevated)` |
| **WIN11-VM** | **online** | **3.16.18** | `DESKTOP-P7Q6D6U` · **192.168.0.138** · إقلاع عبر **Run key** `io.airemote.agent … --autostart` (غير مرتفع) |
| **TAB16-USB** | **offline** | 3.16.0-android | **غير موصول** — البند المعلّق الأول |
| GPSZ2025040701858 | غير موصول | — | **لم يُثبَّت عليه شيء قط** |

**قدرات مشتركة:** `pty` · `shell` · `fs` · `screenControl` · `clipboard` · `chat` · `ai` · `android`/`multiMonitor`.

---

## 0.5) إعدادات التطبيق المحفوظة (هي «الحالة» التي يجب ألّا تُفقد) — مقيسة r18

| الإعداد | القيمة |
|---|---|
| مزوّد الذكاء الاصطناعي | `zai` · النموذج `glm-4.7-flash` · المفتاح محفوظ (49) |
| `aiConfigs` / `ai_config` | نسختان لنفس المزوّد (`zai` فقط) — سلوك قائم، لا تحذف إحداهما |
| إشعارات Telegram | **مفعّلة** · توكن (48) · محادثة `1029428155` · مفاتيح الأحداث `online/offline/chat/task` = **true** |
| المهام المجدولة | **0** |
| قواعد التنبيه | **0** |
| 2FA / TOTP | **معطّل** لكل المستخدمين (3) |
| المستخدمون | **3**: `admin@airemote.local` · `admin@airemote.io` · `lab-probe@local` (كلهم admin) |
| الأجهزة المسجّلة | **6** · `device_unattended` = 1 |
| المحادثات / الجلسات / النقل | `ai_conversations` 14 · `sessions` 3,469 · `file_transfers` 58 |
| المظهر | الوضع النهاري على TECNO (Force Dark معطَّل) |
| **الشريط العلوي** | زر هوية «AiRemote Agent» + الإصدار أقصى اليسار · النقطة الخضراء ثم الثيم ثم اللغة أقصى اليمين · **LTR دائمًا** |
| **الشريط السفلي** | **مخفي** |
| البطاقات | كل بطاقات الرئيسية قابلة للطيّ/الفتح مع حفظ الحالة (أندرويد + بطاقة الاتصال في ويندوز) |
| وضع تحكم أندرويد | «موافقة يدوية» افتراضيًا |

### 0.5.1) وكيل ويندوز — هذا الـPC (`DESKTOP-K81PJ9H`)

| المفتاح | القيمة |
|---|---|
| ملف الإعداد | `C:\Users\admin\AppData\Roaming\airemote-agent-desktop\airemote-config.json` |
| `serverUrl` | `wss://192.168.1.25:3001/ws` |
| `token` | 36 محرفًا (UUID) — **لا يُطبع** |
| `autoStart` | `true` · `startMinimized=false` · `_winBounds` محفوظة |
| متغير بيئة المستخدم | `AGENT_CA_CERT = C:\Users\admin\AppData\Roaming\AiRemote-Server\tls\server.crt` |
| معرّف الجهاز | `35850a47-e50f-48f3-bc81-8c38d7a908c0` · الاسم `DESKTOP-K81PJ9H` |
| آلية التشغيل | المهمة/البدء التلقائي المعتاد — **عند الإطلاق اليدوي من صدفة: اضبط `AGENT_CA_CERT` أولًا (فخّ #76)** |
| مسار التثبيت | `C:\Users\admin\AppData\Local\Programs\AiRemote Agent\` (3.16.18) |

### 0.5.2) وكيلا الجهازين الافتراضيين (مقيسان r18)

| | WIN10-VM | WIN11-VM |
|---|---|---|
| المضيف / IP | `DESKTOP-IFE3GNE` / **192.168.0.137** | `DESKTOP-P7Q6D6U` / **192.168.0.138** |
| المستخدم | `admin` (السجل **مرتفع**) | `admin` (السجل **غير مرتفع**) |
| مسار التثبيت | `%LOCALAPPDATA%\Programs\AiRemote Agent\` (3.16.18) | نفسه |
| `serverUrl` | `wss://192.168.0.1:3001/ws` (بوابة VMnet8) | نفسه |
| `token` | 36 محرفًا — لا يُطبع | 36 — لا يُطبع |
| `autoStart` | `true` | `true` |
| الإقلاع | مهمة **`AiRemote Agent (Elevated)`** (RunLevel Highest · Run As admin) | **Run key** `HKCU\…\Run` → `io.airemote.agent` = `…\AiRemote Agent.exe --autostart` |
| `AGENT_CA_CERT` | User **و** Machine · `…\AiRemote Agent\server-ca.pem` | **User** فقط · نفس الملف |

---

## 0.6) ما أُنجز في r18 — بندًا بندًا (أوامر المالك 1–7 ثم ترقية الـVMs)

### 0.6.1) تثبيت سيرفر 3.16.18

| | قبل | بعد |
|---|---|---|
| `/health` | `3.16.17` · uptime 73,656ث · 4 عمليات | **`3.16.18`** · tls true · 3001 |
| التطبيق المثبَّت | 3.16.17 | **3.16.18** (`Uninstall …exe`) |

إيقاف → `/S` (**exit 0 · 23ث**) → 35ث → تشغيل → `/health` 3.16.18 من أول محاولة. `/health` الختامي: uptime ~5,500ث.

### 0.6.2) تثبيت وكيل ويندوز 3.16.18 (هذا الـPC)

- قبل 3.16.17 → `/S` **exit 0 · 15ث** → **online · 3.16.18**.
- `token` (36) و`serverUrl` و`autoStart` **سليمة** — الاتصال المُصادَق يثبت صلاحية الـtoken.
- **حادثة وشفاؤها:** الإطلاقة الأولى بقيت offline لأن جلسة الصدفة **لا تحمل** `AGENT_CA_CERT` → فشل TLS؛ أُعيد التشغيل بالمتغير → online. (فخّ #76)
- ملف الإعداد تغيّرت بصمته بإضافة `startMinimized`/`_winBounds` فقط.

### 0.6.3) البيان والتوقيع والتوافق

- `node scripts/release-manifest.js` → **3.16.18 · 70 عنصرًا** (كان 65).
- `--verify` → `signature OK` · `all artifacts match` · exit 0.
- `check-version-consistency.cjs` → **PASS** (كل المصادر 3.16.18 بما فيها `/health`).
- **التزام واحد:** `4180923` (manifest.json + manifest.sig فقط).

### 0.6.4) إحياء المحاكي

| الخطوة | القياس |
|---|---|
| adb قبل | `emulator-5554` **offline** (+ `127.0.0.1:5555` مرآته) |
| `adb kill-server`/`start-server` | **device** |
| المقدمة قبل | **FileBridge** (فخّ #52) → `am start --activity-clear-top --activity-single-top` |
| الإصدار | **108 / 3.16.18** |
| a11y | مفعّلة ومربوطة: `Service[label=AiRemote Android, capabilities=33]` |
| القاعدة | **online · 3.16.18-android** |
| الالتقاط | كان «غير ممنوح» → مُنح من **معالج التهيئة** (فتح الإعداد) → «التقاط جاهز» → **AISHOT `shot-ok` مرتين متتاليتين** (310ثم · 78ثم · 62,655 B) |

**الدليل:** `handoff\shots-2026-11-13-31618-install\emulator-shot-1-after-grant.jpg` · `emulator-shot-2-consecutive.jpg` · `emulator-ui-capture-ready.xml`.

### 0.6.5) GPSZ2025040701858 — غير موصول (كما r16/r17). لا شيء أُنجز.

### 0.6.6) `verify.js`

- **56/57**. الفشل الوحيد: `e2e: sessions export (R8)` — سبب بيئي معروف: `better-sqlite3` مبني لـABI إلكترون (`NODE_MODULE_VERSION 119` مقابل `149`) فيسقط لـ`node:sqlite` وتفشل مرشّحات الاختبار.
- **لا فشل جديد.** خط الأساس نفسه.

### 0.6.7) ترقية WIN10-VM وWIN11-VM إلى 3.16.18

| | WIN10-VM | WIN11-VM |
|---|---|---|
| قبل → بعد | **3.16.0 → 3.16.18** | **3.16.0 → 3.16.18** |
| `installerExit` | **0** | **0** |
| الحالة | **online 3.16.18** | **online 3.16.18** |
| الحزمة | 76,402,694 B · SHA256 `AF17748E…CE50` (تحقق على القرصين) | نفسه |
| الإعدادات | token 36 · url · autoStart=True — **باقية** | نفسها |
| الإقلاع بعد الترقية | المهمة المرتفعة — بقيت | Run key `--autostart` — بقي |

**سجل الجهازين:** `C:\Users\Public\airemote-upgrade-31618.log` على كل VM (فيه: before/after · installerExit · relaunch · caEnv).

**الطريقة (وصفة قابلة لإعادة الاستخدام):**
1. `push-file.cjs` عبر **R5** لدفع الحزمة (مقاطع 1MB + تحقق SHA-256).
2. `push-file.cjs` لدفع `upgrade-31618.ps1` + `.cmd`.
3. `vm-exec.cjs` لتشغيل `trigger-upgrade-high.ps1` (مهمة `/rl HIGHEST`) على WIN10، و`trigger-upgrade-plain.ps1` على WIN11.
4. مراقبة القاعدة حتى `online | 3.16.18`، ثم قراءة السجل، ثم حذف المهمة المؤقتة.

**بقايا مقصودة على الجهازين (لم تُحذف):** الحزمة + السكربتات + السجل في `C:\Users\Public\` (76 MB لكل جهاز). المهمة المؤقتة `AiRemoteUpgrade31618` **محذوفة**.

---

## 0.7) إعدادات الاختبار (كما هي الآن)

| البند | القيمة |
|---|---|
| حساب الأتمتة | `lab-probe@local` · بياناته `AiRemote\lab-probe.json` · دخول عبر `POST /api/auth/login` |
| تنفيذ حي (أندرويد) | `handoff\scripts\remote-exec.cjs` → `AISHOT:` · `AICTL:<base64 JSON>` (نفس عقود المساعد) |
| تنفيذ حي (ويندوز) | `handoff\tools-2026-11-13-31618-install\vm-exec.cjs` → **base64 إلزامي** |
| نقل ملفات | `push-file.cjs` (R5) — البديل المعتمد عن SMB/UNC (المسارات UNC مرفوضة في الخادم) |
| لقطات | `adb shell screencap` + `adb pull` (لا `>` في PS 5.1 — فخّ #58) |
| قياس الواجهة | Chrome على `https://127.0.0.1:3001` (شهادة ذاتية — `-k`) |
| بوابة الاختبار الكاملة | `node scripts/verify.js` → **56/57** (لا تعِد تشغيلها إلا بأمر؛ لا تُصلح الفشل المعروف) |
| قراءة القاعدة | `node:sqlite` readOnly · `better-sqlite3` لا يصلح في Node 24 |

---

## 0.8) الفخاخ الجديدة في r18 (71–77)

71. **تمرير أوامر ويندوز عبر الوكيل يُشوّه النص** — الاقتباسات تُحذف والشرطة تتضاعف (`$p="…\Programs\…"` تصل `$p=$env:LOCALAPPDATA\\Programs\\…`). **الحل:** `-EncodedCommand` base64 (`vm-exec.cjs`).
72. **وكيل مرتفع لا يوقفه سكربت غير مرتفع** — على WIN10 بقيت 5 عمليات حيّة وعلق مثبّت NSIS (نتيجة المهمة `267009`). **الحل:** مهمة `/rl HIGHEST` من سياق مرتفع.
73. **`schtasks` بلا `/rl HIGHEST` ينشئ مهمة بلا رفع** حتى لمستخدم إداري — تحقّق من `elevated=` في السجل.
74. **مهلة تنفيذ الوكيل 3.16.0 ≈ 30ث** — أمر تجاوزها فشل بـ`Command failed`؛ الأوامر الطويلة تُدار كمهمة غير متزامنة.
75. **Run key على WIN11 يحمل `--autostart`** — أي إعادة تشغيل يدوية يجب أن تمرّره وإلا اختلف سلوك الإقلاع.
76. **إطلاق وكيل ويندوز من صدفة لا تحمل `AGENT_CA_CERT` → فشل TLS وonline مفقود.** المتغير دائم في بيئة المستخدم؛ جلوس الأدوات لا ترثه.
77. **عناوين الـVMs DHCP:** `192.168.0.128/132` (r16) صارت **`.137/.138`** — لا تثق بعنوان محفوظ؛ اقرأه من القاعدة (`info.ipLocal`).

---

## 1) ما أُغلق ولا يُعاد فتحه

| البند | الدليل |
|---|---|
| كل مغلق في r16 وr17 (§1 فيهما) | تقارير `handoff\reports\` |
| **`screenshot` على TECNO 3/3 · `control` invoked · a11y** | `tecno-shot-{1,2,3}.jpg` · `tecno-14-after-control.png` |
| **وضوح الفاتح · الشريط العلوي/السفلي · الطيّ · إزالة بطاقة «أندرويد فقط»** | `tecno-07/08/12*.png` |
| **سيرفر + وكيل ويندوز 3.16.18 مثبَّتان** | `/health` 3.16.18 · `Uninstall` 3.16.18 |
| **البيان 3.16.18 (70) موقَّع + PASS** | `--verify` · `check-version-consistency.cjs` · `4180923` |
| **المحاكي 3.16.18 · a11y · التقاط 2/2 · online** | `emulator-shot-{1,2}*` |
| **WIN10-VM وWIN11-VM على 3.16.18** | سجل كل جهاز + القاعدة |

---

## 2) الفخاخ المثبتة — **77**

### قديمة ما زالت تصدق (1–70 كما في r17)
51–70 مذكورة في r17 §2 (التقاط دافئ · FileBridge · lab-credentials · a11y · Force Dark · `btn_soft` · Telegram heads-up · `removeView` قبل `addView` · SetupActivity غير مُصدَّرة · 127.0.0.1:5555 · انقطاع المحاكي · عقود remote-exec · `clickname` · إلكترون 28.3.3 · copy-dashboard · لا تثبيت بلا أمر).

### جديدة (71–77)
كما §0.8 أعلاه.

---

## 3) الأدوات

### 3.1) في المستودع
`verify.js` · `check-version-consistency.cjs` · `release-manifest.js` · `copy-dashboard` … (كما r17 §3.1).

### 3.2) مجلدات الجولات (خارج مساحة الحساب)

```
D:\autoclaw projects-new\AiRemote-handoff\scripts\           # remote-exec.cjs + 41 سكربتًا
D:\autoclaw projects-new\AiRemote-handoff\reports\           # التقارير (ومنها تقارير r18)
D:\autoclaw projects-new\AiRemote-handoff\docs\              # نسخ ملفات PROMPT (ومنها هذا)
D:\autoclaw projects-new\AiRemote-handoff\shots-2026-11-13-31618\         # لقطات r17
D:\autoclaw projects-new\AiRemote-handoff\shots-2026-11-13-31618-install\ # لقطات/أدلة r18 (المحاكي)
D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-31618\         # رقع r17
D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-31618-install\ # أدوات r18 (§0.3.1)
D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-pending\       # register-win-agent.cjs
```

### 3.3) بناء أندرويد (متسلسلة مجرَّبة)
gradle → zipalign → ملفّا كلمة مرور منفصلان → apksigner → verify → `install -r` → **`force-stop` + `am start`** (فخّ #21).

### 3.4) بناء ويندوز
كما r16 §3.4. الحزمتان مبنيَّتان ومثبَّتتان الآن.

### 3.5–3.8) دوران الشاشة، الصلاحيات، إنشاء جهاز، قراءة القاعدة — كما r16.

---

## 4) ما بقي — **معلّق بانتظار المالك**

### 4.1) مغلق
كل r16 + كل r17 + **بنود r18 السبعة** + **ترقية WIN10-VM/WIN11-VM**.

### 4.2) معلّق

1. **TAB16-USB — البند الأول.** المالك سيوصله. عندها: تثبيت **APK 3.16.18** (`adb install -r`) → `wss://192.168.1.25:3001/ws` + **رمز جهاز جديد** → منح **الالتقاط** و**a11y** (`AiRemoteA11y`) → `force-stop` + `am start` → التحقق: online + 3.16.18 + AISHOT + a11y مرتبطة. **لا تُنفّذ قبل أمر المالك بعد التوصيل.**
2. **GPSZ2025040701858** — عند توصيله: نفس المسار (APK + url + token + التقاط + a11y + online).
3. **`verify.js`** — أُعيد مرة واحدة (56/57). لا إعادة ولا إصلاح بلا أمر.
4. **ترقية أندرويد على TAB16 فقط** — TECNO والمحاكي محدَّثان.

### 4.3) تحسينات اختيارية (ليست عيوبًا) — كما r16/r17
حفظ نتائج تنفيذ الكتل في `ai_conversations` (فخّ #54) · شارة عدد المشاهدين · RecyclerView · powershell→sh على أندرويد.

### 4.4) ديون بنيوية باقية (لا تُفتح بلا قرار) — كما r17
`packages/server` (TS) لا يُشحن · `static/` نسخة مبنية داخل git (مقصود) · `aiConfigs`/`ai_config` مكرّران · صفحة `/dev/ui` تطوير فقط · جهاز DESKTOP-K81PJ9H مالكه `lab-probe@local`.

---

## 5) أوامر جاهزة (لا تُشغَّل بلا إذن)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'

# تحقّق فقط (مسموح الآن)
curl.exe -k -s https://127.0.0.1:3001/health          # 3.16.18
node scripts/release-manifest.js --verify              # OK · 70
node scripts/check-version-consistency.cjs             # PASS

# عنصر TAB16 (بعد توصيله وبأمر المالك)
$adb='D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe'
& $adb devices -l
& $adb -s <serial> install -r 'releases\android-agent\AiRemote-Agent-Android-v3.16.18.apk'
# ثم: url + token من واجهة التطبيق، منح الالتقاط وa11y، force-stop + am start، والتحقق AISHOT

# ترقية جهاز ويندوز آخر (وصفة r18)
cd 'D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-31618-install'
node push-file.cjs <device> 'D:\autoclaw projects-new\AiRemote\releases\agent-windows\AiRemote-Agent-Setup-v3.16.18-x64.exe' 'C:/Users/Public/AiRemote-Agent-Setup-v3.16.18-x64.exe'
node push-file.cjs <device> 'upgrade-31618.ps1' 'C:/Users/Public/upgrade-31618.ps1'
node push-file.cjs <device> 'upgrade-31618.cmd' 'C:/Users/Public/upgrade-31618.cmd'
node vm-exec.cjs <device> trigger-upgrade-high.ps1 60000   # أو trigger-upgrade-plain.ps1
```

---

## 6) بروتوكول التنفيذ — كما r16/r17 مع إضافات r18

1. **قِس أولًا** (§0.1.1) — لا تثق بأرقام هذا الملف بلا تحقق.
2. **تعديل واحد = التزام واحد** بالسبب.
3. إن ساء الرقم: `git checkout` فورًا.
4. الدليل المقيس (قبل/بعد) في الرد وفي التقرير.
5. **لا أسرار** في المستودع/الالتزامات/المخرجات/الردود.
6. **لا تلمس عقد API** ولا تصميم سطح بلا قرار مالك — الشريط العلوي بشكله الحالي لا تُزال منه أزرار.
7. أي تغيير في محتوى الحزمة يرفع الرقم في المصادر السبعة + `versionCode` + البيان.
8. بوابة جديدة تحتاج إثبات عضّ + خط أساس بأسباب.
9. **⛔ لا تنفّذ شيئًا بلا إذن المالك.**
10. التقارير في مساحة عمل AutoClaw ثم **تُنسخ فورًا إلى القرص** (`handoff\reports\`).
11. أي أداة جولة تُنسخ إلى `handoff\tools-YYYY-MM-DD-<tag>\`.
12. أي لقطة تُحفظ في `handoff\shots-YYYY-MM-DD-<tag>\`.
13. **قبل أي نقرة على جهاز: تحقّق `mCurrentFocus`** (FileBridge/livedrama).
14. **أوامر ويندوز عبر الوكيل: base64 فقط** (`vm-exec.cjs`) — لا نصوص فيها اقتباسات.
15. **نقل الملفات إلى الأجهزة: R5 فقط** (`push-file.cjs`) — لا SMB/UNC.
16. **قبل ترقية وكيل ويندوز:** اعرف آلية إقلاعه (مهمة مرتفعة أم Run key) وأعد التشغيل بنفس الآلية.
17. لا تطبع أي سرّ.
18. **سلّط السلامة (Zwork Safety Guard):** أي أمر تدميري/مسح قرص مرفوض دائمًا؛ أوامر كتابة عالية الخطورة قد تطلب تأكيد المالك.

---

## 7) التقارير المسلَّمة

| الملف | المحتوى |
|---|---|
| كل تقارير r16 وما قبلها | `handoff\reports\` |
| `تقرير-جولة-3.16.18.md` | r17: إصلاح no frame · 3.16.18 · الفاتح · الشريط · الطيّ · control TECNO |
| **`تقرير-تثبيت-3.16.18.md`** | **r18: تثبيت السيرفر والوكيل · البيان والتوقيع · المحاكي · GPSZ · verify.js** |
| **`تقرير-ترقية-WIN10-WIN11-3.16.18.md`** | **r18: ترقية الـVMs · الطريقة · الفخاخ 71–75 · بقايا C:\Users\Public** |

> نسخ Markdown محفوظة في `D:\autoclaw projects-new\AiRemote-handoff\reports\`.

---

## 8) نقطة التوقّف الدقيقة

**آخر ما كان جاريًا:** جولة **r18** — أُغلقت: تثبيت 3.16.18 (سيرفر + وكيل هذا الـPC) · البيان (70) والتوقيع و**PASS** · إحياء المحاكي والتقاطه 2/2 · **ترقية WIN10-VM وWIN11-VM** · `verify.js` 56/57.

- **الالتزامات:** آخرها `4180923`. لا التزام جديد بعد هذا الملف.
- **السيرفر:** 3.16.18 مثبَّت ويعمل على 3001.
- **هذا الـPC:** وكيل 3.16.18 · online.
- **TECNO:** 3.16.18 · online · التقاط 3/3 · control invoked · a11y.
- **المحاكي:** 3.16.18 · **online** · a11y مربوطة · **التقاط 2/2**.
- **WIN10-VM / WIN11-VM:** **3.16.18 · online** · الإعدادات وآليات الإقلاع سليمة.
- **TAB16-USB:** **offline — لم يُوصَل** (البند التالي).
- **GPSZ:** غير موصول.
- **الأسطول:** 6 أجهزة · **5 online**.
- **البيان:** 3.16.18 · 70 عنصرًا · موقَّع. **التوافق:** PASS. **verify:** 56/57.

**نقطة الاستئناف:** اقرأ التقارير الثلاثة، ثم هذا الملف، ثم قِس (§0.1.1) و**قف**. الأوامر المتوقّعة أولًا: «TAB16 موصول — ثبّته» · «جهّز GPSZ» · «شغّل verify.js» · «افتح بندًا جديدًا».

**نهاية r18.** قف هنا حتى يأمر المالك.
