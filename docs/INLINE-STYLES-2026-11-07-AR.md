# الأنماط المضمّنة في اللوحة — 30 ← 14

**التاريخ:** 2026-11-07 · **الفرع:** `feat/screen-unify-3.13.0` · **البند:** §6/2 من `PROMPT-NEW-ACCOUNT-2026-11-07-3.14.1-FULL-AR-r5`
**الدليل:** `outputs/verify-2026-11-07/w13-inline/`

## القاعدة

`style={{ … }}` مسموح فقط حين تُحسب القيمة في كل تصيير (تكبير/إزاحة/نسبة/مرساة نافذة/لون عنصر/تأخير تتابع).
أي قيمة ثابتة تنتمي إلى صنف: لا يمكن سِمَتها (theming) ولا تجاوزها في السمة الفاتحة، وتنحرف عند أول تغيير تصميم.

## ما نُفّذ

| # | الملف | كان | صار |
|---|---|---|---|
| 1 | `components/AiChatPanel.tsx` | `insetInlineEnd: 12` | `end-3` |
| 2 | `components/AiChatPanel.tsx` | `minHeight: 44px` · `maxHeight: 128px` | `min-h-[44px] max-h-32` |
| 3 | `components/PTYTerminal.tsx` | `minHeight: 0` | `min-h-0` |
| 4 | `components/SSHTerminal.tsx` | `minHeight: 0` | `min-h-0` |
| 5 | `components/ToastContainer.tsx` | `minWidth: 260px` · `maxWidth: 360px` | `min-w-[260px] max-w-[360px]` |
| 6 | `pages/LoginPage.tsx` | `direction: 'ltr'` (الترويسة) | `dir="ltr"` |
| 7 | `pages/LoginPage.tsx` | `direction: 'ltr'` (التذييل) | `dir="ltr"` |
| 8 | `components/ScreenViewer.tsx` | `objectFit: 'contain'` | `object-contain` |
| 9 | `components/ScreenViewer.tsx` | نافذة الجودة: `width/maxHeight/overflow/background/borderColor/color` | `.sv-quality-menu` (بقي `top`/`left` فقط) |
| 10 | `components/ScreenViewer.tsx` | لوحة البثّ: `width/height/imageRendering/touchAction/userSelect/Webkit*` | `.sv-stage-canvas` (بقي `transform`/`transformOrigin`) |
| 11 | `components/ScreenViewer.tsx` | مؤشّر البعيد: `transform/filter/transition` | `.sv-cursor-arrow` (بقي `left`/`top`/`opacity`) |
| 12 | `components/ScreenViewer.tsx` | بطاقة محادثة الجلسة + الترويسة + الشارة + الإغلاق + التذييل + الحقل + زرّ الإرسال (7 كائنات) | `.sv-chat-panel` · `.sv-chat-head` · `.sv-chat-badge` · `.sv-chat-close` · `.sv-chat-foot` · `.sv-chat-input` · `.sv-chat-send` |
| 13 | `components/ScreenViewer.tsx` | حدود فقاعة الرسالة حسب المرسل | فرعان في `clsx` (`border-[rgba(…)]`) |
| 14 | `components/AnnotationLayer.tsx` | `position/left/top/width/height/zIndex/touchAction` | `.sv-annotation-layer` (بقي `pointerEvents`/`cursor`) |

**النتيجة:** 30 كائنًا ← **14**، منها **صفر ثابت**. أُزيلت 16 حالة كاملة (15 ثابتة بالكامل + فقاعة الرسالة)، وأُبقي على 4 حالات مختلطة بنواتها التشغيلي فقط.

## الـ14 الباقية — كلها تشغيلية

| # | الملف:السطر | القيمة |
|---|---|---|
| 1 | `AiChatPanel.tsx:190` | `transform: translate(x,y) scale(z)` + `transition` + `cursor` — تكبير/تحريك الصورة |
| 2 | `AiChatPanel.tsx:543` | `width: progress%` — شريط التقدّم |
| 3 | `AiChatPanel.tsx:1648` | `animationDelay: d ms` — تتابع النقاط |
| 4 | `AnnotationLayer.tsx:111` | `pointerEvents`/`cursor` حسب الأداة (قلم/ليزر/ممحاة/إيقاف) |
| 5 | `MonitoringCharts.tsx:85` | `width: pct%` — شريط النسبة |
| 6 | `MonitoringCharts.tsx:101` | `background: p.color` — لون السلسلة |
| 7 | `MonitoringCharts.tsx:117` | `background: p.color` — لون السلسلة |
| 8 | `AiPage.tsx:178` | `width: value%` — شريط النسبة |
| 9 | `App.tsx:34` | `animationDelay` — تتابع الهياكل |
| 10 | `SettingsExtra.tsx:203` | `animationDelay` — تتابع الهياكل |
| 11 | `ScreenViewer.tsx:2014` | `background: c` — لون قلم التعليق |
| 12 | `ScreenViewer.tsx:2154` | `top`/`left` — مرساة نافذة الجودة |
| 13 | `ScreenViewer.tsx:2507` | `transform`/`transformOrigin` — تكبير/تحريك المسرح |
| 14 | `ScreenViewer.tsx:2541` | `left`/`top`/`opacity` — موضع مؤشّر البعيد |

## الدليل المقيس

- **قبل/بعد على نفس البيانات، بالمقاس القانوني (1700×980 @2×، سمة فاتحة، خادم Vite):**
  `canon-before.png` (الالتزام `f0353f2`) مقابل `canon-after.png` (الالتزام `49a296c`):
  **1,419 بكسلًا من 6,664,000 = 0.0213%** · `mae 0.02` · وكل الفرق داخل سطر نصّي واحد (y 481–497)، لا بنية ولا إطار.
- **وبوابة المرجع نفسها:** كلا اللقطتين تعطيان حرفيًا `diffPct 6.86 · block 9.2 · edge 66.67 · mae 5.27` مقابل `design/server-light.png` — أي أن التعديل **لا يحرّك أي رقم** في بوابة السطح. الفرق عن 4.84 المسجّل في r5 سببه بيانات الجلسة الحالية (100 جلسة، أجهزة متصلة) لا الكود؛ والدليل هو تطابق الرقمين قبل/بعد.
- `node scripts/check-inline-styles.cjs` ⇒ `inline styles: 14 · operational 14 · static 0`.

## البوابة الجديدة — الخطوة 51

`scripts/check-inline-styles.cjs` يقرأ كل كائن `style={{}}` في `packages/dashboard/src`، يجرّد النصوص وأسماء الخصائص، ويفشل إن لم يبقَ تعبير حسابي. مُثبتة العضّ: كائن ثابت مُدسّوس في ملف مؤقت ⇒ `static 1` و`exit 1`، وبعد حذفه ⇒ `static 0` و`exit 0`.
