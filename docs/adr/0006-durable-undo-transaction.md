# ADR 0006: Persist the Pending Undo Transaction

## Status

Accepted — 2026-08-21

## Context

TubePark intentionally keeps a removed video in `chrome.storage.local` for five
seconds so Undo cannot fail because the queue is full. The pending slot used to
live only in service-worker memory. A worker restart could therefore lose the
timer and leave the item visible again without a durable record of what the
user had just requested.

The same slot is also touched by Side Panel, Popup, and YouTube content-script
messages. An unqualified cancel message could cancel a newer request after a
stale surface remained open.

## Decision

Persist one pending transaction under `tubepark_pending_removal`:

```ts
{
  operationId: string,
  owner: "popup" | "sidepanel" | "content",
  videos: ParkedVideo[],
  requestedAt: number,
  expiresAt: number
}
```

Each `videos` entry is matched for removal by the stable `(id, addedAt)` pair,
not by `id` alone. This prevents a delayed UI request or expiry recovery from
deleting a later re-park of the same video.

The absolute `expiresAt` is authoritative. A five-second timer provides the
normal fast path while the worker is alive; `chrome.alarms` and service-worker
startup reconciliation provide a recovery path when the worker is restarted or
the device wakes. All pending transitions and queue writes are serialized by
the background `MutationQueue`; a new request resolves its targets against the
raw queue inside that queue and persists queue + pending together.

`CANCEL_REMOVE` and `COMMIT_PENDING` must carry the current `operationId` and
surface owner. The background validates the declared owner against the trusted
sender context; missing or mismatched owners fail closed. Messages from an
older or different surface become no-ops when the slot has changed. The queue
remains globally filtered while the Undo summary is only exposed to the owning
surface. Broadcasts do not include the operation ID, so unrelated surfaces
cannot use a notification as a commit/cancel capability.

## Consequences

- Undo keeps the existing grace-period semantics and remains write-free.
- A worker restart can commit an expired request instead of silently losing it.
- A pending transaction is local-only and is removed on commit or Undo.
- `alarms` is an additional low-risk permission and must be justified in the
  Web Store listing and privacy policy.
- The five-second experience remains best-effort during worker/device sleep;
  the persisted deadline guarantees reconciliation, not an exact wake time.

## Alternatives considered

- **Memory-only pending state:** rejected because service-worker lifetime is not
  a durable boundary.
- **`chrome.storage.session`:** rejected because it is cleared when the browser
  closes, while this transaction already belongs to the local queue's durable
  lifecycle.
- **Immediate delete plus restore journal:** rejected because Undo could fail
  when restoring into a full queue and would change the established domain
  contract.
- **Per-item tombstones:** rejected because they change the one-slot policy and
  introduce a sweep/migration model that is larger than the problem.
