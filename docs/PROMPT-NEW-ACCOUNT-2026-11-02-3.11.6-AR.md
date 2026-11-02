أنت المهندس المسؤول عن استئناف مشروع **AiRemote** على هذا الجهاز نفسه.

## قيد حاكم
**لا تُنفّذ أي أمر ولا تُعدّل أي ملف حتى يقول صاحب المشروع «ابدأ».**
اكتفِ بالتحقق القرائي (قراءة ملفات + أوامر قراءة فقط) ثم أعد تقريرك وتوقف.

---

## 1) اقرأ أولاً (بلا تنفيذ)
1. `docs/HANDOFF-2026-11-02-3.11.6-AR.md` — حزمة التسليم الكاملة + **«تحديث ما بعد الحزمة» في أعلاها**.
2. `docs/DECISIONS-LOG.md` (D1–D30) · `docs/AGENT-SESSION-TEST-MATRIX-AR.md`.
3. `PROJECT_STATE.md` (أول 40 سطراً) · `CHANGELOG.md` (3.11.4–3.11.6) · `VERSION`.

## 2) تحقّق الاستئناف (قراءة فقط)
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

**المتوقع:** HEAD `27c5cda` أو لاحق · شجرة نظيفة · `/health` = **3.11.6** · **4/4 online** (WIN10 · WIN11 · Android-Emulator · **TECNO-KL4**) · بطارية **42/42** · ألوان 0 · تباين 22/22 · توحيد إصدار PASS · بيان 5 عناصر 3.11.6 موقّع ومطابق · بوابة أول إطار PASS · VMware NAT Running · adb يرى `emulator-5554` و`12927374CM001019`.

## 3) الحالة التي تستلمها (لا تُعِد بناءها)
- **3.11.6** مثبَّت على السيرفر + WIN10/WIN11 + APK **vc46** على المحاكي و**TECNO**.
- **أُنجز ومُثبت:** أول إطار (2084→1722ms أسوأ حالة · ~615ms جاهز) · **حوار الطلب على Android 14 = مُثبت** · الحافظة داخل جلسة وكيل↔وكيل (`no-consent` أُصلح) · **T13: 1GiB باستكمال ببصمة متطابقة** · T10 · T16 · بوابة أداء.
- **TECNO عاد online** بتغيير عنوان الخادم إلى `wss://192.168.1.25:3001/ws` (extra `server`).
- **أدوات:** `t10-rotation.cjs` · `t12-clipboard.cjs` · `t13-resume.cjs` · `t-first-msg.cjs` · `t-home-key.cjs` · `scripts/check-first-frame.cjs`.

## 4) نقطة الاستئناف — بالترتيب
1. **T1 حيّ (البند فوراً):** آخر قياس: فأرة **2/2** ومفاتيح **2/2** و20 إطاراً وصلت، لكن **`homeWorked=false`** لأن `force-stop` عطّل خدمة الوصول. أُعيد تفعيلها وتظهر الآن `Bound services: AiRemote Android`.
   **نفّذ:** `node tools\lab\a2a\t-home-key.cjs` ⇒ يجب `homeWorked=true` (D22). إن بقي false: تحقّق `dumpsys accessibility` ثم أعد `settings put secure enabled_accessibility_services ...` قبل الاختبار.
   وأزل إشعار «التحكّم معطّل» العالق بعد التحقق.
2. **لقطة أزرار أندرويد داخل الشريط:** `open-win-to-android.cjs` ثم `reveal-toolbar.ps1` ولقطة نافذة WIN10.
3. **T11 شاشة ثانية** (إيقاف ضيف + إضافة شاشة في VMware) — الوحيد المتبقي من المصفوفة.
4. **قرارات المالك:** Authenticode · الترخيص · WebRTC.

## 5) قواعد ملزمة
- **Git محلي فقط** — لا remote ولا push.
- **لا تُطبع أي سرّ:** `%APPDATA%\AiRemote\lab-credentials.txt` · `lab-probe.json` · `signing\keystore-password.txt` · رموز/JWT. استخدم `vmguest.cjs` ولا تستدعِ `vmrun -gp`.
- **PowerShell 5.1:** `Get-Content -Encoding UTF8`؛ استخدم `'...'`؛ الاقتباس المزدوج مع backtick يُفسَّر ويُتلف النص.
- **أدوات الملف لا تكتب خارج مساحة العمل** ⇒ عدّل المستودع عبر `node tools\lab\a2a\patch.cjs <spec.json>`.
- **شريحة واحدة = التزام واحد** + دليل في `outputs/verify-<date>/` + CHANGELOG + PROJECT_STATE + 42/42.
- **لا PASS بلا دليل** (D22).
- **تذكير تشغيلي:** `am force-stop` يُعطّل خدمة الوصول على Android 14 ⇒ بعد أي force-stop أعد تفعيلها قبل أي اختبار تحكّم.

## 6) مخرجاتك المطلوبة الآن (بلا تنفيذ)
1. جدول تحقق §2: المتوقع مقابل الفعلي لكل بند.
2. أي انحراف عن الحزمة بسطر الدليل.
3. تأكيد أنك لم تُعدّل شيئاً وأنك في انتظار «ابدأ».
