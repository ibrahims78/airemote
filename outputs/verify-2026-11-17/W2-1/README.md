# دليل W2-1 — README صادق — 2026-11-17

**البند:** W2-1 — من `docs/خطة-إصلاح-AiRemote-3.16.19-2026-11-16-AR.md` §3/W2-1.

## ما كان كاذباً في README القديم (دليل الفحص A2/A10)

| الكذبة | الحقيقة |
|---|---|
| شارة `version-3.7.0` + تذييل v3.7.0 | المصادر على **3.17.0** |
| Docker «coming soon» | `docker/docker-compose.yml` مكتمل (server + dashboard + healthcheck) ويبني فعلاً — لكن **الحزمة المرجعية TS لا الحيّ** |
| رابط `yourusername/airemote.git` | Gitea المحلي `http://localhost:3000/ibrahims78/airemote.git` (خاص) — GitHub غير مرتبط بقرار المالك |
| لا قسم اختبار | المجموعات السبع PASSED — أُضيف قسم اختبارات بأوامر حقيقية |
| لا مقياس نجاح رقمي | مقياس D6: ≤ 15 دقيقة من الاستنساخ إلى `/health` |
| `packages/server` مُقدَّم كالسيرفر | الحيّ = `server-desktop/server.js` — ADR-DUAL-SERVER |

## ما أُضيف

- شارة 3.17.0 + Fastify 5 (الحيّ) + pnpm 11.x
- قسم معماري بمصدر حقيقة واحد (ADR)
- Quick Start: استنساخ Gitea الحقيقي، تطوير، إنتاج ويندوز من releases/، Docker بحدّثه الصادق، اختبارات بأوامر حقيقية
- هيكل مستودع كامل يشمل server-desktop وagent-desktop وandroid-agent
- جدول متغيرات بيئة كامل (يتطابق مع .env.example القادم في W2-6)
- مقياس D6 معلن
- مساهمة من WORKING_AGREEMENT

## ما لم يُدَّعَ

- لم يُدَّعَ قياس الـ15 دقيقة — مكتوب «يُقاس في بوابة W2» (حالة 1 من بوابة W2).
- Docker موصوف بحدّثه الحقيقي (يبني المرجع المجمد).

**النتيجة: PASS** — README يطابق 3.17.0 والمسارات الحقيقية والاختبارات.
