# استئناف AiRemote — 2026-11-20 · الإصدار **3.17.0** — نسخة **r33**

> **هذا الملف يحلّ محلّ r32 وكل ما قبله.** مكتوب لحساب جديد بلا ذاكرة.
> كل رقم هنا **مقيس** ودليله مذكور. **لا عمل بلا أمر مالك.**

---

## ⛔ 0) أمر التوقّف

**لا كتابة (بناء/تثبيت/تعديل/commit/إيقاف 3001/تعديل قاعدة) حتى: «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ» · «ثبّت».**
- ترخيصك الافتراضي: قراءة فقط + `curl /health` + `adb shell dumpsys`.
- محظور بلا إذن: إطفاء WiFi TECNO · المحاكي · `docker compose` · حذف `server.js` · إيقاف 3001.
- **قاعدة المالك:** لا بث لشاشة المالك (DESKTOP-K81PJ9H) إلى مشاهد على نفس الجهاز.

---

## 1) البيئة

| | |
|---|---|
| المسار | `D:\autoclaw projects-new\AiRemote` · فرع `feat/screen-unify-3.13.0` |
| السيرفر | `https://127.0.0.1:3001` · 3.17.0 · `C:\Users\admin\AppData\Local\Programs\AiRemote Server` |
| الوكيل | `...\Programs\AiRemote Agent` · asar **739,008 B** · 6/6 online |
| القاعدة | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` · نسخ في `backups\` |
| الحزم | `releases/server-windows` · `releases/agent-windows` |
| اعتماد الاختبار | `%APPDATA%\AiRemote\lab-probe.json` (admin) — لا تطبع أسرارًا |

---

## 2) الأسطول — 6/6 · كلهم owner `ad0d5d47…` (admin@airemote.local)

DESKTOP-K81PJ9H (`35850a47…`) · WIN10 (`b42175d0…`) · WIN11 (`d147684b…`) · TECNO (`07f8ae91…`) · TAB16 (`7fc54b40…`, adb `GPSZ2025040701858`) · Emulator (`9b5eeaf9…`).

---

## 3) ما أُنجز في r33 — أربعة إصلاحات واجهة

| البند | ما نُفّذ | التحقق |
|---|---|---|
| نص بطاقة وكيل↔وكيل | `#session-empty` يشرح: تظهر الأجهزة فقط بنفس الحساب | مخفي/ظاهر حسب عدد الأجهزة |
| النقر المزدوج | العارض كان يرسل `click` فقط؛ الوكيل يدعم `dblclick` ولا أحد يرسله ⇒ كشف ≤450ms/≤8px وإرسال `dblclick` (ويندوز فقط، أندرويد يبقى click) | `ScreenViewer-CdRrP_g5.js` المخدوم يحوي `dblclick` |
| مؤشر أندرويد | شرط رسم المؤشر `!remoteIsAndroid` | مصدر + بناء |
| ملفات | fs/list 200 (TAB16 **211** عنصرًا · WIN11 **26**) · النافذة تفتح **2→3** · `FILES-FALLBACK` يشتق filesUrl من viewUrl + focus + تسجيل فشل التحميل | اختبار جلسة حقيقية أُغلقت بعده |

**منشور:** لوحة asar **22,384,822 B** (`index-DWFjr5CQ.js`) · وكيل asar **739,008 B**.
**نسخ تراجع:** `resources\app.asar.bak-r32` في التطبيقين.
**الدليل:** `outputs/verify-2026-11-20/ux-fixes/r33-واجهة-2026-11-20.md`.

---

## 4) فخّ جديد — مهم

إعادة تشغيل وكيل سطح المكتب من قشرة بلا `AGENT_CA_CERT` تُنتج:
`[ws] self signed certificate` ثم `CLOSED 1006` — **لا يتصل أبدًا**.
القيمة الصحيحة (من `HKCU\Environment`):
`AGENT_CA_CERT = C:\Users\admin\AppData\Roaming\AiRemote-Server\tls\server.crt`
مرّرها قبل `Start-Process` عند أي تشغيل يدوي. (التشغيل التلقائي عند الدخول يرثها تلقائيًا.)

---

## 5) الفخاخ

78/82 a11y بعد force-stop · 79 MediaProjection · 80 AISHOT 1280×800 · **81 FileBridge لا تلمسها** · 83 vm-exec ~30ث · 84 lab-probe 5/دقيقة · 85 getRealMetrics · 88 `server.js` الحيّ · NSIS نفس الإصدار ⇒ استبدال asar · Chrome WSS ذاتي ⇒ بروكسي `ws://:8899` · لا تسحب فاصل split على TAB16 · `am start -p` كمصفوفة · `timeout.exe` ينهار بلا كونسول · بروتوكول الدلتا 21B (`dx=u32@13`, `dy=u32@17`) · bad=0 ≠ صفر تشويش · لا تُسقط إطار مفتاح أثناء فك الرمز.

---

## 6) حالة البنود

P1 ✅ 499–1149kbps · P2 ✅ 15.66fps@1080p · P3 ✅ 1px/0px · P4 ⛔ تجاوَز · P5 ⛔ مسدود · **P6 ✅ 10د6ث · 21/21 · 0/21 تشويش** · P7 ✅ مغلق · بطاقة وكيل↔وكيل ✅ (r32) · إصلاحات واجهة ✅ (r33).

---

## 7) الإسناد

```powershell
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 checkpoint -Path "D:\autoclaw projects-new\AiRemote" -Message "r33: <إنجاز مقيس>"
.\pf.ps1 handoff    -Path "D:\autoclaw projects-new\AiRemote"
git -C "D:\autoclaw projects-new\AiRemote" push github feat/screen-unify-3.13.0
```
+ `PROJECT_STATE` §0.1/§12 + ارفع r (r33 → r34).

---

## 8) نقطة الاستئناف

- آخر عمل: نشر لوحة + وكيل بإصلاحات r33 · 6/6 online · حزم release أُعيد بناؤها.
- السيرفر: 3.17.0 يعمل. البروكسي 8899 موقوف.
- أول بند عند «نفّذ»: ما يحدده المالك (مرشّح: اختبار النقر المزدوج على أيقونة سطح مكتب حقيقية من مشاهد خارجي، أو رسالة أوضح عند رفض جلسة الملفات).

---

*نهاية r33 — 2026-11-20 · أربعة إصلاحات منشورة ومُتحقَّقة · لا عمل بلا أمر.*
