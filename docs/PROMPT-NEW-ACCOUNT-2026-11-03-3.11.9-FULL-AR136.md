أنت المهندس المسؤول عن استئناف مشروع **AiRemote** على هذا الجهاز نفسه، في حساب جديد.

---

## 0) ماذا تغيّر منذ الملف السابق (اقرأ أولاً — يحكم على ما بعده)

**النسخة الآن 3.11.9** (كانت 3.11.8) · `versionCode=49` · الحزمة **44 خطوة** · التزام `503ce4e` على فرع `hardening/audit-20261102` · البيان **15 عنصراً موقّعاً ومطابقاً**.

### 0.1 الشاشة السوداء (P0 سابق) — **مُغلقة بقياس بكسلات، لا تُعِد بناءها**
- **السبب المُثبت:** مسار `getDisplayMedia`/`desktopCapturer` في Chromium على ضيوف VMware يُرجع سواد 100%
  (10/10 إطارات، RGB (0,0,0)، 1.9–7.2KB) بينما السطح سليم (GDI: متوسط 94/139/190).
  `disableHardwareAcceleration()` كان مفعّلاً أصلاً ولم يُجدِ.
- **الحل:** محرّك التقاط GDI/BitBlt جديد في الوكيل:
  `packages/agent-desktop/lib/capture-gdi.js` + `lib/capture-gdi.ps1`
  (عملية PowerShell/Add-Type واحدة طويلة العمر) يرسل JPEG على **نفس** قناة `screen-frame-binary`
  بترويسة 50 بايت و`flags=1` ⇒ لا تغيير في السيرفر أو العارض لمسار الإطارات.
- **النتيجة المقيسة (Pillow):** بارد **536ms** · دافئ **31ms** · **صفر إطار أسود** · RGB (91/125/169) · 66–68KB.
- **مفاتيح التصميم (لا تُكسر):**
  1. سكربت PowerShell **يُستخرج من asar** إلى `%APPDATA%\AiRemote Agent\` — `powershell.exe` لا يقرأ داخل asar.
  2. **وضع خمول:** العامل لا يلتقط حتى تصل `A` على stdin (`P` يوقف) ⇒ التسخين عند التسجيل مجاني.
  3. `gdiSuppressRenderer` يكتم إطارات Chromium أثناء إقلاع GDI (كانت ~11 إطاراً أسود)، بمهلة 6s تعيد المسار القديم.
  4. عند خروج العامل تُعاد جلسة Chromium تلقائياً لنفس الجلسة.
  5. إطار أمان كل ثانية على سطح ساكن (بصمة 16×16) — يحافظ على سلوك delta.

### 0.2 المؤشر — **سهم واحد احترافي (طراز AnyDesk)، مُطبَّق ومُثبت**
- الوكيل يبثّ `agent:screen_cursor` (x,y بالبكسل + أبعاد الإطار) كل ≥80ms ⇒ السيرفر يمرّره `screen:cursor`.
- العارض: سهم SVG واحد داخل **حاوية المسرح** (نسبتها = نسبة الإطار ⇒ لا letterbox ولا إزاحة) ·
  `cursor-none` على الـcanvas أثناء البثّ ⇒ لا مؤشرين · الإحداثيات من `getContentRect` نفسها.
- أُزيلت النقطة الدائرية القديمة وسهم أندرويد الميت (كان محجوباً بـ`controlEnabled` فلا يظهر أبداً).
- إثبات المسار: 14 رسالة مؤشر مع 14 إطاراً، من (624,0) إلى (1057,354) في 1600×677.
- **المتبقي الوحيد:** لقطة بشرية واحدة تؤكد شكل السهم (البثّ والتحكم أُثبتا في متصفح حقيقي).

### 0.3 جهاز جديد مضاف — **TAB16-USB** (بديل عملي لغياب TECNO والمحاكي)
- `deviceId = 7fc54b40-e7c1-4db6-9f55-78f377c4f4ad` · TAB16 · Android 8.1.0 · arm64 · 1280×800 · Wi-Fi 192.168.1.101.
- APK **vc48/3.11.8** (كود أندرويد لم يتغيّر) · الالتقاط ممنوح · خدمة الوصول مفعّلة ·
  **كلمة مرور تحكم مضبوطة من المالك** (تُطلب عند زر «تحكم»؛ لا تُطبع — اسأل المالك) · استثناء بطارية مضاف.
- **T1 أندرويد PASS:** `control_granted` ثم HOME ⇒ `homeWorked=true` (`outputs/verify-2026-11-03/tab16/t1.json`).
- **أداء ضعيف عمداً مقبول:** 1–4 fps · encode 60–900ms · «WebP too slow → JPEG». لا ترفع fps.
- **فخ أُغلق:** كان مملوكاً لـ`lab-probe@local` ⇒ كل جلسات التحكم تُرفض 403 `session_policy_denied`
  (السيرفر يشترط: مالك الطالب = مالك الهدف). الملكية صُحّحت إلى `admin@airemote.local`.

### 0.4 تحذيرات حاكمة
- **لا تلمس مسار الالتقاط** بلا قياس بكسلات قبل/بعد (`dump-frames.cjs` + `frame_stats.py`). حجم الإطار لا يكشف السواد.
- بوابة أول إطار الآن تقيس **إطار محتوى** من `outputs/verify-2026-11-03/warm-capture/measure.json` (PASS 536/1800).
- `vmguest.cjs ps <vm> <script.ps1>` يقرأ `C:\Users\admin\<basename>.out.txt` ⇒ اسم الخرج **يجب** يطابق اسم السكربت.
- `vmrun start … gui` قد يفشل «Unknown error» — استخدم **`nogui`** (نجح مرتين متتاليتين).
- إعادة تثبيت APK على الجهاز **تُفقد** إذن الالتقاط وخدمة الوصول ⇒ لا تعيد التثبيت دون حاجة، وأعد المنح بعدها.
- إصدارات Electron مختلفة: السيرفر **44.3.0** · الوكيل **28.3.3** — لا تخلط node_modules بينهما.

---

قيد حاكم: **لا تُنفّذ أي أمر ولا تُعدّل أي ملف ولا تُشغّل بناءً حتى يقول صاحب المشروع «ابدأ»**.
اكتفِ بالتحقق القرائي، ثم أعد جدول المتوقع/الفعلي وتوقف. (D30)

---

## 1) بيئة العمل — مسارات كاملة

| العنصر | المسار/القيمة |
|---|---|
| المستودع | `D:\autoclaw projects-new\AiRemote` · فرع `hardening/audit-20261102` · **Git محلي فقط (0 remotes)** |
| آخر التزام | `503ce4e` feat(capture,viewer): GDI capture engine + single-arrow cursor for 3.11.9 |
| السيرفر المثبَّت | `https://127.0.0.1:3001` (TLS ذاتي) · `/health` · `/ready` · **3.11.9** |
| تنفيذي السيرفر | `C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe` (electron 44.3.0) |
| تنفيذي الوكيل | `C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe` (electron 28.3.3) |
| قاعدة البيانات | `C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db` (**قراءة فقط للفحص**؛ Node 24 يملك `node:sqlite` مدمجاً — استخدمه) |
| مجلد الأدوات | `D:\autoclaw projects\offline-build-tools\android-toolchain` (adb · jdk · gradle) — **ملاحظة: `sdk\emulator` مفقود** |
| VMware | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` · خدمة `VMware NAT Service` |
| الضيوف | `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` · `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx` |
| أدوات المختبر | `tools\lab\a2a\` (80+ أداة) · `tools\lab\lab.cjs` (جلسة API مُخبَّأة، لا يطبع الرمز) |
| أسرار — **لا تُطبع أبداً** | `%APPDATA%\AiRemote\lab-credentials.txt` (فيه أيضاً `tab16_usb_unattended_password=[redacted] من جلسة سابقة — **معطّل**) · `lab-probe.json` · `signing\keystore-password.txt` · أي رمز/JWT |

**الأجهزة (المعرّفات للاستخدام في الأدوات):**

| الجهاز | deviceId | ملاحظات |
|---|---|---|
| WIN10-VM | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | 192.168.0.128 · **3.11.9** |
| WIN11-VM | `d147684b-2451-4418-a628-86f11aa66a4e` | 192.168.0.129 · **3.11.9** |
| TAB16-USB | `7fc54b40-e7c1-4db6-9f55-78f377c4f4ad` | الجهاز الفيزيائي الموصول عبر USB · **vc48** |
| TECNO-KL4 | `07f8ae91-5b64-41d9-97df-ce649772b0d3` | **غير موصول** (لا تتحقق منه) |
| Android-Emulator | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` | يظهر online لكن لا محاكي محلي — لا تعتمد عليه |

**المضيف:** Wi-Fi `192.168.1.25` · Ethernet `192.168.1.55` · VMnet8 `192.168.0.1`.
**عنوان الخادم للأندرويد:** `wss://192.168.1.25:3001/ws` (مع `adb reverse tcp:3001 tcp:3001` كبديل).

---

## 2) المستودع — الجديد في 3.11.9

- `packages/agent-desktop/lib/capture-gdi.js` + `capture-gdi.ps1` — المحرّك البديل (البروتوكول في §0.1).
- `packages/agent-desktop/main.js` — استدعاء المحرّك، `startGdiForSession/stopGdi`، `sendScreenFramePacket`،
  الكتم، مهلة المراقبة، تسخين عند `server:registered` وعند `server:screen_control_request`.
- `packages/server-desktop/server.js` — معالج `agent:screen_cursor` (بعد `agent:screen_brightness_status`).
- `packages/dashboard/src/components/ScreenViewer.tsx` — المؤشر الواحد (ابحث عن `3.11.9`).
- أدوات جديدة في `tools/lab/a2a/`: `dump-frames.cjs` · `frame_stats.py` · `cursor-probe.cjs` ·
  `provision-android.cjs` · `accept-offer.cjs` · `t1-android.cjs`.
- أدلة جديدة: `outputs/audit-frames/*` · `outputs/verify-2026-11-03/{gdi,t18,cursor,tab16,warm-capture}`.
- `scripts/check-first-frame.cjs` لم يتغيّر — يلتقط أحدث `outputs/verify-*/warm-capture/measure.json` تلقائياً.

**مصادر الإصدار (8 مواضع يجب أن تتساوى):** `VERSION` · `package.json` · `packages/server-desktop/package.json` ·
`packages/agent-desktop/package.json` · `packages/dashboard/package.json` · `packages/android-agent/app/build.gradle`
(`versionName` يُقرأ من `VERSION` · `versionCode` رقمي) · `releases/manifest.json` · `/health`.
**الحارس:** `node scripts/check-version-consistency.cjs`.

---

## 3) الحالة الحالية (تتحقق في §11 ولا تُعاد بناؤها)

- **3.11.9** على السيرفر + وكيلَي ويندوز · **APK vc48** على TAB16.
- **البث:** WIN10/WIN11 إطارات محتوى حقيقية، صفر سواد (مقيس).
- **TAB16-USB:** online · التقاط + وصول + كلمة مرور تحكم.
- **البطارية 44/44** · ألوان 0 · تباين 22/22 · توحيد إصدار PASS · بيان 15 عنصراً موقّع · أول إطار PASS 536/1800.
- الشجرة نظيفة بعد الالتزام `503ce4e` (بقايا `tools/lab/a2a/vm-*.out.txt` عابرة — لا تُلتزم).

---

## 4) القرارات الحاكمة (القائمة الكاملة في `docs/DECISIONS-LOG.md`)

- **D30:** الحساب الجديد لا ينفّذ حتى «ابدأ». · **D31:** Authenticode مؤجَّل. · **D32:** MIT. · **D33:** WebRTC مؤجَّل لـ4.0.
- **D34 (جديد):** مسار التقاط ويندوز = محرّك GDI هو المصدر الأول، وChromium بديل تلقائي — أي تغيير في
  `capture-gdi.*` يوجب قياس بكسلات قبل/بعد وإعادة قياس أول إطار.
- **D35 (جديد):** مؤشر العارض مصدره `screen:cursor` من الوكيل (لا يُحسب محلياً في المشاهدة) — لا إعادة إدخال نقطة قديمة.
- **D36 (جديد):** قياس «أول إطار» يعني **إطار محتوى** (فك JPEG وسطوع > 0) — إطار أسود لا يُحتسب.
- قرار معماري قائم: `relaySessions` في الذاكرة فقط ⇒ إعادة تشغيل السيرفر تُسقط الجلسات (`session_not_active`).

---

## 5) المتبقي (بالترتيب المقترح)

1. **لقطة بشرية للمؤشر** — دقيقة واحدة: افتح جلسة في المتصفح وتأكد من سهم واحد (الدليل البروتوكولي جاهز).
2. **تسخين أعمق للبارد:** 536ms جيد، لكن إيقاف/تشغيل الوكيل يعيدها ~4.9s إن لم يصل تسجيل.
   الحل المقترح: تجميع عامل GDI كـ`.exe` بـ`csc.exe` وقت البناء (يوفر ~2s من Add-Type).
3. **T11 الشاشة الثانية** — ما زال محجوباً (مضيف بشاشة واحدة) · `svga.numDisplays="2"` في vmx WIN11.
4. **قياس شبكة حقيقية بفيديو (WAN/ZeroTier)** · **تجربة 5–10 مستخدمين** · **ملاحظات إصدار 3.10–3.11.9**.
5. **بانتظار قرار المالك:** استمرارية جلسات relay بعد إعادة التشغيل · صوت داخل الجلسة.
6. **نظافة releases/:** 3.11.7 و3.11.8 ما زالتا في المجلد (البيان 15 عنصراً) — أرشِف قبل التوليد القادم إن أردت بياناً أنظف.

---

## 6) سير العمل (إلزامي)

1. تعديل المستودع عبر سكربت Node بضمان «مطابقة واحدة» لكل مقطع (انظر `docs/CHANGES-2026-11-03-3.11.9-AR.md` §نمط).
2. **شريحة واحدة = التزام واحد** + دليل في `outputs/verify-<date>/` + `CHANGELOG` + `PROJECT_STATE` + **44/44**.
3. **إن غيّرت كوداً:** ارفع `VERSION` + 4 `package.json` + `versionCode` ثم:
   - سيرفر: `.\tools\lab\a2a\build-server.ps1` (يبني اللوحة + يضمّنها + مثبّت) ⇒ `Setup.exe /S` ⇒ تشغيل.
   - وكيل: `cd packages\agent-desktop; $env:CSC_IDENTITY_AUTO_DISCOVERY='false'; .\node_modules\.bin\electron-builder.cmd --win --x64`
     ⇒ انسخ `releases\agent-windows\win-unpacked\resources\app.asar` إلى الضيف باسم `C:\Users\admin\new-app.asar`
     ⇒ شغّل سكربت التبديل (اقتل الوكيل · انسخ asar · شغّل · تحقق من تطابق الحجم) — نمط `swap-3119.ps1`.
   - APK: `gradle --offline --no-daemon :app:assembleRelease` ⇒ `sign-apk.ps1` ⇒ `adb install -r` ⇒ **أعد منح الالتقاط والوصول**.
4. **بعد أي إقلاع لضيف:** أعد تشغيل الوكيل (kill ثم start).
5. **التزامات Git بالإنجليزية**، محلية فقط، لا push.

---

## 7) أدوات لا تُستبدل

`tools\lab\devs.cjs` (حالة الأجهزة) · `tools\lab\lab.cjs` (جلسة API) · `tools\lab\a2a\vmguest.cjs`
(`probe` · `ps <vm> <file.ps1>` · `shot` · `copyIn/copyOut` — يُنقّي الأسرار) ·
**جديدة:** `dump-frames.cjs` · `frame_stats.py` · `cursor-probe.cjs` · `provision-android.cjs` · `accept-offer.cjs` · `t1-android.cjs` ·
`patch.cjs` (ترقيع آمن) · `mirror-sync.cjs` (مرآة 464 ملفاً) · `grant-capture.cjs` · `sign-apk.ps1` · `build-server.ps1`.

**بوابات:** `verify.js` (44) · `check-version-consistency.cjs` · `scan-ui-colors.cjs` · `check-contrast.cjs` ·
`release-manifest.js --verify` · `check-first-frame.cjs`.

**قاعدة القياس:** الإطار يُقاس **بعد فك الترميز** (`frame_stats.py`) لا بحجمه ولا بعدّاد fps.

---

## 8) التفويض للمساعدين

- الوضع الحالي **standard** (لا موجة تلقائية): فوّض عند حاجة حقيقية فقط — تحقيق عريض أو مراجعة مستقلة أو صياغة.
- قبل أي موجة: `node "D:\autoclaw projects-new\AiRemote\tools\lab\a2a\mirror-sync.cjs"` (464 ملفاً · 10.3MB)
  ثم مرّر مسارات نسبية داخل `mirror/src`. **المرآة لا تنسخ `renderer/*.html` ولا `outputs/`** — مرّر الملف يدوياً أو نفّذ بنفسك.
- أدوات ملفات المساعد محصورة في مساحة العمل؛ `D:\` ممنوع. المؤقت بلا `exec` بلا أوامر متعددة.
- ثلاثة بريفات جاهزة: (1) اقرأ `mirror/src/packages/agent-desktop/main.js` واستخرج كل ما يتعلق بـ`gdiCapture` بالأسطر.
  (2) راجع `mirror/src/packages/dashboard/src/components/ScreenViewer.tsx` وأعد كل استدعاء `sendWs` بجدول.
  (3) من `mirror/src/docs/AGENT-SESSION-TEST-MATRIX-AR.md` استخرج البنود بلا مسار دليل.

---

## 9) قواعد ملزمة (من أخطاء فعلية — القائمة الكاملة في `docs/CHANGES-2026-11-03-3.11.9-AR.md`)

1. Git محلي فقط — لا remote ولا push.
2. لا أسرار في المخرجات — كلمة مرور تحكم TAB16 من المالك، لا تُطبع.
3. PowerShell 5.1 يقرأ UTF-8 كـANSI ⇒ `Get-Content -Encoding UTF8` أو Node. الاقتباس بـ`'...'` دائماً.
4. لا PASS بلا دليل مكتوب — والقياس على الطبقة الصحيحة (`homeWorked` لا `gotKey`؛ سطوع JPEG لا حجمه).
5. أندرويد: `am force-stop` يُعطّل خدمة الوصول ⇒ أعد `settings put secure enabled_accessibility_services …` و`accessibility_enabled 1`.
6. ويندوز: بعد أي إقلاع لضيف أعد تشغيل الوكيل.
7. `datetime('now')` في SQLite = UTC بلا لاحقة ⇒ اقرأها `replace(' ','T')+'Z'`.
8. لا إعادة بناء لشيء يعمل، ولا لمس `bin/` · `.cache/` · `node_modules`.
9. `vmrun start … gui` يفشل أحياناً ⇒ `nogui` نجح. وبعد أي إقلاع أعد تشغيل الوكيل.
10. **asar:** أي أصل يقرأه process خارجي (PowerShell/ffmpeg) يجب استخراجه إلى `%APPDATA%` — لا تمرر مسار asar.
11. **vmguest.ps:** ملف الخرج = اسم السكربت (`C:\Users\admin\<name>.out.txt`).
12. **ملكية الأجهزة:** طلب جهاز←جهاز يفشل 403 إن اختلفت ملكية الهدف عن مالك الطالب (`session_policy_denied`).
13. **TDZ:** لا `let/const` يستهلكها استدعاء يسبق تعريفها — يغطيه `test/main-load.test.cjs`.
14. **اللقطات عبر المتصفح:** التذكرة `rt` قصيرة العمر — خذ اللقطة فوراً بعد إنشاء العارض.

---

## 10) قائمة تحقق الاستئناف (قراءة فقط — نفّذها عند «ابدأ» ثم أعد الجدول وتوقف)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -3; git status --short
curl.exe -sk https://127.0.0.1:3001/health ; curl.exe -sk https://127.0.0.1:3001/ready
node tools\lab\devs.cjs
node scripts\verify.js
node scripts\check-version-consistency.cjs
node scripts\scan-ui-colors.cjs ; node scripts\check-contrast.cjs
node scripts\release-manifest.js --verify
node scripts\check-first-frame.cjs
(Get-Service 'VMware NAT Service').Status
& 'C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe' list
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe' devices
```

**المتوقع:** شجرة نظيفة · `/health` = 3.11.9 · WIN10+WIN11+TAB16-USB online · **44/44** · ألوان 0 · تباين 22/22 ·
إصدار PASS (3.11.9 · vc49) · بيان 15 عنصراً موقّع ومطابق · أول إطار PASS 536/1800 · NAT Running ·
`vmrun list` يُظهر الضيفين (أو صفر إن كانا مطفأين — أقلعهما `nogui`) · adb يرى `GPSZ2025040701858` (TAB16).

**إن خرج البث أسود:** لا تعيد البناء — افحص أولاً `outputs/audit-frames/` بـ`frame_stats.py`،
ثم سجل الوكيل (سطور «محرّك GDI نشط» / «توقّف محرّك GDI»)، ثم `%APPDATA%\AiRemote Agent\capture-gdi.ps1` موجود.

---

## 11) مخرجاتك المطلوبة الآن (بلا تنفيذ)

1. جدول تحقق §10: المتوقع مقابل الفعلي لكل بند.
2. أي انحراف بسطر الدليل (ملف/سطر أو ناتج أمر).
3. تأكيد أنك لم تُعدّل شيئاً وأنك تنتظر «ابدأ».

**بعد «ابدأ»:** ابنِ المرآة، فوّض التحليل على أطفال، واحتفظ أنت بالبناء والقياس والتعديل.

**مراجع سريعة:** `docs/CHANGES-2026-11-03-3.11.9-AR.md` (توثيق هذه الشريحة بالأدلة) ·
`docs/DECISIONS-LOG.md` · `docs/AGENT-SESSION-TEST-MATRIX-AR.md` · `docs/DELEGATION-AR.md` ·
`outputs/verify-2026-11-03/` (كل قياسات هذه الشريحة).
