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
  typecheck + 3 test suites).
- Version bumped to 3.2.1 across packages, agents, dashboard and servers.

## How to verify

```bash
pnpm install            # full workspace install (see notes below for desktop test)
pnpm verify             # builds + typechecks + all test suites
```

The desktop-server E2E needs `better-sqlite3` loadable under plain Node:
`pnpm install --prod --filter airemote-server-desktop`.

## Known remaining items

- Tunnel strategy for stable remote access (Quick Tunnel URL rotates) —
  pending product decision.
- Live two-machine input test checklist (typing/consent) — see the hardening
  report; mac input path is compile-verified only.
- Hold-to-move for plain character keys is not supported (special keys do
  support holding).
- Large release binaries (~220 MB) remain in git history; removing them
  requires a history rewrite and an explicit decision.
- CI workflow not yet wired; `pnpm verify` is the intended CI entrypoint.
