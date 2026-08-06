# CONTEXT.md — TubePark Domain Model

## Ubiquitous Language

### Core Problem
- **Visual Context Loss**: The degradation of ability to recognise what a tab contains once the tab bar overflows (~20+ tabs), titles truncate, and thumbnails vanish. This — not raw RAM — is the primary enemy.
- **Mental Clutter**: Cognitive load from a horizontal, unorganised tab mess versus a vertical, contextual list.
- **Tab Discard (Chrome native)**: Chrome's built-in background-tab memory reclaim. Tabs stay in the tab bar (still visually noisy) but consume ~0 RAM until clicked, at which point they "wake" and re-consume RAM.

### Value Proposition
TubePark is a **Frictionless Visual Scratchpad** for YouTube: it converts a horizontal tab-bar mess into a vertical, thumbnail-rich, contextual queue. RAM saving is a side-effect bonus, not the headline feature.

### Entities
- **Parked Video**: A minimal metadata record (id, title, channel, addedAt, optional pinned, optional resumeAt) captured from a YouTube tab/link. It is a *Queue* item, NOT a history/log entry. `resumeAt` (seconds) is set only when parking a mid-watch tab; hover/context-menu park leave it undefined.
- **TubePark Queue**: The active, temporary to-watch list stored in `chrome.storage.local` under `tubepark_queue`. No archive.
- **Collection**: An optional, exactly-one-per-video user label that acts as a lens over the Queue. It is not a container: items remain Queue members, pinning stays orthogonal, and “All” always sees the whole Queue. Collections are derived from item labels rather than stored as separate entities.

> Originally specified as a *pure* queue whose only organizing axis was recency. ADR-0005 (2026-07-26) amends this to permit user-controlled organization — collections/tags, alternative groupings, manual ordering, search — while keeping "no archive, no history, no `watched` flag" binding and keeping Park itself a zero-decision action. That ADR fixed the direction; Collection now means an optional exactly-one label, while grouping and pinned ordering remain orthogonal views over the Queue.

> Auto-expire (a `Settings` entity, `chrome.alarms` sweep, `autoExpireDays`) was designed in ADR-0002 but never implemented — see that ADR's Superseded note. There is currently no time-based auto-removal; `Older` (age > 7 days) is a Side Panel display grouping only, with a manual "Remove all" bulk-remove action, not automatic deletion.

### Thumbnail Strategy
- Thumbnails are NEVER stored (no Base64) — resolved dynamically via `https://img.youtube.com/vi/{id}/mqdefault.jpg`.
- Trade-off accepted: thumbnails require network. Offline → text metadata (title/channel) still readable, so visual context is partially retained.
- UI must `<img onerror>` → elegant placeholder (channel initial / play icon). Covers offline + deleted/private video 404s.

### Lifecycle (Parked Video)
`Created (Parked)` → `Stored` → `Removed (explicit, manual)`

A Parked Video is removed from storage entirely only via explicit user action in the Popup or Side Panel (single remove, or the bulk "Remove all" on `Older`). There is no automatic deletion on watch-completion or on age — YouTube SPA makes completion detection unreliable (skip/retab/close), and auto-expire (see above) was never built. Deliberately NO `watched` flag, NO history collection (recreates YouTube native History = redundant + bloat).

A Parked Video MAY carry a `pinned` flag (per-item, multi-allowed). Pinned items are sticky-sorted into the Side Panel's `Up Next` group with an accent border/background and a filled pin icon. Multiple concurrent pinned items are valid.

### Stored vs Visible (Pending Removal)
A removal in the Side Panel is a **grace-period request**, not an immediate commit. For 5 seconds the doomed video is **Stored** (still in `chrome.storage.local`) but not **Visible** — it is filtered out of every display read. This fixes the four old optimistic-delete bugs (two were deterministic data loss); see ADR-0005's lineage and `docs/spec/g5-undo-model.md`.

- **Pending Removal**: a single slot (`{ videos, requestedAt }`, 1 or N items) owned by the **background** service worker — never by the panel. The background holds the slot, runs the 5s `setTimeout`, and commits (writes the removal) only when the timer elapses. Closing the Side Panel mid-window still commits, because the timer is not the panel's.
- **Undo**: a cancel message (`CANCEL_REMOVE`). It writes nothing — the video was never removed from storage — so undo can never fail and never hits the capacity cap. Requesting a second removal while one is pending **commits the first** (it is not silently cancelled).
- **`getQueue` (Visible)** vs **`getRawQueue` (Stored)**: a split seam in `src/shared/storage.ts`. Display readers (popup, side panel, capacity meter, park cap-check) go through `getQueue`, which filters pending. Read-modify-write callers (park, togglePin, commit) use `getRawQueue` so a pending-deleted item is never silently dropped from storage. The background is the single writer; all mutations route through it to avoid cross-context write races.
- **Undo wins over the cap**: a restored video may temporarily push the queue to 201/200. `ParkMeter` already clamps the bar (`Math.min(1, count/max)`); only the banner text must report the honest count. A *new* park is still rejected at the cap (checked against the Visible count), but restoring something that legitimately existed is never rejected.

### Queue Capacity
- **maxQueueSize: 200** (hard cap). Large enough for a week of hunting, tight enough to force curation sessions.
- **Safe** (<80% / <160): normal UI.
- **Warning** (>=80%): yellow banner "Queue hampir penuh" in Popup & Side Panel.
- **Full** (100%): a forced Park attempt (hover button or context menu) is rejected and surfaces an in-page toast ("Queue penuh (200/200)! Hapus video lama dulu.") rather than a native `chrome.notifications` alert.

### UI Surfaces
- **Popup**: Fast-action surface (default click). Park/close tabs, quick view of recent items.
- **Side Panel**: Persistent review/workspace surface. Stays open across tab switches. Time-based grouping, one-in-one-out playback.

### Tab Operations Seam
- All `chrome.tabs`/`chrome.windows`/`chrome.sidePanel` interactions are behind the **TabOperations** interface (`src/shared/tab-operations.ts`).
- **Interface**: `getActiveTab()`, `getWatchTabs()`, `closeTab(id)`, `openVideo(videoId)`, `openSidePanel()`.
- **`openVideo`** encapsulates the one-in-one-out playback strategy (reuse existing YouTube tab or create new).
- **`openSidePanel`** throws if `chrome.sidePanel` is unavailable — no silent guard, since side panel is a core UX surface.
- **Two adapters**: `RealTabOperations` (production, wraps `chrome.*`) and `TestTabOperations` (test double with call recording + configurable returns). Per the codebase-design principle: "one adapter = hypothetical seam, two = real."
- **Consumers**: Popup, Side Panel, grouping (via `openVideo`), and Background all cross the same seam instead of scattering 14+ direct `chrome.*` calls.

### Capture Mechanisms
- **Context Menu Capture**: Right-click a YouTube video **link** on a YouTube page → "Park This Video". Scoped via `contexts: ["link"]` + `targetUrlPatterns` (watch / youtu.be / shorts) on the link URL **and** `documentUrlPatterns: ["*://*.youtube.com/*"]` on the page URL, so the menu only appears where a content script is loaded and can actually park — never on blank space, never on YouTube links in other sites (silent-fail closure). See ADR-0001 (+ its G3 Correction). Card-miss fallback reads channel via `resolveWatchPageChannel()` (same as tab-park).
- **Hover-to-Park Capture**: A single floating button, portaled to `<body>` and positioned via `elementsFromPoint`, tracks whichever video card the pointer is over (primary driver, MVP). Geometry-based tracking survives YouTube's hover-preview portal, which breaks a naive CSS `:hover` approach — see `src/entrypoints/content.ts`.
- **Tab-Park Capture** (popup current/all): content script `GET_TAB_META` returns `{ channel, currentTime }` from the watch-page DOM — no network, no new permissions. Channel fallback is `'YouTube'` (F9-3 "Unknown channel"). `currentTime > 0` becomes `resumeAt`; play builds `?v=ID&t=N` via `openVideo(id, resumeAt)`.
- **Watch-page Park & Close Capture** (F10): on `/watch?v=` the main-video button mounts inline in YouTube's `ytd-watch-metadata ytd-menu-renderer`, immediately before the overflow menu; on `/shorts/{id}` it mounts icon-only in `reel-action-bar-view-model` after Share and before sound/pivot. The mount adapter lives in `src/shared/watch-page-mount.ts`; it chooses label → icon → hidden from actual available space, rejects sibling-rect overlap, inherits YouTube's native row text color (with a dark-safe fallback), and has no `position: fixed` fallback, so live-chat/player controls remain clickable. Sibling to Hover-to-Park (which park-onlys hovered sidebar cards); captures `videoId` from the URL, `title` from `document.title`, `channel` via `resolveWatchPageChannel()`, and `resumeAt` from `readMainVideoCurrentTime()` read **locally at click time** (no `GET_TAB_META` round-trip — the content script IS the reader). One click parks then relays to the background (`PARK_AND_CLOSE_TAB`), which calls `chrome.tabs.remove(sender.tab.id)` on success/duplicate (full → no close + toast). 1-click, no confirm, no undo; the queue + `resumeAt` is the safety net. A filled/accented pin marks an already-parked video (cosmetic — click always park+close, never unpark). SPA navigation, DOM mutation, and resize re-resolve the mount. See `src/entrypoints/content.ts` `WatchPageParkButton`.

> There is no keyboard shortcut. An early design had "hover + `P`" as the primary driver (still described that way in ADR-0001); it was replaced by the floating button and never implemented. The stale `P` copy has since been removed from the Popup and Side Panel (G1 in `docs/ROADMAP.md`).
