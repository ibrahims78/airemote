# إشعارات Telegram — تقرير اختبار وتشخيص (2026-11-10)

## الخلاصة
الإشعارات تعمل الآن للأنواع الثلاثة (اتصال · انقطاع · دردشة)، وسبب «الكلمات غير المفهومة»
لم يكن في السيرفر بل في سكربت اختبار حُفظ بترميز خاطئ. وأثناء الفحص ظهر عيب حقيقي:
إشعار الاتصال/الانقطاع كان لا يُرسل إطلاقًا ما لم توجد قاعدة تنبيه.

## البيئة
- البوت: `@sidawi_bot`
- المحادثة: `1029428155` (المعرّف المزوَّد أولًا `718040496615` كان خاطئًا وأعاد Telegram: `chat not found`)
- السيرفر المثبَّت: `AiRemote Server` على المنفذ 3001

## ما كان معطوبًا وكيف اكتُشف
| # | العيب | الدليل | الإصلاح |
|---|---|---|---|
| 1 | `POST /api/settings/telegram/test` غير موجود في `packages/server` | 404 دائم لزر «اختبار» | أُضيف المسار في `packages/server/src/routes/settings.ts` (e1da712) |
| 2 | `chat_id` خاطئ | `400 chat not found` + `getUpdates` = 0 | استُخرج المعرّف الصحيح من `getUpdates` بعد ضغط Start |
| 3 | لا توجد وسيلة لاختبار حدث واحد | — | `POST /api/settings/telegram/notify` في السيرفرين (45999b1) |
| 4 | **إشعار online/offline مشروط بوجود قاعدة تنبيه** | `for (const rule of rules)` يحتوي نداء `telegramEvent` | نداء مباشر عند `agent:register` وعند إغلاق المقبس (dd8c0f4) |
| 5 | نص عربي مشوّه وصل إلى Telegram | السيرفر نظيف: 0 × `U+FFFD` و0 × `Ø/Ù` | السبب سكربت اختبار حُفظ بـANSI؛ أُضيف `GET /api/settings/telegram/preview` لفحص النص قبل الإرسال |

## نتائج الاختبار (قياسات)
| الاختبار | النتيجة |
|---|---|
| `telegram/test` | `200 {"ok":true,"bot":"sidawi_bot"}` |
| `notify kind=online` | `200 {"ok":true,"kind":"online"}` |
| `notify kind=offline` | `200 {"ok":true,"kind":"offline"}` |
| `notify kind=chat` | `200 {"ok":true,"kind":"chat"}` |
| تعطيل `chat` ثم الإرسال | `400 not sent — check enabled / event toggle / token / chat id` |
| إعادة التفعيل ثم الإرسال | `200` |
| دورة وكيل حقيقية (register → chat → close) | `server:registered` ثم رسالة دردشة ثم انقطاع — ثلاثة إشعارات |
| معاينة النصوص | `✅ جهاز متصل: WIN10-VM` · `📴 جهاز غير متصل: WIN10-VM` · `💬 رسالة من WIN10-VM: مرحبًا، هذه رسالة عربية للاختبار` |
| **تأكيد المالك** | **«وصلت سليمة»** — الرسائل العربية ظهرت مقروءة في `@sidawi_bot` بعد إصلاح الترميز |

## ملاحظات تشغيلية
- الإعدادات تُحفظ في السيرفر المثبَّت كمفاتيح عامة داخل جدول `settings`؛ `packages/server` المستقل يخزّنها لكل مستخدم (`user:<id>`) — كل مُرسِل يقرأ من مخزنه.
- الإشعار يُرسل فقط إذا: `telegramEnabled = true` **و** المفتاح الخاص بالحدث ليس `false` **و** التوكن ومعرّف المحادثة موجودان.
- Telegram لا يسمح للبوت ببدء محادثة: يجب أن يضغط المستخدم **Start** أولًا.

## الملفات المعدَّلة
- `packages/server-desktop/server.js` — hooks مباشرة + `notify` + `preview`
- `packages/server/src/routes/settings.ts` — `telegram/test` + `telegram/notify`
- `packages/server/src/services/telegramNotifier.ts` — مُرسِل للسيرفر المستقل
- `packages/server/src/ws/agentHandler.ts` — ربط online/offline/chat

## الالتزامات
`e1da712` · `45999b1` · `dd8c0f4`
