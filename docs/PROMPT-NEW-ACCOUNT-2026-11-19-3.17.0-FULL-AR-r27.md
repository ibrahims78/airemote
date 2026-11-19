# استئناف AiRemote — 2026-11-19 · الإصدار **3.17.0** — نسخة **r27** (تسليم نهائي)

> **هذا الملف يحلّ محلّ r26 وr25 وكل ما قبلهما.** مكتوب لحساب جديد بلا ذاكرة.
> كل رقم هنا **مقيس في هذه الجولة** على الأجهزة نفسها، ودليله مذكور.
> **لا عمل بلا أمر مالك.**

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا

**لا كتابة (بناء/تثبيت/تعديل/commit/إيقاف 3001) حتى يقول المالك: «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ» · «ثبّت» · «تحقّق ثم قف».**

- **ترخيصك الافتراضي (بلا أمر):** قراءة فقط + اختبارات غير كاتبة (`node --check` · `curl /health` · `adb shell dumpsys` للقراءة).
- **محظور ما لم يُؤذن لحظيًا:** إطفاء WiFi على TECNO · تشغيل المحاكي · `docker compose` على قاعدة الإنتاج · حذف `server.js`.
- **قاعدة المالك الجديدة (2026-11-19):** **ممنوع بث شاشة جهاز المالك (DESKTOP-K81PJ9H) إلى مشاهد على نفس الجهاز.** السيرفر والوكيل على نفس الـPC ⇒ watching your own screen = حلقة تغذية. أي عرض/قياس لجهاز المالك يكون من **مشاهد خارجي** (TAB16 أو WIN11-VM) فقط.

---

## 1) الهوية والبيئة

| | |
|---|---|
| المسار | `D:\autoclaw projects-new\AiRemote` |
| الفرع | `feat/screen-unify-3.13.0` |
| GitHub | `git@github.com:ibrahims78/airemote.git` (remote اسمه `github`) — **مدفوع**: `a51f8d5` |
| Gitea | `http://localhost:3000/ibrahims78/airemote` — **مغلق عادةً**؛ فشل دفعه متوقع |
| الكود الحيّ للسيرفر | `packages/server-desktop/server.js` — **ليس** `packages/server` TS (فخّ 88) |
| السيرفر | `https://127.0.0.1:3001` · `/health` = **3.17.0 · ok** (تحقق أخير 19:14) |
| اعتماد الاختبار | `C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json` — **لا تطبع أي سرّ** |
| اعتماد الضيوف | `C:\Users\admin\AppData\Roaming\AiRemote\lab-credentials.txt` (`email/password/server/vm_guest_user/vm_guest_password/tab16...`) — **لا تطبع** |
| كلمة سر تحكم WIN10 | في `C:\Users\admin\AppData\Roaming\AiRemote\p3-control-password.txt` (خارج المستودع) — أُعيد ضبطها معمليًا هذه الجولة |
| adb | `D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe` |
| gradle/JDK | `D:\autoclaw projects\offline-build-tools\android-toolchain\{gradle,jdk}` |
| vmrun | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` |
| VMX | WIN10: `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` (192.168.1.103) · WIN11: `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx` (192.168.1.102) |
| أدوات القياس | `outputs/verify-2026-11-19/screen/{screen-test.cjs, control-test.cjs, _p1p2-measure.cjs, _p3-click.cjs, _p5-wifi.cjs}` — **غير متتبَّعة** (‏.gitignore) |
| الأدلة | `outputs/verify-2026-11-19/screen/` + `out/` |

> ملاحظة بيئية: `$env:APPDATA` و`$env:LOCALAPPDATA` **فارغان** في قشرة الأدوات. استخدم مسارات مطلقة دائمًا:
> `C:\Users\admin\AppData\Roaming` و`C:\Users\admin\AppData\Local`.

---

## 2) الأسطول (آخر فحص 19:14 — كلها 3.17.0)

| الجهاز | ID | الحالة |
|---|---|---|
| DESKTOP-K81PJ9H (المالك) | `35850a47-e50f-48f3-bc81-8c38d7a908c0` | **online** · asar الجديد (726,368B) · عامل دلتا · لا تَبثّه لنفس الجهاز |
| WIN10-VM | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | **online** · عامل دلتا `capture-gdi-worker-994465d4.exe` (15,872B) · `controlAuth=password` |
| WIN11-VM | `d147684b-2451-4418-a628-86f11aa66a4e` | **online** · **لم يُحدَّث** إلى asar الدلتا |
| TECNO-KL4 | `07f8ae91-5b64-41d9-97df-ce649772b0d3` | **online** · a11y مفعّل · MediaProjection ممنوح · serverUrl=`wss://127.0.0.1:3101/ws` (جسر USB) |
| TAB16-USB | `7fc54b40-e7c1-4db6-9f55-78f377c4f4ad` | **online** · لم يُستخدم كعارض في هذه الجولة |
| Android-Emulator | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` | **offline** — بموافقة المالك فقط |

---

## 3) نتائج r25 §7–§8 — **مقيسة، لا تُعَد**

### P1 — دلتا GDI · نطاق شبه ساكن ≤1.5 Mbps — ✅ **مقفول**

ثلاث نوافذ 12ث على WIN10-VM (1918×810 · JPEG · q72 · maxWidth 1920):

| الجولة | kbps | fps | deltas | keyframes | تالف JPEG | البوابة |
|---|---|---|---|---|---|---|
| win10 | **499.2** | 0.67 | 2 | 6 | **0** | ✅ |
| win10b | **727.2** | 10.0 | 120 | 0 | **0** | ✅ |
| win10c | **1148.7** | 9.08 | 105 | 4 | **0** | ✅ |

**قبل:** إطار كامل دائمًا ⇒ 5–8 Mbps عند 1080p (المالك). **بعد:** مفتاح كل 2ث + دلتا صغيرة.
الدليل: `out/p1p2-win10.json` · `out/p1p2-win10b.json` · `out/p1p2-win10c.json` · لقطات `shot-p1p2-win10*-*.jpg`.

### P2 — رفع FPS ≥15 عند 1080p — ⚠️ **غير مقفول**

| الجولة | النشاط | fps | kbps | الدقة |
|---|---|---|---|---|
| win10 (قديم maxWidth=1600) | نافذة 220×140 متحركة | **6.66** | 2358 | 1600×677 |
| win10b | نفسها | **13.92** | 5330 | 1918×810 |
| win10c | نافذة 48×48 | **12.92** | 3829 | 1918×810 |

سجل العامل: `avgMs 98→216ms` لكل دورة ⇒ سقف `CopyFromScreen` على VMware SVGA 3D، **لا من JPEG** (الدلتا قصّت الترميز).
**جهاز المالك لم يُقس** — بأمر المالك (لا بث نفس الجهاز). البديل: مشاهد خارجي.
الرمز يعمل: `run fps=20 quality=72 maxWidth=1920` يصل العامل (كان يُتجاهل قبل الإصلاح).

### P3 — دقة النقر ≤2px — ✅ **مقفول على WIN10**

| الهدف | المقصود (1918×811) | المؤشر | الخطأ |
|---|---|---|---|
| center | 959,406 | 960,406 | **1px** |
| q1 | 480,203 | 480,203 | **0** |
| q3 | 1439,203 | 1439,203 | **0** |
| q4 | 1439,608 | 1439,609 | **1px** |
| q2 | 480,608 | 480,609 | **1px** |
| edge | 1726,406 | 1727,406 | **1px** |

**maxErr 1px · avg 0.67px** — الطريقة: نسبة 0..1 → `SendInput` 0..65535 → `GetCursorPos` (DPI aware).
الدليل: `out/p3-win10.json` · `out/p3-win10.jpg`.
**TECNO:** تحكم ممنوح (حوار «السماح» فوري) · نقرات أُرسلت على 720×1600 · **رقم بكسل غير مقيس** لأن حقن a11y لا يظهر في `getevent` (mtk-tpd). الدليل `out/p3-tecno.json`.

### P4 — تعدد الشاشات — ⛔ **تجاوَز بالكامل بأمر المالك (لا يُنفَّذ)**

### P5 — WAN LTE 10 دقائق ≤300kbps — ⛔ **مسدود: لا مسار عام**

بإذن المالك أُطفئ WiFi على TECNO:

| المرحلة | النتيجة |
|---|---|
| قبل | wifi_on=1 · wlan0=192.168.1.101 · LTE=10.72.74.148 · tunnel=lan · serverUrl=`wss://127.0.0.1:3101/ws` |
| بعد الإطفاء | wifi_on=0 · wlan0 بلا IP · **الجهاز انقطع** (`الجهاز انقطع اتصاله`) |
| بث saver 120ث | **0 إطار** · device offline |
| بعد الإعادة | wifi_on=1 · TECNO online |

**السبب:** الوكيل يتصل بجسر USB `127.0.0.1:3101 → 3001`. لا نقطة نهاية عامة للسيرفر، فإطفاء WiFi لا يُنتج LTE طرف-إلى-طرف إلى `192.168.1.25`.
الدليل: `out/p5-wifi.json`.

### P6 — تشويش المالك 10 دقائق على شاشة ثانية — ⛔ **غير مقيس**

بأمر المالك: لا بث نفس الجهاز. TAB16 لم يُجهّز كعارض في هذه الجولة.
**البوابة مفتوحة.** التنفيذ الصحيح لاحقًا: مشاهد على TAB16 فقط، 10 دقائق، صفر تشويش.

### P7 — WebRTC M1 — ✅ **مغلق بقرار موثّق**

M1: إشارات `rtc:signal` تمرّ، لا جلسة وسائط، مطفأ تجريبيًا. لا حاجة منتجية مقيسة تبرر استكمال ICE/STUN/TURN. مسار JPEG/دلتا GDI هو الشاحل. يُعاد الفتح عند طلب صوت/فيديو WebRTC حقيقي.

---

## 4) ما تغيّر في الكود (مثبّت على WIN10 + المالك)

| الملف | التغيير |
|---|---|
| `packages/agent-desktop/lib/capture-gdi-worker.cs` | دلتا بلاطات 64px · مستطيل محيط واحد/دورة · مفتاح كل 2000ms · `KEY_RATIO 0.45` · مقارنة بدقة الشاشة (لا تصغير كامل) · `CopyFromScreen` على Bitmap مُعاد استخدامه · `timeBeginPeriod(1)` · `MemCmp` مُدار (لا memcmp P/Invoke) |
| `packages/agent-desktop/lib/capture-gdi.js` | تفكيك ترويسة دلتا 17B (`flags=2` + `u16 rx/ry`) · fps افتراضي **20** · إعادة تشغيل العامل عند تغيّر `fps/quality/maxWidth` (كان no-op) |
| `packages/agent-desktop/main.js` | تمرير `flags/x/y` من العامل إلى `sendScreenFramePacket` · fps افتراضي 20 |

**بروتوكول العامل:** `[u32 len][u16 cx][u16 cy][u16 sw][u16 sh][u8 flags]` + `[u16 rx][u16 ry]` للدلتا. `sw/sh` = **مقاس الخرج الكامل دائمًا** (حتى في الدلتا) كي لا يتقلّص JSON legacy.
**قيد السيرفر:** `queueScreenFrame` يُبقي إطارًا معلّقًا واحدًا ويحمي الإطار الكامل من الاستبدال بدلتا ⇒ **دلتا واحدة لكل دورة التقاط** (لا عدة بلاطات).

**git هذا الجولة:**
```
a51f8d5 docs: handoff 1914 after r26 session close
6375d1b docs: تحديث حالة المشروع بعد نقطة الحفظ
726bc3c r26 close: P1/P3-win10 closed by numbers; P5 no WAN; P6 no same-device; P7 closed
c0d0769 docs: r26 resume
6e11be9 chore: ignore lab helper scripts
8c8fc0d docs: pf state after r25 P1P2 checkpoint
2dc50dc feat(screen): P1 GDI delta + P2 raise fps + P3 win10 click accuracy
```

**البناء والتثبيت:**
```powershell
cd 'D:\autoclaw projects-new\AiRemote\packages\agent-desktop'
node ../../scripts/build-gdi-worker.cjs --force   # 15,872B · sha 994465d4…
npx electron-builder --win --x64                  # Setup 76,406,475B في releases/agent-windows
```
- **NSIS بنفس الإصدار لا يكتب فوق المثبّت** ⇒ التحديث تم بـ**استبدال `app.asar`** من `releases/agent-windows/win-unpacked/resources/app.asar`.
- WIN10: `schtasks /IT` يقتل الوكيل → `copy /Y app.asar` → `start` (فخّ Session 0 محترم).
- المالك: نسخ asar ثم `Start-Process` مع `AGENT_CA_CERT` من user env (فخّ 76).

---

## 5) الفخاخ (تحترم حرفيًا)

| # | القاعدة |
|---|---|
| 78/82 | بعد force-stop أندرويد: `settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y` + `accessibility_enabled 1` |
| 79 | MediaProjection واحد/عملية — بعد force-stop اضغط **«البدء الآن»** (bounds معروفة في اللقطات) |
| 80 | AISHOT 1280×800 لا مربّع |
| 81 | FileBridge — لا تلمسها |
| 83 | `vm-exec` على WIN11 يقطع ~30ث — مهمة مجدولة + قراءة ملف |
| 84 | lab-probe 5 دخول/دقيقة — كل `push-file` = دخول. اجمع العمليات بدخول واحد |
| 85 | `getRealMetrics()` لا `getDisplayMetrics()` |
| 88 | `server.js` الحيّ ≠ `packages/server` TS |
| Session 0 | `vmrun runProgramInGuest` للوكيل = بث أسود. استخدم `schtasks /Create /IT` |
| NSIS | نفس الإصدار لا يكتب فوق المثبت — استبدل asar |
| رفع ملفات | `.asar` مرفوض في نقل الملفات (`invalid_state`) — ارفعه باسم محايد ثم أعد تسميته |
| الطلبات الثنائية | `Content-Type: application/octet-stream` للقطع، وإلا 500 JSON parse |
| السيرفر | إطار معلّق واحد لكل مشاهد — دلتا واحدة/دورة |
| **جديد** | **لا بث شاشة المالك إلى مشاهد على نفس الجهاز** |

---

## 6) المتبقي (لا يُفتح بلا أمر)

1. **P2 على المالك من مشاهد خارجي** (TAB16/WIN11) — قياس FPS 1080p بلا حلقة نفس الشاشة. تحسين محتمل لكسر سقف BitBlt: **DXGI Desktop Duplication** بدل GDI.
2. **P3 TECNO برقم بكسل** — هدف يعرض الإحداثيات (صفحة HTML محلية أو Instrumentation)، لأن a11y لا يمرّ في getevent.
3. **P5 WAN حقيقي** — يحتاج نقطة نهاية عامة (cloudflared/tunnel أو port-forward) ثم إطفاء WiFi بإذن.
4. **P6** — بث المالك على TAB16 10 دقائق، مشاهد خارجي فقط.
5. **WIN11-VM** — تحديث asar الدلتا (لم يُحدَّث).

---

## 7) أوامر جاهزة (عند الأمر فقط)

```powershell
# صحة السيرفر
curl.exe -k -s https://127.0.0.1:3001/health

# قياس P1/P2 لأي جهاز ويندوز
node "D:\autoclaw projects-new\AiRemote\outputs\verify-2026-11-19\screen\_p1p2-measure.cjs" <deviceId> <label>

# قياس P3 نقر ويندوز (كلمة السر من الملف خارج المستودع)
node "D:\autoclaw projects-new\AiRemote\outputs\verify-2026-11-19\screen\_p3-click.cjs" <deviceId> <label> <password>

# نقطة حفظ + تسليم
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 checkpoint -Path "D:\autoclaw projects-new\AiRemote" -Message "<إنجاز مقيس>"
.\pf.ps1 handoff    -Path "D:\autoclaw projects-new\AiRemote"
git -C "D:\autoclaw projects-new\AiRemote" push github feat/screen-unify-3.13.0
```

---

## 8) قواعد كل بند

تنفيذ + **قياس مُثبت في `outputs/verify-2026-11-19/screen/`** + توثيق (CHANGELOG + STATE §12) + commit إنجليزي يحمل رقم البند + `pf checkpoint`.
**ممنوع:** ميزة جديدة خارج البنود · سرّ في ملف متتبّع · حذف `server.js` · لمس فخاخ 78–80 كإصلاح · ادعاء قياس لم يُشغَّل · بث المالك لنفس الجهاز.

---

## 9) نقطة الاستئناف الدقيقة

- **آخر commit مدفوع:** `a51f8d5` على `feat/screen-unify-3.13.0` (GitHub).
- **الشجرة:** نظيفة (سكربتات `_*.cjs` غير متتبَّعة بقصد).
- **السيرفر:** 3001 يعمل 3.17.0 · لم يُوقف.
- **الأسطول:** 5 online · المحاكي offline.
- **الحالة:** P1 وP3-WIN10 مقفولان بالرقم · P2 حد VMware · P5 مسدود بلا WAN · P6 غير مقيس بأمر · P7 مغلق.
- **أول بند عند «نفّذ»:** P2 على المالك من مشاهد خارجي — أو ما يحدده المالك.

---

*نهاية r27 — 2026-11-19 · تسليم نهائي · كل رقم مقيس بدليله · لا عمل بلا أمر.*
