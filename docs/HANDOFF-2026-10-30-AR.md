# حزمة تسليم AiRemote — 2026-10-30 (نهاية جلسة)

**المستودع:** `D:\autoclaw projects-new\AiRemote` · **الفرع:** `checkpoint/3.8.1-2026-10-26` · **الشجرة:** نظيفة
**آخر التزام:** `d424a7a release(3.8.26): electron 44 + fastify 5 + node:sqlite, auth-before-parse, monitor screenshots`
**السيرفر المثبَّت:** `3.8.26` على `https://127.0.0.1:3001` (`/health` = ok · tls · isDesktop)

---

## 1) حالة الإصدارات والأجهزة (مقيسة الآن)

| المكوّن | الإصدار | ملاحظة |
|---|---|---|
| السيرفر المثبَّت | **3.8.26** | Electron 44.3.0 · fastify 5.12.7 · قاعدة عبر `node:sqlite` |
| اللوحة | 3.8.26 | مدمجة في السيرفر |
| وكيل ويندوز | **3.8.25** | WIN10-VM · WIN11-VM — online |
| وكيل أندرويد | **3.8.25** (vc22) | TECNO-KL4 · Android-Emulator — online |
| الحزم في `releases/` | سيرفر 3.8.26 · وكيل 3.8.25 · APK 3.8.25 | الأقدم في `releases/archive` |

**معرّفات الأجهزة (للسكربتات):**
```
WIN10-VM        b42175d0-d0c9-428d-ab94-4e66dff56af3
WIN11-VM        d147684b-2451-4418-a628-86f11aa66a4e
TECNO-KL4       07f8ae91-5b64-41d9-97df-ce649772b0d3   (adb: 12927374CM001019)
Android-Emulator 9b5eeaf9-b30d-449c-875e-1e21e56ac041  (adb: emulator-5554)
```

**فرق إصدار مقصود:** السيرفر 3.8.26 والوكلاء 3.8.25 (تغييرات 3.8.26 سيرفرية بحتة، والبروتوكول لم يتغيّر).
**المهمة الأولى للحساب الجديد:** توحيدها في 3.8.27 (إعادة بناء الوكيل + APK).

---

## 2) ما أُنجز في هذه الجلسة (كل بند بدليل)

### أ) دين i18n — مغلق
| الملف | قبل | بعد |
|---|---|---|
| `components/AiChatPanel.tsx` مواضع/حروف | 114 / 2219 | **0 / 70** (70 = 6 تعابير regex بقصد) |
| `components/ScreenViewer.tsx` مواضع/حروف | 107 / 1870 | **0 / 0** |
| `lib/i18n.ts` مفاتيح `ar`/`en` | 180/180 | **412/412** (`chat_*` 114 · `viewer_*` 118) |

### ب) تسجيل MP4 طويل — أُصلح ومُثبت حياً
- الإطارات تُكتب على **القرص** أثناء التسجيل (`recordings/frames-<id>/`)، لا في الذاكرة. حُذف سقف 600 إطار و250MB.
- `GET /api/recordings/:id/status` → `muxing|mp4|zip|missing`، و`/download` يرد **202** أثناء الترميز.
- **توحيد تنسيق** الإطارات (WebP/JPEG) لأن خلطها في concat كان يقطع المدة، وإعادة وسم بالمحتوى (كانت `ffmpeg exit 69`).
- **الدليل:** تسجيل 180s على WIN11 → `Duration 00:02:56` h264 1280×720 · 738 إطاراً (كان 31).

### ج) تزامن الصوت والصورة
- خط زمني من **توقيت وصول كل إطار** (`ts`) لا شبكة ثابتة.
- `force_keyframe` كل 120ms أثناء التسجيل (الوكيل لا ينفّذ `screen_set_delta` أصلاً).
- إزاحة قابلة للضبط: `%APPDATA%\AiRemote-Server\av-offset.json` → `{"trimMs": 500}` (تقصّ رأس PCM؛ زد/أنقص للمعايرة). يُقرأ عند كل ترميز بلا إعادة تشغيل.
- `-vf scale=trunc(iw/2)*2:trunc(ih/2)*2` للأبعاد الفردية.

### د) الشاشة المستقلة
- إزالة شريط أسود 56px (كان `popout && 'pt-14'` → صار `popout && pinned && 'pt-14'`).
- **قائمة الدقة** في لوحة الجودة: 480p/720p/900p/1080p/1440p/أصلية + حفظ الاختيار، والافتراضي صار 1920px.
- **مؤشر محلي فوري** يتبع اليد (الصورة تُحدَّث 8–20fps) + رفع الإرسال من 30Hz إلى **60Hz**.

### هـ) أندرويد
- **قصّ الشريط الأسود العلوي** من المصدر: يقيس `status_bar_height`/`DisplayCutout`، ويقصّ **فقط إذا كان أسود فعلاً** (عيّنات ≥90%)، ويضيف الإزاحة لإحداثيات اللمس. **الدليل:** 720×1600 → **720×1528** وأول صف فيه محتوى.
- **انقطاع عند عدم الاستخدام:** السيرفر كان يقطع الوكيل بعد 12s بلا pong ويتجاهل النبضات. صار `agent:heartbeat` دليل حياة.

### و) دقة شاشة الجهاز البعيد (ويندوز)
- وكيل: `server:screen_get_resolutions` / `server:screen_set_resolution` عبر PowerShell + P/Invoke إلى `EnumDisplaySettings`/`ChangeDisplaySettingsEx`.
- سيرفر: تمرير كامل + إعادة توجيه `screen:resolutions` / `screen:resolution_applied`.
- لوحة: قسم **«دقة شاشة الجهاز»** في لوحة الجودة.
- **الدليل:** WIN11 29 وضعاً → طبّق `1280x720` → الطلب التالي قرأ `current=1280x720` → أُرجع `1920x1080` (`apply:0`). WIN10 28 وضعاً.

### ز) الترقية الكبرى: Electron 44 + fastify 5 + node:sqlite (3.8.26)
- **المانع السابق سقط:** Electron 44.3.0 يحمل **Node 24.20.0** و`node:sqlite` (DatabaseSync/StatementSync/معاملات مسمّاة) — فلا حاجة لـC++ ولا حجب fastify.
- `lib/db-adapter.js`: واجهة واحدة (`prepare/run/get/all/exec/pragma/transaction`) فوق محرّكين، بمفتاح `AIREMOTE_DB=sqlite3|node`، **وتراجع تلقائي** إلى node:sqlite إذا فشل الأصلي.
- **تكافؤ:** 16/16 استعلاماً متطابقة على نسخة من قاعدة الإنتاج.
- **إصلاح ترتيب الصلاحية:** حارس العمليات المدمّرة انتقل من `preHandler` إلى **`onRequest`** (قبل تحليل الجسم) + قارئ JSON متسامح للجسم الفارغ → رجع 403 بدل 400.
- **البطارية: 21/21** على المجموعة الجديدة.

### ح) لقطات «المراقبة»
- لقطتان 1440×900 (فاتحة/داكنة) بمخططات حقيقية (بطاقات CPU/RAM/Disk/Net + مخطط الشبكة + مخطط CPU&RAM)، عبر CDP على السيرفر الأصلي بعد تثبيت الشهادة في مخزن المستخدم.

---

## 3) الأدوات والسكربتات التي أُضيفت (كيف تُستعمل)

| السكربت | الوظيفة |
|---|---|
| `scripts/probe-record-long.cjs` | تسجيل حقيقي N ثانية على جهاز ثم تنزيل الملف. `LAB_SECONDS` · `LAB_DEVICE` |
| `scripts/probe-resolution.cjs` | قراءة أوضاع الشاشة وتطبيق وضع. `LAB_DEVICE` · `LAB_APPLY=1280x720` |
| `scripts/remote-exec.cjs <device> "<cmd>"` | تنفيذ أمر PowerShell على جهاز عبر `/api/devices/:id/exec` |
| `scripts/push-file.cjs <device> <local> <remote>` | دفع ملف عبر قناة نقل الملفات (شرائح = `chunkSize`) |
| `scripts/boot-check.cjs` | إقلاع السيرفر على محرك/نسخة قاعدة محددة وفحص `/health` + دخول + أجهزة |
| `scripts/db-parity.cjs <db> <out.json>` | تكافؤ المحرّكين على نفس البيانات |
| `scripts/shot-cdp.cjs <dark\|light> <out.png> <deviceId>` | لقطة اللوحة عبر CDP بمخططات حيّة |
| `scripts/uitest-bridge.cjs` | جسر لوحة محلي (HTTP/HTTPS + بروكسي API) — **لا يمرّر WS بنجاح** |
| `tools/display-modes.ps1` | تعداد/تطبيق أوضاع العرض (P/Invoke) للاختبار المباشر |
| `tools/install-agent.bat` + `push-file` | تثبيت وكيل عن بُعد: قتل + `/S` + تشغيل المسار الكامل |
| `scripts/release-manifest.js` | بيان موقّع؛ **يتجاهل** `archive` و`old releases` |

**أدوات خارجية:** `D:\autoclaw projects\offline-build-tools` → `android-toolchain\sdk\platform-tools\adb.exe` · `jdk` · `sdk\build-tools\34.0.0` (apksigner/aapt) · `gradle` · `electron-runtime\electron-v44.3.0-win32-x64.zip`.
**لقطات:** Chrome `C:\Program Files\Google\Chrome\Application\chrome.exe` (headless + CDP).

---

## 4) إعدادات خاصة يجب معرفتها

| الإعداد | القيمة |
|---|---|
| شهادة السيرفر | مثبَّتة في **CurrentUser Root** باسم `CN=AiRemote Server` (حتى 2036). تراجع: `certutil -user -delstore Root "AiRemote Server"` |
| محرّك القاعدة | `AIREMOTE_DB` غير مضبوط ⇒ better-sqlite3، ويسقط تلقائياً إلى `node:sqlite` عند اختلاف ABI |
| إزاحة الصوت | `%APPDATA%\AiRemote-Server\av-offset.json` → `{"trimMs":500}` (أو `AIREMOTE_AV_TRIM_MS`) |
| مفتاح أندرويد | `%APPDATA%\AiRemote\signing\airemote-release.jks` · alias `airemote` · **لا تُطبع كلمته** |
| APK الحالي | `releases/android-agent/AiRemote-Agent-Android-v3.8.25.apk` (vc22) |
| حزم ويندوز | `releases/server-windows/…3.8.26…` · `releases/agent-windows/…3.8.25…` |
| بيانات المختبر | `%APPDATA%\AiRemote\lab-probe.json` — تُقرأ في السكربتات **ولا تُطبع أبداً** |

---

## 5) فخاخ مؤكدة (كل واحدة كلّفت وقتاً فعلاً)

1. **`server.bundle.js` هو ما يُحزم** لا `server.js`: بعد أي تعديل شغّل `node packages/server-desktop/scripts/bundle.js` ثم `electron-builder`، وإلا بنيت حزمة قديمة.
2. **`pnpm install` لـelectron يفشل في postinstall** ولا يُنزّل `dist`: ازرع `node_modules/electron/dist` من `.cache/electron44` واكتب `path.txt` = `electron.exe`.
3. **`better-sqlite3` ABI 119**: لا يصلح لـElectron 44؛ المحوّل يسقط إلى node:sqlite ويطبع `[db] … — using node:sqlite`.
4. **قناة `/exec` تجرّد الاقتباسات المزدوجة** (وسقفها 4000 حرف): استخدم أوامر بلا اقتباس، أو ادفع `.bat` فيه الاقتباسات.
5. **نقل الملفات**: `chunk_size` من الصف (1MB افتراضياً) — 15MB يُرفض `chunk_too_large`. وسياسة التعارض ∈ `skip|rename|replace`.
6. **إعادة تثبيت APK تُلغي إذن MediaProjection**: بعد كل تثبيت افتح التطبيق → «معالج التهيئة» → امنح الالتقاط → اضغط «بدء»، وإلا 0 إطار.
7. **جسر HTTP المحلي لا يمرّر WS**: تظهر «في انتظار بيانات المراقبة». الحل الصحيح: **CDP** على السيرفر الأصلي مع شهادة موثوقة.
8. **CSP `default-src 'self'`** يمنع جلب بيانات من منفذ آخر — لا تحاول cross-origin.
9. **`popout`**: أي حشوة علوية تُرسم كشريط أسود. الشريط محجوز فقط عند تثبيت الأدوات.
10. **تسجيل الشاشة**: بدون `force_keyframe` دوري لا يُحفظ إلا الإطار الكامل النادر (31 إطاراً/90s).
11. **`releases/static`**: `copy-dashboard.js` يلوّث ملفات متتبَّعة؛ أعدها بـ`git checkout -- packages/server-desktop/static`.
12. **رفع الإصدار في 8 مواضع**: `android build.gradle` (versionName+versionCode) · `dashboard/src/lib/version.ts` · `agent-desktop/{main.js,package.json,renderer/chat.html}` · `server-desktop/{package.json,preload.js,server.js SERVER_VERSION}`.

---

## 6) أوامر التحقق السريع (ابدأ بها في الحساب الجديد)
```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -3; git status --short
node scripts/scan-ui-colors.cjs        # 0
node scripts/check-contrast.cjs        # 22/22
node scripts/verify.js                 # 21/21
curl.exe -sk https://127.0.0.1:3001/health
```
**البوابات الحالية:** 0 لون · 22/22 تباين · **21/21 بطارية** · tsc 0 · build ناجح.

---

## 7) ما تبقّى (بالترتيب المقترح)

| # | المهمة | التفصيل |
|---|---|---|
| 1 | **توحيد الإصدار 3.8.27** | رفع الإصدار في المواضع الثمانية → بناء سيرفر + وكيل ويندوز + APK(vc23) → تثبيت على WIN10/WIN11 (استخدم `push-file` + `install-agent.bat`) وعلى TECNO/المحاكي (`adb install -r`) |
| 2 | **تصحيح حقل `version` في `manifest.json`** | ما زال 3.8.25 رغم تحديث البصمات؛ صحّحه ثم `node scripts/release-manifest.js --verify` |
| 3 | **جعل `node:sqlite` هو الافتراضي** | بعد استقرار 3.8.26 أسبوعاً: `AIREMOTE_DB=node` افتراضياً ثم إزالة `better-sqlite3` من الاعتماديات والحزمة |
| 4 | **دقة أندرويد** | الدقة الحالية تُضبط على مستوى البث (`maxWidth`)، وتغيير دقة الجهاز نفسه يحتاج `wm size` (صلاحية shell) — قرار مالك |
| 5 | **تنظيف** | مجلدان فارغان `releases/android` و`releases/agent-android`؛ ومجلد الوكيل القديم `AiRemote-Agent` على الأجهزة الافتراضية (بحاجة موافقة) |

---

## 8) قواعد ملزمة (قرارات المالك)
- Git محلي فقط: **لا push ولا remote**، ولا حذف ملف/جهاز/مستخدم بلا موافقة صريحة.
- لا تُطبع محتويات: `lab-probe.json` · `lab-credentials.txt` · `keystore-password.txt` · رموز الأجهزة.
- لا تُشغّل سيرفراً على قاعدة `%APPDATA%\AiRemote-Server` (المثبَّت يعمل عليها)؛ استخدم نسخة مؤقتة.
- مفتاح أندرويد الإصدار موجود وصالح — لا تُنشئ مفتاحاً جديداً ولا تدوّر كلمة المرور.
- الترخيص MIT يبقى.
