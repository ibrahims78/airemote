# Windows build guide — AiRemote Server Desktop (v3.2.1)

How the installer and portable build are produced, including the adjustments that
make the build work in restricted-network environments (GitHub release assets
blocked/unreliable).

## Outputs

- `releases/server-windows/AiRemote-Server-Setup-v<ver>-x64.exe` — NSIS installer
- `releases/server-windows/AiRemote-Server-v<ver>-Windows-x64.zip` — portable build
- `releases/server-windows/win-unpacked/` — raw packaged app

## One-time setup

```powershell
cd D:\autoclaw projects\AiRemote
# mirrors for restricted networks (used during install & build)
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
pnpm install
```

### better-sqlite3 for Electron

The bundled `postinstall` (`electron-builder install-app-deps`) downloads prebuilds
from GitHub. When that host is blocked, build from source instead (Visual Studio
Build Tools + Python required):

```powershell
cd packages/server-desktop
$env:npm_config_build_from_source = 'true'
$env:npm_config_disturl = 'https://artifacts.electronjs.org/headers/dist'
$env:npm_config_runtime = 'electron'
$env:npm_config_target = '28.3.3'
pnpm rebuild better-sqlite3
```

Verify it loads inside Electron (not Node):

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
node_modules\electron\dist\electron.exe -e "require('better-sqlite3'); console.log('ok')"
```

## Build

```powershell
cd packages/server-desktop
node scripts/bundle.js                              # esbuild → *.bundle.js
pnpm --filter @airemote/shared build
pnpm --filter @airemote/ai-engine build
pnpm --filter @airemote/dashboard build
node scripts/copy-dashboard.js                      # dashboard → static/
node ../../scripts/download-cloudflared.js          # fallback tunnel binary (see note)
pnpm exec electron-builder --win --x64 --publish never `
  '--config.electronDist=D:\autoclaw projects\AiRemote\packages\server-desktop\node_modules\electron\dist'
```

## Notes & gotchas

- **electronDist**: pointing at `node_modules/electron/dist` stops electron-builder
  from re-downloading the Electron zip (which fails when GitHub release assets are
  blocked). The dist folder comes from `pnpm install` (electron postinstall).
- **cloudflared**: `download-cloudflared.js` fetches from GitHub releases. If that
  host is blocked, download via a GitHub proxy and verify the Authenticode
  signature (signer: Cloudflare) before copying to `packages/server-desktop/bin/`.
  Cloudflared is only needed for the optional Cloudflare-tunnel mode; with
  Tailscale (see `docs/TAILSCALE_SETUP.md`) it is not required.
- **User-Agent note**: the download script skips the download if the file already
  exists — including a leftover LFS pointer. Check the file size (> 20 MB) if the
  tunnel feature looks broken.
- **Installer config** lives in `packages/server-desktop/package.json` (`build.nsis`):
  NSIS one-click is disabled, install directory is selectable, desktop/start-menu
  shortcuts are created.
- **Code signing**: the build is unsigned (`signAndEditExecutable: false`). Windows
  SmartScreen will warn on first run. Add a code-signing certificate to remove it.
- Bundles (`*.bundle.js`) and `static/` are committed build artifacts by project
  convention; rebuild them after changing `server.js` / dashboard sources.
