# توحيد الإصدار 3.8.27 — تقرير الدليل (2026-10-30)

**الفرع:** `checkpoint/3.8.1-2026-10-26` · **نقطة البداية:** `73d3d26` · **الشجرة عند البداية:** نظيفة
**الهدف:** توحيد السيرفر والوكيلَين والـAPK على رقم واحد (3.8.27) وبناء الحزم وتثبيتها وتصحيح بيان الإصدارات.

---

## 1) تحقق الاستئناف (قبل أي تعديل)

| الفحص | النتيجة |
|---|---|
| `git log --oneline -3` | `73d3d26` → `d424a7a` → `9697eff` |
| `git status --short` | فارغ |
| `node scripts/scan-ui-colors.cjs` | **0** صنف لون صريح · 12 ملفاً على المكتبة |
| `node scripts/check-contrast.cjs` | **22/22 PASS** |
| `node scripts/verify.js` | **21/21 PASS** |
| `curl /health` | `3.8.26` · tls · isDesktop |
| الأجهزة | الأربعة online على `3.8.25` |

---

## 2) جدول التغيير (الملف \| قبل \| بعد \| أين ذهب)

| الملف | قبل | بعد | أين ذهب |
|---|---|---|---|
| `packages/server-desktop/package.json` | `3.8.26` | `3.8.27` | `app.asar` للسيرفر (المثبَّت والمحزَّم) |
| `packages/server-desktop/server.js` (`SERVER_VERSION`) | `3.8.26` | `3.8.27` | `server.bundle.js` → `/health` و`preload` |
| `packages/server-desktop/server.js` (`AGENT_VERSION`) | **`3.8.7`** | `3.8.27` | روابط تنزيل الوكيل في اللوحة (`/api/downloads/*`) |
| `packages/server-desktop/preload.js` | `3.8.26` | `3.8.27` | نافذة سطح المكتب |
| `packages/dashboard/src/lib/version.ts` | `3.8.26` | `3.8.27` | `index-DO5Tc_Py.js` داخل `static/` والـasar |
| `packages/agent-desktop/package.json` | `3.8.25` | `3.8.27` | `app.asar` للوكيل + `info.agentVersion` |
| `packages/agent-desktop/main.js` | `3.8.25` | `3.8.27` | احتياطي `AGENT_VERSION` |
| `packages/agent-desktop/renderer/chat.html` | `3.8.25` | `3.8.27` | شريط الدردشة في الوكيل |
| `packages/android-agent/app/build.gradle` (`versionName`) | `3.8.25` | `3.8.27` | APK vc23 |
| `packages/android-agent/app/build.gradle` (`versionCode`) | `22` | `23` | APK vc23 (ترقية في المكان) |
| `tools/install-agent.bat` | `ag3825.exe` مثبَّت | يقبل اسم الحزمة (`%1`) واحتياطياً `ag3827.exe` | أداة التثبيت عن بُعد |

> **موضع تاسع لم يذكره التسليم:** `AGENT_VERSION` في `server.js` كان `3.8.7`، أي أن زر «تنزيل الوكيل» في اللوحة يشير إلى `AiRemote-Agent-v3.8.7-Windows-x64.zip` غير الموجود. صُحّح إلى `3.8.27` في هذه الشريحة.

---

## 3) الحزم المبنية (المصدر: `releases/manifest.json` الموقَّع)

| الحزمة | الحجم (بايت) | SHA-256 (32 حرفاً) |
|---|---|---|
| `server-windows/AiRemote-Server-Setup-v3.8.27-x64.exe` | 159,383,880 | `14eb90da1db5063443d2f04049842703` |
| `server-windows/AiRemote-Server-v3.8.27-Windows-x64.zip` | 212,109,428 | `0d9fabe501abb9b7abc3710c2f828f09` |
| `agent-windows/AiRemote-Agent-Setup-v3.8.27-x64.exe` | 76,363,698 | `f416cadd0d5db6d1f8ce88564a084751` |
| `agent-windows/AiRemote-Agent-v3.8.27-Windows-x64.zip` | 103,969,643 | `a3dcaf951a97c93a29ab3445bbe9c095` |
| `android-agent/AiRemote-Agent-Android-v3.8.27.apk` | 152,759 | `8fc24560582a98f538548fd0803f335d` |

**تحقق الواجهة:** `/api/downloads/version` = `{"version":"3.8.27"}` — أي أن زر «تنزيل الوكيل» صار يشير إلى الحزمة الموجودة فعلاً.

**تحقق المحتوى:** `app.asar` للسيرفر = `SERVER_VERSION "3.8.27"` و`AGENT_VERSION "3.8.27"` وأصل اللوحة `index-DO5Tc_Py.js`.
**الـAPK:** `versionCode=23` · `versionName=3.8.27` · الموقّع `CN=AiRemote Agent, OU=Engineering, O=AiRemote, C=SY` · بصمة SHA-256 `a776659a…b05d500` (المفتاح نفسه، بلا تدوير).

---

## 4) التثبيت والتحقق الطرفي

| المكوّن | قبل | بعد | الدليل |
|---|---|---|---|
| السيرفر (محلي) | 3.8.26 | **3.8.27** | `/health` → `{"status":"ok","version":"3.8.27","tls":true,"isDesktop":true}` · `app.asar` المثبَّت = 3.8.27 |
| WIN10-VM | 3.8.25 | **3.8.27** | `info.agentVersion` بعد `install-agent.bat` |
| WIN11-VM | 3.8.25 | **3.8.27** | `info.agentVersion` بعد `install-agent.bat` |
| TECNO-KL4 | 3.8.25 (vc22) | **3.8.27 (vc23)** | `dumpsys package` = 23/3.8.27 · بث حي **252 إطاراً / 16.8 fps / 86.3 KB** |
| Android-Emulator | 3.8.25 (vc22) | **3.8.27 (vc23)** | `dumpsys package` = 23/3.8.27 · بث حي **24 إطاراً** (شاشة ساكنة) |

**ملاحظات تشغيلية مؤكدة أثناء التنفيذ:**
- `taskkill /IM "AiRemote Server.exe"` بلا `/F` **لم يُنهِ** العملية (أربع عمليات Electron بقيت حية) → لزم `/F`. أي أن الإغلاق اللطيف عبر رسالة النافذة لا يعمل على هذا المثبَّت.
- نقل الوكيل: `chunkSize` = 1MB، والحزمة 76,363,698 بايت وصلت كاملة على الجهازين (تحقق `Get-ChildItem` على الجهاز).
- بعد `adb install -r` على TECNO: بقي رمز الجهاز وعنوان السيرفر (تثبيت في المكان، التوقيع نفسه)، وأُعيد منح التقاط الشاشة عبر «معالج التهيئة» ثم «البدء الآن».
- على المحاكي: نافذة موافقة الالتقاط تُلغى فوراً عند فتحها من الواجهة (سلوك موثَّق سابقاً)؛ رُفع `appops PROJECT_MEDIA` إلى `allow` فأصبح الالتقاط يعمل ويُنتج إطارات.

---

## 5) تصحيح `releases/manifest.json`

| | قبل | بعد |
|---|---|---|
| `version` | `3.8.25` | **`3.8.27`** (يُقرأ من `server-desktop/package.json`) |
| الحزم المدرجة | 3.8.25 فقط | 5 حزم 3.8.27 |
| `--verify` | — | **signature OK · all artifacts match** |

الحزم المتجاوَزة (3.8.25 و3.8.26) **نُقلت** إلى `releases/archive/<component>/` (لم يُحذف شيء) ليبقى البيان للنسخة المنشورة فقط.

---

## 6) البوابات

| البوابة | النتيجة |
|---|---|
| `scan-ui-colors.cjs` | 0 |
| `check-contrast.cjs` | 22/22 |
| `verify.js` | **21/21 PASS** (`verify.log` في هذا المجلد) |
| `tsc` / build | 0 أخطاء — مدمجة في `verify.js` (build shared · ai-engine · server · agent · typecheck dashboard) |

---

## 7) ما لم يُنفَّذ ولماذا

| البند | السبب |
|---|---|
| **د) جعل `node:sqlite` افتراضياً وإزالة `better-sqlite3`** | الشرط المكتوب في التسليم: **استقرار 3.8.26 أسبوعاً**. 3.8.26 ثُبِّت أمس، وشريحة الإزالة تغيّر محرّك قاعدة الإنتاج و`files`/`asar` — تُنفَّذ بعد انقضاء الأسبوع وبقياس تكافؤ جديد. |
| حذف المجلدين الفارغين `releases/android` و`releases/agent-android` | الحذف يحتاج موافقة صريحة (قاعدة ملزمة). |
| حذف مجلد الوكيل القديم `AiRemote-Agent` على الـVMs | يحتاج موافقة صريحة. |
| دقة جهاز أندرويد على مستوى `wm size` | قرار مالك (صلاحية shell) — لم يُطلب في هذه الشريحة. |

---

## 8) نقطة الاستئناف

**السيرفر والوكلاء الأربعة واللوحة على 3.8.27 · البيان موقَّع ومتحقَّق · البوابات خضراء · المتبقي: بند (د) بعد أسبوع استقرار، وتنظيف يحتاج موافقة.**
