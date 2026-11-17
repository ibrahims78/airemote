# دليل W2-4 — أمر test موحّد + تغطية — 2026-11-17

**البند:** W2-4 — من الخطة §3/W2-4.

## ما نُفِّذ

| # | العمل | التفصيل |
|---|---|---|
| 1 | `scripts/run-tests.cjs` | المجموعات السبع تسلسلياً — أي خروج ≠ 0 = فشل؛ **لا SKIP كنجاح** |
| 2 | `"test": "node scripts/run-tests.cjs"` في الجذر | أمر موحّد |
| 3 | `"coverage": "c8 --include packages/server --reporter=text-summary node scripts/run-tests.cjs"` | تغطية أولى بـc8 |
| 4 | CI | خطوتا الاختبار الثلاث الصريحة استُبدلت بـ`pnpm test` |

## التحقق

| # | الفحص | المتوقع | الفعلي | الحالة |
|---|---|---|---|---|
| 1 | `pnpm test` | ≥ 7 مجموعات PASSED | **7/7** exit 0 | PASS |
| 2 | `pnpm exec c8 --include packages/server --reporter=text-summary node scripts/run-tests.cjs` | تقرير يُنتج | **Statements 23.42% (1717/7330) · Branches 48.71% · Functions 7.76% · Lines 23.42%** — 7/7 PASSED | PASS |
| 3 | SKIP = فشل | مكتوب في runner | نعم — أي exit ≠ 0 فشل | PASS |
| 4 | CI يستخدم الأمر الموحّد | نعم | ci.yml خطوة `pnpm test` واحدة | PASS* (GitHub مقفل) |

## العتبة المعتمدة (قياس أولي 2026-11-17)

- **خط الأساس المعتمد لـW2:** 23.42% أسطر على `packages/server` (الوحدات الكاملة بما فيها dist التي تشغّلها e2e).
- **هدف ≥ 60% على lib وroutes/auth:** **لم يتحقق في القياس الأول** — مؤجل إلى W3-4 (تغطية حرجة auth/sessions/device/ws tickets بعتبة يقيسها قياس أولي ثم تُثبَّت) وفق نص الخطة نفسها («يُعتمد الرقم بعد قياس أولي»). لم يُدَّعَ 60%.

**النتيجة: PASS** — `pnpm test` موحّد أخضر 7/7 · تقرير تغطية منتَج وعتبة معلومة (23.42% خط أساس).
