# إقلاع الوكيل بصلاحية مرتفعة (اختياري) — Windows

**الغرض:** حلّ عيب UIPI نهائياً: عندما يعمل الوكيل بصلاحية متوسطة، تُسقط Windows كل إدخال موجّه إلى
نافذة مرتفعة (Task Manager، نوافذ UAC) **بصمت**. الرفع اليدوي عبر UAC يعمل لكنه لا يدوم بعد إعادة
تسجيل الدخول.

**الأداة:** `scripts/install-agent-autostart-elevated.ps1`

## ما تفعله

1. تتحقق أن الجلسة مرتفعة (وإلا تتوقف برسالة واضحة).
2. تُسجّل مهمة عند تسجيل الدخول بمستوى **HighestAvailable** للحساب الحالي:
   `AiRemote Agent (Elevated)` ← `%LOCALAPPDATA%\Programs\AiRemote Agent\AiRemote Agent.exe`
3. تُوقف أي نسخة عاملة (لمنع نسختين متزامنتين) ثم تُشغّل المهمة فوراً.
4. تتحقق من أن الوكيل يعمل وأن صلاحيته `ELEVATED`.
5. **فقط إن نجح ذلك** تحذف مدخل `HKCU\...\Run\io.airemote.agent` حتى لا يُقلع الوكيل مرتين.

## الاستخدام (مرة واحدة، من PowerShell مرتفع)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-agent-autostart-elevated.ps1
```

## التراجع

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-agent-autostart-elevated.ps1 -Uninstall
```

يبحث عن المهمة ويحذفها، ويعيد مدخل `Run` بالصلاحية المتوسطة (السلوك الافتراضي للمنتج).

## التحقق المتوقع

```
TASK_CREATED=True
TASK_RUN=True
AGENT_COUNT=5
AGENT pid=… ELEVATED
RUNKEY_REMOVED=True
RESULT=ok
```

وبعده: نقرة داخل Task Manager من العارض يجب أن تنجح (كانت تُسقط بصمت قبل الرفع).

## القيود

- **يتطلب موافقة UAC واحدة** عند التشغيل (لا يمكن أتمتتها من جلسة متوسطة — مُقاس: `schtasks /RL HIGHEST` يرجع `Access is denied`).
- Windows فقط · حساب إداري · لا يغيّر سلوك المنتج الافتراضي (اختياري بالكامل).
- **حالة التحقق (2026-11-04):** لم يُنفَّذ بعد — محاولة التشغيل عبر UAC داخل WIN10 أُلغيت
  (`RUNAS_ERR=The operation was canceled by the user`)، فالوكيل ما زال متوسط الصلاحية.
  يلزم نقرة «نعم» واحدة عند وجودك أمام شاشة الضيف لإكمال الإثبات.
