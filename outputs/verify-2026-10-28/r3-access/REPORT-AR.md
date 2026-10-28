# R3 — الشريحة الثانية: الوصول غير المراقب والقدرات الدقيقة

**التاريخ:** 2026-10-28 · **الفرع:** `checkpoint/3.8.1-2026-10-26` · **المرجع:** `docs/PRODUCTION-PLAN-v2.0-AR.md` §5 (R3)
**النتيجة:** ✅ مُنجزة ومُختبرة · البطارية **18/18** (`battery-18.log`)

---

## 1. ما نُفِّذ بالضبط

### أ) الوصول غير المراقب — كلمة مرور لكل جهاز

| العنصر | التفصيل |
|---|---|
| التخزين | جدول `device_unattended` (مفتاحه `device_id`)، البصمة `bcrypt` بتكلفة 10 |
| الحقول | `password_hash, enabled, failed_count, locked_until, last_failed_at, last_success_at, updated_by` |
| التعيين | `POST /api/devices/:id/access` — المالك أو admin فقط، ودور `manager` على الأقل |
| التعطيل | نفس المسار بجسم `{ "enabled": false }` — يُبقي البصمة ويصفّر العدّاد (لا حذف للصف) |
| الحالة | `GET /api/devices/:id/access` — `hasPassword/enabled/lockedUntil/failedCount/lastSuccessAt` بلا أي بصمة |
| الدخول | `POST /api/access/unattended` بجسم `{ deviceId \| code, password }` |
| الرمز الصادر | JWT بدور `unattended`، `deviceId` مقفل، صلاحية `2h` (قابلة للضبط بـ`UNATTENDED_TOKEN_TTL`) |
| سياسة المحاولات | 5 محاولات فاشلة ← قفل مؤقت **5 دقائق** (قابل للضبط: `UNATTENDED_MAX_FAILURES`، `UNATTENDED_LOCK_MS`) |
| أثناء القفل | 429 + ترويسة `Retry-After`، ولا تُقبل كلمة المرور الصحيحة (لا تجاوز) |
| بعد انتهاء القفل | يُصفَّر العدّاد تلقائياً قبل التحقق |
| التدقيق | `unattended_set` · `unattended_cleared` · `unattended_login` · `unattended_login_failed` · `unattended_locked` · `unattended_denied` |
| ما لا يُسجَّل أبداً | كلمة المرور ولا بصمتها — يُسجَّل الطول فقط في `unattended_set` |

**نطاق الرمز (مُختبَر):** يقرأ جهازه فقط، `/api/devices` يُعيد جهازاً واحداً، ولا يستطيع تعيين كلمة مرور، ولا حذف الجهاز، ولا الوصول إلى `/api/users`.
**حدّ مقصود وموثَّق:** الرمز غير المراقب لا يفتح `/api/devices/:id/exec` (تنفيذ أوامر) لأن المسار يشترط دور `manager`؛ الوصول غير المراقب يمنح التحكم الرسومي والملفات والتسجيل فقط. تغييره قرار سياسة لا قرار تنفيذ.

### ب) جدول `device_permissions` واحترامه على السيرفر

| العنصر | التفصيل |
|---|---|
| الجدول | `device_permissions (user_id, device_id, capability, granted_by, created_at)` بمفتاح مركّب |
| القدرات | `control` · `files` · `record` (المصدر الوحيد: `DEVICE_CAPABILITIES`) |
| القراءة | `GET /api/devices/:id/permissions` — المالك أو admin |
| المنح | `PUT /api/devices/:id/permissions/:userId` بجسم `{control,files,record}` — **استبدال** لا تراكم |
| السحب | `DELETE /api/devices/:id/permissions/:userId` |
| الرؤية | `accessibleDeviceRows()` — المالك + الممنوح + جهاز الرمز غير المراقب + admin يرى الكل |
| canAccessDevice | صار: admin ← `unattended` مطابق الجهاز ← المالك ← وجود أي صف منح |
| isDeviceOwnerOrAdmin | جديد: عمليات دورة الحياة (تسمية/حذف/حجب/فصل/إيقاظ) للمالك أو admin فقط |
| الرفض | 403 بجسم `{ code: 'capability_denied', capability }` + صف تدقيق `capability_denied` |

**خريطة التطبيق (15 مساراً + 6 نقاط WebSocket):**

| القدرة | المسارات/الأحداث |
|---|---|
| `control` | `/control` · `/exec` · `/screenshot` · `client:command` · `client:screen_start` · `client:screen_stop` · `client:screen_control` · `pty:connect` · WebSocket المشاهد |
| `files` | `/fs` · `/fs/list` · `/fs/download` · `/fs/upload` · `/fs/mkdir` · `/fs/delete` · `/fs/rename` · `DELETE /fs` |
| `record` | `POST /api/recordings` |
| المالك/admin فقط | `PUT/DELETE /api/devices/:id` · `/block` · `/unblock` · `/disconnect` · `/wol` · `/access` · `/permissions` |

**إصلاح جانبي لازم:** حارس R2 المدمِّر (`preHandler`) كان يمنع أي دور أقل من `manager` على مسارات `fs/*` و`control` — كان سيقفل الرمز غير المراقب بالكامل. أُضيف تجاوز صريح للرمز غير المراقب، والقدرة تُفحص بعده في كل مسار على حدة.

---

## 2. الأدلة (ملفات في هذا المجلد)

| الملف | المحتوى | النتيجة |
|---|---|---|
| `e2e-unattended.log` | 34 فحصاً: التهيئة، التعيين، السياسة، القفل، فتح القفل، نطاق الرمز، التدقيق | **ALL UNATTENDED CHECKS PASSED** |
| `e2e-device-permissions.log` | 31 فحصاً: مصفوفة القدرات، الاستبدال، السحب، العزل، التدقيق | **ALL DEVICE PERMISSION CHECKS PASSED** |
| `battery-18.log` | البطارية الكاملة بعد إضافة الخطوتين | **18/18** |

أوامر إعادة الإنتاج:

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
$env:ELECTRON_RUN_AS_NODE='1'
& 'packages\server-desktop\node_modules\electron\dist\electron.exe' 'packages/server-desktop/test/e2e-unattended.test.cjs'
& 'packages\server-desktop\node_modules\electron\dist\electron.exe' 'packages/server-desktop/test/e2e-device-permissions.test.cjs'
node scripts/verify.js
```

---

## 3. قرارات هندسية اتُّخذت في هذه الشريحة

| القرار | السبب |
|---|---|
| جدول منفصل `device_unattended` بدل أعمدة في `devices` | هجرة غير كاسرة، ولا تُسحب البصمة مع كل استعلام أجهزة |
| bcrypt تكلفة **10** لا 12 | التحقق يقع على مسار دخول متكرر؛ 12 يضيف ~250ms لكل محاولة. تغييره سطر واحد |
| رمز JWT بدور `unattended` بدل جلسة كاملة | لا Refresh ولا TOTP لمن لا يملك حساباً؛ `roleRank` = 0 يحجب كل مسارات الإدارة تلقائياً |
| قفل زمني ثابت (5 دقائق) لا تصاعدي | يفي ببوابة الخطة («5 محاولات ← قفل مؤقت») بلا حالة إضافية؛ التصاعدي بند لاحق عند الحاجة |
| `PUT` للصلاحيات = استبدال المجموعة | يمنع تراكم منح قديمة عند إعادة الضبط، ويجعل المصفوفة قابلة للاختبار حرفياً |
| منع منح المالك (400) | المالك يملك كل القدرات بنيوياً؛ المنح له ضجيج بلا أثر |
| تعطيل الوصول لا يحذف الصف | قاعدة عدم الحذف + أثر تدقيقي دائم (`unattended_cleared`) |

---

## 4. ما لم يُنفَّذ في هذه الشريحة (معلن بصراحة)

1. **الأدوار الموسّعة `operator`** من نص الخطة لم تُضف بعد؛ القدرات الدقيقة تغطي الحاجة العملية، وإضافة دور جديد تمسّ سياسة R2 — تُطرح كبند في R6 أو R3-3.
2. **شاشة إدارة الوصول في اللوحة** (ضبط كلمة المرور ومنح القدرات) — وظيفياً المسارات جاهزة، والشاشة ضمن R6.
3. **`e2e` لمسار WebSocket مع رمز غير مراقب** — مغطى منطقياً عبر `hasDeviceCapability` المشتركة، لكن بلا اختبار WS مستقل.
4. **معدّل المحاولات لكل IP** يعتمد على `@fastify/rate-limit` (10/دقيقة) + قفل الجهاز؛ لا قفل على مستوى الحساب.
