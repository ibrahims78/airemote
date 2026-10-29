# R6 — تقرير الشريحة 16: تباين الشاشات الفعلي + `OverviewPage` + الدفعة الطرفية + البواقي

**التاريخ:** 2026-10-29 · **الفرع:** `checkpoint/3.8.1-2026-10-26` · **الأساس:** `12a476e`
**الحالة:** منفَّذ ومُتحقَّق · **البطارية:** 21/21 · **التباين الرمزي:** 22/22 · **`tsc`:** 0 · **`vite build`:** ناجح

---

## 1. الجدول المطلوب — الملف | قبل | بعد | على المكتبة

| الملف | قبل | بعد | على المكتبة |
|---|---:|---:|---|
| `pages/OverviewPage.tsx` (أصناف لون) | 0 | **0** | ✅ `Card`/`Badge`/`EmptyState`/`SkeletonRows`/`Skeleton`/`Alert`/`Button` |
| `pages/OverviewPage.tsx` (أحرف عربية مباشرة) | 856 | **0** | — (54 مفتاحاً × ar/en) |
| `components/CommandRunner.tsx` | 80 | **0** | جزئي: رموز المكتبة، بلا `Button` (قيد ارتفاع 7px) |
| `components/SettingsExtra.tsx` | 59 | **0** | ✅ رموز كاملة |
| `components/PTYTerminal.tsx` | 55 | **0** | كروم على الرموز · xterm يبقى كائنه |
| `components/SSHTerminal.tsx` | 44 | **0** | كروم على الرموز · xterm يبقى كائنه |
| `components/ToastContainer.tsx` | 16 | **0** | ✅ رموز الحالة |
| `components/CommandPalette.tsx` | 16 | **0** | ✅ رموز |
| `App.tsx` | 9 | **0** | ✅ رموز |
| `components/ExecConsole.tsx` | 9 | **0** | ✅ رموز |
| `components/ErrorBoundary.tsx` | 7 | **0** | ✅ رموز |
| `pages/ScreenPopoutPage.tsx` | 1 | **0** | ✅ `bg-code` |
| `pages/DevicesPage.tsx` | 0 | **0** | إصلاح تباين (معرّف/IP) |
| `pages/SessionsPage.tsx` | 0 | **0** | إصلاح تباين (IP/شارات) |
| `components/ui/Input.tsx` | 0 | **0** | إصلاح placeholder `muted/70 → muted` |
| `control-room.css` · `index.css` | — | — | رموز خفيفة أُغمقت + placeholder رمزي |

**الإجمالي:** 1061 → **765** صنفاً صريحاً (−296) · **12** ملفاً على المكتبة (كان 11).
المتبقي: `AiChatPanel` 444 · `ScreenViewer` 281 · `MonitoringCharts` 40 — كلها بقرار مكتوب أو بند مستقل.

---

## 2. الأدلة بالأوامر والأرقام

| الدليل | الأمر | النتيجة |
|---|---|---|
| الأنواع | `cd packages/dashboard; npx tsc --noEmit` | 0 خطأ |
| البناء | `npx vite build` | ✓ 6.9s |
| بوابة الألوان | `node scripts/scan-ui-colors.cjs` | 1061 → **765** · 12 ملفاً |
| بوابة التباين الرمزي | `node scripts/check-contrast.cjs` | **22/22 PASSED** |
| البطارية | `node scripts/verify.js` | **21/21** (`battery.log`) |
| مصفوفة التباين | `node scripts/ui-audit-matrix.cjs --out=outputs/verify-2026-10-29/r6-contrast --wait=15000` | 72 لقطة · 0 بيضاء · **380 → 112** مخالفة |

### 2.1 المصفوفة: 9 صفحات × 4 عروض × سمتين
`devices, notifications, help, ai, setup, settings, sessions, users, audit` × `360×800, 768×1024, 1280×900, 1920×1080` × `light, dark`.

- **72/72** لقطة موجودة وغير بيضاء (أصغر ملف 18KB، أكبر 285KB).
- الفحص محسوب من الأنماط: تلوين النص، تركيب خلفيات السلاسل، توقّف التدرّج الأسوأ، وحالات `<input>::placeholder`، مع استثناء `:disabled` (عدّاد منفصل) وتمييز `url()`/`background-clip:text` كمراجعة يدوية (**0** حالات).
- **قبل الإصلاح:** 380 مخالفة في 30 نمطاً مميزاً.
- **بعد الإصلاح:** **112** مخالفة، كلها في **9 أنماط داخل `AiChatPanel`** على صفحة `/ai` وحدها (المستثنى بقرار `ADR-R6-INTERACTIVE-SURFACES-AR.md`). الصفحات الثماني الأخرى: **صفر** في كل عرض وسمة.
- أخطر ما أُصلح: `text-muted/70` (3.57–3.59:1) في 6 مواضع، `placeholder` عالمي `#94a3b8` بقاعدة `!important` (2.29–2.56:1)، شارات الجلسات (3.42–4.24:1)، أفاتار المستخدم (3.94:1)، `--cr-muted-2` في الفاتح (3.0–4.13:1).

**ملفات الأدلة:** `contrast.json` (كامل) · `scan.txt` (ملخص + كل مخالفة) · 72 صورة PNG.

---

## 3. `OverviewPage` — أكبر بند i18n

- **856 → 0** حرفاً عربياً مباشراً. أُضيفت **54 مفاتيح `ov_*`** إلى `lib/i18n.ts` في `ar` **و**`en` معاً (القاموسان متطابقان؛ `TKey` ما زال `keyof typeof T.ar`).
- الاستبدال: `Card` للحاوية الحية والسجل، `Badge` للحالة (`LIVE/READY/STANDBY` بنبرات success/info/neutral)، `EmptyState` للفراغين، `SkeletonRows` لتحميل السجل، `Skeleton` لبطاقات الأسطول، `Alert` + `Button` للخطأ.
- **حالة خطأ حقيقية:** `deviceStore.fetchDevices` كان يبتلع الخطأ (`catch {}`). صار يضبط `error: 'load_failed'` ويصفّره عند النجاح، والصفحة تعرض `Alert` بزر «إعادة المحاولة» ولا تدّعي «لا توجد أجهزة» عند الفشل. أخطاء الجلسات صارت `Alert` بدل `catch {}` الصامت.
- لم تُمس منطقية البث/الفواصل/الروابط، ولا `LivePreviewBoard`.

---

## 4. الدفعة الطرفية — القرار المكتوب

`docs/ADR-R6-TERMINAL-BATCH-AR.md`: **إبقاء السطح، دمج الألوان**.
xterm يملك `theme` كائناً سداسياً لا يقبل `var(--…)`، و`CommandRunner` لوحة `pre` متدفقة، وأزرار الكروم 7×7px لا تحتمل `Button`. لذلك: الكروم كله على الرموز، والاستثناء الوحيد هو كائن xterm موثّق.

---

## 5. ما لم يُنفَّذ ولماذا

1. **`AiChatPanel` (444) و`ScreenViewer` (281):** بقرار مكتوب في `ADR-R6-INTERACTIVE-SURFACES-AR.md` (كروم إلزامي + قائمة استثناء للمحتوى). الـ112 مخالفة المتبقية كلها هنا؛ تحتاج شريحة `isLight` كاملة لا رقعة.
2. **`MonitoringCharts` (40):** خارج نطاق الدفعة (رسوم SVG بألوان سلاسل) — بند مستقل.
3. **بناء 3.8.13:** لم يُبدأ. المثبَّت الحالي 3.8.12 ولا يحمل R5/R6.
4. **لقطات النوافذ (Modal):** أُعيد التحقق من الصفحات فقط؛ نوافذ `devices` بقيت على أدلة الشريحة 15.
5. **`lab-credentials.txt`:** لم يُقرأ ولا يُطبع. `lab-probe@local` لم يُمس. لم يُشغّل أي سيرفر على `%APPDATA%\AiRemote-Server`.

---

## 6. نقطة الاستئناف التالية (سطر واحد)

**`MonitoringCharts` (40) ثم بناء 3.8.13 وتثبيته، وبعدها شريحة `AiChatPanel`/`ScreenViewer` وفق ADR الأسطح التفاعلية.**
