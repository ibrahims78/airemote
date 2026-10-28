# R6 — التنبيهات وAI والإعداد والدخول + تصحيح بوابة القياس (شريحة 12)

**التاريخ:** 2026-10-28 · **الحالة:** رموز مكتملة، المكتبة جزئية (موثّق أدناه)

---

## 1. النتيجة

| الملف | قبل | بعد | مكتبة |
|---|---|---|---|
| `pages/NotificationsPage.tsx` | 49 | **0** | ❌ |
| `pages/AiPage.tsx` | 41 | **0** | ❌ |
| `pages/SetupPage.tsx` | 36 | **0** | ❌ |
| `pages/LoginPage.tsx` | 0 | **0** | ❌ |
| `pages/DevicesPage.tsx` | 12 | **0** | ✅ |
| `pages/SessionsPage.tsx` | 2 | **0** | ✅ |
| `pages/UsersPage.tsx` | 2 | **0** | ✅ |
| `layouts/DashboardLayout.tsx` | 1 | **0** | ❌ |

**الإجمالي:** 919 ← **875** صنفاً صريحاً · 9 ملفات على المكتبة · **12 ملفاً بصفر أصناف**.

---

## 2. عيب حقيقي في «التنبيهات»

```tsx
<div className={clsx('w-8 h-8 rounded-lg ...', iconColor + '/15')}>
```

‏`iconColor` قيمته `text-warning`، فتصبح `text-warning/15` — **صنف لون نص مستخدم كخلفية**، أي لا خلفية إطلاقاً. النتيجة: مربّعات أيقونات الخطورة بلا خلفية في كل الحالات. أُصلح بخريطة `SEVERITY_ICON_BG` صريحة (`bg-warning/15` …) مع `SEVERITY_STYLES` دلالية و`border-s-2` بدل `border-l-2` (اتجاه RTL).

---

## 3. ثغرة في بوابة القياس نفسها

`scripts/scan-ui-colors.cjs` كان يطابق `border-` ثم اسم اللون مباشرة، فلا يرصد:

- الاتجاهات: `border-l-yellow-400`, `border-r-*`, `border-t/b/s/e-*`
- الظلال: `shadow-brand-teal/25`
- `navy-*` و`text-white` و`teal/green/lime/violet/fuchsia`

أي أن رقم «1324» كان **أقل من الواقع**. وُسِّعت البوابة، فارتفعت أرقام الملفات غير المحوَّلة (`AiChatPanel` 276 ← **345**، `ScreenViewer` 244 ← **255**، `CommandRunner` 66 ← **70** …). هذا تصحيح قياس لا انحدار: نفس الكود، بوابة أصدق.

---

## 4. ما لم يُنجز في هذه الشريحة (بصراحة)

الصفحات الأربع (التنبيهات، AI، الإعداد، الدخول) **صُفِّرت ألوانها ولم تُنقل بعد إلى مكوّنات المكتبة**: أزرارها وحقولها ما زالت عناصر HTML بأنماط الرموز. لذلك عمود «يستخدم المكتبة» لها **❌** في `docs/UI-INVENTORY.md` — ولم أعلّمها ✅.

المتبقي لها: `Button`/`Input`/`Select`، و`EmptyState`/`SkeletonRows`/`Alert` حيث تنقص الحالة. (`NotificationsPage` فيه تحميل وفراغ بلا خطأ؛ `AiPage` بلا تحميل وبلا خطأ؛ `SetupPage` تحميل وخطأ بلا هيكل؛ `LoginPage` تحميل وخطأ.)

---

## 5. الأدلة

| الدليل | المسار |
|---|---|
| لقطات | `outputs/verify-2026-10-28/r6-ui/{notifications,ai,setup,login}/*-1280-light.png` |
| جرد | `node scripts/scan-ui-colors.cjs` → 875 · 9 |
| typecheck + build | exit 0 · ✓ 11.8s |

## 6. التالي

إدخال المكتبة في الصفحات الأربع، ثم `AiChatPanel`/`ScreenViewer` (قرار مكتوب)، ثم النوافذ اليدوية، ثم تباين الشاشات الفعلي، ثم بناء 3.8.13.
