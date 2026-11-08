# خريطة الأرشيف — `E:\AiRemote-Archive`

نُقلت من المشروع ملفات **لا تدخل البناء ولا التشغيل ولا البوابات**. المشروع من **13.5GB إلى 1.85GB**.

| الجولة | التاريخ | ما نُقل |
|---|---|---|
| الأولى | 2026-11-08 | 10.41GB / 2203 ملفًا — إصدارات قديمة ومخرجات تحقّق قديمة |
| الثانية | 2026-11-08 | 791MB — `win-unpacked` (وسيطة بناء) · 691MB — مخابئ `.cache` · 131 ملف توثيق قديم · Replit |

## 1) الإصدارات

| المجلد | ما فيه |
|---|---|
| `releases\server-windows` | كل مثبّتات وحِزم السيرفر قبل 3.16.0 |
| `releases\agent-windows` | نفسها للوكيل |
| `releases\archive` | نسخ المختبر `vc63`–`vc67` |
| `releases\apk` | `AiRemote-Agent-3.14.0 … 3.15.0` مع `.idsig` |
| `releases\win-unpacked-*` | مجلدات فكّ الحزم (539MB + 252MB) — يعيدها `electron-builder` عند كل بناء |

## 2) مخرجات التحقّق القديمة

`outputs\` — كل `verify-*` قبل 2026-11-08 · `audit-frames` · `perf` · نسخة القاعدة الاحتياطية قبل 3.14.0 (470MB).
بقي في المشروع `outputs/verify-2026-11-08/` فقط.

## 3) المخابئ والأدوات

| البند | الحجم | لماذا هي آمنة |
|---|---|---|
| `.cache\gradle-home` | 323MB | `GRADLE_USER_HOME` غير مضبوط ⇒ gradle يستخدم `~/.gradle` (361MB موجود) |
| `.cache\electron44` | 367MB | بُنيت حزمة الوكيل بنجاح بعد نقله ⇒ غير مستخدم |
| `tools\lab\a2a` | 234 ملفًا | مخرجات تدقيق نصّية قديمة؛ السكربتات (`.ps1` · `.cjs`) بقيت |
| `design\` | 3MB | لقطات ومراجع تصميم قديمة |

**الاختبار كان عمليًّا لا تخمينًا:** نقلت `gradle-home` ثم بنيت APK بـ`--offline` (نجح)، ونقلت `electron44` ثم بنيت حزمة الوكيل كاملة (نجح).

## 4) التوثيق

نُقل **131 ملفًا** من `docs/` (وثائق تسليم `r2`–`r8` · `HANDOFF-*` · `CHANGES-*` · `RELEASE-*` · `REPORT-*` · خطط ومخابر قديمة).

بقي **21** ملفًا: وثيقة الاستئناف الحالية `r9` · تقرير الجلسة · مسح السطح · خطة 3.14.4 المفتوحة · قرارات معمارية `ADR-*` · بروتوكولا الريلاي ونقل الملفات · `ANDROID-TOOLCHAIN-AND-KEY` · `DECISIONS-LOG` · `WORKING_AGREEMENT` · `DEFINITION-OF-DONE` · `CI` · `README`.

## 5) Replit

`.replit` و`replit.nix` — إعداد منصة Replit، لا يُستخدم في البناء المحلي ولا في التطوير. نُقلا إلى `E:\AiRemote-Archive\root\`.

## 6) ما بقي في المشروع ولماذا

| البند | الحجم | السبب |
|---|---|---|
| `node_modules` | 1.09GB | التبعيات — لا بناء بلاها |
| `releases\*3.16.0*` + `tools\patch-probe.exe` | 615MB | الإصدار الحالي ودليل التوقيع |
| `packages` | 183MB | كود المشروع وتبعياته ومخرجاته |
| `.cache\better-sqlite3` | 1MB | بناء الوحدة الأصلية |
| `secrets\` | — | مفتاح توقيع APK |
| `docs\` | 0.2MB | التوثيق النهائي والقرارات |

> `node_modules` هي الحجم الأكبر، ولا تُؤرشف: أرشفتها تعني تعذّر البناء بلا إعادة تثبيت من الشبكة.

## 7) تغيير أداة واحد

`tools/lab/session/check-artifacts.cjs` كان يقرأ `app.asar` من `win-unpacked`. بعد أرشفته صار يطبع **SKIP** بدل الفشل، ويحيل إلى `scripts/check-shipped-bytes.cjs` الذي يفحص **الـasar المثبَّت** — وهو الدليل الأقوى أصلًا.

## 8) التحقق بعد كل ذلك

`verify.js` **56/56** · `check-shipped-bytes` **13/13** · `check-artifacts` **ok** · البيان: **signature OK · all artifacts match** · `/health` = 3.16.0.

## 9) الاسترجاع

```powershell
# قطعة واحدة
Move-Item 'E:\AiRemote-Archive\releases\server-windows\AiRemote-Server-Setup-v3.15.0-x64.exe' 'D:\autoclaw projects-new\AiRemote\releases\server-windows\'
# توثيق قديم
Move-Item 'E:\AiRemote-Archive\docs\HANDOFF-2026-11-02-3.11.7-AR.md' 'D:\autoclaw projects-new\AiRemote\docs\'
```
> بعد استرجاع أي حزمة إصدار قديم، أعِد توليد البيان: `node scripts/release-manifest.js` ثم `--verify`.

## 10) أثر معروف
التقارير القديمة تشير إلى مسارات `outputs/verify-*` و`docs/HANDOFF-*` نُقلت بنفس البنية إلى `E:`. الملفات محفوظة، والروابط داخل المستودع لم تعد تُفتح.
