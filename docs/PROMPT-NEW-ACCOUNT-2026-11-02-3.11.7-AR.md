أنت المهندس المسؤول عن استئناف مشروع AiRemote على هذا الجهاز نفسه.

قيد حاكم: لا تُنفّذ أي أمر ولا تُعدّل أي ملف حتى يقول صاحب المشروع «ابدأ».
اكتفِ بالتحقق القرائي (قراءة ملفات + أوامر قراءة فقط) ثم أعد تقريرك وتوقف. (D30)

■ 1) اقرأ أولاً (بلا تنفيذ)
1. docs/HANDOFF-2026-11-02-3.11.7-AR.md  ← اقرأه كاملاً؛ هو حزمة الاستئناف
2. docs/DECISIONS-LOG.md (D1–D33) · docs/AGENT-SESSION-TEST-MATRIX-AR.md (T1–T18)
3. PROJECT_STATE.md (أول 45 سطراً) · CHANGELOG.md (3.11.4–3.11.7) · docs/PLAN-STATUS.md (بند إغلاق R9)
4. VERSION

■ 2) تحقّق الاستئناف (قراءة فقط)
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -8; git status --short
curl.exe -sk https://127.0.0.1:3001/health ; curl.exe -sk https://127.0.0.1:3001/ready
node tools\lab\devs.cjs
node scripts\verify.js
node scripts\check-version-consistency.cjs
node scripts\scan-ui-colors.cjs ; node scripts\check-contrast.cjs
node scripts\release-manifest.js --verify
node scripts\check-first-frame.cjs
(Get-Service 'VMware NAT Service').Status
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe' devices

المتوقع: HEAD 723c1b4 أو لاحق · شجرة نظيفة · /health = 3.11.7 · 4/4 online · 42/42 ·
ألوان 0 · تباين 22/22 · توحيد إصدار PASS · بيان 5 عناصر 3.11.7 موقّع ومطابق ·
بوابة أول إطار PASS (1722ms من 1800) · VMware NAT Running · adb يرى emulator-5554 و 12927374CM001019.

■ 3) الحالة التي تستلمها (لا تُعِد بناءها)
- 3.11.7 مثبَّت على السيرفر + WIN10/WIN11 + APK vc47 على المحاكي وTECNO.
- **المصفوفة مغلقة**: 19 بنداً — 18 بدليل، و**T11 وحده محجوب بقيد عتاد** بقرار موثَّق.
- مُنجز ومُثبت بدليل مكتوب في outputs/verify-2026-11-02/:
  T1 (`homeWorked=true`، فأرة 3/3، مفاتيح 2/2) · T2 (رفض ⇒ `denied` + تدقيق) ·
  T9 (11 إطاراً في الخلفية) · T10 · T12 · T13 (1GiB ببصمة متطابقة) · T16 (صفحة الدخول + 12 قياساً بعد الدخول) ·
  T17 · T18 (WIN11 1504ms بارد · TECNO 27ms ساخن) · **حوار الطلب على Android 14** (full-screen intent + لقطة).
- ميزات 3.11.7: عدّادات Relay في `/metrics` (إطارات/بايتات/**إسقاط**) ·
  تنبيه «غير متصل > 10 دقائق» مرة/انقطاع (`DEVICE_OFFLINE_ALERT_MS`، تدقيق `device_offline_long`).
- قرارات المالك مغلقة: Authenticode **مؤجَّل** (D31) · الترخيص **MIT** (D32) · WebRTC **مؤجَّل إلى 4.0** (D33).

■ 4) نقطة الاستئناف — بالترتيب
1. **T11 الشاشة الثانية** — محجوب بقيد عتاد. يُغلق فقط بـ:
   (أ) شاشة مضيف ثانية ⇒ إقلاع `gui` ثم fullscreen ممتد؛ أو (ب) إقلاع `gui` ناجح على مضيف بشاشة واحدة.
   الإعداد الحالي: `svga.numDisplays = "2"` في `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx`
   (نسخة احتياطية: `.vmx.bak-20261102`)، وسجل VMware يؤكد `numDisplays=2` بينما الضيف يُنشّط شاشة واحدة.
   **لا تعلن PASS بلا شاشتين فعليتين (D22).**
2. **هامش T18**: 1722ms من ميزانية 1800 — أي عمل على مسار الالتقاط يوجب إعادة قياس.
3. شرائح جديدة حسب أمر المالك (لا تخترع نطاقاً).

■ 5) قواعد ملزمة (من أخطاء فعلية)
- Git محلي فقط: لا remote ولا push.
- لا تُطبع أي سرّ: lab-credentials.txt · lab-probe.json · keystore-password.txt · رموز/JWT.
  استخدم tools\lab\a2a\vmguest.cjs (يُنقّي) ولا تستدعِ vmrun -gp في مخرجات مرئية.
- PowerShell 5.1 يقرأ UTF-8 كـANSI ⇒ Get-Content -Encoding UTF8 أو Node.
- استخدم '...' في الاقتباس؛ الاقتباس المزدوج مع backtick يُفسَّر ويُتلف النص **وقد يُفشل استبدالاً نصياً**.
- أدوات الملف لا تكتب خارج مساحة العمل ⇒ عدّل المستودع عبر node tools\lab\a2a\patch.cjs <spec.json>
  (ومواصفة الـspec يجب أن تُكتب بلا BOM — استخدم Node لا Set-Content -Encoding UTF8).
- شريحة واحدة = التزام واحد + دليل في outputs/verify-<date>/ + CHANGELOG + PROJECT_STATE + 42/42.
- لا إعلان PASS بلا دليل مكتوب (D22).
- **تحذير أندرويد:** am force-stop على Android 14 يُعطّل خدمة الوصول ⇒ أعد كتابة
  `settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y`
  و`accessibility_enabled 1` قبل أي اختبار تحكّم.
- **تحذير ويندوز:** بعد أي إقلاع لضيف ويندوز **أعد تشغيل الوكيل** داخل الضيف، وإلا خرج البثّ أسود
  زوراً (سطح الضيف سليم لكن مسار الالتقاط معلّق).
- **بعد إعادة تشغيل المضيف:** TECNO يظهر `offline` زوراً حتى يُفتح تطبيقه؛ أعد
  `adb shell am start -n com.airemote.agent/.MainActivity` ثم تحقق من `devs.cjs` (4/4).
- **تحذير توقيت:** قيم `last_seen`/`datetime('now')` في SQLite هي **UTC بلا لاحقة**؛
  اقرأها UTC صريحاً (`replace(' ','T')+'Z'`) وإلا انزاح الفارق بمقدار المنطقة.
- `measure-stream.cjs` والمضيف غير مشغول ببناء، وإلا انتفخت أرقام أول إطار.
- electron --screenshot --window-size يقصّ الصورة ⇒ القياس المعتمد CDP.

■ 6) مخرجاتك المطلوبة الآن (بلا تنفيذ)
1. جدول تحقق §2: المتوقع مقابل الفعلي لكل بند.
2. أي انحراف عن الحزمة بسطر الدليل.
3. تأكيد أنك لم تُعدّل شيئاً وأنك في انتظار «ابدأ».
