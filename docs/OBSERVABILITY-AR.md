# الرصد والتشغيل — R7 (3.8.28)

هذا المستند هو عقد نقاط الفحص الثلاث في السيرفر، وكيف تُستعمل من خارج التطبيق.

## 1) النقاط الثلاث

| النقطة | الغرض | المصادقة | الشيفرة |
|---|---|---|---|
| `GET /health` | «العملية حيّة» — نسخة، TLS، مدة التشغيل | بلا | 200 دائماً تقريباً |
| `GET /ready` | «جاهز لخدمة جلسة» — قاعدة، مخطط، إيقاف جارٍ | بلا | **200** جاهز · **503** غير جاهز |
| `GET /metrics` | أرقام تشغيل بصيغة Prometheus | `Authorization: Bearer <JWT>` | 200 · 401 |

**قاعدة الفصل:** `health` لا يُستخدم للحمل أو لإعادة التشغيل الآلي؛ `ready` هو ما يسأله
موازن الحمل أو مراقب الحاويات. فشل القاعدة يجعل `ready` = 503 بينما يبقى `health` = 200،
لأن العملية نفسها حيّة.

### مثال `/ready`
```json
{ "ready": true, "version": "3.8.28", "uptime": 512,
  "checks": { "db": "ok", "schema": "ok" } }
```
عند الإيقاف: `{"ready": false, ... "checks": {"db":"ok","schema":"ok","shutdown":"in-progress"}}` بحالة 503.

## 2) السلاسل المنشورة في `/metrics`

| السلسلة | النوع | المعنى |
|---|---|---|
| `airemote_up` | gauge | 1 ما دام يخدم HTTP |
| `airemote_uptime_seconds` | gauge | مدة تشغيل العملية |
| `airemote_info{version,engine,tls}` | gauge | هوية البناء ومحرّك القاعدة |
| `airemote_devices_total` | gauge | الأجهزة المعروفة في القاعدة |
| `airemote_devices_online` | gauge | أجهزة لها مقبس وكيل حي |
| `airemote_ws_clients` | gauge | عملاء اللوحة المتصلون بـWebSocket |
| `airemote_screen_sessions` | gauge | جلسات بث الشاشة النشطة |
| `airemote_screen_viewers` | gauge | مقابس تشاهد بثاً |
| `airemote_relay_sessions{state}` | gauge | جلسات Relay حسب الحالة (6 حالات ثابتة) |
| `airemote_http_requests_total{method,status}` | counter | الردود حسب الطريقة والرمز |
| `airemote_http_request_duration_seconds_sum` / `_count` | counter | مجموع زمن الردود وعددها |
| `airemote_errors_total` | counter | أخطاء المعالج + ردود 5xx |

**الحدّية المقصودة:** التسميات محصورة في `method` + `status` فقط، لا مسار ولا مستخدم،
فلا تنفجر السلسلة مع زيادة المسارات. لا يوجد histogram بعد (يُضاف عند الحاجة إلى p95 دقيق).

## 3) الاستهلاك

```yaml
# prometheus.yml
scrape_configs:
  - job_name: airemote
    scheme: https
    tls_config: { insecure_skip_verify: false }   # الشهادة مثبّتة في CurrentUser Root
    authorization:
      type: Bearer
      credentials_file: C:\secrets\airemote-metrics.jwt
    metrics_path: /metrics
    static_configs:
      - targets: ["127.0.0.1:3001"]
```

- الرمز JWT قصير العمر؛ أنشئه بحساب `admin` وجدّده قبل الانتهاء، أو ضع وكيلاً يعيد التوقيع.
- لا تُفعّل `insecure_skip_verify` إن كانت الشهادة مثبّتة (هي مثبّتة افتراضياً في هذا المثبّت).

## 4) ما لم يُنجَز بعد في R7

| البند | الحالة |
|---|---|
| تحديث تلقائي + rollback | غير مُنفَّذ |
| نسخ احتياطي **مجدول** واستعادة مُختبرة | نقطة يدوية `POST /api/desktop/backup` فقط |
| هجرات `up/down` | غير مُنفَّذة (المخطط بـ`CREATE TABLE IF NOT EXISTS`) |
| سياسة احتفاظ | غير مُنفَّذة |
| تنبيه عند فشل متكرر | يعتمد على Prometheus خارجي (لا تنبيه داخلي) |
| دليل تشغيل Runbook | مكتوب جزئياً في هذا المستند |