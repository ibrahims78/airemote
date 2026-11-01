# P1.2 + P1.3 — اكتمال سجل التدقيق (2026-11-01)

**العيبان:**
1. **تغيير الدور** لم يكن له حدث مخصّص — فقط `user_updated` عام بلا `from/to`، فلا يمكن إثبات من رُفع إلى أي دور.
2. **الاحتفاظ** كان يحذف صفوف `audit_log` المنتهية بلا أي أثر — أي أن السجل يمحو نفسه بصمت.

**النتيجة:** **مُصلَحان** باختبارين يفشلان قبل الإصلاح وينجحان بعده، داخل اختبارين قائمين (بلا زيادة عدد خطوات البطارية).

---

## 1) الإصلاحان

| # | الملف | التغيير |
|---|---|---|
| 1 | `packages/server-desktop/server.js` (PATCH `/api/users/:id`) | عند تغيّر الدور فقط: `dbLogAudit({ action: 'user_role_changed', details: { targetId, targetEmail, from, to } })` — إضافة إلى إبطال `refresh_tokens` القائم (3.9.2) |
| 2 | `packages/server-desktop/lib/retention.js` | بعد الحذف: `opts.logAudit({ action: 'retention_purge', details: { recordings, auditRows, missingFiles, cutoffs } })` — الصف يُكتب **بعد** الحذف فينجو من نافذته |
| 3 | `packages/server-desktop/server.js` (`createRetention`) | توصيل `logAudit` بـ`dbLogAudit` بهوية `system/retention` |

**قرار تصميمي:** لم أُسجّل الحدث داخل `retention.js` مباشرة (تفادي دورة اعتماد) بل عبر callback يمرّره السيرفر — ما يجعل الوحدة قابلة للاختبار بلا قاعدة حقيقية.

## 2) الاختبارات المضافة

| الاختبار | الحالة | قبل | بعد |
|---|---|---|---|
| `e2e-security` L1–L3 | `PATCH` دور viewer→manager ثم قراءة `audit_log` | **2 CHECK(S) FAILED** (لا صف `user_role_changed`) | **ALL SECURITY CHECKS PASSED** |
| `e2e-retention` G1–G2 | بعد purge: `GET /api/audit?action=retention_purge` | **2 CHECK(S) FAILED** (`total=0`) | **ALL RETENTION CHECKS PASSED** |

**كيف أُثبت «الفشل قبل» بلا ادّعاء:** أُخذت نسخة من الملفين بعد الإصلاح، ثم `git checkout --` لإرجاعهما إلى HEAD، وتشغيل الاختبارين (سُجِّل الفشل)، ثم استعادة النسخة وتشغيلهما (نجاح). السجلان: `before-*.txt` · `after-*.txt`.

## 3) التحقّق

| البوابة | النتيجة |
|---|---|
| `e2e-security` · `e2e-retention` | **PASS** كاملان |
| `node scripts\verify.js` | **41/41** |
| `node --check server.js` · `retention.js` | سليم |

## 4) قيد صريح

السيرفر **المثبَّت** على `:3001` يعمل بالبناء السابق؛ إصلاحات P1 في المصدر فقط. لم يُعَد البناء في هذه الشريحة (القاعدة: لا إعادة بناء إلا لتغيير حقيقي، والاختبارات e2e تُقلع سيرفراً مؤقتاً بنفس الكود). **إعادة البناء مطلوبة قبل P5** (اختبار حيّ شامل) وستُوثَّق هناك.
