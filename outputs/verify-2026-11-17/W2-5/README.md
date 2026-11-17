# دليل W2-5 — إزالة المسارات المطلقة من server.js — 2026-11-17

**البند:** W2-5 — من الخطة §3/W2-5.

## التغيير (الكود الحيّ أولاً)

| الموضع | قبل | بعد |
|---|---|---|
| `server.js:5532` | `'C:\Users\Public\airemote-shot.jpg'` | `require('path').join(process.env.AIREMOTE_TMP \|\| os.tmpdir(), 'airemote-shot.jpg')` |
| `server.js:5695` | `'C:\Users\Public\ai-ctl.ps1'` | `require('path').join(process.env.AIREMOTE_TMP \|\| os.tmpdir(), 'ai-ctl.ps1')` |

- `os` مستوردة أصلاً (سطر 22). `AIREMOTE_TMP` موثّقة في `.env.example` (W2-6).

## التحقق

| # | الفحص | المتوقع | الفعلي | الحالة |
|---|---|---|---|---|
| 1 | `git grep "C:\Users\admin" -- packages/server-desktop/server.js` | 0 | **0** | PASS |
| 2 | أي `C:\Users` في server.js | 0 بعد الإصلاح | **0** (حتى Public) | PASS |
| 3 | `node packages/server/test/e2e-screen-keyframe.test.cjs` | PASSED | PASSED (exit 0) — مسار الالتقاط يمر عبر الكود المعدّل | PASS |
| 4 | `node packages/server/test/registry-race.test.cjs` | PASSED | PASSED | PASS |
| 5 | لقطة على مضيف غير admin | ملف في المسار الجديد | **لم يُنفَّذ حياً** — يحتاج أمر مالك لأجهزة الأسطول (لا أمر). المنطق: tmpdir يعمل لأي مستخدم؛ المسار لم يعد يعتمد على Public/admin | PASS* (كود) / BLOCKED (حي غير admin) |

- **scripts/ وtools/lab:** مؤجَّلة بعد الكود الحيّ وفق الخطة («هذه أدوات معمل وقد تُؤجَّل») — عشرات المسارات إلى `C:\Users\admin` فيها **ليست** ضمن معيار قبول هذا البند (server.js فقط).

**النتيجة: PASS** — معيار الخطة (grep = 0 في server.js) مستوفى + اختباران أخضران.
