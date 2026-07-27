import type { ParkedVideo } from "./types";

/**
 * G5 — Grace-period removal model (pure reducer).
 *
 * The Side Panel's old optimistic-delete lived inside `.svelte` and produced
 * four bugs (two deterministic data-loss). This module is the testable seam: a
 * pure state machine for pending removals, with no browser, no timers, no DOM.
 * The background service worker and the panel are thin shells over it.
 *
 * Invariant: a pending-deleted video is **never removed from storage** during
 * the grace window. It is only hidden from display readers via `visibleQueue`.
 * Undo therefore never writes anything and can never fail (D1). The background
 * commits (writes the removal) only when the 5s timer elapses.
 *
 * `ParkedVideo` identity is `id`; items are compared by id, never by reference.
 */

/** One pending removal slot. Always a list — 1 item for a single delete, N for
 * bulk "Hapus Semua". A single code path means the single/bulk undo bug (#1)
 * cannot exist structurally (D6). */
export interface PendingRemoval {
	videos: ParkedVideo[];
	requestedAt: number;
}

export type PendingRemovalState = PendingRemoval | null;

/** Result of requesting a new removal while a slot may already be pending. */
export interface RequestRemovalResult {
	/** Ids the background must remove from storage *now* — the previously-pending
	 * slot, superseded by this new request. Empty when there was no prior slot.
	 * This is the structural fix for bug #2: requesting B while A is pending
	 * commits A permanently instead of silently cancelling A's timer. */
	commitNow: string[];
	/** The new pending slot. */
	state: PendingRemoval;
}

/**
 * Request a removal. If a slot was already pending, the old slot is superseded:
 * its ids are returned in `commitNow` so the background commits them
 * immediately, and the new slot becomes the sole pending (D2). This replaces
 * the old `clearTimeout(timerA)` that silently dropped A.
 */
export function requestRemoval(
	state: PendingRemovalState,
	videos: ParkedVideo[],
	now: number = Date.now(),
): RequestRemovalResult {
	const commitNow = state ? state.videos.map((v) => v.id) : [];
	return { commitNow, state: { videos, requestedAt: now } };
}

/**
 * Undo: discard the pending slot. Returns `null`. Nothing is written to
 * storage — the videos were never removed, so restoring can never hit the cap
 * and can never fail (D1, D5).
 */
export function cancelRemoval(): PendingRemovalState {
	return null;
}

/**
 * The grace-period timer elapsed. Returns the ids the background must remove
 * from storage now. Empty if there is no pending slot (defensive).
 */
export function commitRemoval(state: PendingRemovalState): string[] {
	return state ? state.videos.map((v) => v.id) : [];
}

/**
 * Read-for-display: filter the pending-deleted ids out of the raw queue. Every
 * display reader (popup, side panel, capacity meter, park cap-check) goes
 * through this so a pending deletion is a *global* fact — no call-site can
 * forget to filter (D4).
 *
 * The raw queue (storage truth, including pending items) is what
 * read-modify-write callers must use — see `getRawQueue` in `storage.ts`.
 * Filtering on a read-modify-write would silently drop pending items (D4
 * jebakan).
 */
export function visibleQueue(
	raw: ParkedVideo[],
	state: PendingRemovalState,
): ParkedVideo[] {
	if (!state) return raw;
	const pendingIds = new Set(state.videos.map((v) => v.id));
	return raw.filter((v) => !pendingIds.has(v.id));
}

/** How many items the current pending slot hides. Drives the honest toast count
 * (G6 absorbed): `1 ? 'Video dihapus' : '{n} video dihapus'`. */
export function pendingCount(state: PendingRemovalState): number {
	return state ? state.videos.length : 0;
}