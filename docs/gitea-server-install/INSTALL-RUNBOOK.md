# INSTALL-RUNBOOK — Gitea لـ AiRemote

> **التاريخ:** 2026-11-16 · **الحالة:** مثبَّت ويعمل · **لا Docker** · **لا GitHub**

---

## 1) الحقيقة الحالية

| البند | القيمة |
|---|---|
| الخدمة | Gitea 1.22.0 أصلي على Windows (لا Docker) |
| المسار | `D:\Services\Gitea\` |
| العملية | `gitea.exe web` — pid في `gitea.pid` |
| الويب المحلي | http://localhost:3000 |
| الويب LAN | http://192.168.1.25:3000 (إن فتحت الجدار — حالياً قد يكون مغلقًا) |
| الصحة | `http://localhost:3000/api/healthz` → `status: pass` |
| الحساب | `ibrahims78` (admin) — كلمة المرور في `%APPDATA%\AiRemote\gitea-admin.txt` |
| المستودع | **ibrahims78/airemote** — **خاص** |
| الربط | `origin` = `http://localhost:3000/ibrahims78/airemote.git` |
| الفرع الحيّ المدفوع | `feat/screen-unify-3.13.0` @ `8864292` |
| الفروع الأخرى | `main` · `hardening/audit-20261102` · `checkpoint/*` |
| الوسوم | `v1.1.0` `v1.4.0` `v1.5.0` `v1.6.0` `v2.0.0` `pre-ui-w0-2026-11-06` |
| GitHub | **غير مرتبط — قرار المالك: لا تربط حتى يقول «اربط GitHub»** |
| التسجيل | مغلق (`DISABLE_REGISTRATION = true`) |
| الدخول لعرض المحتوى | مطلوب (`REQUIRE_SIGNIN_VIEW = true`) |

---

## 2) التشغيل والإيقاف

```powershell
# تشغيل (يتجاهل إن كان يعمل)
D:\Services\Gitea\start-gitea.ps1

# إيقاف
D:\Services\Gitea\start-gitea.ps1 -Stop

# إعادة تشغيل
D:\Services\Gitea\start-gitea.ps1 -Restart

# صحة سريعة
curl.exe -s http://localhost:3000/api/healthz
```

بعد إعادة تشغيل الجهاز: **شغّل `start-gitea.ps1` يدوياً** (لا خدمة Windows — لست مسؤولاً لتثبيت خدمة).  
إن أردت تشغيلاً تلقائياً عند الدخول، أخبر المالك وسيُضاف مهمة مجدولة.

---

## 3) الاعتمادات — لا ترفعها

```
C:\Users\admin\AppData\Roaming\AiRemote\gitea-admin.txt
```

يحوي: url · username · email · password · repo.  
**ممنوع** نسخه إلى المستودع أو لصق كلمة المرور في المحادثة.

الواجهة: http://localhost:3000 → تسجيل دخول بـ`ibrahims78`.

---

## 4) الدفع بعد كل checkpoint

```powershell
git -C "D:\autoclaw projects-new\AiRemote" push origin --all
git -C "D:\autoclaw projects-new\AiRemote" push origin --tags
```

إن طلب بيانات دخول: نفس ملف `gitea-admin.txt`.  
أو استخدم نفس نمط `http.extraHeader` المستخدم في التثبيت.

**لا تدفع إلى أي remote آخر.**

---

## 5) نسخ احتياطي

```powershell
# 1) bundle المشروع (كما في ProjectForge)
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 backup -Path "D:\autoclaw projects-new\AiRemote"

# 2) بيانات Gitea نفسها (issues, users, settings)
# أوقف Gitea ثم انسخ:
#   D:\Services\Gitea\data\
#   D:\Services\Gitea\custom\conf\app.ini
```

الاستعادة: أوقف Gitea، أعد المجلدين، شغّل.

---

## 6) ما لا يُفعل

- لا GitHub (مقفل من المالك)
- لا فتح التسجيل
- لا جعل المستودع عاماً
- لا كتابة كلمة مرور في المستودع
- لا حذف `data\` (هي كل التاريخ في Gitea)
- لا ترقية Gitea من غير 1.22.x دون قراءة release notes

---

## 7) ربط W1-1 — منجز

| معيار الخطة | الحالة |
|---|---|
| remote يستجيب | **PASS** — `origin` = Gitea محلي |
| push --all | **PASS** — 5 فروع |
| push --tags | **PASS** — 6 وسوم |
| HEAD مطابق | **PASS** — `8864292` محلي = بعيد |
| `.pf/state.json` | لم يُنشأ بعد — ينفّذه `pf adopt` في خطوة W1-1 التكميلية إن طلبها المالك |

**الرابط الثابت:** `http://localhost:3000/ibrahims78/airemote`

---

## 8) فتح LAN (اختياري — يحتاج قرار المالك)

حالياً Gitea يستمع على `0.0.0.0:3000` لكن جدار ويندوز قد يمنع الجهاز الأخرى.

لفتح المنفذ (يحتاج مسؤول):

```powershell
New-NetFirewallRule -DisplayName 'AiRemote Gitea' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

بعدها من WIN10: `http://192.168.1.25:3000` (أو IP Wi-Fi/Ethernet الحالي).

---

*نهاية RUNBOOK — Gitea جاهز — لا GitHub.*

---

## 9) اختصار سطح المكتب

| الاختصار | الوظيفة |
|---|---|
| `AiRemote Gitea.lnk` | يشغّل الخدمة ثم يفتح المتصفح على `http://localhost:3000` |
| `AiRemote Gitea Stop.lnk` | يوقف الخدمة |

الملفات:
- `D:\Services\Gitea\gitea-start.bat`
- `D:\Services\Gitea\gitea-stop.bat`
- `D:\Services\Gitea\start-gitea.ps1`

---

## 10) Git مربوط — لا خطوة ربط متبقية

```
origin = http://localhost:3000/ibrahims78/airemote.git
upstream = origin/feat/screen-unify-3.13.0
credentials = D:\Services\Gitea\git-credentials (خارج المستودع)
```

`git push` و`git fetch` تعمل بلا إدخال كلمة مرور على هذا الاستنساخ.

> **ملاحظة 2026-11-17 (فخّ اعتماد):** كلمة مرور Gitea تنتهي بـ`@` — يجب **URL-encoding** في ملف store (`%40`) وإلاّ لا يطابقها `credential-store`، ويجب أن يكون الملف بنهايات **LF** لا CRLF (الـ`\r` يفسد مطابقة host). أُعيد بناء الملف من `gitea-admin.txt` بترميز سليم بعد فشل دفع مفاجئ (الملف كُتب فوقه CRLF + كلمة مرور خام في 11:19). الدليل: إصلاح موثق في جلسة W2.

> **ملاحظة 2026-11-17:** إن فشل `fetch`/`push` بـ`Authentication failed` رغم وجود ملف الاعتماد، فالسبب الغالب تدخّل Git Credential Manager (helper عام `credential.helper = manager` على مستوى النظام) قبل store helper. العلاج المطبّق في `.git/config` لهذا الاستنساخ: قسم `[credential]` بقيمة `helper =` فارغة قبل مدخلي `credential "http://localhost:3000"` / `credential "http://192.168.1.25:3000"` — يُصفّر موروث GCM ويبقي store هو المعتمد. الدليل: `outputs/verify-2026-11-17/W1-1/`.
