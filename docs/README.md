# فهرس وثائق AiRemote

هذا المجلد هو المرجع الموحد للوثائق والخطط والتقارير. نُقلت الوثائق التي كانت مبعثرة في جذر المشروع إلى هنا بتاريخ 2026-10-25، دون حذف أو إعادة تسمية أي ملف.

## أحدث الوثائق (2026-11-17/18)

| الملف | الغرض |
|---|---|
| [../HANDOFF-20261118-1307.md](../HANDOFF-20261118-1307.md) | نقطة استئناف 2026-11-18 — P1/P2 حيّة على 3001 |
| [HANDOFF-20261118-2016.md](HANDOFF-20261118-2016.md) | تسليم جولة D2 |
| [../docs/RUNBOOK.md](RUNBOOK.md) | دليل التشغيل/الصحة/النسخ الاحتياطي |
| [../docs/ADR/DUAL-SERVER.md](ADR/DUAL-SERVER.md) | الحيّ = server-desktop، المرجع المجمد = server TS |
| [../docs/ADR/FASTIFY-SECURITY.md](ADR/FASTIFY-SECURITY.md) | ثغرات الحزمة المجمدة المقبولة |
| [../CHANGELOG.md](../CHANGELOG.md) | سجل الإصدارات + [غير مُصدَر] 2026-11-18 |
| [../PROJECT_STATE.md](../PROJECT_STATE.md) | حالة المشروع الحية |
| [../README.md](../README.md) | دليل البدء (محدّث 2026-11-18) |
## الوثائق الأساسية

| الملف | الغرض |
|---|---|
| [AIREMOTE_DOCS.md](AIREMOTE_DOCS.md) | الوثائق التفصيلية للمنصة والميزات والمعمارية |
| [AIREMOTE-ROADMAP-AR.md](AIREMOTE-ROADMAP-AR.md) | خارطة طريق المنتج بالعربية |
| [ROADMAP.md](ROADMAP.md) | خارطة الطريق التقنية التفصيلية |
| [REMOTE_DESKTOP_ROADMAP.md](REMOTE_DESKTOP_ROADMAP.md) | خطة التحكم بسطح المكتب عن بعد |
| [SCREEN_SHARING_PLAN.md](SCREEN_SHARING_PLAN.md) | خطة مشاركة الشاشة والبث |
| [AIREMOTE_SERVER_DESKTOP_PLAN.md](AIREMOTE_SERVER_DESKTOP_PLAN.md) | خطة تطبيق سطح المكتب للسيرفر |
| [HARDENING.md](HARDENING.md) | جولات التقوية الأمنية |
| [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md) | اتفاقية العمل وقواعد التنفيذ |
| [REPORT-v3.4.0-AR.md](REPORT-v3.4.0-AR.md) | تقرير الإصدار 3.4.0 |
| [SERVER_DESKTOP_BUILD_PLAN.md](SERVER_DESKTOP_BUILD_PLAN.md) | خطة بناء تطبيق السيرفر |
| [WINDOWS_BUILD.md](WINDOWS_BUILD.md) | دليل البناء على Windows |
| [TAILSCALE_SETUP.md](TAILSCALE_SETUP.md) | إعداد Tailscale للوصول الآمن |
| [MIGRATION-2026-10-25.csv](MIGRATION-2026-10-25.csv) | سجل نقل الملفات وبصماتها |
| [INVENTORY-FILES-2026-10-25.csv](INVENTORY-FILES-2026-10-25.csv) | جرد ملفي كامل لكل الملفات خارج `.git` و`node_modules` (916 صفاً) |

## وثائق تطوير الواجهة والتحقق (2026-10-24 → 2026-10-25)

| الملف | الغرض |
|---|---|
| [REDESIGN-2026-10-24-PLAN-AR.md](REDESIGN-2026-10-24-PLAN-AR.md) | خطة إعادة تصميم الصفحة الرئيسية والشريط العلوي والإعدادات والدخول |
| [REDESIGN-2026-10-24-MOCKUP.html](REDESIGN-2026-10-24-MOCKUP.html) | النموذج التفاعلي المرجعي — **المرجع البصري الملزم عند أي تعارض** |
| [UI-IMPLEMENTATION-2026-10-24-AR.md](UI-IMPLEMENTATION-2026-10-24-AR.md) | تقرير تنفيذ الواجهة والملفات المعدلة والتحقق |
| [DEEP-VERIFICATION-2026-10-25-AR.md](DEEP-VERIFICATION-2026-10-25-AR.md) | التحقق المعمق: الدخول، الأزرار، الإصدارات، الوكيل، الأجهزة الوهمية، البث، AI، وحكم الجاهزية |
| [AUDIO-CALL-PLAN-2026-10-24-AR.md](AUDIO-CALL-PLAN-2026-10-24-AR.md) | خطة التحكم بالصوت والمكالمات (مؤجلة — غير منفذة في التطبيق) |
| [AUDIO-CALL-REVIEW-2026-10-24-AR.md](AUDIO-CALL-REVIEW-2026-10-24-AR.md) | مراجعة اتساق خطة الصوت والثغرات التي أُغلقت |

## ملاحظات

- `README.md` في جذر المشروع يبقى نقطة الدخول التعريفية.
- الوثائق التاريخية لا تُحذف؛ تُحدَّث أو يُشار إلى بديلها.
- أي وثيقة جديدة تُضاف هنا ثم تُفهرس في هذا الملف.
- نُسخت وثائق الواجهة والتحقق من حزمة التسليم القديمة إلى هذا المجلد في 2026-10-25؛ الأصل محفوظ في مكانه، وهذه النسخ هي المرجع داخل المشروع.
