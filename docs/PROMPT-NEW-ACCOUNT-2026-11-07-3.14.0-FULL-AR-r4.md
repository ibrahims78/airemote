# استئناف AiRemote — حساب جديد · 2026-11-07 · الإصدار **3.14.0 المشحون** — نسخة **r4**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-06-3.14.0-FULL-AR-r3.md` وكل ما قبله.**
> كل رقم فيه **مقيس بأمر** في جلسة 2026-11-07، ودليله في `outputs/verify-2026-11-07/`.
> **الفرق الجوهري عن r3:** 3.14.0 لم يبقَ «مصدرًا» — **بُني ووُقّع وثُبِّت**، والبطارية **48/48**، والواجهة المشحونة تحمل D64/D65/D66.

---

## 0) الحالة المقيسة الآن (لا تُقدَّر)

| البند | القيمة |
|---|---|
| الفرع | `feat/screen-unify-3.13.0` |
| آخر التزام | `f57a20c` |
| الالتزامات منذ r3 | **25** |
| نقطة الرجوع | الوسم `pre-ui-w0-2026-11-06` (`71b0985`) |
| السيرفر المثبَّت | **3.14.0** — `curl -k https://127.0.0.1:3001/health` ⇒ `{"version":"3.14.0","tls":true,"port":3001}` |
| البطارية | **48/48 — ALL VERIFICATION STEPS PASSED** |
| نسخة احتياطية قبل التثبيت | `outputs/backup-before-3.14.0-install/` (470 MB: db + wal + secret.key + recordings) |
| رجوع ممكن | `releases/server-windows/AiRemote-Server-Setup-v3.13.1-x64.exe` |

### المقاييس البصرية (لم تتغيّر — والسبب موثَّق)

| السطح | المرجع | diff | block | edge | mae |
|---|---|---:|---:|---:|---:|
| اللوحة | `outputs/.../server-production-light.png` | **4.84** | 7.11 | 61.13 | 4.29 |
| وكيل ويندوز | `design/windows-agent-light.png` | **24.44** | 33.54 | 77.32 | 15.48 |
| أندرويد | `design/android-light.png` | **37.65** | 54.48 | 76.63 | 26.37 |

---

## 1) ما أُنجز — 25 التزامًا

### أ) الإصدار والشحن (الأهم)

| الالتزام | المحتوى |
|---|---|
| `4b0cba4` | `copy-dashboard` + إعادة حزم السيرفر ⇒ `static/` صار واجهة 3.14.0 (علامة `airemote-fleet-hidden-v1` موجودة داخل الحزمة) |
| `bdae010` | `manifest.json` يحمل **5 قطع 3.14.0** (Setup+zip للسيرفر والوكيل + APK) و`--verify` ⇒ `signature OK / all artifacts match` |
| `a7a26ec` | **تثبيت 3.14.0** على الجهاز + البطارية 47/47 |
| `3e0b1bf` | إعادة حزم وتثبيت بعد `message_en` + إخفاء مبدّل المساعدة ⇒ 48/48 |

**الحزم على القرص:** `AiRemote-Server-Setup-v3.14.0-x64.exe` (152MB) · `AiRemote-Server-v3.14.0-Windows-x64.zip` (202MB) · `AiRemote-Agent-Setup-v3.14.0-x64.exe` (73MB) · `AiRemote-Agent-v3.14.0-Windows-x64.zip` (99MB) · `AiRemote-Agent-3.14.0.apk`.

### ب) العيب الحرج في الوكيل

| `15d68ac` | 11 فحص `typeof airemote.X` كان يرمي `ReferenceError` ويوقف بقية `app.js`؛ أُضيف غلاف `Proxy` في أعلى الملف ⇒ `pageErrors 1 → 0`. **ملاحظة:** كل قياسات الوكيل قبل هذا الالتزام كانت على واجهة نصف مهيَّأة. |

### ج) i18n — اللوحة

| الالتزام | المحتوى | الرقم |
|---|---|---|
| `bc69030` | صفحة الملفات + حدّ الخطأ + مكوّنات المكتبة | 9 مفاتيح |
| `dc24016` | الأجهزة · الأسطول · وحدة الأوامر · إطار النافذة · SSH | 18 |
| `3de8636` | **مدير الملفات كاملًا** | 46 |
| `dea0bd5` | بقايا الأسطول + صفوف الملفات | 7 |
| `df417ac` | **وحدة الأوامر** (تسميات الاختيارات صارت مفاتيح) | 25 |
| `0e32198` | **طابور النقل** بخطاف `tr()` لتجنّب تظليل `t` بكائن النقل | 30 |
| `1a803bf` | طرفية PTY مع ألوان ANSI | 10 |
| `faf9fd5` | `/dev/ui` خارج مسارات الإنتاج + `vite-env.d.ts` | — |

**النتيجة:** 456 نصًّا صلبًا في 29 ملفًا ⇒ **324 في 17 ملفًا** (74 منها معرض `/dev/ui` التطويري، والباقي ثنائي سطريًّا أو تعليقات). مفاتيح اللوحة **452 ⇒ 597** (`ar-only=0`).

### د) i18n — وكيل ويندوز

| الالتزام | المحتوى | الرقم |
|---|---|---|
| `b563bdf` | نافذة طلب الاتصال + لوح الجلسات | 6 مفاتيح |
| `407db50` | **القشرة كاملة**: التبويبات · شريط البث · الدردشة · المساعد · شريط السجل · كل التلميحات. وأُضيف لـ`applyLang` مسارا `data-i18n-title` و`data-i18n-ph` | **80 ربطًا · 121 مفتاحًا · صفر ناقص** |

**عيبان مكتشفان:** `ctrlHashNote` و`ctrlAppliesNote` كانا مربوطين في HTML بلا مفتاح ⇒ ظلّا عربيَّين صامتين. أُصلحا.

### هـ) i18n — السيرفر

| `8d6b0ed` | خطّاف `onSend` يضيف **`message_en`** من جدول 55 رسالة، **دون لمس `error`** ⇒ لا كسر لأي عميل. بوابة تغطية: 55/55. |

**إثبات حيّ:** `{"error":"بيانات الدخول غير صحيحة","message_en":"Wrong email or password"}`.

### و) أندرويد

| `331c1bf` | بطاقة الاتصال: أزرار 32⇒**44dp** بأثلاث متساوية · حقل كلمة المرور 37⇒44 · تبويبات 38⇒44 · بدء/إيقاف 38⇒44 · صفر تداخل |
| `f57a20c` | **12 رسالة toast** إلى موارد ar/en (بما فيها رسالة الحفظ التي كانت تُبنى بدمج نصّين) ⇒ 138/138 |

### ز) التنقّل والثيم

| `9b4a933` | الإشعارات/التدقيق/المستخدمون في قائمة التطبيق + إصلاح أمر «سجل الجلسات» الذي كان يهبط إلى تبويب غير موجود |
| `75ace62` | الثيم الافتراضي **فاتح** في اللوحة والوكيل |

### ح) البوابات الجديدة

| `ede4aaa` | `scripts/check-i18n-refs.cjs` — كل `t()`/`data-i18n*` يجب أن يوجد في اللغتين (**637 مرجعًا · صفر معلّق**) ⇒ خطوة 47 |
| `8d6b0ed` | `scripts/check-messages-en.cjs` — 55/55 ⇒ خطوة 48 |
| `112b9d2` | `shot-surface.cjs` يدعم `--lang` ويعدّ الأحرف العربية في `innerText` |

---

## 2) قرارات المالك المنفَّذة في هذه الجلسة

1. **إخفاء مبدّل اللغة في دليل المساعدة** (`e18a9cd`) — الدليل عربي بقرار، والصفحة تُعلن الفجوة بالإنجليزية. ✅
2. **`message_en` إضافي** بدل تغيير عقد `error` (`8d6b0ed`). ✅
3. **دمج بطاقة الحالة في ترويسة الوكيل** (`w10`) — **نُفِّذ ثم سُحب بالقياس**: 24.44 ⇒ **25.95**. لا تُعِد المحاولة بلا قرار جديد.

---

## 3) تجارب فاشلة مقيسة — لا تُعاد

| التجربة | النتيجة | الحكم |
|---|---|---|
| نقل بطاقات الوكيل إلى أعلى السطح | 24.44 ⇒ **25.60** | سُحبت |
| دمج بطاقة الحالة في الترويسة | 24.44 ⇒ **25.95** | سُحبت |

**السبب المقيس:** بطاقة الحالة (66px) + أكورديون «معلومات الجهاز» (34px) يضعان بطاقة التحكم عند `y≈204`، والمرجع يضعها عند `y≈208` — أي أن الترتيب الحالي **يحاذي المرجع عرضًا بالمصادفة**. الفرق في **المحتوى**: المرجع بلا بطاقة حالة، وبلا أكورديونات، وبشارات في الرؤوس، وبكثافة صفوف أعلى.
**الخلاصة:** `≤2%` لا يُبلَغ بأي نقل كتل؛ يحتاج إعادة تصميم محتوى التبويب.

---

## 4) ما تبقّى — بالترتيب

| # | البند | الحالة | معيار القبول |
|---|---|---|---|
| 1 | **وكيل ويندوز ≤5%** | محجوب بقرار: قبول 24.44 كاستثناء موثَّق **أو** إعادة تصميم المحتوى (3–4 أيام) | `shot-agent` + `diff-surface` |
| 2 | **تحديث وكلاء WIN10/WIN11** | المثبّت جاهز؛ التنفيذ داخل الـVM (`vmrun`) | النسخة في الوكيل = 3.14.0 |
| 3 | **الورقة السفلية لأندرويد** (`SessionOffer`) | غير منفَّذة | `BottomSheetDialog` + لقطة |
| 4 | **وسم «غير متاح على أندرويد»** | غير منفَّذ | صفر ميزة بلا تمييز |
| 5 | **الحالات الأربع** في `AiPage`/`Overview`/`Help`/`ScreenPopout` | غير منفَّذة | لقطة لكل حالة |
| 6 | **31 `style={{`** في اللوحة | غير منفَّذة | صفر في `src` |
| 7 | **تدقيق 277 زرًّا** | المغطى 10 مسارات × ≤12 | 277/277 |
| 8 | **`ScreenPopout` بجلسة حيّة** | غير مُتحقَّق | صفر خطأ console |
| 9 | **رسائل سجل الوكيل (148 نصًّا في `app.js`/`ai.js`)** | **مُستحسَن تركها عربية** — قناة تشغيل لا واجهة | — |

---

## 5) فخاخ مثبتة (جديدة — من أخطاء هذه الجلسة)

1. **`Stop-Process -Name 'AiRemote Server'`** يقتل **النسخة المثبَّتة** أيضًا (نفس الاسم) — استخدم `Where-Object { $_.Path -like '*Programs\AiRemote Server*' }`.
2. **CRLF:** أي `str.replace` على ملفات المشروع يفشل صامتًا. اقرأ بـ`newline=""`، طبّع إلى `\n`، عدّل، ثم أعد `\r\n` عند الكتابة. و`Set-Content -Encoding UTF8` في PS 5.1 يضيف **BOM** فيكسر `node` (خصوصًا مع `#!`).
3. **PowerShell يفسد الاقتباسات والعربية** في `python -c`/`node -e` — اكتب سكربتًا في ملف دائمًا.
4. **`typeof airemote.x`** يرمي `ReferenceError` إذا كان `airemote` غير معرَّف؛ الصحيح `typeof window.airemote !== 'undefined' && typeof window.airemote.x === 'function'`.
5. **مفاتيح مكرّرة:** قبل إدراج مفتاح i18n تحقّق أنه غير موجود (مثال: `sessRefresh` كان موجودًا ⇒ تكرار).
6. **`check-messages` يقيس المفاتيح لا المراجع** — لذلك أُضيفت `check-i18n-refs`.
7. **`shot-surface` يزرع `lang:'ar'`** افتراضيًّا؛ استخدم `--lang en`، ولخادم TLS أضف `NODE_TLS_REJECT_UNAUTHORIZED=0` (الأداة تمرّر `--ignore-certificate-errors` الآن).
8. **وكلاء المهام (subagents) لا يستطيعون الوصول إلى `D:\autoclaw projects-new\AiRemote`** — مساحة عملهم محصورة؛ نفّذ مباشرةً.

---

## 6) أوامر جاهزة

```powershell
cd 'D:\autoclaw projects-new\AiRemote'

# البطارية (48 خطوة)
node scripts/verify.js

# البوابات المنفردة
node scripts/check-i18n-refs.cjs        # 637 مرجعًا
node scripts/check-messages-en.cjs      # 55/55
node scripts/check-messages.cjs         # 597/121/138

# السطح الحيّ
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
node scripts/shot-surface.cjs --route /devices --lang en --width 1700 --height 980 --scale 1 `
  --theme light --base https://127.0.0.1:3001 --out out.png

# وكيل ويندوز
node scripts/shot-agent.cjs light
python scripts/diff-surface.py outputs/verify-2026-11-05/phase3/agent-light.png design/windows-agent-light.png
node outputs/verify-2026-11-07/w1-agent/probe.cjs outputs/verify-2026-11-05/phase3/agent-light/index.html out.json --theme light

# أندرويد
$env:JAVA_HOME='D:\autoclaw projects\offline-build-tools\android-toolchain\jdk'
cd packages\android-agent; gradle.bat --offline --no-daemon assembleDebug
apksigner.bat sign --ks ..\..\secrets\airemote-release.jks --ks-key-alias airemote `
  --ks-pass file:..\..\secrets\keystore-password.txt --out ..\..\signed.apk `
  app\build\outputs\apk\debug\app-debug.apk
adb -s emulator-5554 install -r -t ..\..\signed.apk

# إعادة الإصدار
node packages\server-desktop\scripts\bundle.js
node packages\server-desktop\scripts\copy-dashboard.js
cd packages\server-desktop; npx electron-builder --win --x64
cd ..\..; node scripts\release-manifest.js          # ثم --verify
```

**تثبيت السيرفر (بعد بناء الحزمة):** أوقف العملية بالمسار (لا بالاسم) → `Setup.exe /S` → شغّل `AiRemote Server.exe` → `curl -k /health` يجب أن يعيد 3.14.0. النسخة الاحتياطية موجودة، والرجوع بـ`AiRemote-Server-Setup-v3.13.1-x64.exe`.

---

## 7) بروتوكول التنفيذ (لم يتغيّر)

1. قِس أولًا (`shot-surface` / `shot-agent` / `uiautomator`).
2. تعديل واحد = التزام واحد برسالة إنجليزية تحمل الرقمين.
3. إن ساء الرقم: `git checkout` فورًا — بلا محاولة إنقاذ.
4. الدليل في `outputs/verify-YYYY-MM-DD/`.
5. `design/*.html` للقراءة فقط · Git محلي · لا أسرار في المخرجات.
6. **لا تلمس عقد API** بلا قرار مالك · **لا تغيّر تصميم سطح** بلا قرار مالك.

---

## 8) خريطة الملفات الجديدة من هذه الجلسة

| الملف | الدور |
|---|---|
| `packages/server-desktop/lib/messages-en.js` | 55 رسالة عربية → إنجليزية (يستهلكها `onSend`) |
| `scripts/check-i18n-refs.cjs` | بوابة الخطوة 47 |
| `scripts/check-messages-en.cjs` | بوابة الخطوة 48 |
| `scripts/shot-surface.cjs` | أُضيف `--lang` و`--ignore-certificate-errors` وعدّاد `arabic` |
| `docs/EXEC-W0-W2-REPORT-2026-11-07-AR.md` | تقرير التنفيذ الكامل |
| `outputs/verify-2026-11-07/{w0-agent,w1-android,w2-i18n,w3-release,en}` | كل الأدلة |
