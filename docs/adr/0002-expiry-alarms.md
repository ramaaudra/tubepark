# ADR 0002: Use `chrome.alarms` (not `setInterval`) for Expiry Sweep

## Status
Superseded (2026-07-20) — auto-expire was never implemented. The shipped MVP relies on manual removal only (single-item and the Side Panel's "Remove all" bulk action on `Older`); no `chrome.alarms`, `autoExpireDays`, or `tubepark_settings` exists in the codebase. This ADR is kept for the record of the original design rationale should auto-expire be revisited.

## Context
Auto-expire must run periodically to delete Parked Videos older than `autoExpireDays`. MV3 service workers are ephemeral — Chrome terminates them after ~30-90s idle. A `setInterval` inside the SW is destroyed on termination and never fires.

## Decision
Schedule expiry via `chrome.alarms.create("tubepark-expire-sweep", { periodInMinutes: 60 })`, handled in `chrome.alarms.onAlarm`. Alarms are owned by the browser engine and wake the SW on fire. Add a secondary sweep on Popup/Side Panel `onMount` to cover long laptop sleep.

## Consequences
- Expiry is reliable despite SW termination.
- Absolute-age semantics (`Date.now() - addedAt`): no "last seen" field needed.
- Cost: a SW wake every 60 min (negligible).

## Alternatives considered
- `setInterval` in SW: unreliable, discarded by termination.
- `chrome.idle` API: fires on idle/active transitions, not fixed cadence; insufficient alone.
