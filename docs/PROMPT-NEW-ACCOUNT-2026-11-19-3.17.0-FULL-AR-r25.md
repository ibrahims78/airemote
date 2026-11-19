# استئناف AiRemote — 2026-11-19 · الإصدار **3.17.0** — نسخة **r25**

> **هذا الملف يحلّ محلّ r24 وما قبله. مكتوب لحساب جديد بلا ذاكرة — كل ما تحتاجه هنا.**
> الأسطول مثبَّت على 3.17.0 · بنود r21 §4 (أ–د) مُقاسة · المتبقي خطة «الاحترافية الكاملة» في §7–§8.

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا

**لا كتابة (بناء/تثبيت/تعديل/commit/إيقاف 3001) حتى يقول المالك: «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ» · «ثبّت» · «تحقّق ثم قف».**

- **ترخيصك الافتراضي:** قراءة + اختبارات غير كاتبة (`node *.cjs` · `curl /health` · `adb shell dumpsys` للقراءة · `pnpm typecheck`).
- **محظور ما لم يُؤذن لحظيًا:** إطفاء WiFi على TECNO · تشغيل المحاكي · `docker compose` على قاعدة الإنتاج · حذف `server.js`.

---

## 1) الهوية والبيئة

| | |
|---|---|
| المسار | `D:\autoclaw projects-new\AiRemote` |
| الفرع | `feat/screen-unify-3.13.0` |
| GitHub | `git@github.com:ibrahims78/airemote.git` (remote اسمه `github`) |
| Gitea | `http://localhost:3000/...` — **مغلق عادةً**؛ فشل دفعه متوقع |
| الكود الحيّ | `packages/server-desktop/server.js` — **ليس** `packages/server` TS (فخّ 88) |
| السيرفر | `https://127.0.0.1:3001` · `/health` = **3.17.0** · لا توقفه بلا أمر |
| اعتماد الاختبار | `C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json` (email+password) — **لا تطبع أي سرّ** |
| توقيع APK | `C:\Users\admin\AppData\Roaming\AiRemote\signing\` (jks + كلمة مرور في ملف) — لا تطبعها |
| adb | `D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe` |
| gradle/JDK | `D:\autoclaw projects\offline-build-tools\android-toolchain\{gradle,jdk}` |
| vmrun | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` |
| ffmpeg | `C:\Users\admin\AppData\Local\Programs\AiRemote Server\resources\ffmpeg.exe` |
| أدوات القياس | `outputs/verify-2026-11-19/screen/screen-test.cjs` · `control-test.cjs` |
| الأدلة | `outputs/verify-2026-11-19/screen/out/` |
| التسليم السابق | `docs/HANDOFF-20261119-1601.md` |

---

## 2) الحالة المثبتة — لا تُعِدها

### الأسطول (كله 3.17.0)

| الجهاز | ID | ملاحظة |
|---|---|---|
| DESKTOP-K81PJ9H (المالك) | `35850a47-e50f-48f3-bc81-8c38d7a908c0` | وكيل جديد · يحتاج `AGENT_CA_CERT` في user env |
| WIN10-VM | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | controlAuth=password · Session 1 |
| WIN11-VM | `d147684b-2451-4418-a628-86f11aa66a4e` | Session 1 · `192.168.1.102` |
| TECNO-KL4 | `07f8ae91-5b64-41d9-97df-ce649772b0d3` | تحكم ممنوح · a11y مفعّل · LTE+WiFi |
| TAB16-USB | `7fc54b40-e7c1-4db6-9f55-78f377c4f4ad` | WebP دلتا |
| Android-Emulator | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` | **offline** — بموافقة المالك فقط |

### الإصلاحات الحيّة (مثبتة على الأجهزة ومُقاسة)

1. **WakeActivity شرطي** — لا تُطلق فوق شاشة صاحية؛ حوار المنح يظهر فورًا.
2. **`grantedSessions.add` عند المنح** — كان `bc371de` يمنح بلا تسجيل ⇒ `input_warning` دائم.
3. **`String()` كاسر بناء Java** — حُذف.
4. **GDI set-quality** — إعادة تشغيل العامل بالمعاملات الجديدة (كان no-op).
5. **سقف FPS 30** — كان 15.
6. **زر لقطة PNG** في العارض — حيّ على 3001.
7. **بوابة إدخال أندرويد** — لا نقر/كيبورد بلا منحة.

---

## 3) نتائج الاختبارات الكاملة (مجمَّعة — لا تُعِد القياس)

### 3.1 البث

| الجهاز | الترميز | الدقة | FPS | النطاق |
|---|---|---|---|---|
| جهاز المالك | JPEG كامل | 1920×1080 (preset) | 7.2–7.9 | 7.6–8.0 Mbps |
| WIN10-VM | JPEG كامل | 1600×677 | ~1 ساكن · 5.75 saver | 1.3–1.5 Mbps |
| WIN11-VM | JPEG كامل | 1600×677 | ساكن | ~713 kbps |
| TECNO | WebP+دلتا | 720×1600 | 1–3.5 | **142 kbps** |
| TAB16 | WebP+دلتا | 1280×800 | 3.7–4.0 | **52–74 kbps** |

RTT LAN **0–1ms** · `relay_frames_total 17,058+` · `2.07GB` مُرحَّلة.

### 3.2 الجودة (نجح بعد الإصلاح)

| preset | المالك | WIN10 |
|---|---|---|
| saver | 1280×720 · 2,538 kbps | 1280×541 · 535 |
| balanced | 1920×1080 · 8,013 | 1918×811 · 1,270 |
| high | 1920×1080 · 8,017 | 1918×811 · 1,371 |
| best | 1920×1080 · 7,633 | 1918×811 · 1,524 |
| lowband | 640×360 · 284 | 640×271 · 84 |

### 3.3 التحكم

- TECNO: حوار فوري · منح كامل · نقر/كيبورد/رجوع/رئيسية/سطوع/حافظة بلا رفض · 22 إطارًا.
- ويندوز: `bad_password` صحيح · بلا منح كل نقرة تُسقط بتحذير.
- حماية: منحة لكل جلسة · 10 محاولات/دقيقة · جلسة مقبولة لا تُسأل مرتين.

### 3.4 التسجيل واللقطة

- **MP4 32:59.29** · H264 · 1600×900 · 7fps · 305kb/s · **72.2MB** · 13,847 إطارًا · `capped=false`.
- **PNG من العارض 334KB** واضحة (زر اللقطة حيّ).

### 3.5 البنية

- **وكيل↔وكيل:** TECNO→TAB16 view عبر تذكرة `rt` — إطارات وصلت.
- **WebRTC M1:** إشارات تمرّ، مطفأ تجريبيًا.
- **فخّ Session 0:** `vmrun` يشغّل الوكيل في Session 0 ⇒ BitBlt أسود. الحل `schtasks /IT`.

### 3.6 ما لم يُقس بعد

WAN طرف-إلى-طرف · دقة النقر بالبكسل · تعدد الشاشات (شاشة واحدة في المعمل) · ليزر/تعليقات بعمق · المحاكي · دلتا GDI · تشويش جهاز المالك البصري (تشخيص: DPI 175% + مشاهدة نفس الشاشة).

---

## 4) الفخاخ (تحترم حرفيًا)

| # | القاعدة |
|---|---|
| 78/82 | a11y يُفقَد بعد إعادة تشغيل وكيل أندرويد: `settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y` + `accessibility_enabled 1` |
| 79 | MediaProjection واحد لكل عملية — بعد force-stop اطلب إذنًا جديدًا (اضغط «البدء الآن») |
| 80 | AISHOT 1280×800 لا مربّع |
| 81 | FileBridge — لا تلمسها |
| 83 | `vm-exec` على WIN11 يقطع ~30ث — مهمة مجدولة + قراءة ملف |
| 84 | حد دخول lab-probe 5/دقيقة — كل `push-file` = دخول |
| 85 | `getRealMetrics()` لا `getDisplayMetrics()` |
| 88 | `server.js` الحيّ ≠ `packages/server` TS |
| 51 | screenshot على TECNO قد يفشل `no frame` — استخدم البث الحيّ |
| **جديد** | `vmrun runProgramInGuest` = Session 0 ⇒ بث أسود. استخدم `schtasks /Create /IT` في جلسة المستخدم |

**78–80 مغلقة بكود r19 — اختبار عدم انحدار فقط.**

---

## 5) البناء والتثبيت (بأمر «ثبّت» أو ما يأذن به أمر المالك)

### أندرويد
```powershell
$b='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME="$b\jdk"; $env:ANDROID_HOME="$b\sdk"; $env:ANDROID_SDK_ROOT="$b\sdk"
cd 'D:\autoclaw projects-new\AiRemote\packages\android-agent'
& "$b\gradle\bin\gradle.bat" assembleRelease --console=plain
# zipalign -f 4 → apksigner sign --ks ...\signing\airemote-release.jks --ks-key-alias airemote --ks-pass file:...\keystore-password.txt → apksigner verify -v
adb install -r <apk>   # ثم أعد تمكين a11y + وافق MediaProjection
```

### ويندوز
```powershell
cd 'D:\autoclaw projects-new\AiRemote\packages\agent-desktop'
node ../../scripts/build-gdi-worker.cjs
npx electron-builder --win --x64        # لا run-electron-builder.cjs (يفشل بمسافة)
```
- التثبيت على VMs: انسخ الـSetup للضيف ثم `schtasks /IT` (لا `vmrun runProgramInGuest` مباشرة).

### سيرفر/لوحة
```powershell
pnpm --filter @airemote/dashboard build
# copy-dashboard → packages/server-desktop/static → Server Setup → إعادة تشغيل 3001 (بأمر مالك) → تحقق /health
```

---

## 6) بروتوكول كل بند

تنفيذ + **قياس مُثبت في `outputs/verify-2026-11-19/screen/`** + توثيق (CHANGELOG + STATE §12) + commit إنجليزي يحمل رقم البند + `pf checkpoint`.  
عند التوقف: `pf checkpoint` + `pf handoff` + r25→r26 + `git push github feat/screen-unify-3.13.0`.

**ممنوع:** ميزة جديدة خارج البنود · سرّ في ملف · حذف `server.js` · لمس فخاخ 78–80 كإصلاح · ادعاء قياس لم يُشغَّل.

---

## 7) التوصيات للوصول إلى «احترافية كاملة»

| # | التوصية | المشكلة المقيسة | معيار القبول |
|---|---|---|---|
| **P1** | **دلتا على GDI** | ويندوز يرسل إطارًا كاملًا دائمًا ⇒ 5–8 Mbps عند 1080p | نطاق ≤ 1.5 Mbps لشاشة شبه ساكنة · وضوح كامل · 0 إطار تالف |
| **P2** | **رفع FPS ويندوز** | 7–8 مقابل 20–30 مطلوبة؛ الحمل في BitBlt/الترميز | ≥ 15 fps عند 1080p على جهاز المالك (هدف 20) |
| **P3** | **قياس دقة النقر** | لا رقم بكسل حتى الآن | خطأ ≤ 2 px على هدف معروف (قبل/بعد) |
| **P4** | **تعدد الشاشات + ليزر/تعليقات** | مسار موجود، غير مُختبر بعمق | 3 شاشات تُبدَّل بلا انهيار · الليزر يظهر عند المشاهد |
| **P5** | **WAN طرف-إلى-طرف** | غير مُقاس؛ TECNO على WiFi/LAN | جلسة 10 دقائق عبر LTE بلا انقطاع · ≤ 300kbps في saver |
| **P6** | **حسم تشويش جهاز المالك** | DPI 175% + مشاهدة نفس الشاشة | صفر تشويش على شاشة ثانية/هاتف لمدة 10 دقائق |
| **P7** | **WebRTC M1** (اختياري) | إشارات فقط، لا جلسة وسائط | جلسة كاملة أو توثيق قرار الإغلاق |

**ملاحظة منهجية:** P1 وP2 في مسار واحد (عامل GDI + الترميز) — نفّذهما معًا ثم قِس مرة واحدة.

---

## 8) خطة التنفيذ المقترحة (بالترتيب والبوابات)

1. **P1+P2 — كفاءة ويندوز:** اقرأ `packages/agent-desktop/lib/capture-gdi.js` + `capture-gdi-worker.cs` + `main.js` (`startGdiForSession`). أضف دلتا (مناطق متغيرة) وارفع معدل الالتقاط. ابنِ `--dir`، ثبّت على WIN10 أولًا، قِس، ثم المضيف. **بوابة:** نطاق ≤1.5Mbps وFPS ≥15 قبل الانتقال.
2. **P3 — دقة النقر:** هدف معروف (شبكة/نقاط) على WIN10 وTECNO، لقطة قبل/بعد، حساب الخطأ بالبكسل. **بوابة:** ≤2px.
3. **P4 — تعدد الشاشات:** أضف شاشة ثانية لـWIN10-VM، اختبر `screen_get_monitors` والتبديل، ثم الليزر/التعليقات.
4. **P6 — تشويش المالك:** اعرض بث جهازه على TAB16/هاتف ثانٍ 10 دقائق.
5. **P5 — WAN:** **بإذن لحظي** لإطفاء WiFi على TECNO؛ قِس إعادة الاتصال عبر LTE.
6. **P7 — WebRTC:** قرار: استكمال أو إغلاق موثق.

**بوابة عامة:** لا تبدأ بندًا قبل إغلاق سابقه بقياس مكتوب في `outputs/`.

---

## 9) نقطة الاستئناف

- آخر commit: `b6b4a99` (سيليه commit هذا الملف).
- الشجرة نظيفة · 3001 يعمل 3.17.0 · الأسطول 5 أجهزة online.
- **أول بند عند «نفّذ»:** P1+P2 كفاءة ويندوز.

---

*نهاية r25 — 2026-11-19 · أسطول مثبَّت · نتائج كاملة في §3 · خطة الاحترافية في §7–§8 · لا عمل بلا أمر.*
