# AiRemote — الحزم المبنية

> آخر تحديث: **2026-11-18** · الإصدار الحيّ: **3.17.0** (vc110) · مثبّت على مضيف 3001
> الإصدارات الأقدم من 3.16/3.11/3.8 مؤرشفة في `E:\AiRemote-Archive` (لا تُبنى من جديد بدون أمر).

---

## الملفات الحالية في هذا المجلد

### 🖥️ السيرفر — Windows x64

| الملف | الحجم | الوصف |
|---|---|---|
| `server-windows/AiRemote-Server-Setup-v3.17.0-x64.exe` | 158 MB | **المثبّت الرسمي** —NSIS، مثبّت على مضيف 3001 (يشمل إصلاحات 2026-11-18) |
| `server-windows/AiRemote-Server-v3.17.0-Windows-x64.zip` | 210 MB | نسخة محمولة (فُك الضغط وشغّل) |
| `server-windows/AiRemote-Server-Setup-v3.16.19-x64.exe` | 152 MB | **Rollback** — الإصدار السابق مباشرة (يلزمه مُحدّث الذاتي) |
| `server-windows/AiRemote-Server-Setup-v3.17.0-x64.exe.blockmap` | — | خريطة التحديث التفاضلي |

### 🤖 وكيل ويندوز — x64

| الملف | الحجم | الوصف |
|---|---|---|
| `agent-windows/AiRemote-Agent-Setup-v3.17.0-x64.exe` | 73 MB | مثبّت الوكيل GUI |
| `agent-windows/AiRemote-Agent-v3.17.0-Windows-x64.zip` | 99 MB | نسخة محمولة |

### 📱 وكيل أندرويد

| الملف | الحجم | الوصف |
|---|---|---|
| `android-agent/AiRemote-Agent-Android-v3.17.0.apk` | 234 KB | APK موقّع v2+v3 · versionCode 110 |
| `android-agent/AiRemote-Agent-Android-v3.17.0.apk.idsig` | — | بصمة التوقيع |

### 🔑 التوقيع والبيان

| الملف | الدور |
|---|---|
| `manifest.json` | بيان الحزم المصدرة (يقرأه مُحدّث الذاتي) |
| `manifest.sig` | توقيع Ed25519 للبيان |
| `release-key.pub.pem` | المفتاح العام |
| `release-key.pem` | المفتاح الخاص — **لا يُرفع ولا يُؤرشف** (gitignored) |

---

## ما أُرشِف (ليس في هذا المجلد)

إصدارات 3.16.0–3.16.18 و3.16.19 zips/APKs القديمة و3.16.0 APK جذرية و`win-unpacked` (~581 MB) و`patch-probe.exe` → `E:\AiRemote-Archive\2026-11-18\releases\`، والأقدم 3.8.x–3.11.x → `E:\AiRemote-Archive\releases\` (2026-11-02).

---

## التثبيت السريع

### السيرفر (المضيف)
1. شغّل `AiRemote-Server-Setup-v3.17.0-x64.exe`
2. انتظر `https://localhost:3001/health` → `{"version":"3.17.0"}`
3. `/api/downloads/version` يجب أن تعيد **3.17.0** (وليس 0.0.0 — مُصلَح 2026-11-18)

### وكيل ويندوز
1. أنشئ جهازاً في اللوحة → انسخ token
2. ثبّت `AiRemote-Agent-Setup-v3.17.0-x64.exe`
3. أدخل `wss://<server>/ws` + token — يظهر في System Tray

### أندرويد
ثبّت APK وادخل عنوان `wss://` + token.

---

## ملاحظات

- **TLS إلزامي** في production — السيرفر يولّد شهادة self-signed إذا لم تُعطَ `TLS_CERT_PATH`/`TLS_KEY_PATH`.
- الوكلاء المصغّران (`headless` / `script`) ضد شهادة ذاتية: اضبط `AGENT_INSECURE_TLS=1` للمعمل فقط.
- Docker حالياً يبني المرجع المجمد `packages/server` لا الحيّ — **لا تُشغَّل على إنتاج** (`docs/ADR/DUAL-SERVER.md`).
- لا تحذف `AiRemote-Server-Setup-v3.16.19-x64.exe` إلا بعد إضافة إصدار أقدم آخر للـrollback.
