# استئناف AiRemote — 2026-11-19 · الإصدار **3.17.0** — نسخة **r21**

> **هذا الملف يحلّ محلّ `PROMPT-NEW-ACCOUNT-2026-11-16-3.16.19-FULL-AR-r20.md` وكل ما قبله.**  
> كُتب لنهاية جلسة انتهى رصيدها، ليأخذها المساعد في **حساب جديد** ويكمل المهمة حتى النهاية.  
> كل رقم هنا **مقيس على الجهاز نفسه** في 2026-11-19 (ما لم يُوسم «غير مُقاس»).

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا

**قِف هنا. لا تنفّذ أي إجراء كتابة — لا بناء، لا تثبيت أسطول، لا تعديل ملف، لا `git commit`، لا إيقاف سيرفر 3001 — حتى يقول المالك صراحةً «ابدأ» أو «نفّذ» أو «اكمل البند كذا» أو «ثبّت».**

- **ترخيصك الافتراضي:** قراءة وتحقّق فقط + تشغيل اختبارات غير كاتبة (`node *.cjs` للقياس · `curl /health` · `adb shell dumpsys` للقراءة · `pnpm typecheck`).
- **الممنوع الآن:** `adb install` · `am force-stop` · `settings put` · `pnpm build` · `electron-builder` · `gradle` · إيقاف 3001 · `docker compose` على قاعدة الإنتاج · دمج main · ترقية fastify 5.
- **كلمات فكّ التوقّف (من المالك فقط):** «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ» · «ثبّت» · «تحقّق ثم قف».

**المهمة المفتوحة التي ستكملها:** التحقق الكامل من ميزة **بث الشاشة** (سيرفر + وكيل ويندوز + وكيل أندرويد) + إصلاح ما يُكتشف + تقرير. الجزء الأكبر **أُنجز في الجلسة السابقة** — أنت تكمل الفجوات المذكورة في §4.

---

## 1) الهوية والمسار

- **المشروع:** AiRemote — منصة وصول عن بُعد self-hosted بطبقة AI.  
- **المسار:** `D:\autoclaw projects-new\AiRemote`  
- **المستودع:** GitHub `git@github.com:ibrahims78/airemote.git` (مربوط) · Gitea محلي `http://localhost:3000/ibrahims78/airemote` (**غير مشغّل** في نهاية الجلسة السابقة).  
- **الفرع:** `feat/screen-unify-3.13.0`  
- **آخر التزامات الجلسة السابقة (مدفوعة إلى GitHub):**  
  - `bc371de` fix(screen): GDI quality switch + fps cap 30 + snapshot button + android input grant  
  - `ceed484` / `c2daa84` / `ecb828f` / `04c6257` docs state  
  - `c52c2e9` checkpoint نهاية الجلسة  
- **الكود الحيّ المُشحون:** `packages/server-desktop/server.js` (**ليس** `packages/server` TS — فخّ 88).  
- **السيرفر الإنتاجي:** `https://127.0.0.1:3001` · `/health` = `3.17.0` · **لا توقفه**.

**الاعتماد:** `admin@airemote.local` (كلمة المرور عند المالك) · **`lab-probe@local`** بياناته `C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json` (email+password).  
**لا تكتب أي سرّ في مستودع أو تقرير أو ردّ.**

---

## 2) ما أُنجز في جلسة البث السابقة (لا تُعِده)

### 2.1) خرائط البنية (اقرأها ولا تُعِد الفتح)
- **مسار البث:** لوحة `ScreenViewer.tsx` → `WSS /screen?ticket=…&deviceId=…&binary=1` → سيرفر `handleScreenWs` (جلسة لكل جهاز) → وكيل.  
- **ثنائي الإطار:** `[w:4][h:4][seq:4][flags:1][JPEG/WebP]` · دلتا تضيف `[x:4][y:4]` (ترويسة 21).  
- **flags:** bit0=keyframe · bit1=delta · bit2=WebP.  
- **ويندوز:** محرّك GDI (`lib/capture-gdi.js` + عامل `capture-gdi-worker.exe` أو `.ps1`) → JPEG **كامل دائمًا** (`flags=1`، بلا دلتا).  
- **أندرويد:** `AgentService.java` MediaProjection + ImageReader → WebP (API≥30) + دلتا.  
- **WebRTC:** M1 تجريبي مطفأ (جسر GDI→canvas) — إشارات تمرّ عبر `rtc:start/rtc:signal`.  
- **طلب التحكم الصحيح من العارض:** `screen:request_control` **ليس** `screen:control_request` (الخطأ الأول في الاختبار كان بسبب الاسم الخاطئ).

### 2.2) قياسات الأسطول (مُثبتة — لا تُعِد smoke نفسه)

| الجهاز | الدقة | FPS | المعدل | الوضوح | ملاحظة |
|---|---|---|---|---|---|
| DESKTOP-K81PJ9H (جهاز المالك) | JPEG 1600×900 | ~7.2 (مطلوب 20) | 5–7.5 Mbps | لقطات ساكنة **واضحة** | المالك أبلغ عن **تشويش حيّ** — انظر §5 |
| WIN10-VM | JPEG 1600×677 | ~1.0 ساكن (GDI يرسل عند التغيّر) | 0.6–1.1 Mbps | **واضح** | الاختبار الأساسي بعد طلب المالك |
| TECNO-KL4 | WebP 720×1600 | 1–3.5 | **30–240 kbps** | **واضح** | a11y أُعيد تمكينه |
| TAB16-USB | WebP 1280×800 | 3.7–4.0 | **40–59 kbps** | **واضح** | `capture=false` في القدرات لكن البث يعمل (علم قديم) |
| WIN11-VM | لم يُقَس | — | — | — | **أُقلع نهاية الجلسة** — انظر §4 |
| Android-Emulator | offline | — | — | — | لم يُقلع |

RTT LAN: **0–1 ms**. `/metrics`: `relay_frames_total 17058+`.

### 2.3) تسجيل فيديو >30 دقيقة — **نجح**
- جلسة `e1503966-42b1-4b82-9850-b1b3cc33dacf` على جهاز المالك.  
- MP4: **Duration 00:32:59.29** · H264 · 1600×900 · 7fps · 305 kb/s · **72.2 MB**.  
- المسار: `C:\Users\admin\AppData\Roaming\AiRemote-Server\recordings\e1503966-42b1-4b82-9850-b1b3cc33dacf.mp4`.  
- `maxFrames=0` · `capped=false` · ffmpeg mux نجح. أثناء التسجيل: 13,847 إطار JPEG كامل.

### 2.4) وكيل↔وكيل — **نجح القياس**
- جلسة TECNO → TAB16 `access=view` عبر `POST /api/relay/request` بترويسة **`x-device-token`** (ليست Bearer).  
- قبول باللوحة: `POST /api/relay/:id/decision` بـ JWT admin.  
- تذكرة عرض: `POST /api/relay/:id/view-ticket` → `rt` + `rk`.  
- فتح `/screen?rt=…` استقبل **3 إطارات** (آخرها دلتا 375×39).  
- WIN10-VM كهدف رفض view بـ **`password_required`** (unattended مفعّل عليه — حتى view يطلب كلمة سر الجهاز).

### 2.5) الأدوات والمخرجات الجاهزة
```
outputs/verify-2026-11-19/screen/
├── screen-test.cjs        # smoke | quality | record | full
├── control-test.cjs       # control | quality | rtc | monitors  (يقرأ deviceId وpassword من argv)
├── a2a-ws.cjs             # فتح /screen بتذكرة rt وعدّ الإطارات
├── accept-control.ps1     # UIAutomation لحوار ويندوز (لم يعثر على الحوار)
├── تقرير-بث-الشاشة-2026-11-19.md   # التقرير الكامل المسلَّم
└── out/                   # JSON + لقطات كل جهاز
```
**تشغيل عميل:** `node outputs/verify-2026-11-19/screen/screen-test.cjs smoke <deviceId> [ثوانٍ]`  
**logين:** `https://127.0.0.1:3001/api/auth/login` ثم `POST /api/auth/ws-ticket` (عمر التذكرة 30ث).

---

## 3) الإصلاحات في المصادر (مُلتزمة — **غير مثبتة على الأسطول/3001**)

الالتزام `bc371de`:

| # | العيب | الملف | الإصلاح |
|---|---|---|---|
| 1 | تبديل الجودة على ويندوز **no-op** — عامل GDI يُقلع بـ`-Fps/-Quality` ثابتة | `packages/agent-desktop/main.js` `server:screen_set_quality` | إعادة تشغيل عامل GDI بالمعاملات الجديدة |
| 2 | سقف FPS في `startGdiForSession` كان **15** | نفسه | رفع السقف إلى **30** |
| 3 | لا زر حفظ لقطة في العارض | `ScreenViewer.tsx` + `i18n.ts` (`viewer_snapshot`) | `saveSnapshot()` → PNG من canvas + زر كاميرا |
| 4 | **ثغرة:** إدخال أندرويد (نقر/كيبورد) يُنفَّذ بلا منح | `AgentService.java` | بوابة `grantedSessions` + `sendInputWarningThrottled()` |

**typecheck اللوحة نظيف.**  
**index.html يُقرأ مرة واحدة عند إقلاع 3001** (`fastify.setNotFoundHandler` يخدم النسخة المخزّنة) ⇒ زر اللقطة **لا يظهر دون إعادة تشغيل السيرفر**. لا توقف 3001 إلا بأمر المالك.

---

## 4) ما تبقّى من المهمة — **أنت تكمل هذا**

نفّذ بالترتيب، وبندًا بندًا، وبعد كل بند: قياس + توثيق في `outputs/verify-2026-11-19/screen/` + commit إنجليزي + `pf checkpoint`.

### بند أ — WIN11-VM بث (الأسطول)
1. WIN11 أُقلع نهاية الجلسة السابقة من `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx` (بعد إزالة قفل `.vmx.lck` من محاولة فاشلة).  
2. انتظر `WIN11-VM online` في `/api/devices` (hostname متوقع `DESKTOP-P7Q6D6U` · IP تاريخي 192.168.1.102).  
3. `node …\screen-test.cjs smoke <WIN11_DEVICE_ID> 12` — قياس دقة/fps/kbps + لقطة.  
4. لقطة واضحة = نجاح. دوّن المقاس (متوقع 1920×1080 أو ما يقرأه GDI).

### بند ب — تحكم TECNO (المنح)
**العيب المُشخّص:** كل طلب تحكم يُرفض فورًا `manual_approval_required` لأن `wakeScreenForRemote()` يُطلق **WakeActivity** فوق MainActivity ⇒ `MainActivity.foreground=false` ⇒ `visibleNow()==false` ⇒ المسار يرفض قبل عرض الحوار.  
**المطلوب:**
1. اقرأ `wakeScreenForRemote()` في `AgentService.java` (~سطر 1651) و`WakeActivity.java`.  
2. إن كانت الشاشة صاحية أصلًا: **لا تُطلق WakeActivity** (أو أخرها تأخيرًا ثم أعد فحص `visibleNow`).  
3. هذا إصلاح في المصدر — بعد «عدّل/نفّذ» من المالك.  
4. بعده: `am start MainActivity` → طلب تحكم → اضغط **«السماح»** (النص من `strings.xml` `dlg_allow2`).  
5. بعد المنح: اختبر نقر/كيبورد/رجوع/رئيسية/سطوع — مع بوابة المنحة الجديدة في المصدر (تحتاج بناء APK + تثبيت **بأمر «ثبّت»**).

**بدون بناء:** يمكنك اختبار المنح على الحيّ فقط إن ظهر الحوار (الشاشة صاحية + MainActivity resumed + لا WakeActivity). uiautomator dump كان يعلق أثناء البث — استخدم مهلة قصيرة أو `uiautomator dump /sdcard/x.xml` ثم `cat`.

### بند ج — تبديل الجودة على ويندوز بعد بناء الوكيل
- بعد «ثبّت» وكيل ويندوز: `control-test.cjs <win10Id> quality` يجب أن يغيّر الدقة/الجودة فعليًا (قبل الإصلاح كانت كل الأوضاع 1600×677 ~600kbps).  
- على جهاز المالك كذلك.

### بند د — زر اللقطة في اللوحة
- بعد بناء اللوحة ونسخها إلى `packages/server-desktop/static` + **إعادة تشغيل 3001 بأمر المالك**: الزر يظهر في شريط العارض. اختبر تنزيل PNG.

### بند هـ — WAN طرف-إلى-طرف
- TECNO عليه LTE (`10.72.74.148` على `seth_lte8`) **وWiFi** (`192.168.1.101`) معًا؛ الوكيل متصل `wss://192.168.1.25:3001/ws` ⇒ LAN.  
- لقياس WAN حقيقي: أطفئ WiFi على TECNO (بأمر المالك) وشاهد هل يعيد الاتصال عبر LTE إلى عنوان سيرفر عمومي/نفق. لا نفق مؤكد. **لا تُطفئ WiFi دون أمر.**

### بند و — المحاكي
- `emulator-5554` كان offline. إن وجدت `emulator.exe` في SDK شغّله بموافقة المالك وكرر smoke.

### بند ز — بند اختياري (إن طلب المالك)
- دلتا على GDI (تقليل نطاق ويندوز).  
- فحص تشويش جهاز المالك على شاشة ثانية (ليس نفس الشاشة الملتقطة).

---

## 5) تشخيص تشويش جهاز المالك (مُوثّق — لا تُعِد القياس نفسه)

| | القيمة |
|---|---|
| الشاشة الفيزيائية | **1920×1080** (Intel UHD 620 + NVIDIA 930MX) |
| DPI المطبّق | **168 = 175%** (`HKCU:\Control Panel\Desktop\WindowMetrics` AppliedDPI) |
| المنطقي (Forms) | 1097×617 |
| ما التقطه GDI | **1600×900** (ليست الفيزيائية) |

**التفسير الأرجح:** مشاهدة بث نفس الشاشة الملتقطة + High-DPI 175% + GPU مزدوج = تشويش/تغذية راجعة. لقطات JPEG المحفوظة كانت واضحة. WIN10-VM وTAB16 (بلا High-DPI) نظيفان.  
**اختبار عادل لجهازه:** اعروض البث على شاشة ثانية أو على الهاتف، لا على نفس الشاشة الملتقطة.

---

## 6) الفخاخ التي تصدق (لا تُفتح)

| # | القاعدة |
|---|---|
| 78/82 | a11y أندرويد يُفقَد بعد إعادة تشغيل الوكيل — أعد التمكين: `settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y` + `accessibility_enabled 1` |
| 79 | إذن MediaProjection واحد لكل عملية — بعد force-stop اطلب إذنًا جديدًا |
| 80 | AISHOT 1280×800 لا مربّع |
| 81 | FileBridge — لا تلمسها |
| 83 | `vm-exec` على WIN11 يقطع ~30ث — مهمة مجدولة + قراءة ملف |
| 84 | حد دخول 5/دقيقة على lab-probe — كل `push-file` = دخول |
| 85 | `Display.getRealMetrics()` لا `getDisplayMetrics()` في الخدمة |
| 88 | `server.js` الحيّ ≠ `packages/server` TS |
| 51 | screenshot على TECNO قد يفشل `no frame` — استخدم بث حيّ لا لقطة أمر |

**فخاخ 78–80 مغلقة بكود r19 — لا تُفتح كإصلاح جديد.**

---

## 7) الأجهزة والأدوات

| الجهاز | ID | ملاحظة نهاية الجلسة |
|---|---|---|
| DESKTOP-K81PJ9H | `35850a47-e50f-48f3-bc81-8c38d7a908c0` | جهاز المالك · online · جهازك |
| WIN10-VM | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | online · controlAuth=password · unattended يطلب كلمة سر حتى view |
| TECNO-KL4 | `07f8ae91-5b64-41d9-97df-ce649772b0d3` | online · USB serial `12927374CM001019` · a11y مفعّل |
| TAB16-USB | `7fc54b40-e7c1-4db6-9f55-78f377c4f4ad` | online · USB `GPSZ2025040701858` (unauthorized في adb) |
| WIN11-VM | `d147684b-2451-4418-a628-86f11aa66a4e` | **أُقلع** — أكمل smoke عند online |
| Android-Emulator | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` | offline |

**adb:** `D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe`  
**vmrun:** `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe`  
**ffmpeg:** `C:\Users\admin\AppData\Local\Programs\AiRemote Server\resources\ffmpeg.exe`  
**vm guest:** user=admin pass=123 (من lab-credentials — **لا تطبعها**)  
**بناء أندرويد:** `D:\autoclaw projects\offline-build-tools\android-toolchain` + gradle (بأمر «ثبّت» فقط)  
**keystore:** `…\AiRemote\signing\` — لا تُطبع كلمة المرور.

**أوامر قراءة مسموحة الآن:**
```powershell
curl.exe -k -s https://127.0.0.1:3001/health
node outputs/verify-2026-11-19/screen/screen-test.cjs smoke <id> 10
git -C 'D:\autoclaw projects-new\AiRemote' log --oneline -5
```

---

## 8) الأزرار في العارض (مُحتسبة — لا تُعِد الجرد)

بدء/إيقاف · تحكم (`screen:request_control`) · ملاءمة/ملء/فعلي · ملء شاشة/F11 · تسجيل WebM · تسجيل سيرفر MP4 · تنزيل MP4 · **لقطة PNG (جديد)** · ليزر/تعليقات · حافظة + مزامنة · جودة (5 presets + أصلي + تكيّفي) · شاشات متعددة · أندرويد: رجوع/رئيسية/تطبيقات/تدوير/سطوع · لوحة نص حر · دردشة جلسة · علامة مائية · سحب ملفات.

**جودة presets:** saver 12/55/1280 · balanced 20/72/1920 · high 25/78/1920 · best 30/72/1920 · smooth 30/60/1600.

---

## 9) بروتوكول كل بند تكمله

1. اقرأ هذا الملف + `PROJECT_STATE.md` §0.0 (2026-11-19) + التقرير.  
2. لا تكتب حتى «نفّذ/عدّل/ثبّت».  
3. كل بند: تنفيذ + قياس مُثبت في `outputs/verify-2026-11-19/screen/` + توثيق + commit إنجليزي يحمل رقم البند + `pf checkpoint`.  
4. عند التوقف: `pf checkpoint` + `pf handoff` + حدّث هذا الملف (r21→r22) + ادفع GitHub (`origin` Gitea قد يكون مغلقًا).  

**ممنوع:** ميزة جديدة خارج طلب البث · سرّ في ملف · حذف `server.js` · لمس فخاخ 78–80 كإصلاح · إيقاف 3001 بلا أمر · `docker compose` على الإنتاج.

---

## 10) أوامر جاهزة (قراءة — لا تُشغّل الكاتبة بلا إذن)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
curl.exe -k -s https://127.0.0.1:3001/health
# دخول
$probe = Get-Content 'C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json' -Raw | ConvertFrom-Json
$r = Invoke-RestMethod -Uri 'https://127.0.0.1:3001/api/auth/login' -Method Post -ContentType 'application/json' -Body (@{ email=$probe.email; password=$probe.password } | ConvertTo-Json)
# الأسطول
Invoke-RestMethod -Uri 'https://127.0.0.1:3001/api/devices' -Headers @{ Authorization = "Bearer $($r.accessToken)" }
# بث smoke
node outputs/verify-2026-11-19/screen/screen-test.cjs smoke 35850a47-e50f-48f3-bc81-8c38d7a908c0 12
# WIN11 عند اتصاله
node outputs/verify-2026-11-19/screen/screen-test.cjs smoke d147684b-2451-4418-a628-86f11aa66a4e 12
```

**بناء/تثبيت (بأمر «ثبّت» فقط):** انظر r20 §3.3 (أندرويد gradle) و§3.4 (ويندوز `npx electron-builder` لا السكربت الذي يفشل بالمسافة).

---

## 11) نقطة التوقّف الدقيقة

**حيث وقفت الجلسة السابقة:**
- بث ويندوز/أندرويد/TAB16 مُقاس وواضح.  
- تسجيل 32:59 نجح.  
- وكيل↔وكيل view مُقاس.  
- 4 إصلاحات في المصادر مدفوعة GitHub، **غير مثبتة على الأسطول**.  
- تشويش جهاز المالك مُشخّص DPI 175% + نفس الشاشة.  
- WIN11 أُقلع ولم يُقَس بثه.  
- تحكم TECNO معلّق على عيب WakeActivity يُخفي MainActivity.  
- a11y TECNO مفعّل.  
- Gitea مغلق.

**أول بند تبدأ به الآن (بعد إذن المالك):**  
> انتظر WIN11-VM online ثم `screen-test.cjs smoke d147684b-2451-4418-a628-86f11aa66a4e 12`  
> ثم أصلح `wakeScreenForRemote` (بند ب) بأمر «عدّل».

---

*نهاية r21 — 2026-11-19 · بث الأسطول مُقاس · إصلاحات في المصادر تنتظر «ثبّت» · أكمل من §4 دون إعادة المُنجز.*
