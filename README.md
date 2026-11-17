<div align="center">

# ⚡ AiRemote

**منصة وصول عن بُعد self-hosted مع طبقة ذكاء اصطناعي مدمجة**
**Self-hosted remote access platform with a built-in AI Agent**

[![Node.js](https://img.shields.io/badge/Node.js-22+-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-11.x-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![Fastify](https://img.shields.io/badge/Fastify-5.x-000000?logo=fastify)](https://fastify.dev)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Version](https://img.shields.io/badge/version-3.17.0-blueviolet)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Self-hosted](https://img.shields.io/badge/Self--hosted-✓-brightgreen)]()

</div>

---

## ما هو AiRemote؟

AiRemote منصة **self-hosted** للوصول عن بُعد وإدارة الأنظمة: بثّ شاشة، تحكم كامل (فأرة + لوحة مفاتيح)، تنفيذ أوامر بالذكاء الاصطناعي، طرفية SSH، وإدارة ملفات — في حل واحد مفتوح المصدر. بديل خفيف لـ AnyDesk/TeamViewer مع طبقة AI.

**مقياس النجاح المعتمد (D6):** مستخدم جديد يرفع سيرفراً ووكيل ويندوز ويتحكم بجهاز واحد خلال **≤ 15 دقيقة** من الاستنساخ إلى `/health` — يُقاس في بوابة W2.

---

## ✨ الميزات

### التحكم عن بُعد
| الميزة | الوصف |
|---|---|
| 🖥️ **بثّ الشاشة** | MJPEG-over-WebSocket حتى 30 FPS بجودة قابلة للضبط |
| 🖱️ **الفأرة** | تحريك، نقر، نقر مزدوج، سحب، تمرير |
| ⌨️ **لوحة المفاتيح** | كل المفاتيح + التركيبات (Ctrl+C، Alt+F4…) |
| 📋 **الحافظة** | قراءة/كتابة ثنائية الاتجاه |
| 🖥️ **شاشات متعددة** | تبديل حي بين الشاشات |
| 🔒 **وضع الخصوصية** | إطفاء الشاشة البعيدة أثناء الجلسة |
| 📹 **تسجيل الجلسة** | تسجيل WebM قابل للتنزيل |
| 📡 **زمن الاستجابة** | RTT ملوّن حسب الجودة |
| ⏱️ **مهلة الخمول** | تحذير تلقائي بعد 5 دقائق |

### المنصات
| الميزة | Linux | macOS | Windows |
|---|---|---|---|
| التقاط الشاشة | scrot / ImageMagick / xwd | screencapture | PowerShell GDI |
| الفأرة | xdotool | cliclick / osascript | user32.dll |
| لوحة المفاتيح | xdotool | osascript | SendKeys |
| الحافظة | xclip / xsel | pbcopy/pbpaste | Set-Clipboard |

### الإدارة
| الميزة | الوصف |
|---|---|
| 🤖 **وكيل AI** | محادثة بالعربية أو الإنجليزية — تنفيذ أوامر بنقرة |
| 🔌 **طرفية SSH** | xterm.js في المتصفح (256 لوناً، ملء الشاشة) |
| 📊 **مراقبة حيّة** | CPU / RAM / Disk / Network |
| 📁 **مدير ملفات** | تصفح، رفع، تنزيل، إعادة تسمية |
| 🔔 **قواعد تنبيه** | عتبات CPU/RAM/Disk مع webhook |
| 👥 **تعدد مستخدمين** | أدوار: Admin / Manager / Viewer |
| 🌍 **عربي + إنجليزي** | واجهة ثنائية اللغة بتبديل فوري |
| 🔐 **2FA** | TOTP اختياري |

---

## 🏗️ المعمارية — مصدر حقيقة واحد

> **قرار معماري موثّق:** `docs/ADR/DUAL-SERVER.md` (W1-3).
> **الكود الحيّ المشحون هو `packages/server-desktop/server.js`** (Electron main → esbuild bundle → `app.asar`).
> **`packages/server` (TypeScript) مرجع تعليمي مجمد غير مشحون** — إصداره 3.14.0 عمداً. أي إصلاح فيه وحده لا يصل الحزمة المشحونة (فخّ 88).

```
المتصفح (React Dashboard :5000)
        │  REST + WebSocket
        ▼
سيرفر AiRemote الحيّ (packages/server-desktop/server.js · Fastify 5 · :3001 TLS)
  ├── REST API    — Auth · Devices · Users · Sessions · AI · Settings
  ├── WS /agent   — تسجيل الوكلاء + capabilities
  ├── WS /ws      — بثّ الإحصاءات
  ├── WS /screen  — بثّ MJPEG + تحكم
  ├── WS /pty     — طرفية
  └── SQLite      — users · devices · sessions · audit_log · alert_rules
        │  بروتوكول الوكيل
        ▼
وكيل AiRemote (packages/agent-desktop على ويندوز · android-agent على أندرويد)
```

---

## 🚀 البدء السريع

**المتطلبات:** Node.js ≥ 22 · pnpm ≥ 11.5.3 (المستودع يعلن `engines`).

### 1) الاستنساخ

```bash
# مستودعان خاصان: Gitea محلي (origin) + GitHub (github)
git clone http://localhost:3000/ibrahims78/airemote.git
# أو: git clone https://github.com/ibrahims78/airemote.git
cd airemote
pnpm install
```

### 2) التطوير

```bash
# بناء الحزم المشتركة أولاً (قاعدة WORKING_AGREEMENT)
pnpm --filter @airemote/shared build
pnpm --filter @airemote/ai-engine build
pnpm --filter @airemote/dashboard build

# السيرفر الحيّ (ما يُشحن في المثبّتات)
cd packages/server-desktop
node scripts/bundle.js          # يلزم من استنساخ نظيف — بدونها لا يقلع server.js
node scripts/copy-dashboard.js
pnpm start            # electron — استمع على :3001 (TLS إلزامي في production)

# اللوحة (تطوير)
pnpm --filter @airemote/dashboard dev    # :5000
```

> **ملاحظة:** `pnpm --filter @airemote/server dev` يشغّل **المرجع المجمد** لا السيرفر الحيّ — لا تستخدمه كمرجع سلوك الإنتاج.

### 3) الإنتاج (ويندوز)

المثبّتات الجاهزة في `releases/`:
- `releases/server-windows/` — سيرفر ويندوز (Setup / zip)
- `releases/agent-windows/` — وكيل ويندوز
- `releases/android-agent/` — APK

التثبيت: السيرفر أولاً ثم `/health` ثم الوكلاء. **TLS إلزامي في production** (البوتس بلا TLS/JWT_SECRET = FATAL).

### 4) Docker (موجود — بحدّث موثّق)

```bash
export JWT_SECRET=$(openssl rand -hex 32)
export CREDENTIALS_KEY=$(openssl rand -hex 32)
docker compose -f docker/docker-compose.yml up -d
```

`docker-compose.yml` يرفض الإقلاع بلا `JWT_SECRET` و`CREDENTIALS_KEY` (healthcheck مضمّن).
**تنبيه صدق:** صورة Docker حالياً تبني `packages/server` **المرجع المجمد** لا `server-desktop` الحيّ — انظر `docs/ADR/DUAL-SERVER.md`. لا تُشغَّل على قاعدة إنتاج حيّة.

**لا تُشغَّل حاويات Docker على قاعدة الإنتاج الحيّة.**

### 5) الاختبارات

```bash
pnpm typecheck                          # TypeScript — 5 حزم
node packages/server/test/registry-race.test.cjs
node packages/server/test/e2e-connection.test.cjs
node packages/server/test/e2e-authz.test.cjs
node packages/server/test/e2e-screen-keyframe.test.cjs
node packages/agent-desktop/test/safety.test.cjs
node packages/agent-desktop/test/password-kdf.test.cjs
node packages/server-desktop/test/secrets.test.cjs
```

المجموعات السبع كلها **PASSED** عند آخر بوابة (`outputs/verify-2026-11-17/gate-W1/`). `SKIP` لا يُحسب نجاحاً (`docs/DEFINITION-OF-DONE.md` §7).

---

## 📦 هيكل المستودع

```
/
├── packages/
│   ├── server-desktop/   ← السيرفر الحيّ المشحون (Electron + server.js) ★
│   ├── agent-desktop/    ← وكيل ويندوز المشحون (Electron) ★
│   ├── android-agent/    ← وكيل أندرويد (Gradle · versionCode)
│   ├── server/           ← مرجع TypeScript مجمد — غير مشحون (ADR)
│   ├── dashboard/        ← React 18 + TailwindCSS
│   ├── agent/            ← وكيل تطوير (TS)
│   ├── shared/           ← أنواع TypeScript + عقد الرسائل
│   └── ai-engine/        ← تجريد مزودي AI
├── docker/               ← Dockerfile.server + Dockerfile.dashboard + compose
├── docs/                 ← الخطط وADRs والتقارير (عربية)
├── releases/             ← الحزم المبنية
└── VERSION               ← مصدر رقم الإصدار الواحد
```

---

## 🤖 تثبيت الوكيل

1. أنشئ جهازاً في اللوحة لتوليد token.
2. على الجهاز البعيد: ثبّت وكيل ويندوز من `releases/agent-windows/` أو APK من `releases/android-agent/`.
3. الوكيل يسجّل بـ device token + heartbeat كل 4 ثوانٍ.

**Linux (وكيل التطوير `packages/agent`):**
```bash
sudo apt install scrot xdotool xclip imagemagick
```

---

## ⚙️ متغيرات البيئة

المصدر المركزي: `.env.example` في الجذر (W2-6). الأهم:

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `PORT` | `3001` | منفذ السيرفر |
| `JWT_SECRET` | إلزامي في production | توقيع JWT |
| `CREDENTIALS_KEY` | إلزامي في Docker | تشفير الاعتمادات |
| `NODE_ENV` | `development` | `production` يلزم TLS |
| `DB_PATH` | `./data/airemote.db` | قاعدة البيانات |
| `TRUST_PROXY` | `false` | `true` فقط خلف proxy HTTPS |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | — | شهادة TLS |
| `AGENT_ALLOW_INSECURE_WS` | — | `1` للمعمل المعزول فقط |
| `AIREMOTE_BACKUP_KEEP` | `7` | تدوير النسخ |

> مفاتيح AI (OpenAI/Anthropic/Gemini) تُضبط لكل مستخدم من لوحة الإعدادات — لا تُكتب في المستودع.

---

## 🛡️ الأمان

- JWT + refresh tokens دوّارة
- bcrypt cost 12
- RBAC على كل مسارات API
- حجب أنماط تنفيذ الأوامر في الوكيل
- تذاكر جلسة أحادية الاستخدام لـ WebSocket
- سجل تدقيق كامل
- الإبلاغ عن ثغرات: `SECURITY.md` (لا Issues العامة)

---

## 🤝 المساهمة

اتبع `docs/WORKING_AGREEMENT.md`:
1. **أولاً إصلاح الأخطاء والثغرات ثم الميزات** — لا ميزة على أساس متصدّع.
2. ملف خطة لكل ميزة كبرى، يُحدَّث أولاً بأول.
3. كل تغيير: توثيق + اختبار + دليل في `outputs/verify-YYYY-MM-DD/`.
4. لا سرّ في أي ملف متتبع — الاعتمادات خارج المستودع.

تفاصيل أدوات المساعد: `AGENTS.md` (W2-7).

---

## 📄 الترخيص

[MIT](LICENSE)

---

<div align="center">
  AiRemote · TypeScript · Fastify 5 · React · WebSocket · v3.17.0
</div>
