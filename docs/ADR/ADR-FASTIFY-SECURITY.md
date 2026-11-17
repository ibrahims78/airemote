# ADR — التعامل مع ثغرات fastify 4.x العالية (W1-2)

| | |
|---|---|
| **التاريخ** | 2026-11-17 |
| **الحالة** | مقبول — نُفِّذ ضمن W1-2 من `docs/خطة-إصلاح-AiRemote-3.16.19-2026-11-16-AR.md` |
| **قرار المالك** | D4: لا ترقية كبرى 4→5؛ ADR + آخر 4.x إن وُجد backport |
| **الدليل** | `outputs/verify-2026-11-17/W1-2/` (خط أساس audit قبل/بعد) |

## السياق

`pnpm audit --prod` (خط الأساس 2026-11-17 قبل هذا البند، بـpnpm 9.15.9): **46 ثغرة (2 low · 21 moderate · 23 high)**. الثغرات العالية عبر fastify 4 كلها في المسار `packages\server > fastify@4.29.1`:

| الاستشارة | الخلاصة | المتأثر | المصحَّح |
|---|---|---|---|
| GHSA-jx2c-rxcm-jvmq (CVE-2026-25223) | Content-Type بحرف tab ⇒ تجاوز تحقق الجسم | <5.7.2 | **5.7.2 فقط** |
| GHSA-p68q-wchp-6fh7 | تجاوز مصادقة عبر URLs مشوّهة | ≥4.0.0 <5.12.2 | 5.12.2 |
| GHSA-667r-xxjv-c9mm | استبدال جسم الطلب عبر تصادم نتيجة تحقق async | <5.12.2 | 5.12.2 |
| GHSA-hwr6-493r-vm6h | تجاوز تحقق عبر مخططات boolean false متجاهلة | <5.12.2 | 5.12.2 |
| GHSA-9q9j-q6p8-xq58 | تجاوز تحقق رؤوس عبر تطبيع حالة ناقص | <5.12.2 | 5.12.2 |
| GHSA-c96f-x56v-gq3h (find-my-way@8.2.2 عبر fastify@4) | DDoS مع HTTP/2 | ≤9.6.0 | 9.7.0 (خط fastify 5) |

حقائق مقيسة تحكم القرار:

1. **الكود المشحون للإنتاج هو `packages/server-desktop`** (`fastify ^5.12.7` — غير متأثر بأي استشارة أعلاه؛ كل أرضيات التصحيح ≤5.12.5). فخّ 88.
2. **`packages/server` (TS، `fastify ^4.28.0`) غير مشحون في أي حزمة** — `PROJECT_STATE.md` §0.0 (2026-11-08): `app.asar → main.js → server.bundle` = esbuild لـ`packages/server-desktop/server.js`.
3. **لا يوجد backport لـ4.x**: آخر إصدار 4.x هو 4.29.1 نفسه (npm dist-tag `four` = 4.29.1) وGHSA-jx2c-rxcm-jvmq مصحَّح في 5.7.2 فقط.
4. `WORKING_AGREEMENT.md` يمنع رفع `multipart@8`/`rate-limit@8`/`cookie@9` خارج مسار مدروس (توافق fastify 4).

## الخيارات

| # | الخيار | التقييم |
|---|---|---|
| أ | ترقية `packages/server` إلى fastify 5 مع رفع الملحقات الكبرى | مرفوض في W1 — يخالف قرار D4 ويكسر قاعدة WORKING_AGREEMENT، على حزمة مجمدة غير مشحونة أصلاً |
| ب | ترقية داخل 4.x إلى نسخة مصحَّحة | **غير ممكن** — لا توجد نسخة 4.x مصحَّحة (4.29.1 آخر الخط) |
| ج | تجميد الحزمة المرجعية + توثيق + تعويض ما يمكن دون كسر توافق | **المختار** |

## القرار

1. ثغرات fastify 4.x وfind-my-way 8 **تبقى مقبولة موثّقة** في `packages/server` لأنها في حزمة مرجعية غير مشحونة (يُثبّت وضعها في ADR-DUAL-SERVER ضمن W1-3).
2. **تعويض فوري حيث أمكن دون كسر توافق** — overrides في الجذر:
   - `@fastify/busboy@3` → `3.2.6`: يغلق GHSA-xjh9-v7x6-24jw وGHSA-x8mw-p69m-v3mx (high) وGHSA-gxm5-99cw-xjw9 (moderate) عبر `@fastify/multipart@8.3.1`.
   - `brace-expansion@5` → `5.0.13`: يغلق **أربع high + moderate واحدة في الحزمة الحيّة** `server-desktop` (عبر `@fastify/static@10.1.8 > glob > minimatch`) — اكتشاف جديد لم يذكره فحص r20.
   - `pnpm` → `^11.28.12`: يغلق كل استشارات pnpm العالية (أرضياتها حتى 11.11.0) والمتوسطة.
3. **workaround جاهز** إن وُجد يوماً كود fastify 4 مواجهاً للشبكة (من نص الاستشارة): `onRequest` hook يرفض أي Content-Type يحوي tab.
4. **موعد إعادة النظر:** دراسة توحيد TS في W3 (بند 8) — أي ترقية fastify 5 للحزمة المرجعية تحدث هناك بمسار مدروس وe2e عتبة.

## النتائج

- بعد البند: `pnpm audit --prod` بلا high في الجذر وفي الحزم المشحونة (`server-desktop`/`agent-desktop`/`dashboard`). الـhigh المتبقية محصورة في `packages/server` المجمدة (fastify@4.29.1 + find-my-way@8.2.2) وموثّقة هنا — «high موثّق بـADR» وفق معيار قبول W1-2.
- moderates معروفة مؤجلة (dependabot يتولاها عند ربط GitHub): uuid@10 · react-router@6.30.4 · protobufjs@7.6.2 · node-forge@1.4.2 · glob@13/10 · minimatch@10/9 · fastify moderates في الحزمة المجمدة.
- CI على GitHub Actions غير مفعّل بقرار المالك (لا ربط) — `dependabot.yml` و`ci.yml` جاهزان يعملان عند الربط.
