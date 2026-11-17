# خطة إصلاح AiRemote — الطريق إلى مشروع احترافي متكامل

| | |
|---|---|
| **الوثيقة** | خطة تنفيذ جاهزة للتسليم إلى منفّذ — قراءة + توثيق + اختبار في ملف واحد |
| **التاريخ** | 2026-11-16 |
| **الأساس** | AiRemote **3.16.19** — الفرع `feat/screen-unify-3.13.0` · الالتزام `8864292` |
| **المصدر** | تقرير الفحص: `docs/audits/AUDIT-2026-11-16-1324.md` (68.5/100 — C — يحتاج معالجة) |
| **الحالة** | ☐ جاهزة للتنفيذ · ☑ **قيد التنفيذ** (بدأ 2026-11-17 بأمر المالك «نفذ الكل») · ☐ منجزة |
| **قاعدة الإصدار** | الموجة 1: بلا رقم جديد إن أمكن (توثيق + مستودع + ثغرات). الموجة 2: **3.17.0** (versionCode 110) لأنها تمسّ سلوك `server.js` وتوحيد الإصدارات. الموجة 3: دمج `main` |
| **الحاكم** | ProjectForge R1 + R2 + `docs/DEFINITION-OF-DONE.md` + `docs/WORKING_AGREEMENT.md` |
| **قاعدة صارمة** | لا ميزة جديدة قبل إغلاق الحواجز. لا سرّ في أي ملف. لا حكم بلا دليل. |

---

## 0) ملخص تنفيذي

الفحص أنتج **16 بند FAIL + 10 PARTIAL + 3 حواجز**. المشروع **منتج حيّ يعمل** (6/6 أجهزة على 3.16.19، 7 مجموعات اختبارات PASSED، typecheck نظيف) لكنه **ليس مشروعاً احترافياً مكتمل الأركان**.

| الموجة | النطاق | الزمن | مخرجها | يرفع الإصدار؟ |
|---|---|---|---|---|
| **W1 — حواجز** | نسخة ثانية + ثغرات + HANDOFF + SECURITY + قرار السيرفرين | **≤ يوم** | مستودع يتنفس + بيان أمني | لا (أو patch إن لزم لpnpm) |
| **W2 — عيوب** | صدق README + أدوات جودة + توحيد إصدارات + RUNBOOK + مسارات | **≤ 3 أيام** | 3.17.0 مبني ومثبَّت | نعم **3.17.0 / vc110** |
| **W3 — تحسينات** | دمج main + تنظيف سجلات + تغطية حرجة + بوابة إصدار | **أسبوع** | main يحمل 3.17.0 | دمج فقط |

**الدرجة المستهدفة:** W1 وحدها لا تكفي لـ B. W1+W2 ⇒ **B (جاهز بشروط)**. W3 ⇒ اقتراب A.

**ترتيب الأولوية الإلزامي (R2):** E → H → D → F → B → C → G → A.

---

## 1) الأساس المعرفي — ما قِيس فعلًا (2026-11-16)

| المقياس | القيمة | الدليل |
|---|---|---|
| الدرجة | **68.5/100 — C** | `docs/audits/AUDIT-2026-11-16-1324.md` |
| الالتزامات | **913** من 2026-05-29 إلى 2026-11-13 | `git log --oneline --all` |
| الملفات المتتبعة | **878** | `git ls-files \| Measure-Object` |
| remote | **فارغ** | `git remote -v` |
| `.pf/state.json` | **غير موجود** | `Test-Path .pf` = False |
| HANDOFF-*.md | **غير موجود** (البديل: r19) | بحث متكرر |
| الاختبارات الشوغلنة | **7 مجموعات PASSED** | انظر §اختبار W1 |
| typecheck | server + agent + dashboard **نظيف** | `tsc --noEmit` |
| ثغرات high | fastify 4.29.1 + pnpm 11.5.1 | `pnpm audit --prod` |
| سيرفر TS | **3.14.0** غير مشحون | `packages/server/package.json` |
| الكود الحيّ | `server-desktop/server.js` **7,182 سطراً** | `Get-Content \| Measure-Object` |
| سجلات بناء متتبعة | **68 + 10** | `git ls-files` |
| ملف >5MB | `cloudflared.exe` **52.8MB** بلا LFS فعلي | `git cat-file -s` = 55,365,048 |
| JWT الحيّ | `crypto.randomBytes(64)` في `main.js:106` | قراءة |
| أسرار في الشجرة | **صفر حقيقي** (شهادة + مفتاح عام فقط) | `git grep` + تاريخ |
| الأسطول (r19) | **6/6 online على 3.16.19** | `docs/PROMPT-...-r19.md` §0.1 |

**ما لم يُقَس ولا يُبنى عليه قرار:** بناء إنتاج كامل · بناء Docker · اختبار اختراق · أداء البثّ · i18n كامل · جودة Java الداخلية.

---

## 2) الموجة W1 — الحواجز (≤ يوم)

> **قاعدة:** لا يُقال «أُغلق الحاجز» قبل أن يمرّ معيار قبوله بأمر مقيس. كل بند = التزام واحد.

### W1-1 · تبني المشروع + نسخة ثانية + دفع التاريخ  — **منجز 2026-11-16**

| البند | التفصيل |
|---|---|
| **العَرَض** | 913 commit تعيش على هذا القرص فقط. `git remote -v` فارغ. لا `.pf/state.json`. لا bundle. |
| **الدليل — قبل** | `git remote -v` = فارغ · `Test-Path .pf` = False |
| **السبب الجذري** | المشروع تُبنّي من بيئة عمل سابقة بلا `pf adopt` ولا ربط مستودع. |
| **الحالة** | **☑ منجز كاملاً 2026-11-17** — Gitea + الدفع (سابقاً) + `pf adopt` (state.json) + `pf backup` (bundle + SHA256 مطابقة). دليله `outputs/verify-2026-11-17/W1-1/` |
| **الرابط الفعلي** | `http://localhost:3000/ibrahims78/airemote` (خاص) · LAN: `http://192.168.1.25:3000` |
| **الحساب** | `ibrahims78` (admin) — كلمة المرور في `%APPDATA%\AiRemote\gitea-admin.txt` |
| **التنفيذ الفعلي** | Gitea **1.22.0 أصلي على Windows** في `D:\Services\Gitea\` — **لا Docker** (VM Platform غير مفعّلة). التفصيل: `docs/gitea-server-install/INSTALL-RUNBOOK.md` |
| **ما دُفع** | 5 فروع (بما فيها `feat/screen-unify-3.13.0` @ `8864292` و`main`) + 6 وسوم |
| **GitHub** | **غير مرتبط — قرار المالك المقفل** |
| **معيار القبول المتبقي** | ☑ منجز 2026-11-17 — `pf adopt` لstate.json · `pf backup` لbundle بشهادة SHA256 مطابقة (`C8DA043E…`) · `git ls-remote` ينجح (5 رؤوس) · `0 0` أمام origin |
| **الجهد المتبقي** | 30 دقيقة |
| **الخطر** | لا Docker — لا يعيد التشغيل تلقائياً بعد reboot؛ شغّل `D:\Services\Gitea\start-gitea.ps1` |

**أوامر التنفيذ (تُكتب ولا تُشغَّل إلا بأمر المالك «ابدأ»):**

```powershell
# (أ) تبنّي — لا يعدّل كوداً
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 adopt -Path "D:\autoclaw projects-new\AiRemote"

# (ب-1) خيار Gitea المحلي (مفضّل أولاً)
# شغّل Gitea إن لم يكن يعمل، ثم:
git -C "D:\autoclaw projects-new\AiRemote" remote add origin <URL-Gitea-AiRemote.git>
# (ب-2) خيار GitHub لاحقاً
# git -C "..." remote add origin https://github.com/<OWNER>/airemote.git

# (ج) دفع كل شيء
git -C "D:\autoclaw projects-new\AiRemote" push -u origin feat/screen-unify-3.13.0
git -C "D:\autoclaw projects-new\AiRemote" push origin main
git -C "D:\autoclaw projects-new\AiRemote" push origin --tags
git -C "D:\autoclaw projects-new\AiRemote" push origin --all

# (د) نسخة bundle
.\pf.ps1 backup -Path "D:\autoclaw projects-new\AiRemote"
```

**تحذير PAT:** التوكن يُدخل عبر `git credential-manager` أو متغير جلسة فقط. **لا يُكتب في remote URL داخل `.git/config` كنص صريح** إن أمكن (`http.extraheader` مؤقت أو SSH). لا يُكتب في أي وثيقة.

---

### W1-2 · إغلاق الثغرات HIGH + فحص دوري — **☑ منجز 2026-11-17** — دليله `outputs/verify-2026-11-17/W1-2/`

| البند | التفصيل |
|---|---|
| **العَرَض** | `pnpm audit --prod` = ثغرتان high: `fastify@4.29.1 < 5.7.2` (GHSA-jx2c-rxcm-jvmq) و`pnpm@11.5.1 < 11.5.3` (GHSA-5wx6-mg75-v57r). لا `dependabot.yml`. |
| **الدليل** | مخرَج audit بتاريخ 2026-11-16 · غياب `.github/dependabot.yml` |
| **الإصلاح — pnpm فوراً** | ارفع الجذر إلى `pnpm@11.5.3` أو أحدث 11.x مُرقَّع. حدّث CI من 9.15.9 إلى نفس الإصدار (تناقض موثّق: CI 9.15.9 مقابل الجذر ^11.5.1). |
| **الإصلاح — fastify** | **لا ترقية كبرى 4→5 في W1** (كسر محتمل في plugins). الخطة: (1) قراءة GHSA-jx2c-rxcm-jvmq وتحديد سطح التعرض (Content-Type header). (2) تجربة ترقية داخل 4.x إلى آخر 4.x إن وُجد backport. (3) إن لم يوجد: فرع `chore/fastify5` وترقية مُقاسة مع اختبارات e2e الثلاثة كعتبة. (4) إن فشلت: توثيق ADR + تعطيل المسار المتأثر إن أمكن + موعد ترقية. |
| **dependabot** | `.github/dependabot.yml` أسبوعي: npm + github-actions. **بلا أسرار في الملف** — secrets لاحقاً في مخزن GitHub إن استُخدم. |
| **معيار القبول** | `pnpm audit --prod` بلا high (أو high واحد موثّق بـADR مع تعويض). Dependabot مفعّل. CI يستخدم نفس إصدار pnpm. |
| **الجهد** | pnpm+dependabot: 1 ساعة · fastify: 2–6 ساعات حسب المسار |
| **الخطر** | ترقية fastify 5 تكسر `@fastify/*` قديمة (multipart@8، rate-limit@8، cookie@9). **قاعدة WORKING_AGREEMENT:** لا ترفع هذه الثلاثة خارج مسار مدروس. |

**قالب `.github/dependabot.yml` (يُكتب كما هو):**

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    reviewers:
      - "<username-المالك>"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

---

### W1-3 · HANDOFF + PROJECT_STATE إلى 3.16.19 + قرار السيرفرين — **☑ منجز 2026-11-17** — دليله `outputs/verify-2026-11-17/W1-3/`

| البند | التفصيل |
|---|---|
| **العَرَض** | لا `docs/HANDOFF-*.md`. `PROJECT_STATE.md` ترويستها 3.16.0 (2026-11-08) بينما الحقيقة 3.16.19 (2026-11-13). CHANGELOG يتوقف عند 3.16.0. |
| **الدليل** | ترويسة الملفين · `VERSION` = 3.16.19 |
| **الإصلاح** | (أ) `docs/HANDOFF-2026-11-16.md` من خلاصة r19 + الفحص. (ب) تحديث ترويسة PROJECT_STATE إلى 3.16.19 / `8864292` / 6 أجهزة. (ج) CHANGELOG مدخل `[3.16.19]` — 2026-11-13 (فخاخ 78–80 + vc109) و`[3.16.1]`…`[3.16.18]` مختصرة إن لزم. (د) ADR السيرفرين. |
| **معيار القبول** | HANDOFF يحوي **المسار + commit + التالي**. ترويسة STATE = 3.16.19. `check-version-consistency` لا يزال PASS. |
| **الجهد** | 1–2 ساعة |

**قرار W1-3د — ADR السيرفرين (إلزامي قبل أي كود):**

الخيار (أ) **الحياة هي `server-desktop`** — إعلان `packages/server` مرجع تعليمي/مجمد، وكتابة ذلك في README و`packages/server/README`.  
الخيار (ب) **التوحيد التدريجي** — نقل مسارات الحياة من `server.js` إلى TS على موجات لاحقة (خارج نطاق W1).  
الخيار (ج) **دمج فوري** — مرفوض في W1 (خطر بلا اختبار كافٍ).

**التوصية:** (أ) الآن + بند في W3 لدراسة (ب). القرار يُكتب في `docs/ADR-DUAL-SERVER.md` بالقالب: سياق / خيارات / قرار / نتائج.

**قالب HANDOFF (يُملأ ولا يُترك فارغاً):**

```markdown
# HANDOFF — 2026-11-16
- المسار: D:\autoclaw projects-new\AiRemote
- الفرع: feat/screen-unify-3.13.0
- Commit: 8864292 (أو ما بعده)
- الإصدار: 3.16.19 / vc109
- الأسطول: 6/6 (ر19) — أعد القياس قبل الاعتماد
- أُنجز في هذه الجلسة: فحص 68.5/C + هذه الخطة + ملفات r20
- التالي بالترتيب: W1-1 ثم W1-2 ثم W1-3
- ما لا يجب فعله: لا ميزة، لا دمج main، لا حذف server.js، لا كتابة أسرار
- كيف تتحقق: docs/audits/AUDIT-2026-11-16-1324.md §الحكم
```

---

### W1-4 · SECURITY.md — **☑ منجز 2026-11-17** — دليله `outputs/verify-2026-11-17/W1-4/`

| البند | التفصيل |
|---|---|
| **الدليل** | غياب موثّق في الجذر و`docs/` |
| **الإصلاح** | ملف في الجذر بقناة إبلاغ + نطاق + SLA + ما لا يُبلَّغ عنه هنا |
| **معيار القبول** | الملف موجود، يذكر بريد/قناة (يملؤها المالك)، لا يحوي سرّاً |

**قالب `SECURITY.md` (يُملأ `<...>` من المالك):**

```markdown
# سياسة الأمان — AiRemote

## الإبلاغ
- القناة: <بريد المالك أو Issues خاصة>
- ما تُبلَّغ: ثغرة مصادقة، تسريب، RCE، path traversal، SSRF، صلاحيات، أسرار في الحزمة
- ما لا يُبلَّغ هنا: خلل UI، طلب ميزة
- SLA الرد: <48 ساعة / 7 أيام>
- الإفصاح: بعد إصلاح + إصدار ترقيعي، بإذن المالك

## النطاق
- السيرفر (server-desktop الحيّ + packages/server)
- الوكيلان (agent-desktop · android-agent)
- اللوحة
- Docker

## خارج النطاق
- اختبارات الحِزم المبنية في releases/ على أجهزة غير مسجّلة
- هجمات فيزيائية على الجهاز المضيف

## ما لا نفعل
- لا نطلب كلمات مرور في Issues العامة
- لا نضع مفاتيح API في هذا الملف
```

---

### بوابة W1 (لا تُغلق الموجة قبل كل صف PASS) — **☑ PASS 10/10 — 2026-11-17** — دليلها `outputs/verify-2026-11-17/gate-W1/`

انظر §اختبار W1 كاملاً في القسم 6.

---

## 3) الموجة W2 — العيوب (≤ 3 أيام) — الإصدار **3.17.0 / vc110**

> لا تبدأ W2 قبل بوابة W1. كل بند هنا له: توثيق + اختبار + معيار قبول.

### W2-1 · README صادق وقابل للتشغيل من الصفر — **☑ منجز 2026-11-17** — دليله `outputs/verify-2026-11-17/W2-1/`

| البند | التفصيل |
|---|---|
| **العَرَض** | شارة 3.7.0 · Docker «coming soon» وهو موجود · رابط `yourusername` · لا قسم اختبار · لا مقياس نجاح رقمي في أول 20 سطراً |
| **الدليل** | `README.md` الشارات وQuick Start |
| **الإصلاح** | إعادة كتابة الأقسام: هوية + مقياس + تثبيت + تشغيل + **اختبار** + Docker (موجود) + متغيرات البيئة الكاملة + رابط المستودع الحقيقي (من W1) |
| **مقياس نجاح مقترح (يُعتمد من المالك)** | «مستخدم جديد يرفع سيرفراً ووكيل ويندوز ويتحكم بجهاز واحد خلال ≤ 15 دقيقة من الاستنساخ» |
| **معيار القبول** | شخص غريب (أو مساعد بذاكرة نظيفة) يتبع README على جهاز نظيف ويصل إلى `/health` = 3.17.0 |
| **الجهد** | 2 ساعة + جلسة تحقق |

### W2-2 · engines + توحيد الإصدارات — **☑ منجز 2026-11-17** — دليله `outputs/verify-2026-11-17/W2-2/`

| البند | التفصيل |
|---|---|
| **الدليل** | لا `engines` في أي package.json · server/agent/shared = 3.14.0 مقابل الجذر 3.16.19 · ai-engine = 1.0.0 |
| **الإصلاح** | (أ) `"engines": { "node": ">=22", "pnpm": ">=11.5.3" }` في الجذر وكل الحزم. (ب) رفع server/agent/shared/ai-engine إلى **3.17.0** مع الجذر. (ج) `versionCode` 109 → **110**. (د) بوابة `check-version-consistency.cjs` تُصبح عائق دمج. |
| **معيار القبول** | البوابة PASS · لا package.json خارج 3.17.0 (إلا إن استُثني بإذن مكتوب) |
| **الخطر** | رفع إصدار حزمة غير مشحونة لا يكسر التشغيل؛ رفع server-desktop/agent-desktop/dashboard يجب أن يمشي مع البناء. |

### W2-3 · .editorconfig + ESLint (أو Biome) + أمر lint حقيقي — **☑ منجز 2026-11-17** — دليله `outputs/verify-2026-11-17/W2-3/`

| البند | التفصيل |
|---|---|
| **الدليل** | لا إعداد linter خارج node_modules · `"lint": "pnpm -r lint"` في الجذر أمر فارغ |
| **الإصلاح** | (أ) `.editorconfig` (UTF-8 · LF · 2 مسافة · trim). (ب) ESLint 9 flat config أو Biome — **Biome أسرع** لمونوريب TS/React. (ج) سكربت `lint` في كل حزمة TS + الجذر. (د) خطوة CI بعد typecheck. (هـ) **أسبوع تحذير** (`--max-warnings` مرفوع) قبل تحويله عائقاً. |
| **معيار القبول** | `pnpm lint` ينجح على الشجرة (بعد إصلاح ما يُكسر أو استثناء مبرر) · CI يشغّله |
| **الجهد** | 3–4 ساعات |
| **الخطر** | آلاف التحذيرات في `server.js` (7182 سطراً) — ابدأ بـ`packages/*/src` واستثنِ bundles و`server.js` مؤقتاً في W2، ثم أدخله في W3. |

**قالب `.editorconfig`:**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[*.{bat,cmd,ps1}]
end_of_line = crlf
```

### W2-4 · أمر `test` موحّد + عتبة تغطية على المصادقة والجلسات — **☑ منجز 2026-11-17** — دليله `outputs/verify-2026-11-17/W2-4/`

| البند | التفصيل |
|---|---|
| **الدليل** | 38 ملف `*.test.cjs` · لا `test` في الجذر · لا coverage |
| **الإصلاح** | (أ) `scripts/run-tests.cjs` يجمع الاختبارات السريعة المعروفة (المجموعات السبع + أي `*.test.cjs` في server/agent-desktop لا يحتاج Electron). (ب) `"test": "node scripts/run-tests.cjs"`. (ج) CI يستبدل الثلاثة الصريحة بالأمر الموحّد. (د) c8 أو node `--experimental-test-coverage` على `packages/server/src/lib` و`routes/auth` فقط كعتبة أولى (الهدف ≥ 60% على تلك الوحدات — يُعتمد الرقم بعد قياس أولي). |
| **معيار القبول** | `pnpm test` يشغّل ≥ 7 مجموعات وينجح · CI يستخدمه · تقرير coverage يُنتج |
| **لا يُقبل** | SKIP محسوباً نجاحاً (قاعدة DoD §7) |

### W2-5 · إزالة المسارات المطلقة من الكود الحيّ — **☑ منجز 2026-11-17** — دليله `outputs/verify-2026-11-17/W2-5/`

| البند | التفصيل |
|---|---|
| **الدليل** | `server-desktop/server.js:5532` → `C:\Users\Public\airemote-shot.jpg` · `:5695` → `ai-ctl.ps1` · عشرات في `scripts/` و`tools/lab/a2a/` إلى `C:\Users\admin\...` |
| **الإصلاح — الكود الحيّ أولاً** | `server.js`: `process.env.AIREMOTE_TMP || os.tmpdir()` بدل `C:\Users\Public`. **scripts/ وtools/**: `process.env.LAB_CREDS` أو مسار نسبة إلى `tools/lab/` — هذه أدوات معمل وقد تُؤجَّل بعد الكود الحيّ. |
| **معيار القبول** | `git grep "C:\\\\Users\\\\admin"` في `packages/server-desktop/server.js` = **0** · اختبار لقطة شاشة ينجح على مضيف غير admin |
| **الجهد** | الكود الحيّ 1–2 ساعة · scripts 2–3 ساعات (يمكن تقسيمها) |

### W2-6 · `.env.example` مركزي شامل — **☑ منجز 2026-11-17** — دليله `outputs/verify-2026-11-17/W2-6/`

| البند | التفصيل |
|---|---|
| **الدليل** | مثالان فقط في `packages/*/src/.env.example` · لا ملف في الجذر · متغيرات `CREDENTIALS_KEY`, `TRUST_PROXY`, `TLS_CERT_PATH`, `AGENT_ALLOW_INSECURE_WS`, `AIREMOTE_BACKUP_*` غير موثّقة في README |
| **الإصلاح** | `.env.example` في الجذر **بأسماء وشرح وبلا قيم حقيقية** + جدول في README. حذف التكرار أو الإشارة إليه. |
| **معيار القبول** | كل متغير يقرأه الكود له سطر في المثال · `git grep "process.env."` في الحزم الرئيسية يطابق الملف |

**قالب `.env.example` (أسماء فقط):**

```bash
# ── سيرفر ─────────────────────────────
PORT=3001
HOST=0.0.0.0
NODE_ENV=development          # production يُلزم TLS
JWT_SECRET=                   # إلزامي في production — لا قيمة هنا
CREDENTIALS_KEY=              # إلزامي في Docker — لا قيمة هنا
DB_PATH=./data/airemote.db
DASHBOARD_URL=http://localhost:5173
LOG_LEVEL=info
TRUST_PROXY=false             # true فقط خلف proxy HTTPS
TLS_CERT_PATH=
TLS_KEY_PATH=
AGENT_ALLOW_INSECURE_WS=      # 1 للمعمل المعزول فقط

# ── نسخ احتياطي ───────────────────────
AIREMOTE_BACKUP_KEEP=7
AIREMOTE_BACKUP_INTERVAL_HOURS=24
AIREMOTE_BACKUP_DISABLE=

# ── وكيل ─────────────────────────────
SERVER_URL=ws://localhost:3001/ws
DEVICE_TOKEN=                 # من اللوحة
DEVICE_NAME=My Computer
```

### W2-7 · CONTRIBUTING + AGENTS — **☑ منجز 2026-11-17** — دليله `outputs/verify-2026-11-17/W2-7/`

قالبان يُكتبان من WORKING_AGREEMENT + قواعد هذا الملف. `AGENTS.md` يمنع: ميزة قبل W1، كتابة أسرار، تجاوز توقّف r19/r20، تعديل `server.js` خارج نطاق مهمة.

### W2-8 · RUNBOOK تشغيلي — **☑ منجز 2026-11-17** — دليله `outputs/verify-2026-11-17/W2-8/`

`docs/RUNBOOK.md` — تشغيل · فحص صحة · أعطال شائعة · نسخ/استعادة · تراجع إصدار · منافذ · TLS.

يستمد من: `docker-compose.yml` · `backup-manager.js` · `restore-backup.cjs` · `docs/CI.md` · r19 §0.3.

**اختبار الاستعادة (G5):** شغّل `restore-backup.cjs` على نسخة مؤقتة (لا على القاعدة الحيّة) وسجّل التاريخ والنتيجة في RUNBOOK.

### W2-9 · cloudflared.exe — LFS فعلي أو تنزيل — **☑ منجز 2026-11-17 (خيار ب)** — دليله `outputs/verify-2026-11-17/W2-9/`

خيار (أ) تثبيت git-lfs + `git lfs migrate import --no-rewrite` للملف.  
خيار (ب) **مفضّل:** أخرجه من Git، ونزّله وقت التثبيت (CI installer يفحص وجوده أصلاً).  
معيار: `git ls-files` لا يحوي `cloudflared.exe` **أو** `git lfs ls-files` يعرضه (بعد تثبيت LFS).

### W2-10 · CHANGELOG 3.16.1 → 3.16.19 — **☑ منجز 2026-11-17** (3.16.x في W1-3 + مدخل 3.17.0) — دليله `outputs/verify-2026-11-17/W2-10/`

مدخل مختصر لكل إصدار من تقارير `docs/RELEASE-*` و`تقرير-إغلاق-*` وr17–r19. لا اختراع.

---

## 4) الموجة W3 — تحسينات (أسبوع)

| # | العمل | المعيار |
|---|---|---|
| 1 | دمج `feat/screen-unify-3.13.0` إلى `main` بعد مراجعة `git diff main...HEAD` **كاملاً** (ليس الملخص) | مراجعة بجدول (ملف:سطر \| شدة \| مشكلة) · CI أخضر على main |
| 2 | `git rm --cached` لسجلات البناء + `.gitignore` | `git ls-files` بلا `srv-build-log*` |
| 3 | نقل `PROJECT_STATE.md` إلى `docs/` + جمع ADRs في `docs/ADR/` | روابط محدّثة · لا رابط مكسور |
| 4 | تغطية حرجة: auth · sessions · device access · ws tickets | عتبة يحددها قياس أولي ثم تُثبَّت |
| 5 | مراجعة CORS الحيّ `origin:false, credentials:true` (`server.js:3914`) بقياس متصفح | توثيق السلوك الفعلي في RUNBOOK |
| 6 | إدخال `server.js` تحت linter | صفر خطأ أو استثناء مبرر |
| 7 | بوابة CI: انحراف إصدار الحزم عن VERSION = فشل | `check-version-consistency` بلا `--allow-missing-server` إن أمكن |
| 8 | دراسة توحيد TS (من ADR W1) — لا تنفيذ إن لم يُطلب | ADR تحديث فقط |

---

## 5) التوثيق الإلزامي لكل بند (بنفس الملف)

كل بند عند تنفيذه يُحدَّث في **أربعة أماكن** (قاعدة DoD §8 + WORKING_AGREEMENT):

| النوع | المكان |
|---|---|
| هذا الملف | خانة الحالة ☐ → ☑ + سطر «نُفِّذ YYYY-MM-DD — دليله …» |
| `CHANGELOG.md` | إن تغيّر سلوك ظاهر أو إصدار |
| `PROJECT_STATE.md` | §0.1 قيد التنفيذ / §12 سجل |
| `outputs/verify-YYYY-MM-DD/<بند>/` | خطوات + متوقع + فعلي + PASS/FAIL |

**لا يُقبل:** «يعمل عندي» · لقطة بلا خطوات · exit 0 من سكربت لا يفحص شيئاً.

---

## 6) خطة الاختبار الكاملة

### 6.1) اختبار W1 (بوابة الموجة)

| # | الحالة | الأمر / الخطوات | المتوقَّع |
|---|---|---|---|
| 1 | remote يستجيب | `git ls-remote --heads origin` | رأسان على الأقل (main + الفرع الحيّ) |
| 2 | state.json صالح | `Get-Content .pf\state.json \| ConvertFrom-Json` | JSON لا يرمي |
| 3 | bundle موجود | قارن SHA256 الملف مع ملف `.sha256` | مطابق |
| 4 | pnpm مُرقَّع | `pnpm -v` + `pnpm audit --prod` | ≥11.5.3 · صفر high (أو high موثّق ADR) |
| 5 | dependabot | `Test-Path .github\dependabot.yml` | True · CI لا يزال أخضر |
| 6 | HANDOFF كامل | اقرأ الملف | مسار + commit + التالي |
| 7 | STATE ترويسة | أول 10 أسطر | 3.16.19 / 8864292 (أو ما بعده) |
| 8 | SECURITY.md | الملف + قناة إبلاغ ممتلئة | True |
| 9 | ADR السيرفرين | القرار مكتوب (أ/ب/ج) | ملف موجود بقرار لا بأسطر فارغة |
| 10 | لا تراجع في الاختبارات | المجموعات السبع | كلها PASSED |

### 6.2) اختبار W2 (بوابة 3.17.0)
> **الحالة: ✗ FAIL 11/14 — 2026-11-17** — دليلها `outputs/verify-2026-11-17/gate-W2/` — W3 متوقفة (verify.js 55/57: sessions export على node:sqlite + `/health` UNREACHABLE). الخيارات للمالك في ملف البوابة.

| # | الحالة | المتوقَّع |
|---|---|---|
| 1 | README من الصفر على جهاز/مجلد نظيف | `/health` = 3.17.0 خلال ≤ 15 دقيقة (المقياس المعتمد) |
| 2 | Docker: `docker compose up` بعد تصدير JWT_SECRET وCREDENTIALS_KEY | healthcheck أخضر — **لا يُشغَّل على قاعدة الإنتاج** |
| 3 | `pnpm lint` | exit 0 (أو تحذيرات ضمن الحد) |
| 4 | `pnpm test` | ≥ 7 مجموعات PASSED · SKIP = فشل |
| 5 | coverage المسارات الحرجة | تقرير يُنتج والعتبة معلومة |
| 6 | `git grep "C:\\\\Users\\\\admin" -- packages/server-desktop/server.js` | 0 |
| 7 | لقطة شاشة على حساب غير admin (أو tmpdir) | ملف يُكتب في المسار الجديد |
| 8 | `.env.example` مقابل `process.env` | لا متغير ناقص من الأساسيات |
| 9 | RUNBOOK + تجربة استعادة على نسخة | خطوات تنجح وتُسجَّل |
| 10 | `check-version-consistency` | PASS على 3.17.0 |
| 11 | البطارية `verify.js` | ≥ خط 56/57 بلا تراجع — **أعِد تشغيلها هنا** (ر19 أجّلتها) |
| 12 | البناء الخمسة + بيان موقَّع | `signature OK` · `all artifacts match` |
| 13 | تثبيت على الأسطول | 6/6 على 3.17.0 (أو ما يسمح به المالك من أجهزة) |
| 14 | cloudflared | خارج ls-files أو داخل LFS |

### 6.3) اختبار W3

| # | الحالة | المتوقَّع |
|---|---|---|
| 1 | `git diff main...HEAD` مراجَع | جدول مراجعة مكتمل |
| 2 | main CI أخضر | workflow ناجح |
| 3 | `git ls-files \| Select-String srv-build-log` | 0 |
| 4 | ADRs في `docs/ADR/` | لا رابط مكسور في الفهرس |
| 5 | CORS قياس متصفح | سلوك موثّق (نفس الأصل / رفض عابر) |

### 6.4) اختبارات لا تُلمَس (انحدار ممنوع)

- التحكم بالشاشة (فخاخ 78–80 مُغلقة في r19 — لا تُفتح).
- صلاحيات e2e-authz (viewer لا يبدأ التقاطاً).
- منع JWT/TLS في production (`e2e-connection`).
- بوتس الإنتاج بلا JWT_SECRET أو بلا TLS = FATAL.

---

## 7) خطة الإصدار 3.17.0 (نهاية W2)

1. رفع الرقم في المصادر الثمانية + `versionCode 110` (نفس متسلسلة r19 §0.6).
2. بناء: dashboard (vite) ← copy-dashboard ← bundle ← electron-builder (سيرفر) ← electron-builder (وكيل) ← APK + zipalign + apksigner.
   - كلمة مرور keystore من `…\AiRemote\signing\keystore-password.txt` — **لا تُطبع**.
   - `run-electron-builder.cjs` يفشل مع مسافة في المسار — استخدم `npx electron-builder` (فخّ موثّق).
3. البيان: `release-manifest.js` ثم `--verify` ⇒ `signature OK`.
4. تثبيت: سيرفر ← `/health` = 3.17.0 · وكيل المضيف · WIN10/WIN11 عبر `vm-exec` (base64 إلزامي) · APK على الأجهزة التي يسمح بها المالك.
5. **ترتيب أندرويد الإلزامي (فخّ 82):** تثبيت ← إعدادات ← a11y مربوطة ← التقاط ← إعادة تشغيل.
6. الأسطول في `/api/devices` = 3.17.0.
7. `verify.js` كامل + `check-version-consistency` + البوابات.
8. `pf checkpoint` + tag `v3.17.0` + CHANGELOG.

**التراجع:** كل بند = التزام واحد. الرجوع بـ`git revert`. الحزم السابقة 3.16.19 تبقى في `releases/` للرجوع المثبَّت.

---

## 8) المخاطر والتراجع

| الخطر | الأثر | الوقاية |
|---|---|---|
| ترقية fastify 5 تكسر plugins | سيرفر لا يقلع | لا ترقية كبرى في W1 · فرع معزول · e2e الثلاثة عتبة |
| دفع التاريخ إلى remote عام | تسريب تاريخ قديم إن كان فيه سرّ | المسح قال صفر أسرار؛ ومع ذلك ابدأ Gitea محلياً خاصاً |
| توحيد إصدارات يكسر `/health` | لوحة تُظهر رقماً وسيرفر آخر | المصدر package.json (تم في 3.14.0) — أعد القياس |
| linter يغرق الشجرة تحذيرات | تجميد العمل | ابدأ بـsrc، استثنِ server.js وbundles في W2 |
| مسارات مطلقة في scripts معمل | كسر أدوات الفحص الحيّ | عدّل الكود الحيّ أولاً؛ scripts لاحقاً |
| حذف cloudflared من Git يكسر المثبّت | installer يفشل | CI يفحص وجوده أصلاً — وفّر تنزيلاً قبل الحذف |
| لمس فخاخ 78–80 | بثّ أندرويد ينكسر | لا تلمس MediaProjection/a11y في W1/W2 إلا لاختبار عدم الانحدار |
| كتابة PAT أو كلمة مرور في ملف | تسريب | قاعدة r19 §0.2 — لا تُنقض |

---

## 9) الجدول الزمني

| الوقت | العمل |
|---|---|
| ساعة 0–2 | W1-1 adopt + remote + backup |
| ساعة 2–3 | W1-2 pnpm + dependabot |
| ساعة 3–5 | W1-3 HANDOFF + STATE + ADR + W1-4 SECURITY |
| ساعة 5–6 | بوابة W1 (10 حالات) |
| يوم 2 صباحاً | W2-1 README + W2-2 engines/إصدارات + W2-6 env.example |
| يوم 2 مساءً | W2-3 linter + W2-4 test موحّد |
| يوم 3 | W2-5 مسارات + W2-8 RUNBOOK + W2-9 cloudflared + W2-10 CHANGELOG + W2-7 AGENTS/CONTRIBUTING |
| يوم 3 مساءً | بناء 3.17.0 + تثبيت + بوابة W2 (14 حالة) |
| أسبوع W3 | دمج main + تنظيف + تغطية + CORS |

---

## 10) قائمة القبول النهائية (Sign-off)

- [ ] `git ls-remote origin` ينجح · bundle بشهادة SHA256
- [ ] `.pf/state.json` يُقرأ
- [ ] `pnpm audit --prod` بلا high غير الموثّق
- [ ] dependabot.yml موجود
- [ ] HANDOFF + STATE + CHANGELOG على الحقيقة
- [ ] SECURITY.md + ADR السيرفرين
- [ ] README يُوصِل شخصاً غريباً إلى `/health`
- [ ] `engines` + إصدارات موحّدة 3.17.0
- [ ] `pnpm lint` و`pnpm test` أوامر حقيقية في CI
- [ ] صفر `C:\Users\admin` في `server.js`
- [ ] `.env.example` مركزي بلا قيم
- [ ] RUNBOOK + استعادة مجرّبة على نسخة
- [ ] cloudflared معالج
- [ ] `signature OK` · الأسطول على 3.17.0
- [ ] `verify.js` أعيد تشغيله ونجح
- [ ] فخاخ 78–80 ما زالت مغلقة (AISHOT ليس مربعاً · التقاط يعود بعد force-stop)
- [ ] لا ميزة جديدة دخلت أثناء الإصلاح

---

## 11) ملحق — خريطة الملفات المتأثرة

| الملف | الموجة | التغيير |
|---|---|---|
| `.pf/state.json` | W1 | يولّده adopt |
| `.github/dependabot.yml` | W1 | جديد |
| `.github/workflows/ci.yml` | W1/W2 | pnpm version + خطوة test موحّدة + lint |
| `docs/HANDOFF-2026-11-16.md` | W1 | جديد |
| `docs/ADR-DUAL-SERVER.md` | W1 | جديد |
| `SECURITY.md` | W1 | جديد |
| `PROJECT_STATE.md` | W1 | ترويسة + §0.1 + §12 |
| `CHANGELOG.md` | W1/W2 | 3.16.x + 3.17.0 |
| `README.md` | W2 | إعادة كتابة تشغيلية |
| `.editorconfig` · eslint/biome | W2 | جديد |
| `scripts/run-tests.cjs` | W2 | جديد |
| `package.json` الجذر والحزم | W2 | engines + إصدار + test + lint |
| `packages/server-desktop/server.js` | W2 | مسارات مطلقة فقط |
| `.env.example` | W2 | جديد في الجذر |
| `CONTRIBUTING.md` · `AGENTS.md` | W2 | جديد |
| `docs/RUNBOOK.md` | W2 | جديد |
| `VERSION` · `versionCode` | W2 | 3.17.0 / 110 |
| `.gitignore` | W2/W3 | سجلات + cloudflared |

---

## 12) ما لا تفعله هذه الخطة

- لا تعيد بناء الميزات الموجودة.
- لا تدمج main في W1.
- لا ترقي fastify 5 في W1.
- لا تلمس فخاخ 78–80 كإصلاح جديد.
- لا تكتب سراً في أي ملف من ملفات هذه الخطة.
- لا تبدأ W2 قبل بوابة W1.

---

**نهاية الخطة.** كل بند مسنَد إلى دليل من فحص 2026-11-16، ومعيار قبوله أمر مقيس، والتوثيق والاختبار في هذا الملف نفسه. التنفيذ لا يبدأ إلا بكلمة المالك: **«ابدأ W1»** أو اسم بند صريح.
