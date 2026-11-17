# دليل تثبيت الأسطول 3.17.0 — 2026-11-17

**الأمر:** «ثبت الاسطول» — بعد تأكيد المالك أن كل الأجهزة متصلة.

## النتيجة: **6/6 online على 3.17.0**

| # | الجهاز | النوع | الحالة | النسخة | ملاحظات |
|---|---|---|---|---|---|
| 1 | DESKTOP-K81PJ9H | المضيف (سيرفر + وكيل) | **online** | **3.17.0** | السيرفر رُقيّ 3.16.19→3.17.0 (`/health`=3.17.0) · الوكيل ثُبّت محلياً (Setup /S) |
| 2 | WIN10-VM | وكيل ويندوز | **online** | **3.17.0** | كان 3.17.0 قبل الجولة (تحقق فقط — لم يُعَد تثبيته) |
| 3 | WIN11-VM | وكيل ويندوز | **online** | **3.17.0** | ترقية كاملة: push 76MB → trigger عادي (HIGH فشل Access denied — الوكيل غير مرتفع) → `before=3.16.19 installerExit=0 after=3.17.0 relaunch=runkey procsAfterStart=4 caEnv=True` |
| 4 | TECNO-KL4 | أندرويد | **online** | **3.17.0-android** (vc110) | adb install -r Success · a11y مربوطة · AISHOT **720×1600** |
| 5 | TAB16-USB | أندرويد | **online** | **3.17.0-android** (vc110) | adb install -r Success · a11y مربوطة · AISHOT **1280×800** (فخ 80 مغلق) |
| 6 | Android-Emulator | أندرويد | **online** | **3.17.0-android** (vc110) | adb install -r Success (عبر `emulator-5554` — فخ 64: `127.0.0.1:5555` نفس الجهاز) · AISHOT **1600×900** |

## ترتيب فخ 82 المطبق على كل أندرويد

`adb install -r` ← `settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y` + `accessibility_enabled 1` ← `am force-stop` ← `am start --ez requestCapture true`.
- **TECNO:** أول AISHOT أعطى `no frame` (فخ 79 — الشاشة مقفلة/مطفأة). بعد `input keyevent WAKEUP + 82 + swipe` وإعادة `requestCapture` → `shot-ok` 720×1600.
- الثلاثة: `settings get secure enabled_accessibility_services` = الخدمة مربوطة · `accessibility_enabled=1`.

## فخاخ واجهتها وعولجت

| الفخ | ما حدث | العلاج |
|---|---|---|
| **76** AGENT_CA_CERT | وكيل المضيف بعد التثبيت ظهر **offline** — لا يتصل (TLS self-signed بلا CA) | إعادة تشغيل بـ`AGENT_CA_CERT=…\AiRemote-Server\tls\server.crt` → online · **ثُبّت المتغير دائماً بـ`setx`** لأن Run key (`io.airemote.agent`) بلا CA — كان سيفشل بعد أي إقلاع |
| **83** WIN11 vm-exec ~30ث | استُخدم trigger قصير (إنشاء مهمة + تشغيل + قراءة ملف) | نجح في 5ث؛ التثبيت نفسه عمل داخل المهمة المجدولة |
| **84** حد 5/دخول/دقيقة | دفع 76MB + 3 ملفات بفواصل 13ث | كل الدفعات PUSH OK |
| **64** نفس المحاكي بعنوانين | `emulator-5554` و`127.0.0.1:5555` | ثُبّت عبر `emulator-5554` فقط |
| **79** الالتقاط بعد force-stop | TECNO `no frame` | استيقاظ + طلب التقاط (طلب واحد لكل عملية — الكود مغلق من r19) |
| **80** لقطة مربعة | — | AISHOT 1280×800 على TAB16 (ليس مربعاً) |
| **HIGH task** | WIN11: `schtasks /rl HIGHEST` = Access denied (الوكيل non-elevated) | trigger عادي بلا `/rl` — التثبيت per-user لا يحتاج رفعاً |

## الأدوات

`tools-2026-11-13-31618-install/vm-exec.cjs` · `push-file.cjs` · `tools-2026-11-14-31619/upgrade-3170.ps1` · `trigger-upgrade-3170.ps1` · `trigger-upgrade-3170-plain.ps1` (أُنشئ) · `fetch-log.cjs` · `handoff/scripts/remote-exec.cjs AISHOT:<path>`.

**الدليل الخام:** سجل WIN11 على الجهاز `C:\Users\Public\airemote-upgrade-3170.log` (منقول أعلاه) · قياسات AISHOT الثلاثة في `%TEMP%\aishot3170*.jpg` أثناء الجلسة.
