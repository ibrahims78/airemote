# استئناف AiRemote — 2026-11-20 · الإصدار **3.17.0** — نسخة **r35**

> كل رقم مقيَّس. **لا عمل بلا أمر:** «ابدأ» · «نفّذ» · «اكمل» · «ابنِ» · «ثبّت».

## 1) ما أُنجز في r35

| البند | الرقم |
|---|---|
| **بوابة كلمة السر** | كان هناك **معالجان** لـ`session:offer`؛ أُصلح واحد فقط. الآن كلاهما `access==='control'` ⇒ **WIN10 وWIN11: view 200 · files 200** |
| وكيلا الضيفين | asar **740,659 B** داخل WIN10/WIN11 (نسخ + استبدال + مهمة `/IT`) |
| APK أندرويد | `assembleRelease` **BUILD SUCCESSFUL 1m17s** · موقّع `CN=AiRemote Agent` (SHA-256 `a776659a…`) · مثبّت على **TECNO وTAB16** (`Success`) |
| أندرويد→ويندوز | TAB16→WIN10: **3 لقطات نظيفة** (v1/v2/v3) بلا خطوط |
| حزمة الوكيل | zip **104,026,385 B** · Setup **76,409,702 B** (asar 740,659) |
| السيرفر | 3.17.0 · لوحة `index-B2yh_8C0.js` · 6/6 online |

## 2) المتبقي

1. **نقرة تنزيل تفاعلية** في نافذة جلسة (السلسلة HTTP مقيسة: 82B/15ms · 846KB/1.7s؛ الخطاف `will-download` موجود).
2. **عارض الأندرويد لبقية الأهداف** (المالك TECNO→DESKTOP) — القياس الحالي على WIN10 نظيف.
3. **PoC نفق Cloudflare** — ينتظر: نقل NS إلى Cloudflare، API Token، وإذن اختبار LTE (انظر `docs/reports/PLAN-CRD-CLOUDFLARE-TUNNEL-2026-11-20-AR.md`).
4. مسار CRD (TURN/WebRTC) — لم يبدأ.

## 3) البيئة والفخاخ

- المسار `D:\autoclaw projects-new\AiRemote` · `feat/screen-unify-3.13.0`.
- **`AGENT_CA_CERT=C:\Users\admin\AppData\Roaming\AiRemote-Server\tls\server.crt`** مطلوب لأي تشغيل يدوي لوكيل ويندوز.
- **فخّ Session 0:** تشغيل وكيل الضيف من `vmrun` مباشرة ⇒ «No screens available». الحل: `schtasks /IT` أو `-interactive`.
- **تحديث وكيل ضيف:** انسخ asar إلى `C:\Windows\Temp\` ثم bat يستبدل في `%LOCALAPPDATA%\Programs\AiRemote Agent\resources\` ويعيد التشغيل.
- **APK:** `JAVA_HOME` + `gradle assembleRelease --offline` ثم `apksigner` بـ`airemote-release.jks` (alias `airemote`).
- فخاخ قديمة: 78/82 a11y · 81 FileBridge · 88 server.js الحيّ · دلتا 21B `dx=u32@13` · bad=0 ≠ صفر تشويش.

## 4) الإسناد

```powershell
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 checkpoint -Path "D:\autoclaw projects-new\AiRemote" -Message "r35: ..."
.\pf.ps1 handoff    -Path "D:\autoclaw projects-new\AiRemote"
git -C "D:\autoclaw projects-new\AiRemote" push github feat/screen-unify-3.13.0
```

*نهاية r35.*
