# وكيل أندرويد — AiRemote Android Agent

تطبيق أندرويد (Java) يمثل وكيلاً لمنصة AiRemote بنفس بروتوكول وكيل ويندوز — بدون أي تعديل على الخادم.

## البنية
| الملف | الوظيفة |
|---|---|
| `MainActivity.java` | الواجهة العربية: حالة، عنوان الخادم، الرمز، أزرار (بدء/إيقاف/إذن الالتقاط/إمكانية الوصول)، سجل |
| `AgentService.java` | خدمة أمامية: WebSocket (تسجيل/نبض/أوامر/ملفات) + لقطة شاشة عبر MediaProjection + إحصاءات |
| `AiRemoteA11y.java` | خدمة إمكانية الوصول: نقر، نقر بالاسم، كتابة، تمرير، سحب، رجوع/الرئيسية/التطبيقات، فتح تطبيق |
| `Prefs.java` / `CaptureHolder.java` | تخزين الإعدادات + حمل إذن التقاط الشاشة |

## البناء (Offline Toolchain)
```powershell
$tc = 'D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:JAVA_HOME = "$tc\jdk"; $env:ANDROID_HOME = "$tc\sdk"; $env:ANDROID_SDK_ROOT = "$tc\sdk"
$env:PATH = "$tc\jdk\bin;$tc\sdk\platform-tools;$tc\gradle\bin;" + $env:PATH
cd packages\android-agent
& "$tc\gradle\bin\gradle.bat" assembleDebug --no-daemon -I "$tc\android-init.gradle"
# الناتج: app\build\outputs\apk\debug\app-debug.apk
```

## التشغيل على الجهاز/المحاكي
1. `adb install -r app-debug.apk`
2. تفعيل خدمة التحكم: `adb shell settings put secure enabled_accessibility_services com.airemote.agent/com.airemote.agent.AiRemoteA11y && adb shell settings put secure accessibility_enabled 1`
3. تشغيل وتمرير الإعدادات مباشرة:
   `adb shell am start -n com.airemote.agent/.MainActivity --es server ws://<IP>:3001/ws --es token <DEVICE_TOKEN> --ez autostart true --ez requestCapture true`
4. اضغط "السماح/بدء الآن" في نافذة إذن التقاط الشاشة (تدويم يدوي، أو `adb shell input tap x y`).
5. أنشئ جهازاً في اللوحة: Devices → أضف جهازاً → انسخ الـ Token.

## الأوامر المفهومة من الخادم
- `AICTL:<base64 JSON>` — أوامر تحكم: click/dclick/rclick/drag/scroll/type/key/clickname/focus/wait/info/openapp
- `AISHOT:<path>` — لقطة شاشة إلى ملف (يُقرأ عبر fs read)
- أي أمر نصي آخر — يُنفَّذ عبر `sh -c`

## الحدود الحالية (v1)
- لا بث فيديو مباشر بعد (لقطة عند الطلب فقط) — مرحلة A2.
- الكتابة/التحكم تتطلب خدمة إمكانية الوصول مفعّلة يدوياً.
- إصدار 1.0.1 — يعمل مع خادم AiRemote v3.4.2+.


## قناة الاتصال (LDPlayer — شبكة معزولة)
محاكي LDPlayer يعمل على شبكة 192.168.1.x المعزولة ولا يصل مباشرة إلى خادم AiRemote (192.168.0.x).
الحل المعتمد (مُجرَّب): قناة عبر المضيف + adb reverse:
1. شغّل المرحّل على المضيف: `node host-relay.cjs` (ناسخ TCP: 127.0.0.1:3002 → 192.168.0.176:3001)
2. `adb -s emulator-5554 reverse tcp:3001 tcp:3002`
3. في التطبيق: عنوان الخادم = `ws://127.0.0.1:3001/ws`
