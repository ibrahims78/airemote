# P2 — الأمر الاحترافي المكتمل لفحص AiRemote

> **جاهز للصق.** انسخ كل ما تحت الخط والصقه في جلسة جديدة (مساعد نظيف).
> **البديل الآلي:** `D:\ProjectForge\05-SCRIPTS\pf.ps1 audit -Path "D:\autoclaw projects-new\AiRemote"`
> **آخر تحديث:** 2026-11-16 · يطابق ProjectForge P2 + R2 مع تصحيحات خاصة بهذا المشروع.

---

أنت الآن **مدقّق برمجيات أول (Principal Auditor)** مهمتك تقييم مشروع قائم
بعين صارمة، وإصدار حكم مبني على أدلة. المشروع: **AiRemote** في
`D:\autoclaw projects-new\AiRemote`.

## قواعد إلزامية

1. **لا حكم بلا دليل:** كل ملاحظة تُرفق بـ (ملف:سطر) أو (مخرَج أمر) أو (غياب موثّق). ما لا دليل عليه يُكتب في «غير مؤكد» ولا يُحسب عيباً.
2. **لا تعديل في مرحلة الفحص.** القراءة فقط. لا `git checkout`، لا حذف، لا تنسيق، لا `pnpm install`، لا بناء يكتب داخل الشجرة.
3. **لا تخمين للنية:** إن كان السلوك غير واضح، اذكر افتراضك صريحاً واستمر.
4. **صرّح بالتغطية:** ما لم تفحصه يُذكر في «نطاق غير مغطّى».
5. **رتّب بالمخاطر لا بالسهولة.** لا تجمّل النتيجة.
6. **لا تنسخ نتيجة `pf audit` حرفياً.** الآلي يخطئ في هذا المشروع تحديداً (انظر «فخاخ pf audit»).

## سياق المشروع (اقرأه قبل الأوامر)

- **ما هو:** منصة وصول عن بُعد self-hosted (بديل AnyDesk/TeamViewer) مع طبقة AI، سيرفر Fastify + لوحة React + وكيلا ويندوز (Electron) وأندرويد.
- **الحزمة الحيّة:** `packages/server-desktop/server.js` (~7,180 سطراً) — **ليست** `packages/server` TypeScript. `PROJECT_STATE.md` يصرّح أن TS «غير مشحون». من يقرأ `packages/server` وحدها يفهم مشروعاً آخر.
- **الإصدار المرجعي:** `VERSION` = 3.16.19 · versionCode أندرويد = 109.
- **الفرع المتوقع:** `feat/screen-unify-3.13.0` (يسبق `main` بمئات الالتزامات).
- **آخر commit متوقع عند كتابة هذا الأمر:** `8864292` (2026-11-13).
- **لا remote:** `git remote -v` فارغ. هذا عيب حقيقي لا يكتشفه `pf audit` أحياناً.
- **مفاتيح `.pem` المتتبعة ليست أسراراً:** `airemote_ca.pem` شهادة `BEGIN CERTIFICATE`، و`release-key.pub.pem` مفتاح **عام**. لا تعتبرهما تسريباً.
- **`secrets/` على القرص** (jks + كلمة مرور keystore) **غير متتبع** — هذا صحيح، لا تعتبره تسريباً في الشجرة.
- **JWT الحيّ يُولَّد** في `packages/server-desktop/main.js` بـ `crypto.randomBytes(64)` — لا سرّ مكتوب في الكود الحيّ.

### فخاخ `pf audit` في هذا المشروع (تحقّق يدوياً ولا تأخذ الآلي كحكم)

| ما قد يقوله الآلي خطأً | الحقيقة | كيف تتحقق |
|---|---|---|
| A6 لا ADR | 9 ملفات `docs/ADR-*.md` موجودة | `Get-ChildItem docs -Filter 'ADR-*'` |
| A5 لا PROJECT_STATE | `PROJECT_STATE.md` في **الجذر** لا في `docs\` | `Test-Path PROJECT_STATE.md` |
| B2 remote مضبوط | `git remote -v` **فارغ** | `git remote -v` |
| B6 أسرار `.pem` | شهادة + مفتاح عام، ليست أسراراً | اقرأ أول سطر من كل `.pem` متتبع |
| C3 linter معدّ | لا eslint/biome/editorconfig في المشروع | `Get-ChildItem -Recurse -Include '.eslintrc*','eslint.config.*','.editorconfig'` خارج node_modules |
| D5 CI لا يشغّل اختبارات | `ci.yml` يشغّل 3 اختبارات بالاسم | اقرأ `.github/workflows/ci.yml` |
| C5 TODO حرج 18 موضعاً | كلها في `*.bundle.js` (أطراف ثالثة) | استثنِ `*.bundle.js` من العدّ |

## المرحلة 0 — الأساس

```powershell
git -C "D:\autoclaw projects-new\AiRemote" status --short
git -C "D:\autoclaw projects-new\AiRemote" log --oneline -15
git -C "D:\autoclaw projects-new\AiRemote" remote -v
git -C "D:\autoclaw projects-new\AiRemote" branch -a
git -C "D:\autoclaw projects-new\AiRemote" tag
(git -C "D:\autoclaw projects-new\AiRemote" ls-files | Measure-Object -Line).Lines
git -C "D:\autoclaw projects-new\AiRemote" rev-list --left-right --count main...HEAD
Get-ChildItem "D:\autoclaw projects-new\AiRemote" -Force | Select-Object Name
Get-Content "D:\autoclaw projects-new\AiRemote\VERSION"
```

سجّل: الفرع، آخر commit، عدد الملفات المتتبعة، وجود/غياب remote، كم commit يسبق main، VERSION.

## المرحلة 1 — الفحص الآلي (نقطة البداية، لا النهاية)

```powershell
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 audit -Path "D:\autoclaw projects-new\AiRemote"
```

اقرأ التقرير الناتج في `D:\autoclaw projects-new\AiRemote\docs\audits\`.
**لا تكتفِ به.** صحّح كل فخ من جدول «فخاخ pf audit» أعلاه بالدليل.

## المرحلة 2 — المحاور الثمانية (افحص بالترتيب، وثّق الدليل)

### A — الهوية والتوثيق
- `README.md` في الجذر: هل يفهم شخص غريب المشروع في دقيقة؟
- **تحقّق من الكذب المحتمل:** شارة الإصدار في README (كانت 3.7.0 بينما VERSION=3.16.19) · «Docker coming soon» بينما `docker/docker-compose.yml` مكتمل · رابط `yourusername/airemote.git`.
- هل أوامر التشغيل حقيقية (اقرأها سطراً سطراً وجرّب وجود الملفات التي تستدعيها)؟
- `CHANGELOG.md` آخر إصدار موثّق مقابل `VERSION`.
- `PROJECT_STATE.md` (الجذر): ترويسة «آخر تحديث» مقابل الحقيقة.
- `docs/DEFINITION-OF-DONE.md` · `docs/ADR-*.md` · غياب `RUNBOOK` و`SECURITY.md` و`AGENTS.md` و`CONTRIBUTING.md`.
- هل أول 20 سطراً من README تحوي غرضاً بجملة + مستخدماً + **مقياس نجاح رقمياً**؟

### B — المستودع
```powershell
(git -C "D:\autoclaw projects-new\AiRemote" log --oneline --all | Measure-Object -Line).Lines
git -C "D:\autoclaw projects-new\AiRemote" ls-files | ForEach-Object {
  $p = Join-Path "D:\autoclaw projects-new\AiRemote" $_
  if (Test-Path -LiteralPath $p -PathType Leaf) {
    $it = Get-Item -LiteralPath $p
    if ($it.Length -gt 5MB) { [PSCustomObject]@{Name=$_; MB=[math]::Round($it.Length/1MB,1)} }
  }
} | Format-Table -AutoSize
git -C "D:\autoclaw projects-new\AiRemote" ls-files | Select-String -Pattern 'srv-build-log|agent-build-log|\.bak$|\.log$' | Measure-Object
git -C "D:\autoclaw projects-new\AiRemote" ls-files | Select-String -Pattern '\.env$|\.pem$|\.key$|\.jks$'
```
- المتوقع: `cloudflared.exe` ~52.8MB متتبع، و`git lfs` **غير مثبّت** (الأمر يفشل). `.gitattributes` يعلن LFS بلا فعالية.
- المتوقع: **68** ملف `srv-build-log*` متتبع في `server-desktop` + **10** في `agent-desktop`.
- لا تعتبر `airemote_ca.pem` و`release-key.pub.pem` أسراراً.

### C — جودة الكود
اقرأ **كاملة** (لا عينات):
1. `packages/server-desktop/server.js` — الكود الحيّ (اقرأه على دفعات: المصادقة، TLS، CORS، المسارات المطلقة، JWT).
2. `packages/server/src/app.ts` — المرجع النظيف.
3. `packages/server/src/lib/security.ts` — SSRF + الأدوار.

قيّم: التسمية، الفصل، التكرار (سيرفران!)، معالجة الأخطاء، المسارات المطلقة (`C:\Users\...`)، الكود الميت.

```powershell
# typecheck (قراءة، لا يكتب في الشجرة إلا tsbuildinfo إن سُمح)
pnpm -C "D:\autoclaw projects-new\AiRemote" --filter @airemote/server typecheck
pnpm -C "D:\autoclaw projects-new\AiRemote" --filter @airemote/agent typecheck
pnpm -C "D:\autoclaw projects-new\AiRemote" --filter @airemote/dashboard typecheck
```

```powershell
# TODO خارج bundles
git -C "D:\autoclaw projects-new\AiRemote" grep -nIE "TODO|FIXME|HACK" -- "*.ts" "*.tsx" "*.js" "*.cjs" "*.java" | Where-Object { $_ -notmatch '\.bundle\.js' }
# مسارات مطلقة
git -C "D:\autoclaw projects-new\AiRemote" grep -nIE "[A-Z]:\\\\Users\\\\|C:/Users/" -- "*.ts" "*.tsx" "*.js" "*.cjs" "*.json" "*.ps1"
```

### D — الاختبارات (شغّلها؛ الفشل عتبة حاجزة)
```powershell
cd "D:\autoclaw projects-new\AiRemote"
node packages/server/test/registry-race.test.cjs
node packages/server/test/e2e-connection.test.cjs
node packages/server/test/e2e-authz.test.cjs
node packages/server/test/e2e-screen-keyframe.test.cjs
node packages/agent-desktop/test/safety.test.cjs
node packages/agent-desktop/test/password-kdf.test.cjs
node packages/server-desktop/test/secrets.test.cjs
```
سجّل: العدد، النجاح/الفشل، المدة.
- **لا يوجد أمر `test` موحّد** في `package.json` الجذر (هذا بند D4 FAIL).
- CI يشغّل 3 منها فقط: اقرأ `.github/workflows/ci.yml`.
- لا تغطية (D6).
- Electron E2E في `server-desktop/test` يحتاج ثنائي Electron — لا تشغّلها إن لم يكن مثبتاً؛ اكتبها في «غير مغطّى».

### E — الأمان (الأهم)
```powershell
git -C "D:\autoclaw projects-new\AiRemote" grep -nIE "sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY"
git -C "D:\autoclaw projects-new\AiRemote" grep -nIE "(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['`"][^'`"]{8,}" -- "*.ts" "*.js" "*.json" "*.yml"
Test-Path "D:\autoclaw projects-new\AiRemote\.env"
Test-Path "D:\autoclaw projects-new\AiRemote\.env.example"
git -C "D:\autoclaw projects-new\AiRemote" ls-files | Select-String -Pattern "\.env$|\.pem$|\.key$|\.jks$"
# تاريخ
git -C "D:\autoclaw projects-new\AiRemote" log --all -p -S "sk-" --oneline | Select-Object -First 5
git -C "D:\autoclaw projects-new\AiRemote" log --all --oneline -- secrets/
# ثغرات
pnpm -C "D:\autoclaw projects-new\AiRemote" audit --prod
```
- المتوقع وقت كتابة الأمر: ثغرتان **high** (fastify 4.x، pnpm 11.5.1) ولا `dependabot.yml`.
- `ghp_secret_789` في اختبار ACL هو **fixture** وليس توكناً.
- اقرأ `packages/server-desktop/main.js` حول `jwtSecret` (المتوقع: randomBytes 64).

### F — البناء والتبعيات
- `pnpm-lock.yaml` متتبع.
- لا `engines` في أي `package.json`.
- تناقض pnpm: CI يثبّت **9.15.9** والجذر يطلب `pnpm ^11.5.1`.
- إصدارات حزم غير موحّدة: `@airemote/server`/`agent`/`shared` = **3.14.0** مقابل الجذر **3.16.19**.
```powershell
node "D:\autoclaw projects-new\AiRemote\scripts\check-version-consistency.cjs" --allow-missing-server
```
- البناء الكامل **لا يُطلب** في الفحص إلا إذا قال المالك «ابنِ». اكتب F5 = NA.

### G — التشغيل والنشر
- `docker/Dockerfile.server` (non-root + healthcheck) · `docker-compose.yml` يرفض الإقلاع بلا `JWT_SECRET` و`CREDENTIALS_KEY`.
- README يقول Docker «coming soon» — هذا كذب توثيقي حتى لو Docker موجود.
- `packages/server-desktop/lib/backup-manager.js` + `scripts/restore-backup.cjs` موجودان.
- لا RUNBOOK. لا سجل «استعادة ناجحة بتاريخ كذا».
- `/health` الحيّ قد يكون UNREACHABLE أثناء الفحص — سجّلها كما هي.

### H — المتابعة والاستئناف
```powershell
Test-Path "D:\autoclaw projects-new\AiRemote\.pf"
Test-Path "D:\autoclaw projects-new\AiRemote\docs\PROJECT_STATE.md"
Test-Path "D:\autoclaw projects-new\AiRemote\PROJECT_STATE.md"
Get-ChildItem "D:\autoclaw projects-new\AiRemote" -Recurse -Filter 'HANDOFF*' -File
Get-ChildItem "D:\autoclaw projects-new\AiRemote\docs" -Filter 'PROMPT-NEW-ACCOUNT-*' | Sort-Object Name | Select-Object -Last 3
git -C "D:\autoclaw projects-new\AiRemote" log -1 --format='%h %ci'
git -C "D:\autoclaw projects-new\AiRemote" ls-remote --heads origin
```
- المتوقع: لا `.pf/`، لا `HANDOFF-*`، لا remote.
- البديل الفعلي للتسليم: آخر `docs/PROMPT-NEW-ACCOUNT-*-rNN.md` (يحوي المسار + commit + التالي + أمر توقّف).
- آخر `PROJECT_STATE.md` ترويسته قد تتأخر عن r19 — سجّل الفرق.
- اختبر الاستئناف فعلياً: اقرأ آخر PROMPT كأنك حساب جديد، وحاول أن تجد المسار والcommit والتالي بلا سؤال.

## المرحلة 3 — الحكم

احسب الدرجة على 100 وفق أوزان R2:

| المحور | الوزن |
|---|---|
| A الهوية والتوثيق | 15 |
| B المستودع وGit | 12 |
| C جودة الكود | 12 |
| D الاختبارات | 13 |
| E الأمان | 15 |
| F البناء والتبعيات | 10 |
| G التشغيل والنشر | 10 |
| H المتابعة والاستئناف | 13 |

```
درجة المحور = (مجموع أوزان PASS + 0.5×PARTIAL) ÷ (مجموع أوزان البنود المطبَّقة) × وزن المحور
```
F5 (البناء الفعلي) = NA ويُستبعد من مقام المحور F.

| الدرجة | التقدير | الحكم |
|---|---|---|
| 90–100 | A | جاهز للإنتاج |
| 75–89 | B | جاهز بشروط |
| 60–74 | C | يحتاج معالجة |
| < 60 | D | غير جاهز |

**قواعد حاكمة:**
- أي FAIL في E1 أو E2 أو B6 → **غير جاهز** مهما كانت الدرجة (تسريب أسرار).
- غياب H1 وH3 معاً → **قابل للفقدان**.
- درجة عالية بلا اختبارات شُغِّلت (D=0) → اطرح 10 نقاط.

## قالب التقرير (احفظه في `docs\audits\AUDIT-<التاريخ>.md`)

```markdown
# تقرير فحص — AiRemote
- التاريخ | المسار | الفرع | Commit | هل شُغّل البناء | هل شُغّلت الاختبارات

## الحكم
- الدرجة: NN/100 | التقدير: A/B/C/D | الحكم: ...
- الحواجز: N | أهم 3 مخاطر: ...

## درجات المحاور (8 صفوف: الوزن، المُحصّل، النسبة، الحالة)

## البنود الفاشلة (مرتبة بالأثر)
| # | البند | الشدة | الدليل (ملف:سطر / مخرَج) | الإصلاح | الجهد |

## ما لم يُفحص
## خطة إصلاح في 3 موجات (حواجز / عيوب / تحسينات)
```

## ممنوعات

- تعديل أي ملف أثناء الفحص.
- إعطاء درجة عالية مع اختبارات لم تُشغَّل.
- تجاهل بند أمني لأنه «المشروع داخلي».
- نسخ نتيجة `pf audit` حرفياً بلا تحقق يدوي من E وD وB2.
- ادعاء فحص ما لم تفتحه.
- اعتبار شهادات `.pem` العامة أسراراً.
- اعتبار `ghp_secret_789` في الاختبارات توكناً حقيقياً.

---

## خط أساس مقارنة (جولة 2026-11-16)

إذا أعدت الفحص بعد إصلاحات، قارن مع هذا الخط:

| البند | خط الأساس 2026-11-16 |
|---|---|
| الدرجة | **68.5 / 100 — C — يحتاج معالجة** |
| الفرع / Commit | `feat/screen-unify-3.13.0` / `8864292` |
| remote | فارغ |
| `.pf/state.json` | غير موجود |
| HANDOFF-*.md | غير موجود (البديل: r19) |
| الاختبارات الشوغلنة | 7 مجموعات PASSED |
| typecheck | server + agent + dashboard نظيف |
| ثغرات high | fastify 4.29.1 + pnpm 11.5.1 |
| ملفات بناء متتبعة | 68 + 10 |
| ملف >5MB | cloudflared.exe 52.8MB بلا LFS فعلي |

**الهدف بعد موجة 1:** إغلاق remote + state.json + HANDOFF + SECURITY.md + ثغرات high → إعادة فحص.
**الهدف بعد موجة 2:** README صادق + linter + أمر test موحّد + توحيد إصدارات + RUNBOOK → استهداف B.
