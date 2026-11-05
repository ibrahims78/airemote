# استئناف مشروع **AiRemote** — حساب جديد · 2026-11-05 · الإصدار **3.13.1**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-04-3.13.0-FULL-AR.md`.**
> كل رقم فيه مقيس بأمر أو محفوظ في `outputs/verify-2026-11-04/` أو `docs/`.

---

## 0) ما تغيّر منذ 3.13.0 (اقرأ أولًا — يحكم على ما بعده)

**النسخة 3.13.1** · `versionCode=59` · الفرع **`feat/screen-unify-3.13.0`** (لم يُدمج) · Git محلي (0 remotes)
· السيرفر المثبَّت **3.13.1** · الوكلاء على WIN10/WIN11 **3.13.1** · المحاكي **3.13.1-android**.

**38 التزامًا** منذ `51af7a8`، مجمّعة:

| المجموعة | الالتزامات |
|---|---|
| **جدار المراقبة + القوائم** | `f4f9336` (بوّابة البث + تشغيل/إيقاف/تكبير + 3 أعمدة + إعادة بناء «المزيد») · `d24dd07` (تجمّد قائمة التطبيق — `no-drag`) |
| **الأداء** | `abebffa` (LockBits بدل GetPixel) · `3840f62` (إيقاف ماسح Chromium المتوازي) · `1a43efa` (تسريب مؤقّت الالتقاط) |
| **المحدّث** | `4aedf04` (حلقة 223MB — سجل محاولات + قفل + تنظيف) |
| **كلمة السر** | `acfe6ba` (scrypt + اختبار KDF) · `2ed1719` (أندرويد PBKDF2) · `687444d` (كلمة سر وكيل↔وكيل) · `8f232c7` (الوكيل هو الحَكَم) · `110294b` (سبب الرفض) · `6a5676c` (واجهة موحّدة) · `393aadd` (إظهار الحقل) · `cd5d94c` (أندرويد: تحقق + رسائل) |
| **التصميم** | `06e9dcf` (فحص مستودع skills) · `6f867b8` (**PLAN-UI-IMPLEMENTATION**) — مع 3 نماذج HTML |
| **اختبارات/توثيق** | `d5f16d6` `a8e159e` `56ce010` `70d0cb6` `3a42c00` `307eb77` `769f4ce` `f9fb5e1` `142f195` `b31b34a` `7c386f0` `5c2bb98` `efbabd1` `ccf6da7` `2a03311` `c702907` `687444d` `da19b9d` `b174709` `6ac37a6` `51d04d5` |

### 0.1 الحالة الحرجة الآن

- `/health` = **3.13.1** (TLS · 3001) · البيان **48 عنصرًا** · `signature OK` · البطارية **46/46**.
- الأجهزة: WIN10-VM · WIN11-VM · Android-Emulator = **3.13.1** · TECNO/TAB16 **offline** على 3.12.2.
- **التصميم المعتمد** في `design/`: `server.html` · `windows-agent.html` · `android.html` (فاتح افتراضيًا · تبديل ثيم ولغة · 81 عنصرًا موسومًا `data-feature`) + صور `*-light.png` و`*-dark.png`.
- **الخطة** في `docs/PLAN-UI-IMPLEMENTATION-AR.md` (260 سطرًا · 7 مراحل · 6 طبقات اختبار · 11 بند قبول).
- **الجرد** في `design/INVENTORY.csv` (**185 صفًا**: ويندوز 59 · أندرويد 4 · لوحة 122) — ناقص: العناصر المبنية بالكود في اللوحة (تُستكمل).

### 0.2 أسباب جذرية مُصلحة (لا تُعِدها)

1. **بث تلقائي في الجدار:** `preview` كان يبدأ متصلًا (`started = popout || preview || …`). الآن `autoStart` صريح، ولا تُحفظ حالة `running`.
2. **تجمّد قائمة التطبيق:** `.app-titlebar` منطقة سحب في إلكترون، وغطاء القائمة `<div>` بلا `no-drag` ⇒ يبتلع النقر ولا تُغلق القائمة. أُضيف `-webkit-app-region: no-drag` + `Escape`.
3. **قائمة «المزيد»:** كانت تحتوي **مجموعة أزرار أندرويد كصف داخل عمود**. أُعيد بناؤها (231 سطرًا): رأس/فواصل/صفوف موحّدة/مؤشّرات.
4. **استهلاك 50–70%:** ماسح Chromium كان يعمل **بالتوازي** مع GDI وتُهمَل إطاراته + بصمة `GetPixel`. الآن GDI أولًا (بديل بعد 2.5s أو فشلين) و`LockBits`.
5. **حلقة المحدّث:** `stage()` ينسخ 223MB في كل محاولة ولا يحذف. الآن نسخة واحدة + سجل محاولات (تبريد 6h) + قفل + تنظيف `ns*.tmp`.
6. **تسريب مؤقّت الالتقاط:** `stop-capture` أثناء انتظار `getDisplayMedia` كان يُعيد التسليح بـ`sid=null`.
7. **اعتماد مزدوج على قدرة قد تكون قديمة:** السيرفر كان يقرأ `capabilities.controlAuth`؛ صار **الوكيل هو الحَكَم** (يمرّر الكلمة ويقرر).
8. **رفض صامت:** `session:denied` كان يُهمَل في الوكيل ⇒ لا رسالة للطالب. الآن 4 رسائل.
9. **KDF ضعيف:** SHA-256 سريع ⇒ **scrypt** (ويندوز) و**PBKDF2 60k** (أندرويد) مع ترقية تلقائية.
10. **تعارض صنف `.screen`:** صنف الشاشات في النماذج تعارض مع `.tile .screen` ⇒ أُعيدت التسمية إلى `.pg`.

### 0.3 تحذيرات حاكمة (كلها من أخطاء فعلية في هذه الموجة)

- **JS `String.replace` مع `$`:** `$'` في نص الاستبدال يعني «ما بعد المطابقة» ⇒ ينسخ الملف داخل نفسه. استخدم **دالة** `replace(a, () => b)`.
- **`apksigner --key-pass file:`** يقرأ سطرًا تاليًا من الملف ⇒ `end of file`. احذف `--key-pass` (PKCS12 يستخدم كلمة المتجر).
- **الثيم الفاتح:** الرموز معرّفة على `html.light` لا `body.light`.
- **مسار الأدوات:** `D:\autoclaw projects\offline-build-tools\android-toolchain` (بعد `projects` مسافة — لا `projects-offline...`).
- **Gradle:** يلزم `JAVA_HOME` + `ANDROID_HOME` + `GRADLE_USER_HOME=D:\…\.cache\gradle-home` + `--offline`.
- **`SIZE_MATCH` لا يُثبت أن البناء الجديد يعمل:** تحقّق من **زمن بدء العمليات**.
- **توكن مُرشَّح لا يقتل وكيلًا مرتفعًا:** أعد تشغيل الضيف.
- **`e2e: web-server connection` يتقلّب** إذا شُغّلت البطارية تحت حمل ضيف ثقيل.
- **PowerShell here-string** ينكسر إن احتوى `'@` داخله ⇒ اكتب الملفات بـNode.
- **أي زر جديد في شريط الشاشة بلا `data-tb="1"`** لا يُحتسب في `audit-screen-surface`.

---

## 1) بيئة العمل

| العنصر | المسار/القيمة |
|---|---|
| المستودع | `D:\autoclaw projects-new\AiRemote` · `feat/screen-unify-3.13.0` · محلي فقط |
| الرئيسي | `hardening/audit-20261102` عند `54ab5ff` (لم يُمسّ) |
| السيرفر | `https://127.0.0.1:3001` · `/health` = 3.13.1 · TLS ذاتي |
| تنفيذي السيرفر | `C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe` |
| تنفيذي الوكيل | `C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe` |
| قاعدة البيانات | `C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db` (قراءة فقط) |
| إعداد الوكيل (الحقيقي) | `%APPDATA%\airemote-agent-desktop\airemote-config.json` (ليس `AiRemote Agent\…` — نسخة قديمة) |
| مفاتيح أندرويد | `D:\autoclaw projects\offline-build-tools\android-toolchain` |
| مفتاح توقيع APK | `%APPDATA%\AiRemote\signing\airemote-release.jks` + `keystore-password.txt` (**لا تُطبع**) |
| VMware | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` |
| الضيوف | `E:\VMs\Win10_Pro_Custom\…vmx` · `E:\VMs\Win11_Custom_2026-09-30\…vmx` |
| أسرار | `%APPDATA%\AiRemote\lab-credentials.txt` · `signing\keystore-password.txt` · أي JWT (**لا تُطبع**) |

**الأجهزة:**

| الجهاز | deviceId | النسخة |
|---|---|---|
| WIN10-VM | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | 3.13.1 |
| WIN11-VM | `d147684b-2451-4418-a628-86f11aa66a4e` | 3.13.1 |
| Android-Emulator | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` | 3.13.1-android |
| TAB16-USB / TECNO-KL4 | كما في الملف السابق | 3.12.2 (offline) |

---

## 2) المستودع — ما تغيّر

**وكيل ويندوز (`packages/agent-desktop`):** `main.js` (GDI-first · scrypt · سبب الرفض · حكم الوكيل · تسريب المؤقّت) · `preload.js` (`onSessionDenied`) · `renderer/index.html` (قسم كلمة السر الموحّد) · `renderer/app.js` (شارة/قوة/إظهار/مسح · رسائل الرفض) · `renderer/capture.html` (حارس `!sessionId`)
· `lib/capture-gdi-worker.cs` (**LockBits**) · `test/password-kdf.test.cjs` (جديد).

**سيرفر (`packages/server-desktop`):** `server.js` (تسجيل المحاولات/القفل/التنظيف · تمرير كلمة السر · تنظيف الإقلاع) · `lib/updater.js` (stage idempotent · ledger · lock · cleanup) · `test/e2e-updater-loop.test.cjs` (جديد).

**لوحة (`packages/dashboard`):** `ScreenViewer.tsx` (بوّابة preview · منع إعادة المحاولة على خطأ قاتل) · `LivePreviewBoard.tsx` (تشغيل/إيقاف/تكبير · 3 أعمدة) · `DashboardLayout.tsx` (Escape) · `control-room.css` (`no-drag`).

**أندرويد:** `AgentService.java` (تحقق كلمة سر العرض + رسائل الرفض) · `Prefs.java` (**PBKDF2**).

**أدوات/وثائق:** `scripts/verify.js` (46 خطوة) · `scripts/screen-surface-baseline.json` · `docs/PLAN-UI-IMPLEMENTATION-AR.md` · `docs/REPORT-*.md` (4) · `design/` (3 نماذج HTML + صور + SPEC + VERIFY + INVENTORY).

---

## 3) الحالة الحالية (تُتحقَّق في §10 ولا تُعاد بناؤها)

- **السيرفر:** 3.13.1 مثبَّت ويعمل ويخدم اللوحة الجديدة (من `app.asar`).
- **الوكلاء:** WIN10/WIN11 3.13.1 · المحاكي 3.13.1-android.
- **الاختبارات:** `typecheck` · `build` · `check-imports` · `check-contrast 22/22` · `audit-screen-surface` (11/0/2) · `verify.js` **46/46**.
- **ما بعد النشر:** الجدار `ws=0` عند التحميل · التشغيل `ws=1` وإطارات سليمة (سطوع 105.6 · 0% سواد) · الإيقاف `ws=0` · التسجيل 6 قطع/82,602 بايت.
- **قياسات:** CPU البث: WIN10 12.7% · WIN11 22.4% (كانا 33% و44.6%) · أول إطار 110ms.
- **TC-001/002 PASS** (بكلمة السر 123456: `B R` ثم `E R` · صفر أحداث يسرى).

---

## 4) القرارات الحاكمة

- **D40:** التحكم في ويندوز يتطلب جلسة تحكم + كلمة سر مقبولة + وكيلًا مرتفعًا لنوافذ UIPI.
- **D41:** عارض واحد بثلاثة أوضاع (`full`/`popout`/`preview`).
- **D42:** جدار المراقبة للقراءة فقط — أُضيف لاحقًا: **تشغيل/إيقاف/تكبير لكل مربع** لكن **بلا اتصال قبل ضغطة**.
- **D43:** أي زر جديد في سطح الشاشة يتطلب `data-tb="1"` + تحديد الوثيقة + تمرير `audit-screen-surface --check`.
- **D44 (جديد):** **كلمة سر واحدة لكل جهاز** تحكم كل المسارات؛ تُخزَّن في الوكيل فقط، ولا يعرفها السيرفر.
- **D45 (جديد):** السيرفر يمرّر كلمة سر Relay في عرض الجلسة فقط، **ولا يسجّلها** في أي تدقيق أو سجل.
- **D46 (جديد):** لا بث في الجدار بلا ضغطة صريحة؛ إعادة الدخول للصفحة لا تُ resumed أي بث.
- **D47 (جديد):** KDF أدنى: scrypt (ويندوز) · PBKDF2 ≥ 60k (أندرويد)؛ البصمات القديمة تُرقّى عند أول نجاح.
- **D48 (جديد):** المحدّث: نسخة staged واحدة + سجل محاولات (تبريد 6h) + قفل + تنظيف.
- **D49 (جديد):** المرجع البصري الملزم = `design/server.html` · `windows-agent.html` · `android.html`؛ الانحراف ≤ **2%** بكسل.
- **D50 (جديد):** لا يُكتب سطر واجهة قبل تصديق المالك على **الجرد**.

---

## 5) المتبقي (بالترتيب)

### 5.1 **ابدأ تنفيذ خطة التصميم** (الأولوية الأولى — مأمورة)

**الملف:** `docs/PLAN-UI-IMPLEMENTATION-AR.md` (اقرأه كاملًا قبل أي شيء).

| المرحلة | العمل | البوابة |
|---|---|---|
| **0** | استكمال `design/INVENTORY.csv` إلى **219+46+8** عنصرًا (الناقص: أزرار اللوحة المبنية بالكود) وتسليمه للمالك | تصديق المالك على «لا زر ناقص» |
| **1** | إدخال الرموز (متغيّرات CSS) في: `agent/renderer/index.html` · `dashboard/src/index.css` | `check-contrast` ≥ 22/22 |
| **2** | المكوّنات السبعة + الحالات الأربع (فارغ/تحميل/خطأ/طبيعي) | لقطة لكل حالة |
| **3** | الأسطح المنمذجة (سيرفر 3 شاشات · ويندوز 3 · أندرويد 1) | **diff ≤ 2%** مقابل `design/*.png` |
| **4** | باقي الشاشات: **11 صفحة لوحة + 4 أنشطة أندرويد** بنفس الرموز | لقطة معتمدة لكل شاشة |
| **5** | كتالوج الرسائل (11 حالة AR/EN) في `i18n.ts` · `app.js` · `strings.xml` | اختبار ظهور كل رسالة |
| **6** | الاختبار الشامل (6 طبقات) | البطارية + تقرير |

**قواعد التنفيذ الملزمة:**
1. **لا حذف زر ولا دمج ميزة** — التغيير أصناف وأنماط، والمعالجات والمسارات كما هي.
2. **لا `style="…"` مضمّن** في ملفات الواجهة بعد المرحلة 2.
3. كل شاشة تُسلَّم **بلقطة** ومقارنة مع المرجع قبل الانتقال.
4. أي شاشة لم تُنمذج (11+4) تُعرض لقطةُ تصميمها **قبل** كتابة كودها.
5. **الفروع:** مرحلة = التزام واحد على الأقل؛ رسائل إنجليزية.

### 5.2 اختبارات الأجهزة المتبقية
- TC-012 (جودة المعاينة = العارض نصًّا) · أداء fps **تحت حركة الشاشة** (القياس الحالي على شاشة ساكنة).
- TC-015 على أندرويد (تسجيل) · تكافؤ الحافظة/الصوت/التعليقات/الدردشة على أندرويد (فجوات معلنة).

### 5.3 الباقي من الإصدار
- TECNO/TAB16 على 3.12.2 ⇒ تثبيت `AiRemote-Agent-Android-v3.13.1.apk` عند وصلهما.
- دمج `feat/screen-unify-3.13.0` في `hardening/audit-20261102` **بعد** اختبارات الأجهزة.
- نوافذ UIPI: تبقى بحاجة وكيل مرتفع (D40) — لا تُعالج بالكود.

---

## 6) سير العمل الإلزامي

1. تعديل عبر `tools/lab/a2a/patch.cjs` (مرساة واحدة، `allowShrink` عند الحذف) أو تعديل مباشر مع assertions.
2. **شريحة واحدة = التزام واحد** + دليل في `outputs/verify-<date>/` + `CHANGELOG` + `PROJECT_STATE`.
3. أي تغيير واجهة: `typecheck` + `build` + `audit-screen-surface --check` + `check-contrast` قبل الالتزام.
4. رفع الإصدار عند أي شحنة: `VERSION` + 4 `package.json` + `versionCode` + البيان.
5. بناء السيرفر: `cd packages\server-desktop; pnpm run build:win:nodownload` ⇒ إيقاف العمليات ⇒ `Setup.exe /S` حتى `exit=0` ⇒ تشغيل ⇒ `/health`.
6. بناء الوكيل: `electron-builder --win --x64` ⇒ نسخ `app.asar` إلى الضيف ⇒ (WIN10: إعادة تشغيل الضيف لأن الوكيل مرتفع).
7. APK: `gradle --offline -I android-init.gradle assembleDebug` ⇒ `apksigner sign --ks … --ks-key-alias airemote --ks-pass file:…` (**بلا** `--key-pass`) ⇒ `adb install -r -t`.
8. التزامات Git بالإنجليزية، محلية فقط.
9. **لا PASS بلا دليل** على الطبقة الصحيحة.

---

## 7) أدوات لا تُستبدل + بوابات

`vmguest.cjs` (`probe`/`ps`/`shot`/`copyIn`/`copyOut`/`startAgent`) · `swap-3130.ps1` · `copy-asar-3130.ps1` · `patch.cjs` · `build-gdi-worker.cjs` (**--force**) · `devs.cjs` · `lab.cjs` · **`design/mockup*.html`** (المرجع البصري) · **`work/verify-v2.cjs`** (قالب تحقق النماذج، إن وُجد).

**بوابات:** `verify.js` · `check-version-consistency.cjs` · `check-contrast.cjs` · `audit-screen-surface.cjs --check` · `release-manifest.js --verify` · `check-imports.js` · `check-first-frame.cjs`.

---

## 8) التفويض للمساعدين

- الجرد الحسّاس والتحكم بالأجهزة في الجلسة الرئيسية.
- فوّض فقط العريض القابل للتحقق (بحث خارجي، مراجعة مستقلة).
- **درس متكرر:** `subagent_execution_failed` تكرر 3 مرات في هذه الموجة (بما فيها مهام بسيطة) — لا تعتمد على مساعد كبوابة وحيدة.

---

## 9) قواعد ملزمة

1. Git محلي فقط. 2. لا أسرار في المخرجات. 3. PowerShell 5.1 يقرأ UTF-8 كـANSI ⇒ `-Encoding UTF8` أو Node.
4. لا PASS بلا دليل. 5. أندرويد: `am force-stop` يُعطّل خدمة الوصول. 6. بعد إقلاع ويندوز أعد تشغيل الوكيل.
7. `datetime('now')` = UTC. 8. لا تلمس `bin/` · `.cache/` · `node_modules`. 9. `vmrun start` يفشل أحيانًا ⇒ `nogui`.
10. asar: أي أصل يقرأه process خارجي يُستخرج إلى `%APPDATA%`. 11. `vmguest.ps`: الخرج = اسم السكربت.
12. ملكية الأجهزة: طلب جهاز←جهاز يفشل 403. 13. TDZ: لا `let/const` قبل تعريفها. 14. تذكرة `rt` عمرها 60s. 15. CSP. 16. IPC/JSON.
17. قفل VMware العالق ⇒ أَزح `.vmx.lck`. 18. `SetCursorPos` مرفوض في الضيف ⇒ `SendInput`. 19. UIPI ⇒ وكيل كمسؤول.
20. ProTUN يقطع LAN المضيف ⇒ أوقفه أو استخدم WIN10 جسرًا. 21. منفذ اقتران adb ≠ منفذ الاتصال.
22. `build-gdi-worker` يُخزّن ⇒ `--force`. 23. `patch.cjs` يرفض الانكماش ⇒ `allowShrink`.
24. `git apply` على LF ⇒ `-c core.autocrlf=false`. 25. زر شريط بلا `data-tb` لا يُحتسب.
26. **`String.replace` مع `$` ⇒ دالة.** 27. **`apksigner` بلا `--key-pass file:`.** 28. **`light` على `html`.** 29. **`SIZE_MATCH` لا يُثبت البناء.** 30. **صنف `.screen` محجوز للمربّعات ⇒ استخدم `.pg`.**

---

## 10) قائمة تحقق الاستئناف (قراءة فقط — نفّذها عند «ابدأ» ثم أعد الجدول)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -8; git status --short; git branch --show-current
curl.exe -sk https://127.0.0.1:3001/health
node scripts/check-version-consistency.cjs
node scripts/audit-screen-surface.cjs --check
node scripts/release-manifest.js --verify
node scripts/verify.js
node tools\lab\devs.cjs
& 'C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe' list
```

**المتوقع:** الفرع `feat/screen-unify-3.13.0` · شجرة نظيفة (عدا `tools/lab/a2a/guest-WIN10.png` ومخرجات مختبر غير متعقَّبة) · `/health` = 3.13.1 · توحيد PASS · audit PASS (11/0/2) · signature OK · **46/46** · WIN10/WIN11/Emulator = 3.13.1 · ضيفان يعملان.

**إن سقط الجدار:** راجع `LivePreviewBoard` (`autoStart` · `running` · `grid-cols`).
**إن سقط الرفض/الكلمة:** راجع `main.js` (`session:offer` · `session:denied`) و`server.js` (`/api/relay/request`).
**إن سقط المحدّث:** راجع `lib/updater.js` (`stage` · `recentAttempt` · `acquireLock` · `cleanup`).

---

## 11) مخرجاتك المطلوبة الآن

1. جدول تحقق §10 (متوقع/فعلي/دليل).
2. أي انحراف بسطر الدليل.
3. تأكيد أنك لم تُعدّل شيئًا، وأنك تنتظر «ابدأ».
4. **بعد «ابدأ»:** نفّذ **§5.1 المرحلة 0** فورًا: أكمل `design/INVENTORY.csv` إلى 219+46+8 وسلّمه للمالك للتصديق — **لا تكتب كود واجهة قبل ذلك**.

---

## 12) ملحق: حصيلة الموجة

| المجال | الإنجاز | الدليل |
|---|---|---|
| الجدار | لا بث بلا ضغطة · تشغيل/إيقاف/تكبير · 3 أعمدة | `f4f9336` · لقطات `*-light.png` |
| القوائم | تجمّد القائمة أُصلح · «المزيد» أُعيد بناؤه | `d24dd07` · `f4f9336` |
| الأداء | CPU −50% (WIN10 12.7% · WIN11 22.4%) · أول إطار 110ms | `abebffa` `3840f62` · `outputs/.../perf/` |
| المحدّث | حلقة 223MB/ساعة توقفت | `4aedf04` · 14 تحقّقًا |
| كلمة السر | scrypt + PBKDF2 + وكيل↔وكيل + رسائل رفض | `acfe6ba` `2ed1719` `687444d` `110294b` |
| الاختبارات | 46/46 · TC-001/002 PASS · 003/004/008/012/014/015/019/020–024 | `docs/SCREEN-UNIFY-TEST-MATRIX-AR.md` |
| التصميم | 3 نماذج HTML + صور + SPEC + VERIFY + INVENTORY(185) | `design/` |
| الخطة | 7 مراحل · 6 طبقات اختبار · 11 بند قبول | `docs/PLAN-UI-IMPLEMENTATION-AR.md` |
