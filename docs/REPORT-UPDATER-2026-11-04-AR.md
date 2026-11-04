# تقرير: حلقة المحدّث + حالة بقية الإصلاحات — 2026-11-04

## 1) العيب: المحدّث ينسخ ~223MB كل ساعة ولا يحذف أبدًا

### ما وجدته في الكود

| الموضع | السلوك قبل الإصلاح |
|---|---|
| `lib/updater.js` → `stage()` | `fs.copyFileSync(...)` **بلا أي شرط** في كل محاولة تطبيق، ثم لا حذف لأي نسخة قديمة |
| `lib/updater.js` → `ensureHelperBinary()` | ينسخ `process.execPath` — و`AiRemote Server.exe` حجمه **235MB (≈223MiB)** — إلى `updates/updater.exe` |
| مثبّت NSIS | كل `Setup.exe /S` يستخرج حمولته إلى `%TEMP%\nsXXXX.tmp`؛ التثبيت المقاطَع يترك المجلد (~223MB) |
| `lib/updater.js` | **لا سجل محاولات، لا قفل، لا تنظيف** — فلا شيء يمنع تكرار المحاولة كل ساعة |
| `server.js` | نقطة `/api/desktop/update/apply` تُنفّذ النسخ في كل نداء، بلا تبريد |

**الحساب الذي يطابق شكواك:** `~23 مرة يوميًا` = كل ساعة تقريبًا. ومع كل محاولة: نسخة حزمة في `updates\staged` + نسخة تنفيذي 223MB + مجلد NSIS مؤقت. ولا حذف لأي منها.

**قياس مؤكِّد على هذا الجهاز:** `AiRemote Server.exe` = **235 MB** بالضبط، وهو الملف الذي يُنسخ كـ`updater.exe`. الرقم الذي رأيته (223) هو نفسه بوحدة MiB.

### ما أصلحته

1. **نسخ واحد فقط:** `stage()` يعيد استخدام الحزمة إن طابق حجمها، ويحذف أي نسخة أخرى قبل الكتابة، ويكتب عبر `*.part` ثم `rename` (لا ملفات ناقصة).
2. **سجل محاولات:** `updates/attempts.json` يسجّل (الإصدار + بصمة SHA256 + الوقت). إعادة المحاولة داخل **6 ساعات** تُرفض بـ`409 update_throttled`، ولا تُقبل إلا بـ`force:true` صريح. أي مؤقّت خارجي كان يكرّر المحاولة كل ساعة **سيتوقف**.
3. **قفل أحادي:** `updates/apply.lock` (TTL 15 دقيقة) يمنع تطبيقين متزامنين أو تكدّس النسخ عند تعطّل المساعد.
4. **تنظيف حقيقي:**
   - `updates/staged` يُقلَّم إلى حزمة واحدة.
   - مجلدات `%TEMP%\ns*.tmp` بحجم ≥20MB وأقدم من ساعتين تُحذف.
   - التنظيف يعمل **عند الإقلاع** وعند كل تطبيق.
5. **اختبار انحدار:** `test/e2e-updater-loop.test.cjs` — 14 تحقّقًا: نسخة واحدة، إعادة استخدام، تقليم، تبريد، انتهاء التبريد، القفل، ومنع التزامن، وحذف `ns*.tmp`.

### الأدلة

```
PASS: staging writes exactly one package
PASS: a second identical stage is reused, not re-copied
PASS: staging a new package leaves a single file behind
PASS: a repeat inside the cooldown is reported
PASS: an old attempt falls outside the cooldown
PASS: the second lock is refused while the first is held
PASS: cleanup removed the stale installer temp folder
...
ALL UPDATER LOOP CHECKS PASSED
```

وأُضيف الاختبار إلى البطارية: **45/45** (كانت 44/44).

```
4aedf04 fix(updater): stop the 223MB copy loop with an attempt ledger, a single-flight lock and cleanup
```

### نظّف المخلّفات الموجودة الآن (على جهازك)

```powershell
# كم تحتل فعلاً؟
(Get-ChildItem $env:TEMP -Directory -Filter 'ns*.tmp' |
  ForEach-Object { (Get-ChildItem $_.FullName -Recurse -File | Measure-Object Length -Sum).Sum } |
  Measure-Object -Sum).Sum / 1GB

# 1) النسخ التي أبقتها المحاولات
Remove-Item "$env:APPDATA\AiRemote-Server\updates\staged\*" -Force -ErrorAction SilentlyContinue

# 2) مجلدات مثبّت NSIS المقاطَع (أقدم من ساعتين)
Get-ChildItem $env:TEMP -Directory -Filter 'ns*.tmp' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddHours(-2) } |
  Remove-Item -Recurse -Force
```

**لكي يتوقف العيب عندك فعليًا** يجب بناء السيرفر وتثبيته (الإصلاح في `lib/updater.js` و`server.js`):

```powershell
cd packages\server-desktop; pnpm run build:win:nodownload
# أوقف AiRemote Server ⇒ Setup.exe /S حتى exit=0 ⇒ شغّل الـexe ⇒ تحقق /health
```

---

## 2) بقية المشاكل — الحالة الآن

| # | المشكلة | الحالة | الدليل |
|---|---|---|---|
| 1 | جدار المراقبة يشغّل بثًّا تلقائيًا | **مُصلَح** | `f4f9336` — بوّابة `autoStart` + عدم حفظ `running` |
| 2 | لا أدوات تشغيل/إيقاف/تكبير في الجدار | **مُستعادة** | نفس الالتزام (زر لكل مربع + تكبير + Escape) |
| 3 | 3 أجهزة في الصف | **مُصلَح** | `grid-cols` بسقف 3 في كل الأحجام |
| 4 | تجمّد قائمة التطبيق | **مُصلَح** | `d24dd07` — `no-drag` للغطاء والقوائم + Escape |
| 5 | قائمة «المزيد» غير احترافية | **أُعيد بناؤها** | `f4f9336` — أقسام وفواصل وصفوف موحّدة |
| 6 | استهلاك المعالج 50–70% | **مُصلَح ومقيس** | `3840f62`, `abebffa` — WIN10 33%→**12.7%**، WIN11 44.6%→**22.4%** |
| 7 | تسريب مؤقّت الالتقاط | **مُصلَح** | `1a43efa` |
| 8 | **حلقة المحدّث** | **مُصلَح** | `4aedf04` + اختبار 14 تحقّقًا |
| 9 | كلمة سر وكيل↔وكيل | **لم تُنفَّذ** | التصميم في `docs/REPORT-NOTES-2026-11-04-AR.md` |
| 10 | TC-001/002 (الزر الأيمن) | **محجوب** | نافذة كلمة سر التحكم على WIN10 وWIN11 |
| 11 | نشر اللوحة على السيرفر المثبَّت | **لم يُنفَّذ** | يحتاج بناء وتثبيت السيرفر |

---

## 3) ما أصرّح به بصراحة

- **حلقة المحدّث لم أُعِد إنتاجها على هذا الجهاز** لسبب بسيط: مجلد `updates` هنا فارغ ولا توجد مهمة مجدولة تستدعي التطبيق. لذلك بنيت الإصلاح على **شيفرة المنتج نفسها** (وهي التي تنسخ ولا تحذف) وأضفت اختبارًا يثبت أن التكرار والنسخ المتراكم صارا مستحيلين بنيويًا.
- **لم أثبّت السيرفر الجديد** على جهازك: التثبيت يوقف الخدمة، وهو قرارك.
- الأرقام الثلاثة الباقية (TC-001/002، كلمة سر وكيل↔وكيل، النشر) تحتاج خطوة منك أو إذنًا صريحًا.
