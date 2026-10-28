# الأمر الاحترافي للحساب الجديد

> انسخ كل ما بين السطرين وابدأ به المحادثة الأولى في الحساب الجديد.

---

افتح مشروع AiRemote وأكمل من حيث توقف الحساب السابق.

**المسار:** `D:\autoclaw projects-new\AiRemote`

## اتبع هذا الترتيب حرفياً قبل أي تنفيذ

1) اقرأ `D:\autoclaw projects-new\_MASTER_CONTEXT.md`
2) اقرأ `PROJECT_STATE.md` — خصوصاً الشريط أعلى §0.1 ثم §0.2 (نقطة الاستئناف)
3) اقرأ `docs\PLAN-STATUS.md` — سجل المراحل والقيود البيئية وأوامر التحقق
4) اقرأ `docs\HANDOFF-2026-10-28-R6-AR.md` — الحالة الكاملة، الأدوات، البيئة، وما تبقّى من R6
5) اقرأ `docs\PROTOCOL-FILE-TRANSFER-AR.md` §1–§7 (نقل الملفات: الحالات، الرسائل، الحدود)
6) لخّص لي في ثلاثة أسطر: أين توقفنا، وما المهمة التالية بالضبط، ثم ابدأ فوراً.

## التحقق قبل البدء (إلزامي)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -3        # يجب أن يبدأ بـ f4fbc50 أو أحدث
git status --short          # يجب أن يكون فارغاً
node scripts/verify.js      # المتوقع: ALL VERIFICATION STEPS PASSED (21/21)
node scripts/check-contrast.cjs   # المتوقع: ALL CONTRAST CHECKS PASSED (22/22)
node scripts/list-devices.cjs     # الأجهزة الأربعة على 3.8.12
node scripts/scan-ui-colors.cjs   # جرد الامتثال: 1324 صنفاً / 5 ملفات
```

إن لم تظهر 21/21 فلا تبدأ أي تطوير — أبلغني بالنتيجة أولاً.
إن ظهر جهاز بإصدار قديم فهذا كاش `/api/devices` وقد أُصلح في R5؛ تحقّق من `/api/devices` ثم من قاعدة البيانات.
TECNO كان **offline** آخر فحص (تصحيح لاسلكي) — أعد فحصه قبل أي استنتاج.

## الحالة التي تستلمها

- **R0/R1/R2/R3/R4 مُغلقة.** R4 (Relay) مغلقة على السيرفر: آلة حالة `requested→active→suspended→closed` مع `denied/expired`، رمز أحادي الاستخدام لكل طرف (SHA-256، 90s)، سقف 20 جلسة، تعليق/استئناف 15s، قياس p95 4.39ms بفقد 0%.
- **R5 مُغلقة في المصدر:** جدول `file_transfers`، تجزئة 1MB، كتابة مُوضَّعة، استكمال بنقطة محفوظة، SHA-256 من الجهاز ونشر ذرّي، حارس `..`/UNC/أسماء محجوزة/symlinks، سياسة skip/rename/replace، حد سرعة، دفعات صغيرة (`ft_put_many`). البوابة: **10 GiB** (420s، 24.4 MiB/s) · **10,000 ملف** (131s) · قطع عند 50% واستكمال بنفس البصمة · قرص ممتلئ `disk_full` بلا ملف تالف · `..\..` مرفوض.
- **R6 قيد التنفيذ — 8 شرائح منجزة:** طابور النقل البصري · رموز دلالية (`index.css`) · مكتبة 12 مكوّناً (`components/ui`) · بوابة تباين 22/22 · شاشة الأجهزة · مساحة الجهاز · شاشة الجلسات · شاشة المستخدمون · جسر `--cr-*` في `control-room.css` · جرد امتثال رقمي.
- **المرجع البصري الملزم:** `docs/REDESIGN-2026-10-24-MOCKUP.html` — لوحة **teal** (`#38d6c4` داكن، `#0f8f84` فاتح). لا تختر لوناً من عندك.
- **الاختبارات:** بطارية 21 خطوة — `e2e-security` 20 · `e2e-contacts` 18 · `e2e-unattended` 34 · `e2e-device-permissions` 31 · `e2e-agent-session` 41 · **`e2e-file-transfer` 39** · **`e2e-devices-cache` 7** · **بوابة تباين 22**.
- **الإصدار 3.8.12** على السيرفر المثبَّت (`https://127.0.0.1:3001/health`) وWIN10 وWIN11 والمحاكي وTECNO. **المثبَّت لا يحمل R5/R6** — كل تحقق يجري من المصدر.
- **الشجرة نظيفة** على الفرع `checkpoint/3.8.1-2026-10-26`.

## أدوات جاهزة (لا تعِد بناءها)

```powershell
# لقطة شاشة موثوقة (Edge headless + CDP) — بديل نافذة المتصفح المتقطعة
#   1) مضيف تطوير: سيرفر مصدر + وكيل وهمي + مستخدم إداري
$env:ELECTRON_RUN_AS_NODE='1'; $env:DEV_UI_PASSWORD='DevUi1234!'
& '.\packages\server-desktop\node_modules\electron\dist\electron.exe' 'scripts\dev-ui-host.cjs'
#   2) خادم اللوحة المبنية
node scripts/dev-ui-serve.cjs
#   3) اللقطة
node scripts/ui-shot.cjs 'http://127.0.0.1:4180/devices' 'outputs\shot.png' '--theme=light' '--size=1280x900' '--login=dev@local:DevUi1234!'

# بوابة قبول R5 (10GB · 10k · استكمال · ENOSPC · ..)
$env:ELECTRON_RUN_AS_NODE='1'
& '.\packages\server-desktop\node_modules\electron\dist\electron.exe' 'packages/server-desktop/scripts/e2e-file-transfer-gate.cjs'

# بوابة التباين وجرد الامتثال
node scripts/check-contrast.cjs
node scripts/scan-ui-colors.cjs
```

## المهمة التالية: إكمال R6 (تجربة موحّدة)

بالترتيب:

1. **`FileManager` (77 صنفاً صريحاً)** — سطح الملفات الأكثر استخداماً، وآخر ألوان صريحة في مسار الملفات. حاسبه: `node scripts/scan-ui-colors.cjs`.
2. **`SettingsPage` (103)** ثم **`AuditPage` (111)** ثم **`HelpPage` (114)** ثم **`NotificationsPage` (49)** ثم **`AiPage` (41)** ثم **`SetupPage` (36)** ثم **`LoginPage`** — كل شاشة: رموز + مكتبة + حالات (تحميل/فارغ/خطأ) + لقطة 1280 فاتحة وداكنة.
3. **`AiChatPanel` (276)** و**`ScreenViewer` (244)** — قرار مطلوب: تحويل تدريجي أو استثناء مكتوب من بوابة «100%» (سطحان تفاعليان لا شاشات نماذج).
4. **النوافذ اليدوية** `AgentInstallModal` · `WolModal` · `PasswordModal` → `Modal` الموحّد.
5. **`docs/UI-INVENTORY.md`**: عمود «يستخدم المكتبة» لكل شاشة + حالة الحالات الإلزامية.
6. **المقاسات** 360/768/1280/1920 لكل شاشة محوّلة، و**تباين الشاشات الفعلي** (لا الرموز فقط).
7. **بناء 3.8.13** الذي يحمل R5/R6 وتثبيته — بند إصدار مستقل، لا تخلطه بالتطوير.

بعد R6: **R7** (تشغيل إنتاجي: `fastify 4→5`، `axios ≥1.20`، بناء/توقيع/نشر).

## قواعد لا تُخالف

- لا حذف ولا إعادة تسمية بلا موافقة صريحة.
- لا `push` ولا GitHub Release ولا تغيير إعدادات مستودع — العمليات الخارجية لي بيدي.
- الشهادة والتوقيع والترخيص تبقى كما هي (مؤجلة بقرار مكتوب).
- لا `pnpm install` عادي: استخدم `pnpm install --ignore-scripts`.
- كل خطوة: تُختبر، تُوثَّق في `outputs/verify-YYYY-MM-DD/`، ويُحدَّث `PROJECT_STATE` و`CHANGELOG` و`docs/PLAN-STATUS.md`، ثم التزام محلي واحد واضح الرسالة.
- لا تقل «تم» قبل دليل: أمر نُفِّذ أو ملف نتيجة أو لقطة شاشة.
- التقارير بالعربية، والكود والأوامر بالإنجليزية.

## بيئة يجب أن تعرفها قبل أن تلمس شيئاً

- السيرفر المثبَّت لا يحمل كود المصدر: كل تحقق يجري بتشغيل `server.js` من المصدر عبر اختبارات e2e (Electron + `ELECTRON_RUN_AS_NODE=1`).
- `better-sqlite3` مبني لـElectron: لا تشغّل اختبارات `server-desktop` بـNode العادي.
- الأندرويد: المحاكي `emulator-5554` يحتاج `adb -s emulator-5554 reverse tcp:3101 tcp:3101` بعد كل إعادة تشغيل adbd، وجسر `python %APPDATA%\AiRemote\android-bridge-local.py` (v2 بلا مهلة خمول). TECNO على التصحيح اللاسلكي `192.168.1.100:41329`.
- مفتاح توقيع APK مفقود: أي تحديث أندرويد يحتاج إزالة+تثبيت ثم إعادة منح الصلاحيات — لا تُزيل شيئاً بلا موافقتي.
- الـVMان: Win10 `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` · Win11 `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx`؛ تحديث الوكيل الناجح: `taskkill` ثم نسخ `exe` + `app.asar` ثم تشغيل.
- `%APPDATA%` غير معرّفة في بعض جلسات PowerShell — استخدم `C:\Users\admin\AppData\...` حرفياً.
- بيانات المختبر والأسرار (`lab-credentials.txt`، `lab-probe.json`، رموز الأجهزة) لا تُطبع ولا تُرفع.
- ملاحظات أدوات: فلتر الأسرار يستبدل `Bearer ` عند كتابة الملفات — ابنِ النص بالتسلسل؛ ونهايات الأسطر مختلطة في ملفات الواجهة — استخدم `indexOf` لا أنماط `\n`.

ابدأ الآن بالتحقق ثم بمهمة R6 الأولى (`FileManager`)، وأبلغني عند أول عائق حقيقي لا عند كل خطوة.
