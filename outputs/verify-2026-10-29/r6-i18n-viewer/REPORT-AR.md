# تقرير شريحة دين i18n — viewer_* (2026-10-29)

## 1) القياس

| الملف | قبل | بعد | على المكتبة |
|---|---|---|---|
| ScreenViewer.tsx — مواضع نص عربي | 107 | 0 | lib/i18n.ts |
| ScreenViewer.tsx — حروف عربية | 1870 | 0 | — |
| lib/i18n.ts — ar / en | 294 / 294 | 412 / 412 | +118 |
| lib/i18n.ts — مفاتيح viewer_* | 0 | 118 | 118/118 مترجمة |

## 2) خصوصية الشريحة
ScreenViewer كان أحاديّ اللغة فعلياً: 104 نصاً عربياً بلا مقابل إنجليزي تظهر لمستخدم en كذلك،
فلم تكن الشريحة نقلاً بل تأليف 104 ترجمة إنجليزية.

## 3) قرارات تصميم
1. QualityPreset كان label: string ويُستخدم كمعرّف، فصار { id, labelKey } والمقارنة بالـid.
2. أربعة قوالب صارت وسائط: viewer_adaptive_fps {fps} · viewer_stop_recording_time {t} ·
   viewer_monitor_n {n} · viewer_viewers_active {n}.
3. خمسة مواضع مدمجة عُوملت صراحةً بمفاتيح ذات وسائط (شاشة {n}، {name} يتحكم، تكيفي ·، تم رفع، جارٍ رفع).
4. tr واحد في المكوّن الوحيد، لا في fmtBytes ولا في القوائم على مستوى الوحدة.

## 4) الأدلة
npx tsc --noEmit = 0 · npx vite build ✓ · scan-ui-colors = 0 · check-contrast 22/22 · verify.js 21/21
ScreenViewer.tsx: 1870 → 0 حرفاً · i18n.ts: ar 412 / en 412 (لا مفتاح في جهة واحدة)

## 5) ملاحظة صدق
AiChatPanel يحتفظ بـ70 حرفاً عربياً في 6 تعابير RegExp تطابق مخرجات النموذج؛ ليست نص واجهة ولا تُترجم.
