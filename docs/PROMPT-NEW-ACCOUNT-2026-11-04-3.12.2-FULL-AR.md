# استئناف مشروع **AiRemote** — حساب جديد · 2026-11-04 · الإصدار **3.12.2**

> **هذا الملف يحلّ محلّ `docs/PROMPT-NEW-ACCOUNT-2026-11-03-3.12.0-FULL-AR.md`.**
> كل رقم فيه مقيس أو مأخوذ من قياس محفوظ في `outputs/verify-2026-11-03/m1/`.

---

## 0) ما تغيّر منذ الملف السابق (اقرأ أولاً — يحكم على ما بعده)

**النسخة الآن 3.12.2** · `versionCode=56` · فرع `hardening/audit-20261102` · Git محلي (0 remotes)
· السيرفر المثبَّت **3.12.2** · كل الأجهزة **3.12.2** (ويندوز وأندرويد).

| الالتزام | الشريحة | الأثر المقيس |
|---|---|---|
| `cdb266d` | 3.12.1 — M1 خطوة 1 | `sendEncodings` + `maintain-resolution` + نافذة 480×270 ⇒ **المعاملات وصلت** لكن الدقة بقيت 400×169 |
| `0d38c4f` | 3.12.2 — M1 خطوة 2 | **1600×900 كاملة** · **0.03–0.11Mbps** تحت الكتابة مقابل **1.69Mbps** لـJPEG · 0% سواد |
| `c2ec882` | WIP إدخال | `SendInput` بدل `SetCursorPos` (مرفوض في الضيف) |
| `09c6d2c` | بيان الإصدار | **35 عنصراً** موقّعاً ومطابقاً |
| `d1712a7` | WIP إدخال | إحداثيات **مطلقة 0..65535** + مؤشر بفضاء الإطار |

### 0.1 الحالة الحرجة الآن

**M1 (النقل) مُنجَز رقمياً:** 1600×900 كاملة، محتوى حقيقي، نطاق أقل 28× من JPEG في نفس السيناريو.
**الميزة ليست في المنتج:** لا شيء في `ScreenViewer` يرسل `rtc:start`؛ صفحة `/rtc-test` وحدها.

**التحكم في ويندوز لم يُغلق:** الحقن يعمل (أُثبت بـ`ABC123` في Notepad وبفتح قائمة Format عند 346,253)،
لكنه فشل في اختبارين لاحقين (المؤشر توقّف عند `677,0` مع `ClipCursor` غير مقيّد). **لا تعلنه منجزاً.**

### 0.2 أسباب جذرية مُصلحة (لا تُعِدها)

1. **`degradationPreference` كان في المكان الخطأ:** خاصية `RTCRtpTransceiver` **وهمية** (JS expando)؛
   الصحيح `RTCRtpSendParameters` داخل `sender.setParameters()`. هذا وحده كان يمنع 1600×900.
   (التصحيح السابق في 3.12.0 — «على المتسقّل» — كان **خطأً** وأُبطل.)
2. **`setParameters` قبل أول عرض لا يُطبَّق** ⇒ استخدم `addTransceiver(track, { sendEncodings, streams:[stream] })`
   وأعِد التطبيق بعد `connected` و`+4s`.
3. **`addTransceiver` بلا `streams`** ⇒ المشاهد لا يجد `e.streams[0]` فالفيديو بلا مصدر.
4. **الـcanvas كان يقارن العرض فقط** ⇒ بقي 1600×677 بينما إطار GDI 1600×900 (تشويه رأسي).
5. **تغذية الـcanvas كانت 0.4–1 إطار/ث** ⇒ `createImageBitmap` لكل إطار + **إطار أمان كل 33ms**.
6. **`SetCursorPos` يعيد False** في جلسة الضيف (session 1 نشطة، `LogonUI=0`، `OpenInputDesktop` ناجح، `ERR=0`)
   ⇒ استُخدم `SendInput`. والدليل: `tools/lab/a2a/setpos-test.ps1` ثم `sendinput-test.ps1`.

### 0.3 تحذيرات حاكمة (مُحدَّثة — كلها من أخطاء فعلية)

- **UIPI:** أي نافذة مرتفعة الصلاحية في المقدمة (Task Manager/UAC) **تُسقط كل حقن الإدخال** من عملية عادية.
  للتحكم فيها يجب تشغيل الوكيل **كمسؤول**. هذا ليس عطلاً في الكود.
- **بوابة المنح:** بدون كلمة سر التحكم يرد الوكيل `screen:control_denied`. الدليل: `screen:control_granted`
  بعد إرسال `123456`. الجلسة «عرض فقط» تُسقط الإدخال في السيرفر قبل الوصول للوكيل.
- **`ProTUN` (VPN) على المضيف يمنع كل اتصال إلى `192.168.1.x`** بخطأ 10013. أوقفه قبل أي adb لاسلكي،
  أو نفّذ adb من **داخل ضيف WIN10** (الضيف يصل إلى الهاتف).
- **منفذ الاقتران ≠ منفذ الاتصال:** `adb pair IP:PORT CODE` ينجح، ثم يُغلق المنفذ؛ الاتصال يحتاج المنفذ
  الظاهر في **الشاشة الرئيسية** لـ«التصحيح اللاسلكي» (TECNO الحالي: `192.168.1.100:33411`).
- **`Android-Emulator` = LDPlayer 9** لا AVD: `adb connect 127.0.0.1:5555`. سجل `emulator-5554 offline` شبح.
- **`build-gdi-worker.cjs` يُخزّن:** إن لم يتغيّر حجم المصدر يطبع «up to date». استخدم `--force` بعد أي تعديل في `.cs`.
- **`patch.cjs` يرفض الانكماش:** لتمرير حذف نص مرّر `"allowShrink": true` في ملف الترقيع.
- **مثبّت السيرفر:** أوقف عمليات `AiRemote Server` أولاً، ثم `Setup.exe /S` حتى `exit=0`، ثم تحقق من
  تطابق `sha256` لـ`resources\app.asar` مع `releases\server-windows\win-unpacked\...`، ثم شغّل الـexe.
- **سكربت التبديل `swap-31210.ps1`:** `Start-Process` قد لا يُبقي الوكيل حياً بعد التبديل
  (رأينا `RUNNING=0`) ⇒ تحقق ثم استخدم `vmguest.cjs start-agent`.
- **CSP:** أي صفحة بسكربت مضمّن تحتاج تخفيف سياسة طريقها وإلا فهي صامتة.
- **IPC/JSON:** كائنات المتصفح (`RTCSessionDescription`/`RTCIceCandidate`) لا تُنسخ — مرّر حقولاً صريحة.
- **PowerShell 5.1:** لا backticks ولا `\"` في `git commit -m`؛ استخدم متغيراً بين علامات مفردة.
- **ملاحظة أداء WIN10:** عامل GDI ~12.6% والوكيل ~28–45% من 4 أنوية مقابل 1.4 إطار/ث،
  وDefender ~9–10%، وTask Manager نفسه ~8%. الحمل في **الالتقاط والمقارنة** لا في الشبكة.

---

## 1) بيئة العمل — مسارات كاملة

| العنصر | المسار/القيمة |
|---|---|
| المستودع | `D:\autoclaw projects-new\AiRemote` · `hardening/audit-20261102` · محلي فقط |
| آخر التزام | `d1712a7` (WIP إدخال) · آخر شريحة وظيفية `0d38c4f` (3.12.2) |
| السيرفر المثبَّت | `https://127.0.0.1:3001` · `/health` = **3.12.2** · TLS ذاتي |
| تنفيذي السيرفر | `C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe` (Electron 44.3.0) |
| تنفيذي الوكيل | `C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe` (Electron 28.3.3) |
| قاعدة البيانات | `C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db` (قراءة فقط) · `user_version=5` |
| أدوات أندرويد | `D:\autoclaw projects\offline-build-tools\android-toolchain` (`adb` · `jdk` · `gradle\bin\gradle.bat`) |
| VMware | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` |
| الضيوف | `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` · `E:\VMs\Win11_Custom_2026-09-30\...vmx` |
| أسرار — **لا تُطبع** | `%APPDATA%\AiRemote\lab-credentials.txt` · `lab-probe.json` · `signing\keystore-password.txt` · أي JWT/رمز جهاز |

**الأجهزة (مقيسة اليوم):**

| الجهاز | deviceId | النسخة | الوصول |
|---|---|---|---|
| WIN10-VM | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | 3.12.2 | 192.168.0.128 · الهدف الحالي للأداء |
| WIN11-VM | `d147684b-2451-4418-a628-86f11aa66a4e` | 3.12.2 | 192.168.0.129 · هدف قياس M1 |
| TAB16-USB | `7fc54b40-e7c1-4db6-9f55-78f377c4f4ad` | 3.12.2-android | USB · `GPSZ2025040701858` |
| TECNO-KL4 | `07f8ae91-5b64-41d9-97df-ce649772b0d3` | 3.12.2-android | لاسلكي · `adb connect 192.168.1.100:33411` |
| Android-Emulator | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` | 3.12.2-android | **LDPlayer**: `adb connect 127.0.0.1:5555` |

**المضيف:** Wi-Fi `192.168.1.25` · Ethernet `192.168.1.55` · VMnet8 `192.168.0.1` · ProTUN `10.2.0.2` (يجب إيقافه).
**شاشة WIN10:** 1280×720 ظاهرياً (الحقن يحتاج `SendInput` لا `SetCursorPos`).

---

## 2) المستودع — الجديد في هذه الموجة

**كود:**
- `packages/agent-desktop/rtc.html` — `addTransceiver(sendEncodings+streams)` · `applyEncodingParams()` ·
  `createImageBitmap` + إطار أمان 33ms · تصحيح أبعاد الـcanvas.
- `packages/agent-desktop/main.js` — نافذة الجسر 480×270 خارج الشاشة · `gdiCapture.input()` مسار سريع ·
  إحداثيات مطلقة 0..65535 · احتياطي PowerShell كما هو.
- `packages/agent-desktop/lib/capture-gdi.js` — `input(cmd)` يكتب للعامل فقط إن كان `engine==='exe'`.
- `packages/agent-desktop/lib/capture-gdi-worker.cs` — بصمة قبل التصغير · أوامر `M/C/B/E/W/K` ·
  `SendInput` مطلق · معايرة `maxX/maxY` · مؤشر بفضاء الإطار.

**أدلة:** `outputs/verify-2026-11-03/m1/` (`m1-params.json` · `m1-receiver-samples.txt` · `m1-3122.json` · `m1-3122-receiver.txt`).

**أدوات مختبر جديدة:** `swap-31210.ps1` · `cpu-probe.ps1` · `cursor-test.ps1` · `setpos-test.ps1` ·
`sendinput-test.ps1` · `clip-check.ps1` · `notepad-rect.ps1` · `abs-test.ps1` · `mdns-scan.ps1` · `net-test.ps1`.

**مصادر الإصدار (8):** `VERSION` · 4 `package.json` · `build.gradle` (`versionCode` رقمي) · `releases/manifest.json` · `/health`.

---

## 3) الحالة الحالية (تُتحقَّق في §10 ولا تُعاد بناؤها)

- **3.12.2** على السيرفر + وكيلَي ويندوز · **3.12.2-android** على الأجهزة الثلاثة.
- **البثّ JPEG/GDI:** يعمل كما كان (لم يُمسّ).
- **WebRTC:** 1600×900 كاملة · 6.9fps وسط · 0.03–0.11Mbps · rgb 98/125/160 · 0% سواد (WIN11).
- **التحكم:** الحقن عبر `SendInput` يعمل في Notepad؛ **غير مُتحقَّق** عبر الواجهة بعد؛ UIPI يحجب التطبيقات المرتفعة.
- **البوابات:** 44/44 · إصدار PASS · ألوان 0 · تباين 22/22 · بيان 35 · أول إطار 621/1800.
- **T11:** محجوب (شاشة واحدة).

---

## 4) القرارات الحاكمة

`docs/DECISIONS-LOG.md` — والأهم:
**D34** GDI أولاً، Chromium بديلاً؛ أي تغيير في الالتقاط يوجب قياس بكسلات. **D36** «أول إطار» = محتوى.
**D37** جلسات relay تُستعاد `suspended` (120s). **D38** كل مقياس على المسار الذي يرسل فعلاً.
**D39** «نفق يعمل» ≠ «أداء أفضل» — الآن تحقّق: 0.06Mbps مقابل 1.69Mbps.
**D40 (جديد، مقترح):** التحكم في ويندوز يتطلب (أ) جلسة بصلاحية تحكم، (ب) كلمة سر مقبولة،
(ج) وكيلاً مرتفع الصلاحية لاستهداف نوافذ UIPI. أي اختبار تحكم لا يذكر الثلاثة باطل.

---

## 5) المتبقي (بالترتيب)

### 5.1 إغلاق التحكم (الأولوية الأولى)
1. شغّل الوكيل **كمسؤول** على WIN10 وأعد اختبار: نقر داخل Notepad، نقر داخل Task Manager، زر أيمن، عجلة.
2. إن بقي المؤشر ثابتاً: أضف تسجيلاً في `CommandLoop` لكل أمر (نجح/فشل `SendInput`) واقرأ `input-worker.log`.
3. تحقق من `screen:cursor` أن `x,y` داخل `width,height` (فضاء الإطار) بعد المعايرة.
4. **لا تعلن نجاحاً** قبل لقطة تُظهر نصاً مكتوباً عبر الواجهة (لا عبر سكربت المختبر).

### 5.2 أداء WIN10
1. fps تكيّفي في العامل: 4 عند السكون / 12 عند التغيّر (خفض ~60% من حمل الالتقاط).
2. إلغاء التصغير المزدوج: لا `Scale` إن كان `maxWidth ≥ عرض الشاشة`.
3. إعادة تشغيل العامل عند تغيير الجودة من الواجهة (الالتحاق بجلسة قائمة يتجاهل الإعدادات).

### 5.3 تكامل المنتج (بعد 5.1/5.2)
علم في `ScreenViewer` (`?rtc=1`) + `<video>` + رجوع تلقائي إلى JPEG عند فشل ICE أو غياب الفيديو 5s.
ثم M2 (WAN 5Mbps/60ms/1% فقد) · M4 (Opus) · M5 (TURN + مقارنة A/B ضد CRD).

---

## 6) سير العمل (إلزامي)

1. تعديل المستودع عبر `tools/lab/a2a/patch.cjs` (مطابقة واحدة، و`allowShrink` عند الحذف).
2. **شريحة واحدة = التزام واحد** + دليل في `outputs/verify-<date>/` + `CHANGELOG` + `PROJECT_STATE` + 44/44.
3. إن غيّرت كوداً: ارفع `VERSION` + 4 `package.json` + `versionCode`، ثم:
   - سيرفر: `tools\lab\a2a\build-server.ps1` ⇒ إيقاف العمليات ⇒ `Setup.exe /S` حتى `exit=0` ⇒ تشغيل ⇒ `/health`.
   - وكيل: `cd packages\agent-desktop; $env:CSC_IDENTITY_AUTO_DISCOVERY='false'; .\node_modules\.bin\electron-builder.cmd --win --x64`
     ⇒ انسخ `win-unpacked\resources\app.asar` إلى الضيف باسم `C:\Users\admin\new-app.asar`
     ⇒ `vmguest.cjs ps <vm> swap-31210.ps1` ⇒ تحقق `SIZE_MATCH` و`RUNNING` ⇒ إن كان 0: `vmguest.cjs start-agent <vm>`.
   - أندرويد: `gradle assembleRelease --offline` ⇒ `sign-apk.ps1` ⇒ `adb install -r`.
4. بعد أي إقلاع لضيف: أعد تشغيل الوكيل وانتظر **15–25s**.
5. التزامات Git بالإنجليزية، محلية فقط.
6. **لا PASS بلا دليل مكتوب** على الطبقة الصحيحة.

---

## 7) أدوات لا تُستبدل

`devs.cjs` · `lab.cjs` · `vmguest.cjs` (`probe`/`ps`/`shot`/`copyIn`/`copyOut`) · `dump-frames.cjs` ·
`frame_stats.py` · `cursor-probe.cjs` · `bench-gdi.ps1` · `gdi-engine.ps1` · `typing-load.ps1` ·
`agent-procs.ps1` · `cpu-probe.ps1` · `swap-31210.ps1` · `patch.cjs` · `build-server.ps1` · `sign-apk.ps1` ·
`build-gdi-worker.cjs` (**--force**).

**بوابات:** `verify.js` (44) · `check-version-consistency.cjs` · `scan-ui-colors.cjs` · `check-contrast.cjs` ·
`release-manifest.js --verify` · `check-first-frame.cjs`.

**قاعدة القياس:** الإطار يُقاس **بعد فك الترميز**، والرقم على **المسار الذي يرسل فعلاً**.

---

## 8) التفويض للمساعدين

- المرآة: `node "<repo>\tools\lab\a2a\mirror-sync.cjs" --repo "<repo>"` من مجلد المشروع.
- **الدرس:** الجرد الحسّاس في الجلسة الرئيسية؛ فوّض فقط العريض القابل للتحقق (بحث خارجي، مراجعة مستقلة).
- أدوات ملفات المساعد محصورة بمساحة العمل؛ `D:\` ممنوع.

---

## 9) قواعد ملزمة (من أخطاء فعلية)

1. Git محلي فقط. 2. لا أسرار في المخرجات. 3. PowerShell 5.1 يقرأ UTF-8 كـANSI ⇒ `-Encoding UTF8` أو Node.
4. **لا PASS بلا دليل**. 5. أندرويد: `am force-stop` يُعطّل خدمة الوصول ⇒ أعد تفعيلها.
6. ويندوز: بعد أي إقلاع أعد تشغيل الوكيل. 7. `datetime('now')` = UTC بلا لاحقة.
8. لا إعادة بناء لشيء يعمل؛ لا تلمس `bin/` · `.cache/` · `node_modules`.
9. `vmrun start … gui` يفشل أحياناً ⇒ `nogui`. 10. asar: أي أصل يقرأه process خارجي يُستخرج إلى `%APPDATA%`.
11. `vmguest.ps`: الخرج = **اسم السكربت**. 12. ملكية الأجهزة: طلب جهاز←جهاز يفشل 403.
13. TDZ: لا `let/const` قبل تعريفها. 14. لقطات المتصفح: تذكرة `rt` عمرها 60s.
15. CSP. 16. IPC/JSON. 17. قفل VMware العالق: أَزح `.vmx.lck` بإعادة تسمية.
18. **(جديد)** `SetCursorPos` مرفوض في ضيف headless ⇒ `SendInput`.
19. **(جديد)** UIPI يحجب الإدخال عن النوافذ المرتفعة ⇒ وكيل كمسؤول.
20. **(جديد)** ProTUN يقطع LAN المضيف ⇒ أوقفه أو استخدم ضيف WIN10 جسراً.
21. **(جديد)** منفذ اقتران adb ≠ منفذ الاتصال.
22. **(جديد)** `build-gdi-worker.cjs` يُخزّن ⇒ `--force`.
23. **(جديد)** `patch.cjs` يرفض الانكماش ⇒ `allowShrink`.

---

## 10) قائمة تحقق الاستئناف (قراءة فقط — نفّذها عند «ابدأ» ثم أعد الجدول وتوقف)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -6; git status --short
curl.exe -sk https://127.0.0.1:3001/health
node tools\lab\devs.cjs
node scripts\verify.js
node scripts\check-version-consistency.cjs
node scripts\scan-ui-colors.cjs ; node scripts\check-contrast.cjs
node scripts\release-manifest.js --verify
node scripts\check-first-frame.cjs
(Get-Service 'VMware NAT Service').Status
& 'C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe' list
& 'D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe' devices
```

**المتوقع:** شجرة نظيفة (عدا ملف البرومبت القديم ومخرجات `vm-*.out.txt`) · `/health` = **3.12.2** ·
WIN10+WIN11 **3.12.2** · TAB16/TECNO/Emulator **3.12.2-android** · 44/44 · ألوان 0 · تباين 22/22 ·
إصدار PASS (3.12.2 · vc56) · بيان **35** عنصراً · أول إطار 621/1800 · NAT Running · ضيفان في `vmrun list` ·
adb يرى `GPSZ2025040701858` و`192.168.1.100:33411` و`127.0.0.1:5555`.

**إن سقط التحكم:** تحقق أولاً من المنح (`screen:control_granted`)، ثم من UIPI (Task Manager في المقدمة؟)،
ثم من `input-worker.log` — ولا تغيّر الشيفرة قبل معرفة أي الطبقات سقطت.

**إن سقط WebRTC:** اقرأ `%APPDATA%\AiRemote Agent\rtc.log` في الضيف (يُنسخ بـ`read-rtc-log.ps1`)،
وتحقق أن `params[...] pref=maintain-resolution` ظاهر.

---

## 11) مخرجاتك المطلوبة الآن (بلا تنفيذ)

1. جدول تحقق §10: المتوقع مقابل الفعلي لكل بند.
2. أي انحراف بسطر الدليل (ملف/سطر أو ناتج أمر).
3. تأكيد أنك لم تُعدّل شيئاً وأنك تنتظر «ابدأ».

**بعد «ابدأ»:** ابدأ من §5.1 (إغلاق التحكم) — لا من الصفر، ولا تُعِد بناء ما أُنجز.

---

## 12) ملحق: ما أُنجز (للتوثيق الكامل)

| المجال | الإنجاز | الدليل |
|---|---|---|
| M1 قرار | 1600×900 كاملة عبر `RTCRtpSendParameters` | `m1/m1-3122.json` |
| M1 نطاق | 0.03–0.11Mbps مقابل 1.69Mbps (28×) | `m1/m1-3122-receiver.txt` |
| M1 محتوى | rgb 98/125/160 · 0% سواد | نفسه |
| التغذية | 30fps إطار أمان + كل إطار GDI | `rtc.log: painted=4622` |
| المشاهد | `e.streams.length=1` بعد `streams:[stream]` | `rtc.log: track streams=1` |
| الالتقاط | بصمة قبل التصغير: العامل 17.4% → 12.6% | `cpu-probe.ps1` |
| الإدخال | `SendInput` يعمل؛ `SetCursorPos` مرفوض | `sendinput-test.ps1` · `setpos-test.ps1` |
| إثبات التحكم | `ABC123` في Notepad + قائمة Format | لقطات `guest-win10*.png` |
| الأجهزة | 3.12.2 على الخمسة | `devs.cjs` |
| الإصدار | بيان 35 · 44/44 · vc56 | `verify.js` · `manifest.json` |
