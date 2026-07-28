# ADR 0005: Lightweight Organization Over a Strictly Flat Queue

## Status
Accepted (2026-07-26) — direction only. The concrete mechanism (term, data shape, UI) is deliberately left open; see "Deferred to design" below. No code has been written against this ADR yet.

## Context
`CONTEXT.md` framed the TubePark Queue as a **pure queue — no archive**, with exactly one organizing axis: recency, expressed as the Side Panel's `Up next` / `Recent` / `Older` grouping, plus a binary `pinned` flag. That was the right MVP shape: it kept the storage record at four fields, kept the reducers pure, and avoided rebuilding a bookmark manager.

Two pressures have surfaced against it.

**A queue at scale is not scannable.** `maxQueueSize` is 200. At that size, recency is a weak organizing principle — a user hunting for "that Rust talk I parked last week" has no route to it other than scrolling. The Side Panel offers no search, no filter, and no grouping the user controls. The product's stated enemy is **Visual Context Loss**; a 200-item flat list re-creates that loss inside the very surface built to cure it.

**Recency does not match how parking actually happens.** Parking is bursty and topical — a user parks six videos from one channel during one hunt, then six unrelated ones the next day. Sorting strictly by `addedAt` interleaves nothing (the burst stays contiguous) but also expresses nothing: the fact that those six belong together is visible only by accident of timestamp adjacency, and is destroyed the moment anything is parked between them.

The counter-pressure is real and still holds: TubePark is valuable *because* it is frictionless. Any organization scheme that demands a filing decision at park time reintroduces the friction that bookmarks already lose on.

## Decision
The Queue may carry **user-controlled organization** beyond recency. Specifically, the domain now permits:

- an organizing dimension the user assigns to items (working name: **Collection** / **Tag** — term not yet fixed),
- alternative groupings of the same items (e.g. by channel),
- a user-controlled sort order (manual reorder),
- search and filter over the Queue.

Three constraints bound this, and they are the reason this ADR is a narrowing rather than an opening:

1. **Organization is optional and post-hoc.** Parking stays one click with zero decisions. An unorganized item is a first-class item, never a "needs filing" one. Any UI that nags for classification at capture time violates this ADR.
2. **No archive, no history, no `watched` flag.** This ADR does **not** reverse those. Collections organize the *live* Queue; they are not folders you move things into to keep them forever. Removal stays explicit and manual, and items in a collection are subject to the same 200-item cap as everything else. YouTube's native History remains the history feature.
3. **Organization is metadata, not storage growth.** The lightweight mandate (ADR-0003) still binds. Whatever shape this takes stays small scalar/string data on the existing record or a small sibling key — no denormalized copies of items, no images.

### What this supersedes
`CONTEXT.md`'s "Pure queue — no archive" is amended to "no archive, but organization is permitted." The "Deliberately NO `watched` flag, NO history collection" clause is **unchanged and still binding**.

## Deferred to design
These are open on purpose. Each is to be resolved by a grilling session before implementation, not by this ADR:

- **Term.** `Collection` vs `Tag` vs `Label` vs `Folder`. These are not synonyms in a ubiquitous language: a tag is many-per-item and additive; a collection implies containment and often one-per-item; a folder implies a move (and therefore an archive, which constraint 2 forbids). Picking the wrong noun will bend the implementation toward the wrong semantics. One term must win and enter `CONTEXT.md`.
- **Cardinality.** One-per-item or many-per-item.
- **Ordering precedence.** This is the sharpest open problem. Manual reorder, time grouping, channel grouping, and collection grouping all compete for a single axis: the order of the Side Panel list. They cannot all be simultaneously authoritative. A precedence model (or a mode switch) must be decided before any of the four ships, or the first one shipped will silently constrain the other three.
- **Where `pinned` lands.** If collections exist, `pinned` may be a degenerate collection ("Up Next") rather than a separate flag — or it may stay orthogonal. Deciding this late risks two overlapping mechanisms for the same user intent.

> **Update 2026-07-27** — the F8 grilling (`docs/grilling/f8-collections.md`)
> resolved three of the four above: **Term** = Collection (with an explicit
> anti-containment clause); **Cardinality** = exactly-one-or-none; **Where `pinned`
> lands** = orthogonal, stays a separate flag. **Ordering precedence** is partially
> resolved: F8 settled that *collection filters* (orthogonal, does not compete for
> the display axis) while *grouping* (time vs channel) competes and becomes a
> switchable strategy — but manual reorder (F7) still competes and is not yet
> grilled. See F8-9 in that document.
>
> **Update 2026-07-27 (F7)** — the F7 grilling (`docs/grilling/f7-drag-reorder.md`)
> resolves **ordering precedence** in full: *collection filters* (F8, orthogonal),
> *manual reorder* is restricted to Up Next only so it does NOT compete with
> grouping (F7-1), and *grouping* is a switchable strategy (F8-9). The three axes
> are now non-conflicting: **filter → group → order-within-group**. One caveat
> carried forward: cross-group reorder remains forbidden; should it ever be wanted,
> F7-1 must be reopened.

## Consequences
- The `ParkedVideo` record grows past four fields. `storage.ts` has no schema-version or migration layer today; it casts `chrome.storage.local` output directly (`getQueue`). Additive optional fields are backward-compatible with existing installs; anything requiring a rewrite of stored records is not, and would need a migration seam that does not yet exist.
- `groupAndSortVideos` currently hard-codes one grouping (recency, `pinned` sticky-sorted to the top) and returns a fixed three-bucket shape. Supporting alternative groupings means that function becomes a strategy rather than a single algorithm — a real interface change to a well-tested pure module.
- The Side Panel gains modes/controls, which is UI weight on a surface whose current virtue is that it has almost none. Each control must earn its place.
- Reversal cost is asymmetric: adding an optional field is cheap to abandon; teaching users a filing model and then removing it is not. This is why the ADR permits the direction but fixes no mechanism.
- Accepting this makes TubePark structurally closer to a bookmark manager. The defence is constraint 1 (no filing at capture) and constraint 2 (no archive) — if either erodes, the product's differentiation erodes with it. Future ADRs should treat those two as the tripwires.

## Alternatives considered
- **Keep the flat queue; solve scannability with search only.** Cheapest, and genuinely covers "find that one video." Rejected as the whole answer because search is a retrieval tool, not an organizing one — it helps when you know what you want and does nothing for triage, which is the Side Panel's stated job. Search is still being built (it is complementary, not a substitute).
- **Lower `maxQueueSize` to force curation.** Treats the symptom by shrinking the problem. Rejected: the 200 cap was chosen deliberately as "a week of hunting," and shrinking it trades a real capability for an organizing shortcut.
- **Auto-organize by channel with no user input.** Zero friction, no new stored field (channel is already on the record). Rejected as the *only* mechanism because it is not user-controlled — a user's mental grouping is topical ("interview prep"), not by publisher. Retained as an additional grouping view, which is exactly how it is scoped in the roadmap.
- **Revive auto-expire (ADR-0002) instead.** Keeps the queue small automatically, so organization matters less. Rejected as a substitute: time-based deletion is a retention policy, not an organizing one, and it was already superseded once for good reasons. Not reopened here.
