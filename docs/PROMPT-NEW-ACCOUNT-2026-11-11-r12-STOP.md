# أمر استئناف الحساب الجديد — 2026-11-11 — r12

> **هذا الملف هو الأمر الوحيد الذي يُلصق في الحساب الجديد.**
> يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-11-3.16.8-FULL-AR-r11.md` وكل ما قبله **من حيث الترتيب الزمني**، لكنه **لا يلغي محتوى r11** — بل يوجّهك لقراءته كمرجع AiRemote الكامل.
> كتبه المساعد في الجلسة التي أنهت FileBridge وأنتج حزمتها، بعد اكتمال AiRemote 3.16.8.

---

## ⛔ أمر التوقّف — اقرأ هذا أولًا واحترمه حرفيًا

**قف هنا. لا تنفّذ أي إجراء — لا بناء، لا تثبيت، لا تعديل ملف، لا تشغيل سكربت يكتب، لا `git commit`، لا `pnpm install` — حتى يقول المالك صراحةً: «ابدأ» أو «نفّذ البند كذا» أو «اكمل الصفحة رقم كذا».**

- ترخيصك الحالي: **قراءة وتحقّق فقط**.
  المسموح: قراءة الملفات، `git log` / `git status`، `curl /health`، تشغيل بوابات القراءة، فتح التقارير.
  الممنوع: أي كتابة داخل `D:\autoclaw projects-new\AiRemote` أو `D:\autoclaw projects-new\FileBridge` أو `offline-build-tools`.
- كل ما في هذه الوثيقة **منجَز ومُثبَّت**. لا شيء قيد التنفيذ. لا بناء جارٍ. لا تثبيت معلّق.
- إن وجدت رقمًا مختلفًا عمّا هنا: **لا تُصلح شيئًا**. أبلِغ المالك بالفرق وانتظر.
- أي تعديل قبل الإذن = خرق، حتى لو بدا إصلاحًا واضحًا أو سطرًا واحدًا.
- المالك لا يريد حلقات موافقة **بعد** إذن التنفيذ؛ قبل الإذن: صمت تام.

**كلمات فكّ التوقّف الوحيدة (من المالك فقط):** «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ».

---

## 1) من أنت وماذا تفعل أول 10 دقائق

أنت مساعد المالك ibrahin sidawi في مشروع **AiRemote** (منصة تحكّم عن بعد: سيرفر ويندوز + لوحة + وكلاء أندرويد/ويندوز) ومشروع **FileBridge** (نقل ملفات واي فاي).

**مهمتك الأولى فقط:**

1. اقرأ هذا الملف كاملًا.
2. اقرأ `D:\autoclaw projects-new\AiRemote\docs\PROMPT-NEW-ACCOUNT-2026-11-11-3.16.8-FULL-AR-r11.md` كاملًا (مرجع AiRemote التفصيلي — لا تُكرر تحليله).
3. تحقّق الأرقام في §3 أدناه بالأوامر المكتوبة.
4. ثم **قف** وقل للمالك: «قرأت التسليم، الأرقام مطابقة/مختلفة، أنتظر أمرك».

لا تعرض خطة. لا تعرض بدائل. لا تبدأ «الصفحة 9» ولا أي بند متبقٍّ.

---

## 2) خريطة المشاريع والمسارات (لا تخلطها)

| المشروع | المسار | الحالة عند التسليم |
|---|---|---|
| **AiRemote** (الأساسي) | `D:\autoclaw projects-new\AiRemote` | **3.16.8** مثبَّتة · صفحات 1–8 مكتملة · التالي 9 التدقيق (بانتظار أمر) |
| **FileBridge** | `D:\autoclaw projects-new\FileBridge` | مكتمل البناء · APK + setup.exe جاهزان · لم يُختبر على جهازين حقيقيين · **نُقل من مساحة العمل في 2026-11-11** |
| أدوات البناء | `D:\autoclaw projects\offline-build-tools` | **ممنوع التعديل** — قراءة واستخدام فقط |
| مرآة كود AiRemote للقراءة | `mirror/` في مساحة العمل (نسخة قديمة جزئيًا) | لا تعتمدها كمصدر حيّ؛ المصدر `D:\autoclaw projects-new\AiRemote` |
| VM ويندوز 11 | `E:\VMs\Win11_Custom_2026-09-30` | VMware · قرص 60GB · لقطة «Snapshot 1» |
| VM ويندوز 10 | `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` | |

**قاعدة:** التقارير العربية في جذر مساحة العمل (`تقرير-*.md`) هي مخرجات جلسات التدقيق، ليست كودًا.

---

## 3) AiRemote — الحالة المقيسة (انسخها من r11 وتحقّق)

المرجع الكامل: `docs/PROMPT-NEW-ACCOUNT-2026-11-11-3.16.8-FULL-AR-r11.md`

| البند | القيمة |
|---|---|
| الفرع | `feat/screen-unify-3.13.0` |
| `VERSION` | **3.16.8** |
| versionCode أندرويد | **98** |
| السيرفر | **3001** TLS · `/health` = `3.16.8` |
| معاينة Vite | **5000** (بروكسي إلى 3001) |
| البوابة | **55/56** — الفشل الوحيد `e2e: sessions export` **بيئي** (better-sqlite3 ABI) وليس عيبًا |
| الأسطول | 5 أجهزة · 1 متصل عادة (Android-Emulator) |
| المستخدمون | 3 أدمن · 2FA معطّل |
| المهام / قواعد التنبيه | 0 / 0 |
| AI | `zai` / `glm-4.7-flash` |
| Telegram | مفعّل · محادثة `1029428155` |

### أول 10 دقائق — أوامر التحقق ثم قف

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git rev-parse --short HEAD
git branch --show-current
Get-Content VERSION
curl.exe -k -s https://127.0.0.1:3001/health
node scripts/check-version-consistency.cjs
node scripts/release-manifest.js --verify
# لا تشغّل verify.js إن لم يأمر المالك — قد يكتب مخرجات
```

**إن اختلف رقم:** أبلِغ ولا تصلح.

### ما أُنجز في AiRemote (لا يُعاد فتحه)

- صفحات 1–8 مكتملة: غرفة العمليات · الأجهزة · مساحة الجهاز · الجلسات · الإعدادات · المستخدمون · العارض · التنبيهات.
- أمن 3.16.7: حجب token عن غير الأدمن (3 أسطح) · منع «عرض فقط» من تسجيل/دقة · حارس آخر أدمن · بيان موقّع.
- أندرويد: صلاحية «كل الملفات» + APK 3.16.8 (code 98).
- P0 وP1 من r9 مغلقة.

### المتبقّي من خطة AiRemote (بانتظار أمر المالك — لا تبدأه)

| # | الصفحة/البند |
|---|---|
| 9 | سجل التدقيق |
| 10 | المساعد |
| 11 | المساعدة |
| 12 | صفحة الملفات `/files/:id` كمسار مستقل |
| 13 | الدخول |
| 14 | التهيئة |
| 15 | المعرض (تطوير فقط) |

### آلية العمل بعد فكّ التوقّف (من r11 — التزم بها حين يأمر المالك)

1. صفحة بصفحة بالترتيب أعلاه.
2. معاينة حيّة إلزامية على `http://localhost:5000`. تعديلات الخادم لا تظهر حتى البناء والتثبيت.
3. تعديل واحد = التزام واحد برسالة إنجليزية تشرح السبب.
4. تقرير عربي موثّق بعد كل صفحة.
5. البناء عند الأمر فقط.
6. لا تسأل «هل أنفّذ؟» في النطاق القابل للعكس بعد الإذن — نفّذ ووثّق.

### فخاخ AiRemote (ملخّص — التفصيل في r11 §2)

1. السيرفر المثبَّت يخدم `app.asar` من `server-desktop` لا `packages/server` (TS).
2. `better-sqlite3` يتبع آخر عملية: Node للاختبارات · Electron للحزمة. فشل `sessions export` بعد الحزمة **ليس عيبًا**.
3. `versionCode` يزيد يدويًا (98).
4. `apksigner` يحتاج `JAVA_HOME` + ملفّي كلمة مرور منفصلين.
5. `MediaProjection` يسقط بإعادة تثبيت APK.
6. `vmrun runProgramInGuest` لا يعيد stdout — اكتب سجلًا في الضيف.
7. عربية PowerShell 5.1: لا `Set-Content` لملف عربي؛ اقرأ بـ`read`/`rg` لا `Get-Content`.
8. Gradle في الخلفية لا متزامن.
9. الحزمة تعيد كتابة `packages/server-desktop/static` (متعرّف في git).
10. `settings` تحمل نسختين للمفاتيح (`aiConfigs` و`ai_config`) — لا تحذف إحداهما.
11. `/api/auth/login` محدود 5/دقيقة.
12. مسار العارض `wss://…/screen?ticket=…` لا `/ws`.
13. أندرويد 13+: `MANAGE_EXTERNAL_STORAGE` وحده يكفي، لا `READ_EXTERNAL_STORAGE`.

### أسرار (لا تُطبع ولا تُكتب في التزام)

| ما | أين |
|---|---|
| كلمة مرور اللوحة | عند المالك فقط |
| قاعدة البيانات | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` (قراءة فقط · `node:sqlite`) |
| مفاتيح التوقيع | `C:\Users\admin\AppData\Roaming\AiRemote\signing\airemote-release.jks` + `secrets\keystore-password.txt` |
| مفتاح AI / توكن Telegram | في قاعدة السيرفر `settings` — لا يُطبع |
| بيانات ضيوف VMware | `C:\Users\admin\AppData\Roaming\AiRemote\lab-credentials.txt` |

---

## 4) FileBridge — مشروع ثانٍ مكتمل البناء (لا تلمسه بلا أمر)

مدير ملفات ونقل آمن بين ويندوز وأندرويد عبر واي فاي، **بلا سحابة**.

| البند | القيمة |
|---|---|
| المسار | `D:\autoclaw projects-new\FileBridge` (نُقل من مساحة عمل AutoClaw — هذا هو المسار الرسمي) |
| البروتوكول | FBX/1 · TCP **47824** · UDP اكتشاف **47823** |
| التشفير | ECDH P-256 + ECDSA P-256 + AES-256-GCM + HKDF-SHA256 + SAS ستة أرقام + TOFU |
| ويندوز | Electron 44 + NSIS → `D:\autoclaw projects-new\FileBridge\dist\FileBridge-Setup-1.0.0.exe` (**111,413,392 بايت** · SHA-256 `315ef8f74fa9ea2c99470d0232706ffd836f4a6aa6a7d12ecfce83f36f69322c`) |
| أندرويد | Java خالص بلا Gradle → `D:\autoclaw projects-new\FileBridge\dist\FileBridge.apk` (**91,915 بايت** · SHA-256 `9240f7bf7ba1798ddb0251f8e14373197793dcb6ed6234df81bb3d1b35efbea0` · موقّع v1+v2+v3) |
| النواة | `core/` (Node) + `android/app/src/main/java/com/filebridge/app/` (Java) |
| الواجهة | `ui/index.html` مشتركة RTL |
| الاختبار | `node D:\autoclaw projects-new\FileBridge\core\test\e2e.test.js` → **28/28** (اقتران، نقل، استئناف، Office، رفض توقيع) |
| التوثيق | `docs\التقرير-التفصيلي.md` · `protocol\FBX-1.md` · `docs\عقد-الجسر.md` · `docs\سجل-البناء.md` (كلها داخل مجلد FileBridge) |
| ما لم يُختبر | اقتران جهازين حقيقيين على واي فاي |

**فخ d8 حاسم إن عدت للبناء:** d8 8.2.2-dev يفشل NPE مع الأصناف الداخلية غير الساكنة والجسور (`implements` + `$1`).
العلاج المعتمد: كل مستمع `private static final class` + `Comparator` خام بلا generics. لا `new Interface() { ... }`.

**سكربتات البناء:** `D:\autoclaw projects-new\FileBridge\scripts\build-windows.ps1` · `build-android.ps1` · **لا تعدّل `offline-build-tools`**.

---

## 5) الأدوات والأجهزة والاختبار (مشترك)

### أدوات (المسار الصحيح — r10 أخطأ)

```
D:\autoclaw projects\offline-build-tools
├── android-toolchain\jdk        (OpenJDK 21)
├── android-toolchain\sdk        (platform 35 · build-tools 34.0.0)
├── android-toolchain\gradle\bin\gradle.bat
├── android-toolchain\sdk\platform-tools\adb.exe
├── windows-build-toolkit        (NSIS 3.04 · electron-builder 26.15.3 · Electron 44.3.0 zip)
├── electron-runtime
└── node-runtime                 (ZIP غير مستخرج — Node على PATH v24)
```

**لا `java` على PATH.** كل صدفة:

```powershell
$b='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME="$b\jdk"; $env:ANDROID_HOME="$b\sdk"; $env:ANDROID_SDK_ROOT="$b\sdk"
```

أدوات أخرى: Chrome `C:\Program Files\Google\Chrome\Application\chrome.exe` · VMware `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` · LDPlayer `D:\LDPlayer\LDPlayer9\ldconsole.exe`.

### الأجهزة

| الجهاز | الحالة عند التسليم | ملاحظة |
|---|---|---|
| Android-Emulator | online عادة | API 28 · عمود فقري للاختبار |
| TECNO-KL4 | offline | 3.16.8 code 98 · صلاحية كل الملفات ممنوحة · serial `12927374CM001019` |
| WIN10-VM | offline | يحتاج دفعة إقلاع بعد كل ترقية |
| WIN11-VM | offline | `E:\VMs\Win11_Custom_2026-09-30` · الدخول `vmrun -interactive` بحساب admin · **C$ وWMI مرفوضان** (UAC remote token filtering) · PowerShell داخل الضيف يتعلّق عبر VIX · **الطريقة الموثوقة: `dir /s /-c` داخل الجهاز ثم تحليل القائمة على المضيف** |
| TAB16-USB | offline | Android 8.1 |

### إعدادات AiRemote المحفوظة (لا تُفقد)

- AI: `zai` / `glm-4.7-flash`
- Telegram: مفعّل · 4 أحداث (online/offline/chat/task)
- 2FA: معطّل
- المهام المجدولة: 0
- قواعد التنبيه: 0
- المظهر: نهاري
- المستخدمون: 3 أدمن

---

## 6) ما أُنجز في جلسة التسليم هذه (بعد r11)

| العمل | الناتج |
|---|---|
| إصلاح نواة FileBridge (خادم لا يشتق مفاتيح + `t:undefined` + عدم إصدار ready بعد الاقتران) | e2e 28/28 |
| واجهة تطبيق فعلية `ui/index.html` + تصحيح نصوص النموذج (TLS→FBX/1، Ed25519→ECDSA P-256، 50100→47824) | جاهزة |
| تطبيق ويندوز Electron + أندرويد Java كامل | مبني |
| APK موقّع + setup.exe | في `D:\autoclaw projects-new\FileBridge\dist\` |
| مخطط معماري محدّث + تقرير 1.2 | `D:\autoclaw projects-new\FileBridge\docs\` |
| تقارير تدقيق AiRemote 3.16.8 (صفحات، أجهزة، إعدادات، مستخدمون، عارض، تنبيهات، غرفة عمليات) | جذر مساحة العمل `تقرير-*.md` |
| مسح VM Win11 | `تقرير-قرص-ويندوز11-*.md` |

**لا شيء من هذا قيد التنفيذ.** كلهم منتهون.

---

## 7) قرارات المالك الثابتة (لا تفتحها)

1. سجل الوكيل عربي — قرار 2026-11-07.
2. لا بناء ولا تثبيت داخل AiRemote بلا أمر صريح.
3. عند طلب «الخطوة/الخطوتين» من تقرير مرقّم: نفّذ المحدّد فقط، سجّل قبل/بعد، تحقّق على القرص، أبلِغ بالأرقام الفعلية.
4. التقارير والتحليلات **بالعربية**.
5. لا تنسخ أسرارًا إلى المستودع أو الوثائق.
6. FileBridge لم يُختبر على جهازين حقيقيين — لا تُعلنه «جاهزًا للإنتاج».

---

## 8) نهاية الأمر

- آخر عمل منفَّذ: **اكتمال FileBridge 1.0.0 (APK + setup.exe)** و**AiRemote 3.16.8 صفحات 1–8 مثبَّتة**.
- آخر قياس AiRemote: بوابة 55/56 · `/health` = 3.16.8 · أسطول 5/1.
- آخر قياس FileBridge: e2e 28/28 · APK موقّع · setup.exe 106 م.ب في `D:\autoclaw projects-new\FileBridge\dist\`.
- **لا شيء قيد التنفيذ.**
- الصفحة التالية في AiRemote إن أمر المالك: **9 — سجل التدقيق**.
- FileBridge التالي إن أمر المالك: اختبار اقتران حقيقي على واي فاي.

**قف هنا حتى يأمر المالك. لا تنفّذ شيئًا.**

إذا قرأت هذا الملف وr11 وتحققت من الأرقام، قل فقط:

> «قرأت التسليم r12. AiRemote 3.16.8 مثبَّت، FileBridge مبني، الأرقام مطابقة/مختلفة (التفصيل)، أنتظر أمرك.»
