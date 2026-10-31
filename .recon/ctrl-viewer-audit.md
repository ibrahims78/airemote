# Viewer-side remote control audit — mouse / touch / pointer path

**Scope:** `packages/dashboard/src/components/ScreenViewer.tsx` → `screen:mouse_event` → server → agent injection.
**Diagnosis only. No design proposals.**

## 0. Snapshot and anchoring (read this before trusting a line number)

| Item | Value |
|---|---|
| Repo | `D:\autoclaw projects-new\AiRemote` |
| Branch / HEAD | `checkpoint/3.8.1-2026-10-26` / `a10ede6` |
| Audited file | `packages/dashboard/src/components/ScreenViewer.tsx` |
| Audited revision | **working tree**, sha256 `9D65D21D4460C6F8A5898E4FFB96384FF8B953861CC347BA5B5F6664F9B7C14B`, 137,565 bytes, mtime 2026-11-01 00:47:20 |
| Delta vs HEAD | `+167 / -3` — an **uncommitted, in-progress "3.9.3" Pointer Events / touch implementation** |
| Snapshots kept | `.recon/_snap/ScreenViewer.9D65D21.worktree.tsx`, `.recon/_snap/ScreenViewer.head-a10ede6.tsx`, `.recon/_snap/ScreenViewer.pending.diff` |

> **Churn warning.** The file grew from 130,593 B to 137,565 B *during* this audit (another writer is active). Every line number below was resolved against sha `9D65D21…` and re-verified after the grow. If `ScreenViewer.tsx` changes again, anchors after line 1069 shift by the size of the new hunk. Diff-based anchors (§D2) are immune.

Tiers: **T1** first-party code (current tree), **T2** official docs, **T3** secondary source, **T4** inference.

---

## 1. What the path actually is (contract map)

The viewer never sends pixels. It sends **normalized 0..1 fractions of the rendered content box**, and the *receiver* multiplies by a screen size it owns.

| Hop | Location | Behaviour |
|---|---|---|
| Emission (mouse) | `ScreenViewer.tsx:1022-1026` | `payload: { type, x, y, button: e.button, ...extra }` |
| Emission (pointer) | `ScreenViewer.tsx:1088-1096` | `x=(cx-r.left)/r.width`, `y=(cy-r.top)/r.height`, silent drop if outside 0..1 |
| Emission (wheel) | `ScreenViewer.tsx:1056-1061` | `x=(e.clientX-r.left)/r.width`, `deltaY: e.deltaY` (raw, unnormalized) |
| Server relay | `packages/server/src/ws/screenHandler.ts:227-233` | forwards payload verbatim as `server:screen_mouse`; **no validation, no clamping** |
| Auth gate | `packages/server/src/ws/screenHandler.ts:180-206` | `screen:mouse_event` requires `manager`; otherwise `screen:error` |
| Agent (Node) | `packages/agent/src/system/inputControl.ts:116-117,136-137` | `toAbsX = round(relX * _screenW)`, `_screenW` = monitor width (`agent.ts:124,323,833`) |
| Agent (Electron, shipped on Windows) | `packages/agent-desktop/main.js:1533-1534` | `xi = round(payload.x * capScreenW)` |
| DPR | `main.js:1303-1311` | `capScreenW = display.size.width * scaleFactor` — **the only dpr math in the whole path** |
| dpr in viewer | — | **absent**; `devicePixelRatio` appears nowhere in `packages/dashboard/src` (grep: 0 hits) |

Accepted action names — `move | down | up | click | dblclick | scroll` (`packages/shared/src/types/messages.ts:92-99`, `inputControl.ts:127-133`, `main.js:1537-1552`). The viewer emits only `move`, `down`, `up`, `click`, `scroll`; `dblclick` is **never** sent.

---

## 2. Defects, ranked by support strength

### D1 — Wheel magnitude contract is broken end to end (highest severity)
The viewer ships the browser's raw pixel delta (`ScreenViewer.tsx:1060`, `deltaY: e.deltaY`). The shipped Windows agent treats `deltaY` as **wheel notches** and multiplies by `-120`:

```js
// packages/agent-desktop/main.js:1550
const wd = Math.round((deltaY || 0) * -120)
```

`mouse_event`'s `d` parameter is in units of 120 per notch, so a Chrome/Edge notch (`deltaY = 100`) produces `-12000` → **100 notches in a single event**. A trackpad emits dozens of such events per second. The Node agent disagrees with the same payload and collapses it to ±1 notch:

```ts
// packages/agent/src/system/inputControl.ts:214
const wd = (evt.deltaY ?? 0) > 0 ? -120 : 120
```

Also unhandled: `e.deltaMode` is never read, so Firefox line mode (`deltaMode=1`, `deltaY=±3`) is misread as ±3 notches. `deltaY` is never clamped, scaled, or sign-normalized anywhere.
**T1 code (both sides). Confidence: high.** The ±100-per-notch figure is standard Chromium behaviour on Windows — **T4 inference**, but the defect exists for *any* magnitude ≠ 1, so it does not depend on that number.

### D2 — Right click and middle click are silently converted to left click (mouse path regression)
`onContextMenu` only suppresses the menu (`ScreenViewer.tsx:2281`: `onContextMenu={e => e.preventDefault()}`). The pointer path never reads `e.button`: grep over lines 1068-1212 for `e.button|buttons|ctrlKey|shiftKey|altKey|metaKey|deltaMode|getCoalesced` returns **zero hits**. Every terminal action hardcodes button 0:

- `ScreenViewer.tsx:1088` — `button = 0` default parameter
- `ScreenViewer.tsx:1173` — drag press: `sendMouseAt('down', g.downX, g.downY, 0)`
- `ScreenViewer.tsx:1196` — tap: `sendMouseAt('click', e.clientX, e.clientY, 0)`

So a physical right-click (button 2) or middle-click (button 1) is delivered as a **left** click, and right-drag / middle-drag cannot be expressed at all. This is a **regression**: the diff deletes `onMouseDown={e => sendMouse('down', e)}` / `onMouseUp={e => sendMouse('up', e)}`, which did forward `e.button` (`ScreenViewer.tsx:1025` still does, but is only reachable from `onMouseEnter`). Right-click survives **only** on touch, via the 550 ms long-press (`ScreenViewer.tsx:1119-1120`, button 2).
**T1 code + diff. Confidence: high.**

### D3 — Mouse "press" no longer exists; `down` is deferred until 6 px of motion
```tsx
// ScreenViewer.tsx:1169-1174
if (!g.moved && Math.hypot(dx, dy) > 6) {
  g.moved = true; clearLongPress(); g.dragging = true
  sendMouseAt('down', g.downX, g.downY, 0)
}
```
A press that does not move never emits `down`; the click is synthesised on release (`:1196`). Consequences: menu bars, sliders, selection starts, drag handles, canvas/game input and any `mousedown`-driven UI are dead for the first 6 px, and press-and-hold without movement is invisible to the remote. Before the patch `onMouseDown` fired immediately.
Adjacent falsy bug: the hover branch is keyed on `if (!g.downX && !g.downY)` (`:1159`), so a genuine press at client `(0,0)` (fullscreen, top-left pixel) is treated as "no press".
**T1 code + diff. Confidence: high.**

### D4 — Pointer-capture loss leaves the remote button stuck
`setPointerCapture` is called unconditionally (`:1102`), but there is **no** `onLostPointerCapture` and no window-level `pointerup` fallback. The only recovery paths are `pointerup` (`:1181`) and `pointercancel` (`:1201`), and cancel releases at the **original press point**, not the release point:

```tsx
// ScreenViewer.tsx:1205
if (g.dragging) { sendMouseAt('up', g.downX, g.downY, 0); g.dragging = false }
```

Second leak: `handlePointerUp` returns early for the two-finger case **before** any cleanup of `dragging` (`:1186-1189`), so a finger lifted mid-drag after a second finger touched leaves `dragging` true with no `up` sent until some later event clears it. Since the wire carries no button mask (§D12), the receiver cannot self-heal a missed `up`.
**T1 code. Confidence: high on the missing handlers; medium on how often capture is actually lost (browser-dependent).**

### D5 — A viewer without control permission gets a dead, unscrollable touch surface
Order of operations in `handlePointerDown`:

```tsx
// ScreenViewer.tsx:1102-1105
try { c.setPointerCapture(e.pointerId) } catch {}
pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
const g = gestureRef.current
if (!controlEnabled) return
```
Capture happens **before** the permission gate, and `touchAction: 'none'` is unconditional in the canvas style (`:2266`). Pinch-zoom of the stream is likewise gated (`:1105` returns before the two-finger branch at `:1126`). `controlEnabled` is only true after a control grant (`:762`). On the Android viewer the WebView additionally disables all page zoom — `SessionWebViewActivity.java:59-61` (`setSupportZoom(false)`, `setBuiltInZoomControls(false)`, `setDisplayZoomControls(false)`). Net effect: a view-only mobile user cannot scroll the page, cannot pinch the page, and cannot pinch the stream — the canvas is inert.
**T1 code. Confidence: high.**

### D6 — Pinch is a local CSS zoom, and touch has no way to scroll the remote
Pinch only mutates viewer state (`:1152-1155`) rendered as a CSS transform on the canvas (`:2270-2273`). Nothing is sent to the device. Two-finger pan pans the *view*, not the remote content. One-finger drag injects `down` + `move` (`:1173-1177`) — i.e. a left-button drag (rubber-band selection on Windows), **not** a scroll. There is no gesture that produces `scroll` / wheel, and no two-finger scroll. So on touch the remote desktop cannot be scrolled at all, and "pinch to zoom the remote app" (Ctrl+wheel) is unreachable.
**T1 code. Confidence: high.**

### D7 — Wheel and pointer use two different rects for the same coordinate space
```tsx
// ScreenViewer.tsx:1059  (wheel)
const r = canvas.getBoundingClientRect()
// ScreenViewer.tsx:1011-1017 (pointer path, via getContentRect/getPos)
const scale = Math.min(r.width / iw, r.height / ih) ...
return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h }
```
Today the canvas CSS box always preserves aspect (`canvasBox` computed from frame aspect, `:341-375`), so the letterbox correction is zero and the two agree. They diverge the moment the box is clamped — `maxWidth/maxHeight: '100%'` only in `fit` mode (`:2251-2252`) — or while `canvasBox` still holds the previous frame size after a resolution/monitor change (state updates in an effect, `:341-375`, frames keep arriving). Then wheel lands at a different remote point than clicks at the same screen pixel.
**T1 code. Confidence: high that the duplication exists; medium that it is currently user-visible (latent).**

### D8 — Out-of-range coordinates are dropped instead of clamped
```tsx
// ScreenViewer.tsx:1094
if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return
```
No event is sent at all — not a clamped one. Under zoom/pan, or in the letterbox margin, this produces silent dead zones. The annotation overlay on the same pixels does the opposite and clamps (`AnnotationLayer.tsx:54-55`: `Math.min(1, Math.max(0, …))`), so the two overlays disagree about the edge.
**T1 code. Confidence: high.**

### D9 — Double-send: `mouseenter` + first move, and an extra move per tap
```tsx
// ScreenViewer.tsx:2279
onMouseEnter={e => { setCursorVisible(true); if (controlEnabled) sendMouse('move', e) }}
```
`sendMouse` (`:1022-1026`) does **not** consult `moveThrottleRef`, and `mouseenter` is immediately followed by the first `pointermove`/`mousemove`, which sends the same position again through the throttled path (`:1162-1163`). Two identical `move` events per entry. On touch, the browser's synthetic `mouseenter` after a tap adds a `move` that no finger ever made, immediately before the `click` from `:1196` — one tap, two actions.
**T1 code. Confidence: high.**

### D10 — `handleMouseMove` is orphaned: the cursor overlays are now frozen
`handleMouseMove` is still defined at `:1028` but nothing references it — the only wiring, `onMouseMove={handleMouseMove}`, is deleted by the pending diff and replaced by pointer handlers (`:2275-2278`). It was the sole writer of both overlay states:

```tsx
// ScreenViewer.tsx:1033
setCursorPos({ x: e.clientX - r.left, y: e.clientY - r.top })
// ScreenViewer.tsx:1045
dot.style.transform = `translate(${e.clientX - box.left}px, ${e.clientY - box.top}px)`
```
Grep confirms `setCursorPos` has exactly one call site (`:1033`) and `localCursorRef` is only mutated at `:1045`/`:2280`. Result: the Android remote-cursor arrow (`:2328-2333`, positioned from `cursorPos`, initial `{x:-100,y:-100}` at `:229`) is pinned off-canvas in the top-left corner as soon as `onMouseEnter` sets `cursorVisible`, and the local dot (`:2242-2247`) never becomes visible.
**T1 code + grep. Confidence: high.**

### D11 — The annotation layer is not transformed with the canvas
`AnnotationLayer` is absolutely positioned at `100% × 100%` of the wrapper (`AnnotationLayer.tsx:111-118`) with `zIndex: 25`, while zoom/pan are applied **only** to the canvas (`:2270-2273`). When `viewZoom != 1`, pen strokes and eraser hits map to the wrong remote pixels (they normalize against the unscaled SVG rect, `AnnotationLayer.tsx:49-57`). With any tool active the SVG also has `pointerEvents: 'auto'` (`:117`), so remote input is swallowed — expected while annotating, but it means the new long-press right-click cannot fire in that mode.
**T1 code. Confidence: high.**

### D12 — No button mask and no modifier state on the wire
Payload is `{ type, x, y, button, deltaY }` (`:1025`, `:1095`; type at `packages/shared/src/types/messages.ts:92-99`). There is no `buttons` bitmask and no modifier flags, so: drag state exists only in the viewer's local state machine and is unrecoverable if one message is lost (§D4); Ctrl+click / Shift+click / Ctrl+wheel are not expressible in the mouse message — they only work if a separate `screen:key_event` happens to have left the modifier held on the agent.
**T1 code. Confidence: high on the schema; medium on user-visible impact (depends on keyboard mode being on).**

### D13 — Cross-boundary: the normalized math is right, but both agents ignore the monitor origin
The viewer's fraction math is self-consistent — this is *not* an absolute-pixel bug. The defect lives one hop away: monitors carry an origin,

```ts
// packages/agent/src/system/inputControl.ts:605-612 (MonitorInfo: x, y, width, height)
// Linux origin parsed at :640-650 -> x: parseInt(m[4]), y: parseInt(m[5])
function toAbsX(relX: number): number { return Math.round(relX * _screenW) }   // :116
function toAbsY(relY: number): number { return Math.round(relY * _screenH) }   // :117
```
`x/y` are never added. The Electron agent has the same shape: `capScreenW` from `dsp.size` only (`main.js:1303-1311`), then `SetCursorPos(xi,yi)` (`:1542`). Selecting a secondary monitor therefore injects into the **primary** display's coordinate space, offset by that monitor's origin.
**T1 code. Confidence: high for the code; symptom requires a multi-monitor setup.**

### D14 — Fit mode exists; `fill` crops without a mouse pan
Contrary to the brief's suspicion, fit mode is implemented: state `:158`, sizing effect `:341-375` (`Math.min` for `fit`, `Math.max` for `fill`), UI `:1705-1712`. Real defect inside it: `fill` deliberately oversizes the canvas (`:359`) while the area clips (`overflow-hidden`, `:2239`), and the only pan is the touch pinch-pan (`:1155`) which requires control permission (§D5). A mouse user in `fill` cannot reach the cropped edges at all.
**T1 code. Confidence: high.**

### D15 — Throttling is leading-edge only, move-only
`move` is throttled to 16 ms at `:1162` and `:1176`; `down`/`up`/`click` are never throttled (correct); **`scroll` is never throttled** (`:1056-1061`) despite producing one PowerShell command per event including a `SetCursorPos` (`main.js:1551`). No trailing flush: if the pointer stops or releases inside a 16 ms window, the final position is never sent, and no `move` is emitted on release — the remote cursor rests at the last sampled point while the local one rests at the release point. `getCoalescedEvents` is not used anywhere (grep: 0 hits).
**T1 code. Confidence: high.**

### D16 — Zoom origin drifts on the second pinch; reset is inconsistent
`setViewOrigin` is computed from the **already transformed** rect and then used as if it were pre-transform local space:
```tsx
// ScreenViewer.tsx:1136-1137
const r = c.getBoundingClientRect()
setViewOrigin({ x: g.midX - r.left, y: g.midY - r.top })
```
On the first pinch (zoom 1) the two spaces coincide; on a second pinch while `viewZoom != 1` the origin jumps by the current scale/pan. Related: `resetView` resets the origin (`:1098`) but the fit-mode effect resets only zoom and pan (`:1211`), and nothing resets on a monitor change or resolution change.
**T1 code. Confidence: medium-high.**

### D17 — Touch vs mouse is only partially distinguished
Present: long-press is touch-only (`:1111`), hover-move is mouse-only (`:1161`). Absent: `pointerType` is not consulted for pressure, `isPrimary`, or palm rejection; a pen is treated as a mouse; `pointerId` bookkeeping assumes at most two meaningful pointers; the legacy `onMouseEnter`/`onMouseLeave` compat events still fire alongside pointer events and are treated as independent input (§D9).
**T1 code. Confidence: high.**

### D18 — `dblclick` is supported by every receiver but never sent
`main.js:1547` implements `dblclick`; `inputControl.ts:168,200` do too; the viewer has no double-click detection and emits at most a pair of `click`s (`:1196`). Double-click therefore depends on OS timing across the network — works on a fast link, flaky on a slow one.
**T1 code. Confidence: medium (behavioural, link-dependent).**

### D19 — Dead legacy surface left behind
After the patch, the old mouse helpers are half-orphaned: `sendMouse` (`:1022`) is reachable only from `onMouseEnter`; `handleMouseMove` (`:1028`) is unreachable (§D10); `getPos` (`:1018`) only serves `sendMouse`. Two coordinate implementations now coexist (§D7) and only one of them is exercised by the main path — a maintenance trap, not a user-visible bug today.
**T1 code. Confidence: high.**

---

## 3. Corrections to the brief's suspected defects

| Suspected | Verdict | Basis |
|---|---|---|
| Wrong absolute mapping | **Not on the viewer side.** Payload is normalized; the receiver scales it. Real mapping faults are monitor-origin loss (§D13) and dropped out-of-range coords (§D8). | `:1088-1096`, `inputControl.ts:116-117`, `main.js:1533-1534` |
| Missing button state | **Confirmed** — no `e.button`, no `buttons` mask (§D2, §D12). | grep over `:1068-1212` = 0 hits |
| Missing drag | **Not missing** — drag added at `:1169-1178`; the defect is that press is deferred 6 px (§D3) and cancel releases at the wrong point (§D4). | `:1169-1178`, `:1205` |
| Missing right click | **Confirmed for mouse** (§D2); present for touch via 550 ms long-press. | `:2281`, `:1196`, `:1119-1120` |
| Missing wheel | **Present but broken** — magnitude contract (§D1); unthrottled (§D15). | `:1060`, `main.js:1550` |
| No pinch/zoom | **Partially false** — local view pinch exists (`:1152-1155`) but is control-gated and never reaches the device (§D5, §D6). | `:1105`, `:1152` |
| No fit mode | **False** — fit/fill/actual implemented (`:158`, `:341-375`, `:1705-1712`). `fill` cropping is the real issue (§D14). | `:359`, `:2239` |
| Pointer capture loss | **Confirmed** — capture set, nothing handles loss (§D4). | `:1102`, no `onLostPointerCapture` |
| Double-send | **Confirmed** — enter+move (§D9); tap emits an extra move. | `:2279`, `:1162` |

---

## 4. Open items (not proven here)

1. **Does `screen:mouse_event` ever arrive with the wrong role?** The server rejects non-`manager` with `screen:error` (`screenHandler.ts:198-206`), but the viewer's `sendMouseAt` never checks role, only `controlEnabled`. Not reproduced — worth a check whether a granted session can outlive a role downgrade.
2. **`setPointerCapture` behaviour on iOS Safari for multi-touch.** The `try/catch` at `:1102` suggests it throws there; if it does, `pointerup` outside the canvas is lost and §D4 becomes reachable in normal use. Needs a device test.
3. **Monitor id ↔ display index coupling.** `updateCapSize(monitorId)` indexes `screen.getAllDisplays()` by the raw id (`main.js:1305-1307`). If the agent's advertised monitor ids are not that array's indices, the scale factor comes from the wrong display. Not traced — the monitor-list builder was not read in full.
4. **`deltaMode` in real clients.** `deltaY = 100` per notch is assumed from Chromium; not measured on this build.
5. **Whether `fill` actually oversizes in a given viewport** — depends on `canvasBox` vs area size at runtime; code path is clear, no screenshot taken.

---

## 5. Suggested next step (diagnosis only)

Instrument one tap and one wheel notch end to end (viewer `console.debug` of `{type,x,y,button,deltaY}` → server relay → agent `xi,yi,wd`) on the shipped Electron agent with a 2× DPI secondary monitor. That single trace settles D1's magnitude, D13's origin loss, and D3/D9's event counts at once, and turns the five open items into either confirmed defects or closed ones.
