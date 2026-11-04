# استئناف مشروع **AiRemote** — حساب جديد · 2026-11-04 · الإصدار **3.13.0**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-04-3.12.2-FULL-AR.md`.**
> كل رقم فيه مقيس بأمر أو محفوظ في `outputs/verify-2026-11-04/screen-unify/` أو `docs/SCREEN-UNIFY-TEST-MATRIX-AR.md`.

---

## 0) ما تغيّر منذ 3.12.2 (اقرأ أولًا — يحكم على ما بعده)

**النسخة الآن 3.13.0** · `versionCode=58` · الفرع **`feat/screen-unify-3.13.0`** (لم يُدمج في الرئيسي) · Git محلي (0 remotes)
· السيرفر المثبَّت **3.13.0** · الوكلاء على الأجهزة ما زالوا **3.12.3** (لم يُبنَ وكيل 3.13.0 بعد).

| الالتزام | الشريحة |
|---|---|
| `5c4667b` | 3.12.3 — تحذير الإدخال + تسجيل أوامر العامل + الزر الأيمن (بلا حارس) |
| `68e4046` | **3.13.0 — توحيد سطح بث الشاشة** (24 ملفًا، ‎+661/−777) |
| `e6150b9` | توثيق نتائج المرحلة 0/1 |
| `993dd13` | إغلاق قوائم التسجيل/المزيد عند النقر على اللوحة |
| `d38f5f0` | تسجيل نتيجة `verify` (43/44) |
| `f38d42a` | نقل «دقة الجهاز» خارج قائمة الجودة |
| `f2628a8` | نشر حزمة اللوحة 3.13.0 + البيان الموقّع |
| `a7f5452` | برومبت الحساب الجديد 3.13.0 |
| `ea86edc` | تحديث خط أساس القياس بعد نافذة دقة الجهاز |

### 0.1 الحالة الحرجة الآن

- **السيرفر 3.13.0 مثبَّت ويعمل:** `/health` = `3.13.0` (TLS، منفذ 3001)، والحزمة الجديدة تُقدَّم فعليًا
  (`static/assets/ScreenViewer-BECNyttN.js` — 87,230 بايت).
- **توحيد الإصدار PASS:** VERSION + 4 حزم + gradle vc58 + `releases/manifest.json` + `/health` كلها 3.13.0.
- **البيان:** أُعيد توليده؛ `release-manifest.js --verify` = `signature OK` + `all artifacts match`.
- **الواجهة موحّدة:** عارض واحد، 11 زرًا ظاهرًا، مدخل واحد لكل جهاز، جلسات في `/sessions` فقط.
- **الوكلاء 3.12.3:** يعملون على WIN10/WIN11 (6 عمليات لكل ضيف) ويتصلون بالسيرفر الجديد؛ البروتوكول لم يتغيّر.

### 0.2 أسباب جذرية مُصلحة في 3.13.0 (لا تُعِدها)

1. **الزر الأيمن كان يُغلق قائمة السياق:** `pointerup` كان يقارن بـ`downX/downY` القديمين ويرسل نقرة يسرى.
   الحارس: تثبيت `downX/downY` + `longFired=true` في فرع `button===2`.
2. **الإسقاط الصامت:** الوكيل يرسل `agent:screen_input_warning` عند غياب المنح (سيرفر سطح المكتب يمرّره، والعارض يعرضه).
3. **أدوات التحكم في «عرض فقط»:** أزرار التحكم/المفاتيح/النص تُخفى عند `viewOnly` مع شارة «عرض فقط».
4. **3 مكوّنات عرض:** دُمج `LivePreview` كوضع `preview` داخل `ScreenViewer` ثم حُذف الملف.
5. **جدار مراقبة مزدحم:** صار للقراءة فقط (فتح/إزالة فقط) بدل 7 أزرار إدارة.
6. **مداخل مكررة:** أُزيل CTA من رأس النظرة العامة وزر النافذة من رأس مساحة الجهاز، وأُضيف زر واحد في صفحة الأجهزة.
7. **44 زرًا:** شريط واحد بـ11 زرًا + قائمة «المزيد» (أندرويد، نافذة، علامة مائية، لوحة مفاتيح، نص، صوت، خصوصية، دردشة، مشاهدون، إعادة اتصال، تثبيت).
8. **تسجيلان:** قائمة واحدة (WebM / MP4 سيرفر / تنزيل).
9. **جلسات في مكانين:** `/sessions` فقط؛ أُزيل تبويب الإعدادات.
10. **بث في الخلفية:** مغادرة تبويب الشاشة تُغلق الاتصال (unmount).
11. **دقة الجهاز:** نُقلت من قائمة الجودة إلى نافذة مستقلة تُفتح من «المزيد».

### 0.3 تحذيرات حاكمة (كلها من أخطاء فعلية)

- **UIPI:** أي نافذة مرتفعة (Task Manager/UAC) تُسقط الإدخال من وكيل عادي ⇒ شغّله كمسؤول.
- **المنح:** بلا كلمة سر تحكم يرد الوكيل `screen:control_denied`؛ جلسة «عرض فقط» يرفضها السيرفر قبل الوكيل.
- **`core.autocrlf=true`:** تطبيق أي ترقيع على ملفات LF بـ`git apply` الافتراضي يقلبها CRLF ويُظهر الملف كاملًا معدّلًا.
  استخدم دائمًا: `git -c core.autocrlf=false apply ...`.
- **`build-gdi-worker.cjs` يُخزّن:** استخدم `--force` بعد أي تعديل `.cs`.
- **مثبّت السيرفر:** أوقف عمليات `AiRemote Server` أولًا ⇒ `Setup.exe /S` حتى `exit=0` ⇒ شغّل الـexe ⇒ تحقق `/health`.
- **`patch.cjs` يرفض الانكماش:** مرّر `"allowShrink": true`.
- **PowerShell 5.1:** لا backticks ولا `\"` في `git commit -m`.
- **مقياس الشريط:** يعتمد على وسم `data-tb="1"` على أزرار الشريط العلوية؛ أي زر جديد بلا الوسم لا يُحتسب.
- **وضع المعاينة ثقيل:** كل مربع مراقبة = عارض كامل الحالة (6 جلسات WS كحد أقصى) — يُقاس في المرحلة 2.

---

## 1) بيئة العمل — مسارات كاملة

| العنصر | المسار/القيمة |
|---|---|
| المستودع | `D:\autoclaw projects-new\AiRemote` · الفرع `feat/screen-unify-3.13.0` · محلي فقط |
| الرئيسي | `hardening/audit-20261102` عند `54ab5ff` (لم يُمسّ) |
| السيرفر المثبَّت | `https://127.0.0.1:3001` · `/health` = **3.13.0** · TLS ذاتي |
| تنفيذي السيرفر | `C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe` |
| تنفيذي الوكيل | `C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe` |
| قاعدة البيانات | `C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db` (قراءة فقط) |
| أدوات أندرويد | `D:\autoclaw projects\offline-build-tools\android-toolchain` |
| VMware | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` |
| الضيوف | `E:\VMs\Win10_Pro_Custom\...vmx` · `E:\VMs\Win11_Custom_2026-09-30\...vmx` |
| أسرار — **لا تُطبع** | `%APPDATA%\AiRemote\lab-credentials.txt` (مفاتيحه: email, password, server, vm_guest_user, vm_guest_password) · `signing\keystore-password.txt` · أي JWT |

**الأجهزة (من الملف السابق + فحص اليوم):**

| الجهاز | deviceId | النسخة | ملاحظة |
|---|---|---|---|
| WIN10-VM | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | 3.12.3 | 6 عمليات وكيل، شاشة 1534×649 |
| WIN11-VM | `d147684b-2451-4418-a628-86f11aa66a4e` | 3.12.3 | 6 عمليات وكيل |
| TAB16-USB / TECNO / LDPlayer | كما في الملف السابق | 3.12.2-android | vc56 |

> **ملاحظة:** محاولة تسجيل الدخول عبر `/api/auth/login` ببيانات `lab-credentials.txt` أعادت **401** اليوم.
> لا تفترض صلاحيتها؛ اطلب بيانات المالك أو استخدم واجهة السيرفر المفتوحة.

---

## 2) المستودع — ما تغيّر في هذه الموجة

**الكود (الواجهة):**
- `packages/dashboard/src/components/ScreenViewer.tsx` — وضع `preview` · شريط 11 زرًا + More · قائمة تسجيل · إخفاء التحكم في «عرض فقط» · حارس الزر الأيمن · نافذة دقة الجهاز.
- `packages/dashboard/src/components/LivePreviewBoard.tsx` — أُعيد بناؤه: جدار مراقبة للقراءة فقط يستخدم `ScreenViewer preview`.
- `packages/dashboard/src/components/LivePreview.tsx` — **محذوف** (دُمج).
- `packages/dashboard/src/lib/screenWindow.ts` — **جديد**: `openScreenWindow` + مقاس 1400×900 + اسم نافذة لكل جهاز.
- `packages/dashboard/src/pages/{OverviewPage,DeviceWorkspacePage,DevicesPage,SettingsPage}.tsx`
- `packages/dashboard/src/layouts/DashboardLayout.tsx` — رابط الجلسات إلى `/sessions`.
- `packages/dashboard/src/lib/i18n.ts` — مفاتيح: `viewer_view_only`, `viewer_open`, `viewer_more`, `viewer_record`.
- `packages/agent-desktop/main.js` — تحذير الإدخال (3.12.3).
- `packages/agent-desktop/lib/capture-gdi-worker.cs` — تسجيل أوامر العامل (3.12.3).

**الأدوات والتوثيق:**
- `scripts/audit-screen-surface.cjs` — بوابة: `data-tb` ≤12 · `window.open(/view/)` = 0 · `screen:stop` ≤2.
- `scripts/screen-surface-baseline.json` — خط أساس مثبّت (11/0/2).
- `docs/UI-SCREEN-SURFACE-AR.md` · `docs/ADR-SCREEN-UNIFY-AR.md` · `docs/SCREEN-UNIFY-TEST-MATRIX-AR.md`.
- `CHANGELOG.md` (3.13.0) · `PROJECT_STATE.md` (قسم 2026-11-04 + قسم النشر).

**الإصدار:** `VERSION` · 4 `package.json` · `build.gradle` vc58 · `releases/manifest.json` + `.sig`.

---

## 3) الحالة الحالية (تُتحقَّق في §10 ولا تُعاد بناؤها)

- **السيرفر:** 3.13.0 مثبَّت ويعمل، ويقدّم اللوحة الجديدة.
- **الواجهة:** مكوّن عرض واحد · 11 زرًا ظاهرًا · 4 مداخل · جلسات في مكان واحد · لا بث خفي.
- **الاختبارات المنفذة:**
  - `pnpm --filter @airemote/dashboard typecheck` = **PASS**
  - `pnpm --filter @airemote/dashboard build` = **PASS**
  - `node scripts/check-imports.js` = **PASS** (60 ملفًا/135 استيرادًا)
  - `node scripts/check-contrast.cjs` = **PASS 22/22**
  - `node scripts/audit-screen-surface.cjs --check` = **PASS**
  - `electron test/e2e-screen-control.test.cjs` = **PASS** (بث/مشاهد متأخر/keyframe/تعدد مشاهدين/إيقاف آخر مشاهد/تحذير a11y)
  - `electron test/e2e-agent-session.test.cjs` = **PASS** (Relay)
  - `electron test/e2e-session-ticket-matrix.cjs --case=view-no-control` = **PASS**
  - `node scripts/verify.js` = **43/44 PASS** — الفشل الوحيد كان توحيد الإصدار قبل النشر، **وأُعيد التحقق بعده = PASS**.
- **البيان:** signature OK · all artifacts match.

---

## 4) القرارات الحاكمة

- **D40:** التحكم في ويندوز يتطلب: جلسة تحكم + كلمة سر مقبولة + وكيلًا مرتفعًا لنوافذ UIPI.
- **D41 (جديد):** عارض واحد بثلاثة أوضاع (`full`/`popout`/`preview`)؛ لا مكوّن عرض ثانٍ.
- **D42 (جديد):** جدار المراقبة للقراءة فقط (فتح/إزالة)، ولا إدارة بث من المربع.
- **D43 (جديد):** أي زر جديد في سطح الشاشة يتطلب `data-tb="1"` + تحديث `UI-SCREEN-SURFACE-AR.md` + تمرير `audit-screen-surface --check`.

---

## 5) المتبقي (بالترتيب)

### 5.1 وكيل 3.13.0 (الأولوية الأولى)
1. `cd packages\agent-desktop; $env:CSC_IDENTITY_AUTO_DISCOVERY='false'; .\node_modules\.bin\electron-builder.cmd --win --x64`
   (وبعده `node scripts\build-gdi-worker.cjs --force` إن لزم).
2. انسخ `win-unpacked\resources\app.asar` إلى الضيف باسم `C:\Users\admin\new-app.asar`.
3. `node tools\lab\a2a\vmguest.cjs ps win10 "<repo>\outputs\verify-2026-11-04\control\scripts\swap-31210.ps1"`
   ⇒ تحقق `SIZE_MATCH` و`RUNNING` ⇒ إن كان 0: `vmguest.cjs start-agent win10`.
4. كرّر لـ WIN11. تحقق من `/health` و`devs.cjs` أن النسختين 3.13.0.

### 5.2 اختبارات الأجهزة (TC المتبقية)
- TC-001/002: الزر الأيمن (قائمة سياق تبقى مفتوحة، بلا نقرة يسرى).
- TC-003/004: «عرض فقط» — إخفاء الأدوات + رفض المحاولة.
- TC-008/012/015/019: بدء تلقائي، جودة المعاينة، التسجيل، إيقاف التبويب المخفي.
- TC-020/021/022/024: RTL/جوال/إتاحة/أداء.
- **المتصفح لم يكن متاحًا في جلسة التنفيذ** ⇒ هذه الاختبارات تحتاج نافذة بشرية.

### 5.3 المرحلة 2 المتبقية
- تنظيف مفاتيح i18n اليتيمة (آمن: افحص المراجع أولًا؛ لا تحذف مفاتيح تُستدعى متغيرًا).
- قياس أداء وضع preview (6 مربعات) وخفض الحد أو تحميل كسول.
- دمج الفرع في الرئيسي بعد الاختبارات: `git checkout hardening/audit-20261102 && git merge feat/screen-unify-3.13.0`.

### 5.4 ملاحظة على بيانات الدخول
تسجيل الدخول API بـ`lab-credentials.txt` أعاد 401 اليوم — تحقق من الحساب قبل أتمتة أي اختبار واجهة.

---

## 6) سير العمل (إلزامي)

1. تعديل المستودع عبر `tools/lab/a2a/patch.cjs` (مرساة واحدة، `allowShrink` عند الحذف) أو تعديل مباشر مع assertions.
2. **شريحة واحدة = التزام واحد** + دليل في `outputs/verify-<date>/` + `CHANGELOG` + `PROJECT_STATE`.
3. أي تغيير في الواجهة: `typecheck` + `build` + `audit-screen-surface --check` قبل الالتزام.
4. رفع الإصدار عند أي شحنة: `VERSION` + 4 `package.json` + `versionCode` + البيان.
5. بناء السيرفر:
   ```powershell
   cd packages\server-desktop
   pnpm run build:win:nodownload
   # ثم: أوقف AiRemote Server ⇒ Setup.exe /S ⇒ شغّل الـexe ⇒ /health
   ```
6. بعد أي إقلاع ضيف: أعد تشغيل الوكيل وانتظر 15–25s.
7. التزامات Git بالإنجليزية، محلية فقط.
8. **لا PASS بلا دليل** على الطبقة الصحيحة.

---

## 7) أدوات لا تُستبدل

`vmguest.cjs` (`probe`/`ps`/`shot`/`copyIn`/`copyOut`) · `swap-31210.ps1` · `start-agent` · `patch.cjs` ·
`build-gdi-worker.cjs` (**--force**) · `devs.cjs` · `lab.cjs` · `cpu-probe.ps1` · `cursor-test.ps1` ·
`sendinput-test.ps1` · `clip-check.ps1`.

**بوابات:** `verify.js` · `check-version-consistency.cjs` · `scan-ui-colors.cjs` · `check-contrast.cjs` ·
`release-manifest.js --verify` · `check-first-frame.cjs` · **`audit-screen-surface.cjs --check`**.

---

## 8) التفويض للمساعدين

- الجرد الحسّاس والتحكم بالأجهزة في الجلسة الرئيسية.
- فوّض فقط العريض القابل للتحقق (بحث خارجي، مراجعة مستقلة على نسخة).
- **درس متكرر:** مساعد المراجعة فشل تقنيًا (`subagent_execution_failed`) في جلستين — لا تعتمد عليه كبوابة وحيدة.

---

## 9) قواعد ملزمة (من أخطاء فعلية)

1. Git محلي فقط. 2. لا أسرار في المخرجات. 3. PowerShell 5.1 يقرأ UTF-8 كـANSI ⇒ `-Encoding UTF8` أو Node.
4. لا PASS بلا دليل. 5. أندرويد: `am force-stop` يُعطّل خدمة الوصول. 6. بعد إقلاع ويندوز أعد تشغيل الوكيل.
7. `datetime('now')` = UTC. 8. لا تلمس `bin/` · `.cache/` · `node_modules`.
9. `vmrun start` يفشل أحيانًا ⇒ `nogui`. 10. asar: أي أصل يقرأه process خارجي يُستخرج إلى `%APPDATA%`.
11. `vmguest.ps`: الخرج = اسم السكربت. 12. ملكية الأجهزة: طلب جهاز←جهاز يفشل 403.
13. TDZ: لا `let/const` قبل تعريفها. 14. تذكرة `rt` عمرها 60s. 15. CSP. 16. IPC/JSON.
17. قفل VMware العالق ⇒ أَزح `.vmx.lck`.
18. **`SetCursorPos` مرفوض في الضيف ⇒ `SendInput`.**
19. **UIPI ⇒ وكيل كمسؤول.**
20. **ProTUN يقطع LAN المضيف ⇒ أوقفه أو استخدم ضيف WIN10 جسرًا.**
21. **منفذ اقتران adb ≠ منفذ الاتصال.**
22. **`build-gdi-worker.cjs` يُخزّن ⇒ `--force`.**
23. **`patch.cjs` يرفض الانكماش ⇒ `allowShrink`.**
24. **(جديد) `git apply` على ملفات LF ⇒ `-c core.autocrlf=false`.**
25. **(جديد) أي زر في شريط الشاشة بلا `data-tb="1"` لا يُحتسب في البوابة.**

---

## 10) قائمة تحقق الاستئناف (قراءة فقط — نفّذها عند «ابدأ» ثم أعد الجدول وتوقف)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -8; git status --short; git branch --show-current
curl.exe -sk https://127.0.0.1:3001/health
node scripts/check-version-consistency.cjs
node scripts/audit-screen-surface.cjs --check
node scripts/release-manifest.js --verify
node scripts/verify.js
& 'C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe' list
node tools\lab\a2a\vmguest.cjs probe
```

**المتوقع:**
- الفرع `feat/screen-unify-3.13.0` · شجرة نظيفة (عدا `M tools/lab/a2a/guest-WIN10.png` ومخرجات مختبر غير متعقَّبة).
- `/health` = **3.13.0** · توحيد الإصدار **PASS** · `audit` **PASS** (11/0/2) · البيان **signature OK**.
- `verify` = 44/44 (بعد النشر؛ كان 43/44 قبل تثبيت 3.13.0).
- ضيفان في `vmrun list` · 6 عمليات وكيل في كل ضيف.

**إن سقطت الواجهة:** راجع `audit-screen-surface` أولًا، ثم `ScreenViewer` (وضع preview/الشريط)، ثم سجل الـconsole.
**إن سقط التحكم:** تحقق من المنح، ثم UIPI، ثم `input-worker.log` — لا تغيّر الشيفرة قبل معرفة الطبقة.

---

## 11) مخرجاتك المطلوبة الآن (بلا تنفيذ)

1. جدول تحقق §10: المتوقع مقابل الفعلي لكل بند.
2. أي انحراف بسطر الدليل (ملف/سطر أو ناتج أمر).
3. تأكيد أنك لم تُعدّل شيئًا وأنك تنتظر «ابدأ».

**بعد «ابدأ»:** ابدأ من §5.1 (وكيل 3.13.0) ثم §5.2 — لا من الصفر.

---

## 12) ملحق: حصيلة هذه الموجة

| المجال | الإنجاز | الدليل |
|---|---|---|
| توحيد العارض | 3 مكوّنات → 1 (full/popout/preview) | `ScreenViewer.tsx` · حذف `LivePreview.tsx` |
| الشريط | 44 → 11 زرًا + «المزيد» | `audit-screen-surface --check` |
| المداخل | 11 → 4 | `docs/UI-SCREEN-SURFACE-AR.md` |
| الإيقاف | 6 → 4 مسارات | نفسه |
| المقاس | 8 استدعاءات → دالة واحدة 1400×900 | `lib/screenWindow.ts` |
| الجلسات | مسار واحد `/sessions` | `App.tsx` · `DashboardLayout` |
| البث الخفي | يتوقف عند مغادرة التبويب | `DeviceWorkspacePage` |
| التسجيل | 3 أزرار → قائمة واحدة | `ScreenViewer` |
| دقة الجهاز | خارج قائمة الجودة | نافذة من «المزيد» |
| الاختبارات | typecheck/build/imports/contrast/e2e/verify | `outputs/verify-2026-11-04/screen-unify/` |
| النشر | 3.13.0 مثبَّت · health PASS · بيان موقّع | `/health` · `manifest.json` |
