# HANDOFF — AiRemote · 2026-10-29 · ختام R6 (تسليم حساب)

> **الغرض:** حزمة التسليم لحساب/جلسة جديدة بعد تسجيل الخروج. اقرأها كاملة قبل أي أمر.
> **مصدر الحالة اليومي:** `PROJECT_STATE.md` §0.1/§0.2 · **سجل المراحل:** `docs/PLAN-STATUS.md`.

---

## 1. الخلاصة في اثني عشر سطراً

1. المستودع `D:\autoclaw projects-new\AiRemote` · الفرع `checkpoint/3.8.1-2026-10-26` · الشجرة **نظيفة** · آخر التزام **`6851295`**.
2. **R0–R5 مغلقة** (R5 في المصدر)، و**R6 مغلقة في الواجهة اليوم**: **0 صنف لون صريح** في كامل `src` (كانت 1061).
3. **السيرفر المثبَّت 3.8.13** ويعمل على `https://127.0.0.1:3001` (`/health` = 3.8.13).
4. **الأجهزة الأربعة على 3.8.13 وكلها online**: WIN10-VM · WIN11-VM · Android-Emulator (Android 9) · TECNO-KL4 (Android 14).
5. **APK 3.8.13 موقّع بمفتاح الإصدار** `airemote` ومثبَّت على المحاكي وTECNO.
6. **المفتاح موجود وصالح**: `%APPDATA%\AiRemote\signing\airemote-release.jks` (alias `airemote`، حتى 2036) وكلمة المرور في ملف مجاور. **لا تطبعهما.**
7. **JDK وأدوات أندرويد موجودة**: `D:\autoclaw projects\offline-build-tools\android-toolchain` (JDK 21 · build-tools 34 · platform-tools · gradle). عائق «لا JDK» انتهى.
8. **البوابات:** `scan-ui-colors` = 0 · `check-contrast` 22/22 · `verify.js` 21/21 · `tsc` 0 · `vite build` ناجح.
9. **مصفوفة التباين:** 72 لقطة (9 صفحات × 4 عروض × سمتين) → **0 مخالفة**، و**0 لقطة بيضاء**.
10. **متبقٍّ من R6:** دين i18n فقط — **4224 حرفاً عربياً** مباشراً في `AiChatPanel`/`ScreenViewer`.
11. **التالي:** **R7** (ترقية `fastify 4→5` و`axios ≥1.20` وفق خطة R2 §9) ثم إثبات بصري لتبويب «المراقبة» مع وكيل متصل.
12. **قرارات المالك ملزمة:** git محلي فقط · MIT يبقى · `lab-probe@local` يبقى · لا طباعة أسرار · لا سيرفر ثانٍ على قاعدة المثبَّت.

---

## 2. نقطة الاستئناف الدقيقة

| العنصر | القيمة |
|---|---|
| المسار | `D:\autoclaw projects-new\AiRemote` |
| الفرع | `checkpoint/3.8.1-2026-10-26` |
| HEAD | `6851295` — `docs: close R6 - interactive surfaces, 3.8.13 install and lab state` |
| الشجرة | نظيفة |
| السيرفر المثبَّت | **3.8.13** على 3001 (TLS) · الدليل `%LOCALAPPDATA%\Programs\AiRemote Server` |
| قاعدة المثبَّت | `%APPDATA%\AiRemote-Server\airemote.db` — **ممنوع** تشغيل سيرفر آخر عليها |
| بوابة الألوان | **0** صنفاً · **12** ملفاً على المكتبة |
| البطارية | **21/21** |

---

## 3. إعدادات المشروع والبيئة

### 3.1 المسارات
| العنصر | المسار |
|---|---|
| المستودع العامل | `D:\autoclaw projects-new\AiRemote` |
| نسخة أقدم (لا تُستخدم) | `D:\autoclaw projects\AiRemote` (versionName 3.6.0، بلا مفتاح) |
| أدوات أندرويد | `D:\autoclaw projects\offline-build-tools\android-toolchain` |
| مفتاح التوقيع | `%APPDATA%\AiRemote\signing\airemote-release.jks` + `keystore-password.txt` |
| بيانات المختبر | `%APPDATA%\AiRemote\lab-credentials.txt` (email/password/server + vm_guest) — **لا تُطبع** |
| حساب الاختبار | `lab-probe@local` (admin) في `%APPDATA%\AiRemote\lab-probe.json` — يبقى |
| سيرفر اللوحة المؤقت | `scripts/dev-server-temp.js` (قاعدة مؤقتة) + `scripts/dev-ui-serve.cjs` |

### 3.2 الأدوات (تم التحقق منها اليوم)
| الأداة | المسار | الإصدار |
|---|---|---|
| JDK | `…\android-toolchain\jdk\bin\java.exe` / `keytool.exe` | OpenJDK **21.0.5** |
| build-tools | `…\sdk\build-tools\34.0.0\` (`apksigner.bat`, `zipalign.exe`) | 34.0.0 |
| platform-tools | `…\sdk\platform-tools\adb.exe` | — |
| Gradle | `…\android-toolchain\gradle\bin\gradle.bat` + `android-init.gradle` | — |

**قاعدة:** أي أمر توقيع يحتاج `JAVA_HOME` إلى JDK أعلاه، و`ANDROID_HOME`/`ANDROID_SDK_ROOT` إلى `…\sdk`.

---

## 4. إعدادات الأجهزة (حالة لحظة التسليم)

| الجهاز | الإصدار | الحالة | ملاحظات |
|---|---|---|---|
| السيرفر | 3.8.13 | يعمل | `https://127.0.0.1:3001` · LAN `192.168.1.25` |
| WIN10-VM | وكيل 3.8.13 | **online** | `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` · 192.168.0.176 |
| WIN11-VM | وكيل 3.8.13 | **online** | `E:\VMs\Win11_Custom_2026-09-30\…vmx` · 192.168.0.175 |
| Android-Emulator | 3.8.13-android | **online** | LDPlayer 9 · `D:\LDPlayer\LDPlayer9\adb.exe` · `emulator-5554` |
| TECNO-KL4 | 3.8.13-android | **online** | USB · `12927374CM001019` · Android 14 |

### 4.1 إعداد الوكيل على Windows (سبب أعطال سابقة)
- ملف الإعداد الفعلي: `%APPDATA%\airemote-agent-desktop\airemote-config.json` (هو `app.getPath('userData')`).
- نسخة ثانية قديمة: `%APPDATA%\AiRemote Agent\airemote-config.json` — صحّحها أيضاً عند التغيير.
- المطلوب: `serverUrl = wss://192.168.1.25:3001/ws` · `autoStart = true` · `token` (36 حرفاً).
- **فخ:** إذا كان العنوان `192.168.0.1` فلن يتصل أبداً؛ الحالة تظهر offline بلا خطأ ظاهر.

### 4.2 إعداد وكيل الأندرويد
- ملف على الجهاز: `/sdcard/Android/data/com.airemote.agent/files/airemote-config.json`
  بصيغة `{"server":"wss://127.0.0.1:3101/ws","token":"…"}` (يُقرأ عند أول تشغيل إن كانت التفضيلات فارغة).
- الجسر: `python %APPDATA%\AiRemote\android-bridge-local.py` (3101 → 3001) +
  `adb -s <serial> reverse tcp:3101 tcp:3101`.
- التثبيت: `adb -s <serial> install -r releases\android\AiRemote-Agent-v3.8.13-android.apk`.

---

## 5. مفتاح التوقيع والبناء (أندرويد)

| الحقل | القيمة |
|---|---|
| Keystore | `%APPDATA%\AiRemote\signing\airemote-release.jks` (PKCS12) |
| Alias | `airemote` · `CN=AiRemote Agent, OU=Engineering, O=AiRemote, C=SY` |
| الصلاحية | 2026-10-26 → 2036-10-23 |
| SHA-256 | `A7:76:65:9A:C4:AB:23:F2:A7:1B:33:6C:59:72:27:B9:79:85:62:2F:D3:58:15:8E:FE:26:05:86:1B:05:D5:00` |
| كلمة المرور | `%APPDATA%\AiRemote\signing\keystore-password.txt` — تُمرَّر بـ`-storepass:env` فقط |

**بناء APK:**
```powershell
$tc='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME="$tc\jdk"; $env:ANDROID_HOME="$tc\sdk"
cd 'D:\autoclaw projects-new\AiRemote\packages\android-agent'
& "$tc\gradle\bin\gradle.bat" -I "$tc\android-init.gradle" assembleRelease --no-daemon
$env:KS_PW=(Get-Content "$env:APPDATA\AiRemote\signing\keystore-password.txt" -Raw).Trim()
$ks="$env:APPDATA\AiRemote\signing\airemote-release.jks"
& "$tc\sdk\build-tools\34.0.0\zipalign.exe" -f -p 4 app\build\outputs\apk\release\app-release-unsigned.apk ..\..\releases\android\app-aligned.apk
& "$tc\sdk\build-tools\34.0.0\apksigner.bat" sign --ks $ks --ks-key-alias airemote --ks-pass env:KS_PW --key-pass env:KS_PW --out ..\..\releases\android\AiRemote-Agent-v3.8.13-android.apk ..\..\releases\android\app-aligned.apk
Remove-Item Env:\KS_PW
```

**توقيع المثبَّت الحالي على TECNO/المحاكي هو مفتاح الإصدار** (تحقّق: `apksigner verify --print-certs` → `CN=AiRemote Agent`).
أي جهاز ما زال على توقيع debug يحتاج **إزالة ثم تثبيت**.

---

## 6. حزم 3.8.13 (على القرص، مستثناة من git)

| الحزمة | الحجم | SHA-256 |
|---|---:|---|
| `releases/server-windows/AiRemote-Server-Setup-v3.8.13-x64.exe` | 121,209,665 | `6fbd333d0ca846a6b0871c522f14972b2ac93d3125517c5acdcee227dd412ebf` |
| `releases/agent-windows/AiRemote-Agent-Setup-v3.8.13-x64.exe` | 76,362,799 | `759501e5480cd2f2dbf03a2f4b784dfd9ee0ed0d09519488e8df6ec58bd77dcd` |
| `releases/android/AiRemote-Agent-v3.8.13-android.apk` | 152,759 | `3c6c755074b0f8c72549365dc5ec55ad540165beb99590ab7d9a4371b8d7cf60` |

---

## 7. أوامر التحقق (أول 10 دقائق في الجلسة الجديدة)

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -3          # 6851295 على القمة
git status --short            # فارغ
node scripts/scan-ui-colors.cjs      # TOTAL 0 · 12 files
node scripts/check-contrast.cjs      # 22/22
node scripts/verify.js               # 21/21 (دقائق)
cd packages/dashboard; npx tsc --noEmit; npx vite build
```

**حالة الأجهزة:**
```powershell
adb devices -l
# المتوقع: 12927374CM001019 (TECNO) + emulator-5554
```
ثم من اللوحة أو API: `/api/devices` يجب أن يُظهر الأربعة **online** و`agentVersion` = 3.8.13 / 3.8.13-android.

**مصفوفة التباين (72 لقطة):**
```powershell
# سيرفر مؤقت + خادم ثابت
$env:ELECTRON_RUN_AS_NODE='1'; $env:SHOT_PORT='3021'
& '.\node_modules\.pnpm\electron@28.3.3\node_modules\electron\dist\electron.exe' scripts\dev-server-temp.js
# نافذة ثانية
$env:DEV_UI_STATIC_PORT='4191'; $env:DEV_UI_API_PORT='3021'; node scripts\dev-ui-serve.cjs
# إنشاء مسؤول ثم
node scripts\ui-audit-matrix.cjs --out=outputs\verify-YYYY-MM-DD\r6-contrast --wait=15000
```

---

## 8. الفخاخ المؤكدة (توفّر ساعات)

1. **`better-sqlite3` مبني لـElectron (ABI 119):** أي `server.js` يُشغَّل بـ`ELECTRON_RUN_AS_NODE=1` + `electron.exe`، وإلا فشل التحميل.
2. **`packages/server-desktop/static/` متعقَّب في git:** لا تنسخ `dist` إليه أثناء التطوير (استخدم `dev-ui-serve`). عند بناء إصدار: `copy-dashboard` يكتب فوقه، ثم `git checkout` + `git clean -fd` بعده.
3. **`build:win` يفشل** بـ`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`: نفّذ الخطوات صريحة (shared tsc → ai-engine tsc → dashboard vite → copy-dashboard → electron-builder).
4. **`npm run build` للوكيل يفشل على Windows** لأن `CSC_IDENTITY_AUTO_DISCOVERY=false` بادئة POSIX؛ استخدم `$env:CSC_IDENTITY_AUTO_DISCOVERY='false'` ثم `npx electron-builder`.
5. **حزمة الوكيل يجب أن تتضمن `lib/**/*`** وإلا `Cannot find module /lib/file-transfer-agent` عند الإقلاع (حدثت وأُصلحت).
6. **اللقطات:** انتظار ≥9s (12–15s أأمن)؛ غير ذلك شاشة إقلاع.
7. **`useT()` دالة جديدة كل render** — لا تضعها في تبعيات `useCallback`/`useEffect`.
8. **`i18n.ts`:** أي مفتاح جديد في `ar` **و**`en`؛ `TKey = keyof typeof T.ar`.
9. **`core.autocrlf=true`:** اكتب بـLF.
10. **`Modal`** يملك `aria-labelledby` ثابتاً — لا تفتح نافذتين معاً.
11. **عنوان وكيل Windows** يجب أن يكون `192.168.1.25` لا `192.168.0.1`؛ وإلا offline صامت.
12. **أدوات الملفات في AutoClaw محصورة في مجلد مساحة العمل** — المستودع على `D:` يُقرأ/يُكتب عبر PowerShell (`Get-Content`/`Set-Content -Encoding UTF8`) أو بنسخ المرآة إلى `_work`.

---

## 9. ما أُنجز في هذه الجلسة (بالأرقام)

| البند | قبل | بعد |
|---|---:|---:|
| أصناف اللون الصريحة في `src` | 1061 | **0** |
| ملفات على مكتبة المكوّنات | 11 | **12** |
| مخالفات التباين (72 لقطة) | 380 | **0** |
| `OverviewPage` نص عربي مباشر | 856 حرفاً | **0** (54 مفتاحاً ar/en) |
| الدفعة الطرفية + البواقي | 300 صنفاً | **0** |
| رسوم المراقبة | 40 | **0** |
| الأسطح التفاعلية | 725 | **0** |

**الالتزامات (15):** `d58f2ea` · `50970c4` · `b2c765b` · `6d10c3c` · `46d41dc` · `82e0a5d` · `8987a5c` · `3f3a9dd` · `a478216` · `ebda647` · `6fae6f6` · `70c5d63` · `161f680` · `6851295` · `0894492`.

---

## 10. ما تبقّى بالضبط

1. **دين i18n:** 4224 حرفاً عربياً مباشراً في `AiChatPanel.tsx` و`ScreenViewer.tsx` — يحتاج مفاتيح `chat_*`/`viewer_*` في ar+en.
2. **إثبات بصري لتبويب «المراقبة»** (`/devices/:id?tab=monitor`) مع وكيل متصل — الرسوم لم تُصوَّر بعد لأنها تحتاج `stats` حيّاً.
3. **R7:** ترقية `fastify 4→5` و`axios ≥1.20` وفق خطة R2 §9 (اختبار بعد كل خطوة).
4. **TECNO على أجهزة أخرى:** أي جهاز بتوقيع debug يحتاج إزالة/تثبيت (يفقد الإعداد).
5. **APK:** لم يُبنَ بعد تغييرات R6 الأخيرة (0 أصناف)؛ إن أردت نسخة تحمل هذه التغييرات أعد البناء بنفس الأوامر.

---

## 11. خريطة الوثائق

| الملف | المحتوى |
|---|---|
| `PROJECT_STATE.md` | الحالة اليومية (§0.1/§0.2) |
| `docs/PLAN-STATUS.md` | سجل المراحل، القيود، أوامر التحقق |
| `docs/UI-INVENTORY.md` | جرد الشاشات + جدول الامتثال (0 صنف) |
| `docs/ADR-R6-TERMINAL-BATCH-AR.md` | قرار الدفعة الطرفية |
| `docs/ADR-R6-MONITORING-CHARTS-AR.md` | قرار رسوم المراقبة |
| `docs/ADR-R6-INTERACTIVE-SURFACES-AR.md` | قرار الأسطح التفاعلية (منفَّذ) |
| `docs/ANDROID-TOOLCHAIN-AND-KEY-AR.md` | الأدوات + المفتاح + أوامر التوقيع |
| `outputs/verify-2026-10-29/r6-contrast/` | 72 لقطة + `contrast.json` + `scan.txt` + تقرير |
| `outputs/verify-2026-10-29/r6-interactive/` | لقطات `/ai` و`/view` + تقرير |
| `outputs/verify-2026-10-29/r6-release/` | بناء وتثبيت 3.8.13 |
| `docs/PROMPT-NEW-ACCOUNT-2026-10-29-AR.md` | الأمر الجاهز للحساب الجديد |

---

*نهاية التسليم — 2026-10-29.*
