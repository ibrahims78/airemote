# استئناف AiRemote — 2026-11-19 · الإصدار **3.17.0** — نسخة **r23**

> **هذا الملف يحلّ محلّ r22 وما قبله.**  
> «ثبّت» نُفِّذ: الأسطول على 3.17.0 + بنود أ–د مكتملة بالقياس. المتبقي يحتاج أوامر صريحة.

---

## ⛔ 0) أمر التوقّف

**قِف هنا. لا كتابة حتى «ابدأ/نفّذ/اكمل/عدّل/ثبّت/تحقّق ثم قف».**

---

## 1) الهوية

- **المسار:** `D:\autoclaw projects-new\AiRemote`  
- **الفرع:** `feat/screen-unify-3.13.0`  
- **الكود الحيّ:** `packages/server-desktop/server.js` (فخّ 88)  
- **3001:** `https://127.0.0.1:3001` · 3.17.0 · **لا توقفه** بلا أمر.  
- **GitHub:** مربوط. Gitea قد يكون مغلقًا.  
- **اعتماد:** `lab-probe@local` في `%APPDATA%\AiRemote\lab-probe.json` · لا سرّ في تقرير.

---

## 2) المنجز في r23 (لا تُعِده)

- **APK** على TECNO وTAB16 (vc110) + a11y + MediaProjection.  
- **وكيل ويندوز** على المضيف وWIN10 وWIN11 — **يجب أن يعمل في جلسة المستخدم** (Session 1). vmrun يضعه Session 0 ⇒ بث أسود. استخدم schtasks `/IT`.  
- **سيرفر 3001** مُحدَّث (زر اللقطة حيّ).  
- **بند أ:** WIN11 بث 1600×900/1600×677 واضح.  
- **بند ب:** حوار المنح فوري بلا WakeActivity + `grantedSessions.add` — تحكم TECNO كامل.  
- **بند ج:** تبديل جودة ويندوز فعلي (1280/1920/640).  
- **بند د:** زر لقطة PNG في العارض ينزّل صورة واضحة.  
- **إصلاحات مصدر:** WakeActivity الشرطي · grantedSessions.add · حذف `String()` الكاسر للبناء.

**الدليل:** `outputs/verify-2026-11-19/screen/r22-تثبيت-2026-11-19.md`

---

## 3) فخّ جديد موثّق — Session 0

`vmrun runProgramInGuest` يشغّل أي برنامج في Session 0 ⇒ GDI أسود.  
**لا تُشغّل وكيل ويندوز في VM بـvmrun مباشرة.** استخدم:

```
schtasks /Create /TN r22ag /TR "\"...AiRemote Agent.exe\" --autostart" /SC ONCE /ST 23:59 /IT /F
schtasks /Run /TN r22ag
```

وكيل المضيف يحتاج `AGENT_CA_CERT` (user env). Run key من Explorer يورّثه.

---

## 4) المتبقي — بأوامر المالك

| البند | الشرط |
|---|---|
| هـ WAN | أمر بإطفاء WiFi على TECNO |
| و المحاكي | موافقة المالك (`emulator-5554` offline) |
| ز اختياري | دلتا GDI · تشويش جهاز المالك على شاشة ثانية |

---

## 5) الأجهزة

| الجهاز | ID | حالة r23 |
|---|---|---|
| DESKTOP-K81PJ9H | `35850a47-e50f-48f3-bc81-8c38d7a908c0` | online · وكيل جديد |
| WIN10-VM | `b42175d0-d0c9-428d-ab94-4e66dff56af3` | online · Session 1 · جودة تعمل |
| TECNO-KL4 | `07f8ae91-5b64-41d9-97df-ce649772b0d3` | online · تحكم ممنوح |
| TAB16-USB | `7fc54b40-e7c1-4db6-9f55-78f377c4f4ad` | online · WebP دلتا |
| WIN11-VM | `d147684b-2451-4418-a628-86f11aa66a4e` | online · Session 1 |
| Android-Emulator | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` | offline |

---

## 6) الفخاخ

78/82 a11y بعد إعادة تشغيل الوكيل · 79 MediaProjection لكل عملية · 80 AISHOT · 81 FileBridge · 83 vm-exec WIN11 · 84 حد lab-probe · 85 getRealMetrics · 88 server.js الحيّ · 51 screenshot TECNO · **جديد: vmrun Session 0 = بث أسود**.

---

## 7) بروتوكول كل بند

تنفيذ + قياس في `outputs/verify-2026-11-19/screen/` + توثيق + commit إنجليزي + `pf checkpoint`.  
عند التوقف: checkpoint + handoff + r23→r24 + ادفع GitHub.

**ممنوع:** ميزة جديدة · سرّ في ملف · حذف server.js · إيقاف 3001 بلا أمر · docker compose على الإنتاج.

---

*نهاية r23 — 2026-11-19 · «ثبّت» مكتمل · بنود أ–د مُقاسة · هـ/و/ز تنتظر المالك.*
