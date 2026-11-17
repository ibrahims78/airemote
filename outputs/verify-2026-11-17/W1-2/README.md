# دليل W1-2 — pnpm ≥11.5.3 + dependabot + fastify ADR — 2026-11-17

**البند:** W1-2 (إغلاق الثغرات HIGH + فحص دوري) — من `docs/خطة-إصلاح-AiRemote-3.16.19-2026-11-16-AR.md` §2/W1-2.

## الخطوات والمتوقع والفعلي

| # | العمل | المتوقع | الفعلي | الحالة |
|---|---|---|---|---|
| 1 | خط أساس `pnpm audit --prod` (pnpm 9.15.9) | توثيق الوضع قبل البند | **46 ثغرة (2 low · 21 moderate · 23 high)** — أكثر من «ثغرتين» ذكرهما فحص r20 (pnpm وحدها 7 high، وbrace-expansion@5.0.6 أربع high **في الحزمة الحيّة**) | PASS (توثيق) |
| 2 | رفع pnpm الفعّل والجذر | `pnpm -v` ≥ 11.5.3 | `pnpm -v` = **11.28.12** (آخر 11.x؛ engines تتطلب node ≥22.13 — متوافق مع CI node 22 والمحلي 24) · الجذر `"pnpm": "^11.28.12"` | PASS |
| 3 | توحيد CI مع الجذر (فخّ 89) | نفس الإصدار في الـ3 مواضع | `ci.yml`: 9.15.9 → **11.28.12** ×3 (verify · desktop-e2e · installer) | PASS |
| 4 | `.github/dependabot.yml` | npm + github-actions أسبوعي | أُنشئ — بلا reviewers (GitHub مقفل من المالك؛ تعليق داخل الملف) | PASS |
| 5 | fastify بلا ترقية 4→5 (D4) | ADR + آخر 4.x إن وُجد backport | **لا يوجد backport** (4.29.1 آخر 4.x؛ GHSA-jx2c-rxcm-jvmq مصحَّح في 5.7.2 فقط) → `docs/ADR-FASTIFY-SECURITY.md`. الحيّ `server-desktop` على **fastify ^5.12.7** غير متأثر | PASS |
| 6 | إغلاق high قابلة للإصلاح دون كسر توافق | overrides بأسلوب المستودع القائم | `brace-expansion@5` → **5.0.13** (يغلق 4 high في الحيّ عبر @fastify/static) · `@fastify/busboy@3` → **3.2.6** (يغلق 2 high عبر multipart@8). **نُقلت كل الـoverrides إلى `pnpm-workspace.yaml`** — pnpm 11 لا يقرأ `pnpm.overrides` من package.json (تحذير موثّق أدناه) | PASS |
| 7 | `pnpm install --no-frozen-lockfile` | قفل محدَّث بالـoverrides | 905 حزمة · lockfileVersion 9.0 · القفل يحمل brace-expansion@5.0.13 وbusboy@3.2.6 وpnpm@11.28.12 | PASS |
| 8 | أمر CI حرفياً: `pnpm install --frozen-lockfile --ignore-scripts` | ينجح على pnpm 11 | exit 0 في 13.9s — «Lockfile is up to date» | PASS |
| 9 | `pnpm audit --prod` بعد البند | صفر high غير الموثّق | **23 ثغرة (2 low · 15 moderate · 6 high)** — كل الـ6 high في `packages\server` المجمدة غير المشحونة (fastify ×5 + find-my-way ×1). صفر high في الجذر وفي الحزم المشحونة | PASS (موثّق ADR) |
| 10 | `pnpm typecheck` (أمر المستودع) | نظيف | shared · ai-engine · agent · dashboard · server — كلها Done، exit 0 | PASS |
| 11 | `node packages/server/test/registry-race.test.cjs` | PASSED | ALL TESTS PASSED | PASS |

## الانحرافات التي وُجدت وعولجت (موثّقة)

1. **pnpm 11 لا يقرأ `pnpm.overrides` من package.json** — تحذير صريح: «The "pnpm" field in package.json is no longer read». نُقلت **كل** الـoverrides (القديمة: proxy-addr/fast-uri/form-data/follow-redirects/brace-expansion@2 + الجديدة) إلى `pnpm-workspace.yaml`، وحُذف الحقل الميت من package.json. لو تُركت، لهُمت تثبيتات أمان سابقة.
2. **`.npmrc` confirm-module-purge=false (kebab) لم يمنع** رسالة `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` — أضيف `confirmModulesPurge: false` (camelCase) في `pnpm-workspace.yaml` واستُخدم `CI=true` للحثث الذي طلب حذف node_modules القديم (بُني بـpnpm 9).
3. **postinstall لـserver-desktop فشل**: `electron-builder install-app-deps` استدعى `pnpm.mjs` كأمر Win32 («%1 is not a valid Win32 application») عند محاولة إعادة بناء better-sqlite3. **لا يؤثر على W1** (لا بناء سطح مكتب في هذه الموجة). ثنائي electron يُنزَّل في الخلفية بنفس طريقة خطوة CI «Ensure Electron binary». better-sqlite3 native لم يُبنَ (متجاهَل عمداً في `ignoredBuiltDependencies`) — المحوّل الحيّ `db-adapter.js` يعمل على `node:sqlite` كاحتياط.
4. **تصحيح لفحص r20:** لم تكن «ثغرتان high» — القياس الفعلي 23 high. عولجت كلها عدا عنقود الحزمة المجمدة (6).

## المتبقي (موثّق، خارج نطاق هذا البند)

- **6 high** في `packages/server` المجمدة غير المشحونة — قرار D4 + ADR-FASTIFY-SECURITY (إعادة النظر في دراسة توحيد TS بـW3).
- **15 moderate** معروفة: fastify×4 (مجمدة) · uuid · protobufjs×2 · react-router×3 · fast-copy · glob · minimatch · node-forge×3 — dependabot يتولاها عند ربط GitHub.
- ثنائي electron قيد التنزيل بالخلفية (لأجل W2).

**النتيجة: PASS** — معيار قبول W1-2 مستوفى: high موثّق بـADR مع تعويض، Dependabot جاهز، CI على نفس إصدار pnpm.
