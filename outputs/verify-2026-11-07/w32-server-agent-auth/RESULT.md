# w32 — المسار السيرفر→وكيل بكلمة التحكّم — 2026-11-07

## الشرط المسبق
منح المالك `التقاط الشاشة` على TAB16 ⇒ `appops … PROJECT_MEDIA` = **`allow`** (كان `ignore/default`).
الوضع: `ctrlAuthMode=password` · `controlAuth=password` · السيرفر 3.14.3 (يحمل إصلاح تمرير كلمة السر).

## القياس (عارض حقيقي على `/screen`)
| الحالة | الطلب | ردّ الجهاز | الإطارات |
|---|---|---|---|
| كلمة صحيحة `123456` | `screen:request_control` | **`screen:control_granted {requestId}`** | **16** |
| كلمة خاطئة `wrongpw` | نفسه | **`screen:control_denied {reason:"bad_password"}`** | 16 |

رسائل الجلسة المرصودة قبل القرار: `screen:viewer_count` · `screen:state {sessionId}` · `screen:display_state` · `screen:rotate_status` — أي أن الجلسة قائمة والبثّ يتدفّق سابقًا لقرار التحكّم.

## الحكم
**المسارَان موحَّدان فعليًا في وضع كلمة السر:**
- **وكيل→وكيل:** `active` (TAB16 · TECNO).
- **السيرفر→وكيل:** `control_granted` / `control_denied(bad_password)` — بفضل تمرير `password` في `screenHandler.ts` (كان يُسقطه).

## ملاحظة
البثّ يستمر حتى مع رفض التحكّم (`BINARY=16` في الحالتين): العرض مسموح، والتحكّم وحده محكوم بكلمة السر — وهذا هو التصميم المقصود.
