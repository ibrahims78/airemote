# w28 — بثّ حيّ من TECNO KL4 (MediaProjection) — 2026-11-07

`node scripts/probe-view.cjs 07f8ae91-5b64-41d9-97df-ce649772b0d3 out.json --base https://127.0.0.1:3001 --move`

| البند | القيمة |
|---|---|
| الكانفس | `9216/9216` |
| بصمة (أول ← آخر) | `7258` ← `7258` (`changing:false` — الشاشة ساكنة) |
| رسائل WS | 14 |
| بايتات WS | 99,138 ← 100,277 (**+1.1KB** بعد إطار أول ~92KB) |
| `exceptions` / `consoleErrors` | **0 / 0** |
| الخروج | `0` |

**إطار حقيقي لا سواد:** اللقطة `view-tecno.png` تُظهر شاشة الهاتف نفسها بالعربية — «الإعدادات» · «عنوان الخادم (WebSocket)» = `wss://192.168.1.25:3001/ws` · «رمز الجهاز (Device Token)» بنقاط. حجم الإطار الأول (~92KB) يوافق صورة شاشة 720×1600 مضغوطة، لا شاشة فارغة.

## دليل من الجهاز نفسه (بعد الإقران اللاسلكي)

| الخطوة | الناتج |
|---|---|
| `adb pair 192.168.1.101:44927 673748` | `Successfully paired … [guid=adb-12927374CM001019-Q0lRGx]` |
| `adb connect 192.168.1.101:33273` | `connected to 192.168.1.101:33273` |
| `dumpsys package com.airemote.agent` | `versionName=3.14.2` · `versionCode=62` |
| `dumpsys media_projection` **أثناء الجلسة** | `(com.airemote.agent, uid=10305): TYPE_SCREEN_CAPTURE` |

الملف الخام: `dumpsys-media-projection.txt` · التشغيل الثاني: `view-tecno-adb.json` (`changing:false` لأن الشاشة ساكنة · `exceptions:0`).

> **لا تستدل بـ`appops`:** قيمته تتغيّر بين `ignore` و`default` مع نجاح الالتقاط نفسه — لأنه consent لكل جلسة لا `allow` دائم.
