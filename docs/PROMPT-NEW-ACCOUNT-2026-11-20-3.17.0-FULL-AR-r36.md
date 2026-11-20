# استئناف AiRemote — 2026-11-20 · الإصدار **3.17.0** — نسخة **r36**

> كل رقم مقيَّس. **لا عمل بلا أمر:** «ابدأ» · «نفّذ» · «اكمل» · «ابنِ» · «ثبّت».

## 1) ما أُنجز في r36 — طابور النقل داخل جلسة الوكيل

| البند | النتيجة |
|---|---|
| `ftTicketPrincipal` | مسارات `/api/file-transfers*` تقبل `rt` (`access=files`) أو header `x-relay-key` بجانب JWT |
| الواجهة | ترسل `x-relay-key` تلقائيًا عند غياب الحساب؛ الطابور ظاهر دائمًا + تنبيه ورابط «فتح مساحة الجهاز» |
| قياس E2E بلا حساب لوحة | create **201** · start **200** · chunk **200** · finish **200 (completed)** · list **200 (count 1)** · الملف **31 B** على WIN10 |
| النشر | لوحة `index-Dz9FOMfJ.js` · `server.bundle.js` **4221.4 KB** · 3001 = 3.17.0 |

## 2) المتبقي

1. **نقرة تنزيل تفاعلية** في نافذة الجلسة (السلسلة HTTP مقيسة؛ خطاف will-download منشور).
2. **عارض أندرويد لأهداف أخرى** (TECNO→DESKTOP) — عيّنة WIN10 نظيفة.
3. **PoC نفق Cloudflare** — ينتظر: نقل NS، API Token، إذن LTE.
4. CRD media (TURN/WebRTC) — لم يبدأ.

## 3) البيئة والفخاخ

- المسار `D:\autoclaw projects-new\AiRemote` · `feat/screen-unify-3.13.0` · السيرفر 3001.
- **بعد أي تعديل `server.js`: شغّل `node scripts/bundle.js`** قبل إعادة حزم asar — وإلا يعمل السيرفر بالحزمة القديمة (وقعنا فيها اليوم: 401).
- **`AGENT_CA_CERT`** مطلوب لتشغيل وكيل ويندوز يدويًا: `...\AiRemote-Server\tls\server.crt`.
- **فخّ Session 0:** تشغيل وكيل الضيف من vmrun ⇒ «No screens available»؛ الحل `schtasks /IT`.
- تحديث وكيل ضيف: انسخ asar إلى `C:\Windows\Temp\` ثم bat: taskkill → copy إلى `%LOCALAPPDATA%\Programs\AiRemote Agent\resources\` → start.
- APK: `JAVA_HOME` + `gradle assembleRelease --offline` + `apksigner` بـ`airemote-release.jks` (alias `airemote`).

## 4) الإسناد

```powershell
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 checkpoint -Path "D:\autoclaw projects-new\AiRemote" -Message "r36: ..."
.\pf.ps1 handoff    -Path "D:\autoclaw projects-new\AiRemote"
git -C "D:\autoclaw projects-new\AiRemote" push github feat/screen-unify-3.13.0
```

*نهاية r36.*
