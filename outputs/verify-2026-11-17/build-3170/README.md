# دليل بناء 3.17.0 — 2026-11-17

**القطع على القرص (نمط المستودع: الحزم نفسها غير متتبعة — كـ3.16.19):**

| القطعة | الحجم |
|---|---|
| `releases/server-windows/AiRemote-Server-Setup-v3.17.0-x64.exe` | 158,693,037 B |
| `releases/server-windows/AiRemote-Server-v3.17.0-Windows-x64.zip` | 211,314,222 B |
| `releases/agent-windows/AiRemote-Agent-Setup-v3.17.0-x64.exe` | 76,402,768 B |
| `releases/agent-windows/AiRemote-Agent-v3.17.0-Windows-x64.zip` | 104,017,339 B |
| `releases/android-agent/AiRemote-Agent-Android-v3.17.0.apk` | 239,520 B (v2+v3 · `apksigner verify` Verifies) |

- `npx electron-builder --win --x64` (لا `run-electron-builder.cjs` — فخّ المسافة).
- APK: gradle assembleRelease → zipalign → apksigner (كلمة المرور من الملف، لم تُطبع).
- `node scripts/release-manifest.js` ثم `--verify` → **signature OK · all artifacts match**.
- `check-version-consistency --allow-missing-server`: كل المصادر ✓ 3.17.0/vc110 (الفشل الوحيد `/health` UNREACHABLE المعروف).
- static اللوحة المدمجة أُعيد نسخها (hashed assets جديدة).
- **تثبيت الأسطول: لم يُنفَّذ** — بانتظار «ثبّت».

**تحذير مهم للمالك قبل أي تثبيت أسطول:** better-sqlite3@9.6.0 **لا يملك prebuild لـNode 24** (`No prebuilt binaries found target=24.20.0`) و`ignoredBuiltDependencies` يمنع بناءه — db-adapter يسقط إلى `node:sqlite`. اختبار تصدير الجلسات فشل على هذا المسار (فلتر التاريخ + عزل viewer) — تفاصيل في `outputs/verify-2026-11-17/gate-W2/`.
