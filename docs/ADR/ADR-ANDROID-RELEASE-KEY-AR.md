# قرار مفتاح توقيع Android (R6 → R8)

**التاريخ:** 2026-10-29 · **القرار:** المالك — توليد مفتاح إصدار جديد والاحتفاظ به
**الحالة:** القرار معتمد · التنفيذ **محجوب** لغياب JDK على هذا الجهاز (لا `keytool`، `JAVA_HOME` فارغ)

---

## 1. نص القرار

1. **مفتاح إصدار جديد** يُولَّد ويُحفظ خارج المستودع، ويُستخدم لكل إصدارات Android من الآن.
2. **Authenticode:** «الأفضل المتاح» — يبقى التحديث على قناة موثوقة + SHA-256 + بصمة الحزمة، وتُهيّأ خطوة التوقيع لتُفعَّل عند شراء الشهادة لاحقاً. لا ادعاء توقيع غير موجود.
3. **الترخيص:** يبقى **MIT** كما هو.
4. **GitHub:** كل العمل محلي؛ لا `push` ولا Release.

## 2. مكان المفتاح (لا يدخل Git أبداً)

```text
C:\Users\admin\AppData\Roaming\AiRemote\signing\
├─ airemote-release.jks      # المفتاح (PKCS12)
└─ signing.properties        # storePassword / keyPassword / alias
```

`%APPDATA%\AiRemote\signing` مستثنى أصلاً من النسخ الاحتياطي للمستودع، ولا يُطبع محتواه في أي تقرير.

## 3. الأثر الذي يجب أن يُقال صراحةً

النسخ المثبَّتة حالياً على المحاكي وTECNO موقّعة بمفتاح **مفقود**. أي APK بالمفتاح الجديد:

- **لا يُرقّى في المكان** (توقيع مختلف) → يلزم **إزالة ثم تثبيت**.
- الإزالة تُفقد: عنوان السيرفر المحفوظ، رمز الجهاز، والصلاحيات الممنوحة (التقاط الشاشة، إمكانية الوصول، الرسم فوق التطبيقات، الميكروفون) — تُعاد يدوياً أو عبر `adb`.
- الحل المعتمد سابقاً (إعادة منح عبر `adb`) ما زال صالحاً، لكنه يحتاج الجهاز موصولاً.

## 4. خطوات التنفيذ عند توفر JDK

```powershell
$keytool = "$env:JAVA_HOME\bin\keytool.exe"
$dir = "C:\Users\admin\AppData\Roaming\AiRemote\signing"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
& $keytool -genkeypair -v -keystore "$dir\airemote-release.jks" `
  -alias airemote -keyalg RSA -keysize 4096 -validity 10950 `
  -storetype PKCS12 -dname "CN=AiRemote, O=AiRemote, C=SY"
```

ثم في `packages/android-agent/app/build.gradle`:

```gradle
def props = new Properties()
def f = file(System.getenv('AIREMOTE_SIGNING_PROPERTIES') ?: '')
if (f.exists()) props.load(new FileInputStream(f))
android {
  signingConfigs {
    release {
      storeFile file(props['storeFile'] ?: '')
      storePassword props['storePassword']
      keyAlias props['keyAlias']
      keyPassword props['keyPassword']
    }
  }
  buildTypes { release { signingConfig signingConfigs.release } }
}
```

## 5. معيار الإنجاز

- `keytool -list -v -keystore …` يطبع بصمة SHA-256 للمفتاح، وتُسجَّل في `docs/RELEASE-KEY-FINGERPRINT.md` (بصمة فقط، لا كلمات مرور).
- بناء `assembleRelease` ينتج APK موقّعاً، و`apksigner verify` ينجح.
- تثبيت على المحاكي بعد إزالة النسخة القديمة، وإعادة منح الصلاحيات، ثم ظهور الجهاز في اللوحة برقم الإصدار الجديد.

## 6. ما لم يُنفَّذ هنا ولماذا

لم يُولَّد المفتاح في هذه الجلسة: **لا JDK على الجهاز** (`keytool` غير موجود، `JAVA_HOME` فارغ). توليد مفتاح بأداة غير موجودة، أو كتابة سكربت غير مُختبر والادعاء أنه جاهز، مرفوض بقاعدة «لا تم قبل الدليل». الخطوات أعلاه مكتوبة لتُنفَّذ في أول جلسة يتوفر فيها JDK.
