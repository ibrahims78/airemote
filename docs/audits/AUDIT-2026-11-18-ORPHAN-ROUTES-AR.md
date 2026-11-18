# تدقيق 2026-11-18 — المسارات الحيّة بلا مستهلك واجهة (جولة التشخيص D2)

**السياق:** جولة التشخيص D2 (2026-11-18) صنّفت مسارات عائدة للسيرفر الحيّ `packages/server-desktop/server.js` (158 مسار REST + 5 WS) بأنها «بلا مستهلك» لأن **اللوحة** (`packages/dashboard/src`) لا تستدعيها. هذا التدقيق يعيد الفحص على مستوى المستودع كله (أدوات المعمل · اختبارات e2e · سكربتات · CI) ويحدد التصريف.

## النتيجة المصححة

### 1) مسارات تستهلكها الأدوات والاختبارات — **تُبقى** (سطح API تشغيلي)
| العائلة | المستهلكون الفعليون (قياس grep) | التصريف |
|---|---|---|
| `/api/desktop/*` (14 مسارًا) | `tools/lab/live-metrics.cjs` · `tools/lab/live-3837.cjs` · `tools/lab/update-status.cjs` · `test/e2e-backup.test.cjs` · `test/e2e-retention.test.cjs` | **إبقاء** — واجهة تشغيل/معمل مؤتمتة. وصلها باللوحة قرار ميزة للمالك. |
| `/api/sftp/*` (7) | `tools/lab/accept/authz.cjs` · `test/e2e-p0-authz.test.cjs` · `scripts/test-db-upgrade.cjs` | **إبقاء** — مقبولة authz حية تعتمد عليها. |
| `/api/contacts/*` (3) | `test/e2e-contacts.test.cjs` | **إبقاء**. |
| `/api/credentials/*` (2) | `test/e2e-p0-authz.test.cjs` · `scripts/test-db-upgrade.cjs` · `tools/lab/accept/authz.cjs` | **إبقاء**. |

> حذف أي من هذه يكسر أدوات القبول والاختبارات — **ليست كودًا ميتًا**.

### 2) اليتيم الحقيقي — مسار WS `/ssh`
- `handleSshWs` (server.js) + `app.get('/ssh', { websocket: true })` — **صفر مستهلكين** في: اللوحة، renderer الإلكترون، الأدوات، الاختبارات، الوكلاء (الذكر الوحيد: قائمة تجاوز cache في `static/sw.js`).
- الوظيفة: عميل SSH صادر (host/user/password من رسالة العميل) — **سطح هجوم صادر إضافي** بلا قيمة مستخدمة؛ الطرفية تغطى كاملًا عبر `/pty`.
- **التصريف المقترح:** إزالة في جولة قادمة بقرار المالك (ليست ضمن نطاق D2 — ممنوع حذف سلوك بلا أمر صريح). حتى الحذف: تبقى محمية (JWT/ticket عبر `resolveWsUser`).

## قياس التشخيص الأصلي (للاستيفاء)
- اللوحة تستدعي 63 مسارًا — كلها موجودة في السيرفر (صفر 404 واجهة).
- `/api/system` الوحيد الذي بدأ يتيمًا تبين أنه **تعليق** في renderer (سطر شرح تاريخي) — إنذار كاذب.

**منهجية:** grep مستودعي كامل (`tools/` `scripts/` `.github/` `packages/*/test` `packages/*/renderer` `packages/*/lib` `docs/audits`) — 2026-11-18، جولة D2.
