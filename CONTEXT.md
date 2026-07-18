# CONTEXT.md — TubePark Domain Model

## Ubiquitous Language

### Core Problem
- **Visual Context Loss**: The degradation of ability to recognise what a tab contains once the tab bar overflows (~20+ tabs), titles truncate, and thumbnails vanish. This — not raw RAM — is the primary enemy.
- **Mental Clutter**: Cognitive load from a horizontal, unorganised tab mess versus a vertical, contextual list.
- **Tab Discard (Chrome native)**: Chrome's built-in background-tab memory reclaim. Tabs stay in the tab bar (still visually noisy) but consume ~0 RAM until clicked, at which point they "wake" and re-consume RAM.

### Value Proposition
TubePark is a **Frictionless Visual Scratchpad** for YouTube: it converts a horizontal tab-bar mess into a vertical, thumbnail-rich, contextual queue. RAM saving is a side-effect bonus, not the headline feature.

### Entities
- **Parked Video**: A minimal metadata record (id, title, channel, addedAt) captured from a YouTube tab/link. It is a *Queue* item, NOT a history/log entry.
- **TubePark Queue**: The active, temporary to-watch list stored in `chrome.storage.local` under `tubepark_queue`. Pure queue — no archive.
- **Settings**: User preferences stored under `tubepark_settings` (autoExpireDays, closeTabsOnPark, maxQueueSize).

### Expiry Mechanism
- **Trigger**: `chrome.alarms` (`tubepark-expire-sweep`, `periodInMinutes: 60`) — NOT `setInterval` (MV3 SW is ephemeral, terminates <5 min idle). Alarms survive SW termination.
- **Double-guard**: also run sweep on Popup/Side Panel `onMount` to cover laptop sleep gaps.
- **Semantics**: absolute age = `Date.now() - addedAt > autoExpireDays*86400000`. No "last seen" — would need extra field, contradicts lightweight.

### Thumbnail Strategy
- Thumbnails are NEVER stored (no Base64) — resolved dynamically via `https://img.youtube.com/vi/{id}/mqdefault.jpg`.
- Trade-off accepted: thumbnails require network. Offline → text metadata (title/channel) still readable, so visual context is partially retained.
- UI must `<img onerror>` → elegant placeholder (channel initial / play icon). Covers offline + deleted/private video 404s.

### Lifecycle (Parked Video)
`Created (Parked)` → `Stored` → `Watching` → `Deleted (Done | Removed | Expired)`

A Parked Video is removed from storage entirely when:
- **Done / Removed** (explicit manual triage in Side Panel), or
- **Expired** (exceeds `autoExpireDays`).

There is NO automatic deletion on watch-completion — YouTube SPA makes completion detection unreliable (skip/retab/close). Deletion on watch is always explicit user action. Deliberately NO `watched` flag, NO history collection (recreates YouTube native History = redundant + bloat).

A Parked Video MAY carry a `watching` flag (per-item, multi-allowed). `watching` items are sticky-sorted to the top of the Side Panel with a badge + highlight. Multiple concurrent `watching` items are valid (user may open several tabs).

### Queue Capacity
- **maxQueueSize: 200** (hard cap). Large enough for a week of hunting, tight enough to force curation sessions.
- **Safe** (<80% / <160): normal UI.
- **Warning** (>=80%): yellow banner "Queue hampir penuh" in Popup & Side Panel.
- **Full** (100%): new Park disabled (shortcut + context menu). Forced attempt → `chrome.notifications` "TubePark Full!".

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
- **Context Menu Capture**: Right-click YouTube video **link** → "Park This Video". Scoped via `contexts: ["link"]` + `targetUrlPatterns: ["*://*.youtube.com/watch*"]` so it only appears on YouTube watch links, never blank space.
- **Shortcut Capture**: Hover video card + press `P` (primary driver, MVP). Content-script keydown guard: ignore when focus is in `input/textarea/[contenteditable]`, and only fire when `:hover` resolves to a YouTube video-card wrapper (`ytd-rich-item-renderer` etc.). Prevents false capture while typing "P" in search/comments.
