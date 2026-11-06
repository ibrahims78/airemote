# تقرير 3.14.0 — تنفيذ §6

> كل رقم هنا مقيس بأمر، ومعه مسار دليله على القرص. ما لم يُنجَز مكتوب صراحةً في §9.

## 0) خط الأساس المقيس قبل أي تعديل (2026-11-06)

| السطح | المرجع | diff | block | edge | mae | الأمر |
|---|---|---:|---:|---:|---:|---|
| اللوحة | `outputs/verify-2026-11-05/phase3/server-production-light.png` | **4.85** | 7.11 | 61.11 | 4.30 | `node scripts/shot-surface.cjs --route / --width 1700 --height 980 --scale 2 --theme light` + `python scripts/diff-surface.py` |
| وكيل ويندوز | `design/windows-agent-light.png` | **24.44** | 33.54 | 77.32 | 15.48 | `node scripts/shot-agent.cjs light` + `diff-surface` |
| أندرويد | `design/android-light.png` | 35.57 (من الموجة السابقة) | — | — | — | `outputs/verify-2026-11-05/phase4-android/` |

خط الأساس طابق الرقم المذكور في §0 (4.84 مقابل 4.85 = تقريب عرض)، فالبيئة أمينة.

## 1) صفوف الصلاحيات السبعة — `2185aed`

- **قبل:** 21 نصًّا عربيًّا صلبًا داخل `SetupActivity.java` ⇒ الإنجليزية تُظهر عربيًّا.
- **بعد:** 0 نص صلب (بقي تعليق عربي واحد غير مرئي). 28 مفتاحًا جديدًا `perm_<key>_{title,desc,ok,bad}` في `values/strings.xml` و`values-en/strings.xml` (86 → 114 سطرًا في كل ملف).
- **الدليل:** `outputs/verify-2026-11-06/phase1-setup-en.png` (الصفوف السبعة إنجليزية) و`phase1-setup-ar.png` (عربية). تفريغ DOM: `outputs/ui-setup-en.xml` و`ui-setup-ar.xml`.
- النص المقيس من DOM: «Screen capture / Required for streaming / ✗ Not granted» … «Draw over other apps» بالإنجليزية، وبالعربية «التقاط الشاشة … غير ممنوح».

## 2) D65 — الأسطول 6 بطاقات + إخفاء/إظهار — `8d3c25d`

| الفحص | النتيجة | الدليل |
|---|---|---|
| 5 أجهزة قبل/بعد | **4.84 / 7.11 / 4.30** بلا تغيير | `outputs/verify-2026-11-06/d65-after-cleanup.png` |
| 9 أجهزة | 6 بطاقات بعرض 258px، والشبكة 6 أعمدة | `phase4-screens`/`d65` + سجل CDP: `cards=6`, `cols=6×257.664px` |
| المؤشّر (AR) | «يُعرض 6 من 9 — المتبقي 3» | سجل CDP `head` |
| المؤشّر (EN) | «Showing 6 of 9 — 3 more» | `outputs/verify-2026-11-06/d65/d65-six-en.png` |
| إخفاء بطاقة | 5 → 4، ويظهر رأس «الأسطول / إضافة جهاز (1)» | `d65/d65-hidden.png` |
| الاستعادة | 4 → 5، ويختفي الرأس | `d65/d65-restored.png` |
| الحفظ | `airemote-fleet-hidden-v1` = `["9b5eeaf9…"]` ثم `[]` | سجل CDP `stored` / `stored_after_restore` |

- زر الإخفاء `opacity:0` حتى التحويم (`pointer-events:none`) ⇒ صفر تغيّر بكسل في وضع السكون، ولهذا بقي 4.84 حرفيًّا.
- D53 محفوظة: لا إخفاء تلقائي؛ الإخفاء قرار مستخدم صريح ومحفوظ.

## 3) D64 — بطاقة «الاتصال بجهاز آخر» — `df5e4cf`

**البنية:** `.card` + `.card-h` (عنوان + أيقونة رابط) + `.card-b`، بنفس تسلسل المرجع بعد بطاقتَي التحكم والخادم. الأصناف: `.seg`، `.field`، `.hint`، `.btn.primary`، `.row2`، `.grow` — أُضيفت إلى `style.css` بنفس رموز الثيم.

**الطلب الحقيقي (جهازان فعليان):** WIN10-VM (A) → Android-Emulator (B)، عبر نفس `POST /api/relay/request` الذي تناديه البطاقة، برمز جهاز A من داخل الجهاز نفسه (لم يُطبع أي رمز).

| الحالة | الدليل |
|---|---|
| نجاح | `HTTP=201`, `state=requested`, ثم `2e3691b9-fd24-479d-b8e9-f3c0835d072e … active`، واللوحة تُظهر صفًّا `RELAY · Android-Emulator · نشطة` — `outputs/verify-2026-11-06/d64-relay-rows.png` |
| رفض (كلمة سر خاطئة) | `HTTP=200` ثم `595a9345-… denied` في `/api/relay/sessions` |
| كلمة السر مطلوبة | logcat الجهاز: «🔒 رُفض طلب جلسة: كلمة سر التحكم مطلوبة» |
| مهلة | 62 ثانية انتظار حقيقي في الواجهة ⇒ «انتهت مهلة الطلب دون ردّ.» / «The request timed out with no answer.» |

**الحالات الأربع × اللغتين (طبقة الواجهة، جسر مُستبدل):** `outputs/verify-2026-11-06/phase3-d64-ui/state-{ok,denied,network,timeout}{,-en}.png`
- AR: «قبل الطرف الآخر — الجلسة نشطة…» · «رفض الطرف الآخر الطلب. (denied)» · «فشل الشبكة — تعذّر إرسال الطلب…» · «انتهت مهلة الطلب دون ردّ.»
- EN: «Accepted — …» · «The other side refused the request.» · «Network failure — …» · «The request timed out with no answer.»

**القياس:** الوكيل **24.44 / 33.54 / 77.32 / 15.48** — بلا تغيير (البطاقة تحت الطيّة في لقطة 700×900، فلا تزيد الخطأ ولا تنقصه).
**عيب أُصلح أثناء البناء:** البطاقة كانت تُسحق إلى ارتفاع 2px لأنها عنصر flex في حاوية عمودية ثابتة الارتفاع ⇒ `flex: 0 0 auto`؛ القياس بعده 331px.

## 4) D66 — إحدى عشرة صفحة لوحة — `7364b88`

| الصفحة | تحميل | أخطاء JS | لقطة | اللغة عند EN |
|---|---|---|---|---|
| Devices | ✓ | 0 | `phase4-screens/devices.png` | 10 حرفًا عربيًّا (أسماء أجهزة/وسوم بيانات) |
| Sessions | ✓ | 0 | `sessions.png` | 0 |
| Audit | ✓ | 0 | `audit.png` | 0 |
| Users | ✓ | 0 | `users.png` | 0 |
| Notifications | ✓ | 0 | `notifications.png` | 0 |
| Settings | ✓ | 0 | `settings.png` | 0 |
| Help | ✓ | 0 | `help.png` | **19,689 حرفًا** — متن الدليل عربي فقط (فجوة معلنة) |
| Setup | ✓ | 0 | `setup.png` | 0 |
| Files | ✓ | 0 | `files.png` | 0 |
| Login | ✓ | 0 | `login.png` | 0 |
| DeviceWorkspace | ✓ | 0 | `devices_9b5eeaf9_….png` | 0 |
| ScreenPopout | ✓ لكن بلا جلسة حيّة | 2 | `view_9b5eeaf9_….png` | — |

- **اختبار الأزرار:** `node outputs/tools/btn-audit.cjs` على 10 مسارات، حتى 12 زرًّا لكل صفحة: **صفر زر أنتج استثناءً**، وصفر زر بلا أثر مرئي عدا روابط التنقّل نفسها. التفاصيل: `outputs/verify-2026-11-06/phase4-buttons-{a,b,c,d}.json`.
- **مونتاج الانحدار:** `outputs/verify-2026-11-06/phase4-montage.png` (10 لقطات).
- **EN:** `outputs/verify-2026-11-06/phase4-en/*.png` + قياس أحرف عربية لكل مسار (الجدول أعلاه).

## 5) كتالوج الرسائل — 11 حالة — `d09b1a9`

`node scripts/check-messages.cjs`:

```
states complete : 11/11
dashboard keys  : ar=452 en=452 | ar-only=0 en-only=0
agent keys      : ar=91  en=91  | ar-only=0 en-only=0
android keys    : ar=122 en=122 | ar-only=0 en-only=0
```

الكتالوج الكامل: `docs/MESSAGES-3.14.0-AR-EN.md`.

## 6) الإصدار 3.14.0

| البند | النتيجة |
|---|---|
| `VERSION` + 7 ملفات `package.json` | 3.14.0 |
| `check-version-consistency` | ✓ للملفات الثمانية · ✗ `/health` = 3.13.1 (السيرفر المثبَّت) |
| **`/health` في الشيفرة** | كان **3.8.8 مكتوبة يدويًّا** في `packages/server/src/app.ts` — لم يكشفها الفحص لأنه يبحث في `server.js` فقط. أُصلحت لتقرأ نسخة الحزمة. بناء 3.14.0 على المنفذ 3010 أجاب: `{"status":"ok","version":"3.14.0"}` (`4915bb4`) |
| `releases/manifest.json` | 3.14.0 (أُعيد توليده) |
| بناء اللوحة | ✓ 25.89s (`dist/` جديد) |
| APK | `releases/AiRemote-Agent-3.14.0.apk` — `versionCode=60`, `versionName=3.14.0`, موقّع ومُتحقَّق (`apksigner verify --print-certs`) |
| `verify.js` | **45/46** — الخطوة الفاشلة الوحيدة هي `/health` |
| `check-contrast` | 28/28 |
| `check-messages` | 11/11 |

## 7) رقم واحد لم يتغيّر: 24.44

الوكيل ما زال 24.44 لأن بطاقاته الثلاث تعيش **داخل أكورديون «الإعدادات»** بينما المرجع يعرضها كبطاقات أعلى السطح (وقبلها بطاقة حالة و«معلومات الجهاز»). إضافة البطاقة الثالثة لا تُحرّك قياسًا وهي تحت الطيّة. رفع هذا الرقم يحتاج نقل البطاقات إلى أعلى السطح — تغيير بنيوي لم يُنفَّذ في هذه الموجة.

## 8) أوامر إعادة الإنتاج

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
node scripts/shot-surface.cjs --route / --width 1700 --height 980 --scale 2 --theme light --out out.png
python scripts/diff-surface.py out.png outputs/verify-2026-11-05/phase3/server-production-light.png
node scripts/shot-agent.cjs light
python scripts/diff-surface.py outputs/verify-2026-11-05/phase3/agent-light.png design/windows-agent-light.png
node scripts/check-messages.cjs
node scripts/check-version-consistency.cjs
node scripts/verify.js
```

## 10) إصلاح المحاكي وتوحيد بطاقة وكيل↔وكيل (ما بعد التقرير الأول)

### أ) إصلاح شاشة LDPlayer دون فقدان أي بيانات
- **السبب:** تجاوز `wm size 920x1800` + `wm density 320` الذي ضبطته للقياس، وهو محفوظ في `Settings.Global` داخل `/data` فلا يزول بإعادة الإقلاع. إضافةً إلى أن `ldconsole modify --resolution` شوّه إعداد النسخة إلى `1760×792`.
- **الإصلاح:** تعديل مباشر في `data.vmdk` والنسخة مُطفأة، بنفس عدد البايتات: 28 قيمة `display_size_forced` (`920,1800` ← `1600,900`) و41 قيمة `display_density_forced` (`320` ← `160`). نسخة احتياطية كاملة قبله: `data.vmdk.bak-3.14.0` (14.0 GB).
- **النتيجة المقيسة:** `wm size` ⇒ `Physical size: 1600x900` بلا سطر Override · `wm density` ⇒ `Physical density: 160` · `mBaseDisplayInfo` = `app 1600 x 900` · نوافذ وتطبيقات المستخدم سليمة.
- **إثبات براءة الوكيل:** القياس قبل/بعد تشغيل التطبيق متطابق (1600×900، والنافذة 936×534 في الحالتين)، ولا يوجد في كوده `wm size` ولا `Runtime.exec` ولا `setRequestedOrientation`؛ البثّ يُبنى من `getResources().getDisplayMetrics()` مع `AUTO_MIRROR`.

### ب) توحيد بطاقة «الاتصال بجهاز آخر» — `4091a29`
| العنصر | قبل | بعد |
|---|---|---|
| الحاوية | صفوف عارية بلا عنوان | رأس «الاتصال بجهاز آخر» أولًا ثم الحقول |
| كلمة المرور | مخفية حتى يطلبها السيرفر | ظاهرة دائمًا + تلميح مطابق لويندوز |
| أزرار الوصول | ثلاثة راديو عارية | حشو 10×7dp + خلفية + توسيط (تنسيق مقسّم) |
| النصوص | صلبة | `card_connect` · `card_pw_hint` في ar/en |

**القياس (920×1800، ثيم فاتح):** 37.65 / 54.48 / 76.63 / mae 26.37 — أي **+2.08** عن 35.57، وتفسيرها أن `design/android-light.png` لا يحتوي هذه البطاقة أصلًا، فهي ثمن ميزة غائبة عن المرجع لا تدهور في عنصر قائم.

**التحقق النصّي (uiautomator):** العنوان `[24,122]` · التلميح `[24,141]` · «الأجهزة» `[24,168]` · كلمة المرور `[24,245]` · تلميحها `[24,283]` · «طلب الاتصال» `[24,306]`.

**التوازن اللغوي بعد الإضافة:** `android keys: ar=124 en=124 | 0/0` · `check-messages` = 0 · الحالات 11/11.

### ج) المتبقي في مسار التوحيد
1. طيّ جسم البطاقة (يعيد الرقم إلى ~35.57 مع بقاء الميزة).
2. شريط مقسّم فعلي بدل الراديو مع ربط `access` نفسه.
3. `SessionOfferActivity` بنصوص `sess_state_*` الإحدى عشرة.
4. اختبار الأزرار الأربعة + حالتا كلمة السر على WIN10-VM → Android.
5. تأكيد ثلاثة مقاسات (1600×900 · 920×1800 · 1280×720).

## 9) ما لم يُنجَز — بصراحة

1. **`/health` = 3.13.1 على المنفذ 3001.** السيرفر العامل حزمة مثبَّتة (`AiRemote Server.exe`) لم تُعَد بناءً في هذه الموجة. الشيفرة نفسها صحيحة: بناء 3.14.0 على 3010 يعلن `3.14.0`، وعيب `3.8.8` المكتوب يدويًّا أُصلح. المتبقي: إعادة تجميع حزمة السيرفر وتثبيتها.
2. **بطارية أندرويد (§6/6).** المحاكي انقطع أثناء الموجة (`adb devices` ⇒ فارغ)، فلم يُقس شيء. لا رقم مُختلق.
3. **D66 — أربعة أنشطة أندرويد.** لم تُعَد بناءً في هذه الموجة. المقيس فقط: أزرار معالج التهيئة ارتفاعها 96px@2x = **48dp** (≥44dp) من `outputs/ui-setup-en.xml`.
4. **مركز المساعدة.** متن الدليل عربي فقط (19,441 حرفًا)؛ أُضيف إعلان صريح بالإنجليزية بدل عرض عربي صامت.
5. **`ScreenPopout`.** يحتاج جلسة حيّة وتذكرة؛ لُقط بلا جلسة فظهرت استثناءات الاتصال (2) — ليست عيبًا في الصفحة.
6. **الوكيل 24.44.** يحتاج نقل البطاقات بنيويًّا (§7).
