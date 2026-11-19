# استئناف AiRemote — 2026-11-19 · الإصدار **3.17.0** — نسخة **r28** (تسليم نهائي)

> **هذا الملف يحلّ محلّ r27 وكل ما قبله.** مكتوب لحساب جديد بلا ذاكرة.
> كل رقم هنا **مقيس في هذه الجولة** ودليله مذكور. **لا عمل بلا أمر مالك.**

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا

**لا كتابة (بناء/تثبيت/تعديل/commit/إيقاف 3001) حتى يقول المالك: «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ» · «ثبّت» · «تحقّق ثم قف».**

- **ترخيصك الافتراضي (بلا أمر):** قراءة فقط + اختبارات غير كاتبة (`node --check` · `curl /health` · `adb shell dumpsys` للقراءة).
- **محظور ما لم يُؤذن لحظيًا:** إطفاء WiFi على TECNO · تشغيل المحاكي · `docker compose` على قاعدة الإنتاج · حذف `server.js`.
- **قاعدة المالك (2026-11-19):** **ممنوع بث شاشة جهاز المالك (DESKTOP-K81PJ9H) إلى مشاهد على نفس الجهاز.** السيرفر والوكيل على نفس الـPC ⇒ watching your own screen = حلقة تغذية. أي عرض/قياس لجهاز المالك يكون من **مشاهد خارجي** (TAB16 أو WIN11-VM) فقط.

---

## 1) الهوية والبيئة

| | |
|---|---|
| المسار | `D:\autoclaw projects-new\AiRemote` |
| الفرع | `feat/screen-unify-3.13.0` |
| GitHub | `git@github.com:ibrahims78/airemote.git` (remote اسمه `github`) |
| Gitea | `http://localhost:3000/ibrahims78/airemote` — **مغلق عادةً**؛ فشل دفعه متوقع |
| الكود الحيّ للسيرفر | `packages/server-desktop/server.js` — **ليس** `packages/server` TS (فخّ 88) |
| السيرفر | `https://127.0.0.1:3001` · `/health` = **3.17.0 · ok** (تحقق 21:36 محلي) · **لم يُوقف ولا يُوقَف بلا أمر** |
| اعتماد الاختبار | `C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json` — **لا تطبع أي سرّ** |
| اعتماد الضيوف | `C:\Users\admin\AppData\Roaming\AiRemote\lab-credentials.txt` — **لا تطبع** |
| كلمة سر تحكم WIN10 | `C:\Users\admin\AppData\Roaming\AiRemote\p3-control-password.txt` (خارج المستودع) |
| adb | `D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe` |
| vmrun | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` |
| VMX | WIN10: `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` · WIN11: `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx` |
| أدوات القياس (غير متتبَّعة) | `outputs/verify-2026-11-19/screen/{_p1p2-measure.cjs,_p3-click.cjs,_p3-tecno5.cjs,_p6-proxy.cjs,_p6-open.cjs,_p6-shoot.cjs,_p6.html}` |
| الأدلة | `outputs/verify-2026-11-19/screen/` + `out/` |

> **ملاحظة بيئية:** `$env:APPDATA` و`$env:LOCALAPPDATA` **فارغان** في قشرة الأدوات. استخدم مسارات مطلقة:
> `C:\Users\admin\AppData\Roaming` · `C:\Users\admin\AppData\Local`.

---

## 2) الأسطول (آخر فحص هذه الجولة)

| الجهاز | ID | الحالة |
|---|---|---|
| DESKTOP-K81PJ9H (المالك) | `35850a47-e50f-48f3-bc81-8c38d7a908c0` | **online** · asar الدلتا 737,068B · عامل `capture-gdi-worker-5b21742b.exe` (18,944B) · **لا تَبثّه لنفس الجهاز** |
| WIN10-VM | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | **online** · عامل `994465d4` (القديم — لم يُحدَّث إلى DIB) · `controlAuth=password` |
| WIN11-VM | `d147684b-2451-4418-a628-86f11aa66a4e` | **online** · **حُدِّث إلى asar 737,068B + عامل `5b21742b`** |
| TECNO-KL4 | `07f8ae91-5b64-41d9-97df-ce649772b0d3` | **online** · a11y **مُعاد تمكينه** هذه الجولة · MediaProjection ممنوح · `serverUrl=wss://127.0.0.1:3101/ws` (جسر USB) · adb serial `12927374CM001019` |
| TAB16-USB | `7fc54b40-e7c1-4db6-9f55-78f377c4f4ad` | **online** · adb serial `GPSZ2025040701858` — **مُرخَّص الآن** · الشاشة 1280×800 landscape · **Chrome** موجود · **FileBridge مفتوح في split-screen — لا تلمسه (فخّ 81)** |
| Android-Emulator | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` | **online** — بموافقة المالك فقط · **لم يُستخدم** |

---

## 3) ما أُنجز هذه الجولة (r27 → r28) — مقيس ومُثبت

### P2 — FPS ≥15 عند 1080p على المالك من مشاهد خارجي — ✅ **مقفول**

| المقياس | القيمة |
|---|---|
| fps (نافذة 12ث · نشاط) | **15.66** (timestamps 15.59) |
| الدقة | **1920×1080** |
| kbps | 1365.3 |
| JPEG تالف | **0** |
| المشاهد | `DESKTOP-P7Q6D6U` (WIN11-VM) — `sameDeviceAsTarget=false` · `rendered=false` |

- **السبب المقيس للسقف القديم (10.33–10.65fps):** `LockBits` في `DiffBBox` كان ينسخ ~16MB/دورة على 1080p. ليس JPEG وليس Node.
- **الإصلاح:** `packages/agent-desktop/lib/capture-gdi-worker.cs` — التقاط **DIB section** (`CreateDIBSection`+`BitBlt`، مؤشر بكسل دائم) + فرق **`memcmp` أصلي** (msvcrt). Fallback إلى GDI+ القديم. بروتوكول الدلتا 17B **لم يتغيّر**.
- **الأرقام الأرضية:** `CopyFromScreen` وحدها 25.4fps · BitBlt على DIB **29.9fps** · memcmp 8MB **0.05ms** · عامل قديم معزول 10.33fps · DIB معزول **18.33fps**.
- **العامل:** `capture-gdi-worker-5b21742b.exe` · 18,944B · sha256 `5b21742bc8692f17…` · asar **737,068B** (المالك + WIN11).
- **الدليل:** `outputs/verify-2026-11-19/screen/r27-P2-owner-تنفيذ-2026-11-19.md` · `out/p2-owner-from-win11.json` · `out/p2-owner-stdout2.txt` · `out/shot-p2-owner-active-1920x1080.jpg`.
- **commit:** `6e1b93c` · **checkpoint:** `8213bf1`.

### P3-TECNO — دقة النقر ≤2px برقم بكسل — ✅ **مقفول**

| الهدف | المقصود (720×1600) | المُبلَّغ | الخطأ |
|---|---|---|---|
| center | 360,800 | 360,800 | **0** |
| q1 | 180,480 | 180,480 | **0** |
| q3 | 504,480 | 504,480 | **0** |
| q4 | 504,1280 | 504,1280 | **0** |
| q2 | 180,1280 | 180,1280 | **0** |
| mid | 360,640 | 360,640 | **0** |

- **maxErr 0px · avg 0px** · تحكم ممنوح · density 320 (DPR=2).
- **الطريقة:** صفحة HTML محلية تعرض `CLICK screenX*devicePixelRatio, screenY*devicePixelRatio` + نقرات مسار المنتج `screen:mouse_event` → `dispatchGesture`.
- **فخّ 78 (اختبار، ليس إصلاحًا جديدًا):** a11y كان **معطّلًا** (`accessibility_enabled=0`) ⇒ النقرات لم تصل. أُعيد تمكينه بلا force-stop:
  ```
  settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y
  settings put secure accessibility_enabled 1
  ```
- **الدليل:** `outputs/verify-2026-11-19/screen/r27-P3-TECNO-تنفيذ-2026-11-19.md` · `out/p3-tecno-pixel.json` · لقطات `out/p3pix-*.png`.
- **commit:** `3031d84` · **checkpoint:** `86341ed`.

### WIN11-VM asar — ✅ **مكتمل** (البند 5 من r27)

- asar 737,068B · `copy_exit=0` · online بعد **12ث** · عامل `capture-gdi-worker-5b21742b.exe` (18,944B) مُستخرج في `%APPDATA%\AiRemote Agent`.
- التثبيت عبر **مهمة مجدولة `/IT`** (فخّ Session 0) لا `vmrun runProgramInGuest`.
- **commit:** `f2642e7`.

### P6 — بث المالك 10 دقائق على TAB16 — ⚠️ **غير مقفول (المسار مُثبت، الجلسة 10د لم تكتمل)**

**ما أُثبت بالرقم:**
- مسار العرض على TAB16 يعمل: **Chrome كانوس/WebSocket** عبر بروكسي محلي.
- لقطة `out/p6j.png` (21:29 محلي): **LIVE · 5.9 fps · 1920×1080 · bad=0** — شاشة المالك واضحة (ريل Facebook + شريط المهام + ساعة 9:29PM 2026-11-19).
- لقطة `out/p6g.png`: أول إطار حيّ ظهر خلف حوار «فتح بواسطة».

**لماذا لم تُقفل:**
- بروكسي WS على المنفذ **8899** (`_p6-proxy.cjs`) مطلوب لأن **Chrome يرفض WSS بشهادة ذاتية** (`CLOSED 1006`).
- سكربت اللقطات `_p6-shoot.cjs` (10 دقائق، لقطة كل 30ث إلى `p6s-dN.png`) **لم يُنتج أي ملف** — لم تُتحقّق الجلسة المتصلة.
- لذا: **البوابة (10 دقائق · صفر تشويش) مفتوحة**. لا تدّعِ قفلها.

**قيود تشغيلية مكتشفة على TAB16:**
- الشاشة **split-screen** وفيها **FileBridge** — **لا تلمس FileBridge (فخّ 81)**.
- سحب الفاصل لليسار **أغلق Chrome وكبّر FileBridge** — لا تسحب الفاصل.
- حوار «فتح بواسطة» يظهر عند `am start VIEW` — اختر **«مرة واحدة فقط»** (أو Chrome) بـ`input tap 175 502`.
- `adb shell am start ... -p com.android.chrome` يفشل (`-p: not found` — تمرير عبر sh). استخدم `adbT([...])` بمصفوفة وسائط (لا سلسلة).

**الدليل:** `out/p6j.png` · `out/p6g.png` · `out/p6.html` · `_p6-proxy.cjs` · `_p6-open.cjs` · `_p6-shoot.cjs`.

---

## 4) الأوامر الجاهزة — استئناف P6 (عند الأمر فقط)

```powershell
# 0) صحة السيرفر
curl.exe -k -s https://127.0.0.1:3001/health

# 1) بروكسي WS (نافذة/خلفية) — المنفذ 8899
node "D:\autoclaw projects-new\AiRemote\outputs\verify-2026-11-19\screen\_p6-proxy.cjs"

# 2) فتح المشاهد على TAB16 (يولّد ticket جديد ويفتح Chrome)
node "D:\autoclaw projects-new\AiRemote\outputs\verify-2026-11-19\screen\_p6-open.cjs"

# 3) على TAB16: اقبل «فتح بواسطة» → مرة واحدة فقط
adb -s GPSZ2025040701858 shell input tap 175 502

# 4) Fullscreen (زر أسفل يمين)
adb -s GPSZ2025040701858 shell input tap 1200 700

# 5) جلسة 10 دقائق + لقطة كل 30ث → p6s-dN.png
node "D:\autoclaw projects-new\AiRemote\outputs\verify-2026-11-19\screen\_p6-shoot.cjs"

# 6) تحقّق أن اللقطات كُتبت فعلًا BEFORE أي ادعاء
Get-ChildItem "D:\autoclaw projects-new\AiRemote\outputs\verify-2026-11-19\screen\out\p6s-*.png" | Measure-Object
```

**بوابة P6:** 10 دقائق متصلة · **صفر تشويش** على شاشة TAB16 · لقطات بداية/وسط/نهاية في `outputs/verify-2026-11-19/screen/`.
**ثم:** توثيق + commit إنجليزي `P6 ...` + `pf checkpoint`.

---

## 5) الفخاخ (احترمها حرفيًا)

| # | القاعدة |
|---|---|
| 78/82 | بعد force-stop أندرويد: `settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y` + `accessibility_enabled 1`. **تحقّق دائمًا قبل قياس P3** — كان معطّلًا هذه الجولة. |
| 79 | MediaProjection واحد/عملية — بعد force-stop اضغط «البدء الآن». |
| 80 | AISHOT 1280×800 لا مربّع. |
| 81 | **FileBridge — لا تلمسها** (مفتوحة على TAB16 في split). |
| 83 | `vm-exec` على WIN11 يقطع ~30ث — مهمة مجدولة + قراءة ملف. |
| 84 | lab-probe 5 دخول/دقيقة — كل `push-file` = دخول. اجمع العمليات بدخول واحد. |
| 85 | `getRealMetrics()` لا `getDisplayMetrics()`. |
| 88 | `server.js` الحيّ ≠ `packages/server` TS. |
| Session 0 | `vmrun runProgramInGuest` للوكيل = بث أسود. استخدم `schtasks /Create /IT`. |
| NSIS | نفس الإصدار لا يكتب فوق المثبت — استبدل asar. |
| رفع ملفات | `.asar` مرفوض في نقل الملفات (`invalid_state`) — ارفعه باسم محايد ثم أعد تسميته. |
| الطلبات الثنائية | `Content-Type: application/octet-stream` للقطع، وإلا 500 JSON parse. |
| السيرفر | إطار معلّق واحد لكل مشاهد — دلتا واحدة/دورة. |
| **جديد** | **Chrome على أندرويد يرفض WSS بشهادة ذاتية (1006)** ⇒ استخدم بروكسي `ws://` على 8899. |
| **جديد** | **لا تسحب فاصل split-screen على TAB16** — يغلق Chrome ويكبّر FileBridge. |
| **جديد** | **`adb shell am start ... -p` يفشل** — مرّر الوسائط كمصفوفة، لا كسلسلة. |

---

## 6) الحالة الكاملة للبنود

| البند | الحالة | الرقم |
|---|---|---|
| P1 دلتا GDI | ✅ مقفول | 499–1149 kbps · 0 تالف (WIN10) |
| P2 FPS 1080p | ✅ **مقفول (المالك)** | **15.66 fps @1920×1080 من WIN11** |
| P3 WIN10 | ✅ مقفول | maxErr **1px** |
| P3 TECNO | ✅ **مقفول** | maxErr **0px** (6 أهداف) |
| P4 تعدد الشاشات | ⛔ تجاوَز بأمر المالك | — |
| P5 WAN LTE | ⛔ **مسدود** | لا مسار عام · جسر USB 3101 لا يُنتج LTE |
| P6 تشويش 10د | ⚠️ **مفتوح** | المسار حيّ (5.9fps·1920×1080·bad=0) — الجلسة 10د لم تكتمل |
| P7 WebRTC M1 | ✅ مغلق بقرار | إشارات فقط، لا وسائط |

---

## 7) قواعد كل بند

تنفيذ + **قياس مُثبت في `outputs/verify-2026-11-19/screen/`** + توثيق (CHANGELOG + STATE §12) + **commit إنجليزي يحمل رقم البند** + `pf checkpoint`.
**ممنوع:** ميزة جديدة خارج البنود · سرّ في ملف متتبَّع · حذف `server.js` · لمس فخاخ 78–80 كإصلاح · ادعاء قياس لم يُشغَّل · بث المالك لنفس الجهاز.

---

## 8) الإسناف عند التوقف

```powershell
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 checkpoint -Path "D:\autoclaw projects-new\AiRemote" -Message "r28: <إنجاز مقيس>"
.\pf.ps1 handoff    -Path "D:\autoclaw projects-new\AiRemote"
git -C "D:\autoclaw projects-new\AiRemote" push github feat/screen-unify-3.13.0
```

+ حدّث `PROJECT_STATE` §0.1 و§12 + ارفع رقم r (r28 → r29).

---

## 9) نقطة الاستئناف الدقيقة

- **آخر commits:** `f2642e7` (WIN11 asar) ← `86341ed` (P3 checkpoint) ← `3031d84` (P3) ← `6e1b93c` (P2).
- **الشجرة:** نظيفة (سكربتات `_*.cjs` و`_*.cmd` غير متتبَّعة بقصد).
- **السيرفر:** 3001 يعمل 3.17.0 · **لم يُوقف**.
- **كل العمليات الخلفية أُوقفت** (بروكسي 8899 · لاقط اللقطات · بايثون) قبل التسليم.
- **أول بند عند «نفّذ»:** **إكمال P6** — 10 دقائق على TAB16 مع تحقّق اللقطات، أو ما يحدده المالك.

---

*نهاية r28 — 2026-11-19 · P2 وP3-TECNO مقفولان بالرقم · WIN11 محدَّث · P6 مساره مُثبت وجلسة العشر دقائق مفتوحة · لا عمل بلا أمر.*
