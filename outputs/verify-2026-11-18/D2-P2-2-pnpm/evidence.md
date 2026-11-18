# D2-P2-2 — تثبيت packageManager + مسار Corepack لـpnpm

**التاريخ:** 2026-11-18

## العيب (من جولة تشخيص D2)
pnpm العالمي على الجهاز **9.15.9** بينما `engines.pnpm >= 11.5.3` — كل أمر جذر (`pnpm lint/build/typecheck`) يفشل بـ`ERR_PNPM_UNSUPPORTED_ENGINE`، والالتفاف اليدوي كان `./node_modules/.bin/pnpm`.

## الإصلاح
1. `package.json` (الجذر): حقل **`"packageManager": "pnpm@11.28.12"`** — نفس الإصدار المثبّت في `node_modules` والمعلن في CI.
2. README (قسم المتطلبات): تعليمات Corepack لمن pnpm العالمي عنده أقدم.

**لم يُلمس pnpm العالمي** (يخدم مشاريع أخرى على الجهاز) — Corepack يشتق الإصدار المثبّت داخل المستودع فقط.

## الإثبات
```
$ corepack pnpm -v
11.28.12                          ← مشتق من packageManager (كان سيستخدم 9.15.9 العالمي)

$ corepack pnpm --filter @airemote/shared typecheck
$ tsc --noEmit                    ← أمر workspace حقيقي عبر corepack نجح
```

## لماذا هذا الحل
- صفر تأثير على بيئة الجهاز (بديل `corepack enable` يركّب shims عامة تغيّر سلوك pnpm في كل المشاريع).
- CI (`.github`) مثبّت على 11.28.12 أصلًا — الحقل يجعل المصدرَين متطابقين.
