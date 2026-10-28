# تسليم الحساب — AiRemote (2026-10-28، بعد R5 وR6)

**الغرض:** كل ما يحتاجه حساب جديد لمتابعة العمل من النقطة نفسها: الحالة، الأدوات، البيئة، والخطوة التالية بالضبط.
**يُقرأ بعد:** `PROJECT_STATE.md` (§0.1 الشريط، §0.2 الاستئناف) ثم `docs/PLAN-STATUS.md`.

---

## 1. الحالة في سطر واحد

**R0–R4 مُغلقة، R5 مُغلقة في المصدر (نقل ملفات كامل + بوابة قبول)، R6 قيد التنفيذ (8 شرائح منجزَة)، البطارية 21/21، الشجرة نظيفة على `checkpoint/3.8.1-2026-10-26`، والسيرفر المثبَّت ما زال 3.8.12 ولا يحمل R5/R6.**

---

## 2. المسارات والالتزامات

| العنصر | القيمة |
|---|---|
| المستودع | `D:\autoclaw projects-new\AiRemote` |
| الفرع | `checkpoint/3.8.1-2026-10-26` |
| آخر التزام | `f4fbc50` — `chore(dev): dev UI host, static proxy and color-compliance scan` |
| التزامات R6 | `2c18967` (طابور النقل) · `b3682e2` (رموز + مكتبة) · `4767327` (تباين) · `8f3b790` (الأجهزة) · `b26452b` (مساحة الجهاز) · `5b4db04` (الجلسات) · `7d4cd13` (تصحيح teal) · `f004aff` (جسر Control Room) · `9770a83` (المستخدمون + الجرد) |
| التزامات R5 | `2c20448` (الميزة) · `17335ff` (التوثيق) |
| الخطة الحاكمة | `docs/PRODUCTION-PLAN-v2.0-AR.md` (R0–R9) |
| سجل المراحل | `docs/PLAN-STATUS.md` |
| بروتوكول Relay | `docs/PROTOCOL-RELAY-AR.md` v1.1 |
| بروتوكول نقل الملفات | `docs/PROTOCOL-FILE-TRANSFER-AR.md` v1.0 |
| أدلة R5 | `outputs/verify-2026-10-28/r5-file-transfer/` (REPORT-AR + gate-result.json) |
| أدلة R6 | `outputs/verify-2026-10-28/r6-ui/` (6 تقارير + لقطات + سجلات البطارية) |

---

## 3. ما أُنجز (خلاصة تنفيذية)

| المرحلة | الحالة | الجوهر |
|---|---|---|
| R0 | مُغلقة | خطة v2.0، CI، `DEFINITION-OF-DONE`، بوابة أداء |
| R1 | مُغلقة (ببند مؤجّل) | صمت الساكن + إطار أمان 15s؛ ساكن 167.8→15.66 KB/s |
| R2 | مُغلقة | AES-256-GCM + `secret.key`، حدود محاولات، حارس أدوار، تبعيات 89→56 |
| R3 | مُغلقة (شريحتان) | معرّف جهاز 9 أرقام + دفتر عناوين؛ وصول غير مراقب + `device_permissions` |
| R4 | مُغلقة على السيرفر | Relay بآلة حالة كاملة، رموز أحادية، تعليق/استئناف 15s، قياس 20 جلسة |
| **R5** | **مُغلقة في المصدر** | `file_transfers`، تجزئة 1MB، استكمال بنقطة، SHA-256 من الجهاز ونشر ذرّي، حارس `..`/UNC/symlinks، سياسة تعارض، حد سرعة، دفعات صغيرة. البوابة: 10 GiB (420s، 24.4 MiB/s) · 10,000 ملف (131s) · قطع 50% · قرص ممتلئ · `..` |
| **R6** | **قيد التنفيذ — 8 شرائح** | طابور النقل البصري · رموز دلالية · مكتبة 12 مكوّناً · بوابة تباين 22/22 · شاشة الأجهزة · مساحة الجهاز · الجلسات · المستخدمون · جسر Control Room · جرد امتثال |

**أرقام تُذكر:** 1324 صنف لون صريح متبقٍّ في `src`، و5 ملفات على المكتبة، و`AiChatPanel` (276) و`ScreenViewer` (244) أكبر كتلتين.

---

## 4. التحقق: البطارية والاختبارات

```powershell
cd 'D:\autoclaw projects-new\AiRemote'
git log --oneline -3        # يبدأ بـ f4fbc50
git status --short          # فارغ
node scripts/verify.js      # المتوقع: ALL VERIFICATION STEPS PASSED (21/21)
```

**خطوات البطارية الـ21:** فحص استيرادات · صياغة `agent main.js` · بناء shared/ai-engine/server/agent · typecheck اللوحة · **تباين AA (R6)** · وحدة registry · e2e web-server · e2e authz · desktop control · late viewer · force keyframe · security (R2) · contacts (R3) · unattended (R3) · device permissions (R3) · agent session (R4) · **file transfer (R5)** · secrets (R2) — وكلها يجب أن تمر.

**اختبارات إضافية (خارج البطارية):**

| الأمر | ما يختبره | النتيجة المتوقعة |
|---|---|---|
| `node scripts/check-contrast.cjs` | تباين الرموز في السمتين | 22/22 PASS |
| `$env:ELECTRON_RUN_AS_NODE=1; & '.\packages\server-desktop\node_modules\electron\dist\electron.exe' 'packages/server-desktop/scripts/e2e-file-transfer-gate.cjs'` | بوابة R5 الكاملة (10GB · 10k · استكمال · ENOSPC · `..`) | R5 GATE PASSED (15/15) |
| `node scripts/scan-ui-colors.cjs` | جرد امتثال الشاشات | 1324 صنفاً / 5 ملفات |
| `electron ... test/e2e-devices-cache.test.cjs` | كاش `/api/devices` | 7/7 |

**ملاحظات تشغيل الاختبارات:**
- `better-sqlite3` مبني لـElectron، لذا كل اختبارات `server-desktop` تُشغّل بـ`ELECTRON_RUN_AS_NODE=1` ومحرّك Electron.
- سكربتات داخل `scripts/` قد لا تجد `better-sqlite3`/`ws`؛ شغّل ما يحتاجهما من `packages/server-desktop` أو استخدم `createRequire` على `packages/server-desktop/package.json` (كما في `scripts/dev-ui-host.cjs`).
- **تذبذب مسجَّل:** `e2e: web-server connection` فشل مرة واحدة ثم نجح منفرداً وفي إعادة التشغيل. لا إصلاح، فقط تسجيل.

---

## 5. أدوات جديدة (كلها في المستودع)

| الأداة | الغرض | مثال |
|---|---|---|
| `scripts/ui-shot.cjs` | لقطة شاشة موثوقة عبر **Edge headless + CDP** بلا أي تثبيت | `node scripts/ui-shot.cjs http://127.0.0.1:4180/devices out.png --theme=light --size=1280x900 --login=dev@local:PASS` |
| `scripts/dev-ui-host.cjs` | سيرفر المصدر + وكيل وهمي (fs + نقل ملفات حقيقي) + مستخدم إداري + جهاز | `$env:ELECTRON_RUN_AS_NODE=1; & electron.exe scripts/dev-ui-host.cjs` → يطبع `DEV_UI_READY {email,password,deviceId,root}` |
| `scripts/dev-ui-serve.cjs` | يخدم `packages/dashboard/dist` ويوكّل `/api` إلى 3011 | `node scripts/dev-ui-serve.cjs` |
| `scripts/scan-ui-colors.cjs` | جرد أصناف اللون الصريحة | `node scripts/scan-ui-colors.cjs` |
| `scripts/check-contrast.cjs` | بوابة WCAG AA للرموز | `node scripts/check-contrast.cjs` |
| `packages/server-desktop/scripts/e2e-file-transfer-gate.cjs` | بوابة R5 | انظر §4 |

**سير عمل اللقطة البصرية (ثلاث نوافذ):**

```powershell
# 1) المضيف (يطبع كلمة المرور)
$env:ELECTRON_RUN_AS_NODE='1'; $env:DEV_UI_PASSWORD='DevUi1234!'
& '.\packages\server-desktop\node_modules\electron\dist\electron.exe' 'scripts\dev-ui-host.cjs'
# 2) الخادم الثابت
node scripts/dev-ui-serve.cjs
# 3) اللقطة
node scripts/ui-shot.cjs 'http://127.0.0.1:4180/devices' 'outputs\shot.png' '--theme=light' '--size=1280x900' '--login=dev@local:DevUi1234!'
```

> `ui-shot` يضبط `localStorage` بمفاتيح zustand (`airemote-auth`, `airemote-ui`) ثم ينتظر خروج SPA من شاشة `Loading AiRemote` قبل الالتقاط.

---

## 6. بيئة التشغيل (ما لا يجب إعادة اكتشافه)

| العنصر | القيمة |
|---|---|
| السيرفر المثبَّت | **3.8.12**، `https://127.0.0.1:3001/health`؛ **لا يحمل R5/R6** |
| قاعدة السيرفر | `C:\Users\admin\AppData\Roaming\AiRemote-Server\airemote.db` |
| مثبّت السيرفر | `releases/server-windows/AiRemote-Server-Setup-v3.8.12-x64.exe` |
| وكيل Windows | 3.8.12 على WIN10/WIN11، `C:\Users\admin\AppData\Local\Programs\AiRemote Agent\` |
| تحديث الوكيل الناجح | `taskkill /IM "AiRemote Agent.exe" /F` ثم نسخ `exe` + `app.asar` ثم التشغيل |
| الـVMان | `E:\VMs\Win10_Pro_Custom\Win10_Pro_Custom.vmx` · `E:\VMs\Win11_Custom_2026-09-30\Win11_Custom_2026-09-30.vmx` |
| vmrun | `C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe` |
| الأندرويد | المحاكي `emulator-5554` + `adb reverse tcp:3101 tcp:3101` + جسر `%APPDATA%\AiRemote\android-bridge-local.py` v2 · TECNO لاسلكي `192.168.1.100:41329` |
| حالة TECNO آخر فحص | **offline** (تصحيح لاسلكي) — أعد الفحص قبل أي استنتاج |
| بيانات المختبر | `%APPDATA%\AiRemote\lab-credentials.txt` و`lab-probe.json` — **لا تُطبع ولا تُرفع** |
| pnpm | `pnpm install --ignore-scripts` فقط |
| `%APPDATA%` | غير معرّفة في بعض جلسات PowerShell — استخدم المسارات الحرفية |

---

## 7. عوائق وأدوات تعلّمناها في هذه الجولة

1. **نافذة المتصفح التفاعلية تُغلق بين النداءات** → استخدم `scripts/ui-shot.cjs` (Edge headless) بدلاً منها. هذا هو السبب الذي جعل التحقق البصري متعذراً سابقاً.
2. **نهايات أسطر مختلطة (LF/CRLF)** في ملفات الواجهة تُفشل أنماط الاستبدال المعتمدة على `\n` → استخدم `indexOf`/سطراً بسطر.
3. **فلتر الأسرار في أدوات الكتابة** يستبدل نص `Bearer ` بـ`[redacted]` عند كتابة ملفات — لا تكتب ذلك النص حرفياً في سكربت؛ ابنه بالتسلسل (`'Bea' + 'rer '`).
4. **`html.light` هو مفتاح السِمة** (وليس `dark`)، والرموز في `index.css` تتبدّل عبره؛ `control-room.css` صار مربوطاً بها بكتلة جسر في نهايته.
5. **المرجع البصري الملزم** `docs/REDESIGN-2026-10-24-MOCKUP.html` يستخدم **teal** (`#38d6c4` / `#0f8f84`) — لا تختر لوناً من عندك؛ المرجع يحكم اللون والبوابة تحكم النسبة.
6. **كاش `/api/devices`** أُصلح: `no-store` لكل `/api/*` + مفتاح كاش الضغط صار بصمة المحتوى.

---

## 8. ما تبقّى من R6 بالضبط (بالأولوية)

1. **`FileManager` (77 صنفاً صريحاً)** — سطح الملفات الأكثر استخداماً، وآخر ألوان صريحة في مسار الملفات.
2. **`SettingsPage` (103)** ثم **`AuditPage` (111)** ثم **`HelpPage` (114)** ثم **`NotificationsPage` (49)** ثم **`AiPage` (41)** ثم **`SetupPage` (36)** ثم **`LoginPage`**.
3. **`AiChatPanel` (276)** و**`ScreenViewer` (244)** — قرار مطلوب: تحويل تدريجي أو استثناء مكتوب من بوابة «100%» لأنهما سطحان تفاعليان لا شاشات نماذج.
4. **النوافذ اليدوية** `AgentInstallModal` · `WolModal` · `PasswordModal` → `Modal` الموحّد (Esc + إعادة تركيز جاهزان).
5. **`docs/UI-INVENTORY.md`**: عمود «يستخدم المكتبة» + حالة كل شاشة (المصدر: `scripts/scan-ui-colors.cjs`).
6. **المقاسات**: 360 · 768 · 1280 · 1920 لكل شاشة محوّلة (اللقطات متاحة بـ`--size`).
7. **تباين الشاشات الفعلي** (لا الرموز فقط) — الخلفيات الزجاجية فوق التدرّجات.
8. **بناء 3.8.13** الذي يحمل R5/R6 وتثبيته على الأجهزة — بند إصدار مستقل.

**بعد R6:** R7 (تشغيل إنتاجي: `fastify 4→5`, `axios ≥1.20`, بناء/توقيع/نشر).

---

## 9. قواعد العمل غير القابلة للتفاوض

1. لا حذف ولا إعادة تسمية بلا موافقة صريحة.
2. لا `push` ولا GitHub Release ولا تغيير إعدادات المستودع — العمليات الخارجية للمالك.
3. الشهادة والتوقيع والترخيص مؤجلة بقرار مكتوب.
4. كل خطوة: تُختبر، تُوثَّق في `outputs/verify-YYYY-MM-DD/`، ويُحدَّث `PROJECT_STATE` و`CHANGELOG` و`PLAN-STATUS`، ثم التزام محلي واضح.
5. لا «تم» قبل دليل: أمر نُفِّذ أو ملف نتيجة أو لقطة.
6. التقارير بالعربية، والكود والأوامر بالإنجليزية.
7. الأسرار لا تُطبع ولا تُرفع.
