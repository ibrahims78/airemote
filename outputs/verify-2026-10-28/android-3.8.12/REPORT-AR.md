# تحديث وكيل الأندرويد إلى 3.8.12 — سجل تنفيذ

**التاريخ:** 2026-10-28 · **القرار:** موافقة المالك على إزالة وإعادة التثبيت · **النتيجة:** المحاكي وTECNO على **3.8.12-android** وكلاهما متصل

---

## 1. سبب الحاجة إلى إزالة

النسخة المثبَّتة 3.8.7 على المحاكي وTECNO موقّعة بمفتاح إصدار **غير موجود** على هذا الجهاز (لا `*.jks`/`*.keystore` في المشروع ولا `%APPDATA%\AiRemote\signing`؛ لا يوجد إلا `~\.android\debug.keystore`). لذلك رُفض التثبيت فوقها بـ`INSTALL_FAILED_UPDATE_INCOMPATIBLE`.

---

## 2. المحاكي — مُنفَّذ

| الخطوة | الأمر | النتيجة |
|---|---|---|
| إزالة | `adb -s emulator-5554 uninstall com.airemote.agent` | `Success` |
| تثبيت | `adb -s emulator-5554 install -r app-debug.apk` | `Success` — versionCode **18** / versionName **3.8.12** |
| تهيئة | دفع `airemote-config.json` إلى `/sdcard/Android/data/com.airemote.agent/files/` | `192.168.1.55:3001` غير قابل للوصول من NAT المحاكي ← استُخدم `wss://127.0.0.1:3101/ws` عبر الجسر |
| تشغيل | `am start -n com.airemote.agent/.MainActivity` | `server:registered`، والجهاز `online agent=3.8.12-android` |

**ملاحظة:** الاستيراد من الملف يحدث فقط عندما تكون التفضيلات فارغة؛ لذا بعد أول تشغيل يلزم `pm clear` ثم إعادة دفع الملف، أو تمرير القيم عبر `am start --es server ... --es token ...` (المسار المستخدم فعلياً على TECNO).

**الصلاحيات المُعادة:** إمكانية الوصول (`AiRemoteA11y`)، الرسم فوق التطبيقات (`SYSTEM_ALERT_WINDOW: allow`)، الميكروفون (`RECORD_AUDIO: allow`). التقاط الشاشة يحتاج موافقة داخل التطبيق.

---

## 3. TECNO — مُنفَّذ عبر التصحيح اللاسلكي

الكبل اختفى من `adb devices`، ففُعِّل «التصحيح اللاسلكي» على الهاتف. أداة `adb` لا تدعم mDNS هنا (`mdns daemon unavailable`)، فتم:

1. **مسح منافذ محلي** على `192.168.1.100` في المدى 30000–49999 (23 ثانية) ← منفذان مفتوحان: **39271** (الاقتران) و**41329** (الاتصال).
2. `adb pair 192.168.1.100:39271 <code>` → `Successfully paired ... guid=adb-12927374CM001019-...`
3. `adb connect 192.168.1.100:41329` → `connected`، والجهاز ظهر بـ`product:KL4-OP model:TECNO_KL4`.
4. إزالة ← تثبيت 3.8.12 (versionCode 18) ← `pm clear`.
5. **تهيئة عبر Intent** بدل ملف (لأن `pm clear` يحذف مجلد `Android/data/<pkg>/files` و`adb push` إليه يُرفض بـ`secure_mkdirs failed`):
   `am start -n com.airemote.agent/.MainActivity --es server wss://192.168.1.25:3001/ws --es token <token> --ez autostart true`
   (العنوان الصحيح استُنتج من اتصال قائم: `Get-NetTCPConnection -RemoteAddress 192.168.1.100` أظهر `LocalAddress 192.168.1.25:3001`.)
6. **الصلاحيات:** إمكانية الوصول، الرسم فوق التطبيقات، الميكروفون — أُعيد منحها عبر adb، وأُرسل `--ez requestCapture true` لإظهار نافذة موافقة التقاط الشاشة.

**التحقق النهائي (واجهة `/api/devices` الحيّة):**

```
Android-Emulator | agent=3.8.12-android | online=true
TECNO-KL4        | agent=3.8.12-android | online=true
WIN10-VM         | agent=3.8.12         | online=true
WIN11-VM         | agent=3.8.12         | online=true
```

---

## 4. دروس تشغيلية

1. لا يوجد مفتاح إصدار على هذا الجهاز — أي تحديث أندرويد قادم يحتاج إزالة وإعادة تثبيت حتى يُنشأ مفتاح دائم ويُحفظ خارج المستودع.
2. `adb mdns` معطّل في هذه الأدوات؛ اكتشاف منفذ الاقتران يحتاج مسحاً محلياً أو قراءة المنفذ من شاشة الهاتف.
3. `pm clear` + دفع ملف التهيئة لا يتعايشان (المجلد يُحذف ويُرفض إنشاؤه من adb) — استخدم Intent extras.
4. بعد `am start` تُعاد الخدمة وقد تُسجّل نسخة قديمة لحظياً في `/api/devices`؛ الحكم النهائي من قراءة القاعدة أو من الواجهة بعد ثوانٍ.
