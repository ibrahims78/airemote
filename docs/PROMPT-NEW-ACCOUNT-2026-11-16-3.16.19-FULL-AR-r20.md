# استئناف AiRemote — 2026-11-16 · الإصدار **3.16.19** — نسخة **r20**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-14-3.16.19-FULL-AR-r19.md` وكل ما قبله.**
> كل رقم هنا **مقيس في 2026-11-16 ~13:24 بتوقيت الجهاز** على الجهاز نفسه.
> **جديد في r20:** فحص ProjectForge P2 كامل (**68.5/100 — C — يحتاج معالجة**) · خطة إصلاح W1–W3 جاهزة · ملف ما يلزم من المالك · **لا كود جديد** · **لا تثبيت جديد** · الفخاخ 78–80 ما زالت مغلقة كما تركتها r19.
> **المطلوب منك الآن: اقرأ الخطة، املأ checklist المالك، ثم قل «ابدأ W1» أو «تحقّق ثم قف».**

### خلاصة في عشرة أسطر

1. السيرفر **3.16.19** (حسب r19) — هذا الفحص لم يعد يبني ولا يثبّت. `/health` أثناء الفحص كان **UNREACHABLE**؛ أعد القياس.
2. الفرع `feat/screen-unify-3.13.0` · آخر التزام **`8864292`** (sign the 3.16.19 manifest).
3. **لا remote** · **لا `.pf/state.json`** · **لا HANDOFF-*.md** — 913 التزاماً على هذا القرص فقط. **هذا الحاجز الأول.**
4. **فحص احترافي جديد:** `docs/audits/AUDIT-2026-11-16-1324.md` — الدرجة **68.5/C**.
5. **خطة الإصلاح:** `docs/خطة-إصلاح-AiRemote-3.16.19-2026-11-16-AR.md` — W1 يوم / W2 ثلاثة أيام (3.17.0) / W3 أسبوع.
6. **ما يلزم منك:** `docs/مطلوب-من-المالك-2026-11-16-AR.md` — Gitea محلي فقط. **GitHub مقفل: لا تربط إلا إذا قال المالك صراحة «اربط GitHub».**
7. **اختبارات هذا الفحص:** 7 مجموعات PASSED · typecheck نظيف في 3 حزم · صفر أسرار حقيقية في التاريخ.
8. **فخاخ 78/79/80** ما زالت مغلقة بكود r19 — **لا تُفتح**. فخاخ 82–85 ما زالت تصدق.
9. `verify.js` **لم يُعَد** — آخر خط أساس **56/57**. الخطة تعيد تشغيله في بوابة W2.
10. **المطلوب منك الآن: املأ checklist المالك ثم أمر البدء.** لا بناء، لا تثبيت، لا تعديل حتى ذلك الحين.

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا ويُحترم حرفيًا

**قِف هنا. لا تنفّذ أي إجراء — لا بناء، لا تثبيت، لا تعديل ملف، لا `git commit`، لا `pf adopt`، لا تشغيل سكربت يكتب — حتى يقول المالك صراحةً «ابدأ» أو «ابدأ W1» أو «نفّذ البند كذا».**

- ترخيصك الحالي: **قراءة وتحقّق فقط** (قراءة ملفات، `git log`/`git status`/`git remote -v`، `curl /health`، بوابات القراءة، `adb shell dumpsys` للقراءة، `node <test.cjs>` **للاختبارات غير الكاتبة**، `pnpm typecheck`، `pnpm audit`).
- الممنوع الآن: أي كتابة داخل `D:\autoclaw projects-new\AiRemote` أو `D:\autoclaw projects\offline-build-tools`، وأي `adb install`/`am force-stop`/`settings put`، وأي `pnpm build`/`electron-builder`/`gradle`، وأي `pf adopt`/`pf checkpoint`/`pf backup`، وأي تعديل على handoff إلا بنسخ تقرير بأمر.
- كل ما في r19 **منجَز ومُثبَّت** وما زال يصدق إلا ما هو موسوم «معلّق». هذا r20 **لا يُلغي r19** — يضيف فحصاً وخطة.
- إن وجدت رقمًا مختلفًا: **لا تُصلح شيئًا**. أبلِغ المالك بالفرق وانتظر.

**كلمات فكّ التوقّف الوحيدة (من المالك فقط):**
«ابدأ» · «ابدأ W1» · «نفّذ» · «اكمل البند كذا» · «عدّل» · «ابنِ» · «ثبّت» · «تحقّق ثم قف».

**قبل أي شيء آخر — اقرأ بالترتيب ثم قِس (§0.1.1) و**قف**:

1. هذا الملف (r20) — الحالة والأوامر.
2. `docs/أمر-تنفيذ-الخطة-الكاملة.md` — **أمر التنفيذ الكامل W1→W3 (ابدأ من هنا إن كان المالك أعطاك صلاحية)**.
3. `docs/audits/AUDIT-2026-11-16-1324.md` — الفحص والحكم.
4. `docs/خطة-إصلاح-AiRemote-3.16.19-2026-11-16-AR.md` — W1–W3.
5. `docs/مطلوب-من-المالك-2026-11-16-AR.md` — ما لا تملكه.
6. `docs/PROMPT-NEW-ACCOUNT-2026-11-14-3.16.19-FULL-AR-r19.md` — إرث r19 (فخاخ، أجهزة، أدوات).

---

## 0.1) الحالة المقيسة الآن (2026-11-16 ~13:24)

| البند | القيمة | كيف تُتحقَّق |
|---|---|---|
| الفرع | `feat/screen-unify-3.13.0` | `git branch --show-current` |
| آخر التزام | **`8864292`** (sign the 3.16.19 manifest) | `git log --oneline -5` |
| تاريخ آخر التزام | **2026-11-13 23:14:19 +0300** | `git log -1 --format='%ci'` |
| عدد الالتزامات | **913** | `git log --oneline --all \| Measure-Object` |
| ملفات متتبعة | **878** | `git ls-files \| Measure-Object` |
| **remote** | **فارغ — حاجز** | `git remote -v` |
| **`.pf/state.json`** | **غير موجود — حاجز** | `Test-Path .pf` |
| `VERSION` | **3.16.19** | `Get-Content VERSION` |
| `versionCode` أندرويد | **109** | `packages/android-agent/app/build.gradle` |
| **السيرفر المثبَّت** | UNREACHABLE لحظة الفحص — **أعد قياس `/health`** | `curl.exe -k -s https://127.0.0.1:3001/health` |
| الدرجة | **68.5/100 — C — يحتاج معالجة** | `docs/audits/AUDIT-2026-11-16-1324.md` |
| الحواجز | **3:** لا remote · سيرفران منفصلان · ثغرات HIGH | نفسه §الحكم |
| حزمة server TS | **3.14.0** (غير مشحون) | `packages/server/package.json` |
| الكود الحيّ | `server-desktop/server.js` **7,182 سطراً** | `Get-Content \| Measure-Object` |
| ثغرات high | fastify 4.29.1 + pnpm 11.5.1 | `pnpm audit --prod` |
| سجلات بناء متتبعة | **68 + 10** | `git ls-files` |
| ملف >5MB | `cloudflared.exe` **52.8MB** بلا LFS فعلي | `git cat-file -s HEAD:packages/server-desktop/bin/cloudflared.exe` |
| **البيان** | 3.16.19 · 75 عنصراً · موقَّع (r19 — لم يُعاد التحقق في r20) | `node scripts/release-manifest.js --verify` |
| **توافق الإصدار** | PASS وقت r19 (أعد التشغيل) | `node scripts/check-version-consistency.cjs --allow-missing-server` |
| **الأسطول** | r19 قال **6/6 online 3.16.19** — r20 لم يقِس الأسطول | `/api/devices` أو القاعدة — **أعد القياس** |
| شجرة git | غير المتتبَّع: `artifacts/*` + `docs/PROMPT-*` + `docs/تقرير-*` + `docs/audits/` | `git status --short` |
| `verify.js` | **لم يُعَد** — آخر خط أساس **56/57** | — |
| typecheck (r20) | server + agent + dashboard **نظيف** | `pnpm -r typecheck` |
| اختبارات r20 | **7 مجموعات PASSED** | انظر §0.6 |

**الأجهزة كما وثّقها r19 (لم يُعَد قياسها في r20 — أعد القياس قبل الاعتماد):**

| # | الاسم | الحالة r19 | النسخة r19 | IP |
|---|---|---|---|---|
| 1 | Android-Emulator | online | 3.16.19-android | 192.168.1.12 |
| 2 | TECNO-KL4 | online | 3.16.19-android (109) | 192.168.1.101 |
| 3 | DESKTOP-K81PJ9H | online | 3.16.19 | 192.168.1.25 |
| 4 | WIN10-VM | online | 3.16.19 | 192.168.1.102 |
| 5 | WIN11-VM | online | 3.16.19 | 192.168.1.106 |
| 6 | TAB16-USB | online | 3.16.19-android (109) | 192.168.1.100 |

> TAB16-USB = `GPSZ2025040701858` — قرار المالك في r19: **الإبقاء على التسجيل والرمز**. لا تغيّره.

### 0.1.1) أول 10 دقائق — تحقّق ثم قف

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git branch --show-current                          # feat/screen-unify-3.13.0
git rev-parse --short HEAD                         # 8864292
git remote -v                                      # فارغ
Test-Path .pf                                      # False
Get-Content VERSION                                # 3.16.19
node scripts/check-version-consistency.cjs --allow-missing-server
curl.exe -k -s https://127.0.0.1:3001/health       # إن فشل: سجّل UNREACHABLE ولا تشغّل شيئاً
node packages/server/test/registry-race.test.cjs   # ALL TESTS PASSED
```

**المتوقَّع:** HEAD `8864292` · remote فارغ · `.pf` غائب · VERSION 3.16.19 · registry-race PASSED.

**بعدها توقّف** حتى أمر المالك.

### 0.1.1.أ) أوامر البدء (بعد إذن المالك فقط)

هذه **لا تُشغَّل في أول 10 دقائق**. تُشغَّل بعد «ابدأ W1»:

```powershell
# تسليم الحالة إلى ProjectForge (لا يعدّل كوداً)
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 adopt   -Path "D:\autoclaw projects-new\AiRemote"
.\pf.ps1 status  -Path "D:\autoclaw projects-new\AiRemote"
.\pf.ps1 backup  -Path "D:\autoclaw projects-new\AiRemote"
# ثم W1-1 (ربط remote) حسب قرار المالك في ملف المالك
```

### 0.1.1.ب) أوامر الإسناف عند التوقف (نهاية كل جلسة عمل)

```powershell
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 checkpoint -Path "D:\autoclaw projects-new\AiRemote" -Message "W1-<بند>: <ما أُنجز بمقيس>"
.\pf.ps1 handoff    -Path "D:\autoclaw projects-new\AiRemote"
# حدّث هذا الملف (r20 → r21) أو أنشئ HANDOFF-<تاريخ>.md
# حدّث PROJECT_STATE.md §0.1 و §12
# حدّث CHANGELOG إن تغيّر سلوك
git -C "D:\autoclaw projects-new\AiRemote" status --short   # يجب نظيفة أو مفهومة
```

**نص يُلصق للمساعد عند التوقف:**

```
سأتوقف الآن. المشروع D:\autoclaw projects-new\AiRemote.
1) pf checkpoint -Message "نهاية الجلسة: <ما أُنجز>"
2) pf handoff
3) اعرض HANDOFF كاملاً وgit status
4) لا ميزة جديدة. لا سرّ في أي ملف.
```

### 0.1.1.ج) أوامر الحساب الجديد / الاستئناف الصباحي

```
المشروع: AiRemote — المسار: D:\autoclaw projects-new\AiRemote
لا تعتمد على أي محادثة سابقة ولا على ذاكرة.

نفّذ:
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 resume -Path "D:\autoclaw projects-new\AiRemote" -Prompt

ثم اقرأ بالترتيب:
1) docs\PROMPT-NEW-ACCOUNT-2026-11-16-3.16.19-FULL-AR-r20.md   (هذا الملف — أو ما بعده rNN)
2) docs\audits\AUDIT-2026-11-16-1324.md
3) docs\خطة-إصلاح-AiRemote-3.16.19-2026-11-16-AR.md
4) docs\مطلوب-من-المالك-2026-11-16-AR.md
5) docs\PROJECT_STATE.md وآخر HANDOFF-*.md
6) docs\مطلوب-من-المالك-2026-11-16-AR.md checklist — هل المالك ملأه؟

أعطني تقرير الاستئناف:
- آخر commit + الفرع + حالة الشجرة
- الانحراف عن آخر تسليم
- ما أُنجز فعلاً (آخر 3 نقاط حفظ)
- التالي بالترتيب (W؟-؟)
- العوائق
- ما لا يجب فعله
- المهمة الواحدة التي سأبدأ بها الآن

ثم قف وانتظر «ابدأ» أو اسم البند.
Git هو الحكم إن تعارضت الملفات.
```

**إن كان المشروع بلا remote ولا `.pf` بعد (وهي حالة 2026-11-16):** أول أمر بعد إذن المالك هو `pf adopt` **لا** `pf resume` (resume يحتاج state). اقرأ الملفات يدوياً ثم adopt.

---

## 0.1.2) ما ينتقل مع تغيير الحساب وما لا ينتقل

**ينتقل (على القرص — لا علاقة له بالحساب):**
- المستودع `D:\autoclaw projects-new\AiRemote` (بكل الالتزامات حتى `8864292` + وثائق r20 غير الملتزمة).
- `D:\autoclaw projects-new\AiRemote-handoff`: التقارير · الأدوات · اللقطات · نسخ PROMPT.
- القاعدة `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` (قراءة فقط) · مفاتيح التوقيع `…\AiRemote\signing\` · شهادة TLS · اعتماد `lab-probe.json`.
- الحزم المبنية في `releases\`.
- `D:\ProjectForge\` كاملة (القواعد + السكربتات).
- `D:\autoclaw projects\offline-build-tools\` (JDK/SDK/Gradle).

**لا ينتقل (مرتبط بحساب AutoClaw الحالي):**
- ذاكرة مساحة العمل.
- سجل المحادثات والمرفقات و«الوكلاء المحفوظون».
- سجلات `.zwork\background\*` ومساحة العمل نفسها.

**لذلك في الحساب الجديد:** لا تعتمد على أي مرجع داخل مساحة عمل قديمة. اقرأ هذا الملف والخطة والفحص من المسارات أعلاه، ونفّذ §0.1.1 ثم قف.

---

## 0.2) الوصول والحسابات (لا قيم سرّية داخل المستودع)

كما r19 بلا تغيير: `admin@airemote.local` (كلمة المرور عند المالك) · **`lab-probe@local`** بياناته في `C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json` · القاعدة read-only · مفاتيح التوقيع في `…\AiRemote\signing\` · شهادة TLS في `…\AiRemote-Server\tls\server.crt`.

**قاعدة صارمة:** أي سرّ يُقرأ من البيئة/المالك/ملفات الاعتماد. **لا يُكتب في مستودع ولا وثيقة ولا التزام ولا مخرَج أداة ولا ردّ.**

**حدّ الدخول: 5/دقيقة** على `lab-probe` — كل `push-file` = دخول واحد (فخّ #84).

**ما يزيده r20:** انظر `docs/مطلوب-من-المالك-2026-11-16-AR.md` §2 (S1–S8) — خاصة PAT إن اختر المالك GitHub، وكلمة admin لاختبار الأدوار.

---

## 0.3) البيئة والأدوات

| الأداة | المسار |
|---|---|
| جذر الأدوات | `D:\autoclaw projects\offline-build-tools` (**ليس** تحت `projects-new`) |
| JDK | `…\android-toolchain\jdk` (OpenJDK 21) |
| Android SDK | `…\android-toolchain\sdk` (platform android-35 · build-tools **34.0.0**) |
| Gradle | `…\android-toolchain\gradle\bin\gradle.bat` |
| adb | `…\sdk\platform-tools\adb.exe` |
| zipalign / apksigner | `…\sdk\build-tools\34.0.0\` |
| ProjectForge | `D:\ProjectForge\05-SCRIPTS\pf.ps1` |

**أدوات r19 ما زالت لازمة:**
`D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-14-31619\` و`tools-2026-11-13-31618-install\`.

```powershell
cd 'D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-31618-install'
node vm-exec.cjs WIN10-VM '<local-ps1>' 90000     # base64 إلزامي
node push-file.cjs WIN11-VM '<local>' 'C:/Users/Public/<name>'
node '..\tools-2026-11-14-31619\fetch-log.cjs' WIN11-VM 'C:/Users/Public/x.log'
```

**جديد r20 (أدوات فحص لا كتابة):**
`docs/audits/AUDIT-2026-11-16-1324.md` · `docs/خطة-إصلاح-…-AR.md` · `docs/أمر-فحص-AiRemote-P2.md` إن نُسخ.

---

## 0.4) الأجهزة (كما قاسها r19 — أعد القياس)

| الجهاز | الحالة r19 | النسخة r19 | ملاحظة |
|---|---|---|---|
| **TECNO-KL4** | online | 3.16.19 (109) | `serial 12927374CM001019` · 720×1600 |
| **Android-Emulator** | online | 3.16.19 (109) | Android 9 · 1600×900 |
| **DESKTOP-K81PJ9H** | online | 3.16.19 | مهمة مرتفعة · `AGENT_CA_CERT` لازم عند الإطلاق اليدوي (فخّ 76) |
| **WIN10-VM** | online | 3.16.19 | `DESKTOP-IFE3GNE` · **192.168.1.102** · elevated=True |
| **WIN11-VM** | online | 3.16.19 | `DESKTOP-P7Q6D6U` · **192.168.1.106** · Run key · elevated=False |
| **TAB16-USB** | online | 3.16.19 (109) | `GPSZ2025040701858` · AISHOT 1280×800 (فخّ 80 مغلق) |

---

## 0.5) إعدادات التطبيق المحفوظة (هي «الحالة» التي يجب ألّا تُفقد)

كما r19: `zai`/`glm-4.7-flash` · Telegram مفعّل · مهام مجدولة 0 · قواعد تنبيه 0 · 2FA معطّل · 3 مستخدمين · 6 أجهزة · المظهر نهاري على TECNO · الشريط العلوي بشكله · الشريط السفلي مخفي · البطاقات قابلة للطيّ · وضع التحكم «موافقة يدوية».

**r20 لا يغيّر أي إعداد.**

---

## 0.6) ما أُنجز في r20 — بندًا بندًا (فحص وتوثيق — صفر كود)

| # | البند | النتيجة |
|---|---|---|
| 1 | فحص ProjectForge P2 كامل (8 محاور / 60 بنداً) | **68.5/100 — C — يحتاج معالجة** · تقرير `docs/audits/AUDIT-2026-11-16-1324.md` |
| 2 | تصحيح فحص pf audit الآلي (52.7/D) | آلي أخطأ في ADR وPROJECT_STATE وremote و`.pem` وlinter |
| 3 | تشغيل 7 مجموعات اختبارات | كلها **PASSED** (registry · connection · authz · keyframe · safety · kdf · secrets) |
| 4 | typecheck | server + agent + dashboard **نظيف** |
| 5 | مسح تاريخ Git للأسرار | **لا سرّ حقيقي** في 913 التزاماً |
| 6 | JWT الحيّ | `main.js:106` → `crypto.randomBytes(64)` |
| 7 | خطة إصلاح W1–W3 | `docs/خطة-إصلاح-AiRemote-3.16.19-2026-11-16-AR.md` |
| 8 | ملف المالك | `docs/مطلوب-من-المالك-2026-11-16-AR.md` |
| 9 | أمر P2 معبّأ | `docs/audits/P2-أمر-فحص-AiRemote.md` + نسخة الجلسة |
| 10 | بند جديد مكتشف | **68+10** سجل بناء متتبع · cloudflared 52.8MB بلا LFS فعلي |

**لا التزامات جديدة في r20.** الوثائق أعلاه غير ملتزمة (`git status` يُظهرها untracked) — تُلتزم مع أول checkpoint بعد «ابدأ W1».

---

## 0.7) إعدادات الاختبار

| البند | القيمة |
|---|---|
| اختبارات سريعة (مسموحة الآن بلا إذن كتابة) | `node packages/server/test/registry-race.test.cjs` وغيرها من `*.test.cjs` التي لا تثبّت |
| تنفيذ حي (أندرويد) | `handoff\scripts\remote-exec.cjs` → **بأمر المالك فقط** |
| تنفيذ حي (ويندوز) | `vm-exec.cjs` (**base64 إلزامي**؛ فخّ 83 مهلة ~30ث) — **بأمر المالك** |
| نقل ملفات | `push-file.cjs` — فاصل ≥12ث (فخّ 84) — **بأمر المالك** |
| بوابة الإصدار | `check-version-consistency.cjs` · `release-manifest.js --verify` |
| بوابة الاختبار الكاملة | `node scripts/verify.js` → **لم يُعَد** (56/57) — الخطة تعيدها في W2 |
| pnpm audit | مسموح (قراءة) — المتوقع high ×2 |
| typecheck | مسموح (قد يكتب tsbuildinfo — مقبول) |

---

## 0.8) الفخاخ في r20

**78 · 79 · 80 ما زالت مغلقة بكود r19 — لا تُفتح.**  
**82–85 وما قبلهما (51–77) ما زالت تصدق.**

| # | الحالة | الخلاصة |
|---|---|---|
| 78 | **مُغلق بكود r19** | a11y «مربوطة» لا «مسجَّلة». بعد كل تثبيت أندرويد: أعد التمكين. |
| 79 | **مُغلق بكود r19** | طلب التقاط واحد لكل عملية. |
| 80 | **مُغلق بكود r19** | AISHOT 1280×800 لا مربّع. |
| 81 | مفتوح (خارج النطاق) | FileBridge — لا نلمسها. |
| 82 | قاعدة | تحديث الحزمة = إسقاط a11y. الترتيب: تثبيت ← إعدادات ← a11y ← التقاط ← إعادة تشغيل. |
| 83 | قاعدة | `vm-exec` على WIN11 يقطع ~30ث. الحل: مهمة مجدولة + قراءة ملف. |
| 84 | قاعدة | حدّ الدخول 5/دقيقة. ادفع بفاصل ≥12ث. |
| 85 | قاعدة | `Display.getRealMetrics()` لا `getDisplayMetrics()` في الخدمة. |
| 86 | **جديد r20 — قاعدة** | `pf audit` الآلي يخطئ في ADR/STATE/remote/`.pem`/linter في هذا المشروع. لا تنسخ نتيجته حرفياً. |
| 87 | **جديد r20 — قاعدة** | `git lfs` غير مثبّت رغم `.gitattributes` — لا تعتبر `cloudflared.exe` مؤشر LFS. |
| 88 | **جديد r20 — قاعدة** | `server.js` الحيّ ≠ `packages/server` TS. أي إصلاح في TS وحده لا يصل الحزمة المشحونة. |
| 89 | **جديد r20 — قاعدة** | `pnpm` في CI = 9.15.9 وفي الجذر = ^11.5.1. لا تخلطهما. |
| 90 | **جديد r20 — قاعدة** | كتابة في `docs/` من الفحص (audits/خطة/r20) تبقى untracked حتى أول checkpoint بعد إذن المالك. |

---

## 1) ما أُغلق ولا يُعاد فتحه

| البند | الدليل |
|---|---|
| كل مغلق في r16–r19 | `handoff\reports\` |
| **3.16.19 مبني وموقَّع ومثبَّت على 6/6 (زمن r19)** | r19 §0.1 — أعد القياس إن أردت الاعتماد اليوم |
| **فخّ 80** | AISHOT 1280×800 على TAB16 |
| **فخّ 79** | التقاط تلقائي بعد الإقلاع |
| **فخّ 78** | المعالج يميّز «مربوطة» |
| **7 مجموعات اختبارات r20** | مخرَج الفحص 2026-11-16 |
| **لا أسرار حقيقية في الشجرة أو التاريخ** | `git grep` + `git log -S` |

---

## 2) الفخاخ المثبتة — **90**

1–77 كما في r17/r18.  
78–80 مغلقة بكود r19 · 81–85 قواعد r18/r19.  
**86–90 جديدة في r20** (قواعد فحص وبنية — انظر §0.8).

---

## 3) الأدوات

### 3.1) في المستودع
`verify.js` · `check-version-consistency.cjs` · `release-manifest.js` · `copy-dashboard` · `scripts/run-electron-builder.cjs` (**يفشل مع مسافة في المسار — استخدم `npx electron-builder`**).

### 3.2) مجلدات الجولات (خارج مساحة الحساب)

```
D:\autoclaw projects-new\AiRemote-handoff\scripts\
D:\autoclaw projects-new\AiRemote-handoff\reports\
D:\autoclaw projects-new\AiRemote-handoff\docs\
D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-13-31618-install\
D:\autoclaw projects-new\AiRemote-handoff\tools-2026-11-14-31619\
D:\autoclaw projects-new\AiRemote-handoff\shots-2026-11-14-31619\
D:\ProjectForge\05-SCRIPTS\
```

### 3.3) بناء أندرويد (متسلسلة مجرَّبة — **بأمر المالك فقط**)
```powershell
$b='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME="$b\jdk"; $env:ANDROID_HOME="$b\sdk"; $env:ANDROID_SDK_ROOT="$b\sdk"
cd 'D:\autoclaw projects-new\AiRemote\packages\android-agent'
& "$b\gradle\bin\gradle.bat" assembleRelease --console=plain
# zipalign -f 4 → apksigner sign --ks …\airemote-release.jks --ks-key-alias airemote → apksigner verify -v
```
**كلمة المرور:** من `…\AiRemote\signing\keystore-password.txt` (سطر واحد) — لا تُطبع.

### 3.4) بناء ويندوز
كما r19 — `npx electron-builder` لا السكربت الذي يفشل بالمسافة.

---

## 4) ما بقي — **معلّق بانتظار المالك**

هذه قائمة r20. التفصيل التنفيذي في خطة الإصلاح، وما تحتاجه منك في ملف المالك.

| # | البند | الشدة | أين في الخطة |
|---|---|---|---|
| 1 | **لا remote** — 913 التزاماً بلا نسخة ثانية | حاجز | W1-1 |
| 2 | **لا `.pf/state.json`** | حاجز | W1-1 (adopt) |
| 3 | **لا HANDOFF-*.md** | عيب | W1-3 |
| 4 | **ثغرات HIGH** fastify + pnpm | حاجز | W1-2 |
| 5 | **لا SECURITY.md** | عيب | W1-4 |
| 6 | **سيرفران** TS 3.14.0 ≠ حيّ 3.16.19 | حاجز معماري | W1-3د ADR |
| 7 | README يكذب (3.7.0 · Docker coming soon) | عيب | W2-1 |
| 8 | لا linter · لا editorconfig · لا أمر test | عيب | W2-3, W2-4 |
| 9 | مسارات `C:\Users\...` في الكود الحيّ | عيب | W2-5 |
| 10 | cloudflared 52.8MB بلا LFS فعلي | عيب | W2-9 |
| 11 | 68+10 سجل بناء متتبع | عيب | W3-2 |
| 12 | CHANGELOG يتوقف عند 3.16.0 | عيب | W1-3 / W2-10 |
| 13 | لا RUNBOOK · لا AGENTS · لا CONTRIBUTING | عيب | W2-7, W2-8 |
| 14 | `verify.js` مؤجل من r19 | عيب | بوابة W2 |
| 15 | `/health` UNREACHABLE لحظة فحص r20 | غير مؤكد | أعد القياس — لا تصلح بينما الإنتاج قد يكون موقوفاً بلا سبب منك |

**قرارات تحتاجك الآن (لا تُؤجَّل):** ملف المالك D1–D8 + checklist.

---

## 5) أوامر جاهزة (لا تُشغَّل بلا إذن)

```powershell
# ── قراءة (مسموحة الآن) ──────────────────────────────
cd 'D:\autoclaw projects-new\AiRemote'
git branch --show-current
git rev-parse --short HEAD
git remote -v
Get-Content VERSION
node scripts/check-version-consistency.cjs --allow-missing-server
pnpm audit --prod
pnpm --filter @airemote/server typecheck
node packages/server/test/registry-race.test.cjs
curl.exe -k -s https://127.0.0.1:3001/health

# ── W1-1 (بعد «ابدأ W1») ─────────────────────────────
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 adopt  -Path "D:\autoclaw projects-new\AiRemote"
.\pf.ps1 backup -Path "D:\autoclaw projects-new\AiRemote"
# ربط remote حسب D1

# ── إسناف (نهاية الجلسة) ─────────────────────────────
.\pf.ps1 checkpoint -Path "D:\autoclaw projects-new\AiRemote" -Message "..."
.\pf.ps1 handoff    -Path "D:\autoclaw projects-new\AiRemote"
```

---

## 6) بروتوكول التنفيذ

1. اقرأ هذا الملف + الفحص + الخطة + ملف المالك.
2. §0.1.1 ثم **قف**.
3. المالك يملأ checklist ويقول «ابدأ W1».
4. W1 بندًا بندًا — كل بند: تنفيذ + توثيق + اختبار + checkpoint.
5. بوابة W1 (10 حالات في الخطة §6.1) — فشل أي حالة = لا W2.
6. W2 حتى 3.17.0 — بناء + تثبيت إن أذن المالك + بوابة 14 حالة.
7. W3 دمج main بعد مراجعة فرق كامل.
8. عند كل توقف: checkpoint + handoff + تحديث rNN.

**ممنوع أثناء التنفيذ كذلك:** ميزة جديدة · كتابة سرّ · حذف `server.js` · لمس فخاخ 78–80 كإصلاح · دمج main في W1 · ترقية fastify 5 في W1.

---

## 7) التقارير المسلَّمة (r20)

| الملف | ما هو |
|---|---|
| `docs/audits/AUDIT-2026-11-16-1324.md` | تقرير الفحص 68.5/C |
| `docs/audits/AUDIT-2026-11-16-1309.md` | فحص pf audit الآلي (قبل التصحيح — لا تعتمد عليه وحده) |
| `docs/خطة-إصلاح-AiRemote-3.16.19-2026-11-16-AR.md` | W1–W3 كاملة بالتوثيق والاختبار |
| `docs/أمر-تنفيذ-الخطة-الكاملة.md` | أمر التنفيذ الكامل للحساب الجديد |
| `docs/مطلوب-من-المالك-2026-11-16-AR.md` | S1–S8 + D1–D8 + أجهزة |
| `docs/audits/P2-أمر-فحص-AiRemote.md` | أمر P2 معبّأ لإعادة الفحص |
| هذا الملف | نقطة الاستئناف r20 |

---

## 8) نقطة التوقّف الدقيقة

**المشروع حيث وقف r19:** 3.16.19 مبني وموقَّع ومثبَّت (6/6 وقتها) · فخاخ 78–80 مغلقة · لا بند تنفيذ مفتوح من r19.

**ما أضافه r20:** فحص يقول «المنتج يعمل لكنه غير احترافي التسليم» + خطة لجعله كذلك + قائمة ما يلزم منك.

**الخطوة التالية الحقيقية الوحيدة:**

> املأ `docs/مطلوب-من-المالك-2026-11-16-AR.md` §8 checklist، ثم قل:
> **«تحقّق ثم قف»** (أعد قياس `/health` والأسطول ولا تكتب)  
> أو **«ابدأ W1 بالافتراضيات»** (Gitea محلي، لا GitHub، لا تثبيت أسطول قبل إذن)  
> أو **«ابدأ W1-1 فقط»**.

**إن قلت غير ذلك:** أنتظر.

---

*نهاية r20 — 2026-11-16 · الفحص 68.5/C · الخطة جاهزة · التوقّف محترم.*
