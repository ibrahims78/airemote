أنت المهندس المسؤول عن استئناف مشروع **AiRemote** على هذا الجهاز نفسه، في حساب جديد.

قيد حاكم: **لا تُنفّذ أي أمر ولا تُعدّل أي ملف ولا تُشغّل بناءً حتى يقول صاحب المشروع «ابدأ»**.
اكتفِ بالتحقق القرائي (قراءة ملفات + أوامر قراءة فقط)، ثم أعد جدول المتوقع/الفعلي وتوقف. (D30)

---

## 1) بيئة العمل — مسارات كاملة

| العنصر | المسار/القيمة |
|---|---|
| المستودع | `D:\autoclaw projects-new\AiRemote` · فرع `checkpoint/3.8.1-2026-10-26` · **Git محلي فقط (0 remotes)** |
| السيرفر المثبَّت | `https://127.0.0.1:3001` (TLS ذاتي) · `/health` · `/ready` |
| تنفيذي السيرفر | `C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe` |
| قاعدة البيانات | `C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db` (**قراءة فقط للفحص**) |
| مجلد الأدوات | `D:\autoclaw projects\offline-build-tools\android-toolchain` (فيه `sdk\platform-tools\adb.exe` · `jdk\` · `gradle\bin\gradle.bat`) |
| VMware | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` · خدمة `VMware NAT Service` |
| الضيوف | `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` · `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx` |
| أرشيف الملفات غير الضرورية | `D:\airemote-archive\2026-11-02` (12,928.7 MB) + `ARCHIVE-MANIFEST.md` |
| حِزم الرجوع (rollback) | `D:\airemote-artifacts-3.11.6` (سيرفر + وكيل + APK كاملة) |
| الأسرار — **لا تُطبع أبداً** | `%APPDATA%\AiRemote\lab-credentials.txt` · `lab-probe.json` · `signing\keystore-password.txt` · أي رمز/JWT |
| أدوات المختبر | `D:\autoclaw projects-new\AiRemote\tools\lab\a2a\` (76+ أداة) · `tools\lab\lab.cjs` (جلسة API مُخبَّأة، لا يطبع الرمز) |

**الأجهزة (المعرّفات للاستخدام في الأدوات):**

| الجهاز | deviceId | ملاحظات |
|---|---|---|
| WIN10-VM (المُشغِّل) | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | 192.168.0.128 |
| WIN11-VM (الهدف) | `d147684b-2451-4418-a628-86f11aa66a4e` | 192.168.0.129 |
| Android-Emulator | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` | adb `emulator-5554` · API 28 |
| TECNO-KL4 | `07f8ae91-5b64-41d9-97df-ce649772b0d3` | adb `12927374CM001019` · Android 14 |

**المضيف:** Wi-Fi `192.168.1.25` · Ethernet `192.168.1.55` · ZeroTier `10.90.74.220` · VMnet8 `192.168.0.1`.
**عنوان الخادم على الهاتف:** `wss://192.168.1.25:3001/ws`.

---

## 2) المستودع — البنية ومصادر الحقيقة

**الحزم (`packages/`):** `server-desktop` (السيرفر + اللوحة المدمجة) · `agent-desktop` (وكيل ويندوز Electron) · `android-agent` (وكيل أندرويد) · `dashboard` (واجهة React) · `shared` · `ai-engine` · `agent` (وكيل Node قديم) · `server` · `headless-agent` · `script-agent`.

**مصادر الإصدار (8 مواضع يجب أن تتساوى):** `VERSION` (المصدر) · `package.json` · `packages/server-desktop/package.json` · `packages/agent-desktop/package.json` · `packages/dashboard/package.json` · `packages/android-agent/app/build.gradle` (`versionName` يُقرأ من `VERSION`، و`versionCode` رقمي تصاعدي) · `releases/manifest.json` · `/health`.
**الحارس:** `node scripts/check-version-consistency.cjs` (D29).

**التوقيع:** `releases/release-key.pem` (خاص — مستثنى من Git ولا يُنقل) · `release-key.pub.pem` (عام) · `manifest.json` + `manifest.sig`.

**التوثيق الحاكم (`docs/`):** `HANDOFF-2026-11-02-3.11.7-AR.md` (حزمة الاستئناف) · `DECISIONS-LOG.md` (D1–D33) · `AGENT-SESSION-TEST-MATRIX-AR.md` (T1–T18) · `PLAN-STATUS.md` (إغلاق R9) · `PRODUCTION-PLAN-v2.0-AR.md` (الخطة الحاكمة R0–R9) · `RUNBOOK-AR.md` · `ADMIN-GUIDE-AR.md` · `USER-GUIDE-AR.md` · `DELEGATION-AR.md` (التفويض) · `PROMPT-NEW-ACCOUNT-2026-11-02-3.11.7-FULL-AR.md` (هذا الملف).

---

## 3) الحالة الحالية (تُتحقّق في §9 ولا تُعاد بناؤها)

- **3.11.7** على السيرفر + وكيلَي ويندوز + APK **vc47** على TECNO والمحاكي.
- **4/4 online** (WIN10 · WIN11 · المحاكي · TECNO).
- **البطارية 42/42** · ألوان **0** · تباين **22/22** · توحيد إصدار **PASS** · بيان **5 عناصر موقّع ومطابق** · بوابة أول إطار **PASS (1722ms/1800)** · VMware NAT **Running**.
- **المصفوفة: 19 بنداً — 18 بدليل مكتوب، وT11 وحده محجوب بقيد عتاد.**
- الشجرة نظيفة عند آخر التزام (تحقّق بـ`git log -1`).

---

## 4) ما أُنجز — باختصار موثّق

| الشريحة | الدليل |
|---|---|
| أول إطار 2084→1722ms · ~27ms ساخن | `outputs/verify-2026-11-02/warm-capture/` · `t18/` |
| حوار الطلب على Android 14 (full-screen intent، بلا overlay) | `outputs/verify-2026-11-02/offer-3117/` (لقطة + `offer-3117.json`) |
| T1 إثبات تنفيذ (فأرة/مفاتيح/`homeWorked=true`) | `outputs/verify-2026-11-02/t1/` |
| T2 رفض صريح (`denied` + 409 + تدقيق) | `outputs/verify-2026-11-02/t2/` |
| T9 أندرويد في الخلفية (11 إطاراً) | `outputs/verify-2026-11-02/t9/` |
| T10 تدوير · T12 حافظة داخل relay · T13 1GiB ببصمة متطابقة · T16 RTL (12 قياساً بعد الدخول) | `outputs/verify-2026-11-02/{t10,t12,t13,t16-post-login}/` |
| أزرار أندرويد في شريط العارض (WIN10→TECNO) | `outputs/verify-2026-11-02/android-toolbar/` |
| مقاييس Relay (إطارات/بايتات/**إسقاط**) + تنبيه انقطاع >10 دقائق | `outputs/verify-2026-11-02/metrics/` |
| T11 محجوب بقيد عتاد + قرار موثّق | `outputs/verify-2026-11-02/t11/DECISION-AR.md` |
| أرشفة 12,928.7 MB (16.5GB→3.56GB) | `D:\airemote-archive\2026-11-02\ARCHIVE-MANIFEST.md` |

---

## 5) القرارات الحاكمة

- **D30:** الحساب الجديد لا ينفّذ حتى «ابدأ» (هذا الملف).
- **D31:** Authenticode **مؤجَّل** حتى شراء شهادة توقيع.
- **D32:** الترخيص **MIT** (مثبَّت في `LICENSE`).
- **D33:** **WebRTC مؤجَّل إلى 4.0** — يبقى WebSocket + إطارات delta في 3.x، بمعايير تقييم مكتوبة.
- **قرار معماري (موثّق في CHANGELOG 3.11.7 وPLAN-STATUS):** `relaySessions` في الذاكرة فقط (`server.js:1785`) ⇒ إعادة تشغيل السيرفر تُسقط الجلسات ويتلقى العميل `session_not_active`.
- **قرار ثانٍ:** لا حاجز إطارات أثناء `suspended` — إطار واحد لكل مشاهد (`queueScreenFrame`) وإسقاط معدود في `airemote_relay_frame_drops_total`.
- **D1–D29:** راجع `docs/DECISIONS-LOG.md` (تذاكر العرض، `rk`، الأدوار، التدقيق، `VERSION` كمصدر وحيد…).

---

## 6) المتبقي

1. **T11 الشاشة الثانية** — محجوب: المضيف بشاشة واحدة (1097×617)؛ `svga.numDisplays="2"` مضبوط في vmx WIN11 (نسخة احتياطية `.vmx.bak-20261102`) وسجل VMware يؤكد شاشتين بينما الضيف يُنشّط واحدة. يُغلق بشاشة مضيف ثانية أو إقلاع `gui` ناجح. **لا PASS بلا شاشتين (D22).**
2. **هامش T18** — 1722ms من 1800: أي عمل على مسار الالتقاط يوجب إعادة قياس.
3. **قياس شبكة حقيقية بفيديو (WAN/ZeroTier)** — كل الأرقام الحالية محلية/LAN.
4. **تجربة 5–10 مستخدمين خارجيين (أسبوعان)** — لم تبدأ؛ الموجود تمرين جاف محلي.
5. **ملاحظات إصدار للخط 3.10–3.11.7** — آخرها 3.9.0.
6. **بندان بانتظار قرار المالك:** استمرارية جلسات relay بعد إعادة التشغيل · صوت داخل الجلسة (المكالمة ثنائية الاتجاه غير قابلة للتنفيذ تقنياً — راجع مراجعة 2026-10-24).

---

## 7) أدوات لا تُستبدل

`tools\lab\devs.cjs` (حالة الأجهزة) · `tools\lab\lab.cjs` (جلسة API) ·
`tools\lab\a2a\` — `t-first-msg.cjs` · `t-home-key.cjs` · `t-offer-lifecycle.cjs` · `t12-clipboard.cjs` · `t13-resume.cjs` · `t10-rotation.cjs` · `measure-stream.cjs` · `check-first-frame` (في `scripts/`) ·
`vmguest.cjs` (تشغيل داخل الضيفين، يُنقّي الأسرار: `probe` · `ps <vm> <file.ps1>` · `shot` · `copyIn/copyOut`) ·
`patch.cjs` (ترقيع آمن: يرفض التكرار أو الانكماش) · `mirror-sync.cjs` (مرآة للمساعدين) ·
`grant-capture.cjs` (إذن التقاط أندرويد) · `sign-apk.ps1` · `build-server.ps1` · `swap-debug.ps1`.

**بوابات (`scripts/`):** `verify.js` (42 خطوة) · `check-version-consistency.cjs` · `scan-ui-colors.cjs` · `check-contrast.cjs` · `release-manifest.js --verify` · `check-first-frame.cjs`.

---

## 8) سير العمل (إلزامي)

1. **تعديل المستودع** عبر `node tools\lab\a2a\patch.cjs <spec.json>` — والمواصفة تُكتب **بلا BOM** (Node لا `Set-Content -Encoding UTF8`). البديل الآمن: سكربت Node بفحص «مطابقة واحدة».
2. **شريحة واحدة = التزام واحد** + دليل في `outputs/verify-<date>/` + `CHANGELOG` + `PROJECT_STATE` + **42/42**.
3. **إن غيّرت كوداً:** ارفع `VERSION` + 4 `package.json` + `versionCode` ثم:
   - سيرفر: `.\tools\lab\a2a\build-server.ps1` ثم مثبّت `/S` ثم تشغيل التطبيق.
   - وكيل ويندوز: `cd packages\agent-desktop; $env:CSC_IDENTITY_AUTO_DISCOVERY='false'; .\node_modules\.bin\electron-builder.cmd --win --x64` ثم `vmguest.cjs copyIn` + `ps <vm> swap-debug.ps1`.
   - APK: `cd packages\android-agent; $env:JAVA_HOME='D:\autoclaw projects\offline-build-tools\android-toolchain\jdk'; & 'D:\...\gradle\bin\gradle.bat' --offline --no-daemon :app:assembleRelease` ثم `.\tools\lab\a2a\sign-apk.ps1` ثم `adb install -r`.
   - ثم `node scripts\release-manifest.js` و`--verify`.
4. **بعد كل تثبيت APK:** أعد منح التقاط الشاشة من «معالج التهيئة» في التطبيق.
5. **التزامات Git بالإنجليزية**، محلية فقط، ولا `push`.

---

## 9) التفويض للمساعدين — لا تعتمد على الحدس

**القيود المقيسة:** أدوات ملفات المساعد محصورة في مجلد مساحة العمل؛ `D:\` ممنوع؛ الوصلة مرفوضة؛ الوكيل المؤقت بلا `exec`.

**الحل المعتمد:** مرآة المصدر داخل مساحة عملك:
```powershell
cd "<مجلد مساحة العمل>"
node "D:\autoclaw projects-new\AiRemote\tools\lab\a2a\mirror-sync.cjs"           # 457 ملفاً · 10.2 MB · 0.9s
node "D:\autoclaw projects-new\AiRemote\tools\lab\a2a\mirror-sync.cjs" --check
```
- الطفل يقرأ من `mirror/src` فقط (مسار نسبي) ويجيب بأرقام أسطر صحيحة — مُثبت.
- **لا تُكلّف طفلاً** ببناء/اختبار/adb/VMware أو بمسار `D:\` — سيفشل بـ`subagent_execution_failed`.
- التنفيذ والتعديل دائماً في الجلسة الرئيسية. التفاصيل: `docs/DELEGATION-AR.md`.

---

## 10) قواعد ملزمة (من أخطاء فعلية)

1. **Git محلي فقط** — لا remote ولا push.
2. **لا أسرار في المخرجات** — استخدم `vmguest.cjs` ولا تستدعِ `vmrun -gp` مرئياً.
3. **PowerShell 5.1 يقرأ UTF-8 كـANSI** ⇒ `Get-Content -Encoding UTF8` أو Node.
4. **الاقتباس:** استخدم `'...'`؛ الاقتباس المزدوج مع backtick يُفسَّر ويُتلف النص — ويكسر استبدالاً نصياً بصمت.
5. **لا PASS بلا دليل مكتوب (D22)** — القياس على الطبقة الصحيحة: `homeWorked` لا `gotKey`.
6. **أندرويد:** `am force-stop` يُعطّل خدمة الوصول ⇒ أعد `settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y` و`accessibility_enabled 1`.
7. **ويندوز:** بعد أي إقلاع لضيف، **أعد تشغيل الوكيل** وإلا خرج البثّ أسود زوراً (سطح الضيف سليم).
8. **توقيت:** قيم `datetime('now')` في SQLite هي **UTC بلا لاحقة** ⇒ اقرأها `replace(' ','T')+'Z'` وإلا انزاح الفارق بساعة المنطقة.
9. **القياس:** `measure-stream.cjs` والمضيف غير مشغول ببناء؛ `electron --screenshot` يقصّ ⇒ القياس عبر CDP.
10. **لا إعادة بناء لشيء يعمل**، ولا نقل لمجلدات البناء/الكاش (`bin/` · `.cache/` · `node_modules`) — تفصيلها في `ARCHIVE-MANIFEST.md`.
11. **بعد إعادة تشغيل المضيف:** TECNO يظهر offline زوراً ⇒ `adb shell am start -n com.airemote.agent/.MainActivity`.

---

## 11) قائمة تحقق الاستئناف (قراءة فقط — نفّذها الآن)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -6; git status --short
curl.exe -sk https://127.0.0.1:3001/health ; curl.exe -sk https://127.0.0.1:3001/ready
node tools\lab\devs.cjs
node scripts\verify.js
node scripts\check-version-consistency.cjs
node scripts\scan-ui-colors.cjs ; node scripts\check-contrast.cjs
node scripts\release-manifest.js --verify
node scripts\check-first-frame.cjs
(Get-Service 'VMware NAT Service').Status
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe' devices
```

**المتوقع:** شجرة نظيفة · `/health` = 3.11.7 · 4/4 online · **42/42** · ألوان 0 · تباين 22/22 · إصدار PASS · بيان 5 عناصر 3.11.7 موقّع ومطابق · أول إطار PASS · NAT Running · adb يرى `emulator-5554` و`12927374CM001019`.

---

## 12) مخرجاتك المطلوبة الآن (بلا تنفيذ)

1. جدول تحقق §11: المتوقع مقابل الفعلي لكل بند.
2. أي انحراف بسطر الدليل (ملف/سطر أو ناتج أمر).
3. تأكيد أنك لم تُعدّل شيئاً وأنك في انتظار «ابدأ».

**مرجع سريع:** `docs/HANDOFF-2026-11-02-3.11.7-AR.md` (حزمة الاستئناف) · `docs/DELEGATION-AR.md` (التفويض) · `docs/DECISIONS-LOG.md` · `docs/AGENT-SESSION-TEST-MATRIX-AR.md`.
