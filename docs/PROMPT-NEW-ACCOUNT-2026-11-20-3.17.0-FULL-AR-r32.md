# استئناف AiRemote — 2026-11-20 · الإصدار **3.17.0** — نسخة **r32**

> **هذا الملف يحلّ محلّ r31 وكل ما قبله.** مكتوب لحساب جديد بلا ذاكرة.
> كل رقم هنا **مقيس** ودليله مذكور. **لا عمل بلا أمر مالك.**

---

## ⛔ 0) أمر التوقّف

**لا كتابة (بناء/تثبيت/تعديل/commit/إيقاف 3001/تعديل قاعدة) حتى يقول المالك: «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ» · «ثبّت».**

- ترخيصك الافتراضي: قراءة فقط + `curl /health` + `adb shell dumpsys` للقراءة.
- محظور بلا إذن لحظي: إطفاء WiFi على TECNO · تشغيل المحاكي · `docker compose` على قاعدة الإنتاج · حذف `server.js` · إيقاف/إعادة تشغيل 3001.
- **قاعدة المالك:** لا بث لشاشة المالك (DESKTOP-K81PJ9H) إلى مشاهد على نفس الجهاز؛ القياس من مشاهد خارجي فقط.

---

## 1) البيئة

| | |
|---|---|
| المسار | `D:\autoclaw projects-new\AiRemote` |
| الفرع | `feat/screen-unify-3.13.0` · GitHub `git@github.com:ibrahims78/airemote.git` (remote `github`) |
| السيرفر | `https://127.0.0.1:3001` · 3.17.0 · مثبَّت في `C:\Users\admin\AppData\Local\Programs\AiRemote Server` |
| القاعدة | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` (+WAL) · نسخ في `...\backups\` |
| الحزم | `releases/server-windows` (zip + NSIS) |
| اعتماد الاختبار | `%APPDATA%\AiRemote\lab-probe.json` (admin) — لا تطبع أسرارًا |
| adb | `D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe` |

---

## 2) الأسطول — 6/6 online · 3.17.0 · **كلهم owner = admin@airemote.local (`ad0d5d47…`)**

DESKTOP-K81PJ9H (`35850a47…`) · WIN10-VM (`b42175d0…`) · WIN11-VM (`d147684b…`) · TECNO-KL4 (`07f8ae91…`) · TAB16-USB (`7fc54b40…` · adb `GPSZ2025040701858`) · Android-Emulator (`9b5eeaf9…`, بموافقة فقط).

---

## 3) ما أُنجز في r32 — بطاقة «الاتصال بجهاز آخر»

**العَرَض:** وكيل جهاز المالك لا يعرض أجهزة، ولا يظهر للأجهزة الأخرى.

**السبب (مقيس):**
- `GET /api/relay/devices` (server.js:6901) = `WHERE owner_id=? AND id<>?` ⇒ أجهزة **نفس المالك** فقط.
- `POST /api/relay/request` (server.js:6950) يرفض اختلاف المالك.
- `DESKTOP-K81PJ9H` كان `owner_id=098c4011…` = **lab-probe@local**، والباقي `ad0d5d47…` = **admin@airemote.local**. الستة online.

**الإصلاح:**
- نسخة احتياطية: `...\backups\airemote.db.bak-r32-2026-11-19T21-37-13` — **45,449,216 B**
- `UPDATE devices SET owner_id='ad0d5d47-76f1-4632-89dd-55db3a9bf543' WHERE id='35850a47-…'` — **rows=1**
- **بلا إعادة تشغيل**.

**التحقق (بمصادقة الجهاز `x-device-token`):**
- من DESKTOP-K81PJ9H → `/api/relay/devices` **200 · 5 أجهزة** (كلها online · view=true)
- من TAB16 → **DESKTOP-K81PJ9H ظاهر**
- `/api/relay/sessions` 200

**الدليل:** `outputs/verify-2026-11-20/relay-owner/r32-إصلاح-ملكية-الجهاز-2026-11-20.md`
**التراجع:** استعادة النسخة أعلاه، أو UPDATE عكسي إلى `098c4011-0594-4799-a938-b2c981145c67`.

---

## 4) حالة البنود

| البند | الحالة |
|---|---|
| P1 دلتا GDI | ✅ 499–1149 kbps · 0 تالف (WIN10) |
| P2 FPS 1080p | ✅ 15.66 fps @1920×1080 من WIN11 |
| P3 WIN10 / TECNO | ✅ 1px / 0px |
| P4 | ⛔ تجاوَز بأمر المالك |
| P5 WAN LTE | ⛔ مسدود |
| P6 تشويش 10د | ✅ 10د6ث · 21/21 · 0/21 تشويش · bad=0 |
| P7 WebRTC M1 | ✅ مغلق بقرار |
| نشر اللوحة على 3001 | ✅ asar 22,384,587 B · بصمة مطابقة · 6/6 online |
| حزم الإصدار | ✅ zip 220,214,513 B · Setup 166,042,144 B |
| بطاقة وكيل↔وكيل | ✅ r32 — 5⇄1 مرئي |

---

## 5) الفخاخ

| # | القاعدة |
|---|---|
| 78/82 | بعد force-stop أندرويد أعد تمكين a11y. |
| 79 | MediaProjection واحد/عملية. |
| 80 | AISHOT 1280×800. |
| 81 | **FileBridge — لا تلمسها.** |
| 83 | `vm-exec` على WIN11 يقطع ~30ث. |
| 84 | lab-probe 5 دخول/دقيقة. |
| 85 | `getRealMetrics()` لا `getDisplayMetrics()`. |
| 88 | `server.js` الحيّ ≠ `packages/server` TS. |
| NSIS | نفس الإصدار لا يكتب فوق المثبت ⇒ استبدال asar. |
| Chrome WSS | يرفض الشهادة الذاتية ⇒ بروكسي `ws://:8899`. |
| split-screen | لا تسحب الفاصل على TAB16. |
| `am start -p` | وسائط adb كمصفوفة. |
| `timeout.exe` | ينهار بلا كونسول — `setTimeout`. |
| بروتوكول الدلتا | 21 بايت · `dx=u32@13` · `dy=u32@17` · قراءة `u16` = تشويش. |
| bad=0 | JPEG سليم فقط — التشويش يُرى بالعين. |
| **r32** | **`/api/relay/*` مقيَّد بنفس `owner_id`.** اختلاف المالك = بطاقة فارغة + رفض الطلب. افحص `owner_id` قبل أي تشخيص اتصال. |
| **r32** | مصادقة الوكيل على relay: ترويسة **`x-device-token`** (عمود `devices.token`)، لا Bearer. |

---

## 6) قواعد كل بند

تنفيذ + قياس مُثبت في `outputs/verify-<اليوم>/` + توثيق (CHANGELOG + STATE §12) + commit إنجليزي برقم البند + `pf checkpoint`.
**ممنوع:** ميزة خارج البنود · سرّ في ملف متتبَّع · حذف `server.js` · ادعاء قياس لم يُشغَّل.

---

## 7) الإسناد

```powershell
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 checkpoint -Path "D:\autoclaw projects-new\AiRemote" -Message "r32: <إنجاز مقيس>"
.\pf.ps1 handoff    -Path "D:\autoclaw projects-new\AiRemote"
git -C "D:\autoclaw projects-new\AiRemote" push github feat/screen-unify-3.13.0
```
+ حدّث `PROJECT_STATE` §0.1 و§12 + ارفع r (r32 → r33).

---

## 8) نقطة الاستئناف

- **آخر عمل:** إصلاح ملكية جهاز المالك + تحقق 5⇄1 · بلا تغيير كود.
- **السيرفر:** 3001 يعمل 3.17.0 · 6/6 online.
- **نسخ احتياطية:** `app.asar.bak-r30` (resources) · `airemote.db.bak-r32-…` (backups).
- **أول بند عند «نفّذ»:** ما يحدده المالك. مرشّح: تحسين رسالة البطاقة عند عدم وجود أجهزة في الحساب (ميزة — تحتاج أمرًا)، أو رفع الإصدار، أو بند جديد.

---

*نهاية r32 — 2026-11-20 · بطاقة وكيل↔وكيل تعمل بالدليل (5⇄1) · لا عمل بلا أمر.*
