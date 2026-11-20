# استئناف AiRemote — 2026-11-20 · الإصدار **3.17.0** — نسخة **r34**

> **هذا الملف يحلّ محلّ r33 وكل ما قبله.** كل رقم **مقيس**.
> **لا عمل بلا أمر مالك:** «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ» · «ثبّت».

---

## 1) البيئة

| | |
|---|---|
| المسار | `D:\autoclaw projects-new\AiRemote` · `feat/screen-unify-3.13.0` |
| السيرفر | `https://127.0.0.1:3001` · 3.17.0 · لوحة `index-B2yh_8C0.js` · asar **22,384,913 B** |
| الوكيل (المالك) | asar **740,490 B** · 6/6 online |
| القاعدة | `%APPDATA%\AiRemote-Server\airemote.db` · نسخ `backups\` |
| الحزم | `releases/server-windows` · `releases/agent-windows` |

**فخ تشغيل الوكيل يدويًا:** بلا `AGENT_CA_CERT=C:\Users\admin\AppData\Roaming\AiRemote-Server\tls\server.crt` ⇒ `self signed certificate` → 1006 ولا يتصل.

---

## 2) الأسطول — 6/6 · owner `ad0d5d47` (admin@airemote.local)

DESKTOP-K81PJ9H (`35850a47…`) · WIN10 (`b42175d0…`) · WIN11 (`d147684b…`, **controlAuth=password**) · TECNO (`07f8ae91…`) · TAB16 (`7fc54b40…`, adb `GPSZ2025040701858`) · Emulator (`9b5eeaf9…`).

---

## 3) ما أُنجز في r34

| البند | التغيير | الدليل |
|---|---|---|
| الملاءمة عند بدء البث | `fit` دائمًا + إعادة ضبط عند البدء — كل الأنواع تمرّ عبر ScreenViewer | `tsc` 0 · `index-B2yh_8C0` |
| كلمة السر كانت تحجب view/files | الشرط صار `access==='control'` (ويندوز + مصدر أندرويد) | قبل: WIN11 409 فورًا |
| تنزيل الملفات | `will-download` في نافذة الجلسة → Downloads + سجل | list 36–83ms · 82B/15ms · 846KB/1.7s |
| تأخير القوائم | كاش لكل مجلد في FileManager | رجوع فوري |
| رسالة كلمة السر/الرفض | `deniedFlag` — لا يطمس عدّاد الانتظار رسالة الرفض | إصلاح سباق |
| رسالة الطابور | صياغة أوضح | — |
| التشويش | TAB16 56 إطارًا (5 مفاتيح/51 دلتا) بمُركِّب خارجي = **نظيف** · المالك P6 0/21 | **لم يُعَد إنتاجه** |

---

## 4) مفتوح (يحتاج أمرًا/معلومة)

1. **وكيلا WIN10/WIN11 لم يُحدّثا** إلى asar 740,490 B ⇒ طلبات view/files إليهما تُرفض 409 (السلوك القديم). يلزم نقل asar إلى الضيفين (vmrun/schtasks) أو موافقتك على الطريقة.
2. **APK أندرويد**: إصلاح بوابة كلمة السر في المصدر فقط (`AgentService.java`) — لم يُبنَ/يُثبَّت APK.
3. **التشويش**: لم يُعَد إنتاجه في المسار المقيس. **حدّد الجهاز الذي يظهر عليه** (WIN10/WIN11/TECNO/TAB16/جهاز المالك) لأقيسه برقم.
4. حزم الإصدار تُعاد بناؤها في هذه الجولة (server zip/Setup + agent zip/Setup).

---

## 5) الفخاخ

78/82 a11y · 79 MediaProjection · 80 AISHOT · **81 FileBridge** · 83 vm-exec · 84 lab-probe 5/د · 85 getRealMetrics · 88 server.js الحيّ · NSIS نفس الإصدار ⇒ استبدال asar · Chrome WSS ذاتي ⇒ بروكسي 8899 · لا تسحب فاصل split · `am start -p` كمصفوفة · `timeout.exe` بلا كونسول · دلتا 21B (`dx=u32@13`,`dy=u32@17`) · bad=0 ≠ صفر تشويش · لا تُسقط مفتاحًا أثناء فك الرمز · **`AGENT_CA_CERT` عند تشغيل الوكيل يدويًا**.

---

## 6) الإسناد

```powershell
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 checkpoint -Path "D:\autoclaw projects-new\AiRemote" -Message "r34: <إنجاز مقيس>"
.\pf.ps1 handoff    -Path "D:\autoclaw projects-new\AiRemote"
git -C "D:\autoclaw projects-new\AiRemote" push github feat/screen-unify-3.13.0
```

---

## 7) نقطة الاستئناف

- آخر عمل: نشر لوحة/وكيل بإصلاحات r34 · 6/6 online · إعادة بناء الحزم.
- أول بند عند «نفّذ»: تحديث وكيلي WIN10/WIN11، أو تحديد جهاز التشويش، أو بناء APK.

---

*نهاية r34 — 2026-11-20 · ملاءمة افتراضية · كلمة السر للتحكم فقط (كود) · تنزيل/كاش · رفض فوري · لا عمل بلا أمر.*
