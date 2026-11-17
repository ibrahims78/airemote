# دليل W2-9 — cloudflared.exe خارج Git — 2026-11-17

**البند:** W2-9 — من الخطة §3/W2-9. **الخيار (ب) المفضّل:** خروج من Git + تنزيل وقت التثبيت.

| # | الفحص | المتوقع | الفعلي | الحالة |
|---|---|---|---|---|
| 1 | `git ls-files` لا يحوي `bin/cloudflared.exe` | 0 | **0** (بقي `scripts/download-cloudflared.js` فقط) | PASS |
| 2 | الملف على القرص باقٍ (للبناء المحلي) | True | True — 52.8MB كما في الفحص | PASS |
| 3 | سكربت التنزيل | موجود وي.skip إن وُجد الملف | `scripts/download-cloudflared.js` — «already exists — skip download» | PASS |
| 4 | CI installer يفحص وجوده | نعم (preflight) | ci.yml installer job يفحص ffmpeg.exe وcloudflared.exe | PASS* |
| 5 | `.gitattributes` بلا سطر LFS له | 0 | 0 — أُزيل (فخّ 87: lfs غير مثبّت والمخزَّن blob كامل) | PASS |
| 6 | `.gitignore` يغطيه | نعم | أُضيف | PASS |
| 7 | ffmpeg.exe | غير متتبع أصلاً | git ls-files فارغ له — نفس المعاملة | PASS |

**استنساخ نظيف جديد:** `node scripts/download-cloudflared.js` ينزّل الثنائي من GitHub releases latest (المسار والURL في السكربت). بناء `build:win` يشغّل السكربت أصلاً.

**النتيجة: PASS** — `git ls-files` لا يحوي cloudflared.exe (أو داخل LFS) — معيار الخطة.
