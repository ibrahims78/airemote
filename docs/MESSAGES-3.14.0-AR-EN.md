# كتالوج الرسائل — 3.14.0 (AR / EN)

> المرجع التنفيذي: `node scripts/check-messages.cjs` — يطبع الجدول أدناه ويخرج بـ 0 فقط عندما تكون الحالات الإحدى عشرة مكتملة على الأسطح الثلاثة.

## الحالات الإحدى عشرة

| الحالة | اللوحة (`i18n.ts`) | وكيل ويندوز (`LANG`) | أندرويد (`strings.xml`) |
|---|---|---|---|
| `requested` | `relay_requested` — بانتظار الموافقة / Waiting for approval | `sessPending` — بانتظار موافقة الطرف الآخر ({n}ث)… / Waiting for the other side ({n}s)… | `sess_state_requested` |
| `accepted` | `relay_accepted` — تم القبول / Accepted | `sessAccepted` — قُبل — الجلسة نشطة… / Accepted — the session is active… | `sess_state_accepted` |
| `active` | `relay_active` — نشطة / Active | `sessAllowed` — تم السماح — ستُفتح نافذة العرض / Allowed — the view window will open | `sess_state_active` |
| `denied` | `relay_denied` — مرفوضة / Denied | `sessDenied` — رفض الطرف الآخر الطلب / The other side refused the request | `sess_state_denied` |
| `expired` | `relay_expired` — منتهية المهلة / Timed out | `sessTimeout` — انتهت مهلة الطلب دون ردّ / The request timed out with no answer | `sess_state_expired` |
| `closed` | `relay_closed` — مغلقة / Closed | `sessClosed` — انتهت الجلسة أو أُغلقت / The session ended or was closed | `sess_state_closed` |
| `suspended` | `relay_suspended` — معلّقة / Suspended | `sessNoSessions` — لا جلسات نشطة / No active sessions | `sess_state_suspended` |
| `password_required` | `relay_password_required` — كلمة المرور مطلوبة / Password required | `sessPwRequired` — الجهاز الهدف يتطلب كلمة سر… / The target device requires a password… | `sess_state_password_required` |
| `bad_password` | `relay_bad_password` — كلمة المرور غير صحيحة / Wrong password | `sessPwWrong` — كلمة السر غير صحيحة… / Wrong password… | `sess_state_bad_password` |
| `password_locked` | `relay_password_locked` — مقفل مؤقتًا بعد محاولات فاشلة / Temporarily locked after failed attempts | `sessPwLocked` — الجهاز مقفل مؤقتًا… / The device is temporarily locked… | `sess_state_password_locked` |
| `target_offline` | `relay_target_offline` — الجهاز الهدف غير متصل / Target device offline | `sessNetwork` — فشل الشبكة… / Network failure… | `sess_state_target_offline` |

## نتيجة الفحص (2026-11-06)

```
states complete : 11/11
dashboard keys  : ar=452 en=452 | ar-only=0 en-only=0
agent keys      : ar=91  en=91  | ar-only=0 en-only=0
android keys    : ar=122 en=122 | ar-only=0 en-only=0
```

**صفر مفتاح بمقابل واحد** على الأسطح الثلاثة: لا نصّ عربي بلا إنجليزي ولا العكس.

## أسطح أخرى مُقاسة

| السطح | القياس | الأمر |
|---|---|---|
| معالج أندرويد (7 صفوف صلاحيات) | `EN` إنجليزي بالكامل · `AR` عربي بالكامل | `docs/` + لقطات `outputs/verify-2026-11-06/phase1-setup-en.png` و`phase1-setup-ar.png` |
| بطاقة «الاتصال بجهاز آخر» | 4 حالات × لغتين: `قبل/رفض/مهلة/شبكة` | `outputs/verify-2026-11-06/phase3-d64-ui/state-*.png` |
| مركز المساعدة | الرأس والبحث والقائمة مزدوجة اللغة؛ **متن الدليل عربي فقط** (19,441 حرفًا) ويُعلَن ذلك صراحةً للإنجليزي | `node scripts/check-messages.cjs` لا يغطّيه — مسجَّل كفجوة معروفة |
