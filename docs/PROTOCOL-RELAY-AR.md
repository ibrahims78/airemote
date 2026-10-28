# بروتوكول Relay — جلسة وكيل‑بوكيل (R4)

**الإصدار:** 1.0 · **التاريخ:** 2026-10-28 · **الحالة:** مُنفَّذ على السيرفر ومُختبر (`e2e-agent-session` 33/33)
**المرجع:** `docs/PRODUCTION-PLAN-v2.0-AR.md` §4.2–§4.4 و§5 (R4)

> هذا الملف يوصّف البروتوكول كما نُفِّذ فعلاً في `packages/server-desktop/server.js`، لا كما كان مرسوماً. أي اختلاف بينه وبين الخطة مذكور صراحةً في §7.

---

## 1. المبدأ

جهاز يتصل بجهاز عبر السيرفر، بلا منفذ وارد ولا NAT traversal. كل حزمة تمرّ مرتين عبر السيرفر (دخول وخروج)، والسعة محدودة بسقف صريح. السيرفر هو **Control Plane** فقط: هوية، صلاحية، رمز جلسة، تمرير، تدقيق. لا يفسّر محتوى الحزم ولا يخزّنه.

---

## 2. آلة الحالة

```
                 ┌──────────┐  accept   ┌──────────┐  hello   ┌────────┐
  request ──────►│ requested├──────────►│ accepted ├─────────►│ active │
                 └────┬─────┘           └────┬─────┘          └───┬────┘
                      │ deny                 │ close              │ close / drop
                      ▼                      ▼                    ▼
                 ┌─────────┐           ┌──────────────────────────────┐
                 │ denied  │           │            closed            │
                 └─────────┘           └──────────────────────────────┘
                      │ timeout
                      ▼
                 ┌─────────┐
                 │ expired │
                 └─────────┘
```

| الحالة | المعنى | من يُدخلها | مدة البقاء |
|---|---|---|---|
| `requested` | أُرسل `session:offer` وينتظر قرار الطرف الهدف | `POST /api/relay/request` | `RELAY_OFFER_TTL_MS` (60s) ثم `expired` |
| `accepted` | مرحلة انتقالية داخل نفس الطلب؛ تصدر معها `session:token` فوراً | `relayDecide(accept)` | لحظية |
| `active` | الطرفان استلما الرمز، والحزم تُمرَّر | `relayDecide(accept)` | حتى إغلاق أو انقطاع |
| `denied` | رفض صريح مع سبب | `session:deny` أو REST | يُحذف السجل بعد 60s |
| `expired` | لم يأتِ قرار داخل المهلة | مؤقّت السيرفر | يُحذف بعد 60s |
| `closed` | إغلاق بسبب `user` / `network` / `policy` / `timeout` | أي طرف أو السيرفر | يُحذف من الذاكرة بعد 5 دقائق |

**قاعدة:** لا انتقال ضمني. كل انتقال يمرّ عبر `relayDecide` أو `relayCloseSession` فقط، وهما يكتبان التدقيق ويبلّغان الطرفين.

---

## 3. الرسائل

كل رسالة JSON: `{ type, payload, timestamp? }`. كل رسالة جلسة تحمل `payload.sessionId`.

| النوع | الاتجاه | الحمولة | ملاحظات |
|---|---|---|---|
| `session:offer` | سيرفر → الوكيل الهدف | `sessionId, access, requester{name,email,userId,deviceId}, target{deviceId,name}, expiresInMs, channels[]` | يُرسل **بعد** فحص الصلاحية فقط |
| `session:accept` | وكيل هدف → سيرفر | `sessionId` | يُصدر الرموز ويردّ `session:decision_result` |
| `session:deny` | وكيل هدف → سيرفر | `sessionId, reason` | يُبلّغ الطالب بـ`session:denied` |
| `session:decision_result` | سيرفر → الوكيل الهدف | `sessionId, state, tokenExpiresAt` | تأكيد القرار |
| `session:token` | سيرفر → الطرفان | `sessionId, access, token, tokenExpiresAt, requesterDeviceId, targetDeviceId, channels[]` | الرمز نفسه للطرفين |
| `relay:hello` | وكيل → سيرفر | `sessionId, token` | يربط المقبس بالجلسة؛ إعادة الربط من نفس الطرف مسموحة |
| `session:ready` | سيرفر → الوكيل | `sessionId, access, channels[], peerDeviceId, peerOnline` | بعد نجاح hello |
| `relay:data` | وكيل ↔ وكيل (عبر السيرفر) | `sessionId, channel, data` | `channel` ∈ `screen\|control\|files\|chat` |
| `session:throttled` | سيرفر → الطرفان | `sessionId, limitKbps` | مرة واحدة في الثانية عند التجاوز |
| `session:denied` | سيرفر → الطالب | `sessionId, reason` | — |
| `session:expired` | سيرفر → الطرفان | `sessionId, reason` | انتهاء مهلة العرض |
| `session:close` | أي طرف → سيرفر، وسيرفر → الطرفان | `sessionId, reason` | `user` / `network` / `policy` / `timeout` |
| `session:state` | سيرفر → اللوحة | `sessionId, state, access, targetDeviceId, ...` | للمراقبة الحيّة |
| `session:error` | سيرفر → الوكيل | `sessionId, code, state?` | أكواد §6 |

---

## 4. المصادقة والرموز

1. الطالب مصادق بـJWT مستخدم. الجهاز الهدف يجب أن يكون متصلاً (`agentSockets`).
2. الصلاحية تُفحص **قبل** أي إشعار: `control` → قدرة `control`، `files` → قدرة `files`، `view` → أي قدرة على الجهاز (R3-2).
3. عند `accept` يُصدر السيرفر رمزاً عشوائياً 32 بايت (64 hex)، ويخزّن **بصمته** SHA-256 في `session_tokens` مع `expires_at` (90s).
4. الرمز يُسلَّم للطرفين في `session:token`. كل طرف يستهلكه مرة واحدة عبر `relay:hello`؛ أي جهاز ثالث يُرفض قبل لمس الرمز (`not_party`)، والرمز نفسه لا يصلح لجلسة أخرى (مفتاحه بصمة الرمز).
5. بعد الربط، تُمرَّر الحزم بالهوية الفيزيائية للمقبس (`deviceId` من `agent:register`)، لا بالرمز — أي أن إعادة استخدام الرمز بعد استهلاكه لا تمنح شيئاً.

**لماذا «أحادي الاستخدام» هنا يعني استهلاكاً لكل طرف:** الخطة تطلب رمزاً واحداً مربوطاً بالطرفين. جعلناه يُستهلك مرة لكل طرف من أطراف الجلسة فقط، ويُرفض من أي طرف ثالث؛ وهذا يفي بالغرض الأمني (لا إعادة استخدام خارج الجلسة) بلا حاجة إلى رمزين.

---

## 5. الحدود والسعة

| الحد | القيمة الافتراضية | المتغيّر | السلوك عند التجاوز |
|---|---|---|---|
| جلسات Relay المتزامنة | 20 | `RELAY_MAX_SESSIONS` | `503 relay_capacity` قبل إنشاء أي جلسة |
| مهلة العرض | 60s | `RELAY_OFFER_TTL_MS` | `session:expired` + تدقيق |
| صلاحية الرمز | 90s | `RELAY_TOKEN_TTL_MS` | `session:error token_expired` |
| نطاق الجلسة | 2048 KB/s | `RELAY_SESSION_KBPS` | إسقاط الحزم الزائدة + `session:throttled` |
| جلسة واحدة لكل جهاز | مفعّل | — | `409 session_conflict` (سياسة: منع، لا انتظار ولا استبدال) |

الجلسات في الذاكرة (`relaySessions`). الحالة الدائمة في `sessions` (تبدأ عند `accept` وتُغلق مع المدة) و`session_tokens` (سجل الرمز واستهلاكه) و`audit_log`. إعادة تشغيل السيرفر تُسقط الجلسات النشطة — وهذا مقبول في هذه المرحلة ومذكور في التقرير.

---

## 6. أكواد الأخطاء

| الكود | HTTP/السياق | المعنى |
|---|---|---|
| `unknown_device` | 404 | لا جهاز بالمعرّف أو الرمز القصير |
| `session_policy_denied` | 403 | لا قدرة كافية على الجهاز الهدف |
| `target_offline` | 503 | الوكيل الهدف غير متصل |
| `session_conflict` | 409 | جلسة قائمة/معلّقة على الجهاز نفسه |
| `relay_capacity` | 503 | بلغ السقف |
| `bad_access` | 400 | نوع وصول غير مدعوم |
| `unknown_session` | 404 | جلسة غير موجودة أو انتهت من الذاكرة |
| `not_target` | WS | قرار من جهاز ليس هدف الجلسة |
| `not_pending` | WS | قرار على جلسة ليست `requested` |
| `not_active` / `not_party` / `hello_required` | WS | تمرير قبل `accept`، أو من غير طرف، أو قبل `hello` |
| `bad_token` / `token_expired` | WS | رمز غير مطابق أو منتهٍ |
| `bad_channel` | WS | قناة خارج `screen\|control\|files\|chat` |
| `peer_offline` | WS | الطرف الآخر غير متصل (تُسقط الحزمة وتُحسب) |

---

## 7. ما ليس في هذه النسخة (بصراحة)

1. **واجهة المستخدم** لشاشة «اتصال بجهاز» في وكيل Windows/Android وشاشة الموافقة على الطرف الهدف — البروتوكول جاهز، والواجهة ضمن R6.
2. **إعادة الاتصال خلال 15 ثانية** بعد انقطاع عابر: السيرفر يغلق الجلسة عند انقطاع المقبس (`network`) ويبلّغ الطرف الآخر. إعادة الربط التلقائي بلا إغلاق تحتاج حالة انتقالية `suspended` — بند لاحق.
3. **WebRTC/TURN** — مؤجّل بقرار مالك حتى يثبت Relay عجزه.
4. **حارس النطاق** يطبَّق على حجم كل رسالة `relay:data` في نافذة ثانية؛ لا يفرّق بين القنوات (شاشة/ملفات) بعد.
5. **استمرارية الجلسات عبر إعادة تشغيل السيرفر** — لا توجد.
