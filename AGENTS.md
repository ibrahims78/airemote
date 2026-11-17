# AGENTS — قواعد المساعد في AiRemote

> أُنشئ ضمن W2-7 (2026-11-17). المصدر: أوامر المالك r19/r20 + `docs/WORKING_AGREEMENT.md` + `docs/DEFINITION-OF-DONE.md`.

## الهوية

أنت منفّذ/مدقّق في مشروع AiRemote — منصة وصول عن بُعد self-hosted بطبقة AI.
**المسار:** `D:\autoclaw projects-new\AiRemote` · **المستودع:** Gitea محلي `http://localhost:3000/ibrahims78/airemote` (خاص).

## مصادر الحقيقة

1. الملفات على القرص + تاريخ Git — **لا الذاكرة ولا المحادثات السابقة**.
2. `docs/PROMPT-NEW-ACCOUNT-*-rNN.md` (الأحدث) — نقطة الاستئناف.
3. `docs/خطة-إصلاح-AiRemote-3.16.19-2026-11-16-AR.md` — الدستور التنفيذي W1–W3.
4. `PROJECT_STATE.md` + `docs/HANDOFF-2026-11-16.md` + `.pf/state.json`.

## التوقّف والتنفيذ

- **لا تعديل ولا تنفيذ كتابة** حتى كلمة المالك: «نفذ» / «نفذ W1» / «نفذ الكل» / «ابدأ W1-?» / «ثبّت» / «اربط GitHub» / «قف».
- بوابة تفشل = توقف الموجة. لا W2 قبل بوابة W1. لا W3 قبل بوابة W2.
- تثبيت الأسطول **لا يبدأ** إلا بكلمة «ثبّت».
- **لا GitHub** — لا يُربط إلا بكلمة «اربط GitHub».

## ممنوعات

- ميزة جديدة خارج الخطة.
- حذف `server.js` أو استبداله بـTS.
- لمس فخاخ 78–80 كإصلاح جديد (مغلقة في r19 — اختبار عدم انحدار فقط).
- كتابة PAT/كلمة مرور في أي ملف متتبع. الاعتمادات: `%APPDATA%\AiRemote\` (gitea-admin / lab-credentials / signing / lab-probe).
- إيقاف سيرفر 3001 الإنتاجي بلا أمر.
- `docker compose up` على قاعدة الإنتاج.
- دمج main في W1. ترقية fastify 4→5 في W1.
- ادعاء فحص ما لم يُفتح. درجة عالية بلا تشغيل اختبارات.

## الكود الحيّ

`packages/server-desktop/server.js` هو المشحون — **ليس** `packages/server` TypeScript (فخّ 88). انظر `docs/ADR-DUAL-SERVER.md`.

## كل بند

تنفيذ + توثيق (الخطة ☑ + CHANGELOG + STATE §12 + `outputs/verify-<اليوم>/<بند>/`) + اختبار + commit برسالة إنجليزية تحمل رقم البند + `pf checkpoint`.

## الإسناف عند كل توقف

```powershell
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 checkpoint -Path "D:\autoclaw projects-new\AiRemote" -Message "W?-?: <إنجاز مقيس>"
.\pf.ps1 handoff    -Path "D:\autoclaw projects-new\AiRemote"
git -C "D:\autoclaw projects-new\AiRemote" push origin --all
```

+ حدّث PROJECT_STATE §0.1 و§12 + ارفع رقم r أو حدّث HANDOFF.
