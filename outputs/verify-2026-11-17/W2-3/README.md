# دليل W2-3 — .editorconfig + Biome + pnpm lint — 2026-11-17

**البند:** W2-3 — من الخطة §3/W2-3.

## ما نُفِّذ

| # | العمل | التفصيل |
|---|---|---|
| 1 | `.editorconfig` | القالب من الخطة (UTF-8 · LF · 2 مسافة · CRLF لـbat/ps1) |
| 2 | Biome **2.6.8** devDependency في الجذر | `pnpm add -D -w @biomejs/biome` |
| 3 | `biome.json` | lint فقط (formatter معطّل) — النطاق `packages/*/src` (**server.js وbundles مستثناة** وفق الخطة: تُدخل في W3) + استثناء `*.css` |
| 4 | سكربت `lint` في 5 حزم TS + الجذر | `"lint": "biome check ."` · الجذر `pnpm -r lint` |
| 5 | خطوة CI بعد typecheck | `pnpm lint` في verify job (جاهزة عند ربط GitHub) |
| 6 | إصلاحات آمنة `--write` | unused imports وuseConst وuseImportType في src (typecheck ما زال نظيفاً) |

## سياسة الشدة (أسبوع التحذير)

المعيار: `pnpm lint` **exit 0** مع تحذيرات (لا يُحوَّل عائقاً في W2).

قواعد ضُبطت **warn** باستثناء مبرر (إصلاحها تغيير كبير خارج النطاق):
- `useExhaustiveDependencies` (64) — إصلاح hooks deps refactor خطر سلوكياً
- a11y (useButtonType كان 124 error قبل الضبط إلى warn — إصلاح 124 زراً تغيير UI واسع)
- `noArrayIndexKey` · `noStaticElementInteractions` · `useIterableCallbackReturn` · `noAssignInExpressions` · `noUnknownAtRules` · `useAriaPropsSupportedByRole`

## التحقق

| # | الفحص | المتوقع | الفعلي | الحالة |
|---|---|---|---|---|
| 1 | `pnpm lint` | exit 0 (تحذيرات مسموحة) | **exit 0** — 402 warning + 183 info، صفر error | PASS |
| 2 | `pnpm typecheck` بعد `--write` | نظيف | نظيف (agent · ai-engine · dashboard · server · shared ضمنها) | PASS |
| 3 | server.js وbundles خارج نطاق lint | نعم | files.includes = src فقط | PASS |
| 4 | CI خطوة lint | موجودة | ci.yml بعد typecheck dashboard | PASS* (GitHub مقفل — لا runner) |

**النتيجة: PASS** — أمر lint حقيقي أخضر؛ التحويل لعائق دمج بعد أسبوع تحذير (W3).
