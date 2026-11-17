# دليل W2-6 — .env.example مركزي — 2026-11-17

**البند:** W2-6 — من الخطة §3/W2-6.

| # | الفحص | المتوقع | الفعلي | الحالة |
|---|---|---|---|---|
| 1 | `Test-Path .env.example` في الجذر | True | True | PASS |
| 2 | يغطي متغيرات الكود الحيّ الأساسية (PORT, JWT_SECRET, CREDENTIALS_KEY, TRUST_PROXY, TLS_CERT_PATH, AGENT_ALLOW_INSECURE_WS, AIREMOTE_BACKUP_*) | كلها بأسماء وشرح وبلا قيم حقيقية | نعم + AIREMOTE_TMP (W2-5) | PASS |
| 3 | لا سرّ في الملف | صفر | صفر — حقول فارغة | PASS |
| 4 | `.env` نفسه يبقى غير متتبع | نعم | `.gitignore` يغطيه (فحص E1 سابق: Test-Path .env = False) | PASS |

**ملاحظة:** مطابقة `git grep "process.env."` الشاملة تُكمل مع W2-5 (مسارات الكود الحيّ) — المتغيرات الأساسية الموثقة في الفحص (E4/F4/G2) كلها موجودة.

**النتيجة: PASS**
