# تسليم الحساب — AiRemote (2026-10-28)

**الغرض:** كل ما يحتاجه حساب جديد لتكملة العمل من النقطة نفسها بلا فقدان سياق: ما أُنجز، أين يعيش كل شيء، كيف يُتحقق، وما العوائق المعلومة.
**آخر تحديث للحالة:** 2026-10-28، بعد إغلاق R0–R4 وتوحيد الإصدار **3.8.12** على السيرفر والأجهزة الأربعة.

---

## 1. الحالة في سطر واحد

المراحل **R0–R4 مُغلقة وR5 مُغلقة في المصدر**، البطارية **20/20**، الإصدار **3.8.12** يعمل على السيرفر وWIN10 وWIN11 والمحاكي وTECNO، والشجرة نظيفة على الفرع `checkpoint/3.8.1-2026-10-26`. **المرحلة التالية: R6 — تجربة موحّدة.**

---

## 2. المسارات المرجعية

| العنصر | المسار |
|---|---|
| المستودع | `D:\autoclaw projects-new\AiRemote` |
| الفرع | `checkpoint/3.8.1-2026-10-26` |
| سياق المشاريع | `D:\autoclaw projects-new\_MASTER_CONTEXT.md` |
| حالة المشروع | `AiRemote\PROJECT_STATE.md` (§0.1 الحالة، §0.2 الاستئناف) |
| سجل المراحل والاستئناف | `AiRemote\docs\PLAN-STATUS.md` |
| الخطة الحاكمة | `AiRemote\docs\PRODUCTION-PLAN-v2.0-AR.md` (R0–R9) |
| بروتوكول Relay | `AiRemote\docs\PROTOCOL-RELAY-AR.md` v1.1 |
| تشخيص الأندرويد | `AiRemote\docs\DIAG-ANDROID-2026-10-28-AR.md` |
| أدلة المراحل | `AiRemote\outputs\verify-2026-10-28\{r0-gate,r1-diagnosis,r2-security,r3-identity,r3-access,r4-relay,android-3.8.12}\` |
| قياس السعة | `AiRemote\outputs\perf\r4\` + `AiRemote\scripts\perf\relay-capacity.cjs` |
| سجل التغييرات | `AiRemote\CHANGELOG.md` |

---

## 3. ما أُنجز (ملخص تنفيذي)

| المرحلة | الحالة | الجوهر |
|---|---|---|
| R0 | مُغلقة | خطة v2.0، CI، `DEFINITION-OF-DONE`، جرد شاشات، بوابة أداء |
| R1 | مُغلقة (ببند مؤجّل) | صمت الساكن + إطار أمان 15s + `server:force_keyframe`؛ ساكن 167.8→15.66 KB/s |
| R2 | مُغلقة | AES-256-GCM + `secret.key`، حدود محاولات على 5 مسارات، حارس أدوار، `nosniff`، تبعيات 89→56 |
| R3 | مُغلقة (شريحتان) | معرّف جهاز 9 أرقام + `contacts` + `by-code`؛ وصول غير مراقب بكلمة مرور لكل جهاز (bcrypt، قفل 5/5)؛ `device_permissions` (control/files/record) محترمة في 15 مساراً و6 نقاط WS |
| R4 | مُغلقة على السيرفر | جلسة وكيل‑بوكيل عبر Relay: آلة حالة `requested→active→suspended→closed` (+denied/expired)، رمز أحادي الاستخدام لكل طرف (SHA-256، 90s)، موافقة صريحة، سقف 20، حارس KB/s، تعليق/استئناف 15s، قياس 20 جلسة (p95 4.39ms، 0% فقد) |

**اختبارات البطارية (19 خطوة):** `e2e-security` 20 · `e2e-contacts` 18 · `e2e-unattended` 34 · `e2e-device-permissions` 31 · `e2e-agent-session` 41.

---

## 4. بيئة التشغيل (بالتفصيل الذي يمنع إعادة الاكتشاف)

### 4.1 السيرفر المثبَّت

| العنصر | القيمة |
|---|---|
| المسار | `C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe` |
| الإصدار | **3.8.12** (`https://127.0.0.1:3001/health` → `{"version":"3.8.12"}`) |
| قاعدة البيانات | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` (WAL) |
| السجلات | `C:\Users\admin\AppData\Roaming\AiRemote-Server\logs\server-YYYY-MM-DD.log` |
| المثبّت | `AiRemote\releases\server-windows\AiRemote-Server-Setup-v3.8.12-x64.exe` (خارج Git) |
| إعادة التثبيت | إيقاف العملية → `Start-Process <setup> -ArgumentList '/S' -Wait` → تشغيل الـexe |
| TLS | self-signed؛ أي فحص من Node يحتاج `NODE_TLS_REJECT_UNAUTHORIZED=0` |

### 4.2 وكيل ويندوز (WIN10/WIN11)

| العنصر | القيمة |
|---|---|
| المسار في الضيف | `C:\Users\admin\AppData\Local\Programs\AiRemote Agent\` |
| الإصدار | **3.8.12** على الجهازين |
| مثبّت | `AiRemote\releases\agent-windows\AiRemote-Agent-Setup-v3.8.12-x64.exe` + `win-unpacked\` |
| طريقة التحديث التي نجحت | `taskkill /IM "AiRemote Agent.exe" /F` ثم نسخ `win-unpacked\AiRemote Agent.exe` و`win-unpacked\resources\app.asar` إلى مجلد التثبيت، ثم تشغيل الـexe |
| طريقة لم تنجح | `vmrun runProgramInGuest -interactive -noWait <setup> /S` (ينشئ عملية معلّقة ولا يستبدل الملفات) |
| الـVMان | Win10: `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` · Win11: `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx` |
| بيانات الضيف | `C:\Users\admin\AppData\Roaming\AiRemote\lab-credentials.txt` (مفاتيح `vm_guest_user` / `vm_guest_password`) — لا تُطبع |
| vmrun | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` |
| ملاحظة Windows 11 | بعد استبدال الملفات، إن بقي الإصدار القديم فهناك نسخة قيد التشغيل تحمل القفل: `taskkill` لكل العمليات ثم تشغيل واحد نظيف |

### 4.3 الأندرويد

| العنصر | القيمة |
|---|---|
| حزمة الوكيل | `com.airemote.agent` — الإصدار **3.8.12 / versionCode 18** على المحاكي وTECNO |
| ملف APK الجاهز | `AiRemote\releases\android\AiRemote-Agent-3.8.12-vc18-debug.apk` (موقّع بمفتاح debug) |
| adb (المحاكي) | `D:\LDPlayer\LDPlayer9\adb.exe` |
| adb (لاسلكي) | `D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe` — **لا يدعم mDNS** |
| المحاكي | السيريال `emulator-5554` (يظهر أيضاً كـ`127.0.0.1:5555`; استخدم الظاهر في `adb devices`) |
| نفق المحاكي | **إلزامي بعد كل إعادة تشغيل adbd:** `adb -s emulator-5554 reverse tcp:3101 tcp:3101` |
| جسر الأندرويد | `C:\Users\admin\AppData\Roaming\AiRemote\android-bridge-local.py` **v2** (بلا مهلة خمول) — يستمع `127.0.0.1:3101` ويوجّه إلى `3001` |
| تشغيل الجسر | `python C:\Users\admin\AppData\Roaming\AiRemote\android-bridge-local.py` (نسخة احتياطية قديمة: `.bak-20261028`) |
| إعداد المحاكي | `wss://127.0.0.1:3101/ws` (عنوان الشبكة غير قابل للوصول من NAT المحاكي) |
| TECNO | تصحيح لاسلكي: `192.168.1.100:41329` (الاقتران جرى على `:39271`) — إعداد `wss://192.168.1.25:3001/ws` |
| حقن الإعداد | `adb shell am start -n com.airemote.agent/.MainActivity --es server <url> --es token <token> --ez autostart true` |
| سبب اختيار Intent | `pm clear` يحذف `Android/data/<pkg>/files`، و`adb push` إليه يُرفض بـ`secure_mkdirs failed` |
| صلاحيات بعد كل إعادة تثبيت | `settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y` · `appops set com.airemote.agent SYSTEM_ALERT_WINDOW allow` · `pm grant com.airemote.agent android.permission.RECORD_AUDIO` · ثم `am start ... --ez requestCapture true` لموافقة التقاط الشاشة |
| مفتاح التوقيع | **مفقود** (لا `*.jks` في المشروع ولا `%APPDATA%\AiRemote\signing`) → أي تحديث يحتاج إزالة+تثبيت |

### 4.4 بناء الحِزم

```powershell
# سيرفر (المصدر → الحزمة)
cd 'D:\autoclaw projects-new\AiRemote\packages\server-desktop'
node scripts/bundle.js
node scripts/copy-dashboard.js
node node_modules/electron-builder/out/cli/cli.js --win --x64

# وكيل ويندوز
cd 'D:\autoclaw projects-new\AiRemote\packages\agent-desktop'
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
node node_modules/electron-builder/out/cli/cli.js --win --x64

# وكيل أندرويد (debug)
cd 'D:\autoclaw projects-new\AiRemote\packages\android-agent'
$env:JAVA_HOME='D:\autoclaw projects\offline-build-tools\android-toolchain\jdk'
$env:ANDROID_HOME='D:\autoclaw projects\offline-build-tools\android-toolchain\sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\gradle\bin\gradle.bat' assembleDebug --offline --console=plain
```

**تحذير عملي:** `git checkout -- packages/android-agent/app/build` يستعيد `BuildConfig.java` القديم (3.8.7) ويعيد APK برقم إصدار داخلي قديم رغم أن المانيفست 3.8.12. بعد أي `checkout` لمخرجات البناء، أعد البناء وتأكد:
`Select-String` على `classes3.dex` يحتوي `3.8.12` ولا يحتوي `3.8.7`.

---

## 5. التحقق في أول 10 دقائق

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -3          # يبدأ بـ 8a40bf4 أو أحدث
git status --short            # فارغ
node scripts/check-imports.js
node scripts/verify.js        # المتوقع: ALL VERIFICATION STEPS PASSED (20/20)
node scripts/list-devices.cjs # الأجهزة الأربعة
```

**إن ظهر إصدار قديم لأي جهاز في `list-devices`:** هذه ليست حالة الجهاز، بل **كاش HTTP** في السيرفر لمسار `/api/devices`. تحقّق بسطر يبطل الكاش:
`/api/devices?x=<رقم عشوائي>` — أو من قاعدة البيانات مباشرة.
**أُصلح في R5:** `no-store` لكل `/api/*`، ومفتاح كاش الضغط صار بصمة المحتوى (كان `URL + الطول` فيتبادل ردّان متساويان الجسم). الدليل: `e2e-devices-cache` (7 فحوص، ويفشل على نسخة مُرجَعة).

---

## 6. العوائق والدَّين التقني المعروف

| البند | الأثر | الحل المقترح |
|---|---|---|
| مفتاح توقيع APK مفقود | كل تحديث أندرويد = إزالة+إعادة تثبيت + إعادة صلاحيات | توليد keystore دائم وحفظه خارج المستودع + توثيق كلمة مروره |
| ~~كاش `/api/devices`~~ | ~~أرقام إصدار قديمة~~ **أُصلح في R5** | `no-store` + مفتاح كاش ببصمة المحتوى |
| تحديث وكيل ويندوز عبر vmrun الصامت | فشل صامت | استخدم نسخ exe+app.asar ثم إعادة تشغيل، أو نقرة يدوية داخل الـVM |
| `node scripts/*.cjs` من مجلد `scripts` لا يجد `better-sqlite3`/`ws` | أخطاء `MODULE_NOT_FOUND` | شغّل السكربتات من داخل `packages/server-desktop` أو مرّر `require.resolve(..., { paths })` |
| `%APPDATA%`/`%LOCALAPPDATA%` غير معرّفة في بعض جلسات PowerShell | مسارات فارغة | استخدم المسارات الحرفية `C:\Users\admin\AppData\...` |
| `pnpm install` العادي يفشل في postinstall | — | `pnpm install --ignore-scripts` |
| `vk`/`vmrun` مع واجهة VMware مفتوحة | خطأ `Unknown error` | أغلق الواجهة، احذف `*.vmx.lck`، ثم `vmrun start` |

---

## 7. الخطوة التالية: R6 — تجربة موحّدة

**R5 أُغلقت في المصدر:** البروتوكول `docs/PROTOCOL-FILE-TRANSFER-AR.md`، والمحرّك `packages/server-desktop/lib/file-transfer.js`، ووكيل النقل `packages/agent-desktop/lib/file-transfer-agent.js`، والأدلة `outputs/verify-2026-10-28/r5-file-transfer/`.

**بوابة القبول (عبرت 15/15):** 10 GiB في 420s (24.4 MiB/s) · 10,000 ملف في 131s · قطع عند 50% واستكمال بنفس البصمة · قرص ممتلئ بخطأ `disk_full` بلا ملف تالف · `..\..` مرفوض.

**ما ينتظر R6:**
1. لوحة الطابور البصرية (شريط تقدم، إيقاف/استئناف/إلغاء) فوق `ft:progress` الجاهز.
2. شاشة إدارة الوصول والدفتر (بقايا R3).
3. واجهة «اتصال بجهاز» والموافقة + تخزين الحزم أثناء `suspended` (بقايا R4).
4. بناء الإصدار الذي يحمل R5 (3.8.13) وتثبيته — بند إصدار مستقل.

---

## 8. قواعد العمل غير القابلة للتفاوض

1. لا حذف ولا إعادة تسمية بلا موافقة صريحة.
2. لا `push` ولا GitHub Release ولا تغيير إعدادات المستودع — العمليات الخارجية للمالك.
3. الشهادة والتوقيع والترخيص مؤجلة بقرار مكتوب.
4. كل خطوة: تُختبر، تُوثَّق في `outputs/verify-YYYY-MM-DD/`، ويُحدَّث `PROJECT_STATE` و`CHANGELOG` و`docs/PLAN-STATUS.md`، ثم التزام محلي واحد واضح.
5. لا «تم» قبل دليل: أمر نُفِّذ أو ملف نتيجة.
6. التقارير بالعربية، والكود والأوامر بالإنجليزية.
7. الأسرار لا تُطبع ولا تُرفع: `lab-credentials.txt`, `lab-probe.json`, رموز الأجهزة، ومفاتيح التوقيع.
