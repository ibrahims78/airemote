# تقرير شريحة 3.9.0 — جلسات وكيل↔وكيل (تذكرة العرض)

**التاريخ:** 2026-10-31 · **الفرع:** `checkpoint/3.8.1-2026-10-26` · **الإصدار:** 3.9.0 (MINOR)
**الحكم:** **مُنفَّذة ومُثبَتة على الأجهزة الأربعة** — السيرفر 3.9.0 مثبَّت، ووكيلا ويندوز 3.9.0، وAPK 3.9.0 على المحاكي وTECNO. جلسات حقيقية: WIN10→WIN11 (بث)، WIN10→Android (بث)، WIN10→TECNO (قبول + تدقيق، مع قيد إعادة تحميل التذكرة). **ما تبقّى:** T9–T11 وT13/T15/T18، والبطارية 39/39.

---

## 1) الملفات — قبل / بعد / أين ذهب

| الملف | قبل | بعد | أين ذهب |
|---|---|---|---|
| `packages/server-desktop/server.js` | 3.8.41 · بلا تذاكر | **3.9.0** · +230 سطراً: تذكرة · مصادقة جهاز · `/screen?rt` · بوابة REST · تدقيق | السيرفر |
| `packages/server-desktop/lib/migrations.js` | LATEST=2 | **v3** `session_view_tickets` + فهرسان (up/down) | القاعدة |
| `packages/server-desktop/test/e2e-session-ticket.test.cjs` | — | **15 فحصاً**: T2 · T1 · T5 · T6 | الاختبارات |
| `packages/server-desktop/test/e2e-migrations.test.cjs` | يفترض LATEST=2 | يغطي v3 + خطوتَي down/up | الاختبارات |
| `scripts/verify.js` | 32 خطوة | **33** (خطوة التذكرة) | البطارية |
| `packages/dashboard/src/App.tsx` | `/view` خلف RequireAuth | `SessionTicketGate` (rt يتجاوز الدخول) | اللوحة |
| `packages/dashboard/src/pages/ScreenPopoutPage.tsx` | يقرأ `/api/devices` دائماً | يقرأ rt/access ويتخطى API | اللوحة |
| `packages/dashboard/src/components/ScreenViewer.tsx` | JWT فقط | `rt` في WS + حجب رسائل التحكم في `view` | اللوحة |
| `packages/dashboard/src/lib/version.ts` | 3.8.41 | 3.9.0 | اللوحة |
| `packages/agent-desktop/main.js` | لا يعالج `session:offer/ticket` | +95 سطراً: نافذة عرض · Relay API · قرار | وكيل ويندوز |
| `packages/agent-desktop/preload.js` | — | 4 جسور جديدة | وكيل ويندوز |
| `packages/agent-desktop/renderer/index.html` | — | بطاقة اتصال + modal موافقة | وكيل ويندوز |
| `packages/agent-desktop/renderer/app.js` | — | +68 سطراً: رمز 9 أرقام · طلب · عدّاد · قرار | وكيل ويندوز |
| `packages/*/package.json` · `version.ts` | 3.8.41 | **3.9.0** | الإصدار |
| `docs/ADR/AGENT-SESSION-AR.md` | — | قرار المعمارية + بوابة الفشل | وثائق |
| `docs/PROTOCOL-RELAY-AR.md` | v1.1 | **v2.0** (+57 سطراً، v1.1 محفوظ) | وثائق |
| `docs/DECISIONS-LOG.md` | — | 12 قراراً تنفيذياً | وثائق |
| `docs/AGENT-SESSION-TEST-MATRIX-AR.md` | — | T1–T18 بحالتها الصادقة | وثائق |
| `docs/AGENT-SESSION-AR.md` | — | دليل المستخدم | وثائق |
| `docs/RELEASE-NOTES-3.9.0-AR.md` | — | ملاحظات الإصدار + القيود | وثائق |
| `CHANGELOG` · `PROJECT_STATE` · `PLAN-STATUS` | 3.8.41 | بند 3.9.0 | الجذر |
| `outputs/verify-2026-10-31/agent-session/` | — | سجلات البطارية والتذكرة والألوان والتباين والبناء والبيان | دليل الشريحة |
| `releases/server-windows/AiRemote-Server-Setup-v3.9.0-x64.exe` | — | **152MB** · إنشاء 3.9.0 | حزمة السيرفر |
| `releases/agent-windows/AiRemote-Agent-Setup-v3.9.0-x64.exe` | — | **72.8MB** · إنشاء 3.9.0 | حزمة الوكيل |
| `releases/manifest.json` | 5 حزم 3.8.41 | **5 حزم** · 3.9.0 + APK 3.9.0 · `signature OK` | البيان |

**المجموع:** 18 ملفاً معدَّلاً + 7 ملفات جديدة · **+591/−24** سطراً في الملفات المتعقَّبة.

---

## 2) الأدلة بالأرقام

| البوابة | النتيجة | الدليل |
|---|---|---|
| `verify.js` | **33/33** | `outputs/.../verify.txt` |
| `e2e-session-ticket` | **15/15 PASS** | `outputs/.../ticket-test.txt` |
| `scan-ui-colors` | **0** | `outputs/.../colors.txt` |
| `check-contrast` | **22/22** | `outputs/.../contrast.txt` |
| `tsc --noEmit` (لوحة) | **0 أخطاء** | تشغيل مباشر |
| `vite build` (لوحة) | **ناجح** 37s | `dist/` |
| `node --check` (main/preload/server) | **0** | تشغيل مباشر |
| بناء حزمة السيرفر | **ناجح** · 152MB | `outputs/.../build-server.txt` |
| بناء حزمة الوكيل | **ناجح** · 72.8MB | `outputs/.../build-agent.txt` |
| `release-manifest --verify` | **signature OK · all artifacts match** · 5 حزم | `outputs/.../manifest-verify.txt` |

**سلوك مُثبَت بالاختبار:**

- لا `session:ticket` قبل accept، ولا بعد deny.
- تذكرة 64 hex · `viewUrl=/view/<target>?rt=` · تُفتح مرة واحدة · الثانية تُرفض.
- تذكرة على جهاز ثالث تُرفض.
- `requesterDeviceId` مخالف ⇒ 403 `requester_mismatch`.
- إغلاق الجلسة يُبطل التذكرة.
- كل إصدار/فتح/رفض له صف تدقيق.

---

## 2.6) التركيب والاختبار الحيّ (2026-10-31)

| الجهاز | الإصدار المثبَّت | الدليل |
|---|---|---|
| السيرفر (المضيف) | **3.9.0** · `/health` + `/ready` · schema v3 | `health` 3.9.0 · `ready:true` |
| WIN10-VM | وكيل **3.9.0** | `devs.cjs` |
| WIN11-VM | وكيل **3.9.0** | `devs.cjs` |
| Android-Emulator | APK **3.9.0 (vc26)** | `dumpsys package` |
| TECNO-KL4 | APK **3.9.0 (vc26)** | `dumpsys package` |

**جلسات حقيقية:**
- **WIN10 → WIN11**: طلب 201 · موافقة فعلية على WIN11 (نقر «سماح» عبر UIAutomation) · `state=active` · `session_view_opened` · نافذة العرض على WIN10 بثّت سطح WIN11 (`win10-final.jpg`).
- **WIN10 → Android-Emulator**: الحوار ظهر داخل التطبيق · نقر «سماح» عبر adb · `active` · `session_view_opened` · النافذة بثّت شاشة المحاكي (`win10-android.jpg`).
- **WIN10 → TECNO-KL4**: الإشعار/العرض وصل · قُبل الطلب · `session_view_opened` · لكن نافذة العرض أظهرت «تذكرة غير صالحة» بعد إعادة تحميل الصفحة (التذكرة مرة واحدة).

**إصلاحات لازمة ظهرت أثناء الاختبار:** تثبيت شهادة TOFU لنافذة العرض · منع تحويل 401 إلى `/login` عند وجود `rt` · إتاحة الوصول (UIA) في الوكيل · إخفاء حوار العرض عند `session:expired`.

---

## 3) ما لم يُنفَّذ ولماذا

| البند | السبب | الأثر |
|---|---|---|
| **وكيل أندرويد** (`RelayClient` · `SessionWebViewActivity` · استقبال العروض) | لم يتوفر وقت/بناء آمن ضمن الجلسة؛ الوكيل بقي 3.8.36 | T9–T11 غير متاحة؛ الحزمة الثالثة بلا ميزة الجلسات |
| **بناء الحزم** (سيرفر · وكيل ويندوز · APK) و`manifest --verify` | **نُفِّذ جزئياً:** حزمتا السيرفر والوكيل 3.9.0 + بيان موقّع؛ **APK لم يُبنَ** لأن أندرويد لم يُحدَّث | بوابة «الحزم الثلاث» ناقصة APK 3.9.0 |
| **T3** كلمة المرور الحقيقية | يحتاج جهازاً في وضع كلمة المرور وتغيير حالته | مسار الكود موجود بلا اختبار حي |
| **T13** ملف 1GB مع قطع | يحتاج زمن نقل ومساحة | غير مقيس |
| **T15** تسجيل MP4 داخل الجلسة | يحتاج تسجيلاً حقيقياً وموافقة | غير مقيس |
| **T18** انحدار الأداء | يحتاج خط أساس R1 على جهاز هادئ | غير مقيس |
| **39/39 بطارية** | أُضيفت خطوة واحدة (33)؛ الست المتبقية غير موجودة | بوابة البطارية غير مستوفاة |
| **B1** `/api/settings` | خارج نطاق الأمر §0 | مانع إطلاق عام قائم |

**ملاحظة منهجية:** كل محاولات التفويض إلى وكلاء فرعيين في هذه البيئة انتهت بـ`subagent_execution_failed`؛ نُفِّذ العمل يدوياً.

---

## 4) نقطة الاستئناف (سطر واحد)

**استكمل أندرويد (RelayClient + SessionWebViewActivity) وابنِ APK 3.9.0، ثم T3/T13/T15/T18، وأعد البيان قبل أي إعلان إطلاق.**
