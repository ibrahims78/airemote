# أندرويد — سلسلة الأدوات ومفتاح التوقيع (مرجع تشغيلي)

**التاريخ:** 2026-10-29 · **الحالة:** موثَّق ومُتحقَّق منه · **لم يُبنَ APK ولم يُثبَّت شيء**

هذا الملف يسدّ ثغرة في التسليم السابق كان يقول «لا يوجد JDK ولا مفتاح إصدار». **كلاهما موجود.**

---

## 1. سلسلة الأدوات (offline)

المسار الجذر: `D:\autoclaw projects\offline-build-tools\android-toolchain\`

| الأداة | المسار | الإصدار |
|---|---|---|
| JDK | `jdk\bin\java.exe` · `jdk\bin\keytool.exe` | **OpenJDK 21.0.5 LTS** (Microsoft build 21.0.5+11) |
| Android SDK build-tools | `sdk\build-tools\34.0.0\apksigner.bat` | 34.0.0 |
| platform-tools | `sdk\platform-tools\adb.exe` | موجود (transport_id يعمل) |
| Gradle | `gradle\bin\gradle.bat` | موجود |
| إعدادات SDK | `android-init.gradle` | — |

**قاعدة:** أي أمر توقيع يحتاج `JAVA_HOME=D:\autoclaw projects\offline-build-tools\android-toolchain\jdk` وإلا فشل `apksigner` و`keytool`.

---

## 2. مفتاح التوقيع

| الحقل | القيمة |
|---|---|
| المسار | `%APPDATA%\AiRemote\signing\airemote-release.jks` |
| كلمة المرور | `%APPDATA%\AiRemote\signing\keystore-password.txt` (66 بايت — **لا تُطبع ولا تُرفع**) |
| الصيغة | PKCS12 · مدخل واحد |
| Alias | `airemote` · `PrivateKeyEntry` |
| Subject | `CN=AiRemote Agent, OU=Engineering, O=AiRemote, C=SY` |
| الصلاحية | 2026-10-26 → **2036-10-23** |
| الخوارزمية | SHA384withRSA |
| بصمة SHA-256 | `A7:76:65:9A:C4:AB:23:F2:A7:1B:33:6C:59:72:27:B9:79:85:62:2F:D3:58:15:8E:FE:26:05:86:1B:05:D5:00` |
| الحالة | **صالح ويُفتح بنجاح** (تحقّق فعلي بـ`keytool -list -v`) |

### أوامر التحقق (بلا كشف كلمة المرور)
```powershell
$tc='D:\autoclaw projects\offline-build-tools\android-toolchain'
$env:KS_PW = (Get-Content "$env:APPDATA\AiRemote\signing\keystore-password.txt" -Raw).Trim()
& "$tc\jdk\bin\keytool.exe" -list -v `
  -keystore "$env:APPDATA\AiRemote\signing\airemote-release.jks" `
  -storepass:env KS_PW
Remove-Item Env:\KS_PW
```
`-storepass:env` يمنع ظهور الكلمة في سطر الأوامر أو السجل.

### قالب التوقيع (عند البناء)
```powershell
$env:JAVA_HOME='D:\autoclaw projects\offline-build-tools\android-toolchain\jdk'
& "$env:JAVA_HOME\..\sdk\build-tools\34.0.0\apksigner.bat" sign `
  --ks "$env:APPDATA\AiRemote\signing\airemote-release.jks" `
  --ks-key-alias airemote --out app-release-signed.apk app-release-unsigned.apk
& "$env:JAVA_HOME\..\sdk\build-tools\34.0.0\apksigner.bat" verify --print-certs app-release-signed.apk
```

---

## 3. الجهاز والنسخة المثبَّتة (تحقّق فعلي)

| العنصر | القيمة |
|---|---|
| الاتصال | USB · `adb devices` → `12927374CM001019  device` |
| الطراز | **TECNO KL4** · `product:KL4-OP` |
| أندرويد | **14** (SDK 34) |
| الحزمة | `com.airemote.agent` |
| المثبَّت | **3.8.12** · versionCode 18 · آخر تحديث 2026-10-28 16:34 |
| توقيع المثبَّت | `CN=Android Debug, O=Android, C=US` — **مفتاح تصحيح**، بصمة `6d8ea7488444c5cb761e191c9ab994f8ac638e653a65d8c56826ab18f496f2bc` |

**الاستنتاج الحاسم:** APK المثبَّت **ليس** موقّعاً بمفتاح الإصدار `airemote`. لذلك:
- ترقية في المكان بـAPK موقّع بالمفتاح الجديد **سترفض** (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`).
- الحل: **إزالة ثم تثبيت** — ويفقد: عنوان السيرفر، رمز الجهاز، الصلاحيات الممنوحة.
- البديل للمختبر فقط: توقيع APK بمفتاح debug نفسه (لا يصلح للإصدار).

---

## 4. ملاحظة على مساري المشروعين (مهمة)

| المسار | الحالة |
|---|---|
| `D:\autoclaw projects\AiRemote` | نسخة **أقدم**: `versionName 3.6.0` · بلا `signingConfig` · لا مفتاح داخلها |
| `D:\autoclaw projects-new\AiRemote` | **المستودع العامل**: 3.8.13 (بعد رفع الإصدار اليوم) · versionCode 18 |

البحث عن المفتاح داخل `D:\autoclaw projects\AiRemote` **لا معنى له بعد اليوم**؛ المفتاح خارج المشروعين في `%APPDATA%`.

---

## 5. ما لم يُنفَّذ

لا بناء APK، ولا تثبيت، ولا إزالة، ولا تعديل `build.gradle`، ولا لمس قاعدة السيرفر. كل ما سبق **تحقّق قراءة فقط**.
