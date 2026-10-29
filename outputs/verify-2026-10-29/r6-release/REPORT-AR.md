# 3.8.13 — البناء والتثبيت والتحقق

**التاريخ:** 2026-10-29 · **الفرع:** `checkpoint/3.8.1-2026-10-26`
**الحالة:** **مثبَّت ويعمل** — السيرفر والوكلاء الأربعة على 3.8.13

---

## 1. رفع الإصدار (8 مواضع)

`server-desktop/package.json` · `server.js SERVER_VERSION` · `preload.js` · `agent-desktop/package.json` · `agent main.js` (احتياطي) · `chat.html` · `dashboard/lib/version.ts` · `android versionName`.

التعليقات التاريخية `v3.8.12` لم تُمس.

## 2. الحزم (النهائية)

| الحزمة | الحجم | SHA-256 |
|---|---:|---|
| `AiRemote-Server-Setup-v3.8.13-x64.exe` | 121,209,665 | `6fbd333d0ca846a6b0871c522f14972b2ac93d3125517c5acdcee227dd412ebf` |
| `AiRemote-Agent-Setup-v3.8.13-x64.exe` | 76,362,799 | `759501e5480cd2f2dbf03a2f4b784dfd9ee0ed0d09519488e8df6ec58bd77dcd` |
| `AiRemote-Agent-v3.8.13-android.apk` (موقّع) | 152,759 | `3c6c755074b0f8c72549365dc5ec55ad540165beb99590ab7d9a4371b8d7cf60` |

APK موقّع بمفتاح الإصدار: `CN=AiRemote Agent, OU=Engineering, O=AiRemote, C=SY` · SHA-256 `A7:76:65:9A…:D5:00`.

## 3. عيب مؤكد وأُصلح: حزمة الوكيل تُسقط `lib/`

- **العَرَض:** بعد تثبيت 3.8.13 على WIN10/WIN11 لم يتصل أي وكيل، وعند فتح النافذة ظهر
  `A JavaScript error occurred in the main process — Cannot find module '/lib/file-transfer-agent'`.
- **السبب:** `build.files` في `packages/agent-desktop/package.json` لم تكن تتضمن `lib/**/*`، فحُزم
  `main.js` بلا الوحدة التي يستدعيها في السطر 13.
- **الإصلاح:** إضافة `lib/**/*` إلى `build.files` وإعادة البناء (الحجم +3.8KB، وبصمة `app.asar`
  تؤكد وجود `file-transfer-agent`).
- **الدرس:** بوابة البناء لا تفحص محتوى `asar`؛ يجب فحص وجود الوحدات المحلية بعد كل بناء للوكيل.

## 4. التثبيت والتحقق

| العنصر | النتيجة |
|---|---|
| السيرفر المثبَّت | `/health` → `{"status":"ok","version":"3.8.13","tls":true}` |
| WIN10-VM | وكيل 3.8.13 · **online** · Windows 10.0.19045 |
| WIN11-VM | وكيل 3.8.13 · **online** · Windows 10.0.22000 |
| Android-Emulator | APK موقّع · **online** · 3.8.13-android · Android 9 (API 28) |
| TECNO-KL4 | APK موقّع · **online** · 3.8.13-android · Android 14 (API 34) |

**ملاحظة على عنوان الوكيل:** إعداد الـVMين كان يشير إلى `wss://192.168.0.1:3001/ws` (شبكة قديمة)
فصُحّح إلى `wss://192.168.1.25:3001/ws` في `%APPDATA%\airemote-agent-desktop\airemote-config.json`
و`%APPDATA%\AiRemote Agent\airemote-config.json`، وأُعيد تشغيل الوكيلين فاتصلا.

**الأندرويد:** الجهازان يستخدمان `wss://127.0.0.1:3101/ws` مع `adb reverse tcp:3101 tcp:3101`
وجسر `android-bridge-local.py` (3101 → 3001). إعداد الجهاز يُقرأ من
`/sdcard/Android/data/com.airemote.agent/files/airemote-config.json`.

## 5. فخّان في البناء (للمرة القادمة)

1. `npm run build:win` يفشل عند `build:dashboard`: pnpm يريد حذف `node_modules` بلا TTY
   (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). نُفِّذت الخطوات صريحة.
2. `npm run build` للوكيل يفشل على Windows لأن `CSC_IDENTITY_AUTO_DISCOVERY=false` بادئة POSIX؛
   الصواب `$env:CSC_IDENTITY_AUTO_DISCOVERY='false'; npx electron-builder --win --x64`.

**تنظيف:** `copy-dashboard.js` يكتب فوق `packages/server-desktop/static/` المتعقَّب؛ بعد البناء أُعيد
`git checkout` + `git clean -fd` فبقيت الشجرة على ملفات المصدر فقط.
