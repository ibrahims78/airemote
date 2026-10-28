# UI INVENTORY — AiRemote Dashboard

> **الإصدار:** 1.1 · **التاريخ:** 2026-10-28 · **المرحلة:** R6 (قيد التنفيذ)
> **المصدر:** قراءة `packages/dashboard/src` — لا تخمين. الأرقام من فحص آلي: `node scripts/scan-ui-colors.cjs`.
> **الغرض:** جرد ملزم قبل بناء نظام التصميم، حتى لا تُصمَّم شاشات غير موجودة أو تُنسى شاشات قائمة.

---

## 1. المسارات (من `App.tsx`)

| المسار | الصفحة | الوصول | الغرض |
|---|---|---|---|
| `/setup` | `SetupPage` | عام (يظهر فقط عند الحاجة) | معالج الإعداد الأولي للمشرف |
| `/login` | `LoginPage` | عام | تسجيل الدخول |
| `/view/:deviceId` | `ScreenPopoutPage` | مصادَق | نافذة البث المستقلة بلا حواف |
| `/` | `OverviewPage` | مصادَق | نظرة عامة ومؤشرات |
| `/devices` | `DevicesPage` | مصادَق | قائمة الأجهزة وبطاقاتها |
| `/devices/:deviceId` | `DeviceWorkspacePage` | مصادَق | مساحة الجهاز (شاشة/ملفات/طرفية/AI) |
| `/ai` | `AiPage` | مصادَق | محادثات الذكاء الاصطناعي |
| `/sessions` | `SessionsPage` | مصادَق | سجل الجلسات |
| `/notifications` | `NotificationsPage` | مصادَق | التنبيهات |
| `/audit` | `AuditPage` | **admin** | سجل التدقيق |
| `/users` | `UsersPage` | **admin** | إدارة المستخدمين |
| `/settings` | `SettingsPage` | مصادَق | الإعدادات |
| `/help` | `HelpPage` | مصادَق | الدليل والمساعدة |
| `*` | تحويل | — | إلى `/` أو `/setup` |

**العدد:** 13 صفحة + مسار تحويل. لا مسارات ميتة.

---

## 2. حالة الحالات الخمس لكل صفحة

القياس آلي على الملف: وجود `loading`، وجود `error`، وجود حالة فارغة، وجود هيكل تحميل (Skeleton).

| الصفحة | أسطر | تحميل | فارغ | خطأ | هيكل | i18n | عربي مكتوب مباشرة (حرف) |
|---|---|---|---|---|---|---|---|
| `AiPage` | 206 | ❌ | ✅ | ❌ | ❌ | ✅ | 8 |
| `AuditPage` | 273 | ✅ | ✅ | ✅ | ❌ | ✅ | **190** |
| `DevicesPage` | 529 | ✅ | ✅ | ✅ | ✅ | ✅ | 5 |
| `DeviceWorkspacePage` | 264 | ❌ | ✅ | ✅ | ❌ | ✅ | 38 |
| `HelpPage` | 365 | ❌ | ✅ | ✅ | ❌ | ❌ (isAr محلي) | **484** |
| `LoginPage` | 244 | ✅ | — | ✅ | ❌ | ✅ | **405** |
| `NotificationsPage` | 393 | ✅ | ✅ | ❌ | ❌ | ✅ | 52 |
| `OverviewPage` | 440 | ✅ | ✅ | ❌ | ❌ | ✅ | **856** |
| `ScreenPopoutPage` | 46 | ❌ | — | ❌ | ❌ | ❌ | 0 |
| `SessionsPage` | 286 | ✅ | ✅ | ✅ | ✅ | ✅ | 0 |
| `SettingsPage` | 566 | ✅ | — | ✅ | ❌ | ✅ | **353** |
| `SetupPage` | 205 | ✅ | — | ✅ | ❌ | ❌ (isAr محلي) | 248 |
| `UsersPage` | 370 | ✅ | ✅ | ✅ | ❌ | ✅ | 0 |

**قراءة الجدول:** «—» تعني أن الحالة غير ذات معنى لهذه الشاشة (مثل «فارغ» في شاشة إعداد). «❌» تعني غياباً يحتاج معالجة.

---

## 2.1 امتثال المكتبة — جرد رقمي (R6)

**القياس:** عدد أدوات اللون الصريحة (مثل `bg-slate-800`, `text-sky-400`, `border-l-yellow-400`, `shadow-brand-teal/25`) لكل ملف في `src`. عمود «يستخدم المكتبة» يعني استيراداً فعلياً من `components/ui`.

**الحصيلة الحالية:** **875** صنفاً صريحاً · **9** ملفات على المكتبة · **10** شاشات بصفر أصناف صريحة.

> **تصحيح قياس (2026-10-28):** البوابة كانت لا ترصد الاتجاهات (`border-l-*`) ولا `shadow-*` ولا `navy-*` ولا `text-white`، فمرّت أصناف مثل `border-l-yellow-400` بلا رصد. وُسِّعت في `scripts/scan-ui-colors.cjs`، فارتفعت أرقام الملفات غير المحوَّلة (مثال `AiChatPanel`: 276 ← 345) وانخفض الإجمالي لأن أربع صفحات صُفِّرت في الجولة نفسها.

| الملف | أصناف صريحة | يستخدم المكتبة | الحالات المطلوبة (تحميل / فارغ / خطأ / هيكل) |
|---|---|---|---|
| `components/AiChatPanel.tsx` | 345 | ❌ | — (سطح تفاعلي: قرار مؤجّل) |
| `components/ScreenViewer.tsx` | 255 | ❌ | — (سطح بث: قرار مؤجّل) |
| `components/CommandRunner.tsx` | 70 | ❌ | ❌ / ✅ / ✅ / ❌ |
| `components/PTYTerminal.tsx` | 48 | ❌ | — / — / ✅ / ❌ |
| `components/SettingsExtra.tsx` | 47 | ❌ | ❌ / — / ❌ / ❌ |
| `components/SSHTerminal.tsx` | 41 | ❌ | — / — / ✅ / ❌ |
| `components/MonitoringCharts.tsx` | 29 | ❌ | ❌ / ✅ / ❌ / ❌ |
| `components/CommandPalette.tsx` | 13 | ❌ | — / ✅ / — / ❌ |
| `components/ToastContainer.tsx` | 13 | ❌ | — / — / — / ❌ |
| `App.tsx` | 5 | ❌ | — / — / — / ❌ |
| `components/ExecConsole.tsx` | 5 | ❌ | — / — / ✅ / ❌ |
| `components/ErrorBoundary.tsx` | 4 | ❌ | — / — / ✅ / ❌ |
| `components/FileManager.tsx` | **0** | ✅ | ✅ / ✅ / ✅ / ✅ |
| `components/TransferQueue.tsx` | **0** | ✅ | ✅ / ✅ / ✅ / ✅ |
| `pages/AiPage.tsx` | **0** | ❌ | ❌ / ✅ / ❌ / ❌ |
| `pages/AuditPage.tsx` | **0** | ✅ | ✅ / ✅ / ✅ / ✅ |
| `pages/DevicesPage.tsx` | **0** | ✅ | ✅ / ✅ / ✅ / ✅ |
| `pages/DeviceWorkspacePage.tsx` | **0** | ✅ | — / ✅ / ✅ / ❌ |
| `pages/HelpPage.tsx` | **0** | ✅ | ❌ / ✅ / ✅ / ❌ |
| `pages/LoginPage.tsx` | **0** | ❌ | ✅ / — / ✅ / ❌ |
| `pages/NotificationsPage.tsx` | **0** | ✅ | ✅ / ✅ / ❌ / ✅ |
| `pages/SessionsPage.tsx` | **0** | ✅ | ✅ / ✅ / ✅ / ✅ |
| `pages/SettingsPage.tsx` | **0** | ✅ | ✅ / — / ✅ / ✅ |
| `pages/SetupPage.tsx` | **0** | ❌ | ✅ / — / ✅ / ❌ |
| `pages/UsersPage.tsx` | **0** | ✅ | ✅ / ✅ / ✅ / ✅ |

**نطاق الاستثناء:** `AiChatPanel` و`ScreenViewer` سطحان تفاعليان بقرار مكتوب (`docs/ADR-R6-INTERACTIVE-SURFACES-AR.md`): الكروم يدخل البوابة، وألوان المحتوى تُثبَّت في قائمة استثناء صريحة. `LoginPage` سطح علامة يستهلك CSS خاصاً به.\n\n**معيار الخروج:** صفر صنف صريح في كل ملف يُعلن «محوَّلاً»، وليس صفراً في المجموع فقط. الملفات المتبقية أعلاه هي قائمة العمل الحقيقية لـR6.

**ملاحظة:** `DevicesPage` على المكتبة لكن بقي فيها 12 صنفاً داخل نافذتي `WolModal` و`AgentInstallModal` اليدويتين — بند 4 في قائمة R6.

---

## 3. المكوّنات المشتركة

| المكوّن | التصنيف | ملاحظة |
|---|---|---|
| `ScreenViewer.tsx` | أساسي للمجال | قلب تجربة البث؛ أكبر ملف واجهة وأكثرها حساسية |
| `FileManager.tsx` | أساسي للمجال | يستخدم لاحقاً في R5 (استكمال/تجزئة) |
| `LivePreview.tsx` / `LivePreviewBoard.tsx` | أساسي للمجال | معاينات حيّة |
| `AiChatPanel.tsx` | أساسي للمجال | مشترك بين صفحة AI ومساحة الجهاز |
| `CommandRunner.tsx` / `ExecConsole.tsx` / `PTYTerminal.tsx` / `SSHTerminal.tsx` | أدوات | أربعة مكوّنات طرفية متقاربة — مرشّحة للدمج في R6 |
| `MonitoringCharts.tsx` | عرض بيانات | رسوم الإحصاءات |
| `SettingsExtra.tsx` | صفحة محددة | امتداد لإعدادات |
| `ToastContainer.tsx` | بدائي (primitive) | تنبيهات |
| `WindowChrome.tsx` | خاص بسطح المكتب | شريط النافذة |
| `CommandPalette.tsx` | بدائي | لوحة أوامر |
| `ErrorBoundary.tsx` | بنية تحتية | حماية من الشاشة البيضاء |

**ملاحظة R6:** لا توجد مكتبة بدائيات حقيقية (Button/Input/Table/Modal) — كل صفحة تبني عناصرها. هذا هو أكبر مصدر لعدم الاتساق، ويُعالج في R6 لا قبله.

---

## 4. فجوات مؤكدة (قابلة للإصلاح في R6)

| # | الفجوة | الدليل | الأثر |
|---|---|---|---|
| 1 | **نصوص عربية مكتوبة مباشرة** في 6 صفحات بدل مفاتيح i18n | `OverviewPage` 856 حرفاً · `HelpPage` 484 · `LoginPage` 405 · `SettingsPage` 353 · `SetupPage` 248 · `AuditPage` 190 · `DeviceWorkspacePage` 38 | تعطيل التبديل للّغة الإنجليزية جزئياً، وتكرار النص في مكانين |
| 2 | صفحتان لا تستخدمان وحدة i18n أصلاً (`HelpPage`, `SetupPage`) | لا استيراد من `lib/i18n` | سلوك لغة مختلف عن بقية التطبيق |
| 3 | **لا حالة تحميل** في `AiPage` و`DeviceWorkspacePage` | صفر مراجع `loading` | وميض/شاشة فارغة أثناء الجلب |
| 4 | **لا حالة خطأ** في `OverviewPage` و`NotificationsPage` و`AiPage` | صفر مراجع `error` | فشل صامت بلا رسالة |
| 5 | **هياكل تحميل في صفحتين فقط** (`DevicesPage`, `SessionsPage`) | 5 و2 مراجع Skeleton | إحساس بطء في الباقي |
| 6 | أربعة مكوّنات طرفية متقاربة | `CommandRunner`, `ExecConsole`, `PTYTerminal`, `SSHTerminal` | ازدواج صيانة |
| 7 | لا مكتبة بدائيات موحّدة | لا مجلد `ui/` | تباين بصري بين الشاشات |

---

## 5. ما يحتاج تحققاً بصرياً (لا يُحكم من الكود)

1. RTL الفعلي في `OverviewPage` و`HelpPage` (اعتماد على `dir` من الأعلى؟).
2. الوضع الداكن: `darkMode: 'class'` في Tailwind — هل يوجد مبدّل فعلي في `SettingsPage`؟
3. تباين الألوان AA في الشارات والحالات (أخضر/أحمر على خلفية navy).
4. سلوك النافذة المستقلة `/view/:id` على شاشة 4K و360px.
5. تنقّل لوحة المفاتيح داخل `ScreenViewer` أثناء البث.

---

## 6. خلاصة قابلة للتنفيذ (مدخل R6)

- **قبل التصميم:** توحيد النصوص في `i18n.ts` (7 صفحات)، وإضافة مكتبة بدائيات واحدة.
- **أثناء التصميم:** تغطية الحالات الخمس في كل شاشة، واستبدال الهياكل الناقصة.
- **معيار الخروج R6:** 0 نص عربي مباشر خارج `i18n.ts`، و5/5 حالات في كل شاشة، ومكوّن طرفي واحد بدل أربعة.

---

*نهاية الجرد.*
