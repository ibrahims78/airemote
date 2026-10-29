# 3.8.13 — دليل البناء

**التاريخ:** 2026-10-29 · **الفرع:** `checkpoint/3.8.1-2026-10-26`
**الحالة:** حزمتان مبنيتان ومُتحقَّق منهما · **لم تُثبَّت** على السيرفر الحيّ (يبقى 3.8.12)

---

## 1. رفع الإصدار (8 ملفات)

| الملف | من | إلى |
|---|---|---|
| `packages/server-desktop/package.json` | 3.8.12 | **3.8.13** |
| `packages/server-desktop/server.js` (`SERVER_VERSION` → `/health`) | 3.8.12 | **3.8.13** |
| `packages/server-desktop/preload.js` (`version`) | 3.8.12 | **3.8.13** |
| `packages/agent-desktop/package.json` | 3.8.12 | **3.8.13** |
| `packages/agent-desktop/main.js` (احتياطي قراءة الإصدار) | 3.8.12 | **3.8.13** |
| `packages/agent-desktop/renderer/chat.html` | 3.8.12 | **3.8.13** |
| `packages/dashboard/src/lib/version.ts` (`APP_VERSION`) | 3.8.12 | **3.8.13** |
| `packages/android-agent/app/build.gradle` (`versionName`) | 3.8.12 | **3.8.13** (بلا بناء APK) |

التعليقات التاريخية `v3.8.12` في الشيفرة **لم تُمس** (سجل تغييرات لا إصدار).

---

## 2. الحزم

| الحزمة | الحجم | SHA-256 |
|---|---:|---|
| `releases/server-windows/AiRemote-Server-Setup-v3.8.13-x64.exe` | 121,209,665 | `6fbd333d0ca846a6b0871c522f14972b2ac93d3125517c5acdcee227dd412ebf` |
| `releases/server-windows/AiRemote-Server-v3.8.13-Windows-x64.zip` | 162,879,069 | `a93eb04aa6e2f9866b980361869afc605b02ddcb79140a1b6965eea78b22b47d` |
| `releases/agent-windows/AiRemote-Agent-Setup-v3.8.13-x64.exe` | 76,358,976 | `370191069d1c52734e92073974b8dfa4c85239b0806b82be64195b4c79f0bcf3` |
| `releases/agent-windows/AiRemote-Agent-v3.8.13-Windows-x64.zip` | 103,964,009 | `138b225bc05e78e8010266301cdc01968ff572205347338cd5a70dcc9ac13457` |

الملفات التنفيذية مستثناة من git (`releases/**/*.exe|zip`) — تبقى على القرص.

---

## 3. التحقق

| الفحص | النتيجة |
|---|---|
| `app.asar` للسيرفر يحوي `3.8.13` | ✅ |
| `app.asar` للسيرفر بلا `3.8.12` | ✅ |
| أصل اللوحة داخل الحزمة | `index-DW3b-SMc.js` = بصمة `dist` الحالية ✅ |
| `app.asar` للوكيل يحوي `"version": "3.8.13"` | ✅ |
| `tsc --noEmit` · `vite build` | 0 · ناجح |
| `scan-ui-colors` · `check-contrast` · `verify.js` | 725 · 22/22 · 21/21 |

---

## 4. فخّان واجهتهما البناء (للمرة القادمة)

1. **`npm run build:win` يفشل** عند `build:dashboard` لأن pnpm يريد حذف `node_modules` بلا TTY:
   `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. الحل المستخدم: تنفيذ الخطوات صريحة —
   `packages/shared: npx tsc` · `packages/ai-engine: npx tsc` · `packages/dashboard: npx vite build` ·
   `node packages/server-desktop/scripts/copy-dashboard.js` · ثم `npx electron-builder --win --x64`.
2. **`npm run build` للوكيل يفشل على Windows** لأن `CSC_IDENTITY_AUTO_DISCOVERY=false` بادئة POSIX.
   الصواب: `$env:CSC_IDENTITY_AUTO_DISCOVERY='false'; npx electron-builder --win --x64`.

**تنظيف:** `copy-dashboard.js` يكتب فوق `packages/server-desktop/static/` المتعقَّب؛ بعد البناء أُعيد
`git checkout` للمجلد وأُزيلت الملفات غير المتعقَّبة بـ`git clean -fd`، فبقيت الشجرة على 8 ملفات إصدار فقط.

---

## 5. ما لم يُنفَّذ

**التثبيت.** السيرفر المثبَّت ما زال **3.8.12** على `https://127.0.0.1:3001`. الترقية تعني إيقاف الخدمة
الحيّة على `%APPDATA%\AiRemote-Server` وتشغيل مثبّت NSIS — قرار مالك يحتاج نافذة صيانة (والرجوع متاح
بمثبّت 3.8.12 الموجود). لم يُشغَّل أي سيرفر على قاعدة المثبَّت، ولم تُمسّ بيانات المختبر.
