# دليل W2-8 — RUNBOOK + استعادة G5 — 2026-11-17

**البند:** W2-8 — من الخطة §3/W2-8.

| # | الفحص | المتوقع | الفعلي | الحالة |
|---|---|---|---|---|
| 1 | `docs/RUNBOOK.md` | تشغيل · صحة · أعطال · نسخ/استعادة · تراجع · منافذ · TLS | نعم — 8 أقسام من المصادر المذكورة في الخطة | PASS |
| 2 | G5 استعادة على **نسخة** لا القاعدة الحيّة | خطوات تنجح وتُسجَّل | **RESTORED** — COUNTS {users:3, devices:6, sessions:3498, audit:5966} · 32,260,096B في `%TEMP%\airemote-restore-test\` · integrity عبر db-adapter (node:sqlite fallback بعد غياب bindings better-sqlite3) | PASS |
| 3 | القاعدة الحيّة لم تُلمس | mtime بقي | mtime = 2026-11-14 11:09:35 PM (لم يتغير) | PASS |
| 4 | لا `docker compose up` على الإنتاج | موثّق كتحذير | RUNBOOK §1 Docker: «لا على قاعدة الإنتاج الحيّة» | PASS |

**مصادر RUNBOOK:** docker-compose.yml · backup-manager.js · restore-backup.cjs · INSTALL-RUNBOOK (Gitea) · r19 §0.3 · فخاخ 75/76/80/82/83/84/88.

**النتيجة: PASS** — RUNBOOK موجود والاستعادة مجرّبة بتاريخها ونتيجتها على نسخة.
