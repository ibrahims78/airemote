# تحقّق التغطية والألوان واللغة — التصميم المعتمد

> كل رقم أدناه مقيس بأمر على الملفات نفسها. لا تقدير.
> **تصحيح جوهري (2026-11-05):** كانت النسخة السابقة تعلن «72/72» وهذا **خطأ قياس**: السكربت كان يقرأ `mockup-full.html` (اللوحة المجمّعة) لا الملفات الثلاثة المسلَّمة. أُضيف فحص **لكل ملف على حدة** (`work/parity-perfile.cjs`)، فظهر نقص **21 عنصرًا**، وأُصلح. الأرقام هنا هي بعد الإصلاح.

---

## 1) تغطية العناصر — لكل ملف على حدة

| الملف | المجموعة | المطلوب | المغطّى | الحالة |
|---|---|---|---|---|
| `server.html` | السيرفر (جدار + نظرة عامة + قائمة التطبيق + شريط المساعد) | 22 | 22 | ✔ |
| `windows-agent.html` | أزرار الوكيل | 30 | 30 | ✔ |
| `windows-agent.html` | حقول الوكيل | 7 | 7 | ✔ |
| `android.html` | وكيل أندرويد | 13 | 13 | ✔ |
| **الإجمالي** | | **72** | **72** | **MISSING=0** |

```
── design/server.html  (tags=22)
   السيرفر: 22/22   ✔
── design/windows-agent.html  (tags=43)
   وكيل ويندوز — أزرار: 30/30   ✔
   وكيل ويندوز — حقول: 7/7   ✔
── design/android.html  (tags=14)
   أندرويد: 13/13   ✔

REQUIRED=72  MISSING=0
```

**ما كان ناقصًا وأُضيف (21 عنصرًا):**

| السطح | العناصر | أين وُضعت |
|---|---|---|
| `server.html` (9) | `nav-overview` · `nav-devices` · `nav-sessions` · `nav-ai` · `dash-settings` · `dash-help` · `dash-view-all-devices` · `dash-ai-ask` · `dash-ai-send` | التبويبات الثلاثة وُسمت · المساعد/الإعدادات/المساعدة داخل **قائمة التطبيق** (كما في التطبيق الحقيقي) · «عرض الكل» تحت مقياس الأجهزة · شريط المساعد يُفتح من القائمة |
| `windows-agent.html` (12) | الدردشة: `chat-collapse-btn` · `chat-popout-btn` · `chat-clear-btn` · `chat-send-btn` · `chat-input` — المساعد: `ai-hist-btn` · `ai-new-btn` · `ai-stop-btn` · `ai-collapse-btn` · `ai-send-btn` · `ai-input` — و`log-coll-btn` | **تبويب رابع «الجلسة»** (الدردشة + المساعد) · و«طيّ» في رأس «آخر الأحداث» |

## 2) اختبار العناصر الجديدة (26 فحصًا)

`work/verify-new-controls.cjs` — كلها **PASS**:

```
── server.html
PASS menu hidden by default          PASS menu opens on click
PASS menu item visible: nav-ai       PASS menu item visible: dash-settings
PASS menu item visible: dash-help    PASS view-all visible
PASS ai bar hidden by default        PASS ai bar opens from menu
PASS ai ask field visible            PASS ai send visible
PASS width still 1644                PASS menu closes on outside click
── windows-agent.html
PASS session tab becomes visible
PASS chat-collapse/popout/clear/send/input      PASS log-coll-btn on ctrl tab
PASS ai-hist/new/stop/collapse/send/input       PASS width still 560
RESULT=PASS
```

## 2.1) عيب HTML وُجد وأُصلح: `<span>` داخل `placeholder`

ثلاثة حقول كانت تستخدم دالة الترجمة داخل خاصية: `placeholder="<span data-en="…">…</span>"` — وهذا **HTML غير صالح**، وكان سيظهر كوسم خام أو فارغ. أُصلح بـ`data-ph-en` + تبديل في `toggleLang`:

```
PASS  server.html  dash-ai-ask   AR="اسأل عن جهاز أو جلسة…"   EN="Ask about a device or session…"
PASS  windows-agent.html  chat-input  AR="اكتب رسالة…"  EN="Type a message…"
PASS  windows-agent.html  ai-input    AR="اسأل المساعد…"  EN="Ask the assistant…"
```

الفحص الآلي: `work/attrscan.cjs` → `span-in-attribute=0` في الملفات الثلاثة.

## 3) الثيم واللغة والعرض (الملفات الثلاثة)

```
server.html:        tabs=overview,devices,sessions      | width=1644 (متوقع 1644) | light=true | errors=none | EN: dir=ltr overflow=0
windows-agent.html: tabs=ctrl,connect,sessions,session  | width=560  (متوقع 560)  | light=true | errors=none | EN: dir=ltr overflow=0
android.html:       (بلا تبويبات — أوراق سفلية)          | width=390               | light=true | errors=none | EN: dir=ltr overflow=0
```

- **الفاتح افتراضي:** `light` على `<html>` (لا `<body>`) — الخطأ السابق كان هنا.
- **تبديل الثيم:** زر «الثيم» أسفل اللوحة (نُقل من الطبقة العائمة بعد أن كان يغطي المحتوى).
- **تبديل اللغة:** زر `EN`/`ع` — 107 تسمية، **0 تجاوز**.

## 4) الألوان والتباين (WCAG)

| الزوجة | داكن | فاتح | الحد |
|---|---|---|---|
| نص أساسي / سطح | 14.88:1 | 17.85:1 | 4.5 |
| نص ثانوي / سطح | 11.08:1 | 10.35:1 | 4.5 |
| نص خافت / سطح | 6.76:1 | 4.76:1 | 4.5 |
| نص خافت / خلفية | 7.30:1 | 4.54:1 | 4.5 |
| نص الزر الرئيسي | 8.90:1 | 5.47:1 | 4.5 |
| نجاح / سطح | 9.14:1 | **5.48:1** | 4.5 |
| تحذير / سطح | 10.53:1 | 5.02:1 | 4.5 |
| خطر / سطح | 6.35:1 | 4.83:1 | 4.5 |
| تمييز / سطح | 9.44:1 | 5.47:1 | 3.0 |

**ثغرة وُجدت وأُصلحت:** النجاح الفاتح كان `#059669` = **3.77:1** ⇒ صار `#047857` = **5.48:1**. النتيجة: **0 فشل** في الوضعين.

## 5) الملفات

| الملف | ماذا يُثبت |
|---|---|
| `server.html` · `windows-agent.html` · `android.html` | **المرجع التنفيذي** — 72/72 عنصرًا موسومًا · تفاعلية · فاتح/داكن · AR/EN |
| `*-light.png` / `*-dark.png` | لقطات المرجع للمطابقة (diff ≤ 2%) |
| `1-*.png` / `2-*.png` | الصور الأصلية المعتمدة (داكن/فاتح) |
| `mockup.html` · `mockup-full.html` | لوحة الرموز واللوحة المجمّعة (81 وسمًا) |
| `SPEC.md` | 7 مكوّنات + حالاتها + القواعد |

**أدوات القياس (في `work/`):**
`parity-perfile.cjs` (التغطية لكل ملف) · `verify-v2.cjs` (العرض/الثيم/اللغة/اللقطات) · `verify-new-controls.cjs` (26 فحصًا للعناصر المضافة) · `contrast-audit.cjs` · `en-check.cjs`.

## 6) ما لم يُثبت بعد

- **التطبيق الفعلي:** كل ما سبق على النماذج، لا على `packages/*`. البوابات الحقيقية بعد التنفيذ: `typecheck` · `build` · `audit-screen-surface` = 11/0/2 · `check-contrast` ≥ 22/22 · البطارية 46/46.
- **الأندرويد على جهاز حقيقي:** مقاسات اللمس مضبوطة في CSS (44px)، وقياسها على شاشة فعلية يتم بعد التنفيذ.
- **11 صفحة لوحة + 4 أنشطة أندرويد** لم تُنمذج بعد (المرحلة 4) — تُعرض لقطاتها قبل اعتمادها.
