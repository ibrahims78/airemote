# عقد AiRemote 3.9.0 — جلسات وكيل↔وكيل (مرجع التنفيذ)

**المصدر الحاكم:** `v39/order.md` (الأمر الأصلي). هذا الملف يترجمه إلى أسماء ومسارات دقيقة للكود. عند التعارض: الأمر الأصلي يغلب.

## 1) المصادقة

| المسار | المصادقة |
|---|---|
| `POST /api/relay/request` | `Authorization: Bearer <JWT>` **أو** `X-Device-Token: <deviceToken>` |
| `POST /api/relay/:id/view-ticket` | جهاز طرف في الجلسة (`X-Device-Token`) |
| `WS /screen?deviceId=<id>&rt=<ticket>` | تذكرة عرض صالحة (بدل JWT) |
| `/api/devices/:id/fs/*` و`/api/recordings*` | JWT **أو** `rt=<ticket>` / `X-AiR-Session: <ticket>` |

`X-Device-Token` يُطابق `devices.token` (كما في `aiAuth`).

## 2) REST

### POST /api/relay/request
```json
{ "targetDeviceId": "uuid", "access": "view|control|files",
  "requesterDeviceId": "uuid", "password": "optional" }
```
- مع `X-Device-Token`: `requesterDeviceId` **إلزامي** ويجب أن يطابق الجهاز المصادق.
- الصلاحية: الجهاز الطالب والهدف يجب أن يكونا لمالك واحد (principal = مالك الجهاز الطالب).
- الرد 201: `{ ok, sessionId, state:"requested", access, target:{id,name}, expiresInMs }`.
- 409 `session_conflict` · 503 `relay_capacity` / `target_offline` · 403 `session_policy_denied`.

### POST /api/relay/:id/view-ticket
- للطالب فقط، والجلسة `active`.
- الرد: `{ ok, ticket, viewUrl:"/view/<targetDeviceId>?rt=<ticket>&access=<access>", expiresAt }`.
- التذكرة: 32 بايت عشوائي hex · تُخزَّن SHA-256 فقط · 60 ثانية · مرة واحدة لفتح `/screen` · مقيّدة بـ(session, device, access).

### GET /api/relay/:id
كما هو، مع إضافة `viewTicketExpiresAt` إن وُجد.

## 3) WS

| الرسالة | الاتجاه | الحمولة |
|---|---|---|
| `session:offer` | سيرفر→هدف | `{sessionId, access, accessLabel, passwordMode, requesterOs, requester:{name,email,userId,deviceId}, target:{deviceId,name}, expiresInMs, channels}` |
| `session:accept` / `session:deny` | هدف→سيرفر | كما هو |
| `session:ticket` | سيرفر→طالب | `{sessionId, viewUrl, ticket, expiresAt, access}` |
| `session:token` | سيرفر→طرفان | يبقى (توافق R4) |
| `session:ready/suspended/resumed/throttled/closed` | كما هو | — |
| `relay:data` | طرفان | `control|files|chat` فقط (لا وسائط) |

**قاعدة صلبة:** لا `session:ticket` قبل `accepted`. لا إطار `/screen` قبل تذكرة صالحة.

## 4) قاعدة البيانات (هجرة v3)

```sql
CREATE TABLE session_view_tickets (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  access TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_svt_session ON session_view_tickets(session_id);
CREATE INDEX idx_svt_expires ON session_view_tickets(expires_at);
```
`down`: حذف الجدول والفهرسين.

## 5) التدقيق (أسماء ثابتة)

`session_requested` · `session_policy_denied` · `session_conflict` · `session_capacity_rejected` · `session_accepted` · `session_denied` · `session_expired` · `session_closed` · `session_view_ticket_issued` · `session_view_opened` · `session_view_denied` · `session_token_rejected` · `session_ticket_reused`.

## 6) الواجهة (اللوحة)

- المسار `/view/:deviceId?rt=<ticket>&access=<view|control|files>`.
- `SessionTicketGate`: إن وُجد `rt` → اعرض العارض بلا `RequireAuth`؛ وإلا السلوك القديم.
- `ScreenViewer` يقبل `sessionTicket?: string` ويستخدمه في WS: `/screen?deviceId=..&rt=..` بدل الاعتماد على JWT.
- `access==='view'`: إخفاء أدوات التحكم/الملفات/التسجيل، وإظهار شارة «عرض فقط».
- خطأ تذكرة: حالة مصمّمة (منتهية/مستخدمة/غير صالحة) + زر «إغلاق».

## 7) وكيل ويندوز

- تبويب «الاتصال بجهاز»: إدخال رمز 9 أرقام · اختيار access · كلمة مرور عند الحاجة · زر طلب.
- بعد `session:ticket`: افتح `BrowserWindow` على `https://<server>/view/<target>?rt=...&access=...` مع `contextIsolation:true`, `sandbox:true`, `partition:'persist:session-<id>'`.
- `session:offer`: نافذة داخل التطبيق (لا حوار نظام) مع اسم الطالب/الجهاز/الوصول/عدّاد 60s وزرّي رفض/سماح.
- `session:closed` أو انتهاء: أغلق نافذة العرض.

## 8) ألوان ونصوص

صفر ألوان صريحة (`scan-ui-colors.cjs` = 0) · تباعد وأهداف لمس ≥44px · كل نص من i18n (ar/en) · حركة 160ms `cubic-bezier(.2,.8,.2,1)`.
