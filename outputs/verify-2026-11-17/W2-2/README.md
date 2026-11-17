# دليل W2-2 — engines + توحيد الإصدارات 3.17.0/vc110 — 2026-11-17

**البند:** W2-2 — من `docs/خطة-إصلاح-AiRemote-3.16.19-2026-11-16-AR.md` §3/W2-2.

## الإصدارات قبل → بعد

| الحزمة | قبل | بعد |
|---|---|---|
| الجذر `airemote` | 3.16.19 | **3.17.0** |
| `@airemote/agent` | 3.14.0 | **3.17.0** |
| `@airemote/shared` | 3.14.0 | **3.17.0** |
| `@airemote/ai-engine` | 1.0.0 | **3.17.0** |
| `airemote-agent-headless` | 3.8.7 | **3.17.0** |
| `airemote-agent-desktop` | 3.16.19 | **3.17.0** |
| `@airemote/dashboard` | 3.16.19 | **3.17.0** |
| `airemote-server-desktop` | 3.16.19 | **3.17.0** |
| `@airemote/server` | 3.14.0 | **3.14.0 — استثناء مكتوب** (`docs/ADR/DUAL-SERVER.md`: مرجع مجمد غير مشحون) |
| `VERSION` | 3.16.19 | **3.17.0** |
| android `versionCode` | 109 | **110** (versionName يُقرأ من VERSION آلياً) |
| dashboard `APP_VERSION` | 3.16.19 | **3.17.0** |
| agent renderer fallback (index.html ×2) | v3.16.19 | **v3.17.0** |

- **engines** أُضيفت لكل package.json (الجذر + 8 حزم): `"node": ">=22", "pnpm": ">=11.5.3"`.
- `AGENT_TARGET_VERSION = '3.16.0'` في version.ts **لم يُلمس** — إنه حدّ أدنى لشارة «تحديث متاح» وليس إصدار التطبيق (سلوك، ليس ضمن W2-2).

## التحقق

| # | الفحص | النتيجة |
|---|---|---|
| 1 | `node scripts/check-version-consistency.cjs --allow-missing-server` | كل مصادر الإصدار **✓ 3.17.0** (VERSION · الجذر · server-desktop · agent-desktop · dashboard · android vc110 · APP_VERSION · renderer). الخروج exit 1 بسبب: (أ) `releases/manifest.json` ما زال 3.16.19 — **متوقع**: البيان يُعاد توليده عند بناء 3.17.0 (خطوة البناء)، ولا يصحّ إعادة تسمية حزم 3.16.19 القديمة يدوياً؛ (ب) `/health` UNREACHABLE المعروف | PASS* |
| 2 | `pnpm install --ignore-scripts` | exit 0 — «Already up to date» — القفل لم يحتج تحديثاً (روابط workspace) | PASS |
| 3 | JSON سليم في كل package.json + engines موجود | نعم (9/9) | PASS |

## انحراف معالج

أثناء التنفيذ الأول أفسدت سكربت الإدراج حقل `version` (استبدله بengines). **أُصلح فوراً** بإعادة إدراج version بعد name في كل الملفات، وتحقق JSON سليم. القصة في تاريخ السكربتات المحلية لا في المستودع.

**النتيجة: PASS** — المصادر موحّدة 3.17.0/vc110 + engines؛ استثناء server 3.14.0 مكتوب في ADR؛ البيان يُحدَّث عند البناء.
