# D2-P2-1 — حارس SSRF في السيرفر الحيّ (AI baseUrl + webhook التنبيهات)

**التاريخ:** 2026-11-18 · **المصدر:** نقل من المرجع المجمد `packages/server/src/lib/security.ts` (v3.7.0) الذي كان يحرس `packages/server` **غير المشحون** فقط — الكود الحيّ `packages/server-desktop/server.js` كان بلا أي حارس (فجوة قيست في جولة التشخيص D2).

## ما رُكّب (`packages/server-desktop/server.js`)
1. **قسم الحارس** (بعد `setAiConfigs`): `assertSafeOutboundUrl` + `isPrivateAddress` + CIDR خاصة IPv4 + قوائم الحجب (loopback/link-local 169.254/10.x/172.16/192.168/100.64/… + metadata.google.internal + `.internal/.local/.localhost` + IPv6 `::1/fe80:/fc/fd`).
2. **نقطة الخنق `callAI`** — تغطي الـ7 مواقع استدعاء (chat · stream · auto-heal · تحليل): `baseUrl` يُفحص قبل أي fetch؛ `allowPrivate` **لollama فقط** (تصميم self-hosted).
3. **`/api/ai/validate`** — فحص `baseUrl` مبكرًا → 400.
4. **webhook التنبيهات** — فحص بروتوكول عند الإنشاء (`POST /api/alerts`) + `safeWebhookFetch` في **كل** مواقع الإطلاق (4 مواضع) تتخطى الصفوف القديمة غير الصالحة بصمت. المحلي مسموح للwebhook عمدًا (n8n داخلي مشروع لمنصة self-hosted) — القرار موثق في التعليق.

## الاختبار المعزول (منفذ 3210 · قاعدة مؤقتة · منفصل تمامًا عن إنتاج 3001)
```
PASS T0 setup/init admin + token
PASS T1 validate openai baseUrl=169.254.169.254 → 400 «عنوان داخلي/محلي غير مسموح»
PASS T2 validate openai baseUrl=127.0.0.1:9   → 400 «عنوان داخلي/محلي غير مسموح»
PASS T3 validate http://user:pass@api.openai.com → 400 «لا يُسمح ببيانات دخول داخل URL»
PASS T4 validate file://C:/Windows/win.ini   → 400 «يُسمح ببروتوكول http أو https فقط»
PASS T5 validate https://api.openai.com (مفتاح مزيف) → الحارس يمرر (خطأ المنبع 403/401 ليس حجبًا) — لا إنذار كاذب
PASS T6 validate ollama http://127.0.0.1:11434 → الحارس يمرر (فشل اتصال متوقع بلا خدمة) — الاستثناء يعمل
PASS T7 chat بعد تخزين baseUrl=http://[::1]:8080/v1 → محجوب عند callAI: «AI baseUrl مرفوض: عنوان داخلي/محلي غير مسموح»
PASS T8 alerts webhookUrl=ftp://127.0.0.1/hook → 400 «يُسمح ببروتوكول http أو https فقط»
PASS T9 alerts webhookUrl=http://192.168.1.5:5678/hook → 201 (محلي webhook مشروع)
=== 10/10 passed ===
```
سكربت الاختبار: جلسة تشخيص D2 (خارج المستودع، مجلد TEMP).

## عدم الانحدار
- `node --check server.js` → OK
- بطارية `node scripts/run-tests.cjs` → **7/7 مجموعات PASS**

## ملاحظة سلوك
T7 يعيد 500 (لا 400) لأن مسار chat يلفّ أخطاء callAI في catch عامة — الحجب مضمون والرسالة واضحة؛ تحويله إلى 400 تحسين P3 لاحق.

## ملاحظة إصدار
`server.bundle.js` **gitignored** — يُعاد بناؤه وقت بناء المثبّت (`node scripts/bundle.js`)، فالإصلاح يصل الإنتاج مع المُثبّت القادم (التثبيت بكلمة «ثبّت» حصراً).
