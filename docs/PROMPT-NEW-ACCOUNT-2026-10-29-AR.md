# الأمر الجاهز — الحساب الجديد (2026-10-29 · بعد ختام R6)

> انسخ ما بين السطرين كما هو وأرسله كأول رسالة في الحساب الجديد.

---

أنت المهندس المسؤول عن متابعة مشروع **AiRemote** من نقطة توقف محددة. اقرأ هذا كله قبل أي أمر، ثم نفّذ.

## 1) الموقع والحالة
- المستودع: `D:\autoclaw projects-new\AiRemote` · الفرع: `checkpoint/3.8.1-2026-10-26`.
- آخر التزام: `6851295` — الشجرة **نظيفة**. لا `push` ولا remote.
- **R0–R5 مغلقة**، و**R6 مغلقة في الواجهة**: **0 صنف لون صريح** في كامل `src` (كانت 1061).
- **السيرفر المثبَّت 3.8.13** على `https://127.0.0.1:3001`.
- **الأجهزة الأربعة على 3.8.13 وكلها online**: WIN10-VM · WIN11-VM · Android-Emulator (Android 9) · TECNO-KL4 (Android 14).
- البوابات الحالية: `scan-ui-colors` = **0** · `check-contrast` **22/22** · `verify.js` **21/21** · `tsc` 0 · `vite build` ناجح · مصفوفة 72 لقطة = **0 مخالفة**.

## 2) اقرأ أولاً (بالترتيب)
1. `docs/HANDOFF-2026-10-29-R6-CLOSED-AR.md` — حزمة التسليم الكاملة (البيئة، الأدوات، المفتاح، الأجهزة، الفخاخ).
2. `PROJECT_STATE.md` — §0.1 و§0.2 فقط.
3. `docs/PLAN-STATUS.md` — §5 الأوامر و§6 المهمة التالية.
4. `docs/UI-INVENTORY.md` — §2.1 (كل الملفات 0).
5. `outputs/verify-2026-10-29/r6-interactive/REPORT-AR.md` — آخر شريحة وأدلتها.
6. `docs/ANDROID-TOOLCHAIN-AND-KEY-AR.md` — JDK/apksigner/المفتاح وأوامر التوقيع.

## 3) المطلوب بالترتيب (لا تنتقل قبل إغلاق السابق)
أ) **تحقق استئناف:** `git log --oneline -3` · `git status --short` · `node scripts/scan-ui-colors.cjs` (0) · `node scripts/check-contrast.cjs` (22/22) · `node scripts/verify.js` (21/21). ثم `adb devices -l` وتأكيد أن الأربعة **online** و`agentVersion` = 3.8.13.
ب) **دين i18n للسطحين:** إخراج **4224 حرفاً عربياً** مباشراً من `components/AiChatPanel.tsx` و`components/ScreenViewer.tsx` إلى `lib/i18n.ts` (مفاتيح `chat_*` و`viewer_*` في `ar` **و**`en`)، بلا تغيير سلوك.
ج) **إثبات بصري لتبويب «المراقبة»:** لقطات `/devices/:id?tab=monitor` فاتحة وداكنة مع وكيل متصل (WIN10 أو المحاكي)، للتحقق من `MonitoringCharts` بعد ترميزها.
د) **R7 — التبعيات:** تنفيذ خطة R2 §9 (`fastify 4→5` و`axios ≥1.20`) خطوة خطوة، مع تشغيل البطارية بعد كل خطوة، وتوثيق أي كسر.
هـ) إن بقي وقت: إعادة بناء APK 3.8.13 ليحمل تغييرات R6 الأخيرة (الأوامر في `docs/ANDROID-TOOLCHAIN-AND-KEY-AR.md`).

## 4) قواعد ملزمة (قرارات المالك)
- **Git محلي فقط**: لا push، لا remote، لا حذف ملف/جهاز/مستخدم بلا موافقة صريحة.
- الترخيص **MIT** يبقى. **`lab-probe@local` يبقى** ولا تُدوَّر كلمته.
- **لا تطبع** محتوى `%APPDATA%\AiRemote\lab-credentials.txt` ولا `%APPDATA%\AiRemote\signing\keystore-password.txt` ولا أي رمز جهاز.
- **لا تشغّل سيرفراً على قاعدة `%APPDATA%\AiRemote-Server`** (المثبَّت يعمل عليها). اللقطات على قاعدة مؤقتة فقط.
- مفتاح أندرويد الإصدار موجود وصالح: `airemote-release.jks` (alias `airemote`) — لا تُنشئ مفتاحاً جديداً ولا تدوّر كلمة المرور بلا موافقة.

## 5) فخاخ مؤكدة
- `better-sqlite3` مبني لـElectron (ABI 119): شغّل `server.js` بـ`ELECTRON_RUN_AS_NODE=1` + `electron.exe`.
- `packages/server-desktop/static/` متعقَّب في git — لا تنسخ `dist` إليه؛ استخدم `scripts/dev-ui-serve.cjs`.
- في اللقطات: أقل من 9 ثوانٍ = شاشة إقلاع. استخدم `--wait=9000` أو أكثر.
- `useT()` تُرجع دالة جديدة كل render — لا تضعها في تبعيات `useCallback`/`useEffect`.
- `lib/i18n.ts`: أي مفتاح جديد في `ar` و`en` معاً؛ `TKey = keyof typeof T.ar`.
- `core.autocrlf=true`: اكتب بـLF.
- `Modal` يملك `aria-labelledby` ثابتاً — لا تفتح نافذتين معاً.
- عنوان وكيل Windows يجب أن يكون `wss://192.168.1.25:3001/ws` (لا `192.168.0.1`)؛ والملف الفعلي `%APPDATA%\airemote-agent-desktop\airemote-config.json`.
- حزمة الوكيل يجب أن تتضمن `lib/**/*` وإلا انكسر عند الإقلاع.
- في AutoClaw: أدوات الملفات محصورة في مجلد مساحة العمل؛ المستودع على `D:` يُقرأ/يُكتب عبر PowerShell.

## 6) معيار الإنجاز لكل شريحة
`tsc --noEmit` = 0 · `vite build` ناجح · `scan-ui-colors` بلا زيادة · `check-contrast` 22/22 · `verify.js` 21/21 · تحديث `PROJECT_STATE.md` + `CHANGELOG.md` + `docs/UI-INVENTORY.md` · لقطة/دليل في `outputs/verify-YYYY-MM-DD/` · التزام واحد واضح.

## 7) التقرير المطلوب
جدول (الملف | قبل | بعد | على المكتبة)، الأدلة بالأوامر والأرقام، ما لم يُنفَّذ ولماذا، ثم نقطة الاستئناف التالية بسطر واحد.

## 8) ابدأ الآن
```
cd 'D:\autoclaw projects-new\AiRemote'; git log --oneline -3; git status --short
node scripts/scan-ui-colors.cjs; node scripts/check-contrast.cjs
```
ثم أرسل خطة قصيرة (5 أسطر) قبل أول تعديل.

---
