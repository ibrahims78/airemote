# تحديث وكيل الأندرويد إلى 3.8.12 — سجل تنفيذ

**التاريخ:** 2026-10-28 · **القرار:** موافقة المالك على إزالة وإعادة التثبيت (المحاكي الآن، TECNO عبر USB)

---

## 1. سبب الحاجة إلى إزالة

النسخة المثبَّتة 3.8.7 على المحاكي وTECNO موقّعة بمفتاح إصدار **غير موجود** على هذا الجهاز (لا `*.jks`/`*.keystore` في المشروع ولا `%APPDATA%\AiRemote\signing`؛ لا يوجد إلا `~\.android\debug.keystore`). لذلك رُفض التثبيت فوقها بـ`INSTALL_FAILED_UPDATE_INCOMPATIBLE`.

---

## 2. المحاكي — مُنفَّذ

| الخطوة | الأمر | النتيجة |
|---|---|---|
| إزالة | `adb -s emulator-5554 uninstall com.airemote.agent` | `Success` |
| تثبيت | `adb -s emulator-5554 install -r app-debug.apk` | `Success` — versionCode **18** / versionName **3.8.12** |
| تهيئة | دفع `airemote-config.json` إلى `/sdcard/Android/data/com.airemote.agent/files/` (يستورده `Prefs.bootstrap`) | `192.168.1.55:3001` غير قابل للوصول من NAT المحاكي (`Host unreachable`) ← استُخدم `wss://127.0.0.1:3101/ws` عبر الجسر |
| تشغيل | `am start -n com.airemote.agent/.MainActivity` | `connect() url=wss://127.0.0.1:3101/ws` ثم `server:registered` |
| تحقق | `scripts/list-devices.cjs` | `Android-Emulator online agent=3.8.12-android` |

**ملاحظة تشغيلية مهمة:** `pm clear` لزم بعد أول تشغيل، لأن استيراد ملف التهيئة يحدث فقط عندما تكون التفضيلات فارغة. أي إعادة تثبيت لاحقة: إزالة → تثبيت → **دفع الملف قبل أول تشغيل** أو `pm clear` بعده.

**الصلاحيات المُعادة عبر adb بعد الإزالة:** إمكانية الوصول (`AiRemoteA11y` مفعّلة)، الرسم فوق التطبيقات (`SYSTEM_ALERT_WINDOW: allow`)، الميكروفون (`RECORD_AUDIO: allow`). التقاط الشاشة (MediaProjection) يحتاج موافقة داخل التطبيق، وتُمنح عند أول بث.

---

## 3. TECNO — لم يُنفَّذ بعد

الجهاز كان متصلاً بالـUSB (`12927374CM001019`) ثم اختفى من `adb devices` قبل التنفيذ (لا يظهر الآن إطلاقاً). لم تُنفَّذ أي خطوة إزالة عليه، وما زال يعمل 3.8.7 ومتصلاً بالسيرفر عبر الشبكة.

**المطلوب لاستكماله:** إعادة توصيل كبل USB وقبول «السماح بتصحيح أخطاء USB» على الهاتف، ثم تنفيذ نفس التسلسل:

```powershell
$adb = 'D:\LDPlayer\LDPlayer9\adb.exe'
& $adb devices -l
& $adb -s <serial> uninstall com.airemote.agent
& $adb -s <serial> install -r 'D:\autoclaw projects-new\AiRemote\packages\android-agent\app\build\outputs\apk\debug\app-debug.apk'
& $adb -s <serial> push outputs\verify-...\tecno-config.json /sdcard/Android/data/com.airemote.agent/files/airemote-config.json
& $adb -s <serial> shell am start -n com.airemote.agent/.MainActivity
```

ثم إعادة منح: إمكانية الوصول، الرسم فوق التطبيقات، الميكروفون، والتصوير.

**قيد:** ملف التهيئة يحتوي رمز الجهاز — يُنشأ من قاعدة السيرفر (`devices.token`) ولا يُرفع إلى Git.
