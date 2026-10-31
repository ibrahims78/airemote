# تقرير شريحة 3.9.1 — مفتاح إعادة اتصال الجلسة + إغلاق B1

**التاريخ:** 2026-10-31 · **الفرع:** `checkpoint/3.8.1-2026-10-26` · **Git محلي فقط**
**النطاق المنفَّذ:** A1 (إعادة اتصال) · B0 (إغلاق B1) · البطارية 39→40 · حزم/تثبيت 3.9.1
**دليل الشريحة:** `outputs/verify-2026-11-01/session-reconnect/`

---

## 1) الحالة عند البدء (تحقق الاستئناف)

| الفحص | النتيجة |
|---|---|
| `git log` / `status` | `ab4f3ee` · شجرة نظيفة |
| `/health` · `/ready` | 3.9.0 · `ready:true` · `schema ok` |
| `devs.cjs` | 4 أجهزة online · كلها 3.9.0 |
| `verify.js` | **33/33** |
| `scan-ui-colors` · `check-contrast` | 0 · 22/22 |
| `release-manifest --verify` | signature OK · 5 حزم |

---

## 2) ما تغيّر (الملف | قبل | بعد | أين ذهب)

| الملف | قبل | بعد | أين ذهب |
|---|---|---|---|
| `packages/server-desktop/lib/migrations.js` | LATEST=3 | **v4** `session_view_keys` + فهرسان (up/down مُختبران) | §3.1 |
| `packages/server-desktop/server.js` | تذكرة مرة واحدة فقط | `sessionViewIssueKey` · `sessionViewGrant` · `sessionViewResolveKey` · `sessionViewAuthorize` · إبطال المفتاح عند الإغلاق | §3.1 |
| `server.js` (مسار `/screen`) | `rt` فقط | `rt` ثم سقوط إلى `rk`، واستهلاك `rt` وحدها، وتدقيق `session_view_opened/reopened` | §3.1 |
| `server.js` (`POST /relay/:id/view-ticket`) | يُصدر بـ`requesterDeviceId` | يُصدر بـ**targetDeviceId** ويعيد `resumeKey` | §3.1 (D15) |
| `server.js` (accept payload) | `session:ticket` بلا مفتاح | + `resumeKey` · `resumeUrl` · `keyExpiresAt` | §3.1 |
| `server.js` (`/api/settings` GET) | كل الأسرار لأي مستخدم | **حجب** `ai_config`/`telegramToken`/`github_config` + أي حقل سرّي (قائمة + نمط) لغير admin | §3.2 (B1) |
| `server.js` (`PUT /api/settings`, `PUT /api/settings/:key`) | `authMiddleware` | **`adminMiddleware`** (403) | §3.2 (B1) |
| `dashboard/src/components/ScreenViewer.tsx` | `rt` فقط | `sessionResumeKey` · يرسل `rt`+`rk` · يحذف `rt` من العنوان بعد أول فتح | §3.1 |
| `dashboard/src/pages/ScreenPopoutPage.tsx` | `rt` | + `rk` | §3.1 |
| `dashboard/src/App.tsx` | البوابة على `rt` | `rt` **أو** `rk` | §3.1 |
| `dashboard/src/lib/api.ts` | 401 → `/login` إلا مع `rt` | `isSessionWindow()` = `rt` أو `rk` | §3.1 |
| `dashboard/src/pages/SettingsPage.tsx` | أقسام المزوّد/Telegram لكل مستخدم | أقسام admin فقط + تنبيه + إخفاء زر الحفظ | §3.2 (B1) |
| `agent-desktop/main.js` | لا إعادة تحميل (بلا قائمة) | F5/Ctrl+R يعيد تحميل نافذة العرض → يستأنف بـ`rk` | §3.1 |
| `scripts/verify.js` | 33 خطوة | **40** (6 مصفوفة + settings ACL) | §4 |
| `packages/server-desktop/test/e2e-session-ticket-matrix.cjs` | — | 6 حالات مستقلة | §4 |
| `packages/server-desktop/test/e2e-settings-acl.test.cjs` | — | 14 تحقّق viewer/admin | §4 |
| `packages/server-desktop/test/e2e-migrations.test.cjs` | يفترض LATEST=3 | يختبر v4 ثم v3 ثم v2 (down/up) | §4 |
| `docs/PROTOCOL-RELAY-AR.md` | v2.0 | **v2.1** (§12) | §5 |
| `docs/DECISIONS-LOG.md` | D1–D12 | **D13–D17** | §5 |
| `CHANGELOG.md` · `PROJECT_STATE.md` · `docs/AGENT-SESSION-TEST-MATRIX-AR.md` | 3.9.0 | 3.9.1 | §5 |
| الإصدارات | 3.9.0 | **3.9.1** (سيرفر · وكيلا ويندوز · APK vc27) | §6 |

---

## 3) التفصيل

### 3.1 A1 — مفتاح إعادة الاتصال

**العيب:** `rt` تُستهلك عند أول `/screen`، فأي إعادة تحميل/إعادة اتصال تفشل بـ`ticket_reused` (رُصد على TECNO).

**الحل:** مفتاح `rk` مستقل: 32 بايت · SHA-256 فقط · مقارنة ثابتة الزمن · مقيّد بـ(session, target device, access) · **لا يُستهلك** · عمر الجلسة (سقف 12h) · مفتاح نشط واحد لكل جلسة · يُبطل عند الإغلاق. `rt` بقي مرة واحدة.

**الرابط:** `/view/<target>?rt=…&rk=…&access=…` — العميل يرسل الاثنين، والسيرفر يفضّل `rt` ثم يسقط إلى `rk`؛ وبعد نجاح الفتح يُحذف `rt` من العنوان فتصبح إعادة التحميل `rk` فقط.

**الحارس على T5:** `rt` وحدها بعد الاستهلاك تُرفض (`ticket_reused`) — مُختبر.

### 3.2 B0 — B1 مُغلق

- `GET /api/settings` لغير admin: **200** بلا `ai_config` · `telegramToken` · `github_config` · بلا أي حقل يطابق `token|secret|password|api_key|private_key|credential`، مع بقاء `aiProvider`/`aiModel`/`aiConfigs` (مقنّعة) و`uiTheme` وغيرها.
- `PUT /api/settings` و`PUT /api/settings/:key`: **403** لغير admin، وبلا أثر جانبي (مُختبر على القاعدة).
- الواجهة: أقسام المزوّد وTelegram للمدير فقط + تنبيه لغير المدير + زر الحفظ مخفي.

---

## 4) الأرقام

| البوابة | النتيجة |
|---|---|
| بطارية `verify.js` | **40/40** (`verify-40.log`) |
| مصفوفة التذكرة/المفتاح | **6/6 حالات PASS** (reuse · third-device · password-lock · expiry · view-no-control · revoke-on-close) |
| settings ACL | **14/14** (viewer 200 بلا أسرار · PUT 403 · admin 200/200) |
| `scan-ui-colors` | **0** |
| `check-contrast` | **22/22** |
| `tsc` (لوحة + سيرفر + وكيل) | 0 |
| `release-manifest --verify` | **signature OK · 5 حزم** |
| الأجهزة | 4/4 على **3.9.1** |

الخطوات الست المطلوبة في A4 أصبحت خطوات مستقلة في البطارية (33 + 6 = 39) وأُضيفت خطوة B1 فصار المجموع 40.

---

## 5) التوثيق

- `docs/PROTOCOL-RELAY-AR.md` → **v2.1**: جدول سلوك `/screen` بكل مدخل، المخطط v4، التصحيح المرافق، أسماء التدقيق.
- `docs/DECISIONS-LOG.md`: D13 (المفتاح) · D14 (مفتاح واحد + إبطال عند الإغلاق) · D15 (view-ticket بالهدف) · D16 (B1 معتمد ومُنفَّذ) · D17 (trustProxy معطّل بقصد).
- `CHANGELOG.md` · `PROJECT_STATE.md` §0.1 · `docs/AGENT-SESSION-TEST-MATRIX-AR.md` (T3/T4/T5/T13 + البطارية 40/40).

---

## 6) الحزم والتثبيت

| الحزمة | المسار | الحالة |
|---|---|---|
| سيرفر | `releases/server-windows/AiRemote-Server-Setup-v3.9.1-x64.exe` | مثبَّت · `/health` = 3.9.1 · `schema ok` |
| وكيل ويندوز | `releases/agent-windows/AiRemote-Agent-Setup-v3.9.1-x64.exe` | app.asar مبدَّل على WIN10/WIN11 · 3.9.1 |
| APK | `releases/android-agent/AiRemote-Agent-Android-v3.9.1.apk` (vc27) | مثبَّت على المحاكي وTECNO · 3.9.1 |
| بيان | `releases/manifest.json` + `.sig` | 5 حزم · signature OK |

3.9.0 أُرشف إلى `releases/archive/` (سيرفر · وكيل · APK).

---

## 7) الإثبات الحيّ

### 7.1 WIN10 → WIN11 — **PASS (A1 مُثبت حياً)**

| الحدث | الوقت (UTC) | التدقيق |
|---|---|---|
| طلب + قبول (نقر حقيقي على «سماح» في بطاقة WIN11) | 19:23:24 | `session_accepted` · `decider=device:…` |
| إصدار تذكرة + مفتاح | 19:23:24 | `session_view_ticket_issued` · `session_view_key_issued` |
| فتح نافذة العرض | 19:23:41 | `session_view_opened` · `mode=ticket` |
| **F5 على نافذة العرض** | ~19:23:52 | — |
| **إعادة الفتح بالمفتاح** | **19:23:58** | **`session_view_reopened` · `mode=resume`** |

الجلسة `056ed7c4-30a2-45c1-9446-7a3f1c40cbb7`. اللقطات: `win10-viewer-before-reload.png` · `win10-viewer-after-reload.png` · `win11-target.png`.

> ملاحظة صدق: النقر الصناعي من مضيف المختبر نجح في المحاولة الثالثة فقط (بعد نقل نافذة الوكيل إلى 5,5)؛ المحاولتان الأوليان أعطتا `denied`/`requested`. لا يعتمد الإثبات على النقر: الأثر الحاسم هو `opened` ثم `reopened` بنفس الجلسة.

### 7.2 WIN10 → TECNO — **جزئي**

| الحدث | الوقت | التدقيق |
|---|---|---|
| طلب | 19:34:34 | `session_requested` |
| قبول حقيقي بنقر `adb tap 440,960` على «سماح» | 19:34:35 | `session_accepted` · `decider=device:…` |
| فتح WebView | 19:34:48 | `session_view_opened` · `mode=ticket` |
| تدوير الشاشة (إعادة إنشاء النشاط) | 19:36 | **لا صف جديد** — WebView لم يعد في المقدمة |

**ما لم يتحقق:** إعادة الفتح بـ`rk` على TECNO في هذه الجولة. السبب المرصود: بعد الفتح الأول عاد التطبيق إلى الشاشة الرئيسية ولم يبقَ `SessionWebViewActivity` في المقدمة، فالتدوير أعاد إنشاء النشاط الرئيسي لا نشاط العرض. هذا **لا ينقض** منطق A1 (السيرفر يخدم `rk` والمصفوفة تثبته)، لكنه يترك بند TECNO بلا دليل حيّ.

**التالي (A2):** إبقاء `SessionWebViewActivity` في المقدمة + `onConfigurationChanged` بلا إعادة إنشاء، أو إعادة تحميل صريحة (`webView.reload()`) عند `onResume` — ثم إعادة الجولة.

### 7.3 عيب مفتوح (يُسجَّل ولا يُخفى)

نافذة العرض على WIN10 ظهرت **بيضاء/فارغة** في اللقطة الأولى، ثم اتصلت فعلياً بعد ثوانٍ (19:23:41). أي أن التحميل يستغرق وقتاً أطول من 6 ثوانٍ على هذا الجهاز، أو أن أول رسم يتأخر. **لا يُعتبر عيباً مؤكداً**؛ يُقاس في A2 (زمن أول إطار) مع تسجيل اللقطتين.

---

## 8) ما لم يُنفَّذ ولماذا

| البند | السبب |
|---|---|
| T9/T10/T11 · T15 · T18 (A2/A3) | خارج شريحة 3.9.1 حسب الأمر §10 (تُنفَّذ بعد هذا التقرير) |
| T13 داخل جلسة Relay | مغطّى أصلاً ببوابة R5 عند **10GB** (قطع 50% + SHA مطابق)؛ الإعادة داخل الجلسة في A3 |
| R9.4 / R9.5 (B1/B2 في الأمر) | تبدأ بعد هذه الشريحة؛ تحتاج 8 حسابات وموافقات (D0) |
| `trustProxy` | النشر ليس خلف وكيل عكسي — يبقى معطّلاً ويُوثَّق (D17) |

---

## 9) نقطة الاستئناف

> **3.9.1 مثبَّت على الأجهزة الأربعة والبطارية 40/40، وA1 مُثبت حياً على WIN10→WIN11 (`opened` ثم `reopened` بنمط `resume`). التالي: A2 — إبقاء WebView TECNO في المقدمة وإثبات `reopened` عليها، ثم T9/T10/T11، ثم T15/T18، ثم بدء R9.4 (D0).**

## 10) أوامر التحقق السريعة

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
curl.exe -sk https://127.0.0.1:3001/health          # 3.9.1
curl.exe -sk https://127.0.0.1:3001/ready           # ready:true · schema ok (v4)
node tools\lab\devs.cjs                             # 4 online · 3.9.1
node scripts\verify.js                              # 40/40
node scripts\release-manifest.js --verify           # signature OK · 5 حزم
node tools\lab\session\proof-a1-reload.cjs          # إثبات A1 ويندوز
```
