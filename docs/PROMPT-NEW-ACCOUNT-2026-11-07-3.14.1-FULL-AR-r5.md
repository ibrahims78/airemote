# استئناف AiRemote — حساب جديد · 2026-11-07 · الإصدار **3.14.1** — نسخة **r5**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-07-3.14.0-FULL-AR-r4.md` وكل ما قبله.**
> كل رقم هنا **مقيس بأمر** في جلسة 2026-11-07، ودليله في `outputs/verify-2026-11-07/`.
> **الفرق الجوهري عن r4:** واجهة الوكيل كانت **ميتة تمامًا** وأُصلحت، وأُضيف مفتاح «التشغيل مع ويندوز»،
> وشُحن **3.14.1** بخمس حزم، وأُنجزت الحالات الأربع، ودُقّق 262 زرًّا، وأُصلحت a11y الوكيل.

---

## 0) الحالة المقيسة الآن (لا تُقدَّر)

| البند | القيمة |
|---|---|
| الفرع | `feat/screen-unify-3.13.0` |
| آخر التزام | `5f9dde7` |
| الالتزامات منذ r4 (`7aef335`) | **12** |
| `VERSION` | **3.14.1** (ينسخ إلى `package.json` ×4 + Android `versionCode 61`) |
| السيرفر المثبَّت | **3.14.1** — `curl -k https://127.0.0.1:3001/health` ⇒ `{"version":"3.14.1","tls":true,"port":3001}` |
| البطارية | **50/50 — ALL VERIFICATION STEPS PASSED** (`outputs/verify-2026-11-07/w12-handoff/verify-final.log`) |
| WIN10 / WIN11 | **3.14.1** · 5 عمليات · «متصل» في الشريط |
| APK | `releases/AiRemote-Agent-3.14.1.apk` · `versionCode 61` · موقّع `CN=AiRemote Agent` |
| `manifest.json` | **58 قطعة** · `signature OK` · `all artifacts match` |
| الحزم الخمس | Server Setup 152MB · Server zip 202MB · Agent Setup 73MB · Agent zip 99MB · APK 238KB |

### المقاييس البصرية (لم تتغيّر — الإصلاحات لا تمسّ الشكل)

| السطح | المرجع | diff | block | edge | mae |
|---|---|---:|---:|---:|---:|
| اللوحة | `design/server-light.png` | **4.84** | 7.11 | 61.13 | 4.29 |
| وكيل ويندوز | `design/windows-agent-light.png` | **24.44** | 33.54 | 77.32 | 15.48 |
| أندرويد | `design/android-light.png` | **37.65** | 54.48 | 76.63 | 26.37 |

> القياس البصري يجري في Chrome بلا preload، ولذلك ظلّ نظيفًا حتى عندما كانت واجهة الوكيل ميتة داخل Electron.

---

## 1) العيب الحرج الذي حُلّ أولًا (اقرأه قبل أي شيء)

**3.14.0 شحنت واجهة وكيل ميتة.** `app.js` لم يكن يُحلَّل أصلًا داخل Electron:

```
Uncaught SyntaxError: Identifier 'airemote' has already been declared   (app.js:1:1)
```

`preload.js` يضع `airemote` خاصية عالمية غير قابلة للحذف عبر `contextBridge`، و`app.js` كان يعلن
`const airemote` في أعلى الملف ⇒ فشل الملف كله في التحليل ⇒ لا مستمع واحد ولا تنفيذ سطر واحد:
البطاقة على «متوقف»، حقول الاتصال «—»، والإعدادات لا تفتح — بينما `main.js` يحفظ الوكيل متصلًا.

**الإصلاح (`59f3d45`):** `const bridge` + 26 موضع نداء. النتيجة المقيسة على نافذة Electron حقيقية:
`exceptions 1 → 0` · `stopped → متصل` · `inf-server — → 127.0.0.1` · `inf-devid — → probe-device-0001`
· الإعدادات تفتح · التبويبات 4/4.

**لماذا لم يكتشفه المسبار القديم؟** `probe.cjs` يفتح `index.html` كملف في Chrome: بلا preload ⇒ بلا تعارض.
الحلّ الدائم: `scripts/probe-agent-live.cjs` يشغّل النافذة الحقيقية عبر CDP، وبوابة `check-bridge-shadow.cjs`.

---

## 2) ما أُنجز — 12 التزامًا منذ r4

| الالتزام | المحتوى | الرقم المقيس |
|---|---|---|
| `59f3d45` | إصلاح `const airemote` → `bridge` | استثناءات 1→0 · حالة stopped→متصل · تبويبات 0/4→4/4 |
| `1bac0af` | مسبار النافذة الحيّة + نشر الإصلاح للضيفين | exceptions 0 على الحزمة المبنية |
| `83044c5` | **مفتاح «التشغيل مع ويندوز»** (وكيل + سيرفر) + إصدار 3.14.1 | `openAtLogin false→true→false` · 5 حزم · manifest 58 |
| `0ec61b3` | **الحالات الأربع** للأسطح الناقصة | Overview تحميل+فارغ · AiPage تحميل+خطأ · ScreenPopout 3 · Help خطأ |
| `0e1fe36` | تحقّق مدخلات الدخول + تشخيص SQL + سبب إبطاء التشخيص | 200 صحيح · 400 للمشوّه (`field=email`) |
| `2bd5260` | إعادة بناء وتثبيت السيرفر + إعادة توقيع البيان | `/health` 3.14.1 · manifest 58 |
| `82bf20b` | `/view` مسار صريح + إزالة رسالة فراغ مكرّرة | لقطات 5 حالات · 0 استثناءات |
| `fadc739` | **أندرويد: ورقة سفلية + وسم الميزات** | لقطتان على المحاكي · `exported=false` في APK |
| `b97275a` | **تدقيق الأزرار** (10 مسارات) | 262 زرًّا · 237 نُقرت · **0 استثناء** |
| `9217226` | **a11y الوكيل**: 0 زر بلا اسم | `noName 6 → 0` من 29 زرًّا |
| `51cc37b` | مزامنة `static` مع `dist` | — |
| `5f9dde7` | `--eval` في مسبار الوكيل | — |

### أ) مفتاح «التشغيل عند إقلاع ويندوز» (3.14.1)

مفتاح مستقل عن `autoStart` (الذي يعني «اتصل عند فتح البرنامج» فقط):

| الطبقة | التفصيل |
|---|---|
| التخزين | `runAtStartup` في `airemote-config.json`؛ `null` = اتبع `autoStart` (ترقية آمنة) |
| التسجيل | `app.setLoginItemSettings({ openAtLogin, path: process.execPath, args: ['--autostart'] })` ⇒ `HKCU\…\Run\io.airemote.agent` |
| الحقيقة | تُقرأ من النظام (`getLoginItemSettings`) لا من الإعداد |
| عند الإقلاع | `--autostart` يُبقي النافذة في الصينية |
| واجهة الوكيل | صفّ «بدء الوكيل مع إقلاع ويندوز» + `startup-state` push |
| السيرفر | `POST /api/devices/:id/startup {enabled}` ⇒ `server:set_startup` ⇒ `agent:startup_state`، والحالة في `GET /api/devices` وزرّ في صفّ الجهاز |

مقيس على الحزمة المبنية: `{supported:true, packaged:true, openAtLogin:false}` → بعد `setStartup(true)`
`{openAtLogin:true}` وقيمة السجل `"…\AiRemote Agent.exe --autostart"` → بعد `false` حُذفت القيمة.

### ب) الحالات الأربع (PLAN §2.2/5)

| السطح | كان | صار |
|---|---|---|
| Overview (`ControlRoomBody`) | `loading` يُمرَّر ولا يُقرأ · بلا فارغ | تحميل + فارغ («لا أجهزة بعد» + «إضافة جهاز») |
| AiPage | فارغ فقط | + تحميل (هياكل) + خطأ (تنبيه + إعادة محاولة) |
| ScreenPopout | `return null` عند غياب المعرّف | تحميل + فارغ + خطأ + طبيعي عبر `StateSurface` |
| HelpPage | فارغ بحث فقط | + خطأ تحميل الدليل |

`components/ui/StateSurface.tsx` جديد · مسار `/view` صريح (6.30 لا يطابق `/view` مقابل `:deviceId?`).

### ج) أندرويد (PLAN §2.1 + §4)

- `SessionOfferActivity` صار **Dialog مثبت أسفل الشاشة**: مقبض، عنوان + ✕، رسالة، زرّان 46dp؛ ونصوصه من `values/` و`values-en/` بدل العربية في Java.
- بطاقة **وسم «أندرويد»** في الشاشة الرئيسية تنصّ: «الطرفية والأوامر والإيقاظ (WOL) غير متاحة على أندرويد — تُنفَّذ من وكيل ويندوز».
- APK أعيد بناؤه وتوقيعه والتحقق بـ`aapt2` أن `SessionOfferActivity` … `exported="false"`.

### د) تدقيق الأزرار (PLAN §5) — `scripts/audit-buttons.cjs`

| المقياس | القيمة |
|---|---|
| أزرار ظاهرة (10 مسارات) | **262** |
| نُقرت | **237** |
| تفاعلت | 164 |
| **رمت استثناءً** | **0** |
| بلا تفاعل داخل الصفحة | 47 (13 نافذة جديدة · 23 فهرس مساعدة · 5 تبويب نشط · CSV · مرشّح نشط · شعار · ترقيم) |
| مستثناة تدميرية | 25 |
| **الوكيل** | 29 زرًّا ظاهرًا · **0 بلا اسم** (بعد `9217226`) |

التفصيل: `outputs/verify-2026-11-07/w11-audit/SUMMARY-AR.md` + `dashboard.json`.

---

## 3) البوابات والأدوات الجديدة

| الأداة | الدور |
|---|---|
| `scripts/check-bridge-shadow.cjs` | **خطوة 49** — أي إعلان أعلى `renderer/*.js` يطابق اسمًا يُصدّره preload. مُثبتة العضّ. |
| `scripts/check-dom-ids.cjs` | **خطوة 50** — كل `$('id')` له عنصر (107 مراجع · 0 ناقص). |
| `scripts/probe-agent-live.cjs` | مسبار النافذة الحقيقية: `--exe` · `--pure` · `--dom` · `--eval` · `--resize`. |
| `scripts/audit-buttons.cjs` | تدقيق الأزرار (جلسة حقيقية، يستثني التدميري). |
| `scripts/check-artifacts.cjs` (tools) | يقرأ نسخة/محتوى `app.asar` داخل الحزم المبنية. |
| `scripts/shot-dashboard.cjs` (tools) | دخول + لقطة مسار + حقن أعطال: `--fail-api` · `--delay-api` · `--stub-api`. |
| `tools/lab/session/fake-server.cjs` | خادم بديل يفهم `agent:register ⇒ server:registered` (بلا قاعدة بيانات). |
| `tools/lab/session/swap-3140-ui.ps1` · `deploy-agent-ui.cjs` | تبديل `app.asar` في الضيفين مع نسخة احتياطية. |
| `tools/lab/session/agent-shot.ps1` · `agent-version.ps1` | لقطة نافذة الضيف + قراءة نسخة `app.asar` بلا node. |
| `tools/lab/session/reset-lab-password.cjs` · `db-users.cjs` | حساب المختبر (انظر §5) + قراءة جدول المستخدمين. |

**البطارية الآن 50 خطوة** (كانت 48).

---

## 4) الفخاخ المثبتة (جديدة — من هذه الجلسة)

1. **`packages/server-desktop/main.js` يشغّل `./server.bundle`، لا `server.js`.** أي تعديل على المصدر **لا يظهر** قبل `node scripts/bundle.js`. أضاع هذا ساعات في تشخيص الدخول.
2. **`better-sqlite3` مبني لـABI 119 والسيرفر يعمل على Electron 44 (ABI 149)** ⇒ `lib/db-adapter.js` ينتقل صامتًا إلى `node:sqlite`. الرسائل تصبح غامضة («Unknown named parameter 'value'»). المحوّل صار يطبع العبارة الفاشلة (`[db] … FAILED`).
3. **PowerShell يفسد بناء JSON**: `@{ email=$c[0] } | ConvertTo-Json` مع `$c` من `Get-Content` أنتج **كائنات ملف** بدل نص ⇒ جسم طلب مشوّه ⇒ 500 وهمي. ابنِ الأجسام بـ`node -e` و`fs`.
4. **`adb exec-out screencap -p > file.png` في PS 5.1 يكتب UTF‑16/BOM** فيُفسد الصورة. استخدم `adb shell screencap -p /sdcard/x.png` ثم `adb pull`.
5. **`adb install` يرفض حزمة بمفتاح مختلف** (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) ⇒ وقّع APK الـdebug بمفتاح الإصدار قبل التثبيت.
6. **`am start` لا يعمل على نشاط `exported="false"`** ⇒ للتصوير: صدّر مؤقتًا، صوّر، **أعد البناء من بيان `false`** وتحقّق بـ`aapt2 xmltree`.
7. **لا Material في أندرويد** (لا `BottomSheetDialog`) ⇒ الورقة السفلية = `Dialog` + `gravity=BOTTOM` + `MATCH_PARENT`.
8. **`Activity.setTurnScreenOn`** وليس `setTurnOnScreen`.
9. **React Router 6.30 لم يطابق `/view` مقابل `/view/:deviceId?`** ⇒ أضف مسارًا صريحًا.
10. **تدقيق الأزرار لا يعتمد على الفهرس ولا على المسمّى وحده**: البطاقات تُبنى من قائمة غير متزامنة و«تكبير» يتكرّر 3×. الحل: جلسة واحدة لكل مسار + مفتاح `label|title#ordinal` + Escape بين النقرات.
11. **`applyLang` لا يحتوي `t()`**: استخدم `LANG[lang][key]`. استُخدم `t()` بالخطأ فرمى استثناءً كان سيكسر تبديل اللغة كلها (أُمسك بالمسبار قبل الشحن).
12. **`copy-dashboard` واجب قبل كل حزم**: `static/` لا يتحدّث تلقائيًا من `dist/`، و`pnpm --filter … build` قد يحاول `install` ويفشل — شغّل `tsc` ثم `vite` من `packages/dashboard/node_modules/.bin`.
13. **`Stop-Process -Name 'AiRemote Server'`** يقتل النسخة المثبّتة وغيرها؛ استخدم `Where-Object { $_.Path -like '*Programs\AiRemote Server*' }`.
14. **أدوات المختبر تُنشئ نوافذ PowerShell ظاهرة في الضيف** — لا تخلطها بنوافذ الوكيل عند فحص «لماذا PowerShell؟».
15. **وكلاء المهام (subagents) لا يصلون إلى `D:\autoclaw projects-new\AiRemote`** — نفّذ مباشرةً.
16. ملفات الأدوات (write/edit) **لا تعمل خارج مجلد العمل** — اكتب في مساحة العمل ثم `Copy-Item` إلى المستودع، أو استخدم سكربت Node للرقعة.

---

## 5) الدخول إلى اللوحة (حساب المختبر)

بيانات `lab-credentials.txt` القديمة لم تعد تطابق أي حساب. أُنشئ/أُعيد ضبط **حساب مختبر فقط**:

```
الحساب: lab-probe@local        (admin)
كلمة المرور: C:\Users\admin\AppData\Local\Temp\airemote-lab-probe.txt
إعادة الضبط: set ELECTRON_RUN_AS_NODE=1 && packages\agent-desktop\node_modules\electron\dist\electron.exe tools\lab\session\reset-lab-password.cjs
```

حسابا المالك (`admin@airemote.local`, `admin@airemote.io`) **لم يُلمسا**. قاعدة البيانات:
`%APPDATA%\AiRemote-Server\airemote.db` (23MB، تُقرأ بـ`better-sqlite3` تحت Electron 28 فقط).

**ملاحظة:** الدخول يعمل (200). الجسم غير النصّي يردّ الآن **400 مع `field`** بدل 500 من السواقة.

---

## 6) ما تبقّى — بالترتيب

| # | البند | الحالة | معيار القبول |
|---|---|---|---|
| 1 | **وكيل ويندوز ≤5%** | محجوب بقرار المالك: قبول 24.44 موثَّقًا **أو** إعادة تصميم المحتوى (3–4 أيام) | `shot-agent` + `diff-surface` |
| 2 | **31 `style={{` في اللوحة** | **30 الآن** (حُذف واحد في `ControlRoomBody`) — غير مكتمل | صفر أنماط مضمّنة ثابتة، وتوثيق الـ19 ذات القيم التشغيلية (تكبير/نسبة/لون) |
| 3 | **`ScreenPopout` بجلسة حيّة** | الحالات الثلاث مثبتة، البث الحقيقي لا | صفر خطأ console + إطارات متحركة |
| 4 | **تدقيق أندرويد (8 عناصر)** | غير منفَّذ | `uiautomator dump` + نقر فعلي |
| 5 | **تدقيق الوكيل الكامل (46 زرًّا)** | 29 ظاهرًا · 0 بلا اسم؛ النقر الكامل لا | نقرة لكل زر مع استثناء التدميري |
| 6 | **حالات أربع لبقية الصفحات** | Overview/AiPage/ScreenPopout/Help ✅ · البقية (Sessions/Files/Audit/Users/Notifications/Settings) فيها خطأ+تحميل فقط | لقطة لكل حالة |
| 7 | **رسائل سجل الوكيل (148 نصًّا)** | **مُستحسَن تركها عربية** — قناة تشغيل لا واجهة | — |

---

## 7) أوامر جاهزة

```powershell
cd 'D:\autoclaw projects-new\AiRemote'

# البطارية (50 خطوة)
node scripts/verify.js

# البوابات
node scripts/check-i18n-refs.cjs      # 647 مرجعًا
node scripts/check-messages.cjs       # لوحة 605 · وكيل 125 · أندرويد 146
node scripts/check-bridge-shadow.cjs  # 0
node scripts/check-dom-ids.cjs        # 107 مرجعًا · 0 ناقص

# اللوحة: بناء + مزامنة (لا pnpm --filter: يحاول install)
cd packages\dashboard; .\node_modules\.bin\tsc.cmd; .\node_modules\.bin\vite.cmd build
cd ..\server-desktop; node scripts\copy-dashboard.js; node scripts\bundle.js

# لقطة لوحة بحالة محددة
node tools\lab\session\shot-dashboard.cjs out.png /ai --fail-api /api/devices
node tools\lab\session\shot-dashboard.cjs out.png /    --stub-api /api/devices '[]'

# تدقيق الأزرار
node scripts\audit-buttons.cjs outputs\audit.json --routes '/,/devices,/settings' --max-per-route 60

# مسبار الوكيل الحقيقي
node scripts\probe-agent-live.cjs out --eval "document.querySelectorAll('button').length"

# أندرويد
$env:JAVA_HOME='D:\autoclaw projects\offline-build-tools\android-toolchain\jdk'
$env:ANDROID_SDK_ROOT='D:\autoclaw projects\offline-build-tools\android-toolchain\sdk'
cd packages\android-agent
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\gradle\bin\gradle.bat' --offline --no-daemon assembleDebug
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\build-tools\34.0.0\apksigner.bat' sign `
  --ks ..\..\secrets\airemote-release.jks --ks-key-alias airemote `
  --ks-pass file:..\..\secrets\keystore-password.txt --out ..\..\releases\AiRemote-Agent-3.14.1.apk `
  app\build\outputs\apk\debug\app-debug.apk
$adb='D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe'
& $adb -s emulator-5554 install -r -t ..\..\releases\AiRemote-Agent-3.14.1.apk
& $adb -s emulator-5554 shell screencap -p /sdcard/x.png; & $adb -s emulator-5554 pull /sdcard/x.png x.png

# الإصدار
cd packages\server-desktop; .\node_modules\.bin\electron-builder.cmd --win --x64
cd ..\agent-desktop;          .\node_modules\.bin\electron-builder.cmd --win --x64
cd ..\..; node scripts\release-manifest.js; node scripts\release-manifest.js --verify

# تثبيت السيرفر (أوقف بالمسار لا بالاسم)
Get-Process 'AiRemote Server' | Where-Object { $_.Path -like '*Programs\AiRemote Server*' } | Stop-Process -Force
& 'releases\server-windows\AiRemote-Server-Setup-v3.14.1-x64.exe' /S
Start-Process 'C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe'
curl.exe -k -s https://127.0.0.1:3001/health

# الضيفان
node tools\lab\session\deploy-agent-ui.cjs win10   # ثم swap-3140-ui.ps1 عبر vmguest.ps
```

---

## 8) بروتوكول التنفيذ (لم يتغيّر)

1. قِس أولًا (`shot-dashboard` / `probe-agent-live` / `audit-buttons` / `uiautomator`).
2. تعديل واحد = التزام واحد برسالة إنجليزية تحمل الرقمين (قبل/بعد).
3. إن ساء الرقم: `git checkout` فورًا — بلا محاولة إنقاذ.
4. الدليل في `outputs/verify-YYYY-MM-DD/`.
5. `design/*.html` للقراءة فقط · Git محلي · لا أسرار في المخرجات (كلمات المرور في `%TEMP%` فقط).
6. **لا تلمس عقد API** بلا قرار مالك · **لا تغيّر تصميم سطح** بلا قرار مالك.

---

## 9) خريطة الملفات الجديدة من هذه الجلسة

| الملف | الدور |
|---|---|
| `docs/FIX-2026-11-07-AGENT-UI-AR.md` | تقرير العيب الحرج (الواجهة الميتة) |
| `docs/RELEASE-3.14.1-AR.md` | تقرير الإصدار: PowerShell، مفتاح الإقلاع، الحزم الخمس |
| `outputs/verify-2026-11-07/w5-agent-ui/` | مسبار الواجهة الميتة ← الحيّة (قبل/بعد) |
| `outputs/verify-2026-11-07/w6-startup/` | لقطات مفتاح الإقلاع + الوكيل 3.14.1 في الضيفين |
| `outputs/verify-2026-11-07/w7-release-3141/` | سجلات بناء الحزم الخمس |
| `outputs/verify-2026-11-07/w8-dashboard/` | بناء اللوحة + سجلات السيرفر أثناء التشخيص |
| `outputs/verify-2026-11-07/w9-states/` | لقطات الحالات الأربع (`ov-*`, `view-*`, `ai-*`, `installed-*`) |
| `outputs/verify-2026-11-07/w10-android/` | لقطة الورقة السفلية + وسم الميزات + سجل البناء |
| `outputs/verify-2026-11-07/w11-audit/` | تدقيق الأزرار (`dashboard.json` + `SUMMARY-AR.md`) |
| `outputs/verify-2026-11-07/w12-handoff/` | بطارية الإغلاق 50/50 |
| `packages/dashboard/src/components/ui/StateSurface.tsx` | مكوّن الحالات الأربع |
| `packages/server-desktop/lib/db-adapter.js` | تسجيل العبارة الفاشلة على `node:sqlite` |
