# ADR — R6 · الدفعة الطرفية: قرار الدمج أو الإبقاء

**التاريخ:** 2026-10-29 · **الحالة:** معتمد ومُنفَّذ
**النطاق:** `CommandRunner.tsx` · `SettingsExtra.tsx` · `PTYTerminal.tsx` · `SSHTerminal.tsx`
**الأساس:** بوابة `scripts/scan-ui-colors.cjs` (1061 → 765) وسياسة `docs/ADR/R6-INTERACTIVE-SURFACES-AR.md`.

---

## 1. القرار في سطر لكل ملف

| الملف | قبل | بعد | القرار |
|---|---:|---:|---|
| `components/CommandRunner.tsx` | 80 | **0** | **إبقاء التخطيط، دمج الألوان**: سطح طرفية دائم الداكن؛ الكروم يستهلك رموز المكتبة (`surface/surface2/line/ink/muted/primary/success/warning/danger/info`) و`bg-code` للوحة الإخراج. لم تُستبدل الأزرار الصغيرة بـ`Button` لأن مقاسها 7×7px داخل شريط عنوان كثيف، و`Button` يفرض ارتفاع 28px. |
| `components/SettingsExtra.tsx` | 59 | **0** | **دمج كامل**: أقسام إعدادات عادية (2FA + مهام مجدولة) لا تحتاج سطح طرفية. كل اللوحة انتقلت إلى `canvas/surface/surface2/line/ink/muted/primary/success/warning/danger/info`، وحقول النص إلى نمط `Input` نفسه. |
| `components/PTYTerminal.tsx` | 55 | **0** | **إبقاء xterm، دمج الكروم**: شريط العنوان والحالة والقوائم على الرموز؛ لوحة xterm تبقى `bg-code`، و`theme` الخاص بـxterm يبقى كائناً JS بست عشري لأن واجهة xterm لا تقبل متغيّرات CSS. |
| `components/SSHTerminal.tsx` | 44 | **0** | مثل `PTYTerminal` حرفياً. |

**المجموع:** 238 → **0**.

---

## 2. لماذا لم تُدمج الأسطح نفسها في المكتبة

1. **xterm.js يملك قماشه الخاص.** `theme` في xterm كائن ألوان سداسية يُقرأ عند الإنشاء؛ لا يمكن تمرير `var(--…)`. لذلك يبقى كائن الألوان استثناءً موثّقاً، وأي تغيير فيه يغيّر ألوان الطرفية لا ألوان الواجهة.
2. **`CommandRunner` لوحة إخراج نصية.** نص `pre` أحادي المسافة بخلفية `bg-code` (الرمز الجديد من الشريحة 15) هو التمثيل الصحيح؛ `Card` يضيف حداً وزوايا لا تناسب سجلاً متدفقاً.
3. **ارتفاعات الكروم مقيَّدة.** أزرار 7×7 و11×11 داخل شريط 40px؛ `Button` (h-7/h-9) كان سيكسر الشريط. أُبقيت العناصر، واستُبدلت ألوانها فقط.

---

## 3. خريطة التحويل (المطبَّقة)

| قبل | بعد | لماذا |
|---|---|---|
| `bg-navy-900` / `bg-[#0d1117]` | `bg-canvas` / `bg-code` | سطحان دلاليان بدل لون ماركة |
| `bg-navy-800` | `bg-surface` | شريط عنوان الطرفية |
| `bg-slate-700/30` | `bg-surface2` | أزرار الاختصارات والقوائم |
| `border-slate-700/50` | `border-line` | كل الحدود |
| `text-slate-300/200/100` | `text-ink` | النص الأساسي |
| `text-slate-400/500/600` | `text-muted` | النص الثانوي (5.71:1 داكن · 7.58:1 فاتح) |
| `text-brand-teal` | `text-primary` | مؤشر الموجّه/الحالة |
| `text-emerald-400` | `text-success` | نجاح |
| `text-red-400` / `bg-red-500/10` | `text-danger` / `bg-danger/10` | خطأ |
| `text-orange-400` | `text-warning` | مهلة |
| `text-yellow-400` | `text-warning` | اتصال جارٍ |
| `text-sky-400` / `text-brand-blue` | `text-info` | روابط وأزرار معلومات |
| `bg-white` (لوحة الطرفية) | `bg-code` | نفس السطح في السمتين |

**قاعدة:** لا لون ماركة (`navy-*`, `brand-*`, `slate-*`) في الملفات الأربعة؛ الحد الوحيد المسموح هو `theme` كائن xterm (سطور الإنشاء فقط).

---

## 4. التحقق

| البوابة | النتيجة |
|---|---|
| `scan-ui-colors.cjs` | الأربعة **0** · الإجمالي 1061 → **765** |
| `tsc --noEmit` | 0 |
| `vite build` | ناجح |
| `check-contrast` | 22/22 (لم تُمس الرموز) |
| لقطات | `outputs/verify-2026-10-29/r6-contrast/` (الصفحات التسع) |

**ملاحظة صدق:** `SettingsExtra` لم يكن له لقطة سابقة؛ تحوّله تحقّق عبر `tsc` + البناء + بوابة الألوان + ظهوره داخل `/settings` في مصفوفة اللقطات (12 → 1 مخالفة في الفاتح، والمتبقي نص `cr-page-subtitle` أُصلح بعدها).

---

## 5. ما لم يُنفَّذ هنا

`MonitoringCharts.tsx` (40) ليس ضمن الدفعة الطرفية — بند مستقل (رسوم SVG بألوان سلاسل). `AiChatPanel` (444) و`ScreenViewer` (281) بقرارهما المكتوب في `ADR-R6-INTERACTIVE-SURFACES-AR.md`.
