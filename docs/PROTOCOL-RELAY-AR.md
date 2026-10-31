# بروتوكول Relay — جلسة وكيل‑بوكيل (R4)

**الإصدار:** 2.2 · **التاريخ:** 2026-11-01 (v2.1 وv2.0 وv1.1 محفوظة أدناه) · **الحالة:** مُنفَّذ ومُختبر — مصفوفة 6/6 · بطارية 40/40 · إثبات حيّ Windows **وAndroid** (`opened` ثم `reopened`)
**المرجع:** `docs/PRODUCTION-PLAN-v2.0-AR.md` §4.2–§4.4 و§5 (R4)

> يوصّف هذا الملف البروتوكول كما نُفِّذ في `packages/server-desktop/server.js`. أي اختلاف عن نص الخطة مذكور في §7.

---

## 1. المبدأ

جهاز يتصل بجهاز عبر السيرفر، بلا منفذ وارد ولا NAT traversal. كل حزمة تمرّ مرتين عبر السيرفر (دخول وخروج)، والسعة محدودة بسقف صريح. السيرفر **Control Plane**: هوية، صلاحية، رمز جلسة، تمرير، تدقيق. لا يفسّر محتوى الحزم ولا يخزّنه.

---

## 2. آلة الحالة

```
                    accept                hello
  request ──► requested ──────► active ─────────► (تمرير الحزم)
                 │  ▲              │   ▲
         deny    │  │              │   │ resumed (عودة داخل المهلة)
                 ▼  │              ▼   │
              denied│          suspended ──► closed (network بعد المهلة)
                     │              │
              timeout│              └──────► closed (close من طرف)
                     ▼
                  expired
```

| الحالة | المعنى | من يُدخلها | مدة البقاء |
|---|---|---|---|
| `requested` | أُرسل `session:offer` وينتظر قرار الطرف الهدف | `POST /api/relay/request` | `RELAY_OFFER_TTL_MS` (60s) ثم `expired` |
| `active` | الطرفان استلما الرمز، والحزم تُمرَّر | `relayDecide(accept)` | حتى إغلاق أو انقطاع |
| `suspended` | انقطع مقبس طرف؛ الجلسة محفوظة بانتظار عودته | سقوط المقبس | `RELAY_RECONNECT_GRACE_MS` (15s) ثم `closed/network` |
| `denied` | رفض صريح مع سبب | `session:deny` أو REST | يُحذف بعد 60s |
| `expired` | لم يأتِ قرار داخل المهلة | مؤقّت السيرفر | يُحذف بعد 60s |
| `closed` | إغلاق بسبب `user` / `network` / `policy` / `timeout` | أي طرف أو السيرفر | يُحذف من الذاكرة بعد 5 دقائق |

**قاعدة:** لا انتقال ضمني. كل انتقال يمرّ عبر `relayDecide` أو `relaySuspendForDevice` أو `relayCloseSession`.

**ملاحظة:** `accepted` ليست حالة مخزّنة؛ القبول يصدر الرمز وينقل الجلسة إلى `active` في نفس الدالة.

---

## 3. الرسائل

كل رسالة JSON: `{ type, payload, timestamp? }`. كل رسالة جلسة تحمل `payload.sessionId`.

| النوع | الاتجاه | الحمولة | ملاحظات |
|---|---|---|---|
| `session:offer` | سيرفر → الوكيل الهدف | `sessionId, access, requester{name,email,userId,deviceId}, target{deviceId,name}, expiresInMs, channels[]` | يُرسل **بعد** فحص الصلاحية فقط |
| `session:accept` | وكيل هدف → سيرفر | `sessionId` | يُصدر الرمز ويردّ `session:decision_result` |
| `session:deny` | وكيل هدف → سيرفر | `sessionId, reason` | يُبلّغ الطالب بـ`session:denied` |
| `session:decision_result` | سيرفر → الوكيل الهدف | `sessionId, state, tokenExpiresAt` | تأكيد القرار |
| `session:token` | سيرفر → الطرفان | `sessionId, access, token, tokenExpiresAt, requesterDeviceId, targetDeviceId, channels[], resumed?` | الرمز نفسه للطرفين؛ `resumed:true` بعد الاستئناف |
| `relay:hello` | وكيل → سيرفر | `sessionId, token` | يربط المقبس؛ مسموح مرة لكل طرف |
| `session:ready` | سيرفر → الوكيل | `sessionId, access, channels[], peerDeviceId, peerOnline` | بعد نجاح hello |
| `relay:data` | وكيل ↔ وكيل (عبر السيرفر) | `sessionId, channel, data` | `channel` ∈ `screen\|control\|files\|chat` |
| `session:suspended` | سيرفر → الطرف الباقي | `sessionId, reason:'network', graceMs` | الطرف الباقي يُبقي الواجهة ولا يغلق |
| `session:resumed` | سيرفر → الطرفان | `sessionId` | بعد عودة الوكيل؛ يتبعه `session:token` جديد |
| `session:throttled` | سيرفر → الطرفان | `sessionId, limitKbps` | مرة واحدة في الثانية عند التجاوز |
| `session:denied` | سيرفر → الطالب | `sessionId, reason` | — |
| `session:expired` | سيرفر → الطرفان | `sessionId, reason` | انتهاء مهلة العرض |
| `session:close` | أي طرف → سيرفر، وسيرفر → الطرفان | `sessionId, reason` | `user` / `network` / `policy` / `timeout` |
| `session:state` | سيرفر → اللوحة | `sessionId, state, access, targetDeviceId, ...` | للمراقبة الحيّة |
| `session:error` | سيرفر → الوكيل | `sessionId, code, state?` | أكواد §6 |

---

## 4. المصادقة والرموز

1. الطالب مصادق بـJWT مستخدم. الجهاز الهدف يجب أن يكون متصلاً.
2. الصلاحية تُفحص **قبل** أي إشعار: `control` → قدرة `control`، `files` → قدرة `files`، `view` → أي قدرة على الجهاز (R3-2).
3. عند القبول يُصدر السيرفر رمزاً عشوائياً 32 بايت (64 hex)، ويخزّن **بصمته** SHA-256 في `session_tokens` مع `expires_at` (90s).
4. كل طرف يستهلك الرمز مرة واحدة عبر `relay:hello`؛ أي جهاز ثالث يُرفض قبل لمس الرمز (`not_party`).
5. بعد الربط، تُمرَّر الحزم بهوية المقبس الفيزيائية (`deviceId` من `agent:register`)، لا بالرمز.
6. **عند الاستئناف** يُصدر رمز جديد للطرفين (القديم قد تكون انتهت صلاحيته أثناء الغياب)، ويجب أن يعيد الطرفان `relay:hello`.

---

## 5. الحدود والسعة

| الحد | القيمة الافتراضية | المتغيّر | السلوك عند التجاوز |
|---|---|---|---|
| جلسات Relay المتزامنة | 20 | `RELAY_MAX_SESSIONS` | `503 relay_capacity` قبل إنشاء أي جلسة |
| مهلة العرض | 60s | `RELAY_OFFER_TTL_MS` | `session:expired` + تدقيق |
| صلاحية الرمز | 90s | `RELAY_TOKEN_TTL_MS` | `session:error token_expired` |
| مهلة السماح بعد الانقطاع | 15s | `RELAY_RECONNECT_GRACE_MS` | `suspended` ثم `closed/network` |
| نطاق الجلسة | 2048 KB/s | `RELAY_SESSION_KBPS` | إسقاط الزائد + `session:throttled` |
| جلسة واحدة لكل جهاز | مفعّل | — | `409 session_conflict` (منع، لا انتظار) |

### 5.1 القياس الفعلي (2026-10-28، localhost، سيرفر المصدر)

| الحِمل | الجلسات | الإطارات | الحجم | p50 | p95 | الفقد | الصبيب |
|---|---|---|---|---|---|---|---|
| خط أساس | 1 | 30 | 2 KB | 0.23 ms | 0.36 ms | 0% | 7.5 MB/s |
| سقف الخطة | 20 | 40 | 2 KB | 2.27 ms | 4.39 ms | 0% | 11.6 MB/s |
| إطار ثقيل | 20 | 12 | 64 KB | 28.54 ms | 36.70 ms | 0% | 39.6 MB/s |

**الحكم:** لا فقد ولا جلسة معلّقة عند 20 جلسة. زمن p95 المطلق يبقى داخل ميزانية الإطار (16ms للـ60fps عند 2KB، و32ms لإطار 64KB وهو زمن نقل لا انتظار طابور). معيار الخطة «تدهور ≤15%» **لا يتحقق نسبياً** لأن الأساس دون الميلي ثانية، ويبقى الحكم العملي: السقف 20 صالح على هذه الاستضافة، والقياس بحزم 64KB أقرب إلى الواقع من 2KB.
**تحفّظ صريح:** القياس على localhost بلا مشابك شبكة؛ القياس على شبكة حقيقية مع فيديو 250KB/s لكل جلسة لم يُنفَّذ بعد.

الجلسات في الذاكرة (`relaySessions`). الحالة الدائمة في `sessions` و`session_tokens` و`audit_log`. إعادة تشغيل السيرفر تُسقط الجلسات النشطة.

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

1. **واجهة المستخدم** لشاشة «اتصال بجهاز» والموافقة على الطرف الهدف — ضمن R6. البروتوكول والمسارات جاهزة.
2. **الحزم أثناء `suspended`**: السيرفر يرفض التمرير (`not_active`)؛ على الوكيل تخزين مؤقت وإعادة إرسال بعد `session:resumed` — غير مُنفَّذ في الوكيلين بعد.
3. **WebRTC/TURN** — مؤجّل بقرار المالك.
4. **حارس النطاق** يطبَّق على حجم كل رسالة في نافذة ثانية؛ لا يفرّق بين القنوات بعد.
5. **استمرارية الجلسات** عبر إعادة تشغيل السيرفر — غير موجودة.
6. **قياس شبكة حقيقية** بفيديو لكل جلسة — لم يُنفَّذ.

---

# v2.0 — تذكرة عرض الجلسة (3.9.0)

**التاريخ:** 2026-10-31 · **الحالة:** السيرفر واللوحة ووكيل ويندوز مُنفَّذ ومُختبر بروتوكولياً؛ أندرويد مؤجَّل.

## 11) الإضافة

`v1.1` كان يوثّق آلة الحالة والرمز الثنائي للطرفين، لكن فتح الشاشة كان يحتاج JWT مستخدم. `v2.0` يضيف **تذكرة عرض** مقيّدة بالجلسة والجهاز والوصول.

### 11.1 REST

| المسار | المصادقة | الرد |
|---|---|---|
| `POST /api/relay/request` | `Authorization: Bearer <JWT>` أو `X-Device-Token` | 201 `{ sessionId, state, access, target:{id,name}, expiresInMs }` |
| `POST /api/relay/:id/view-ticket` | `X-Device-Token` لجهاز الطالب | `{ ticket, viewUrl, expiresAt, access }` |

مع `X-Device-Token` يجب أن يطابق `requesterDeviceId` الجهاز المصادق (`requester_mismatch`)، وأن يكون الهدف مملوكاً للمالك نفسه (`session_policy_denied`).

### 11.2 WS

| الرسالة | الاتجاه | الحمولة |
|---|---|---|
| `session:offer` | سيرفر→هدف | يضيف `accessLabel` · `passwordMode` · `requesterOs` |
| `session:ticket` | سيرفر→طالب | `{ sessionId, viewUrl, ticket, expiresAt, access }` — **بعد accept فقط** |
| `session:close/closed/expired` | سيرفر | يُبطل التذكرة ويُغلق نافذة العرض |

### 11.3 التذكرة

- 32 بايت عشوائي (64 hex) · تُخزَّن SHA-256 فقط · مقارنة ثابتة الزمن.
- العمر 60s (`SESSION_VIEW_TTL_MS`) · مرة واحدة لفتح `/screen` · مقيّدة بـ(session, **target device**, access).
- تُبطل عند إغلاق الجلسة (`expires_at` في الماضي).

### 11.4 المخطط

هجرة **v3** في `lib/migrations.js`: جدول `session_view_tickets(id, session_id, device_id, access, token_hash UNIQUE, expires_at, consumed_at, created_at)` + فهرسان. `down` يحذف الجدول والفهرسين.

### 11.5 `/screen`

- `rt` صالح ⇒ principal مُصطنع (`sessionId`, `sessionAccess`) بلا JWT.
- `view` ⇒ كل رسائل التحكم تُرفض بـ`access_denied` وتُدقَّق `session_view_denied`.
- الاستهلاك عند أول اتصال؛ أي اتصال ثانٍ بالتذكرة نفسها يُرفض (`ticket_reused`).

### 11.6 مسارات الملفات والتسجيلات

`/api/devices/:id/fs/*` و`/api/recordings*` تقبل `rt=` أو `X-AiR-Session:` بدل JWT، بشرط مطابقة الجهاز/الجلسة و`access=files`.

### 11.7 أسماء التدقيق

`session_view_ticket_issued` · `session_view_opened` · `session_view_denied` · `session_view_ticket_failed` · `session_password_failed` · `session_password_locked`.

### 11.8 ما لا يمرّ في `relay:data`

لا وسائط شاشة، لا ملفات كبيرة، لا تحكم بعد الإغلاق. القنوات: `control|files|chat` فقط.

---

# v2.1 — مفتاح إعادة الاتصال (3.9.1)

**التاريخ:** 2026-10-31 · **الحالة:** السيرفر واللوحة مُنفَّذان ومُختبران (مصفوفة 6/6 · بطارية 40/40).

## 12) الإضافة

`v2.0` جعل فتح `/screen` ممكناً بتذكرة واحدة تُستهلك عند أول اتصال. النتيجة المرصودة على TECNO: أي إعادة تحميل أو إعادة اتصال للنافذة تفشل بـ`ticket_reused`، لأن المتصفح يعيد الطلب بنفس `rt`. `v2.1` يفصل **مفتاح الفتح الأول** عن **مفتاح إعادة الاتصال**، ويحفظ شرط T5 حرفياً.

### 12.1 مفتاح إعادة الاتصال

- 32 بايت عشوائي (64 hex) · يُخزَّن SHA-256 فقط · مقارنة ثابتة الزمن.
- مقيّد بـ(session, **target device**, access) · **لا يُستهلك** · صالح لعمر الجلسة (سقف 12h، `SESSION_VIEW_KEY_TTL_MS`).
- **مفتاح نشط واحد لكل جلسة**: إصدار مفتاح جديد يُبطل السابق (`revoked_at`).
- يُبطل عند إغلاق/انتهاء الجلسة، فلا فتح بعد الإغلاق.

### 12.2 الرابط الواحد

`viewUrl = /view/<targetDevice>?rt=<ticket>&access=<access>#rk=<resumeKey>`

> **تغيير v2.2 (H1):** المفتاح في **fragment** لا في الاستعلام. المتصفح لا يرسل الـfragment إلى السيرفر، فلا يظهر في سجلات الوصول ولا في `Referer`، ويبقى صالحاً بعد إعادة التحميل. العميل يقرأه من `location.hash` ويرسله في استعلام WS فقط (`?rk=`)، ويحذف `rt` من العنوان بعد أول فتح مع إبقاء الـfragment.

- `rt` — مرة واحدة (60s)، لا يتغيّر سلوكه.
- `rk` — لإعادة الفتح بعد استهلاك `rt` أو بعد إعادة تحميل النافذة.
- العميل يرسل الاثنين؛ السيرفر يفضّل `rt` ثم يسقط إلى `rk`. بعد نجاح الفتح يحذف العميل `rt` من العنوان (`history.replaceState`) فتصبح إعادة التحميل `rk` فقط، ويبقى `access` كما هو.

### 12.3 سلوك `/screen`

| المدخل | النتيجة | التدقيق |
|---|---|---|
| `rt` صالح | فتح · استهلاك | `session_view_opened` |
| `rt` مستهلك + `rk` صالح | فتح | `session_view_reopened` |
| `rt` مستهلك بلا `rk` | رفض `ticket_reused` (T5) | `session_view_denied` |
| `rk` صالح | فتح · `uses+1` | `session_view_reopened` |
| `rk` لجهاز آخر | رفض `resume_wrong_device` | `session_view_denied` |
| جلسة مغلقة/منتهية | رفض `session_not_active` | `session_view_denied` |
| `rk` منتهٍ/مُبطل | رفض `resume_expired` / `resume_revoked` | `session_view_denied` |

### 12.4 المخطط

هجرة **v4** في `lib/migrations.js`: `session_view_keys(id, session_id, device_id, access, token_hash UNIQUE, expires_at, revoked_at, last_used_at, uses, created_at)` + فهرسان (`idx_svk_session`, `idx_svk_expires`). `down` يحذف الفهرسين والجدول، ولا يمسّ v3.

### 12.5 تصحيح مرافق

`POST /api/relay/:id/view-ticket` كان يُصدر التذكرة بـ`device_id = requesterDeviceId` بينما `/screen` يتحقق من **الجهاز الهدف** — أي أن التذكرة المُصدَّرة من هذا المسار كانت تُرفض دائماً بـ`ticket_wrong_device`. أصبح الإصدار بـ`session.target.deviceId`، وهو نفس مبدأ القرار D2.

### 12.6 أسماء التدقيق الجديدة

`session_view_key_issued` · `session_view_reopened`.

### 12.7 إغلاق الجلسات عند إزالة الطرف (3.9.2)

حذف مستخدم أو جهاز، أو تغيير دور مستخدم، يُغلق كل جلسات ذلك الطرف (`relayCloseForPrincipal`) ويُبطل مفاتيحها، ويُدقَّق `principal_removed` في سبب الإغلاق. كان `relayCloseForDevice` موجوداً بلا مُنادٍ.

### 12.8 ما لا يتغيّر

`rt` يبقى مرة واحدة بعمر 60s؛ إغلاق الجلسة يُبطل التذكرة والمفتاح معاً؛ `access=view` يبقى مانعاً لكل رسائل التحكم.
