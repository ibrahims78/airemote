# CI — AiRemote

> **الملف:** `.github/workflows/ci.yml` · **المرحلة:** R0 · **التاريخ:** 2026-10-28
> **القاعدة الحاكمة:** لا تُضاف خطوة إلى CI قبل إثباتها محلياً. الخطوة غير المُثبتة تكون **غير معطِّلة** ولا تُخفى.

---

## 1. المبدأ

`CI` هنا ليس زينة: كل خطوة فيه تعني «هذا الشيء مكسور الآن في المستودع»، لا «قد يكون مكسوراً في بيئة غريبة».
لذلك كل أوامر المهمة `verify` نُفِّذت فعلياً على ويندوز قبل كتابتها (النتيجة: 2026-10-28).

---

## 2. المهام

| المهمة | التفعيل | إلزامية | ما تُثبته | المدة التقديرية |
|---|---|---|---|---|
| `verify` | كل push وPR ويدوي | **نعم** | الكود يُترجم، الاستيرادات سليمة، اختبارات الوحدة وAPI تمر، اللوحة تُبنى | 6–9 دقائق |
| `desktop-e2e` | بعد `verify` | لا (تجريبية) | اختبارا Electron لجلسة التحكم والالتحاق المتأخر | 8–12 دقيقة |
| `installer` | يدوي فقط (`workflow_dispatch` + `build_installer`) | لا | حزمة تثبيت قابلة للتنزيل | 15–30 دقيقة |

---

## 3. خطوات `verify` بالترتيب

| # | الخطوة | الأمر | ماذا يعني فشلها |
|---|---|---|---|
| 1 | Checkout | `actions/checkout@v4` | — |
| 2 | pnpm | `pnpm/action-setup@v4` بإصدار **9.15.9** | تعارض إصدار مع قفل الحزم |
| 3 | Node | `actions/setup-node@v4` بإصدار **22** + cache pnpm | — |
| 4 | Install | `pnpm install --frozen-lockfile --ignore-scripts` | `pnpm-lock.yaml` لا يطابق `package.json` |
| 5 | Static import check | `node scripts/check-imports.js` | استيراد نسبي مكسور (مسار خاطئ) — يظهر قبل البناء |
| 6 | Build shared | `pnpm --filter @airemote/shared build` | خطأ ترجمة في الحزمة المشتركة |
| 7 | Build ai-engine | `pnpm --filter @airemote/ai-engine build` | خطأ ترجمة في محرك الذكاء |
| 8 | Typecheck server | `pnpm --filter @airemote/server typecheck` | خطأ نوعي في السيرفر |
| 9 | **Build server** | `pnpm --filter @airemote/server build` | فشل توليد `dist` — يكشف أخطاء لا يراها `--noEmit` أحياناً (إصدارات/مسارات) |
| 10 | Typecheck agent | `pnpm --filter @airemote/agent typecheck` | خطأ نوعي في الوكيل |
| 11 | Typecheck dashboard | `pnpm --filter @airemote/dashboard typecheck` | خطأ نوعي في الواجهة |
| 12 | Unit — registry race | `node packages/server/test/registry-race.test.cjs` | خلل في سجل الأجهزة عند الانقطاع المتزامن |
| 13 | E2E — connection | `node packages/server/test/e2e-connection.test.cjs` | تعذّر تسجيل جهاز/اتصال عبر WebSocket |
| 14 | E2E — authz | `node packages/server/test/e2e-authz.test.cjs` | ثغرة صلاحيات أو رفض رموز غير صحيح |
| 15 | Build dashboard | `pnpm --filter @airemote/dashboard build` | فشل بناء الواجهة (Vite) |
| 16 | Upload artifact | `actions/upload-artifact@v4` → `packages/dashboard/dist` | مخرج البناء غير موجود |

---

## 4. المهمة التجريبية `desktop-e2e`

تشغّل:

```
packages/server-desktop/node_modules/electron/dist/electron.exe packages/server-desktop/test/e2e-screen-control.test.cjs
packages/server-desktop/node_modules/electron/dist/electron.exe packages/server-desktop/test/e2e-screen-join.test.cjs
```

مع `ELECTRON_RUN_AS_NODE=1`.

**لماذا غير إلزامية:** تحتاج ثنائي Electron داخل `server-desktop` (لا في جذر المستودع) وبناء `better-sqlite3` متوافقاً مع ABI الخاص بـElectron. لم تُثبت على runner بعد.

**الدليل المحلي:** `pnpm verify` (أي `node scripts/verify.js`) نجح **11/11** في 2026-10-28 — السجل في `outputs/verify-2026-10-28/r0-gate/verify.log`، ويشمل الخطوتين أعلاه.

**قائمة الترقية إلى إلزامية:**

- [ ] نجاحان متتاليان على `windows-latest` بلا إعادة محاولة.
- [ ] زمن المهمة < 15 دقيقة.
- [ ] لا اعتماد على سطح مكتب تفاعلي (تُثبت بإخفاء الواجهة أو تشغيل headless).
- [ ] عندها: إزالة `continue-on-error` و`needs` يبقى كما هو.

---

## 5. المهمة اليدوية `installer`

تحتاج `packages/server-desktop/bin/ffmpeg.exe` و`bin/cloudflared.exe`، وكلاهما **مستثنى من Git** (وسائط ثقيلة).
لذلك تبدأ بخطوة `Preflight`:

- إن وُجدا: تُبنى الحزمة وتُرفع كـartifact.
- إن غابا: تُطبع `::warning::` **وتُتخطّى** خطوات البناء والرفع — لا فشل أحمر بلا سبب.

هذا مقصود: بناء مثبّت بلا ffmpeg ينتج حزمة ناقصة بصمت، وهو أسوأ من عدم البناء.

---

## 6. ما هو غير مغطى عمداً

| غير مغطى | السبب | متى يُغطّى |
|---|---|---|
| `lint` | **لا توجد حزمة تملك سكربت `lint`** في المستودع | يُضاف ESLint في R6 مع مكتبة المكوّنات |
| اختبارات الأداء | تحتاج جهازاً حقيقياً (VM online) | بوابة يدوية في R1 عبر `scripts/perf/measure.cjs` + خط أساس `docs/perf-baseline.json` |
| اختبارات أندرويد | تحتاج جهازاً/محاكياً | لاحقاً في R8 (أو runner بجهاز مخصص) |
| فحص ثغرات التبعيات | يحتاج قرار أداة وقاعدة بيانات | R2 |
| بناء الوكيل (Windows/Android) | بطيء ويحتاج أدوات بناء | عند أول إصدار موحّد (R7) |

---

## 7. تشغيل نفس الخطوات محلياً (PowerShell)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'

pnpm install --frozen-lockfile
node scripts/check-imports.js
pnpm --filter @airemote/shared build
pnpm --filter @airemote/ai-engine build
pnpm --filter @airemote/server typecheck
pnpm --filter @airemote/server build
pnpm --filter @airemote/agent typecheck
pnpm --filter @airemote/dashboard typecheck
node packages/server/test/registry-race.test.cjs
node packages/server/test/e2e-connection.test.cjs
node packages/server/test/e2e-authz.test.cjs
pnpm --filter @airemote/dashboard build
```

وللبطارية الكاملة (تشمل Electron):

```powershell
node scripts/verify.js
```

---

## 8. بوابة الأداء (خارج CI، إلزامية في R1)

```powershell
# قياس
node scripts/perf/measure.cjs --device WIN10 --mode active --seconds 10 --runs 3

# بوابة انحدار مقابل خط الأساس
node scripts/perf/measure.cjs --device WIN10 --mode idle --baseline docs/perf-baseline.json
```

القاعدة: انحدار = تجاوز التفاوت النسبي **و** تجاوز أرضية الضجيج المطلقة. (التفاوتات في `docs/perf-baseline.json`.)

---

*نهاية الوثيقة.*
