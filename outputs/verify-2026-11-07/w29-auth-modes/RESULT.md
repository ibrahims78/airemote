# w29 — وضعا التحكّم على أندرويد + تشخيص مسار الموافقة — 2026-11-07

البناء: `AiRemote-Agent-3.14.2-vc63-lab.apk` · موقّع `a776659a…` · vc63 · مثبَّت على TAB16.
الضبط برمجي عبر `run-as` (PBKDF2 HmacSHA1 · 60,000 · 256bit — مطابق للكود).
المسار: وكيل→وكيل (`POST /api/relay/request` من TECNO، `access=control`).

## 1) وضع كلمة السر — يعمل
| الجهاز | الطلب | النتيجة |
|---|---|---|
| TAB16 | `123456` | `active` |
| TAB16 | `wrongpw` | `denied · bad_password` |
| TAB16 | بلا كلمة | `denied · password_required` |
| TECNO | `123456` | `active` |
| TECNO | `nope` | `denied · bad_password` |

## 2) إعادة طلب وضع الموافقة (تشخيص)
رصد كل 0.8s لمدة 11s بعد الطلب:

```
state=requested  (14 قياسًا متتاليًا، بلا انقلاب)
```

**الخلاصة:** وضع `consent` **صحيح**: يبقي الطلب `requested` ولا يقبل تلقائيًّا. نتيجة `active` السابقة **لم تتكرّر** — كانت أثر حالة عابرة عند تبديل الوضع، لا سلوكًا.

## 3) لماذا لا يظهر حوار؟
من السجل:
```
20:24:18.878 Focus moving from com.airemote.agent/.SessionOfferActivity
            to   com.airemote.agent/.MainActivity
20:24:19.02x BufferQueue ... SessionOfferActivity#0/#1 disconnect + ~BufferQueueCore
```
- `SessionOfferActivity` **فُتحت فعلًا** ثم أُغلقت خلال ~200ms، وعادت `MainActivity` للمقدّمة.
- إشعار `sessions_v1` **موجود** (`category=call` · `actions=2`) — أي أن مسار الإشعار يعمل.

المرشّحان في الكود (`SessionOfferActivity`):
1. `finish()` عند `offerJson` فارغ/غير صالح (السطر 49/53) أو عند استثناء في `onCreate` (السطر 62).
2. `FLAG_ACTIVITY_CLEAR_TOP | SINGLE_TOP` مع كون `MainActivity` في المقدّمة ⇒ النشاط يُنشأ ثم يُزال فورًا، ويبقى المستخدم بلا سطح قرار إلا الإشعار.

**لم أحسم أيّهما** — يحتاج سجلًّا من داخل `onCreate` (أو إزالة `CLEAR_TOP` وتجربة).

## 4) ما لم يُغطَّ
- `emulator-5554` سقط أثناء الجلسة · `WIN10/WIN11` لم يُضبط وضعها · المسار **السيرفر→وكيل** لم يُختبر.
