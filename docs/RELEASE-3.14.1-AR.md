# 3.14.1 — PowerShell، مفتاح الإقلاع، والحزم الخمس

> يبني على `59f3d45` + `1bac0af` (إصلاح واجهة الوكيل الميتة) ويضيف ميزتين ويشحن الإصدار.

---

## 1) لماذا يعمل PowerShell مع وكيل ويندوز؟

**الجواب المقيس:** الوكيل **لا يشغّل PowerShell وهو خامل** — صفر عمليات. الفحص داخل WIN10 أثناء العمل الطبيعي أعطى:

```
PS_COUNT=1        ← العملية الوحيدة كانت سكربت الفحص نفسه (parent=vmtoolsd.exe)
AGENT_COUNT=5
```

يُستخدم PowerShell في ثلاث حالات فقط، كلها عند الطلب:

| الحالة | كيف | نافذة ظاهرة؟ |
|---|---|---|
| حقن الماوس/الكيبورد (بديل بطيء لمسار GDI السريع) | عملية دائمة `powershell.exe -Command -` مع `windowsHide: true` | لا |
| قراءة القرص/السطوع/WMI (إحصاءات + سطوع الشاشة) | `execFile` قصير العمر مع `windowsHide: true` | لا |
| **الطرفية (PTY)** التي يفتحها المستخدم من اللوحة | `powershell.exe -File <wrapper>` | **كانت نعم — أُصلحت** |

**العيب المكتشف:** `windowsHide: false` في مسار PTY، أي أن فتح طرفية عن بُعد كان يُظهر نافذة كونسول على شاشة الشخص المطلوب مساعدته. صار `true` في 3.14.1.
النوافذ التي ظهرت في لقطات الـVM سابقًا كانت من سكربتات المختبر (`runProgramInGuest -interactive powershell.exe`)، لا من الوكيل.

## 2) ميزة «التشغيل عند إقلاع ويندوز»

مفتاح مستقل عن `autoStart` (الذي يعني «اتصل عند فتح البرنامج» فقط).

| الطبقة | التفاصيل |
|---|---|
| التخزين | `runAtStartup` في `airemote-config.json`؛ `null` = اتبع `autoStart` (سلوك 3.9.7 محفوظ للترقية) |
| التسجيل | `app.setLoginItemSettings({ openAtLogin, path: process.execPath, args: ['--autostart'] })` ⇒ قيمة `io.airemote.agent` في `HKCU\…\Run` |
| القيمة الفعلية | تُقرأ من النظام (`getLoginItemSettings`) لا من الإعداد، فلا تنجرف |
| عند الإقلاع | `--autostart` يُبقي النافذة في صينية النظام (`win.show()` لا يُنفَّذ) |
| واجهة الوكيل | صفّ اختياري «بدء الوكيل مع إقلاع ويندوز» تحدّثه رسالة `startup-state` حتى لو غيّره السيرفر |
| السيرفر | `POST /api/devices/:id/startup {enabled}` ⇒ `server:set_startup` ⇒ `agent:startup_state`، والحالة تظهر في `GET /api/devices` وفي زرّ الصف باللوحة |
| التقرير | الوكيل يرسل `runAtStartup` مع `agent:register`، فتعرف اللوحة الحالة قبل أي تغيير |

**مقيس على الحزمة المبنية (ليست المصدر):**

```
before : { supported:true, packaged:true, openAtLogin:false, effective:false }
setStartup(true)  ->  { openAtLogin:true, effective:true }   # checkbox = true
setStartup(false) ->  { openAtLogin:false }                  # القيمة حُذفت من السجل
قيمة السجل: "…\AiRemote Agent.exe --autostart"
```

## 3) الحزم الخمس — 3.14.1

| الحزمة | الحجم |
|---|---|
| `releases/server-windows/AiRemote-Server-Setup-v3.14.1-x64.exe` | 152 MB |
| `releases/server-windows/AiRemote-Server-v3.14.1-Windows-x64.zip` | 202 MB |
| `releases/agent-windows/AiRemote-Agent-Setup-v3.14.1-x64.exe` | 73 MB |
| `releases/agent-windows/AiRemote-Agent-v3.14.1-Windows-x64.zip` | 99 MB |
| `releases/AiRemote-Agent-3.14.1.apk` | 234 KB (`versionCode 61`, `versionName 3.14.1`, موقّع `CN=AiRemote Agent`) |

- `manifest.json`: **58 قطعة** · `signature OK` · `all artifacts match`.
- **السيرفر المثبّت** الآن 3.14.1: `/health` ⇒ `{"version":"3.14.1","tls":true,"port":3001}`.
- **WIN10 و WIN11** على 3.14.1 (تبديل `app.asar` مع نسخة احتياطية) وكلاهما «متصل».

## 4) التحقق

| الفحص | النتيجة |
|---|---|
| البطارية بعد الميزة (على 3.14.0) | 50/50 |
| البطارية بعد الإصدار (على 3.14.1) | **50/50** — بما فيها اتساق الإصدار مقابل `/health` |
| محتوى الحزم (لا الأسماء فقط) | `agent asar 3.14.1` + `chk-runstartup` داخله · `server asar 3.14.1` · `static` يحمل `dev_startup` |
| `POST /api/devices/:id/startup` بلا مصادقة | **401** (المسار مسجّل) |
| مفاتيح i18n | وكيل `123/123` · لوحة `600/600` · أندرويد `138/138` (صفر أحادي) |

## 5) ملاحظات تشغيلية

1. `runAtStartup` يبدأ `null` ⇒ يتبع `autoStart`؛ أول ضغطة (أو أمر من السيرفر) تثبّته صريحًا.
2. المفتاح يُكتب في `HKCU` (تثبيت لكل مستخدم) — لا يحتاج صلاحية مدير.
3. `--autostart` يخفي النافذة فقط؛ الوكيل يبدأ الاتصال كالمعتاد إن كان `autoStart` مفعّلًا أو بعده بـ4/12 ثانية.
4. عيبان سابقان لا علاقة لهما: واجهة الوكيل الميتة (أُصلحت في `59f3d45`)، ونافذة PTY الظاهرة (أُصلحت هنا).
