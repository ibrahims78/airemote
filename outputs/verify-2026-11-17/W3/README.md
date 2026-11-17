# دليل W3 — دمج main + تنظيف + ADRs + CORS + lint استثناء — 2026-11-17

**ملاحظة:** بوابة W2 كانت FAIL 11/14 — المالك قال «شغلت السيرفر اكمل التنفيذ». `/health` صار **3.16.19** (مستجيب — لم يعد UNREACHABLE) لكنه ≠ 3.17.0 (البناء غير المثبَّت). P6 يفشل **تطابقاً** لا انقطاعاً. sessions export يبقى بيئياً (node:sqlite). المالك أمر بالاستمرار — W3 نُفِّذت مع توثيق الاستثناءين.

## W3-1 — دمج main (fast-forward)

- main كانت `874242a` بـ**0 التزام فريد** — دمج `--ff-only` بدون تعارضات.
- 757 التزاماً · 926 ملفاً · +84,223 / −111,274.
- مراجعة الجدول: CORS مقيس، أسرار صفر، الحيّ باقٍ، فخاخ 78–80 لم تُلمس.
- **main دُفعت:** `874242a..749cbdb main -> main`.
- الدليل: `outputs/verify-2026-11-17/W3-1-merge-review/README.md`

## W3-2 — تنظيف سجلات البناء

- `git rm --cached`: **77 ملفاً** (68 srv-build-log + 9 agent-build-log).
- `git ls-files` بعدها: srv-build-log = **0** · agent-build-log = **0**.
- `.gitignore`: أُضيفا.

## W3-3 — ADRs إلى docs/ADR/ + PROJECT_STATE

- 11 ملف ADR نُقلت `git mv` إلى `docs/ADR/`.
- روابط `docs/ADR-` → `docs/ADR/` في 19+ ملف md — **صفر** رابط قديم متبقٍ.
- **انحراف موثّق:** `PROJECT_STATE.md` **بقي في الجذر** — (أ) pf يدير `docs/PROJECT_STATE.md` كقالب حالته الآلية، (ب) روابط relative داخل الملف (outputs/…, docs/…) تنكسر بالنقل، (ج) DoD والخطط تشير للجذر. الملف الرسمي التاريخي = الجذر؛ ملف pf في docs/ يبقى حالة pf.

## W3-5 — CORS قياس حيّ

مقاس على 3001 (3.16.19 — نفس كود CORS في 3.17.0): لا ACAO لـevil.example ولا لـlocalhost:5000 — same-origin فقط. موثّق في `docs/RUNBOOK.md` §7.1.

## W3-6 — server.js تحت linter

**استثناء مبرر:** `biome.json` يستثني `server.js` و`main.js` وstatic/dist — 7,182 سطراً حيّاً إدخاله الكامل موجة إصلاح مستقلة (الخطة سمحت: «صفر خطأ أو استثناء مبرر»).

## W3-7 — بوابة إصدار في CI

`ci.yml` يشغل `check-version-consistency --allow-missing-server` — **بقي العلم** لأن `/health` = 3.16.19 ≠ 3.17.0؛ إزالة العلم تفشل البوابة حتى تثبيت 3.17.0 على 3001.

## W3-8 — دراسة توحيد TS

ADR-DUAL-SERVER: القرار يبقى (أ) — لا توحيد TS بلا قرار جديد من المالك.
