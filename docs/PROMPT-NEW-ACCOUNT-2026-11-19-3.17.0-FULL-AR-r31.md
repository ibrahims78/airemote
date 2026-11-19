# استئناف AiRemote — 2026-11-19 · الإصدار **3.17.0** — نسخة **r31** (P6 مقفولة · اللوحة منشورة)

> **هذا الملف يحلّ محلّ r30 وكل ما قبله.** مكتوب لحساب جديد بلا ذاكرة.
> كل رقم هنا **مقيس** ودليله مذكور. **لا عمل بلا أمر مالك.**

---

## ⛔ 0) أمر التوقّف — يُقرأ أولًا

**لا كتابة (بناء/تثبيت/تعديل/commit/إيقاف 3001) حتى يقول المالك: «ابدأ» · «نفّذ» · «اكمل» · «عدّل» · «ابنِ» · «ثبّت».**

- **ترخيصك الافتراضي (بلا أمر):** قراءة فقط + اختبارات غير كاتبة (`node --check` · `curl /health` · `adb shell dumpsys` للقراءة).
- **محظور ما لم يُؤذن لحظيًا:** إطفاء WiFi على TECNO · تشغيل المحاكي · `docker compose` على قاعدة الإنتاج · حذف `server.js` · إيقاف/إعادة تشغيل 3001.
- **قاعدة المالك:** **ممنوع بث شاشة جهاز المالك (DESKTOP-K81PJ9H) إلى مشاهد على نفس الجهاز.** أي عرض/قياس من **مشاهد خارجي** (TAB16 / WIN11-VM) فقط.

---

## 1) الهوية والبيئة

| | |
|---|---|
| المسار | `D:\autoclaw projects-new\AiRemote` |
| الفرع | `feat/screen-unify-3.13.0` |
| GitHub | `git@github.com:ibrahims78/airemote.git` (remote `github`) |
| Gitea | `http://localhost:3000/...` — **مغلق عادةً** |
| السيرفر | `https://127.0.0.1:3001` · `/health` = **3.17.0 · ok** · مثبَّت في `C:\Users\admin\AppData\Local\Programs\AiRemote Server` |
| الكود الحيّ | `packages/server-desktop/server.js` (ليس `packages/server` TS — فخّ 88) · المشحون: `resources/app.asar` |
| اعتماد الاختبار | `C:\Users\admin\AppData\Roaming\AiRemote\lab-probe.json` — لا تطبع أي سرّ |
| adb | `D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\platform-tools\adb.exe` |
| الأدلة | `outputs/verify-2026-11-19/screen/` + `out/` |

> `$env:APPDATA` و`$env:LOCALAPPDATA` فارغان في قشرة الأدوات — استخدم مسارات مطلقة.

---

## 2) الأسطول — **6/6 online · 3.17.0**

| الجهاز | ID |
|---|---|
| DESKTOP-K81PJ9H (المالك) | `35850a47-e50f-48f3-bc81-8c38d7a908c0` — لا تبثّه لنفس الجهاز |
| WIN10-VM | `b42175d0-d0c9-428d-ab94-4e66dff56af3` |
| WIN11-VM | `d147684b-2451-4418-a628-86f11aa66a4e` |
| TECNO-KL4 | `07f8ae91-5b64-41d9-97df-ce649772b0d3` |
| TAB16-USB | `7fc54b40-e7c1-4db6-9f55-78f377c4f4ad` — adb `GPSZ2025040701858` · **FileBridge لا تلمسها (81)** |
| Android-Emulator | `9b5eeaf9-b30d-449c-875e-1e21e56ac041` — بموافقة المالك فقط |

---

## 3) ما أُنجز هذه الجولة (r30 → r31)

### P6 — ✅ مقفولة (10د 6ث · 21/21 · **0/21 تشويش** · 1920×1080 · bad=0)

- 12 إطارًا منها **فيديو متحرك** (ريلز/بث) — الحالة التي كانت تفشل سابقًا.
- **السبب الجذري:** `p6.html` كان يقرأ `dx/dy` ب`getUint16(13/15)` بينما السيرفر يكتب `u32@13/17` ⇒ لصق الرقعة في `(0,dx)` بدل `(dx,dy)` = خطوط فيديو مع bad=0.
- **الإصلاح:** `getUint32(13/17)` + لصق الدلتا على الكانفس بلا إعادة رسم المفتاح.
- **الدليل:** `outputs/verify-2026-11-19/screen/r29-P6-قفل-2026-11-19.md` · `p6s-prefix-distortion-d8/d10.png` (قبل) · `p6s-start/mid/end.png` (بعد).

### عيب منتج أُصلح ونُشر — `ScreenViewer.tsx`

- كان `if (decodingRef.current) return` يُسقط **إطارات المفتاح** ⇒ دلتا على لوحة قديمة (نفس التشويش في لوحة الويب).
- **الإصلاح:** `pendingKeyBufRef` + `flushPendingKey()` — يُحفظ آخر مفتاح ويُطبَّق بعد انتهاء فك الرمز. `tsc --noEmit` **EXIT=0**.

### النشر على 3001 — ✅ (بأمر «بناءً + إعادة تشغيل»)

| الخطوة | الرقم |
|---|---|
| `build:dashboard` | **42.93s** · 50 أصلًا |
| `app.asar` الجديد | **22,384,587 B** (كان 21,701,194) |
| نسخة احتياطية | `resources\app.asar.bak-r30` + `app.asar.unpacked.bak-r30` |
| إعادة تشغيل | `/health` 3.17.0 بعد **13ث** |
| المخدوم الآن | `index-DOQhNlu-.js` · `ScreenViewer-DiJBgU3Q.js` |
| مطابقة | **SHA256 المنشور = المحلي** (`229910DF…AABC33`) |
| الأصول | **4/4 = 200** |
| الدخول/DB | `login 200` · token ✓ |
| الأسطول | **6/6 online** |
| حزم الإصدار (`releases/server-windows`) | zip **220,214,513 B** · Setup **166,042,144 B** · blockmap 173,549 B |

- الدليل: `outputs/verify-2026-11-19/screen/r30-نشر-اللوحة-2026-11-19.md`.
- **التراجع:** أعِد `app.asar.bak-r30` → `app.asar` و`app.asar.unpacked.bak-r30` → `app.asar.unpacked` ثم أعد التشغيل.
- **لم يُمَس:** `server.js` · رقم الإصدار (بقي 3.17.0) · FileBridge · WiFi TECNO · المحاكي.

---

## 4) أوامر جاهزة

```powershell
# صحة السيرفر
curl.exe -k -s https://127.0.0.1:3001/health

# إعادة قياس P6 على TAB16 (بروكسي 8899 + مشاهد + 10 دقائق)
node "D:\autoclaw projects-new\AiRemote\outputs\verify-2026-11-19\screen\_p6-proxy.cjs"
node "D:\autoclaw projects-new\AiRemote\outputs\verify-2026-11-19\screen\_p6-open.cjs"
adb -s GPSZ2025040701858 shell input tap 1200 700
node "D:\autoclaw projects-new\AiRemote\outputs\verify-2026-11-19\screen\_p6-shoot.cjs"

# إعادة بناء اللوحة ونشرها (بأمر فقط)
cd "D:\autoclaw projects-new\AiRemote\packages\server-desktop"; npm run build:dashboard
```

**نشر asar (النمط المستخدم في r31):** استخراج `app.asar` بـ`@electron/asar` (`node_modules/.pnpm/@electron+asar@3.4.1`) → استبدال `static/` → `createPackageWithOptions({unpack:'**/*.node'})` → إيقاف التطبيق → تبديل `app.asar` + `app.asar.unpacked` → بدء `AiRemote Server.exe` → تحقق `/health` + بصمة أصل.

---

## 5) الفخاخ

| # | القاعدة |
|---|---|
| 78/82 | بعد force-stop أندرويد أعد تمكين a11y. |
| 79 | MediaProjection واحد/عملية. |
| 80 | AISHOT 1280×800. |
| 81 | **FileBridge — لا تلمسها.** |
| 83 | `vm-exec` على WIN11 يقطع ~30ث. |
| 84 | lab-probe 5 دخول/دقيقة. |
| 85 | `getRealMetrics()` لا `getDisplayMetrics()`. |
| 88 | `server.js` الحيّ ≠ `packages/server` TS. |
| Session 0 | لا `vmrun runProgramInGuest` للوكيل — `schtasks /IT`. |
| NSIS | نفس الإصدار لا يكتب فوق المثبت ⇒ **استبدال asar** (نمط r31). |
| رفع ملفات | `.asar` مرفوض — باسم محايد ثم أعد التسمية. |
| Chrome WSS | يرفض الشهادة الذاتية ⇒ بروكسي `ws://:8899`. |
| split-screen | **لا تسحب الفاصل على TAB16.** |
| `am start -p` | وسائط adb كمصفوفة لا سلسلة. |
| `timeout.exe` | ينهار بلا كونسول — استخدم `setTimeout` في Node. |
| **بروتوكول الدلتا** | للمشاهد: 21 بايت · `dx=u32@13` · `dy=u32@17`. قراءة `u16` = تشويش فيديو. |
| **bad=0** | يعني JPEG سليمًا فقط — التشويش البصري يُكتشف بالعين على الإطارات. |
| **إطار المفتاح** | لا تُسقطه أثناء فك الرمز — احفظه وطبّقه بعده. |
| **extractFile في asar** | مسارات `static/...` تعمل؛ مسارات `assets` قد تفشل — استخدم `extractAll` عند اللزوم. |
| **إعادة التشغيل** | الإغلاق اللطيف قد يرفض ⇒ `taskkill /F`؛ `/health` يعود خلال ~13–60ث. |

---

## 6) حالة البنود

| البند | الحالة | الرقم |
|---|---|---|
| P1 دلتا GDI | ✅ مقفول | 499–1149 kbps · 0 تالف (WIN10) |
| P2 FPS 1080p | ✅ مقفول | 15.66 fps @1920×1080 من WIN11 |
| P3 WIN10 | ✅ مقفول | maxErr 1px |
| P3 TECNO | ✅ مقفول | maxErr 0px (6 أهداف) |
| P4 تعدد الشاشات | ⛔ تجاوَز بأمر المالك | — |
| P5 WAN LTE | ⛔ مسدود | لا مسار عام |
| P6 تشويش 10د | ✅ **مقفول** | 10د6ث · 21/21 · 0/21 تشويش · bad=0 |
| P7 WebRTC M1 | ✅ مغلق بقرار | إشارات فقط |

**نشر اللوحة:** ✅ منشور على 3001 ومُتحقَّق بالبصمة.

---

## 7) قواعد كل بند

تنفيذ + قياس مُثبت في `outputs/verify-2026-11-19/screen/` + توثيق (CHANGELOG + STATE §12) + commit إنجليزي برقم البند + `pf checkpoint`.
**ممنوع:** ميزة خارج البنود · سرّ في ملف متتبَّع · حذف `server.js` · لمس فخاخ 78–80 كإصلاح · ادعاء قياس لم يُشغَّل · بث المالك لنفس الجهاز.

---

## 8) الإسناد عند التوقف

```powershell
cd D:\ProjectForge\05-SCRIPTS
.\pf.ps1 checkpoint -Path "D:\autoclaw projects-new\AiRemote" -Message "r31: <إنجاز مقيس>"
.\pf.ps1 handoff    -Path "D:\autoclaw projects-new\AiRemote"
git -C "D:\autoclaw projects-new\AiRemote" push github feat/screen-unify-3.13.0
```
+ حدّث `PROJECT_STATE` §0.1 و§12 + ارفع رقم r (r31 → r32).

---

## 9) نقطة الاستئناف الدقيقة

- **آخر عمل:** P6 مقفولة + نشر اللوحة المصحَّحة على 3001 (بناء/إعادة تشغيل/تحقق).
- **الشجرة:** `static/` في المستودع محدَّث ليطابق المنشور.
- **السيرفر:** 3001 يعمل 3.17.0 · اللوحة الجديدة مخدومة · 6/6 online.
- **النسخ الاحتياطية:** `app.asar.bak-r30` + `app.asar.unpacked.bak-r30` في `resources\`.
- **أول بند عند «نفّذ»:** ما يحدده المالك — مرشح: قياس لوحة الويب من مشاهد خارجي، أو رفع الإصدار، أو بند جديد.

---

*نهاية r31 — 2026-11-19 · P6 مقفولة بالرقم · اللوحة المصحَّحة منشورة على 3001 بالبصمة · 6/6 online · لا عمل بلا أمر.*
