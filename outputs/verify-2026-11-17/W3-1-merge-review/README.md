# مراجعة دمج `feat/screen-unify-3.13.0` → `main` — W3-1 — 2026-11-17

**القاعدة:** مراجعة `git diff main...HEAD` كاملة بجدول (ملف:سطر | شدة | مشكلة) قبل الدمج.

## أساس المراجعة

| البند | القيمة |
|---|---|
| main | `874242a` (Hardening قديم) — **0 التزام فريد على main** |
| HEAD | `5df67ca` (وقت المراجعة) |
| main..HEAD | **757 التزاماً** — دمج **fast-forward** (لا فقدان عمل main، لا تعارضات) |
| الفرق الكلي | 926 ملفاً · +84,223 / −111,274 |
| الحزم الحرجة | 151 ملفاً · +31,615 / −4,604 (server-desktop · server · agent-desktop · dashboard · android) |

**تغطية المراجعة (معلنة):** ليست سطراً بسطر لكل الـ757 التزاماً — مراجعة **بنية + عيّنات أمنية في الكود الحيّ + قياسات حيّة**. ما لم يُراجع سطراً بسطر مذكور.

## جدول المراجعة — الملفات/المحاور الحرجة

| الملف/المحور | الشدة | المشكلة / الحكم |
|---|---|---|
| `server.js:3914` CORS `origin:false, credentials:true` | **مقاس حيّاً — سليم** | لا `Access-Control-Allow-Origin` لـ`https://evil.example` ولا لـ`localhost:5000` — same-origin فقط + HSTS + nosniff. مطابق `origin:false` (نفس الأصل). القياس: 2026-11-17 على 3001 (3.16.19 — نفس الكود في 3.17.0، لم يُلمس CORS) |
| `server.js` TLS | سليم | `/health` → `tls:true` · البوتس بلا TLS/JWT = FATAL (e2e-connection PASSED) |
| JWT الحيّ | سليم | `main.js:106` → `crypto.randomBytes(64)` — لا سرّ مكتوب (فحص r20) |
| `sessionWhere` (server.js:4593) | **ملاحظة بيئية** | فلاتر SQL سليمة منطقياً؛ اختبار sessions export يفشل على **node:sqlite** (better-sqlite3@9.6.0 بلا prebuild لـNode 24) — بيئي لا انحدار دمج (A/B موثّق gate-W2) |
| better-sqlite3 / Node 24 | **معروف للمالك قبل التثبيت** | لا prebuild لـtarget=24.20.0 — `ignoredBuiltDependencies` يمنع البناء — انظر gate-W2 |
| فخاخ 78–80 (أندرويد a11y/التقاط/AISHOT) | مغلقة بكود r19 — **لا تُلمس** | لا تغيير MediaProjection/a11y في W1–W2 |
| `packages/server` (TS 3.14.0) | مجمد — ADR | يبقى مرجعاً؛ Docker يبنيه — موثّق ADR-DUAL-SERVER |
| أسرار في الفرق | **صفر حقيقي** | مسح r20: لا sk-/ghp_/AKIA/PRIVATE KEY حقيقية؛ `ghp_secret_789` fixture اختبار؛ jks غير متتبع |
| حذف `server.js` / استبدال TS | مرفوض | لم يحدث — الحيّ باقٍ |
| دمج main في W1 | مرفوع لـW3 | هذا الدمج |
| سجلات بناء متتبعة | عيب W3-2 | 68 srv-build-log + 9 agent-build-log — تُنظّف بعد الدمج (لا تمنع الدمج) |
| CHANGELOG/STATE/ADRs | موثّقة في W1-3/W2-10 | تُنقل ADRs إلى `docs/ADR/` في W3-3 |

## ما لم يُراجَع سطراً بسطر (معلن)

- 757 التزاماً تاريخياً (من 3.13.0 إلى 3.16.19) — مراجعة بنية + عينات لا سرد كامل.
- جودة Java الداخلية للوكيل أندرويد (خارج فحص r20 أيضاً).
- أداء البثّ (خارج النطاق).

## الحكم

**الدمج fast-forward إلى main مقبول** — لا عمل فريد على main يُفقد، لا تعارضات، الحيّ لم يُكسر، الأسرار صفر، CORS مقيس سليم، الاختبارات السبع PASSED (باستثناء sessions export البيئي الموثق). **بشرط** تنظيف سجلات البناء بعد الدمج (W3-2) وتوثيق better-sqlite3 للمالك.
