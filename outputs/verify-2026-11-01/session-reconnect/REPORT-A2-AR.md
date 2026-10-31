# تقرير الموجة A2 — تشخيص دورة حياة نافذة الجلسة على أندرويد

**التاريخ:** 2026-10-31 · **الأساس:** 3.9.1 (`e3a8191`) · **Git محلي**

---

## 1) الخلاصة في ثلاثة أسطر

1. **A1 مُثبت حياً على ويندوز** (`session_view_opened` ثم `session_view_reopened` بنمط `resume` في جلسة WIN10→WIN11).
2. **A1 على أندرويد لم يُثبت بعد**، والسبب ليس منطق المفتاح: التذكرة تُصدر فعلاً (`session_view_ticket_issued`) لكنها لا تصل إلى التطبيق لأن مقبس TECNO ميت في الخادم (stale socket) والتطبيق لا يعيد الاتصال بعد الخطأ.
3. أُصلحت ثلاثة عيوب حقيقية في نافذة العرض على أندرويد (لا إعادة تحميل، بث إغلاق بلا معرّف يغلق كل النوافذ، نوافذ مكرّرة).

---

## 2) ما أُثبت

| البند | الدليل |
|---|---|
| نافذة العرض على ويندوز تُعاد تحميلها وتستأنف بـ`rk` | `session_view_opened` 19:23:41 ثم **`session_view_reopened` 19:23:58 · `mode=resume`** (جلسة `056ed7c4`) |
| `rt` يبقى مرة واحدة | مصفوفة `--case=reuse` (7 تحقّقات) |
| البطارية | **40/40** |
| البيان | 5 حزم · signature OK (بعد إعادة توقيع APK vc28) |

---

## 3) الأسباب الجذرية (بالكود)

| # | العيب | الموضع | الأثر |
|---|---|---|---|
| R1 | `session:ticket` يُرسل **للطالب فقط** | `server.js` كتلة `relayDecide` (`session.requester.deviceId`) | جولة WIN10→TECNO كانت خاطئة الاتجاه: TECNO هدف فلا نافذة عليه. الإثبات الصحيح: TECNO طالب |
| R2 | أندرويد: لا مسار إعادة تحميل إطلاقاً | `SessionWebViewActivity.java` (loadUrl وحيد) + `AndroidManifest.xml:84` `configChanges` | التدوير لا يعيد التحميل، فلا يظهر `reopened` أبداً |
| R3 | بث `ACTION_CLOSED` بلا `sessionId` يُغلق **كل** النوافذ | `SessionWebViewActivity.java` (الشرط القديم) | نافذة تُغلق عند إغلاق جلسة أخرى |
| R4 | لا إعادة اتصال عند `onError` في وكيل أندرويد | `AgentService.java` (~520) — لا `reconnect`، ولا `setConnectionLostTimeout` | أي قطع يترك الجهاز «online» في خريطة السيرفر بمقبس ميت |
| R5 | السيرفر يبقي المقبس الميت في `agentSockets` حتى المهلة | `relaySendToDevice` (`readyState !== 1` لا يكشف نصف المفتوح) | `devs.cjs` يعرض online بينما التسليم يفشل — **مرصود فعلياً**: `session_view_ticket_issued` في 20:20:14 بلا وصول، وTECNO صار `offline` في 20:26 |

**الدليل الحاسم لـR5:** عميل WS مؤقت سجّل برمز TECNO، ثم طُلب وقُبل، فأُصدرت التذكرة (`session_view_ticket_issued`) لكن العميل لم يستلم `session:ticket`؛ وبعدها ظهر TECNO `offline`.

---

## 4) ما أُصلح في الكود (جاهز للبناء القادم)

`packages/android-agent/.../SessionWebViewActivity.java`
- إعادة تحميل حقيقية: `onPause` يرفع `needsReload`، و`onResume` ينادي `web.reload()` → يدفع المسار إلى `rk` ويُنتج `session_view_reopened`.
- `onConfigurationChanged` يسجّل ولا يُعيد الإنشاء (T10 بلا شاشة سوداء).
- `FLAG_KEEP_SCREEN_ON` أثناء العرض.
- الإغلاق صار مشروطاً بمطابقة `sessionId` (R3).
- سجلات `AiR-SessionView` (created/paused/resume-reload/config/destroy) بلا أي سرّ.

`packages/android-agent/.../AgentService.java`
- `openSessionView`: `NEW_TASK | CLEAR_TOP | SINGLE_TOP` (لا تكديس نوافذ).

`packages/android-agent/app/build.gradle`
- `versionCode 27 → 28` (versionName يبقى 3.9.1).

APK أُعيد بناؤه وتوقيعه وتثبيته (vc28)، والبيان أُعيد توليده: `b95f5836…`.

---

## 5) ما تبقّى لإثبات أندرويد (3.9.2)

1. **إعادة اتصال أندرويد**: `onError/onClose` → backoff (3→30s) + `setConnectionLostTimeout`.
2. **كشف المقبس الميت على السيرفر**: ping/pong دوري أو `isAlive` قبل التسليم، وإلا فأعد الإرسال بعد إعادة التسجيل.
3. **إعادة الجولة**: TECNO طالب → WIN10 هدف → `opened` → HOME ثم عودة → `reopened`.
4. بعدها T9 (خلفية/قفل شاشة) وT10 (تدوير) وT11 (توثيق القيد).

---

## 6) مخرجات الموجة الواسعة (7 تحقيقات + مراجعة)

| المجال | الخلاصة |
|---|---|
| **T9 خلفية أندرويد** | `startForeground` و`START_STICKY` و3 أقفال موجودة؛ الفجوات: `setScreenOffMode` بلا مُنادٍ (القفل يوقظ الشاشة)، نوع FGS غير معلن لـAndroid 14، ولا إعادة اتصال، ولا `setConnectionLostTimeout` |
| **T10 تدوير** | السبب ليس تلف البكسلات بل **تجويع حدث التحجيم**: الأبعاد تأتي في الإطار الكامل فقط، والعارض يرفض التحجيم على الدلتا؛ يلزم `force_keyframe` على أندرويد + بوابة تحجيم |
| **T11 شاشة ثانية** | **غير مدعوم على أندرويد** (شاشة اصطناعية واحدة، VirtualDisplay واحدة، لا معالج `screen_set_monitor`) → يُوثَّق كقيد في `docs/ANDROID-LIMITATIONS.md` |
| **T15 تسجيل MP4** | تحقيق المساعد فشل (`subagent_execution_failed`)؛ لم يُنفَّذ — يُعاد في الموجة التالية |
| **T18 أداء** | خط الأساس الحقيقي `docs/perf-baseline.json` (idle firstFrame 941ms · active 809ms)؛ الرقم 1677ms ليس خط أساس؛ البوابة تحتاج ضوضاء+تسامح، و`measure.cjs` يقيس أول إطار بعيّنة واحدة |
| **R9.4 D0** | 13 خطوة + بوابة G0؛ B1 مغلق فعلاً في 3.9.1 (لا تبنِ 3.8.42)؛ إنشاء الحسابات عبر API فقط لأن `POST /api/users` يرفض دور `manager` |
| **§12 الجاهزية** | **5 MET · 8 PARTIAL · 2 MISSING** (#4 مناقض بالكود: قائمة أدوار ناقصة + طول كلمة مرور 8 مقابل 12 + عدم إبطال refresh tokens؛ #13 لا يمكن إثباته محلياً) |
| **مراجعة مستقلة** | 0 CRITICAL · **2 HIGH** · 3 MEDIUM · 5 LOW. أخطرها: `rk` bearer لمدة 12h في عنوان URL (يُسجَّل في السجلات/السجل) وقابل للنسخ؛ والحذف/تغيير الدور لا يُغلق الجلسات (`relayCloseForDevice` بلا مُنادٍ) |

---

## 7) نقطة الاستئناف

> **3.9.2: أضف إعادة اتصال أندرويد + كشف المقبس الميت، ثم أعد جولة TECNO كطالب؛ وبعدها عالج H1 (نقل `rk` إلى fragment وتدويره) وH2 (إغلاق جلسات الجهاز المحذوف/الدور المُخفَّض).**
