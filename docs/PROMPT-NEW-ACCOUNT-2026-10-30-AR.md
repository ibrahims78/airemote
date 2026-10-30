أنت المهندس المسؤول عن متابعة مشروع AiRemote من نقطة توقف محددة. اقرأ هذا كله قبل أي أمر، ثم نفّذ.

## 1) الموقع والحالة
- المستودع: `D:\autoclaw projects-new\AiRemote` · الفرع: `checkpoint/3.8.1-2026-10-26`.
- آخر التزام: `d424a7a` — الشجرة نظيفة. لا push ولا remote.
- **السيرفر المثبَّت 3.8.26** على `https://127.0.0.1:3001` (Electron 44.3.0 · fastify 5.12.7 · قاعدة عبر `node:sqlite`).
- الوكلاء: WIN10-VM وWIN11-VM على **3.8.25** · TECNO-KL4 وAndroid-Emulator على **3.8.25** (vc22) — الأربعة online.
- البوابات: `scan-ui-colors` = 0 · `check-contrast` 22/22 · `verify.js` **21/21** · tsc 0.

## 2) اقرأ أولاً (بالترتيب)
1. `docs/HANDOFF-2026-10-30-AR.md` — حزمة التسليم الكاملة (الإنجازات، الأدوات، الإعدادات، **12 فخّاً مؤكداً**، المتبقي).
2. `PROJECT_STATE.md` — §0.1 (آخر الإدخالات أعلى القسم).
3. `outputs/verify-2026-10-30/electron44-spike/REPORT-AR.md` — كيف أُثبتت الترقية.
4. `outputs/verify-2026-10-29/rec-av/REPORT-AR.md` و`rec-long/REPORT-AR.md` — أدلة التسجيل والتزامن.
5. `docs/ANDROID-TOOLCHAIN-AND-KEY-AR.md` — JDK/apksigner/المفتاح.

## 3) المطلوب بالترتيب (لا تنتقل قبل إغلاق السابق)
أ) تحقق استئناف: `git log --oneline -3` · `git status --short` · `node scripts/scan-ui-colors.cjs` (0) · `node scripts/check-contrast.cjs` (22/22) · `node scripts/verify.js` (21/21) · `curl.exe -sk https://127.0.0.1:3001/health` (3.8.26).
ب) **توحيد الإصدار 3.8.27:** ارفع الرقم في المواضع الثمانية، ابنِ: لوحة → `copy-dashboard` → `bundle.js` → `electron-builder` للسيرفر، وحزمة الوكيل، وAPK (vc23). ثم ثبّت: السيرفر محلياً، والوكيل عن بُعد عبر `scripts/push-file.cjs` + `tools/install-agent.bat`، وAPK عبر `adb install -r`.
ج) صحّح حقل `version` في `releases/manifest.json` (ما زال 3.8.25) ثم `node scripts/release-manifest.js --verify`.
د) بعد استقرار أسبوع: اجعل `node:sqlite` المحرّك الافتراضي (`AIREMOTE_DB=node`) وأزل `better-sqlite3` من الاعتماديات والحزمة.

## 4) قواعد ملزمة (قرارات المالك)
- Git محلي فقط: لا push، لا remote، لا حذف ملف/جهاز/مستخدم بلا موافقة صريحة.
- لا تُطبع محتويات: `%APPDATA%\AiRemote\lab-probe.json` · `lab-credentials.txt` · `signing\keystore-password.txt` · أي رمز جهاز.
- لا تُشغّل سيرفراً على قاعدة `%APPDATA%\AiRemote-Server` (المثبَّت يعمل عليها) — استخدم نسخة مؤقتة.
- مفتاح أندرويد الإصدار `airemote-release.jks` (alias `airemote`) موجود وصالح: لا مفتاح جديد ولا تدوير كلمة مرور.
- الترخيص MIT يبقى.

## 5) فخاخ مؤكدة (لا تُعاد اكتشافها)
- `server.bundle.js` هو ما يُحزم: بعد تعديل `server.js` شغّل `bundle.js` **ثم** `electron-builder`.
- `pnpm install` لـElectron يفشل في postinstall: ازرع `node_modules/electron/dist` من `.cache/electron44` واكتب `path.txt`.
- `better-sqlite3` مبنية لـABI 119: تحت Electron 44 يسقط المحوّل تلقائياً إلى `node:sqlite` (سطر `[db] … using node:sqlite`).
- قناة `/exec` تجرّد الاقتباسات المزدوجة (سقف 4000 حرف): أوامر بلا اقتباس، أو ادفع `.bat` فيه الاقتباسات.
- نقل الملفات: الشرائح بحجم `chunk_size` من الصف (1MB)، وسياسة التعارض ∈ `skip|rename|replace`.
- بعد كل تثبيت APK: إذن MediaProjection يُلغى — افتح التطبيق → «معالج التهيئة» → امنح الالتقاط → «بدء».
- جسر HTTP المحلي لا يمرّر WS (تظهر «في انتظار بيانات المراقبة»)؛ اللقطات عبر `scripts/shot-cdp.cjs` بعد تثبيت شهادة السيرفر في CurrentUser Root.
- `copy-dashboard.js` يلوّث `packages/server-desktop/static` المتتبَّع: أعدها بـ`git checkout --`.
- في أندرويد: يُقصّ شريط الحالة العلوي فقط إذا ثبت أنه أسود (≥90% عيّنات)، وتُضاف الإزاحة لإحداثيات اللمس.
- في التسجيل: `force_keyframe` كل 120ms ضروري، وإلا حُفظ عدد إطارات ضئيل.

## 6) معيار الإنجاز لكل شريحة
tsc 0 · vite build ناجح · scan-ui-colors بلا زيادة · contrast 22/22 · verify.js 21/21 · تحديث `PROJECT_STATE.md` + `CHANGELOG.md` · دليل في `outputs/verify-YYYY-MM-DD/` · **التزام واحد واضح** لكل شريحة.

## 7) التقرير المطلوب
جدول (الملف | قبل | بعد | أين ذهب)، الأدلة بالأوامر والأرقام، ما لم يُنفَّذ ولماذا، ثم نقطة الاستئناف التالية بسطر واحد.

## 8) ابدأ الآن
```
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -3; git status --short
node scripts/verify.js
curl.exe -sk https://127.0.0.1:3001/health
```
ثم أرسل خطة قصيرة (5 أسطر) قبل أول تعديل.
