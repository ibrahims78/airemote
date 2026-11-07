# w27 — بثّ حيّ من TAB16 (MediaProjection) — 2026-11-07

`node scripts/probe-view.cjs 7fc54b40-e7c1-4db6-9f55-78f377c4f4ad out.json --base https://127.0.0.1:3001 --move`

## تشغيلان: ساكن ثم متحرّك

| البند | الشاشة ساكنة | الشاشة تتغيّر (HOME · إعادة فتح · تبديل لغة/تبويب) |
|---|---|---|
| بصمة الكانفس (أول ← آخر) | `39411` ← `39411` | **`90452` ← `39943`** |
| `changing` | `false` | **`true`** |
| رسائل WS | 35 | 56 |
| بايتات WS | 165,740 ← 170,482 (**+4.7KB**) | 562,916 ← 947,234 (**+384KB**) |
| `exceptions` / `consoleErrors` | 0 / 0 | 0 / 0 |

**الحكم:** الالتقاط يعمل. `changing:false` في التشغيل الأول ليس عيبًا — الشاشة كانت ساكنة، فلا إطارات جديدة (والزيادة 4.7KB نبضات لا صور). وبمجرد تحريك الشاشة تغيّرت البصمة وتدفّقت **384KB** إطارات.

## دليل من الجهاز نفسه
`adb -s GPSZ2025040701858 shell dumpsys media_projection` أثناء الجلسة:

```
Media Projection:
(com.airemote.agent, uid=10122): TYPE_SCREEN_CAPTURE
```

أي أن النظام يرى جلسة التقاط نشطة باسم الوكيل — لا مجرد ادّعاء من التطبيق.

## ملاحظة
`appops get com.airemote.agent PROJECT_MEDIA` يبقى `ignore; rejectTime=…` حتى مع التقاط ناجح: منح MediaProjection في Android لا يُكتب كـ`allow` دائم في appops، بل consent لكل جلسة. لذلك **لا يصحّ** الاستدلال بـ`appops` وحده على المنح أو رفضه، والدليل الصحيح هو `dumpsys media_projection` + تدفّق الإطارات.
