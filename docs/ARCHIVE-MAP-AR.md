# خريطة الأرشيف — `E:\AiRemote-Archive`

نُقلت من المشروع في 2026-11-08 ملفات **لا تدخل البناء ولا التشغيل ولا البوابات**: **10.41GB في 2203 ملفًا**. المشروع من **13.5GB إلى 3.4GB**.

## ماذا نُقل وأين

| المجلد | الحجم | ما فيه |
|---|---|---|
| `E:\AiRemote-Archive\releases\server-windows` | ~5.9GB | كل مثبّتات وحِزم السيرفر قبل 3.16.0 (3.11.7 → 3.15.0) |
| `E:\AiRemote-Archive\releases\agent-windows` | ~2.9GB | كل مثبّتات وحِزم الوكيل قبل 3.16.0 |
| `E:\AiRemote-Archive\releases\archive` | 1.05GB | نسخ المختبر (`vc63`–`vc67`) — كانت موسومة «لا تُنشر» |
| `E:\AiRemote-Archive\releases\apk` | — | `AiRemote-Agent-3.14.0 … 3.15.0` مع `.idsig` |
| `E:\AiRemote-Archive\outputs` | 637MB | كل `outputs/verify-*` قبل 2026-11-08 + `audit-frames` + `perf` + نسخة القاعدة الاحتياطية قبل 3.14.0 (470MB) |
| `E:\AiRemote-Archive\tools-lab` | 1MB | 234 ملف تدقيق قديم من `tools/lab/a2a` (`*.out.txt` · `*.png`) |
| `E:\AiRemote-Archive\design` | 3MB | لقطات ومراجع التصميم (`design/*.png` · `*.html` · أدوات القياس) |
| `E:\AiRemote-Archive\root` | — | `signed.apk` · `signed.apk.idsig` · `.openclaw-typecheck.log` · أربع وثائق تسليم قديمة (r2 · r3 · r6 · r7) |
| `E:\AiRemote-Archive\cache` | 12MB | سكربتات Python قديمة وجداول منتهية داخل `.cache` |

## ماذا بقي — ولماذا

| البند | السبب |
|---|---|
| `releases/*3.16.0*` + `win-unpacked` | الإصدار الحالي، و`check-artifacts` يقرأ `app.asar` من `win-unpacked` |
| `releases/tools/patch-probe.exe` | داخل البيان (بصمة) |
| `releases/manifest.json` + `.sig` + المفاتيح | التوقيع والتحقق |
| `.cache/{electron44,gradle-home,better-sqlite3}` | بناء offline يعتمد عليها |
| `secrets/` | مفتاح توقيع APK |
| `docs/` · `data/` · `docker/` · `.github/` · `.agents/` | توثيق وقرارات وإعدادات — صغيرة ولازمة للتطوير |
| `outputs/verify-2026-11-08/` | دليل الجلسة الحالية (مذكور في التقارير) |

## البيان أُعيد توليده
بعد النقل كان البيان يشير إلى 84 قطعة، منها ما نُقل. أُعيد توليده وتوقيعه: **10 قطع** — `signature OK` · `all artifacts match`.

## التحقق بعد النقل
`verify.js` **56/56** · `check-shipped-bytes` **13/13** · `check-artifacts` **ok** · `check-version-consistency` PASS · `/health` = 3.16.0.

## الاسترجاع
```powershell
# قطعة واحدة
Move-Item 'E:\AiRemote-Archive\releases\server-windows\AiRemote-Server-Setup-v3.15.0-x64.exe' 'D:\autoclaw projects-new\AiRemote\releases\server-windows\'
# أو دليل كامل
Move-Item 'E:\AiRemote-Archive\outputs\verify-2026-11-07' 'D:\autoclaw projects-new\AiRemote\outputs\'
```
> بعد استرجاع أي حزمة إصدار قديم، أعِد توليد البيان: `node scripts/release-manifest.js` ثم `--verify`.

## أثر معروف
التقارير القديمة (`docs/SESSION-*` و`PROMPT-*`) تشير إلى `outputs/verify-2026-11-07/…` وغيرها. تلك المسارات نُقلت إلى `E:\AiRemote-Archive\outputs\` بنفس البنية — الروابط في المستودع لم تعد تشير إلى ملفات موجودة، لكن الملفات محفوظة.
