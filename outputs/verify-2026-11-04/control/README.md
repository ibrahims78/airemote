# دليل التحقق — التحكم في شاشة البث (وكيل ويندوز)

**التاريخ:** 2026-11-04 · **الإصدار:** 3.12.2 (vc56) · **HEAD أثناء الفحص:** `631264a`
**الأجهزة:** WIN10-VM `b42175d0…` (1534×649) · WIN11-VM `d147684b…` (1534×649)
**النطاق:** تشخيص «عدم القدرة على التحكم» عبر الواجهة الحقيقية، طبقة بطبقة.

## الحكم

| الطبقة | النتيجة |
|---|---|
| العامل (GDI + SendInput) | سليم — دقة 1px على النظامين (`logs/vm-win10-worker-live-test.out.txt`) |
| الوكيل | سليم مع منح صالح؛ يُسقط بصمت عند غياب المنح (`main.js:661,670`) |
| السيرفر | يرفض بوضوح (view-only / دور < manager) (`server.js:2740-2761`) |
| الواجهة | ٣ عيوب: فقدان التحكم بعد reconnect · الزر الأيمن غير موصول بالفأرة · توست 6s ثم صمت |
| UIPI | وكيل غير مرتفع = إسقاط صامت للنوافذ المرتفعة؛ الرفع يحلّها (`shots/proof-ui-taskmgr-win10.png`) |

## اللقطات (`shots/`)

| الملف | يثبت |
|---|---|
| `proof-ui-typing-cmd-win10.png` | `UI-CONTROL-OK` نُفِّذ في cmd عبر الواجهة |
| `proof-ui-wheel-win10.png` | تدحرج إخراج `dir` بالعجلة عبر الواجهة |
| `proof-ui-control-win10.png` | نقرة عبر الواجهة أحضرت Notepad للمقدمة |
| `proof-ui-typing-win11.png` | `WIN11-CONTROL-OK` على WIN11 عبر الواجهة |
| `proof-ui-rightclick-win11.png` | قائمة سياق سطح المكتب من ضغط مطوّل (button 2) |
| `proof-ui-taskmgr-win10.png` | Task Manager المرتفعة تبدّل تبويبها إلى Details بعد رفع الوكيل |
| `elev-tm-before.png` | حالة TM قبل اختبار الرفع |

## السجلات (`logs/`)

- `vm-win10-input-state.out.txt` — الوكيل/العامل/السجلات/المؤشر/النافذة الأمامية (ولقطات `input-trace.log`).
- `vm-win10-worker-live-test.out.txt` — اختبار العامل مباشرة: 766,324 · 230,97 · 1404,594 · 0,0 · نقرة.
- `vm-win10-key-check.out.txt` — `key type=press … granted=true` + مساعد PowerShell حيّ.
- `vm-win10-clip-read.out.txt` — `CLIP=[ABC123]` (إثبات نص Notepad).
- `vm-win10-tm-open.out.txt` — Task Manager `ELEVATED`.
- `vm-win10-notepad-and-elev.out.txt` — كل عمليات الوكيل `NOT_ELEVATED` قبل الرفع.
- `vm-win10-query-tasks.out.txt` — UAC: `EnableLUA=1`, `ConsentPromptBehaviorAdmin=5`, لا مهام AiRemote، بدء من RunKey.
- `vm-win10-elevate-now.out.txt` — الرفع عبر `Start-Process -Verb RunAs` (`RUNAS_PID=8748`).
- `vm-win10-agent-list.out.txt` · `vm-win10-agent-tree.out.txt` — كشف النسختين المتزامنتين ثم تأكيد نسخة واحدة (`8748` أمّ + 5 أبناء).
- `vm-win10-kill-medium.out.txt` — إنهاء النسخ المتوسطة فقط وبقاء المرتفعة.
- `vm-win11-input-state.out.txt` · `vm-win11-cmd-open.out.txt` — حالة WIN11 وفتح cmd.
- `vm-win10-agent-procs.out.txt` · `vm-win10-cursor.out.txt` · `vm-win10-iwlog.out.txt` — أدلة مساندة.

## السكربتات (`scripts/`)

كل سكربتات الفحص بصيغتها المنفَّذة: `input-state.ps1` · `worker-live-test.ps1` · `key-check.ps1` ·
`clip-read.ps1` · `notepad-and-elev.ps1` · `notepad-read.ps1` · `tm-open.ps1` · `agent-list.ps1` ·
`agent-tree.ps1` · `kill-medium.ps1` · `elevate-now.ps1` · `elev-*.ps1` · `query-tasks.ps1` ·
`cmd-open.ps1` · `cmd2.ps1` · `bring-notepad-front.ps1` · `session-open.cjs`.

## إعادة الإنتاج (مختصر)

```powershell
# 1) حالة الوكيل والمدخلات
node tools\lab\a2a\vmguest.cjs ps win10 "<repo>\outputs\verify-2026-11-04\control\scripts\input-state.ps1"

# 2) اختبار العامل مباشرة (بلا وكيل)
node tools\lab\a2a\vmguest.cjs ps win10 "...\scripts\worker-live-test.ps1"

# 3) جلسة تحكم حقيقية
node "...\scripts\session-open.cjs" win10   # يعيد VIEWURL صالحاً 60s
```

## ملاحظات

- **لم يُعدَّل أي ملف مصدري**، ولم يتغيّر `VERSION` ولا `HEAD`؛ الحزمة مخرجات فحص فقط.
- الوكيل على WIN10 تُرك **مرتفع الصلاحية** (أُطلق بموافقة UAC)؛ عند إعادة تسجيل الدخول يعود متوسطاً من RunKey.
- درس تشغيلي مرشّح للقواعد #24: `Stop-Process` من جلسة متوسطة لا يُنهي وكيلاً مرتفعاً، ويُنتج نسختين متزامنتين.