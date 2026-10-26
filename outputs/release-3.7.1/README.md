# حزمة إصدار AiRemote 3.7.1

هذا المجلد يحمل **بيانات التحقق** الخاصة بالإصدار، وليس نسخاً من الحزم الثنائية.
الحزم نفسها تبقى في `releases/` لأن سكربتات البناء والتوزيع تعتمد على هذا المسار
(النسخ المكررة ستضيف أكثر من 300 ميغابايت إلى المستودع بلا فائدة).

## الحزم

| الحزمة | المسار | الإصدار |
|---|---|---|
| سيرفر Windows (مثبت NSIS) | `releases/server-windows/AiRemote-Server-Setup-v3.7.1-x64.exe` | 3.7.1 |
| سيرفر Windows (ZIP) | `releases/server-windows/AiRemote-Server-v3.7.1-Windows-x64.zip` | 3.7.1 |
| وكيل Windows (مثبت NSIS) | `releases/agent-windows/AiRemote-Agent-Setup-v3.7.0-x64.exe` | 3.7.0 |
| وكيل Windows (ZIP) | `releases/agent-windows/AiRemote-Agent-v3.7.0-Windows-x64.zip` | 3.7.0 |
| وكيل أندرويد (مفتاح الإصدار) | `releases/android-agent/AiRemote-Agent-Android-v3.7.0.apk` | 3.7.0 |
| وكيل أندرويد (مفتاح debug — للمحاكي فقط) | `releases/android-agent/AiRemote-Agent-Android-v3.7.0-lab.apk` | 3.7.0 |

## التحقق

```bash
node scripts/release-manifest.js --verify     # يتحقق من التوقيع وبصمات كل الحزم
```

- `manifest.json` — بصمات SHA-256 لكل الحزم.
- `manifest.sig` — توقيع Ed25519 على الملف أعلاه.
- `release-key.pub.pem` — المفتاح العام للتحقق.
- `SHA256SUMS.txt` — بصمات حزم 3.7.x بصيغة `sha256sum`.

**المفتاح الخاص** (`releases/release-key.pem`) لا يُرفع إلى Git، وهو مستثنى في `.gitignore`.
مفتاح توقيع APK محفوظ خارج المستودع في `%APPDATA%\AiRemote\signing`.

## ما الذي تغيّر في 3.7.1

إصلاح فشل WebSocket في نافذة اللوحة: شهادة TLS الذاتية كانت تُرفض في مصافحة `wss://`
لأن معالج `certificate-error` لا يغطيها، فحُلّت بـ`setCertificateVerifyProc` على مستوى
الجلسة. التفاصيل في `docs/RELEASE-3.7.0-VERIFICATION-AR.md` (القسم 8).
