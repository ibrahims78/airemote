# استئناف AiRemote — 2026-11-07 · الإصدار **3.14.2** — نسخة **r7**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-07-3.14.1-FULL-AR-r6.md` وكل ما قبله.**
> كل رقم هنا مقيس بأمر في جلسة 2026-11-07، ودليله في `outputs/verify-2026-11-07/`.
> **الفرق الجوهري عن r6:** أُصدر **3.14.2** فعليًا — خمس قطع مبنية وموقّعة ومثبَّتة — وأُغلقت
> الأسماء الثمانية وملء الشاشة، وصارت بوابة التوحيد تقرأ المصدرين الذين انزلقا (`APP_VERSION` والاحتياطي).

---

## 0) الحالة المقيسة الآن

| البند | القيمة |
|---|---|
| الفرع | `feat/screen-unify-3.13.0` |
| `VERSION` | **3.14.2** — أربعة `package.json` + `APP_VERSION` + `versionCode 62` |
| السيرفر المثبَّت | **3.14.2** · `{"version":"3.14.2","tls":true,"port":3001}` · يخدم `index-DhvbJB7h.js` |
| الوكيل المثبَّت | **3.14.2** · يعرض `v3.14.2` في الواجهة |
| WIN11-VM (جهاز ثانٍ) | **3.14.2** · `online` · `info.agentVersion=3.14.2` · app.asar 12:28 · واجهة حيّة بلقطة |
| WIN10-VM (ثالث) | **3.14.2** · `online` · `info.agentVersion=3.14.2` · app.asar 12:28 · واجهة حيّة بلقطة |
| الأسطول | المضيف + WIN10 + WIN11 + محاكي أندرويد + TECNO — **كلهم 3.14.2** |
| APK | `releases/AiRemote-Agent-3.14.2.apk` · `versionCode 62` · `CN=AiRemote Agent` · مثبَّت على المحاكي |
| البطارية | **52/52 — ALL VERIFICATION STEPS PASSED** |
| البيان | `signature OK` · `all artifacts match` |
| أنماط اللوحة | 14 كائنًا · **0 ثابت** |
| أزرار الوكيل | **50/50 نُقرت · 0 استثناء · 0 بلا اسم** (التبويبات الأربعة) |
| أندرويد | 19 عنصرًا (الحالة الافتراضية) · **18 نُقرت · 0 انهيار · 0 خروج** · وعلى جهازين (emulator-5554 و127.0.0.1:5555): 16 عنصرًا · 14 نقرة · 0 انهيار لكل منهما |
| `/view` حيّ | canvas 9216/9216 · 36 رسالة WS · **0 استثناء · 0 خطأ console** · إطارات متغيّرة |

### الأسطح على 3.14.2 — لا يتحرّك بكسل

| السطح | المرجع | diff | block | edge | mae | الحالة |
|---|---|---:|---:|---:|---:|---|
| اللوحة | `design/server-light.png` | 6.86 | 9.2 | 66.66 | 5.27 | مطابق لـ3.14.1 حرفيًا |
| وكيل ويندوز | `design/windows-agent-light.png` | **24.44** | 33.54 | 77.32 | 15.48 | مطابق، مقبول بقرار المالك |
| أندرويد | `design/android-light.png` | 37.65 (r5) | 54.48 | 76.63 | 26.37 | لا تغيير في الكود |

**دليل أندرويد بلا إعادة قياس بصرية:** `classes3.dex` بين 3.14.1 و3.14.2 يحمل نفس المحتوى إلا خمس سلاسل إصدار (3.14.1 ← 3.14.2، فرق 4 بايتات)، و14 من 15 ملف dex/res متطابقة — أي أن الواجهة لم تُلمس ويبقى رقم r5 ساريًا. الدليل الكامل: `w22-surfaces/`.

### القطع الخمس (3.14.2)

| القطعة | الحجم | التحقق |
|---|---|---|
| `server-windows/AiRemote-Server-Setup-v3.14.2-x64.exe` | 152MB | مثبَّت · `/health` 3.14.2 |
| `server-windows/AiRemote-Server-v3.14.2-Windows-x64.zip` | 202.3MB | محفوظ في البيان |
| `agent-windows/AiRemote-Agent-Setup-v3.14.2-x64.exe` | 72.9MB | مثبَّت · `v3.14.2` |
| `agent-windows/AiRemote-Agent-v3.14.2-Windows-x64.zip` | 99.2MB | محفوظ في البيان |
| `AiRemote-Agent-3.14.2.apk` | 238KB | `versionCode 62` · موقّع · مثبَّت |

---

## 1) ما أُغلق (ملخّص r6 + هذه الجلسة)

| البند | الرقم |
|---|---|
| أنماط اللوحة المضمّنة | 30 ← **14 · 0 ثابت** · قبل/بعد **0.0213%** · بوابة الخطوة 51 |
| الحالات الأربع | مكتملة على الأسطح الستة (Sessions/Users/Settings أُصلحت) · 10 لقطات |
| أزرار الوكيل | 61 ظاهرًا (بناء) / 68 (حزمة) · **50/50 نُقرت · 0 استثناء** |
| أسماء الأزرار | 8 ← **0** على التبويبات الأربعة · بوابة الخطوة 52 |
| `requestFullscreen` | استثناء 1 ← **0** · الإطارات تتحرك (5 بصمات) |
| أندرويد | 19 عنصرًا · 18 نُقرت · **0 انهيار** · APK 3.14.2: `SessionOfferActivity exported=false` |
| الإصدار | 3.14.1 بلا رقم جديد ← **3.14.2** مع خمس قطع مثبَّتة |

---

## 2) الفخاخ المثبتة (محدَّثة)

1. **السيرفر المثبَّت يخدم `app.asar`**، لا `packages/server-desktop/static`. أي تعديل لوحة لا يظهر قبل إعادة بناء الحزمة وتثبيتها.
2. **Vite dev لا ينقل WS إلى 3001** (الهدف `ws://` والسيرفر TLS) ⇒ لقياس بثّ حيّ شغّل سيرفر المستودع على 3001.
3. **قفل النسخة الواحدة في الوكيل**: أي `AiRemote Agent` متبقٍّ يجعل المسبار ينتظر CDP بلا نهاية — اقتله قبل كل تشغيل.
4. **إعادة تحميل الصفحة تعيد لغة الوكيل** ⇒ عنونة الأزرار بالفهرس لا بالمسمّى.
5. **`labelAt` يجب أن يفضّل `aria-label`/`title` على `textContent` الأبيض** — وإلا بدت أزرار أيقونية مُسمّاة كأنها بلا اسم (أعطى 13 وهمًا ثم 8 حقيقية).
6. **`leftApp` في تدقيق أندرويد**: قائمة الـSpinner تُسمّى `PopupWindow:…` بلا اسم الحزمة ⇒ كانت تُحسب «خروجًا عن التطبيق». صحّحها بـ`includes('PopupWindow')`. والعناصر تتغيّر مع حالة السطح (16–19) فابدأ بـ`am force-stop`.
6. **`requestFullscreen` بلا إيماءة يرفض** ويظهر كـ`Permissions check failed` — التقط الوعد.
7. **`APP_VERSION` في اللوحة كان 3.9.1** منذ عدّة إصدارات، وبوابة التوحيد لا تقرأه. الآن تُقرأ هي واحتياطيّ واجهة الوكيل.
8. **`versionCode` لا يتبع `VERSION`** — يزيد يدويًا (61 ← 62).
9. **`apksigner` يحتاج `JAVA_HOME` في كل صدفة** (كل `exec` صدفة جديدة).
10. **مثبِّت NSIS يمسح مجلد التثبيت لحظيًا** ثم يعيده؛ لا تحكم بالفشل من `Start-Process` فوري — انتظر ثم تحقق من الملف.
11. **كشف انهيار أندرويد يُصفّى بالحزمة**: المحاكي نفسه يُسقط `com.ldmnq.launcher3`.
12. **`shot-surface` هو المقياس القانوني** (1700×980 @2×)، و`shot-dashboard` (1416×845) للقطات الحالات فقط.

---

## 3) الأدوات

| الأداة | الدور |
|---|---|
| `scripts/check-inline-styles.cjs` | **خطوة 51** — أي `style={{}}` حرفي يفشل |
| `scripts/check-agent-a11y.cjs` | **خطوة 52** — أي زر بلا نص/اسم يفشل |
| `scripts/probe-agent-live.cjs --audit` | تدقيق أزرار الوكيل بإعادة تحميل لكل نقرة |
| `scripts/android-audit.cjs` | نقر كل عنصر + `logcat` مصفّى + لقطة |
| `scripts/probe-view.cjs` | `/view` حيّ: عدّاد WS، بصمة كامل الإطار، استثناءات، لقطة |

---

## 4) ما تبقّى

| # | البند | معيار القبول |
|---|---|---|
| 1 | **رسائل سجل الوكيل (148 نصًّا)** | مُستحسَن تركها عربية — قناة تشغيل |
| 2 | **أندرويد: عدد العناصر يتغيّر مع حالة السطح** (16–19 حسب التبويب/الإعدادات المفتوحة) | لقطة الحالة الافتراضية محفوظة؛ التدقيق يبدأ بـforce-stop ويعيد النشاط بين النقرات |
| 3 | **click-audit داخل WIN11-VM** | لا Node في الضيف، وCDP مربوط على 127.0.0.1؛ تحقّقنا بالنسخة + online + لقطة، بلا رفع صلاحيات |
| 4 | **رسائل الترجمة في اللوحة (608)** | لا عمل — تغطية كاملة ar/en |

---

## 5) أوامر جاهزة

```powershell
cd 'D:\autoclaw projects-new\AiRemote'

node scripts/verify.js                     # 52/52
node scripts/check-version-consistency.cjs # كل المصادر 3.14.2
node scripts/check-inline-styles.cjs       # 14/0
node scripts/check-agent-a11y.cjs          # 0 بلا اسم
node scripts/release-manifest.js --verify   # signature OK

# اللوحة
cd packages\dashboard; .\node_modules\.bin\tsc.cmd; .\node_modules\.bin\vite.cmd build
cd ..\server-desktop; node scripts\copy-dashboard.js; node scripts\bundle.js

# الحزم
cd packages\server-desktop; .\node_modules\.bin\electron-builder.cmd --win --x64
cd ..\agent-desktop;        .\node_modules\.bin\electron-builder.cmd --win --x64

# APK (JAVA_HOME مطلوب لكل صدفة)
$env:JAVA_HOME='D:\autoclaw projects\offline-build-tools\android-toolchain\jdk'
cd packages\android-agent
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\gradle\bin\gradle.bat' --offline --no-daemon assembleDebug
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\build-tools\34.0.0\apksigner.bat' sign --ks ..\..\secrets\airemote-release.jks --ks-key-alias airemote --ks-pass file:..\..\secrets\keystore-password.txt --out ..\..\releases\AiRemote-Agent-3.14.2.apk app\build\outputs\apk\debug\app-debug.apk

# التثبيت (أوقف بالمسار لا بالاسم)
Get-Process 'AiRemote Server' | Where-Object { $_.Path -like '*Programs\AiRemote Server*' } | Stop-Process -Force
& 'releases\server-windows\AiRemote-Server-Setup-v3.14.2-x64.exe' /S
Start-Process 'C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe'
curl.exe -k -s https://127.0.0.1:3001/health

# المسابر
node scripts\probe-agent-live.cjs out --exe "C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe" --audit
node scripts\probe-view.cjs b42175d0-d0c9-428d-ab94-4e66dff56af3 out.json --base https://127.0.0.1:3001 --move
node scripts\android-audit.cjs out.json
```

---

## 6) بروتوكول التنفيذ

1. قِس أولًا. 2. تعديل واحد = التزام واحد برسالة إنجليزية تحمل الرقمين. 3. إن ساء الرقم: `git checkout` فورًا. 4. الدليل في `outputs/verify-YYYY-MM-DD/`. 5. `design/*.html` للقراءة فقط · Git محلي · لا أسرار في المخرجات. 6. **لا تلمس عقد API** ولا تصميم سطح بلا قرار مالك. 7. **أي تغيير في محتوى الحزم يرفع الرقم** — لا تعِد بناء 3.14.2 باسم 3.14.1.

---

## 7) خريطة ملفات هذه الجلسة

| الملف | الدور |
|---|---|
| `CHANGELOG.md` | قسم 3.14.2 |
| `docs/INLINE-STYLES-2026-11-07-AR.md` | جدول الـ14 التشغيلية |
| `docs/SESSION-2026-11-07-W13-W17-AR.md` | تقرير الجلسة + قسم الإغلاق |
| `outputs/verify-2026-11-07/w13-inline/` | canon-before/after + diff |
| `w14-states/` | 10 لقطات حالات |
| `w15-agent-audit/` · `w19-agent-audit-shipped/` | تدقيق 3.14.1 |
| `w18-a11y/` | 8 ← 0 |
| `w20-3142/` | نسخة الوكيل 3.14.2 + 0 بلا اسم |
| `w21-3142-audit/` | 50/50 نقرة · 18/19 أندرويد (جهازان) · بثّ حيّ · لقطة WIN11-VM |
| `w17-view-live/` | البثّ الحيّ ودليل الإطارات |
