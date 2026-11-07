# w23 — سطح أندرويد المرجعي (§4.3) — 2026-11-07

`node scripts/android-audit.cjs <out.json> --serial emulator-5554 --baseline`

| البند | القيمة |
|---|---|
| `clickable` | **19** |
| `tapped` | **18** |
| `skipped` | **1** (`btn_stop` · destructive) |
| `leftApp` | **0** |
| `crashes` | **0** |
| الخروج | `0` |

- خطوات تثبيت السطح: `lang-ar ok @1480,27` · `tab-status ok @206,82` · السطح `19/19` (المتوقَّع 19).
- الجهاز: `emulator-5554` · `com.airemote.agent` · 3.14.2 · vc62.

## الملفات
| الملف | ما هو |
|---|---|
| `android-baseline.json` | التشغيل المرجعي: 19 صفًّا + كتلة `baseline` |
| `android-smoke-5555.json` | نفس السطح على `127.0.0.1:5555` بلا `--baseline` (تسجيل بلا فرض) — 19/18/1/0/0 |
| `android-after.png` | لقطة السطح بعد التدقيق |

## البوابة (إثبات أنها تعضّ)
نسخة من السكربت بتوقّع 20 ⇒ `exit 3` + `failed=baseline-surface-mismatch` + 19 صفًّا في ملف الرفض. السكربت لم يُعدَّل في المستودع لهذا الاختبار.

## ملاحظة تنفيذ
`KEYCODE_BACK` يُنهي `MainActivity` (نشاط واحد)، لذلك يُعاد `am start` بعد BACK قبل عدّ السطح — معيار القبول كما هو: 19 قبل النقر وإلا `exit 3`.
