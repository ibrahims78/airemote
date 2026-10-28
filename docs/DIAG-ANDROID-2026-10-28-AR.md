# تشخيص: وكيل المحاكي يعمل ولا يتصل بالسيرفر

**التاريخ:** 2026-10-28 · **الجهاز:** LDPlayer (Android 13، `BVL_AN00`، المنفذان `emulator-5554` و`127.0.0.1:5555`)

---

## 1. العَرَض

في `scripts/list-devices.cjs` ظهر:

```
Android-Emulator   offline  agent=3.8.7-android platform=Android
TECNO-KL4          online   agent=3.8.7-android platform=Android
WIN10-VM           online   agent=3.8.7 platform=windows
WIN11-VM           online   agent=3.8.7 platform=windows
```

والعملية `com.airemote.agent` تعمل فعلاً داخل المحاكي (PID 2281)، ونفق الأندرويد `python android-bridge-local.py` يستمع على `127.0.0.1:3101`.

---

## 2. السبب الأول (المانع الفعلي): نفق `adb reverse` مفقود

`adb -s emulator-5554 reverse --list` كان **فارغاً**.

الوكيل يتصل بـ`wss://127.0.0.1:3101/ws` داخل المحاكي. هذا العنوان لا معنى له داخل الضيف إلا بوجود قاعدة `adb reverse tcp:3101 tcp:3101` تحوّله إلى جسر المضيف. القاعدة تُفقد كلما أُعيد تشغيل `adbd` (إعادة تشغيل المحاكي، أو `adb kill-server`، أو انقطاع الجلسة)، ولا شيء يعيد إنشاءها تلقائياً.

**الدليل:** بعد تنفيذ `adb -s emulator-5554 reverse tcp:3101 tcp:3101` صار الجهاز `online` خلال ثوانٍ، وسجل الوكيل:

```
D AiRemoteAgent: connect() url=wss://127.0.0.1:3101/ws tokenLen=36
D AiRemoteAgent: WebSocket onOpen
D AiRemoteAgent: server:registered
```

**ملاحظة على أسماء المنافذ:** المحاكي يظهر بمعرّفين (`emulator-5554` و`127.0.0.1:5555`). الأوامر السابقة كانت تُوجَّه إلى `127.0.0.1:5555` فتفشل بـ`device not found`، فتضيع القاعدة على السيريال الصحيح. أي أتمتة يجب أن تستخدم المعرّف الذي يظهر فعلاً في `adb devices`.

---

## 3. السبب الثاني (عيب في الوكيل): حلقتا اتصال متوازيتان

بعد وصله، كشف `logcat` نمطاً غير سليم: إعادة اتصال كل ~10 ثوانٍ، وأحياناً مقبسان في اللحظة نفسها:

```
13:32:18.811 connect() … onOpen … server:registered
13:32:19.846 connect() … onOpen          ← مقبس ثانٍ فوق الأول
13:32:19.873 onClose code=4000 reason=replaced by newer agent connection
13:32:22.905 connect() … onOpen …       ← وتتكرر الحلقة
13:32:25.037 onClose code=1006
```

**التحليل من الكود (`AgentService.java`):**

1. `connect()` لم يكن يتحقق من وجود مقبس مفتوح: كل نداء ينشئ `WebSocketClient` جديداً ويضع `ws = client` فوق القديم دون إغلاقه. فيُسجَّل الجهاز مرتين، فيغلق السيرفر الأقدم بالرمز `4000`.
2. `onClose` كان يضع `ws = null` **دون التحقق من أن المقبس المُغلق هو المقبس الحالي**. فعند إغلاق المقبس القديم كان يُفرغ مرجع المقبس الحيّ، فيظن الوكيل أنه منقطع ويعيد الاتصال — وهكذا كل 10 ثوانٍ.
3. `startAgent()` كان ينادي `connect()` **قبل** إنشاء `hbThread`/`hbHandler`. أي إغلاق مبكر كان يصطدم بـ`hbHandler = null` فتُفقد جدولة إعادة الاتصال كلها، ويبقى الوكيل يعمل بلا أي محاولة لاحقة — وهذا هو التفسير الدقيق لحالة «الوكيل يعمل وغير متصل».

**الإصلاح (v3.8.12):**

| الموضع | التغيير |
|---|---|
| `startAgent()` | إنشاء `HandlerThread`/`Handler` قبل أول `connect()` |
| `connect()` | إن كان `ws` مفتوحاً → لا مقبس جديد؛ وإن كان ميتاً → يُغلق ويُفرَّغ قبل الاستبدال |
| `onClose()` | `if (ws != this) return;` — إغلاق مقبس مُستبدل لا يمسّ الحالة |
| الجدولة | `scheduleReconnect(delay)` واحدة تزيل المهمة المعلّقة قبل الجدولة (`removeCallbacks`) بدل `postDelayed` المتكرر |

---

## 4. العقبة المتبقية: مفتاح توقيع APK

محاولة تثبيت `app-debug.apk` (3.8.12، versionCode 18) على المحاكي رُفضت:

```
INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package com.airemote.agent signatures do not match previously installed version
```

النسخة المثبَّتة (3.8.7) موقّعة بمفتاح إصدار **غير موجود على هذا الجهاز**: لا `*.jks`/`*.keystore` في المشروع، ولا في `%APPDATA%\AiRemote\signing`، ولا في أدوات البناء — لا يوجد إلا `~\.android\debug.keystore` القياسي وهو لا يطابق.

**الأثر:** ترقية الوكيل في المكان مستحيلة على المحاكي وTECNO معاً. الحل الوحيد هو إزالة التطبيق ثم تثبيت نسخة موقّعة بمفتاح debug (أو توليد مفتاح إصدار جديد والاحتفاظ به). إزالة التطبيق تُفقد: عنوان السيرفر، رمز الجهاز، والصلاحيات الممنوحة (إمكانية الوصول، الرسم فوق التطبيقات، الميكروفون، MediaProjection).

هذا قرار مالك، لا قرار تنفيذ: لم يُنفَّذ أي إزالة.

---

## 5. ما يجب أن يفعله أي حساب لاحق (قائمة قصيرة)

```powershell
$adb = 'D:\LDPlayer\LDPlayer9\adb.exe'
& $adb devices -l                                  # استخدم المعرّف الظاهر فعلاً
& $adb -s emulator-5554 reverse tcp:3101 tcp:3101   # القاعدة التي تُفقد عند كل restart
& $adb -s emulator-5554 logcat -d -t 120 | Select-String 'AiRemoteAgent'
node scripts\list-devices.cjs
```

وإن كان الجسر مطفأ: `python %APPDATA%\AiRemote\android-bridge-local.py` ثم القاعدة أعلاه.
