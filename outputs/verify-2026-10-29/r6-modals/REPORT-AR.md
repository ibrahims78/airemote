# R6 — الشريحة 15: نوافذ `DevicesPage` + نقل `NotificationsPage`/`SetupPage`/`HelpPage` إلى المكتبة

**التاريخ:** 2026-10-29 · **الحالة:** مُنجزة ومُتحقَّقة في المتصفح · **الالتزامات:** `ca42ccf` + `3fe4ec4`
**البناء:** `vite build` ناجح · **البطارية:** 21/21 · **الألوان:** 1089 ← **1061** · **التباين:** 22/22

---

## 1. النتيجة بالأرقام

| الملف | قبل | بعد | المكتبة |
|---|---|---|---|
| `pages/DevicesPage.tsx` | 11 | **0** | ✅ |
| `pages/HelpPage.tsx` | 12 | **0** | ✅ |
| `pages/NotificationsPage.tsx` | 1 | **0** | ✅ |
| `pages/SetupPage.tsx` | 2 | **0** | ✅ |
| `pages/AiPage.tsx` | 0 | **0** | ❌ (سطح محادثة: لا يحتاج مكوّنات) |
| `components/ui/Modal.tsx` | 1 | **0** | — |
| `components/ui/Alert.tsx` | 1 | **0** | — |

**الإجمالي:** 1089 ← **1061** · **11** ملفاً على المكتبة · **11** ملفاً بصفر أصناف صريحة.
> 1089 هو خط الأساس بعد توسيع البوابة في `b29f829` (`brand-*` بلا درجة رقمية).

---

## 2. `WolModal` و`AgentInstallModal` → `Modal` المشترك

- `WolModal`: حُذف الغلاف `fixed inset-0` + `glass`، والنموذج صار `Field` + `Input` داخل `Modal size="sm"`، وزر الإرسال في `footer` بـ`form="wol-form"` (نمط `PasswordModal`). النتيجة صارت `Alert` بدل `div` ملوّن يدوياً.
- `AgentInstallModal`: صار `Modal size="lg"` بعنوان `Agent — {اسم الجهاز}` وتذييل «إغلاق». كتلتا WS/Token صارتا `Card`، والنصوص الثلاثة (Linux/Docker/.env) تُعرض من مصفوفة واحدة مع زر نسخ لكل كتلة. **كائن `scripts` الذي يبني الأوامر لم يُمَس**، فلا تغيير في المحتوى المنسوخ.
- كتل الشيفرة: `bg-[#0a0f1e]` ← `bg-code` (رمز جديد).
- **إصلاح bidi:** `① Server URL` / `② Device Token` كانت تُعرض `Server URL ①` في صف RTL، فحُذفت الأرقام الدائرية واستُخدمت تسميات صريحة (الالتزام `3fe4ec4`).

---

## 3. رموز جديدة في طبقة التصميم

| الرمز | داكن | فاتح | الاستخدام |
|---|---|---|---|
| `--overlay` | `0 0 0` | `15 23 42` | حجاب النوافذ (`Modal`، نافذة About) |
| `--code` | `10 15 30` | `241 245 249` | خلفية كتل الشيفرة |

أُضيفا إلى `index.css` و`tailwind.config.js`؛ بوابة التباين بقيت **22/22** (لم يُمس أي زوج نصي).

---

## 4. الصفحات الثلاث

### `NotificationsPage`
- النماذج الخمسة (النوع، الحد، الانتظار، القناة، Webhook) صارت `Field` + `Input`/`Select`، والأزرار `Button`، والفراغ `EmptyState` داخل `Card`، والتحميل `SkeletonRows`.
- **حالة خطأ حقيقية** بمفتاح `notif_load_failed` / `notif_rules_load_failed` بدل `catch {}` الصامت، ولا يظهر «لا توجد قواعد» عند فشل التحميل.
- **عيب RTL:** مفتاح التبديل كان `left-4`/`left-0.5` مع `bg-white` — ينعكس في RTL وبلا رمز. صار `role="switch"` + `aria-checked` + `start-4`/`start-0.5` + `bg-primary`/`bg-muted`.
- شارة العدّاد كانت `bg-danger text-ink` (≈1.1:1 في الداكن) ← `bg-danger/15 text-danger border-danger/30`.

### `SetupPage`
- الحقول الأربعة `Field` + `Input`، والخطأ `Alert`، وزر الإنشاء `Button loading` (اختفى مُدوِّر `border-white/30`).
- **عيب bidi:** حقل كلمة المرور `dir="ltr"` مع زر العين على `left-3` كان يتراكب مع بداية النص؛ صار `pl-10`.
- شعاران: `text-ink` على تدرّج `primary` ← `text-primary-fg`.

### `AiPage`
- حُذفت فروع `isLight ?` (20 فرعاً) وكل الألوان السداسية في أشرطة CPU/RAM/Disk (`#38bdf8`, `#2dd4bf`, `#fb923c`, `#c084fc`) ← `bg-info` / `bg-primary` / `bg-warning`.
- الشريط الجانبي رمزي بالكامل مع `aria-pressed` لكل خيار جهاز.

### `HelpPage`
- 23 فرعاً طرفاه متطابقان حُذفت آلياً، و18 فرعاً مختلفاً وُحِّد على رمز واحد.
- **نافذة About** اليدوية صارت `Modal size="sm"` — آخر نافذة يدوية في الملف.
- `isLight` أُزيل من `inline()` و`Markdown()` بالكامل.

---

## 5. تحقق بصري فعلي (جديد في هذه الشريحة)

شُغِّلت نسخة المصدر على **قاعدة بيانات مؤقتة** (`scripts/dev-server-temp.js`، بلا TLS، منفذ 3011) مع `scripts/dev-ui-serve.cjs` على 4180، ثم Edge headless عبر `scripts/ui-shot.cjs` و`scripts/shot-modal.js`. **لم تُمسّ قاعدة المختبر** في `%APPDATA%\AiRemote-Server`.

| اللقطة | الملف | ما أُثبت |
|---|---|---|
| الإعداد (فاتح) | `setup-1280-light.png` | الحقول الأربعة، زر العين على اليسار بلا تراكب، الزر معطّل قبل الإدخال |
| الأجهزة (فاتح) | `devices-1280-light.png` | الرأس + زر «إضافة جهاز» + `EmptyState` بالمكتبة |
| التنبيهات (فاتح) | `notifications-1280-light.png` | الترويسة، التبويبان، الفراغ، زر التحديث |
| الذكاء (فاتح) | `ai-1280-light.png` | الرأس `ai-page-*`، الشريط الجانبي الرمزي، بطاقات الاقتراحات |
| المساعدة (فاتح) | `help-1280-light.png` | التدرّج الجديد، البحث، الروابط السريعة، بطاقات الأقسام |
| Wake-on-LAN (فاتح) | `devices-wol-1280-light.png` | الحجاب، الترويسة، الحقلان، `Alert`، التذييل، **حلقة التركيز على حقل MAC** (إصلاح `autoFocus`) |
| Wake-on-LAN (داكن) | `devices-wol-1280-dark.png` | تباين الترويسة والتسميات والتلميح وأزرار التذييل في الداكن |
| Agent (فاتح) | `devices-agent-1280-light.png` | بطاقة Windows، WS/Token، كتلة Linux، أزرار النسخ، التذييل |

**عيب مؤكد بصرياً وأُصلح:** سحب `Modal` للتركيز من حقل `autoFocus` — صار يفحص `panel.contains(document.activeElement)` قبل `focus()`.

**ملاحظة على اللقطات:** الحزمة تحتاج **≥9 ثوانٍ** للخروج من شاشة الإقلاع؛ لقطة `--wait=4000` تُخرج شاشة الإقلاع أو صفحة بيضاء. استخدم `--wait=9000` أو أكثر.

---

## 6. الأدلة والأوامر

| الدليل | الأمر |
|---|---|
| الأنواع | `npx tsc --noEmit` في `packages/dashboard` — صفر خطأ |
| البناء | `npx vite build` — ✓ 7.38s |
| بوابة الألوان | `node scripts/scan-ui-colors.cjs` → 1061 · 11 (`scan.txt`) |
| بوابة التباين | `node scripts/check-contrast.cjs` → 22/22 PASSED |
| البطارية | `node scripts/verify.js` → **ALL VERIFICATION STEPS PASSED (21/21)** (`battery.log`) |
| الرموز في الحزمة | `dist/assets/index-*.css` يحتوي `--overlay`, `--code`, `.bg-code`, `.bg-overlay/50` |

---

## 7. ما لم يُنفَّذ (بصراحة)

1. **`OverviewPage`** لم تُمس (856 حرفاً عربياً مباشراً، أكبر بند i18n متبقٍّ).
2. **لقطات 360/768/1920** لم تُؤخذ بعد؛ المأخوذ 1280 فقط + نافذتان. تباين البكسل عبر الأحجام الكاملة يبقى بنداً.
3. **`AiChatPanel` (444) و`ScreenViewer` (281)** بقرار مكتوب في `docs/ADR-R6-INTERACTIVE-SURFACES-AR.md`.
4. **بناء 3.8.13** لم يُبدأ؛ المثبَّت الحالي 3.8.12 ولا يحمل R5/R6.
5. **`--code`/`--overlay`** لم يُختبرا في 360/1920؛ الصور أثبتتهما في 1280 فقط.
