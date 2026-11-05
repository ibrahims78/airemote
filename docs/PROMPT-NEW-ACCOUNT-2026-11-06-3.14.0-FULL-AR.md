# استئناف مشروع **AiRemote** — حساب جديد · 2026-11-06 · الإصدار **3.14.0**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-05-3.13.1-FULL-AR.md`.**
> كل رقم فيه **مقيس بأمر** ومسجَّل في `outputs/verify-2026-11-05/` أو في `docs/`.
> **المطلوب:** متابعة الخطة كاملة دون توقف حتى الإصدار 3.14.0 المشحون، مع الاختبارات والتوثيق.

---

## 0) ما تغيّر منذ 3.13.1 — اقرأ أولًا (يحكم على كل ما بعده)

**الفرع:** `feat/screen-unify-3.13.0` · **آخر التزام:** `fe155e7` · Git محلي (0 remotes)
**الإصدار المثبّت الآن:** 3.13.1 (`versionCode=59`) — **لم يُرفع بعد**.
**25 التزامًا** منذ `646eda9`، **42 ملفًا**، `+4137 / −279`.

### 0.1 الحالة المقيسة الآن (لا تُقدَّر)

| السطح | المرجع | بكسل | بلوكات | حواف | الحد | الحالة |
|---|---|---:|---:|---:|---|---|
| **السيرفر** (غرفة العمليات) | `server-production-light.png` | **9.30%** | **8.48%** | **75.93%** | 2 / 2 / 15 | ❌ |
| **وكيل ويندوز** | `windows-agent-light.png` | **25.33%** | **37.77%** | **77.44%** | 2 / 2 / 15 | ❌ |
| **أندرويد** | `android-light.png` | — | — | — | — | لم يُقس |

**خط الأساس للسيرفر كان 33.49%** ⇒ التحسّن **24.19 نقطة**.
**أول قياس للوكيل كان 99.81%** (داكن مقابل مرجع فاتح = رقم بلا معنى) ⇒ الأساس الحقيقي 26.35% ثم **25.33%**.

### 0.2 الالتزامات — بالترتيب (كل رقم مقيس)

| الالتزام | المحتوى | النتيجة |
|---|---|---|
| `e0926a5` | جرد 443 عنصرًا + أدواته | 443/443 |
| `21f9963` | مكوّنات + هارنس بصري | 10 لقطات |
| `c99b18f` | رموز اللوحة + بوابة `--cr-*` | 28/28 |
| `52431f2` | بوابة الفرق (بكسل) | 33.49% |
| `6f3245d` | شريط الأسطول | 32.21% |
| `11f7df7` | ترويسة ومقاييس مدمجة | 21.95% |
| `26094e4` | إطلاق حدّ 1480px | 20.96% |
| `1aaef14` | ثلاثة مربّعات في الجدار | 17.71% |
| `5a66d17` | جدار بعرض كامل بلا ترويسة | 13.08% |
| `d3172f1` | ثلاث بطاقات + دمج CPU | **9.50%** |
| `32fcf4b` | المرجع الإنتاجي (بلا صفّ الحالات) | 9.29% |
| `ec9771d` | خريطة الحواف بحسب النطاق | — |
| `444f959` | نقل أنماط المرجع برموز `--b-` | — |
| `d4cc8f6` | استيراد `control-room-ref.css` | 9.30% |
| `58b830e` | أداة لقطة الوكيل | 26.35% |
| `fe155e7` | رموز الوكيل المحايدة | **25.33%** |
| 8 التزامات توثيق | تقارير وتسليم | — |

**تسع تجارب قِيست وسُحبت** (كلها موثّقة في `REPORT-PHASE3-BASELINE-AR.md` §15): شبكة عمود واحد 17.70% · عمود+مساعد 23.81% · عرض كامل 22.18% · سطر ترويسة 20.52% · Portal 14.54% · تحويم 14.51% · سطرا الأسطول 13.28% · نسخة أولية 9.33% و14.10% · تمييز الوكيل (mae +1.37).

### 0.3 الأدوات الجديدة (لا تُعَد كتابتها)

| الأداة | الوظيفة |
|---|---|
| `scripts/scan-ui-inventory.cjs` | توليد/فحص الجرد (`--verify` · `--check` · `--baseline`) |
| `scripts/audit-inventory.cjs` | مراجعة مستقلة للجرد (41/41) |
| `scripts/shot-surface.cjs` | لقطة أي مسار بمقاس المرجع + مصادقة من `%APPDATA%\AiRemote\lab-probe.json` |
| `scripts/shot-agent.cjs` | نسخة فاتحة من `renderer` + لقطة `700×900 @2x` |
| `scripts/shot-gallery.cjs` | لقطات `/dev/ui` مع فرض `:hover`/`:focus-visible` |
| `scripts/diff-surface.py` | ثلاثة مقاييس: بكسل · بلوك 64×64 · حواف |
| `scripts/edge-bands.py` | النطاقات الأسوأ (80px) |
| `scripts/probe-layout.cjs` | صناديق/أنماط `.cr-page|.cr-layout|.cr-main|.cr-live-card` |
| `scripts/probe-board.cjs` | شجرة بطاقة الجدار بمقاساتها |
| `scripts/make-production-ref.cjs` | مرجع إنتاجي بلا صفّ المواصفة |
| `/dev/ui` | مسار قياس المكوّنات (خارج التنقّل) |

### 0.4 قرارات جديدة (تُضاف إلى D40–D51)

- **D52:** المرجع البصري الملزم للسيرفر هو **`outputs/verify-2026-11-05/phase3/server-production-light.png`** (نسخة إنتاجية من `design/server.html` بلا صفّ الحالات) — لأن صفّ الحالات **لوحة مواصفة** لا واجهة.
- **D53:** **المحتوى قبل الشكل.** لا يُقبل تعديل تنسيقي قبل مطابقة عدد العناصر ومحتواها للمرجع. كل نجاح مقيس جاء من هذه القاعدة، وكل تراجع من مخالفتها.
- **D54:** **قياس قبل كل التزام:** `shot-*` ← `diff-surface` ← إن كان أسوأ: `git checkout` فورًا. لا التزام بلا «قبل/بعد».
- **D55:** **`vite` يعمل بـ`hmr:false`** ⇒ **أعد تشغيل خادم التطوير قبل كل قياس**، وإلا فالرقم يقيس كودًا قديمًا (حدث مرتين).
- **D56:** رموز المرجع تُنقل **مُنَطَّقة** (`--b-*` داخل `.board`) لأن `:root` في المرجع يعرّف نفس الأسماء بقيم HEX بينما التطبيق يستهلكها ثلاثيات `rgb(var())` — النسخ المباشر يفسد كل الألوان.

### 0.5 فخاخ مثبتة (من أخطاء فعلية هذه الموجة)

1. **`node -e` مع أقواس/اقتباسات عربية يُفسدها PowerShell** ⇒ اكتب السكربت في ملف دائمًا (أهدرت 3 محاولات قبل تنفيذها).
2. **LF على ملف CRLF** ⇒ فرق بآلاف الأسطر. طبّع قبل الالتزام.
3. **`.cr-main { display: contents }`** ⇒ أي تعديل أعمدة خارج الشبكة بلا أثر.
4. **البوّابة الخام تكافئ الفراغ** (خلفية فاتحة ≈ مربّع غائب) ⇒ لا تُقرأ وحدها.
5. **`aspect-video`** يجعل المربّع 548×308 عند العرض الكامل (مطابق للمرجع تقريبًا).
6. **شريط أدوات الجدار** (+/L/M/S) لا وجود له في المرجع؛ أي إزاحة له (نقلًا أو تحويمًا) **زيدت** الفرق 5 نقاط لأنها ترفع/تنزل الإيقاع الرأسي.

---

## 1) بيئة العمل (محدَّثة)

| العنصر | المسار/القيمة |
|---|---|
| المستودع | `D:\autoclaw projects-new\AiRemote` · `feat/screen-unify-3.13.0` · محلي |
| السيرفر | `https://127.0.0.1:3001` · `/health` = 3.13.1 · TLS ذاتي |
| تنفيذي السيرفر | `C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe` |
| تنفيذي الوكيل | `C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe` |
| قاعدة البيانات | `C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db` (قراءة فقط) |
| إعداد الوكيل | `%APPDATA%\airemote-agent-desktop\airemote-config.json` |
| مفاتيح أندرويد | `D:\autoclaw projects\offline-build-tools\android-toolchain` (بعد `projects` مسافة) |
| مفتاح APK | `%APPDATA%\AiRemote\signing\airemote-release.jks` + `keystore-password.txt` (**لا تُطبع**) |
| اعتماد المختبر | `%APPDATA%\AiRemote\lab-probe.json` (**لا يُطبع** — تستخدمه أدوات اللقطات) |
| VMware | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` |
| الضيوف | `E:\VMs\Win10_Pro_Custom\…vmx` · `E:\VMs\Win11_Custom_2026-09-30\…vmx` |

**الأجهزة:** WIN10 `b42175d0-…` · WIN11 `d147684b-…` · Android-Emulator `9b5eeaf9-…` — كلها 3.13.1 · TAB16/TECNO على 3.12.2 (offline).

---

## 2) المستودع — ما تغيّر بالملفات

**لوحة (`packages/dashboard/src`)**
`index.css` (رموز المرجع + 10 رموز هوية) · `control-room.css` (`--cr-*` موصولة + ثلاث كتل: Phase 3 و3e و3g + إطلاق 1480px) · `control-room-ref.css` (**جديد**: 167 قاعدة منقولة برموز `--b-`) · `main.tsx` (استيراد ref) · `App.tsx` (مسار `/dev/ui`) · `pages/UiGalleryPage.tsx` (**جديد**) · `pages/OverviewPage.tsx` (FleetStrip + دمج CPU + ثلاث بطاقات) · `components/FleetStrip.tsx` (**جديد**) · `components/LivePreviewBoard.tsx` (تهيئة 3 مربّعات) · `components/ui/` (`Switch.tsx`, `Table.tsx` جديدان · مقاسات Button/Input/Select/Badge) · `vite.config.ts` (بروكسي `/api` → **https** + `secure:false`).

**وكيل (`packages/agent-desktop/renderer`)**
`style.css` — 14 رمزًا محايدًا/حالة من المرجع في الثيمين (التمييز **لم** يُنقل).

**سيرفر** — لا تغيير.

**أدوات/وثائق** — 11 سكربت قياس + `design/INVENTORY.csv` (443) + `INVENTORY.baseline.json` + `docs/HANDOFF-2026-11-05-PHASE3-AR.md` + 4 تقارير في `outputs/verify-2026-11-05/`.

---

## 3) الحالة الحالية (تُتحقَّق في §7)

- `verify.js` **46/46** · `check-contrast` **28/28** · `audit-screen-surface` PASS · `build` ✓ · `typecheck` نظيف.
- الشجرة نظيفة (عدا `tools/lab/a2a/*` غير المتعقَّبة).
- السيرفر يعمل 3.13.1 ويخدم **اللوحة المثبّتة القديمة** (لم يُعَد بناء `app.asar` بعد تغييرات التصميم).

---

## 4) المتبقي — بالكامل وبالتفصيل

### 4.1 المرحلة 3 — إنهاء الأسطح (الأولوية الأولى)

#### (أ) السيرفر: نقل بنية `.board` — **الخطوة الحاسمة**
**المشكلة المقيسة:** أخطر النطاقات: y≈640 (97.7% حواف) · y≈280 (96.4%) · y≈120 (92.9%) · y≈40 (90.8%). والفرق بنيوي: المرجع جدار بثلاثة مربّعات كبيرة + شريط أدوات داخل المربّع + ترويسة سطر واحد، والتطبيق بنية `cr-*` مختلفة.

**المطلوب حرفيًا:**
1. افتح `design/server.html` واقرأ بنية `.board` (بما فيها `svg defs` وكتلة أنماط القوائم المضمّنة).
2. أنشئ `packages/dashboard/src/components/ControlRoomBody.tsx` يستهلك:
   - من `useDeviceStore`: `devices`, `statsMap`, `loading`, `error`, `fetchDevices`
   - من `OverviewPage`: `activeScreens`, `openLive`
   - ويستعمل **أصناف المرجع**: `.board .board-wrap .topbar .seg-row .fleet .card .wall .tile .tile .screen .bar .chip .state-strip`
   - الأنماط متاحة في `control-room-ref.css` (رموز `--b-*` مُنَطَّقة).
3. استبدل جسم `OverviewPage` به، مع **إبقاء كل المعالجات** (فتح جهاز · تشغيل بث · تبديل حجم · إضافة مربّع · طي الأجهزة · عرض الكل · إعادة المحاولة).
4. **قياس واحد:** `shot-surface` ← `diff-surface` مقابل `server-production-light.png`.
   - الهدف المرحلي: `edgeMissPct < 40` ثم `< 25`، ثم `≤ 2` للثلاثة.
5. إن كان أسوأ: `git checkout` فورًا — لا نقاش.

**تحذير:** لا تنسخ `:root` من المرجع إلى `:root` التطبيق (D56). استخدم الملف المنقول.

#### (ب) وكيل ويندوز: بنية السطح + التمييز
**القياس:** 25.33 / 37.77 / 77.44. المرجع `windows-agent-light.png` (1400×1800 = 700×900 @2x).
1. انقل تبويبات المرجع الأربعة (الحالة · المساعد · الدردشة · السجل) وترتيب أزراره إلى `renderer/index.html` مع **إبقاء كل المعرّفات والمعالجات** الحالية.
2. بعدها فقط: `--blue` → `#0d9488` (فاتح) / `#2dd4bf` (داكن) **مع** `--on-accent` (نص غامق في الداكن، أبيض في الفاتح) لتجاوز 4.5:1.
3. قياس: `node scripts/shot-agent.cjs light` ← `diff-surface` مقابل المرجع.

#### (ج) أندرويد
1. المحاكي عبر `adb` — التقط `390×844` (أو مقاس `android-light.png` = 920×1800 = 460×900 @2x).
2. `python scripts/diff-surface.py shot.png design/android-light.png`.
3. طبّق رموز المرجع على `res/values/colors.xml`/`activity_main.xml` (44px لمس).

### 4.2 المرحلة 4 — باقي الشاشات
- **11 صفحة لوحة:** Devices · Sessions · Settings · Audit · Users · Notifications · Files · Login · Setup · Help · DeviceWorkspace (+ ScreenPopout) — كل واحدة بأصناف المرجع وبمكوّنات المكتبة، ولقطة معتمدة لكل شاشة.
- **4 أنشطة أندرويد:** SessionOffer · SessionWebView · Setup · Wake — أوراق سفلية بأصناف `.touch`.
- **قاعدة:** لا شاشة تُبنى قبل لقطة تصميمها (أو اعتماد صريح من المالك).

### 4.3 المرحلة 5 — كتالوج الرسائل
- 11 حالة AR/EN في: `packages/dashboard/src/lib/i18n.ts` · `packages/agent-desktop/renderer/app.js` (كائن `LANG`) · `packages/android-agent/app/src/main/res/values/strings.xml`.
- اختبار ظهور كل رسالة (لقطة أو DOM) + صفر نص بلا مقابل.

### 4.4 المرحلة 6 — الاختبار الشامل
- الطبقات الست: ثابت (typecheck/build/imports/contrast/audit) · وحدة (`verify.js` ≥46) · e2e · واجهة آلية (كل زر) · بصري (3 مقاييس) · إتاحة/i18n/أداء.
- تقرير نهائي في `outputs/verify-<date>/FINAL-REPORT-AR.md` مع كل رقم ودليله.

### 4.5 الإصدار 3.14.0 — البناء والشحن
1. **رفع الإصدار:** `VERSION` + 4 `package.json` + `versionCode=60` + `releases/manifest.json` ثم `node scripts/check-version-consistency.cjs` = PASS.
2. **السيرفر:** `cd packages\server-desktop; pnpm run build:win:nodownload` ⇒ إيقاف العمليات ⇒ `Setup.exe /S` حتى `exit=0` ⇒ تشغيل ⇒ `/health` = 3.14.0.
3. **الوكيل:** `electron-builder --win --x64` ⇒ نسخ `app.asar` إلى WIN10/WIN11 ⇒ (WIN10: إعادة تشغيل الضيف).
4. **APK:** `gradle --offline -I android-init.gradle assembleDebug` ⇒ `apksigner sign --ks … --ks-key-alias airemote --ks-pass file:…` (**بلا** `--key-pass`) ⇒ `adb install -r -t`.
5. `node scripts/release-manifest.js --verify` = signature OK.
6. البطارية كاملة + لقطات الأسطح الثلاثة + تحديث `CHANGELOG` و`PROJECT_STATE`.

---

## 5) بروتوكول التنفيذ (إلزامي)

1. **قِس أولًا:** `node scripts/probe-layout.cjs` / `probe-board.cjs` قبل أي تعديل بنيوي.
2. **تعديل واحد = التزام واحد** + رقم «قبل/بعد» في الرسالة (إنجليزية).
3. **أعد تشغيل خادم التطوير قبل كل قياس** (D55).
4. **إن كان أسوأ: `git checkout` فورًا** ولا تحاول إنقاذه بتعديل ثانٍ في الجولة نفسها.
5. **لا `node -e`** — سكربت في ملف.
6. **نظّف نهايات الأسطر** قبل الالتزام (CRLF للملفات التي كانت CRLF).
7. **لا PASS بلا دليل** على الطبقة الصحيحة؛ وكل رقم يُكتب مع مسار ملفه.
8. **`design/*.html` للقراءة فقط** (D51) — والمرجع الإنتاجي يُولَّد في `outputs/`.
9. **Git محلي فقط** · لا أسرار في المخرجات · PowerShell 5.1 يقرأ UTF-8 كـANSI ⇒ `-Encoding UTF8` أو Node.

---

## 6) قائمة تحقق الاستئناف (قراءة فقط ثم أعد الجدول)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -5; git status --short; git branch --show-current
curl.exe -sk https://127.0.0.1:3001/health
node scripts/check-version-consistency.cjs
node scripts/audit-screen-surface.cjs --check
node scripts/check-contrast.cjs
node scripts/verify.js
node design/parity-perfile.cjs
node scripts/scan-ui-inventory.cjs --check
node tools\lab\devs.cjs
python scripts/diff-surface.py outputs/verify-2026-11-05/phase3/server-3cards.png outputs/verify-2026-11-05/phase3/server-production-light.png
```

**المتوقع:** `fe155e7` · شجرة نظيفة · `/health` 3.13.1 · توحيد PASS · audit PASS · contrast 28/28 · verify 46/46 · parity 72/72 · inventory PASS · الأجهزة الثلاثة 3.13.1 · السيرفر **9.29–9.30% / 8.30–8.48% / 75.93%**.

---

## 7) مخرجاتك المطلوبة الآن

1. جدول تحقق §6 (متوقع/فعلي/دليل).
2. أي انحراف بسطر الدليل.
3. تأكيد أنك لم تعدّل شيئًا، وأنك تنتظر «ابدأ».
4. **بعد «ابدأ»:** نفّذ §4.1(أ) فورًا — نقل `.board` — والتزم بالبروتوكول §5.

---

## 8) ملحق: لماذا توقفت الجلسة السابقة

لم يتوقف العمل لنقص خطة، بل لأن **كل خطوة متبقية بنيوية** تحتاج دورة قياس كاملة، وتجربةً واحدة فقط في كل مرة. تسع محاولات جزئية جُرّبت وقِيست وسُحبت بأرقامها. القاعدة المستخلصة (D53) هي أهم مخرج من الموجة: **المحتوى قبل الشكل** — ثلاث بطاقات بدل أربع خفّضت البلوكات 41%، وثلاثة مربّعات بدل واحد خفّضت البكسل 4.6 نقطة، بينما ست محاولات تنسيق أخرى زادت الفرق.

**الحد الأدنى المطلوب للوصول إلى ≤ 2%:** نقل بنية `.board` للسيرفر + بنية تبويبات الوكيل + قياس أندرويد — أي §4.1 كاملًا، ثم المرحلة 4 شاشة بشاشة.
