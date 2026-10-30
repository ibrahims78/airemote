# أمر البدء للحساب الجديد (انسخه كما هو)

أنت المهندس المسؤول عن متابعة مشروع **AiRemote** من نقطة توقف محددة. اقرأ هذا كله قبل أي أمر، ثم نفّذ.

## 1) الموقع والحالة
- المستودع: `D:\autoclaw projects-new\AiRemote` · الفرع: `checkpoint/3.8.1-2026-10-26`
- آخر التزام: `5ffceb5` · الشجرة نظيفة · **Git محلي فقط: لا push ولا remote**.
- السيرفر المثبَّت **3.8.35** على `https://127.0.0.1:3001` · مخطط قاعدة **v2** · الأجهزة الأربعة online على **3.8.28**.
- **R7 مغلقة** ببوابتها الأربع. التالي **R8**.

## 2) اقرأ أولاً (بالترتيب)
1. `docs/HANDOFF-2026-10-30-R7-AR.md` — حزمة التسليم الكاملة (الحالة، الأدوات، الأجهزة، الإعدادات، **14 فخّاً**، المتبقي).
2. `PROJECT_STATE.md` §0.1 (أعلى الملف).
3. `docs/RUNBOOK-AR.md` — التمارين والأرقام المقيسة.
4. `docs/UPDATES-AR.md` · `docs/BACKUP-RESTORE-AR.md` · `docs/MIGRATIONS-AR.md` · `docs/RETENTION-AR.md` · `docs/OBSERVABILITY-AR.md` · `docs/ADR-ANDROID-FOUR-EDGE-INSETS-AR.md`.
5. آخر تقرير: `outputs/verify-2026-10-30/r7-closure/REPORT-AR.md`.

## 3) تحقق الاستئناف (قبل أي تعديل)
```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -3; git status --short
node scripts/scan-ui-colors.cjs      # 0
node scripts/check-contrast.cjs      # 22/22
node scripts/verify.js               # 27/27
curl.exe -sk https://127.0.0.1:3001/health   # 3.8.35
curl.exe -sk https://127.0.0.1:3001/ready    # ready:true
node scripts/list-devices.cjs        # 4 online
```
ثم أرسل خطة قصيرة (5 أسطر) قبل أول تعديل.

## 4) المطلوب
ابدأ **R8** — الشريحة الأولى من:
- **تعدد الشاشات** (اختيار/تبديل/عرض مركّب) — أكبر أثر مرئي، أو
- **الحافظة المتزامنة** باتجاه واحد + مفتاح عكسي — الأرخص إثباتاً.

اختر الأولى منهما بحسب ما تراه أقدر على إثباته بدليل مقيس، وأعلن اختيارك في سطر واحد.

## 5) قواعد ملزمة
- **Git محلي فقط**: لا push، لا remote، لا حذف ملف/جهاز/مستخدم بلا موافقة صريحة.
- **لا تُطبع** محتويات: `lab-probe.json` · `lab-credentials.txt` · `keystore-password.txt` · أي رمز جهاز أو JWT.
- **لا تُشغّل سيرفراً على قاعدة `%APPDATA%\AiRemote-Server`** (المثبَّت يعمل عليها) — استخدم نسخة مؤقتة.
- **مفتاح أندرويد** `airemote-release.jks` (alias `airemote`) صالح — لا مفتاح جديد ولا تدوير كلمة.
- الترخيص MIT يبقى. لا تغيّر قرارات §2.2 المؤجَّلة بلا قرار مكتوب في `PROJECT_STATE.md`.

## 6) فخاخ حرجة (التفصيل في §7 من حزمة التسليم)
- أدوات الملفات مقيّدة بمجلد العمل ⇒ تعديل المستودع عبر سكربت Node أو PowerShell.
- `$env:APPDATA` فارغ في بعض الأصداف ⇒ استخدم `C:\Users\admin\AppData\Roaming`.
- PowerShell 5.1 يقرأ UTF-8 كـANSI ⇒ استخدم `fs.readFileSync(...,'utf8')`.
- `taskkill` بلا `/F` لا يُنهي السيرفر.
- بعد أي تعديل في `server.js`/`lib/*`: `bundle.js` ثم `electron-builder`.
- اختبارات desktop تحتاج `electron.exe` مع `ELECTRON_RUN_AS_NODE=1`.

## 7) معيار إنجاز كل شريحة
`tsc 0` · بناء ناجح · 0 لون · 22/22 تباين · **27/27 بطارية** · تحديث `PROJECT_STATE` + `CHANGELOG` · دليل في `outputs/verify-<date>/<slice>/` · **التزام واحد** لكل شريحة + التزام إصدار.

## 8) التقرير المطلوب في نهاية الشريحة
جدول (الملف | قبل | بعد | أين ذهب) + الأدلة بالأرقام + ما لم يُنفَّذ ولماذا + نقطة استئناف بسطر واحد.