أنت المهندس المسؤول عن استئناف مشروع **AiRemote** على هذا الجهاز نفسه، في حساب جديد.

> **هذا الملف يحلّ محلّ `docs/PROMPT-NEW-ACCOUNT-2026-11-03-3.11.9-FULL-AR.md`.**
> كل ما فيه مُتحقَّق من المستودع والقياسات في 2026-11-03 (الجلسة السابقة انتهت عند 3.12.0).

---

## 0) ماذا تغيّر منذ الملف السابق (اقرأ أولاً — يحكم على ما بعده)

**النسخة الآن 3.12.0** · `versionCode=54` · **الحزمة 44/44** · البيان **25 عنصراً موقّعاً ومطابقاً**
· فرع `hardening/audit-20261102` · **Git محلي فقط (0 remotes)**.

**الجديد منذ 3.11.9 — ست شرائح ملتزمة، كل واحدة بدليلها:**

| الإصدار | الالتزام | ما جرى | الأثر المقيس |
|---|---|---|---|
| 3.11.9 + دليل المؤشر | `0a94a45` | لقطة بشرية للمؤشر (سهم واحد) | تأكيد المالك + `human-check.json` |
| 3.11.10 | `da7e065` | **عامل GDI مُترجم مسبقاً** بـ`csc.exe` | بدء العامل **211ms** وسيطاً مقابل **1216ms** للسكربت |
| 3.11.10 (T11) | `3b54a02` | إعادة تحقق الشاشة الثانية | **محجوب**: `svga.numDisplays` سقف لا مصدر؛ 3 قياسات كلها شاشة واحدة |
| 3.11.11 | `d6b4e17` | **تعافي عامل GDI** (إعادة تشغيل بدل السقوط إلى Chromium) | فجوة الإطارات **5634ms → 1113/1150ms** (إيقاع طبيعي) |
| تنظيف | `c55368f` | أرشفة 3.11.7/3.11.8 إلى `releases/archive/` | البيان 23 → 13 حينها |
| ملاحظات إصدار | `74a09ec` | `docs/RELEASE-NOTES-3.10-3.11.11-AR.md` | وثيقة موجّهة للمستخدم |
| 3.11.12 | `d9805ab` | **استمرارية جلسات relay** (هجرة v5 + D37) | جلسة 20 إطاراً ⇒ `Stop-Process` ⇒ العارض عاد بـ`rk`: **10 إطارات · 621ms** |
| 3.11.13 | `2367a51` | **M0 أساس القياس** (bitrate/RTT/إسقاطات) + D38 | ساكن **0.55Mbps** · كتابة **1.69Mbps** · 1080p ≈**3.2** |
| 3.12.0 (WIP) | `8fec829` | هيكل WebRTC (إشارات + جسر canvas + `/rtc-test`) | لم يكن يعمل — صُحّح لاحقاً |
| 3.12.0 (WIP) | `2d7cf7b` | **نفق WebRTC يعمل** | `TRACK 2077ms` · `connected` · RGB 97/124/160 · RTT 108–470ms |
| أداة | `7b4fdbf` | قراءة `rtc.log` من الضيف | — |

### 0.1 الحالة الحرجة الآن: **M1 ناقصة — لا تُعلن منجزة**

نفق WebRTC يعمل فعلاً (GDI → canvas مخفي → `captureStream` → `RTCPeerConnection` → `<video>`)،
**لكن الأرقام غير قابلة للمقارنة بعد**:
- الدقة يخفضها تقدير النطاق (BWE) إلى **600×252** (بدأت 400×169 وارتفعت مع الحركة).
- الإطارات **1–2fps** لأن الـcanvas يُغذّى بإطارات GDI لا بـ30fps.
- النطاق المقيس 0.02–0.08 Mbps على سطح شبه ساكن — **لا يُقارن** بـ1.69Mbps (خط أساس الكتابة).

**الخطوات الأربع التالية بالترتيب** (تفاصيلها في §5.1):
1. إجبار الدقة الكاملة: `scaleResolutionDownBy = 1` و`maxBitrate = 4e6` في `setParameters`، و**`degradationPreference = 'maintain-resolution'` على `pc.getTransceivers()[0]`** (ليس في setParameters).
2. تغذية الـcanvas بـ15–30fps (رسم كل إطار GDI + إطار أمان).
3. قياس حمل الكتابة عند 1600×677 مقابل **1.69 Mbps**.
4. بعدها فقط: دمج `ScreenViewer` خلف علم + رجوع تلقائي إلى JPEG.

### 0.2 ثلاثة عيوب حقيقية كُشفت وأُصلحت في 3.12.0 — **لا تُعِدها**

1. **رسالة بلا `type`:** معالج مقبس المشاهد في `server.js` لا يملك متغيّراً `type` (يستخدم `msg.type`)،
   فكان السيرفر يرسل `{payload}` بلا نوع ⇒ الوكيل يتجاهلها بصمت. الإصلاح: `type: msg.type`.
2. **`RTCSessionDescription` غير قابل للنسخ** عبر IPC/JSON ⇒ عرض وجواب فارغان. الإصلاح: إرسال
   `{type, sdp}` و`{candidate, sdpMid, sdpMLineIndex}` صريحاً في **الطرفين** (الوكيل والصفحة).
3. **CSP يحجب السكربت:** `script-src 'self'` منع سكربت `/rtc-test` المضمّن ⇒ صفحة صامتة تماماً.
   الإصلاح: تخفيف السياسة **لهذا الطريق وحده** في `onSend`.

### 0.3 تحذيرات حاكمة (مُحدَّثة)

- **لا تلمس مسار الالتقاط** بلا قياس بكسلات قبل/بعد (`dump-frames.cjs` + `frame_stats.py`). حجم الإطار لا يكشف السواد.
- **القاعدة الجديدة (D38):** لا تقيس رقماً من عدّاد لا يمرّ عليه الترافيك. عدّادات 3.11.7 كانت تعدّ مسار JSON فقط
  والإطارات الحقيقية ثنائية ⇒ صفر دائم. أُصلح بـ`noteScreenFrameBytes()`.
- **«الصفحة تُخدم 200» ليست دليلاً على عملها.** CSP أو خطأ JS يجعلها صامتة. الدليل: أثر في السجل أو قياس من داخل الصفحة.
- **بعد تحديث الوكيل/إعادة تشغيل السيرفر:** الوكيل يحتاج **15–25 ثانية** ليعود `online`؛ لا تفسّر `target_offline` كعطب.
- **مثبّت السيرفر يجب أن يكتمل:** مقاطعته تترك مجلد التثبيت بلا `resources` ⇒ السيرفر لا يعمل. أعِد تشغيل `Setup.exe /S` حتى `exit=0` ثم تحقق من وجود `resources\app.asar`.
- **`vmguest.cjs ps` لا يمرّر معاملات:** إن احتجت وضعاً مختلفاً اكتب سكربتاً مستقلاً باسمه (الخرج = اسم السكربت).
- **PowerShell 5.1:** لا backticks ولا `\"` في رسائل `git commit -m`؛ استخدم متغيرات بين علامات مفردة.
- **`mirror-sync.cjs`** يرفض الإخراج داخل المستودع: شغّله من مجلد المشروع الافتراضي مع `--repo`.
- إصدارات Electron: السيرفر **44.3.0** · الوكيل **28.3.3** — لا تخلط node_modules.

---

## 1) بيئة العمل — مسارات كاملة

| العنصر | المسار/القيمة |
|---|---|
| المستودع | `D:\autoclaw projects-new\AiRemote` · فرع `hardening/audit-20261102` · Git محلي فقط |
| آخر التزام | `7b4fdbf` chore(lab) · آخر شريحة وظيفية `2d7cf7b` |
| السيرفر المثبَّت | `https://127.0.0.1:3001` (TLS ذاتي) · `/health` · `/ready` · **3.12.0** |
| تنفيذي السيرفر | `C:\Users\admin\AppData\Local\Programs\AiRemote Server\AiRemote Server.exe` (electron 44.3.0) |
| تنفيذي الوكيل | `C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe` (electron 28.3.3) |
| قاعدة البيانات | `C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db` (قراءة فقط للفحص؛ `node:sqlite`) · `user_version=5` |
| مجلد الأدوات | `D:\autoclaw projects\offline-build-tools\android-toolchain` (adb · jdk · gradle) — `sdk\emulator` مفقود |
| VMware | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` |
| الضيوف | `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` · `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx` |
| أدوات المختبر | `tools\lab\a2a\` (90+ أداة) · `tools\lab\lab.cjs` (جلسة API مُخبَّأة، لا يطبع الرمز) |
| أسرار — **لا تُطبع أبداً** | `%APPDATA%\AiRemote\lab-credentials.txt` · `lab-probe.json` · `signing\keystore-password.txt` · أي JWT/رمز جهاز |

**الأجهزة (آخر قياس):**

| الجهاز | deviceId | ملاحظات |
|---|---|---|
| WIN10-VM | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | 192.168.0.128 · **3.12.0** |
| WIN11-VM | `d147684b-2451-4418-a628-86f11aa66a4e` | 192.168.0.129 · **3.12.0** · الهدف المعتاد للقياس |
| TAB16-USB | `7fc54b40-e7c1-4db6-9f55-78f377c4f4ad` | USB · **vc48/3.11.8** (كود أندرويد لم يتغيّر) · كلمة مرور تحكم من المالك |
| TECNO-KL4 | `07f8ae91-5b64-41d9-97df-ce649772b0d3` | **صار online** في آخر فحص (كان offline) |
| Android-Emulator | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` | online لكن **لا محاكي محلي** — لا تعتمد عليه |

**المضيف:** Wi-Fi `192.168.1.25` · Ethernet `192.168.1.55` · VMnet8 `192.168.0.1`.
**عنوان الخادم للأندرويد:** `wss://192.168.1.25:3001/ws` (أو `adb reverse tcp:3001 tcp:3001`).

---

## 2) المستودع — الجديد في هذه الموجة

**ملفات جديدة:**
- `packages/agent-desktop/lib/capture-gdi-worker.cs` — عامل GDI كبرنامج مستقل (نفس بروتوكول 3.11.9).
- `scripts/build-gdi-worker.cjs` — يترجمه بـ`csc.exe` إلى `lib/bin/capture-gdi-worker.exe` (مستثنى من Git).
- `packages/agent-desktop/rtc.html` — نافذة WebRTC المخفية: canvas ← إطارات GDI ← `captureStream` ← `RTCPeerConnection`.
- `packages/server-desktop/lib/migrations.js` — **هجرة v5** `relay-session-persistence`.
- `tools/lab/a2a/`: `resume-check.cjs` · `bench-gdi.ps1` · `gdi-engine.ps1` · `kill-worker.ps1` ·
  `deny-worker.ps1` · `restore-worker.ps1` · `typing-load.ps1` · `displays.ps1` · `agent-procs.ps1` ·
  `read-rtc-log.ps1` · `swap-31110.ps1` … `swap-31200.ps1` · `reboot-guest.ps1` · `restart-agent.ps1`.
- `outputs/verify-2026-11-03/`: `persist/` · `m0/` · `m0-probe2/` · `m0-typing-dump/` · `recovery/` · `recovery2/` · `t11/` · `cursor/`.
- `docs/`: `CHANGES-2026-11-03-3.11.10-AR.md` · `…-3.11.11-AR.md` · `…-3.11.12-AR.md` · `…-3.11.13-AR.md` · `…-3.12.0-AR.md` · `RELEASE-NOTES-3.10-3.11.11-AR.md`.

**مسارات تُذكر:**
- `/rtc-test` (مضمَّن في `server.js`) — صفحة تشخيص WebRTC تقيس `mbps/fps/rtt` من `getStats`.
- `relay: rtc:start` / `rtc:signal` — تمرير إشارات بين المشاهد والوكيل على نفس مقبس `/screen`.
- `relay_sessions` (جدول) — حالة الجلسة عند كل انتقال؛ الاستعادة عند الإقلاع كـ`suspended` بمهلة `RELAY_BOOT_GRACE_MS` (120s).

**مصادر الإصدار (8 مواضع):** `VERSION` · 4 `package.json` · `build.gradle` (`versionCode` رقمي) · `releases/manifest.json` · `/health`.
**الحارس:** `node scripts/check-version-consistency.cjs`.

---

## 3) الحالة الحالية (تُتحقَّق في §10 ولا تُعاد بناؤها)

- **3.12.0** على السيرفر + وكيلَي ويندوز (كلاهما online).
- **البثّ:** GDI/JPEG يعمل بكفاءة (أول إطار 556–823ms · صفر سواد · 0.2% سواد).
- **relay:** ينجو من إعادة تشغيل السيرفر (هجرة v5 · دليل `persist/persistence.json`).
- **WebRTC:** نفق يعمل ويُعرض فيديو حقيقي — **لكنه ليس المسار المستخدم في المنتج** (لا واجهة ترسله).
- **البوابات:** 44/44 · ألوان 0 · تباين 22/22 · بيان 25 · أول إطار 621/1800.
- **T11:** محجوب بعتاد المضيف (شاشة واحدة) — ثلاثة قياسات موثّقة.
- **APK:** TAB16 على vc48 بلا إعادة تثبيت (مقصود).

---

## 4) القرارات الحاكمة (القائمة الكاملة في `docs/DECISIONS-LOG.md`)

- **D30:** الحساب الجديد لا ينفّذ حتى «ابدأ». · **D31:** Authenticode مؤجَّل. · **D32:** MIT. · **D33:** WebRTC مؤجَّل لـ4.0 (الآن بدأ فعلياً في 3.12.0).
- **D34:** مسار ويندوز = GDI أولاً، Chromium بديل تلقائي؛ أي تغيير في `capture-gdi.*` يوجب قياس بكسلات قبل/بعد.
- **D35:** مؤشر العارض مصدره `screen:cursor` في المشاهدة، والمؤشر المحلي في التحكم.
- **D36:** «أول إطار» = إطار محتوى (فك JPEG وسطوع > 0).
- **D37 (جديد):** جلسات relay تُحفظ في SQLite وتُستعاد `suspended` بمهلة 120s؛ العروض غير المقبولة تُسقط.
- **D38 (جديد):** كل مقياس بثّ يُقاس على المسار الذي يرسل فعلاً؛ خط أساس 3.11.13 هو المرجع الملزم لـM1.
- **D39 (مقترح، لم يُكتب بعد):** «نفق يعمل» ≠ «أداء أفضل»: لا تُعلن مكسب WebRTC قبل قياس 1600×677 مقابل 1.69Mbps.

---

## 5) المتبقي (بالترتيب الإلزامي)

### 5.1 M1 — إكمال WebRTC (الأولوية الأولى)
1. **إجبار الدقة:** في `rtc.html` بعد `addTrack`:
   `params.encodings[0].scaleResolutionDownBy = 1`، ثم **على المتسقّل**: `pc.getTransceivers()[0].degradationPreference = 'maintain-resolution'` — الافتراضي `balanced` يفضّل الإطارات فينزل 1600×677 إلى 400×169 (‎÷4 بالضبط، وهو ما قيس).
   - **شكّ لم يُحسم:** نافذة الوكيل **2×2 بكسل**؛ قد يقيّد Chromium بها سقف الالتقاط. كبّرها إلى 480×270 خارج الشاشة وأعد القياس قبل نسبة الفارق إلى BWE.
   - **زمن فتح النافذة ‎~4.8s** (من `rtc:start` إلى `did-finish-load`)، وأول `TRACK` بعد ~2s من الجهوزية — لا تُفسّره كعطل.
2. **تغذية الـcanvas:** ارسم **كل** إطار GDI (لا تسقط)، وأضف إطار أمان 30fps عند السكون حتى لا ينهار الـfps.
3. **القياس:** نفس سيناريو M0 (كتابة Notepad 22s) عند 1600×677 → قارن بـ**1.69 Mbps** وسجّل في `outputs/verify-<date>/m1/`.
4. **التكامل:** علم تشغيل في `ScreenViewer` (`?rtc=1` أو إعداد)، `<video>` بدل canvas، **مع رجوع تلقائي** إلى JPEG عند فشل ICE أو غياب الفيديو 5s.
5. **بعدها:** M2 (تكيّف WAN 5Mbps/60ms/1% فقد) · M4 (صوت Opus على نفس الـPC) · M5 (TURN + مقارنة A/B ضد CRD).

### 5.2 بند المالك (بانتظار قرار)
- استمرارية relay **مُنجزة** (3.11.12) — بقي قرار: هل تُستأنف الجلسات أيضاً بعد **تحديث الوكيل** (لا فقط السيرفر)؟
- الصوت داخل الجلسة: يبدأ بعد M1/M2 (على `RTCPeerConnection` نفسه، لا فوق WS).

### 5.3 محجوب/خارج النطاق
- **T11** محجوب بعتاد المضيف؛ عند توفّر شاشتين يلزم أولاً **قصّ مستطيل الشاشة في عامل GDI** قبل الاختبار.
- قياس WAN حقيقي (ZeroTier/Tailscale) يحتاج قرار أداة؛ تجربة 5–10 مستخدمين غير ممكنة على هذا المضيف.
- ملاحظات الإصدار: **مُنجزة** حتى 3.11.11 (`docs/RELEASE-NOTES-3.10-3.11.11-AR.md`) — تحتاج تحديثاً لـ3.12.0 عند اعتمادها.

---

## 6) سير العمل (إلزامي)

1. تعديل المستودع عبر **سكربت Node** بضمان «مطابقة واحدة» لكل مقطع (يطبع عدد المطابقات ويتوقف عند الانحراف).
2. **شريحة واحدة = التزام واحد** + دليل في `outputs/verify-<date>/` + `CHANGELOG` + `PROJECT_STATE` + **44/44**.
3. **إن غيّرت كوداً:** ارفع `VERSION` + 4 `package.json` + `versionCode` ثم:
   - سيرفر: `.\tools\lab\a2a\build-server.ps1` ⇒ `Setup.exe /S` **حتى exit=0** ⇒ تشغيل ⇒ `curl /health`.
   - وكيل: `cd packages\agent-desktop; $env:CSC_IDENTITY_AUTO_DISCOVERY='false'; .\node_modules\.bin\electron-builder.cmd --win --x64`
     ⇒ انسخ `releases\agent-windows\win-unpacked\resources\app.asar` إلى الضيف باسم `C:\Users\admin\new-app.asar`
     ⇒ `node tools\lab\a2a\vmguest.cjs ps win11 <swap-….ps1>` (السكربت يقتل الوكيل وينسخ ويشغّل ويتحقق من الحجم).
   - **بعد النقل انتظر 15–25 ثانية** قبل أي طلب جلسة.
4. **بعد أي إقلاع لضيف:** أعد تشغيل الوكيل (`restart-agent.ps1`).
5. **التزامات Git بالإنجليزية**، محلية فقط، لا push.
6. **لا `PASS` بلا دليل مكتوب** — ولاحظ §0.3: الدليل على الطبقة الصحيحة.

---

## 7) أدوات لا تُستبدل

`tools\lab\devs.cjs` (حالة الأجهزة) · `tools\lab\lab.cjs` (جلسة API) · `tools\lab\a2a\vmguest.cjs`
(`probe` · `ps <vm> <file.ps1>` · `shot` · `copyIn/copyOut`) · `dump-frames.cjs` · `frame_stats.py` ·
`cursor-probe.cjs` · `resume-check.cjs` (استئناف جلسة بعد إعادة تشغيل) · `bench-gdi.ps1` (A/B للعامل) ·
`gdi-engine.ps1` (إثبات المحرّك بعملية الأم) · `typing-load.ps1` (حمل قياس واقعي) · `agent-procs.ps1` ·
`read-rtc-log.ps1` · `swap-31200.ps1` · `patch.cjs` · `mirror-sync.cjs` · `build-server.ps1` · `sign-apk.ps1`.

**بوابات:** `verify.js` (44) · `check-version-consistency.cjs` · `scan-ui-colors.cjs` · `check-contrast.cjs` ·
`release-manifest.js --verify` · `check-first-frame.cjs`.

**قاعدة القياس:** الإطار يُقاس **بعد فك الترميز**، والرقم يُقاس على **المسار الذي يرسل فعلاً**.

---

## 8) التفويض للمساعدين (تجربة موثّقة)

- المرآة: `node "<repo>\tools\lab\a2a\mirror-sync.cjs" --repo "<repo>"` **من مجلد المشروع** (512 ملفاً · 10.4MB).
- **تجربة هذه الموجة:** فوّضت جردين (حالة `relaySessions` · مسار إعادة الاتصال) وفشلا **3 مرات** بـ`subagent_execution_failed`.
  الخلاصة العملية: **الجرد الحسّاس أَنجزه في الجلسة الرئيسية**؛ فوّض فقط ما هو عريض وقابل للتحقق (بحث خارجي، مراجعة مستقلة، صياغة).
- أدوات ملفات المساعد محصورة في مساحة العمل؛ `D:\` ممنوع.

---

## 9) قواعد ملزمة (من أخطاء فعلية — تفصيلها في ملفات `docs/CHANGES-*`)

1. Git محلي فقط — لا remote ولا push.
2. لا أسرار في المخرجات — كلمة مرور تحكم TAB16 من المالك، لا تُطبع.
3. PowerShell 5.1 يقرأ UTF-8 كـANSI ⇒ `Get-Content -Encoding UTF8` أو Node. الاقتباس بـ`'...'`.
4. **لا PASS بلا دليل مكتوب**، والقياس على الطبقة الصحيحة.
5. أندرويد: `am force-stop` يُعطّل خدمة الوصول ⇒ أعد تفعيلها.
6. ويندوز: بعد أي إقلاع لضيف أعد تشغيل الوكيل.
7. `datetime('now')` في SQLite = UTC بلا لاحقة.
8. لا إعادة بناء لشيء يعمل، ولا لمس `bin/` · `.cache/` · `node_modules`.
9. `vmrun start … gui` يفشل أحياناً ⇒ `nogui`.
10. **asar:** أي أصل يقرأه process خارجي يُستخرج إلى `%APPDATA%`.
11. **vmguest.ps:** الخرج = اسم السكربت.
12. **ملكية الأجهزة:** طلب جهاز←جهاز يفشل 403 إن اختلفت الملكية.
13. **TDZ:** لا `let/const` يستهلكها استدعاء قبل تعريفها.
14. **اللقطات عبر المتصفح:** تذكرة `rt` عمرها 60 ثانية — خذ اللقطة فوراً.
15. **(جديد) CSP:** أي صفحة جديدة بسكربت مضمّن تحتاج تخفيف سياسة طريقها، وإلا فهي صامتة.
16. **(جديد) IPC/JSON:** الكائنات الخاصة بالمتصفح (`RTCSessionDescription` · `RTCIceCandidate`) لا تُنسخ — مرّر حقولاً صريحة.
17. **(جديد) قفل VMware العالق:** إن رفض `vmrun` بـ«file is already in use» والضيف غير مدرَج، أَزح `.vmx.lck` **بإعادة تسمية** لا حذفاً.

---

## 10) قائمة تحقق الاستئناف (قراءة فقط — نفّذها عند «ابدأ» ثم أعد الجدول وتوقف)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -5; git status --short
curl.exe -sk https://127.0.0.1:3001/health ; curl.exe -sk https://127.0.0.1:3001/ready
node tools\lab\devs.cjs
node scripts\verify.js
node scripts\check-version-consistency.cjs
node scripts\scan-ui-colors.cjs ; node scripts\check-contrast.cjs
node scripts\release-manifest.js --verify
node scripts\check-first-frame.cjs
(Get-Service 'VMware NAT Service').Status
& 'C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe' list
& 'D:\autoclaw projects-offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe' devices
```

**المتوقع:** شجرة نظيفة (عدا `docs/PROMPT-NEW-ACCOUNT-…-AR136.md` غير المتتبَّع) · `/health` = **3.12.0** ·
WIN10+WIN11 online بـ`3.12.0` · TAB16 (وTECNO إن وُصل) · **44/44** · ألوان 0 · تباين 22/22 ·
إصدار PASS (3.12.0 · vc54) · بيان **25 عنصراً** موقّع · أول إطار **621/1800** · NAT Running ·
`vmrun list` يُظهر الضيفين · adb يرى `GPSZ2025040701858`.

**إن خرج البث أسود:** لا تعيد البناء — افحص `outputs/audit-frames/` بـ`frame_stats.py`، ثم سجل الوكيل
(«محرّك GDI نشط (exe)»)، ثم وجود `%APPDATA%\AiRemote Agent\capture-gdi-worker-<sha8>.exe`.

**إن لم يعمل WebRTC:** اقرأ `%APPDATA%\AiRemote Agent\rtc.log` في الضيف أولاً (يُنسخ بـ`read-rtc-log.ps1`)،
ثم تحقق من `/rtc-test` أن `TRACK` ظهر — ولا تُغيّر الشيفرة قبل معرفة أي الطبقات سقطت.

---

## 11) مخرجاتك المطلوبة الآن (بلا تنفيذ)

1. جدول تحقق §10: المتوقع مقابل الفعلي لكل بند.
2. أي انحراف بسطر الدليل (ملف/سطر أو ناتج أمر).
3. تأكيد أنك لم تُعدّل شيئاً وأنك تنتظر «ابدأ».

**بعد «ابدأ»:** ابدأ من §5.1 خطوة 1 (إجبار الدقة) — لا من الصفر، ولا تُعِد بناء ما أُنجز.

---

## 12) ملحق: ما أُنجز في الموجة السابقة (للتوثيق الكامل)

| المجال | الإنجاز | الدليل |
|---|---|---|
| المؤشر | سهم واحد مؤكَّد بشرياً + قياس DOM كامل | `outputs/verify-2026-11-03/cursor/human-check.json` |
| الالتقاط | عامل GDI مُترجم مسبقاً + رجوع ps1 مُثبت بالـACL | `…/warm-exe/worker-startup.json` |
| التعافي | إعادة تشغيل تلقائي للعامل (لا تجميد 5.6s) | `…/recovery/recovery.json` |
| relay | نجاة من إعادة تشغيل السيرفر (هجرة v5) | `…/persist/persistence.json` |
| القياس | bitrate/RTT/إسقاطات + إصلاح عدّادات عمياء | `…/m0/baseline.json` |
| WebRTC | نفق يعمل + 3 عيوب مُصلحة | `docs/CHANGES-2026-11-03-3.12.0-AR.md` |
| T11 | محجوب بدليل ثلاثي | `…/t11/displays.json` + `DECISION-AR.md` |
| الإصدارات | أرشفة 3.11.7/8 + ملاحظات إصدار موجّهة للمستخدم | `releases/archive/` · `docs/RELEASE-NOTES-3.10-3.11.11-AR.md` |
