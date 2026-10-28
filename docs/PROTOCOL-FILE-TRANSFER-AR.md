# بروتوكول نقل الملفات (R5)

**الإصدار:** 1.0 · **التاريخ:** 2026-10-28 · **الحالة:** مُنفَّذ في المصدر ومُختبر (39 فحصاً + بوابة قبول 15 فحصاً)
**المرجع:** `docs/PRODUCTION-PLAN-v2.0-AR.md` §5

> يوصّف هذا الملف النقل كما نُفِّذ في `packages/server-desktop/server.js` و`packages/server-desktop/lib/file-transfer.js` و`packages/agent-desktop/lib/file-transfer-agent.js`. أي انحراف عن نص الخطة مذكور في §10.

---

## 1. المبدأ

النقل يجري **عبر مقبس الوكيل القائم** — لا منفذ وارد على الجهاز ولا خادم ملفات منفصل. العميل (اللوحة أو أي مستدعٍ مصادق) يدفع المقاطع إلى السيرفر، والسيرفر يمرّرها إلى الوكيل بكتابة مُوضَّعة (`positioned write`) على قرص الجهاز.

- **الوحدة:** مقطع 1 MiB (قابل للضبط بين 64 KiB و8 MiB عند إنشاء المحرّك).
- **الكتابة على الجهاز:** إلى `<الاسم>.airemote-part` ثم **نشر ذرّي** بعد تحقق البصمة.
- **الاستكمال:** نقطة محفوظة في قاعدة السيرفر (`next_offset`) + ملف جزئي على الجهاز.

---

## 2. حارس المسارات

### 2.1 على السيرفر (قبل إنشاء أي صف)

`assertSafeWebPath(path, roots)` يرفض:

| الحالة | الرمز |
|---|---|
| مسار فارغ/غير مطلق/أطول من 4096/يحوي محارف تحكم | `invalid_path` |
| أي مقطع `..` | `path_traversal` |
| مسار يبدأ بـ`//` (UNC) | `unc_rejected` |
| اسم محجوز في Windows (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) | `reserved_name` |
| مسار خارج `AIREMOTE_FT_ROOTS` | `outside_root` |

### 2.2 على الوكيل (قبل فتح أي مقبض ملف)

`assertSafeOsPath` يكرّر الفحص أعلاه ثم:

1. يمشي على مكوّنات المسار من جذر القرص ويستدعي `lstat` لكل مكوّن؛
2. أي مكوّن `isSymbolicLink()` → `symlink_rejected` (يشمل junctions على Windows)؛
3. `path.resolve` النهائي يجب أن يقع داخل الجذور المسموحة.

**النتيجة:** لا يُفتح مقبض كتابة أبداً على مسار يمرّ عبر رابط أو يخرج عن الجذر، حتى لو تلاعب العميل بالمسار.

---

## 3. الجدول

```sql
CREATE TABLE file_transfers (
  id, batch_id, user_id, device_id,
  direction,                    -- upload | download
  source_path, dest_path, final_path,
  size, bytes_done, next_offset, chunk_size,
  expected_sha256, actual_sha256,
  state,                        -- queued|running|paused|completed|failed|cancelled|skipped
  conflict,                     -- skip|rename|replace
  error_code, error,
  speed_limit_kbps, attempts,
  created_at, updated_at
)
```

الفهارس: `user_id`, `device_id`, `state`, `batch_id`. الهجرة **غير كاسرة**: `CREATE TABLE IF NOT EXISTS` + فهارس، بلا لمس جداول قائمة.

`next_offset` هو **مصدر الحقيقة** للاستكمال؛ `bytes_done` للعرض.

---

## 4. آلة الحالة

```
create ─► queued ──start──► running ──finish──► completed
              ▲                │  │
              │             pause │  └─ خطأ وكيل ─► failed ──resume──┐
              │                ▼                                     │
              └── resume ── paused ◄── انقطاع الجهاز ────────────────┘
                                 │
                              cancel ─► cancelled

open + conflict=skip + الملف موجود ─► skipped
```

- `running` عند إعادة تشغيل السيرفر ← `paused` مع `error_code='server_restart'` (نقطة الاستكمال محفوظة).
- `running` عند انقطاع الوكيل ← `paused` مع `error_code='network'`.
- `failed` قابلة للاستكمال (`resume`) ما دام الملف الجزئي موجوداً.

---

## 5. الرسائل

كل رسالة `{ type, payload, timestamp? }`، وكل رسالة نقل تحمل `payload.transferId`.

| النوع | الاتجاه | الحمولة | ملاحظات |
|---|---|---|---|
| `server:ft_open` | سيرفر → وكيل | `transferId, direction(write\|read), path, conflict, size, resumeFrom, finalPath, chunkSize` | يحلّ التعارض ويفتح `.airemote-part` |
| `agent:ft_opened` | وكيل → سيرفر | `transferId, ok, offset, size, path, skipped?` | `offset` قد يكون > 0 عند الاستكمال |
| `server:ft_write` | سيرفر → وكيل | `transferId, offset, data(base64), length` | إزاحة صريحة = `written` |
| `agent:ft_ack` | وكيل → سيرفر | `transferId, ok, written, offset` | يثبّت `next_offset` |
| `server:ft_read` | سيرفر → وكيل | `transferId, offset, length` | للتنزيل |
| `agent:ft_data` | وكيل → سيرفر | `transferId, ok, data, offset, size, eof` | — |
| `server:ft_finish` | سيرفر → وكيل | `transferId, expectSha256, size` | يغلق المقبض، يحسب البصمة، ينشر |
| `agent:ft_done` | وكيل → سيرفر | `transferId, ok, sha256, size, path` | البصمة من الجهاز نفسه |
| `server:ft_abort` | سيرفر → وكيل | `transferId, close, discard` | `discard` يحذف الملف الجزئي |
| `agent:ft_closed` | وكيل → سيرفر | `transferId, ok, discarded` | — |
| `server:ft_put_many` | سيرفر → وكيل | `transferId, files[{id,name,path,data,sha256,conflict}]` | دفعة ملفات صغيرة |
| `agent:ft_put_many_done` | وكيل → سيرفر | `transferId, results[{id,ok,skipped,sha256,size,path,code,error}]` | — |
| `agent:ft_error` | وكيل → سيرفر | `transferId, ok:false, code, error` | يُنهي أي عملية معلّقة |

**قاعدة:** كل عملية تنتظر ردّاً واحداً بمهلة (30s افتراضياً، 60s للكتابة، 300s للإنهاء/الدفعة).

---

## 6. واجهة REST

| المسار | الطريقة | الوظيفة |
|---|---|---|
| `/api/devices/:id/file-transfers` | POST | إنشاء نقل (`direction`, `path`, `size`, `sha256`, `conflict`, `speedLimitKbps`) |
| `/api/devices/:id/file-transfers/batch` | POST | دفعة: `destDir` + `files[{name,data,sha256}]` (حد 20,000 ملف) |
| `/api/file-transfers` | GET | قائمة (`deviceId`, `batchId`, `state`, `limit`) |
| `/api/file-transfers/:tid` | GET | تفاصيل + `percent` + `nextOffset` |
| `/api/file-transfers/:tid/start` | POST | فتح على الوكيل (أو استئناف من `queued`) |
| `/api/file-transfers/:tid/data?offset=` | PUT | دفع مقطع (raw، حتى 16 MiB) |
| `/api/file-transfers/:tid/data?offset=&length=` | GET | تنزيل متدفّق من الجهاز |
| `/api/file-transfers/:tid/finish` | POST | إنهاء + تحقق بصمة (`sha256` اختياري) |
| `/api/file-transfers/:tid/pause` | POST | إيقاف مع حفظ النقطة |
| `/api/file-transfers/:tid/resume` | POST | استكمال |
| `/api/file-transfers/:tid/cancel` | POST | إلغاء (يحذف الملف الجزئي) |

كل المسارات تتطلب مصادقة + قدرة `files` على الجهاز، وكل صف مقيّد بمالكه (أو مدير).

### 6.1 التقدّم الحيّ

`ft:progress` يُرسل إلى صاحب النقل عبر WebSocket (وعبر `sendToUser` للمدير) مع:
`id, batchId, deviceId, direction, state, size, bytesDone, percent, finalPath, error, errorCode`.
معدّل الإرسال محدود بـ4/ثانية لكل نقل، ويُرسل دائماً عند الحالات النهائية.

---

## 7. سياسة التعارض (مكتوبة)

| السياسة | السلوك | الحالة الناتجة |
|---|---|---|
| `skip` | إن وُجد الملف النهائي: لا كتابة إطلاقاً | `skipped` |
| `rename` (افتراضي) | اسم بديل `name (1).ext` … حتى 999؛ **الاسم النهائي يُحفظ في `final_path`** فتُستكمل نفس النسخة | `completed` |
| `replace` | الكتابة إلى `.airemote-part` ثم استبدال الملف النهائي بعد التحقق | `completed` |

في `rename` يُختار الاسم **مرة واحدة عند الفتح الأول** ويُعاد استخدامه عند الاستكمال — لا يتغيّر الهدف بين المحاولات.

---

## 8. السلامة والتحقق

1. **البصمة من الجهاز:** الوكيل يحسب SHA-256 على الملف الجزئي بعد إغلاقه.
2. **مقارنة مزدوجة:** `expected_sha256` (من العميل) تُقارن ببصمة الجهاز؛ الاختلاف ← `hash_mismatch` وحذف الملف الجزئي.
3. **نشر ذرّي:** لا يظهر الملف النهائي قبل تطابق البصمة؛ فشل أي خطوة يترك `.airemote-part` فقط.
4. **قرص ممتلئ:** `ENOSPC` يُترجم إلى `disk_full` برسالة عربية واضحة، والحالة `failed` مع إبقاء الملف الجزئي للاستكمال.
5. **التنزيل:** الوكيل يحسب بصمة الملف عند الإنهاء ويُعيدها؛ السيرفر يخزّنها في `actual_sha256`.

---

## 9. القياس (2026-10-28، localhost، سيرفر المصدر، وكيل حقيقي)

| البوابة | النتيجة | الزمن | المعدّل |
|---|---|---|---|
| ملف **10 GiB** (10,240 مقطعاً) | ✅ اكتمل، البصمة مطابقة، 3 عيّنات عشوائية مطابقة | 420.1s | 24.4 MiB/s |
| **10,000 ملف صغير** (دفعة واحدة) | ✅ 10,000/10,000 على القرص | 130.9s | 76.4 ملف/ث |
| قطع عند **50%** من 64 MiB ثم استكمال | ✅ استُكمل من 33,554,432 بايت بالضبط، البصمة نفسها | — | — |
| **قرص ممتلئ** (حقن ENOSPC عند 1 MiB) | ✅ `disk_full`، لا ملف نهائي، استكمال ناجح بعد إزالة العطل | — | — |
| مسار `../..` | ✅ `path_traversal` قبل أي كتابة | — | — |

الأدلة: `outputs/verify-2026-10-28/r5-file-transfer/gate-result.json` + `e2e-file-transfer` (39 فحصاً).

**تحفّظ صريح:** المعدّل 24.4 MiB/s على localhost عبر HTTP+base64+WS؛ لا ضغط ولا نقل صفري، والقياس على شبكة حقيقية لم يُنفَّذ. سقف النقل الحالي محكوم بدورة رسالة واحدة لكل مقطع (10,240 دورة لملف 10GB).

---

## 10. انحرافات عن نص الخطة

| البند | نص الخطة | المنفَّذ | السبب |
|---|---|---|---|
| حد السرعة | «اختياري لكل جلسة» | `speed_limit_kbps` لكل نقل + تنظيم زمني بعد كل مقطع | الجلسة = النقل هنا؛ لا جلسة شاشة مرافقة |
| 10,000 ملف | غير محدد الآلية | مسار `server:ft_put_many` بدفعات 400 ملف | 30,000 دورة رسالة كانت ستجعل البوابة ساعات |
| واجهة الطابور | «طابور بشريط تقدم» | API + `ft:progress` كاملان؛ اللوحة البصرية في R6 | R6 هو «تجربة موحّدة» |
| جدول | «نقل، حجم، تجزئة، حالة، نقطة استكمال» | أُضيفت: `direction`, `batch_id`, `conflict`, `speed_limit_kbps`, `attempts`, `final_path` | لازمة للاستكمال وسياسة التعارض |

---

## 11. حدود معروفة

1. **الاستكمال لا يصلح بعد تغيّر الملف المصدر** (لا تحقق من mtime/حجم المصدر بين المحاولات بعد إعادة تشغيل السيرفر) — يُنصح بالتحقق من البصمة عند الإنهاء (مفعّل).
2. **`rename` عند الاستكمال بعد فشل النشر:** الاسم محفوظ في `final_path`، لكن إن حُذف الملف الجزئي يدوياً فالاستكمال يفشل بـ`resume_lost` (خطأ واضح لا كتابة خاطئة).
3. **لا نقل مجلدات كشجرة واحدة**: الدفعة تغطي الملفات الصغيرة، والمجلدات الكبيرة تحتاج تعداداً من العميل.
4. **`AIREMOTE_FT_ROOTS` غير مضبوط = كل الأقراص مسموحة** (سلوك الوضع المخبري). للإنتاج يجب ضبطه على مجلدات العمل.
5. **حقن العطل** (`AIREMOTE_FT_FAULT_ENOSPC_AFTER`) موجود لأجل بوابة القبول فقط، ويُفعَّل بمتغيّر بيئة صريح.
