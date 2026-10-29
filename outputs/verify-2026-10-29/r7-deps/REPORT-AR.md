# تقرير R7 — التبعيات (2026-10-29)

## 1) axios — ✅ مكتمل
| البند | قبل | بعد |
|---|---|---|
| `packages/dashboard/package.json` | `axios ^1.7.2` | `^1.21.0` |
| المثبَّت | 1.7.2 | **1.21.0** |

tsc 0 · vite build ✓ · **verify 21/21**.

## 2) fastify 4→5 — ⛔ مؤجّل بدليل قاطع
**ما جُرّب فعلاً:** ترقية `packages/server` و`packages/server-desktop` إلى
`fastify 5.12.7` + `@fastify/{cors 11, cookie 11, multipart 10, rate-limit 11, websocket 11, static 10}` + `fastify-plugin 6`.

**النتيجة:**
- `packages/server`: `tsc --noEmit` = 0، والبطارية **21/21** ✅ (يعمل على Node 24).
- `packages/server-desktop`: **10/21 خطوة فاشلة**، والسبب:
```
TypeError: diagnostics.tracingChannel is not a function
  at fastify/lib/wrap-thenable.js:10
  ... Node.js v18.18.2
```
`server-desktop` يعمل داخل **Electron 28.3.3** الذي يحمل **Node 18.18.2**؛ وfastify 5 يتطلب Node ≥20
(يستخدم `diagnostics.tracingChannel` المتاح من 19.9). أي أن المانع **ليس الكود** بل وقت التشغيل المشحون.

**قرار:** أُعيدت الحزمتان إلى `fastify ^4.28.0` (المثبَّت 4.29.1) وبقيت الشجرة خضراء **21/21**.

## 3) ما يلزم لإتمام fastify 5
1. ترقية `electron` من 28.3.3 إلى ≥40 (المستودع يوفّر `electron-44.3.0.tgz` و`electron-v44.3.0-win32-x64.zip`).
2. إعادة بناء `better-sqlite3` لـABI الجديد (`electron-builder install-app-deps` — وهو ما فشل هنا أصلاً).
3. ترقية الإضافات الست مرة واحدة (لا تُخلط نسختا fastify في مساحة عمل واحدة: خلطهما كسر أنواع
   `request.file` و`jwt` في `packages/server` قبل الإرجاع).
4. ثم البطارية بعد كل خطوة، وبناء المثبَّت.

## 4) ملاحظة
`server-desktop/scripts/postinstall.js` ينادي `electron-builder install-app-deps` ويفشل تحت Node 24
عند كل `pnpm install`. لم يتغيّر `better_sqlite3.node` (2024-04-26) وبقي محمّلاً بنجاح.
