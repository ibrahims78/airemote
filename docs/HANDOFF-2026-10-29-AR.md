# HANDOFF — AiRemote · 2026-10-29 · نهاية R6 الشريحة 15

> **الغرض:** هذا الملف هو حزمة التسليم لحساب/جلسة جديدة. اقرأه كاملاً قبل أي أمر.
> **مصدر الحالة اليومي يبقى** `PROJECT_STATE.md` في جذر المستودع، وسجل المراحل `docs/PLAN-STATUS.md`.

---

## 1. الخلاصة في عشرة أسطر

1. المشروع في `D:\autoclaw projects-new\AiRemote`، الفرع `checkpoint/3.8.1-2026-10-26`، **الشجرة نظيفة** وآخر التزام **`3fe4ec4`**.
2. **R0–R4 مُغلقة**، **R5 مُغلقة في المصدر** (لم تُبنَ بعد في المثبَّت)، **R6 قيد التنفيذ** وقد أُنجزت **15 شريحة** منها.
3. الشريحة الأخيرة (15) نقلت `WolModal` و`AgentInstallModal` إلى `Modal` المشترك، وأخرجت `NotificationsPage`/`SetupPage`/`HelpPage`/`DevicesPage` من الألوان الصريحة (1089 ← **1061**).
4. **11 ملفاً على مكتبة المكوّنات** و**11 ملفاً بصفر أصناف صريحة**؛ المتبقي الأكبر: `AiChatPanel` (444) و`ScreenViewer` (281) بقرار مكتوب، والدفعة الطرفية (233 مجتمعة).
5. البطارية **21/21**، بوابة التباين **22/22**، `tsc --noEmit` صفر، `vite build` ناجح.
6. **تحقق بصري فعلي** لأول مرة على قاعدة بيانات مؤقتة: 8 لقطات (صفحات + نافذتان، فاتح وداكن) في `outputs/verify-2026-10-29/r6-modals/`.
7. السيرفر **المثبَّت** هو **3.8.12** ويعمل على `https://127.0.0.1:3001`، ولا يحمل تعديلات R5/R6 — يلزم بناء **3.8.13**.
8. الأجهزة الأربعة (WIN10 · WIN11 · المحاكي · TECNO) على 3.8.12 و**offline الآن**؛ تعود بتشغيل الوكيل/الـVM.
9. **لا push ولا حذف ولا تغيير ترخيص** — قرارات مالك ملزمة (القسم 8).
10. الخطوة التالية بالترتيب: لقطات 360/768/1920 فاتحة وداكنة → `OverviewPage` (i18n) → الدفعة الطرفية → بناء 3.8.13.

---

## 2. نقطة الاستئناف الدقيقة

| العنصر | القيمة |
|---|---|
| المسار | `D:\autoclaw projects-new\AiRemote` |
| الفرع | `checkpoint/3.8.1-2026-10-26` |
| آخر التزام | `3fe4ec4` — `fix(ui): R6 slice 15 - drop circled digits that reverse in an RTL row` |
| الالتزام قبله | `ca42ccf` — الشريحة 15 كاملة |
| حالة الشجرة | نظيفة (`git status --short` فارغ) |
| الإصدار المثبَّت | السيرفر **3.8.12** (`/health`)، الوكلاء 3.8.12 |
| بوابة الألوان | **1061** صنفاً صريحاً · **11** ملفاً على المكتبة · **11** ملفاً بصفر |
| البطارية | **21/21 PASSED** |

---

## 3. ما أُنجز في هذه الجلسة (R6 الشريحة 15)

### 3.1 الكود
| الملف | التغيير | الأثر |
|---|---|---|
| `pages/DevicesPage.tsx` | `WolModal` + `AgentInstallModal` → `Modal` المشترك، `Card`/`Field`/`Input`/`Alert`/`Button`، كتل الشيفرة `bg-code`، حذف `①/②` (bidi) | 11 → **0** |
| `pages/NotificationsPage.tsx` | نماذج المكتبة الخمسة، حالة خطأ بمفاتيح i18n، مفتاح RTL منطقي `role="switch"`، شارة عدّاد بتباين سليم، `EmptyState`/`SkeletonRows` | 1 → **0** |
| `pages/SetupPage.tsx` | `Field`/`Input`/`Alert`/`Button loading`، إصلاح تراكب زر العين `pl-10`، `text-primary-fg` على التدرّج | 2 → **0** |
| `pages/AiPage.tsx` | صفر فروع `isLight`، صفر ألوان سداسية (4 أشرطة موارد) ← `bg-info/primary/warning`، `aria-pressed` | 0 → **0** |
| `pages/HelpPage.tsx` | 41 فرع `isLight` أُزيلت، نافذة About → `Modal`، إزالة `isLight` من `Markdown` | 12 → **0** |
| `components/ui/Modal.tsx` | `bg-overlay/50`، ولم يعد يسحب التركيز من حقل `autoFocus` | 1 → **0** |
| `components/ui/Alert.tsx` | `hover:bg-surface2` | 1 → **0** |
| `index.css` + `tailwind.config.js` | رمزَا `--overlay` و`--code` (داكن/فاتح) | — |
| `lib/i18n.ts` | `notif_load_failed`, `notif_rules_load_failed`, `copy_server_url`, `copy_device_token` (ar+en) | — |

### 3.2 أدوات جديدة (أُضيفت للمستودع في هذه الجلسة)
| الملف | الوظيفة |
|---|---|
| `scripts/dev-server-temp.js` | يرفع نسخة المصدر على **قاعدة بيانات مؤقتة** بلا TLS (منفذ 3011) — لا يمسّ قاعدة المختبر |
| `scripts/shot-modal.js` | يفتح `/devices`، يضغط زراً بـ`aria-label`، ويلتقط نافذة الحوار (فاتح/داكن) |

### 3.3 الأدلة
- تقرير كامل: `outputs/verify-2026-10-29/r6-modals/REPORT-AR.md`
- 8 لقطات + `scan.txt` + `battery.log` في المجلد نفسه.

---

## 4. طريقة التشغيل والتحقق (منسوخة كما جُرِّبت)

### 4.1 البطارية والبوابات
```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -3                     # يجب أن يبدأ بـ 3fe4ec4
git status --short                       # يجب أن يكون فارغاً
node scripts/verify.js                   # 21/21 — يأخذ دقائق
node scripts/scan-ui-colors.cjs          # 1061 · 11
node scripts/check-contrast.cjs          # 22/22
```

### 4.2 اللوحة: أنواع وبناء
```powershell
cd 'D:\autoclaw projects-new\AiRemote\packages\dashboard'
npx tsc --noEmit
npx vite build
```

### 4.3 لقطات الشاشة (المسار الذي نجح فعلاً)
```powershell
# 1) سيرفر المصدر على قاعدة مؤقتة — يجب أن يعمل بـElectron (ABI 119)
$env:ELECTRON_RUN_AS_NODE='1'
& '.\node_modules\.pnpm\electron@28.3.3\node_modules\electron\dist\electron.exe' scripts\dev-server-temp.js
# يطبع: SHOT_SERVER_READY db=%TEMP%\airemote-shot-xxxx\shot.db

# 2) خادم الملفات المبنية + وكيل /api (نافذة ثانية)
$env:DEV_UI_STATIC_PORT='4180'; $env:DEV_UI_API_PORT='3011'
node scripts\dev-ui-serve.cjs

# 3) إنشاء مسؤول مؤقت مرة واحدة (قاعدة مؤقتة فقط)
#    POST http://127.0.0.1:3011/api/auth/setup  {name,email,password}
#    المستخدم المستخدم في هذه الجلسة: shot@local / ShotPassw0rd!   (ليس سراً حقيقياً)

# 4) لقطة صفحة — الانتظار ≥9 ثوانٍ إلزامي
node scripts\ui-shot.cjs 'http://127.0.0.1:4180/devices' 'outputs\shot.png' --theme=light --size=1280x900 --login=shot@local:ShotPassw0rd! --wait=9000

# 5) لقطة نافذة حوار
node scripts\shot-modal.js 'Wake-on-LAN' 'outputs\wol.png' light
node scripts\shot-modal.js 'Agent install' 'outputs\agent.png' light
```

> إن ظهرت صفحة بيضاء أو شاشة «Loading AiRemote...» فالسبب **انتظار قصير**، لا عيب في الصفحة. زد `--wait` إلى 12000.

### 4.4 تشخيص صفحة (Recipe سريع)
افتح Edge بـ`--remote-debugging-port`، ثم `Runtime.enable` + `Page.navigate`، والتقط `Runtime.exceptionThrown` و`Network.responseReceived >= 400` و`document.body.innerText`. هذا ما أثبت أن `/notifications` و`/ai` تعملان بلا استثناءات.

---

## 5. إعدادات المختبر والأجهزة (بلا أسرار)

| العنصر | القيمة |
|---|---|
| السيرفر المثبَّت | `https://127.0.0.1:3001` (`/health`)، في `%LOCALAPPDATA%\Programs\AiRemote Server` |
| قاعدة بيانات المثبَّت | `%APPDATA%\AiRemote-Server` — **ممنوع** تشغيل سيرفر ثانٍ عليها |
| بيانات المختبر | `%APPDATA%\AiRemote\lab-credentials.txt` (email/password + vm_guest) — **لا تُطبع ولا تُرفع** |
| مستخدم اختبار | `lab-probe@local` — قرار المالك: **يبقى** ولا يُحذف ولا تُدوَّر كلمته (`%APPDATA%\AiRemote\lab-probe.json`) |
| الوكلاء | WIN10 · WIN11 · محاكي LDPlayer · TECNO — كلهم **3.8.12**، offline الآن |
| الـVMs | Win11 `E:\VMs\Win11_Custom_2026-09-30\...vmx` (192.168.0.175) · Win10 `E:\VMs\Win10_Pro_Custom\...vmx` (192.168.0.176) |
| المحاكي | LDPlayer: `D:\LDPlayer\LDPlayer9\adb.exe`، السيريال `127.0.0.1:5555` |
| جسر الأندرويد | `python %APPDATA%\AiRemote\android-bridge-local.py` (3101→3001) + `adb reverse tcp:3101 tcp:3101` |
| ffmpeg | مضمَّن في المثبّت؛ للتطوير `packages/server-desktop/bin/ffmpeg.exe` (مستثنى من git) |
| آخر حزمة مبنية | `releases/server-windows/AiRemote-Server-Setup-v3.8.11-x64.exe` (115.6MB) — يلزم 3.8.13 |

**قيد بيئي مؤكد:** `better-sqlite3` مبني لـElectron (`NODE_MODULE_VERSION 119`)، فأي تشغيل لـ`server.js` بـ`node` العادي يفشل. استخدم `ELECTRON_RUN_AS_NODE=1` + `electron.exe`، أو اختبارات `e2e-*` التي تفعل ذلك بنفسها.

---

## 6. قرارات المالك الملزمة (2026-10-28/29)

1. **Git محلي فقط** — لا `push`، ولا إنشاء remote.
2. **لا حذف** لأي ملف/جهاز/مستخدم بلا موافقة صريحة.
3. **`lab-probe@local` يبقى** كما هو (لا حذف، لا تدوير كلمة).
4. **الترخيص MIT يبقى** كما هو.
5. **مفتاح إصدار أندرويد جديد** مطلوب لتوقيع APK، لكنه **معلّق على توفّر JDK** — لا تنفيذ بلا موافقة.
6. **سلامة التحديث best-effort** (تحقق بصمة على أفضل جهد) — لا تُحوَّل إلى إلزام كاسر.

---

## 7. الفخاخ المعروفة (تُوفّر ساعات)

1. **ABI:** كل تشغيل لسيرفر المصدر يجب أن يمرّ بـElectron (القسم 5).
2. **`packages/server-desktop/static/` متعقَّب في git (50 ملفاً)** — لا تنسخ `dist` إليه، سيتّسخ الشجرة. استخدم `dev-ui-serve`.
3. **الانتظار في اللقطات:** ≥9s (12s أأمن)؛ غير ذلك شاشة إقلاع أو بيضاء.
4. **`core.autocrlf=true`:** كتابة الملفات بـLF لا تُنتج diff وهمياً؛ لا تحوّل الملفات إلى CRLF.
5. **`lib/i18n.ts`:** `TKey = keyof typeof T.ar`، فأي مفتاح جديد يُضاف إلى `ar` **و**`en`. ومفتاح `copy` موجود أصلاً — لا تُضفه ثانية (TS1117).
6. **`useT()` تُرجع دالة جديدة كل render** — لا تضعها في تبعيات `useCallback`/`useEffect` وإلا دخلت حلقة طلبات (عيب حدث وأُصلح في هذه الجلسة).
7. **بيانات المختبر ممنوع طبعها** في أي تقرير أو لقطة.
8. **`Modal`** يملك `aria-labelledby="ui-modal-title"` ثابتاً — نافذتان معاً في نفس DOM تتصادمان؛ لا تفتح اثنتين في آن واحد.
9. **في AutoClaw:** أدوات الملفات (read/write/edit) محصورة في مجلد مساحة العمل، أما المستودع على `D:` فيُقرأ/يُكتب عبر `exec` (PowerShell) أو بنسخ المرآة إلى `_work` ثم الإرجاع.

---

## 8. خطة العمل التالية (بالترتيب ومعيار القبول)

| # | المهمة | معيار القبول |
|---|---|---|
| 1 | **تباين الشاشات الفعلي** | لقطات 360/768/1280/1920 فاتحة وداكنة للصفحات التسع المحوَّلة، وفحص بصري لأي نص <4.5:1 |
| 2 | **`OverviewPage`** | صفر نص عربي مباشر خارج `i18n.ts` (كان 856 حرفاً)، وعلى المكتبة (`Card`/`Badge`/`EmptyState`/`SkeletonRows`)، وحالة خطأ حقيقية |
| 3 | **الدفعة الطرفية** | `CommandRunner` (80) + `SettingsExtra` (59) + `PTYTerminal` (55) + `SSHTerminal` (44) — قرار مكتوب بالدمج أو الإبقاء، ثم تصفير الألوان |
| 4 | **البواقي الصغيرة** | `ToastContainer` (16)، `CommandPalette` (16)، `App.tsx` (9)، `ExecConsole` (9)، `ErrorBoundary` (7)، `ScreenPopoutPage` (1) |
| 5 | **بناء 3.8.13** | بناء السيرفر + الوكيلين + اللوحة، تثبيت، `/health` = 3.8.13، وتحديث `CHANGELOG` |
| 6 | **`AiChatPanel`/`ScreenViewer`** | تنفيذ `docs/ADR-R6-INTERACTIVE-SURFACES-AR.md` حرفياً (كروم إلزامي + قائمة استثناء للمحتوى) |

**بعد كل شريحة:** `tsc` + `vite build` + `scan-ui-colors` + `check-contrast` + `verify.js`، ثم تحديث `PROJECT_STATE.md` و`CHANGELOG.md` و`docs/UI-INVENTORY.md`، ثم التزام واحد واضح.

---

## 9. خريطة الوثائق

| الملف | المحتوى |
|---|---|
| `PROJECT_STATE.md` | الحالة اليومية (§0.2 نقطة الاستئناف) |
| `docs/PLAN-STATUS.md` | سجل المراحل، القيود البيئية، أوامر التحقق |
| `docs/UI-INVENTORY.md` | جرد الشاشات + جدول امتثال المكتبة (الأرقام الحقيقية) |
| `docs/PRODUCTION-PLAN-v2.0-AR.md` | الخطة الحاكمة R0–R9 |
| `docs/ADR-R6-INTERACTIVE-SURFACES-AR.md` | قرار `AiChatPanel`/`ScreenViewer`/`LoginPage` |
| `docs/PROTOCOL-RELAY-AR.md` · `docs/PROTOCOL-FILE-TRANSFER-AR.md` | بروتوكولا R4/R5 |
| `outputs/verify-2026-10-29/r6-modals/` | تقرير الشريحة 15 + اللقطات |
| `docs/PROMPT-NEW-ACCOUNT-AR.md` | الأمر الجاهز للحساب الجديد (انسخه كما هو) |

---

## 10. أول 10 دقائق في الجلسة الجديدة

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -3          # 3fe4ec4 على القمة
git status --short            # فارغ
node scripts/check-contrast.cjs
node scripts/scan-ui-colors.cjs
```
ثم اقرأ `PROJECT_STATE.md` §0.1–§0.2، ثم ابدأ بالمهمة 1 في القسم 8.

---

*نهاية التسليم — 2026-10-29.*
