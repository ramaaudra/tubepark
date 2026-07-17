# ADR 0001: Context Menu Scoping via `link` + `targetUrlPatterns`

## Status
Accepted (2026-07-17)

## Context
MV3 `chrome.contextMenus` are static and global — they cannot be scoped to a specific DOM element (e.g. only `ytd-thumbnail`). A naive menu would appear on every right-click, including blank YouTube space, producing a confusing UX and false captures.

## Decision
Register the "Park This Video" menu with `contexts: ["link"]` and `targetUrlPatterns: ["*://*.youtube.com/watch*"]`. The menu therefore appears **only** when the right-click target is a link pointing at a YouTube watch URL. Shortcut Capture (hover + `P`) is the primary driver; context menu is a validated secondary path. Invalid captures (non-watch links) are impossible by construction.

## Consequences
- No runtime URL validation needed in `onClicked` for scope (only for safety).
- Blank-space and non-video right-clicks never show the menu → clean browser UI.
- Hard to reverse: this binds capture UX to manifest API constraints; changing to a DOM-scoped menu would require a content-script-injected custom menu (heavier).

## Alternatives considered
- DOM-scoped custom menu via content script injection: more control but adds content-script weight + maintenance, contradicting lightweight goal.
- Global menu + validate in handler: works but pollutes right-click UI on every YouTube page.
