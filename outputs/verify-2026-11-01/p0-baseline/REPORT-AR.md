# P0 — خط الأساس وتجهيز العمل (2026-11-01)

**الغرض:** إثبات أن نقطة البداية سليمة، وقياس قدرات المساعدين، وبناء مرآة المصدر التي سيعمل عليها المساعدون.
**النتيجة:** **P0 مكتمل** — كل البوابات خضراء، ومسبار القدرات أثبت غياب التنفيذ، والمرآة مبنية ومتحقَّق منها.
**انحراف واحد عُولج:** بيان الإصدار كان **متأخراً عن الحِزم** (4 بصمات غير مطابقة) فأُعيد توليده وتوقيعه.

---

## 1) البوابات (خط الأساس)

| البوابة | الأمر | النتيجة | الملف |
|---|---|---|---|
| البطارية | `node scripts\verify.js` | **40/40** | `verify.log` |
| ألوان صريحة | `node scripts\scan-ui-colors.cjs` | **0** (12 ملفاً تستخدم الـkit) | `colors.txt` |
| تباين AA | `node scripts\check-contrast.cjs` | **22/22** | `contrast.txt` |
| TypeScript | `tsc --noEmit -p packages\dashboard` | **0 أخطاء** (`tsc_exit=0`) | `tsc.txt` |
| بيان الإصدار | `node scripts\release-manifest.js --verify` | **signature OK · all artifacts match** (بعد الإصلاح §3) | `manifest-verify-after.txt` |

## 2) الحالة الحيّة (تحقّق §2)

| القياس | القيمة |
|---|---|
| `/health` · `/ready` | `3.9.1` · `ready:true` · `db:ok` · `schema:ok` · `tls:true` |
| الأجهزة | **4/4 online** — WIN10-VM · WIN11-VM · TECNO-KL4 · Android-Emulator |
| `VMware NAT Service` | Running |
| Git | الفرع `checkpoint/3.8.1-2026-10-26` · شجرة نظيفة · **لا remote** |

> **انحراف موثّق عن حزمة التسليم:** الحزمة تقول إن آخر التزام `feedfe7`، والواقع أن HEAD كان `bc6dc7f` — أربعة التزامات بعده، كلها **وثائق وأداة مرآة** (`docs/PROMPT-CONTINUE-FULL-2026-11-01-AR.md`, `tools/lab/a2a/mirror-sync.cjs`)، بلا أي تغيير كود منتج.

## 3) بيان الإصدار — انحراف عُولج (مهم)

**قبل:** `signature OK` لكن **4 بصمات غير مطابقة**:

```
MISMATCH agent-windows/AiRemote-Agent-Setup-v3.9.1-x64.exe
MISMATCH agent-windows/AiRemote-Agent-v3.9.1-Windows-x64.zip
MISMATCH server-windows/AiRemote-Server-Setup-v3.9.1-x64.exe
MISMATCH server-windows/AiRemote-Server-v3.9.1-Windows-x64.zip
```

**السبب (بالتوقيت):** البيان أُنتج **12:52** محلياً، ثم أُعيد بناء حِزم الوكيل **13:04–13:05** وحِزم السيرفر **14:40–14:42** — أي أن الحِزم تغيّرت بعد التوقيع ولم يُعَد توليد البيان. المقاسات تؤكد ذلك (مثال: الوكيل Setup في البيان 76,370,601 بايت وعلى القرص 76,370,781).

**المعالجة:** `node scripts\release-manifest.js` (التدفّق الموثّق بعد إعادة البناء) ثم `--verify`:

```
signature OK
all artifacts match
```

**ما تغيّر:** `releases/manifest.json` + `releases/manifest.sig` (كلاهما متتبَّع في git؛ المفتاح الخاص `release-key.pem` مستثنى). البصمات القديمة أُبطلت نهائياً — مسجّلة في `manifest-verify-before.txt`.

> الخلاصة: العيب لم يكن في الحِزم بل في **بيان متأخر**؛ لا تغيير كود ولا إعادة بناء.

## 4) مسبار قدرات المساعدين (§3.1)

أُطلق مساعد مؤقت مرتين (الأولى بلا استلام نتيجة، والثانية بمهمة أضيق وفق §3.5):

| السؤال | الجواب المقيس |
|---|---|
| هل يملك تنفيذ أوامر؟ | **NO_EXEC** |
| أدواته | `apply_patch · deliver_file · edit · fetch_content · find · grep · ls · manage_autoclaw_migration · monitor · read · tool_invoke · tool_result_recall · tool_search · web_search · write` (15) |
| قراءة `D:\autoclaw projects-new\AiRemote\package.json` | **فشلت** — خارج مساحة العمل، وأدوات الملفات مقيّدة بها |

**القرار:** العمل يجري على **الفرع ب** — مرآة المصدر + رقع موحّدة، وأنا المنفّذ الوحيد لكل أمر داخل المستودع. السجل الكامل في `probe.txt`.

## 5) المرآة

| القياس | القيمة |
|---|---|
| الأمر | `node tools\lab\a2a\mirror-sync.cjs` **من مجلد المشروع** |
| الناتج | `mirror\src` · **397 ملفاً · 9.8 MB** · `INDEX.txt` · `META.json` |
| `--check` | **OK** للملفات الحرجة الخمسة (agent-desktop/main.js · lib/coords.js · server.js · ScreenViewer.tsx · AgentService.java) |
| زمن المزامنة | `2026-11-01T13:36:48.601Z` |

> **فخّ عملي:** تشغيل `mirror-sync.cjs` من داخل المستودع يفشل بـ`ABORT: مجلد الإخراج داخل المستودع` — يجب تشغيله من مجلد المشروع الافتراضي. مسجّل في `mirror-check.txt`.

## 6) ملفات الدليل

| الملف | المحتوى |
|---|---|
| `verify.log` · `colors.txt` · `contrast.txt` · `tsc.txt` | مخرجات البوابات الخام |
| `manifest-verify-before.txt` | البيان قبل الإصلاح (4 MISMATCH) |
| `manifest-verify-after.txt` | بعد إعادة التوليد (all artifacts match) |
| `probe.txt` | سجل مسبار قدرات المساعدين |
| `mirror-check.txt` | تحقّق المرآة (397 ملفاً + 5 OK) |

## 7) الخطوة التالية

**P1 — إصلاح العيوب المعروفة:** (1) حد كلمة المرور 8 مقابل 12 بين `SetupPage.tsx` و`server.js` · (2) حدث تدقيق مخصّص لتغيير الدور · (3) تسجيل حذف صفوف التدقيق · (4) أي عيب يثبته مدقّقو البث/البروتوكول/أندرويد.
**معيار القبول:** اختبار يفشل قبل الإصلاح وينجح بعده + دليل.
