# 3.9.8 — إصلاح وسم جلسة التحكم (سبب «النقرة تُرفض») + إثبات كامل

**التاريخ:** 2026-11-01 · **النوع:** PATCH

---

## 1) الخلل

في `handleScreenWs` (server-desktop) كان معرّف الجلسة يُستنتج **من الجهاز فقط**:

```js
let sessionId = deviceScreenSess.get(deviceId)
```

فإن وُجدت جلسة عرض قائمة على الهدف (من هاتف أو نافذة أخرى)، تُوسم كل أحداث المُشاهد
الجديد — حتى لو دخل بتذكرة جلسة أخرى — بمعرّف **تلك** الجلسة. الوكيل يستقبل الحدث
فيجده لجلسة لم يُمنح لها (`granted=false`) فيُسقطه بصمت.

**هذا يفسّر بدقة**: المنح يصل، والبث يعمل، والنقر يُرسل — لكنه يرفض عند البوابة.

## 2) الإصلاح

```js
const authSessionId = (user && user.isSessionTicket && user.sessionId) ? String(user.sessionId) : null
...
case 'screen:mouse_event': sendJson(rec.ws, { type:'server:screen_mouse', payload:{ ...payload, sessionId: authSessionId || sessionId } })
case 'screen:key_event':   sendJson(rec.ws, { type:'server:screen_key',   payload:{ ...payload, sessionId: authSessionId || sessionId } })
```

أي: إن كان المقبس مُصادَقاً بتذكرة جلسة، تُوسم أوامره بجلسة التذكرة نفسها.

## 3) الإثبات الحتمي (بلا هاتف)

سكربت `t-control-proof.cjs`: جلسة كجهاز (TECNO طالباً) → قبول → تذكرة عرض → مقبس WS →
`move` + `click` عند (0.3, 0.3) → مفاتيح A/i/R → قراءة أثر الوكيل.

| القياس | النتيجة |
|---|---|
| `request` | 201 · `active` · `access=control` |
| منح الوكيل | `grantSeen=true` |
| إطارات البث | وصلت (2) |
| سطر الفأرة | `mouse type=click sid=a5b77f14… granted=true x=0.3 y=0.3` |
| أسطر المفاتيح | `key type=press key=A/i/R sid=a5b77f14… granted=true` |
| الحكم | **grantedTrue=true** — المسار كامل من السيرفر إلى الحقن |

**ملاحظة صدق:** موضع المؤشّر في الضيف قُرئ بعد الاختبار فلم يطابق (460,195) المتوقع —
أرجح الأسباب أن المستخدم حرّك الماوس أثناء الجولة. الإرسال والمنح مُثبتان بالأثر، أما
دقة الإسقاط فتغطيها اختبارات الوحدة (18/18) وتحتاج جولة قياس هادئة.

## 4) نقطة الاستئناف
> **أكمل من: جولة قياس هادئة (بلا استخدام اليد للـVM) لمقارنة `GetCursorPos` بالمطلوب، ثم إعادة قياس الإسقاط بنقاط أربع.**
