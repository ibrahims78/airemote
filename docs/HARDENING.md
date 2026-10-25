# HARDENING — status & verification (3.2.1)

This branch/tree contains a multi-round hardening program on top of the
original 3.2.0 code. The version marker is now **3.2.1**: builds carrying it
include every fix below.

## What was fixed

**Round 1 — build + connection core**
- `packages/server` did not compile at HEAD (imports of non-exported members
  `sendCommandToAgent` / `sendFsDownload`). Fixed; the package now builds.
- Device re-registration race: a late close of a replaced agent socket could
  remove the newer registration ("device offline while connected"). Disconnect
  now honors socket identity; a stale close is ignored.
- Stale-frame gate: replaced/zombie agent sockets can no longer inject screen
  frames or tear down live sessions (binary + JSON + screen_* messages).
- Agents self-heal: on "Heartbeat rejected" they re-register automatically
  (throttled, once per 30 s), in both the web agent and the desktop agent.
- Added MIT `LICENSE` and a registry race regression test.

**Round 2 — coverage + policy**
- PTY/SSH session messages gated on connection ownership (8 handlers).
- Production refuses to start without a real `JWT_SECRET`.
- Full E2E connection test (`packages/server/test/e2e-connection.test.cjs`).

**Round 3 — desktop server interactive relay (the big one)**
The desktop server (the default deployment) could not run remote control at
all: it rejected plain agent URLs, ignored every control message from the
dashboard bundle, and parsed the wrong frame format. All three layers were
rebuilt: auto capture start, full mouse/keyboard/clipboard/monitors/quality/
privacy/chat/consent relay, 50B→13B frame transform, multi-viewer sessions,
register timeout, `/ws` compat fallback. `server.bundle.js` regenerated.
E2E: `packages/server-desktop/test/e2e-screen-control.test.cjs` (21 checks).

**Round 4 — input quality + consent enforcement**
- Duplicate key input removed: the dashboard sent both `down` and `press` per
  keystroke (double typing on Windows/Linux). Printable characters are now a
  single `press`; physical keys use `down`/`up` only — single input across all
  old/new dashboard × agent combinations.
- Unicode typing on Windows via `SendInput` KEYEVENTF_UNICODE (Arabic,
  symbols, layout-independent) in both agents; Linux uses
  `xdotool type --clearmodifiers`; macOS uses proper AppleScript key codes.
- Consent is now ENFORCED: mouse/keyboard execute only for a granted control
  session (`AGENT_UNATTENDED=true`, consent timeout, or the desktop agent's
  Allow button grants it).

**Round 5 — verification tooling + versioning**
- `node scripts/check-imports.js` — static import-consistency check.
- `pnpm verify` — one command running the full battery (4 builds + dashboard
  typecheck + all test suites; currently 10 steps).
- Version bumped to 3.2.1 across packages, agents, dashboard and servers.

**Round 6 — repository rebuild (clean history)**
- ~220 MB of release binaries purged from all history via `git filter-branch`
  (177 commits + 5 tags rewritten; the 7 hardening commits re-applied with
  blob-SHA integrity verified 8/8; 19 light release files restored).
- Working tree ~9 MB, `git fsck` clean. No remote configured — pushing the
  rewritten history to GitHub is a pending explicit decision (force-push).

**Round 7 — Windows installers**
- `AiRemote-Server-Setup-v3.2.1-x64.exe` (NSIS, ~96 MB) and
  `AiRemote-Agent-Setup-v3.2.1-x64.exe` (~73 MB) build offline via
  `docs/WINDOWS_BUILD.md` (npmmirror + artifacts.electronjs.org mirrors,
  local `electronDist` to skip GitHub downloads).
- `better-sqlite3` compiled from source for Node and Electron ABI (119).
- Desktop E2E skips gracefully when better-sqlite3 targets Electron.

**Round 8 — device authorization isolation (admin-or-owner)**
- New `packages/server/src/lib/deviceAccess.ts` (`canAccessDevice`):
  admins access every device; regular users only the devices they own.
- Web server: all 6 fs-relay routes, screen/pty/ssh WS handlers,
  `client:command`, and the client registry (subscribe + broadcast scoping)
  enforce the policy; registry clients now carry `role`.
- Desktop server: the same policy across device list/get/rename/delete,
  WoL, stats history, the 4 fs routes, recordings, SFTP sessions
  (owner-bound), screen/pty WS joins, `client:command`, screen start/stop/
  control relays, and every `broadcastToClients` device message.
- New E2E `packages/server/test/e2e-authz.test.cjs` (25 checks); desktop E2E
  extended to 33 checks. `pnpm verify` = 10 steps, all green.

## How to verify

```bash
pnpm install            # full workspace install (see notes below for desktop test)
pnpm verify             # builds + typechecks + all test suites
```

The desktop-server E2E needs `better-sqlite3` loadable under plain Node:
`pnpm install --prod --filter airemote-server-desktop`.

## Known remaining items

- Tunnel strategy: **Tailscale (M2) selected** — see `docs/TAILSCALE_SETUP.md` for
  the stable-access guide; the Cloudflare Quick Tunnel remains available as a fallback.
- Live two-machine input test checklist (typing/consent) — see the hardening
  report; mac input path is compile-verified only.
- Hold-to-move for plain character keys is not supported (special keys do
  support holding).
- History rewrite done (Round 6): force-pushing the clean history to GitHub
  remains an explicit pending user decision (no remote configured).
- Uploads still buffer whole files in memory (500 MB ceiling); streaming is
  a future improvement.
- Web-server live broadcasts are scoped by the subscribe-time device set; a
  device created while a non-admin client is connected starts broadcasting
  to that client after its next reconnect.
- CI workflow not yet wired; `pnpm verify` is the intended CI entrypoint.
