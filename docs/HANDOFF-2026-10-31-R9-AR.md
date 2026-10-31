# حزمة تسليم AiRemote — نهاية جلسة R8/R9 (2026-10-31)

**المستودع:** `D:\autoclaw projects-new\AiRemote` · **الفرع:** `checkpoint/3.8.1-2026-10-26`
**آخر التزام:** `0e3164e chore(tools): keep the lab harness inside the repo for the next account` · **الشجرة:** نظيفة · **Git محلي فقط** (لا remote، لا push)

---

## 1) حالة اللحظة (مقيسة عند التسليم)

| المكوّن | القيمة |
|---|---|
| السيرفر المثبَّت | **3.8.41** على `https://127.0.0.1:3001` · Electron 44.3.0 · fastify 5 · `node:sqlite` |
| اللوحة | 3.8.41 (مدمجة) |
| وكيل ويندوز | **3.8.41** على WIN10-VM وWIN11-VM |
| وكيل أندرويد | **3.8.36 (vc25)** على TECNO-KL4 وAndroid-Emulator |
| مخطط القاعدة | **v2** (لا هجرة في هذه الجلسة) |
| البوابات | بطارية **32/32** · ألوان **0** · تباين **22/22** · `tsc` 0 |
| البيان | `releases/manifest.json` = 3.8.41 · **5 حزم** · `--verify` = signature OK · all artifacts match |
| التحديث | `/api/desktop/update/check` → `current=latest=3.8.41 · verified=true` |
| تمرين الرجوع | 3.8.41 → 3.8.40 في **36s** ثم عودة في **35s** (RUNBOOK §9) |

---

## 2) ما أُنجز في هذه الجلسة (سبع شرائح)

| الإصدار | الشريحة | الالتزام | الدليل |
|---|---|---|---|
| 3.8.36 | مزامنة الحافظة أحادية الاتجاه + مفتاح عكسي (ويندوز + أندرويد دفع فقط) | `246e751` · `dd573a6` · `e2289ab` | `outputs/verify-2026-10-30/r8-clipboard/` |
| 3.8.37 | الليزر والتعليقات بين المشاهدين | `86d2ec3` | `outputs/verify-2026-10-31/r8-annotations/` |
| 3.8.38 | علامة المشاهد + سجل جلسات قابل للبحث والتصدير | `5e73789` | `outputs/verify-2026-10-31/r8-sessions/` |
| 3.8.39 | الاختصارات الموثّقة + حدود أندرويد + قسمان في المساعدة | `f50791b` | `outputs/verify-2026-10-31/r8-docs/` |
| — | R9.1 قياس سقف السعة (أداة) | `3013b2a` | `outputs/verify-2026-10-31/r9-load/` |
| 3.8.40 | تثبيت JWT HS256 + مراجعة أمنية داخلية | `2f9b849` | `outputs/verify-2026-10-31/r9-security/` |
| 3.8.41 | حجب الأوامر المدمِّرة (F2) في السيرفر والوكيل | `907bd8a` | `outputs/verify-2026-10-31/r9-f2/` |
| — | R9.3 حزم الإطلاق + الدلائل + تمرين الرجوع | `c6d3c75` · `22fbc12` · `0e3164e` | `outputs/verify-2026-10-31/r9-release/` |

**دلائل R8/R9 الكاملة:** `docs/RELEASE-NOTES-3.8.41-AR.md`.

---

## 3) الأجهزة (كما هي الآن)

| الاسم | ID | ملاحظة |
|---|---|---|
| WIN10-VM | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | 3.8.41 · 192.168.0.176 |
| WIN11-VM | `d147684b-2451-4418-a628-86f11aa66a4e` | 3.8.41 · 192.168.0.175 |
| TECNO-KL4 | `07f8ae91-5b64-41d9-97df-ce649772b0d3` | 3.8.36 vc25 · adb `12927374CM001019` · **قد يطلب رمز القفل** |
| Android-Emulator | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` | 3.8.36 vc25 · `emulator-5554` · Android 9 |

الأربعة **online** عند التسليم. TECNO يعود online بعد إعادة تشغيل الخدمة لكن شاشته قد تبقى مقفلة.

---

## 4) البيئة والأدوات

| العنصر | المسار |
|---|---|
| أدوات البناء | `D:\autoclaw projects\offline-build-tools\android-toolchain` (`jdk` · `sdk\build-tools\34.0.0` · `sdk\platform-tools\adb.exe` · `gradle` · `android-init.gradle`) |
| Electron 44 | `packages\server-desktop\node_modules\electron\dist` |
| مفتاح الإصدار | `C:\Users\admin\AppData\Roaming\AiRemote\signing\airemote-release.jks` (alias `airemote`) — **لا تُطبع كلمته** |
| بيانات المختبر | `…\AiRemote\lab-probe.json` · `…\AiRemote\lab-credentials.txt` (تُقرأ ولا تُطبع) |
| بيانات السيرفر | `C:\Users\admin\AppData\Roaming\AiRemote-Server\{airemote.db, tls, backups, updates, secret.key}` |
| التثبيت | `C:\Users\admin\AppData\Local\Programs\AiRemote Server\` |
| **أدوات المختبر** | `tools\lab\` داخل المستودع (+`README-AR.md` يشرح كل أداة والفخاخ) |
| vmrun | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` (استعادة الوكيل عند سقوطه) |

### أوامر أساسية

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
node scripts/scan-ui-colors.cjs      # 0
node scripts/check-contrast.cjs      # 22/22
node scripts/verify.js               # 32/32
node scripts/load-test.cjs --quick   # أداة السعة
node scripts/export-help.cjs         # يعيد توليد docs/USER-GUIDE-AR.md
node tools\lab\devs.cjs              # حالة الأجهزة
```

---

## 5) إعدادات الاختبار (كيف تُعيد أي قياس)

1. **منح التحكم على ويندوز:** ادفع `tools\lab\set-control-pw.ps1` + ملف كلمة مرور إلى `C:\Users\admin\cp.txt` وشغّله منفصلاً، ثم أعد إقلاع الوكيل عبر **vmrun** (لا `Start-Process`). بعد القياس شغّل `tools\lab\restore-consent.ps1`.
2. **مزامنة الحافظة:** `node tools\lab\measure-clipboard.cjs WIN11-VM out.json` (يحتاج `cp.txt`).
3. **أندرويد:** بعد كل تثبيت APK أعد منح الالتقاط من «معالج التهيئة»؛ ثم `node tools\lab\measure-android.cjs out.json emulator-5554 Android-Emulator`.
4. **الواجهة:** `node tools\lab\ui-annotate-check.cjs` (وأخواتها) — تشغّل Chrome headless وتلتقط اللقطات.
5. **السعة:** `node scripts\load-test.cjs` (سيرفر مؤقت، قاعدة `%TEMP%`).
6. **الرجوع:** `taskkill /F /IM "AiRemote Server.exe"` ثم مثبّت الإصدار الأقدم من `releases\archive\server-windows\` ثم تشغيل التطبيق.

---

## 6) الفخاخ المؤكدة (14 من R7 + 10 جديدة)

1. `taskkill` بلا `/F` لا يُنهي السيرفر.
2. `$env:APPDATA` قد يكون فارغاً ⇒ استخدم المسار المطلق.
3. أدوات الملفات مقيّدة بمجلد العمل ⇒ عدّل المستودع بسكربت Node.
4. PowerShell 5.1 يقرأ UTF-8 كـANSI.
5. أسطر الملفات غير موحّدة (LF/CRLF) — **لا تفترض**.
6. `copy-dashboard` يغيّر `static` المتتبَّع (جزء من التزام الإصدار).
7. بعد تعديل `server.js`/`lib/*` أعد `bundle.js` قبل `electron-builder`.
8. تحديثات desktop تحتاج `electron.exe` مع `ELECTRON_RUN_AS_NODE=1`.
9. **مسار تنفيذ الأوامر = PowerShell مُغلَّف بـ`-EncodedCommand`** ⇒ أي حجب يجب أن يكون في السيرفر قبل التغليف.
10. **علامات الاقتباس المزدوجة تُحذف** في exec ⇒ استخدم `'...'`.
11. **`Start-Process` داخل سكربت منفصل لا يُقلع وكيل ويندوز** ⇒ vmrun.
12. **سكربتات التعديل:** ارفض الكتابة إذا انكمش الملف (قصّ `main.js` إلى 146 بايت أسقط جهازين).
13. **`app.asar`:** تحقق من حجم `main.js` بعد كل بناء وكيل.
14. **تذاكر WS 30/دقيقة/IP** = سقف المشاهدين الفعلي.
15. **أندرويد:** موافقة MediaProjection تُلغى بعد كل تثبيت/إعادة تشغيل.
16. **TECNO** قد يُقفل ويطلب رمزاً لا نملكه ⇒ القياس الآلي على المحاكي.
17. **شريط الإشعارات في أندرويد** قد يسرق التركيز ⇒ `cmd statusbar collapse` قبل القياس.

---

## 7) ما تبقّى (نقطة الاستئناف)

| البند | الحالة | ملاحظة |
|---|---|---|
| **الترحيل التجريبي 5–10 مستخدمين** | ⛔ لم يبدأ | يحتاج أشخاصاً/بيئة خارج المختبر |
| **`trustProxy`** خلف وكيل عكسي | ⛔ قرار نشر | F4 في المراجعة الأمنية |
| **`npm audit`** | ⛔ | يحتاج شبكة/مرآة |
| **قفل الإدخال المحلي** | ⛔ قرار هندسي | `BlockInput` يحجب المُحقون أيضاً |
| **حافظة أندرويد (سحب)** | ⛔ قيد نظام | دفع فقط حتى تُبنى واجهة/IME |
| **مكافئات أندرويد** (SAF/إشعارات/دردشة عائمة) | ⛔ | تحتاج جهازاً مفتوحاً |

**نقطة الاستئناف الدقيقة:** المنتج **3.8.41 جاهز للإطلاق المحلي**؛ التالي هو **R9.4: تجهيز الترحيل التجريبي** (قائمة مستخدمين، سيناريوهات، قوالب رسائل، معايير نجاح) ثم الإطلاق.

---

## 8) تحقق الاستئناف (ابدأ به في الحساب الجديد)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -3; git status --short
node scripts/scan-ui-colors.cjs      # 0
node scripts/check-contrast.cjs      # 22/22
node scripts/verify.js               # 32/32
curl.exe -sk https://127.0.0.1:3001/health   # 3.8.41
curl.exe -sk https://127.0.0.1:3001/ready    # ready:true
node tools\lab\devs.cjs              # 4 online
```

إن ظهر فرق في الإصدار أو سقط جهاز، اقرأ §6 قبل أي تعديل.

---

## 9) الوثائق التي يجب قراءتها بالترتيب

1. هذا الملف.
2. `PROJECT_STATE.md` §0.1 (أعلى الملف).
3. `docs/RELEASE-NOTES-3.8.41-AR.md` — ما تغيّر ومن أين.
4. `docs/ADMIN-GUIDE-AR.md` — الحدود والأدوار وقائمة التحقق.
5. `docs/SECURITY-REVIEW-AR.md` — الحالة الأمنية والعيوب المفتوحة (F3/F4).
6. `docs/LOAD-TEST-AR.md` — السعة وكيف تُعاد.
7. `docs/RUNBOOK-AR.md` — التمارين والأرقام.
8. `tools/lab/README-AR.md` — الأدوات والفخاخ.
9. `outputs/verify-2026-10-31/r9-release/REPORT-AR.md` — آخر تقرير.
