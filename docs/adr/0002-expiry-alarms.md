# ADR 0002: Use `chrome.alarms` (not `setInterval`) for Expiry Sweep

## Status
Superseded (2026-07-20) — auto-expire was never implemented. The shipped MVP relies on manual removal only (single-item and the Side Panel's "Remove all" bulk action on `Older`). `chrome.alarms` is now used only as the lifecycle recovery safety-net for pending Undo transactions; see [ADR 0006](0006-durable-undo-transaction.md). This ADR is kept for the record of the original auto-expire design rationale should that feature be revisited.

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
