---
name: AiRemote Z.ai (GLM) AI Provider + model catalog refresh
description: Z.ai (GLM) provider added via the OpenAI-compatible path; AI model lists refreshed to Oct 2026; desktop (server-desktop) rebuild notes
---

**Added / updated:** 2026-10-16

**Z.ai provider (`zai`):** New AI provider option "Z.ai (GLM)" for the AI Assistant + Auto-Heal. Z.ai is OpenAI-compatible — reuses `OpenAIProvider` with a default base URL.

**Changes (source):**
- `packages/shared/src/types/ai.ts` — `AIProvider` union: added `'zai'`.
- `packages/ai-engine/src/gateway.ts` — `ZAI_DEFAULT_BASE_URL = 'https://api.z.ai/api/paas/v4/'`; `case 'zai'` returns `new OpenAIProvider({ ...config, baseUrl: config.baseUrl || ZAI_DEFAULT_BASE_URL })`.
- `packages/server/src/routes/ai.ts` — required-key error message names Z.ai.
- `packages/dashboard/src/components/AiChatPanel.tsx` + `packages/dashboard/src/pages/SettingsPage.tsx` — provider option + refreshed model lists (below).
- `AIREMOTE_DOCS.md` — providers table row added + model lists updated.

**Model lists (refreshed 2026-10-16):**
- OpenAI: `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna` — no free API tier; new accounts get limited starter credits only.
- Google Gemini: `gemini-3.8-flash`, `gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-2.5-pro` — Flash models carry a limited free tier; `gemini-3.7-flash` is deprecated.
- Ollama (local, free): `qwen3`, `deepseek-r1`, `gemma3`, `llama3.3`, `phi4`, `gpt-oss`.
- Z.ai: `glm-4.7-flash` (free, recommended), `glm-4.5-flash` (free), `glm-4.6v-flash` (free vision), `glm-5.3-flash`, `glm-4.7`, `glm-5.3`.

**Desktop release (v3.3.5):** Rebuild sequence for the installed desktop app —
`node packages/server-desktop/scripts/bundle.js` → dashboard `vite build` → `node packages/server-desktop/scripts/copy-dashboard.js` → `electron-builder --win --x64 --publish never --config.electronDist=<packages/server-desktop/node_modules/electron/dist>`.
Artifacts land in `releases/server-windows/` (Setup exe + portable zip + win-unpacked). The app installed under `%LOCALAPPDATA%\Programs\AiRemote Server` is a frozen asar build — it only shows the new UI after the new Setup is installed over it.

**Verified:** shared + ai-engine rebuilt; dashboard typecheck + vite build pass; server typecheck + build pass; live smoke test hits `api.z.ai` (401 with a fake key = routing OK; real key needed for full chat).

**Environment note:** on this machine `pnpm run <script>` triggers pnpm's deps-status check which re-runs `pnpm install`; that install fails in `packages/server-desktop` postinstall (electron-builder cannot exec `pnpm.cjs` directly on Windows). Workaround: call `node node_modules/typescript/bin/tsc`, `node node_modules/vite/bin/vite.js build`, `node scripts/bundle.js` and the electron-builder `.cmd` directly (no pnpm). Pre-existing machine issue, unrelated to this change.
