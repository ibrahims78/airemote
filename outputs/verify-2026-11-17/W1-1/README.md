# دليل W1-1 — pf adopt + pf backup + تحقق remote — 2026-11-17

**البند:** W1-1 المتبقي (التبنّي + النسخة الثانية) — من `docs/خطة-إصلاح-AiRemote-3.16.19-2026-11-16-AR.md` §2/W1-1.
**السياق:** Gitea + دفع التاريخ أُنجزا سابقاً (منجز 2026-11-16). المتبقي كان: `pf adopt` + `pf backup`.

## الخطوات والمتوقع والفعلي

| # | الأمر | المتوقع | الفعلي | الحالة |
|---|---|---|---|---|
| 1 | `.\pf.ps1 adopt -Path "D:\autoclaw projects-new\AiRemote"` | إنشاء `.pf\state.json` بلا تعديل كود | `[OK] أُنشئ .pf\state.json` — «لن يُعدَّل أي ملف كود». أنشأ كذلك `docs\PROJECT_STATE.md` كقالب pf عام (يُملأ بالحقيقة في W1-3) | PASS |
| 2 | `Get-Content .pf\state.json -Raw \| ConvertFrom-Json` | JSON لا يرمي | JSON OK — 12 حقلاً (project/repo/status/phase/sessions/…) | PASS |
| 3 | `.\pf.ps1 backup -Path "D:\autoclaw projects-new\AiRemote"` | bundle صالح + SHA256 | `AiRemote-20261117-1012.bundle` (164,137,382 B) + `.sha256.txt` في `D:\ProjectForge\07-LOCAL-REPO\backups\AiRemote\` — «النسخة صالحة وقابلة للاستنساخ» | PASS |
| 4 | مقارنة SHA256 (bundle مقابل .sha256.txt) | تطابق | expected = actual = `C8DA043EC7260EBE371EB9E3DFBC72EA9CF1D65C0311C31D60F662D7B8C077E0` → MATCH: True | PASS |
| 5 | `git ls-remote --heads origin` | رأسان على الأقل | 5 رؤوس: `feat/screen-unify-3.13.0` @ `ee88d9e` · `main` @ `874242a` · `hardening/audit-20261102` · `checkpoint/3.6.0-2026-10-25` · `checkpoint/3.8.1-2026-10-26` | PASS |
| 6 | `git fetch origin` ثم `git rev-list --left-right --count origin/feat/screen-unify-3.13.0...HEAD` | fetch ينجح · 0/0 | fetch exit 0 · `0 0` — البعيد مُزامَن بالكامل مع HEAD المحلي | PASS |

## انحراف وُجد وعُولج (موثّق)

- **العَرَض:** `git fetch`/`git ls-remote` فشلا بـ`Authentication failed` رغم اكتمال إعداد الاعتماد في `.git/config` (`credential.http://localhost:3000.helper = store --file D:/Services/Gitea/git-credentials`).
- **السبب:** helper عام `credential.helper = manager` (Git Credential Manager) في gitconfig على مستوى النظام يتقدّم في سلسلة الاعتماد ويُفشل المصادقة قبل الوصول إلى store helper الصحيح. ثبُت أن اعتماد ملف store صالح: عند تصفير السلسلة وتحديد store مباشرة نجح `ls-remote` كاملاً.
- **الإصلاح (محلي في `.git/config` فقط، بلا أي سرّ):** إقحام قسم `[credential]` بقيمة `helper =` فارغة قبل مدخلي `credential "http://localhost:3000"` و`credential "http://192.168.1.25:3000"` — يُصفّر ما ورثه GCM ويبقي store هو المعتمد لهذين العنوانين. ملف الاعتماد الخارجي لم يُلمس.
- **التحقق بعده:** `ls-remote` و`fetch` ينجحان بلا أي override (الجدول أعلاه، عنصرا 5–6). وُثّق في `docs/gitea-server-install/INSTALL-RUNBOOK.md` §10.

## ملاحظات

- `pf adopt` أنشأ أيضاً `docs\PROJECT_STATE.md` كقالب عام بمحتوى لا يطابق هذا المشروع («لا اختبارات، لا CI») — لا يُلتزم كما هو؛ يُملأ بالحقيقة في W1-3. الملف التاريخي الرسمي هو `PROJECT_STATE.md` في الجذر حتى نقله في W3-3.
- `pf status` يعدّ 39 ملفاً «غير محفوظ» = 37 ملف `artifacts/*` غير متتبعة (نمط تاريخي مقبول في r19/r20) + `.pf/` + `docs\PROJECT_STATE.md`.
- رقم pf «أمام origin: 727» كان مقارنةً بمرجع متقادم؛ القياس المباشر `git rev-list --left-right --count` = `0 0`.
- اختبار registry-race أُعيد قبل هذا البند ضمن تقرير الاستئناف: **ALL TESTS PASSED**.

**النتيجة: PASS** — معيار قبول W1-1 المتبقي مستوفى بالكامل.
