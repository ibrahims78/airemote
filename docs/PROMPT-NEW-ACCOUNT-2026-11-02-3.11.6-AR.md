أنت المهندس المسؤول عن استئناف مشروع **AiRemote** على هذا الجهاز نفسه.

## قيد حاكم
**لا تُنفّذ أي أمر ولا تُعدّل أي ملف حتى يقول صاحب المشروع «ابدأ».**
اكتفِ بالتحقق القرائي (قراءة ملفات + أوامر قراءة فقط) ثم أعد تقريرك وتوقف.

---

## 1) اقرأ أولاً (بلا تنفيذ)
1. `docs/HANDOFF-2026-11-02-3.11.6-AR.md` ← حزمة التسليم الكاملة (الحالة، الأدوات، الأوامر المختبرة، المفتوح، نقطة الاستئناف).
2. `docs/DECISIONS-LOG.md` (D1–D30) · `docs/AGENT-SESSION-TEST-MATRIX-AR.md` (الحالة الحقيقية للاختبارات).
3. `PROJECT_STATE.md` (أول 40 سطراً) · `CHANGELOG.md` (أقسام 3.11.4–3.11.6) · `VERSION`.

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

**المتوقع:** HEAD `005148d` (أو التزام لاحق) · شجرة نظيفة · `/health` = **3.11.6** · وكيلا ويندوز 3.11.6 · المحاكي 3.11.6 · **TECNO offline** (سببه عنوان خادم محفوظ على ZeroTier) · بطارية **42/42** · ألوان **0** · تباين **22/22** · توحيد إصدار **PASS** · البيان **5 عناصر 3.11.6 · signature OK · all artifacts match** · بوابة أول إطار **PASS** · VMware NAT **Running** · adb يرى `emulator-5554` و`12927374CM001019`.

## 3) الحالة التي تستلمها (لا تُعِد بناءها)
- **3.11.6** مثبَّت: سيرفر + وكيلا ويندوز (WIN10/WIN11) + APK **vc46** على المحاكي و**TECNO**.
- **أُنجز ومُثبت:** أول إطار (2084→1722ms أسوأ حالة · ~615ms جاهز) · حوار الطلب (إطلاق/قرار على API 28) · **الحافظة داخل جلسة وكيل↔وكيل** (عيب `no-consent` أُصلح) · **T13: 1GiB باستكمال داخل الجلسة ببصمة متطابقة** · T10 تدوير · T16 RTL 360–1920 · بوابة أداء أول إطار.
- **أدوات جديدة:** `t10-rotation.cjs` · `t12-clipboard.cjs` + `set-clip.ps1` · `t13-resume.cjs` + `make-1g.ps1` · `scripts/check-first-frame.cjs`.
- **لا تُعِد تنفيذ** أي مما سبق؛ إن أعدت القياس فذلك للتحقق فقط.

## 4) المفتوح (بالترتيب) — نقطة الاستئناف
1. **TECNO offline:** التطبيق محفوظ على `wss://10.90.74.220:3001/ws` (ZeroTier غير عامل) والهاتف على Wi-Fi `192.168.1.100`.
   **الإصلاح:** من «معالج التهيئة» في التطبيق ضع `wss://192.168.1.25:3001/ws` واضغط «بدء» — أو شغّل ZeroTier على الهاتف. الهدف: `devs.cjs` يُظهر TECNO online.
2. **إثبات حوار الطلب على Android 10+ (TECNO = Android 14 / API 34):** طلب `access=view` من WIN10 مع ترك التطبيق في الخلفية ⇒ `adb logcat | findstr AiR-Offer` يجب أن يُظهر `canOverlay=false sdk=34` ثم `background start skipped (no overlay)` ثم إشعار `sessions_v1` بـfull-screen intent. (اختياري: `adb shell appops set com.airemote.agent SYSTEM_ALERT_WINDOW allow` لإثبات مسار `startActivity ok` أيضاً.)
3. **إذن الالتقاط على TECNO** (كل تثبيت يُسقطه): `node tools\lab\a2a\grant-capture.cjs 12927374CM001019` ⇒ ثم **T1 حيّ**: `t-first-msg.cjs` (فأرة/مفاتيح) و`t-home-key.cjs` (`homeWorked=true` — D22).
4. **لقطة أزرار أندرويد داخل الشريط:** `open-win-to-android.cjs` ثم `reveal-toolbar.ps1`/`place-agent.ps1` ولقطة نافذة WIN10.
5. **T11 شاشة ثانية** (يحتاج إيقاف ضيف + إضافة شاشة في VMware).
6. **قرارات المالك:** Authenticode · الترخيص · WebRTC.

## 5) قواعد ملزمة
- **Git محلي فقط** — لا remote ولا push.
- **لا تُطبع أي سرّ:** `%APPDATA%\AiRemote\lab-credentials.txt` · `lab-probe.json` · `signing\keystore-password.txt` · رموز الأجهزة/JWT. استخدم `tools\lab\a2a\vmguest.cjs` (يُنقّي) ولا تستدعِ `vmrun -gp` في مخرجات مرئية.
- **PowerShell 5.1** يقرأ UTF-8 كـANSI ⇒ `Get-Content -Encoding UTF8` أو Node. **استخدم `'...'`**؛ الاقتباس المزدوج مع backtick يُفسَّر ويُتلف النص.
- **أدوات الملف لا تكتب خارج مساحة العمل** ⇒ عدّل المستودع عبر `node tools\lab\a2a\patch.cjs <spec.json>` (يرفض إن لم يجد النص مرة واحدة أو إن انكمش الملف).
- **شريحة واحدة = التزام واحد** + دليل في `outputs/verify-<date>/` + `CHANGELOG` + `PROJECT_STATE` + بوابات 42/42.
- **لا إعادة بناء لشيء يعمل**؛ أوامر البناء المختبرة في §4 من حزمة التسليم.
- **كل إعلان PASS يحتاج دليلاً مكتوباً** (D22): لا «تحكّم يعمل» بوصول الرسالة، بل `homeWorked=true`.

## 6) مخرجاتك المطلوبة الآن (بلا تنفيذ)
1. جدول تحقق §2: المتوقع مقابل الفعلي لكل بند (منفّذ/غير منفّذ + السبب).
2. أي انحراف عن الحزمة (إن وُجد) بسطر الدليل.
3. تأكيد أنك لم تُعدّل شيئاً وأنك في انتظار «ابدأ».
