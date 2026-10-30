# تجربة Electron 44 + node:sqlite + fastify 5 (2026-10-30)

## 1) النتيجة العملية للـspike
| الفحص | النتيجة |
|---|---|
| `electron-44.3.0-win32-x64.zip` (محلي) | يعمل، `--version` = v44.3.0 |
| Node المدمج | **24.20.0** (لا 18) |
| `require('node:sqlite')` | ✅ `DatabaseSync, StatementSync, Session, constants, backup` |
| `run/get/all` + معاملات مسمّاة `@a` | ✅ كلها تعمل |

**الخلاصة:** المانعان السابقان (C++ لـbetter-sqlite3، وfastify 5 على Node 18) **سقطا معاً**.

## 2) تكافؤ المحرّكين على قاعدة حقيقية
نسخة من `%APPDATA%\AiRemote-Server\airemote.db` (+WAL) فُتحت بالمحرّكين ونُفِّذت 16 استعلاماً
(جداول، join، معاملات مسمّاة، تجميع، أنواع، إدراج/قراءة/حذف):

```
queries: 16   identical: 16   different: 0
```

## 3) إقلاع السيرفر الحقيقي على Electron 44 + node:sqlite
```
[db] engine=node:sqlite file=test.db
HEALTH {"status":"ok","version":"3.8.25","tls":true,...}
LOGIN ok
DEVICES 4 -> Android-Emulator,TECNO-KL4,WIN10-VM,WIN11-VM
RECORDINGS 28
STOPPED
```

## 4) ما انكسر عند إضافة fastify 5
- `e2e: security (R2)` → **400 بدل 403** في `J1. viewer cannot delete own device`.
  أي أن fastify 5 يتحقق من المخطط/الجسم **قبل** فحص الصلاحية، فيتحول الرفض الأمني إلى خطأ إدخال.
  هذا عيب حقيقي يجب إصلاحه في المسار (فحص الملكية/الصلاحية قبل التحقق من الجسم) وليس تجاوزه.
- مع fastify 4 على Node 24 ظهر `ERR_HTTP_HEADERS_SENT` (fastify 4 غير مدعوم على Node 24).

## 5) القرار
- أُعيد وقت التشغيل إلى **Electron 28.3.3 + fastify 4.29.1** فوراً: البطارية **21/21**.
- **بقي** ما هو نافع ودائم:
  - `packages/server-desktop/lib/db-adapter.js` مع مفتاح `AIREMOTE_DB=sqlite3|node` وتراجع تلقائي.
  - إزالة تحميل `better-sqlite3` المبكر من `server.js` (صار lazy داخل المحوّل).
  - تحديث حرّاس اختبارات e2e لتقبل المحرّكين بدل التخطي.
- لم تُشحن 3.8.26: السيرفر المثبَّت يبقى **3.8.25** العامل.

## 6) خطوة الإكمال القادمة (واحدة، محددة)
إصلاح ترتيب الصلاحية في مسار حذف الجهاز (فحص `hasDeviceCapability`/الملكية قبل أي schema validation)،
ثم ترقية fastify 5 وحدها على Node 24، ثم البطارية. بعدها يصبح اعتماد Electron 44 + `AIREMOTE_DB=node`
خطوة إصدار عادية لا تجربة.
