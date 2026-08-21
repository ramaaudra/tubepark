import type { ParkedVideo } from "./types";

/** The user-facing grace period. Timers are only an accelerator; the absolute
 * expiry is persisted so a restarted service worker can reconcile safely. */
export const PENDING_REMOVAL_GRACE_MS = 5000;

export type PendingRemovalOwner = "popup" | "sidepanel" | "content";
export const DEFAULT_PENDING_REMOVAL_OWNER: PendingRemovalOwner = "sidepanel";

/** Stable identity captured when a removal is requested. The video id alone is
 * not enough: a stale UI request must never remove a later re-park of the same
 * YouTube video. */
export interface PendingRemovalTarget {
	id: string;
	addedAt: number;
}

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
 * `ParkedVideo` removal identity is the `(id, addedAt)` pair; references are
 * never compared, so a later re-park with the same id remains distinct.
 */

/** One pending removal slot. Always a list — 1 item for a single delete, N for
 * bulk "Remove all". A single code path means the single/bulk undo bug (#1)
 * cannot exist structurally (D6). */
export interface PendingRemoval {
	operationId: string;
	owner: PendingRemovalOwner;
	videos: ParkedVideo[];
	requestedAt: number;
	expiresAt: number;
}

export type PendingRemovalState = PendingRemoval | null;

/** Result of requesting a new removal while a slot may already be pending. */
export interface RequestRemovalResult {
	/** Exact targets the background must remove from storage *now* — the previously-pending
	 * slot, superseded by this new request. Empty when there was no prior slot.
	 * This is the structural fix for bug #2: requesting B while A is pending
	 * commits A permanently instead of silently cancelling A's timer. */
	commitNow: PendingRemovalTarget[];
	/** The new pending slot. */
	state: PendingRemoval;
}

/**
 * Request a removal. If a slot was already pending, the old slot is superseded:
 * its exact targets are returned in `commitNow` so the background commits them
 * immediately, and the new slot becomes the sole pending (D2). This replaces
 * the old `clearTimeout(timerA)` that silently dropped A.
 */
export function requestRemoval(
	state: PendingRemovalState,
	videos: ParkedVideo[],
	now: number = Date.now(),
	operationId: string = createOperationId(now),
	owner: PendingRemovalOwner = DEFAULT_PENDING_REMOVAL_OWNER,
): RequestRemovalResult {
	const commitNow = state ? state.videos.map(toPendingRemovalTarget) : [];
	return {
		commitNow,
		state: {
			operationId,
			owner,
			videos,
			requestedAt: now,
			expiresAt: now + PENDING_REMOVAL_GRACE_MS,
		},
	};
}

export function toPendingRemovalTarget(video: ParkedVideo): PendingRemovalTarget {
	return { id: video.id, addedAt: video.addedAt };
}

function targetKey(target: PendingRemovalTarget): string {
	return `${target.id}\u0000${target.addedAt}`;
}

export function matchesPendingRemovalTarget(
	video: ParkedVideo,
	target: PendingRemovalTarget,
): boolean {
	return video.id === target.id && video.addedAt === target.addedAt;
}

/** Resolve request targets against one raw queue snapshot. */
export function resolvePendingRemovalTargets(
	rawQueue: ParkedVideo[],
	targets: PendingRemovalTarget[],
): ParkedVideo[] {
	const targetKeys = new Set(targets.map(targetKey));
	return rawQueue.filter((video) => targetKeys.has(targetKey(toPendingRemovalTarget(video))));
}

/** Remove only exact pending identities, preserving a later re-park with the
 * same video id. */
export function removePendingRemovalTargets(
	rawQueue: ParkedVideo[],
	targets: PendingRemovalTarget[],
): ParkedVideo[] {
	const targetKeys = new Set(targets.map(targetKey));
	return rawQueue.filter((video) => !targetKeys.has(targetKey(toPendingRemovalTarget(video))));
}

export interface PendingRemovalTransition {
	rawQueue: ParkedVideo[];
	pending: PendingRemovalState;
}

/** Queue + pending transition used by the background's single writer. All
 * target resolution and supersede behavior happens from the same raw snapshot,
 * making stale UI messages harmless and straightforward to test. */
export function startPendingRemoval(
	rawQueue: ParkedVideo[],
	pending: PendingRemovalState,
	targets: PendingRemovalTarget[],
	now: number = Date.now(),
	operationId: string = createOperationId(now),
	owner: PendingRemovalOwner = DEFAULT_PENDING_REMOVAL_OWNER,
): PendingRemovalTransition {
	const candidates = resolvePendingRemovalTargets(visibleQueue(rawQueue, pending), targets);
	if (candidates.length === 0) return { rawQueue, pending };
	const next = requestRemoval(pending, candidates, now, operationId, owner);
	return {
		rawQueue: removePendingRemovalTargets(rawQueue, next.commitNow),
		pending: next.state,
	};
}

/** Generate an operation token that lets stale surfaces fail closed. */
export function createOperationId(now: number = Date.now()): string {
	const randomPart = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
	return `${now}-${randomPart}`;
}

/**
 * Undo: discard the pending slot. Returns `null`. Nothing is written to
 * storage — the videos were never removed, so restoring can never hit the cap
 * and can never fail (D1, D5).
 */
export function cancelRemoval(
	state: PendingRemovalState,
	operationId: string,
	owner: PendingRemovalOwner,
): PendingRemovalState {
	return state?.operationId === operationId && state.owner === owner ? null : state;
}

/**
 * The grace-period timer elapsed. Returns the exact targets the background must remove
 * from storage now. Empty if there is no pending slot (defensive).
 */
export function commitRemoval(state: PendingRemovalState): PendingRemovalTarget[] {
	return state ? state.videos.map(toPendingRemovalTarget) : [];
}

export function commitPendingRemoval(
	rawQueue: ParkedVideo[],
	state: PendingRemovalState,
): ParkedVideo[] {
	return removePendingRemovalTargets(rawQueue, commitRemoval(state));
}

/** Compare against the persisted absolute deadline, not elapsed worker time. */
export function isPendingExpired(
	state: PendingRemovalState,
	now: number = Date.now(),
): boolean {
	return state !== null && now >= state.expiresAt;
}

export interface PendingRemovalSummary {
	operationId: string;
	count: number;
	owner: PendingRemovalOwner;
}

export function pendingSummary(
	state: PendingRemovalState,
	owner: PendingRemovalOwner | null,
): PendingRemovalSummary | null {
	if (!state || !owner || state.owner !== owner) return null;
	return { operationId: state.operationId, count: state.videos.length, owner: state.owner };
}

export function isPendingRemovalOwner(value: unknown): value is PendingRemovalOwner {
	return value === "popup" || value === "sidepanel" || value === "content";
}

/** Validate data read from storage before using it as domain state. */
export function normalizePendingRemoval(value: unknown): PendingRemovalState {
	if (!value || typeof value !== "object") return null;
	const candidate = value as Partial<PendingRemoval>;
	if (
		typeof candidate.operationId !== "string" ||
		typeof candidate.requestedAt !== "number" ||
		!Number.isFinite(candidate.requestedAt) ||
		typeof candidate.expiresAt !== "number" ||
		!Number.isFinite(candidate.expiresAt) ||
		!Array.isArray(candidate.videos)
	) {
		return null;
	}
	if (!isPendingRemovalOwner(candidate.owner)) return null;
	const owner = candidate.owner;
	const videos = candidate.videos.filter(
		(video): video is ParkedVideo =>
			!!video &&
			typeof video === "object" &&
			typeof (video as ParkedVideo).id === "string" &&
			typeof (video as ParkedVideo).title === "string" &&
			typeof (video as ParkedVideo).channel === "string" &&
			Number.isFinite((video as ParkedVideo).addedAt),
	);
	if (videos.length === 0) return null;
	return {
		operationId: candidate.operationId,
		owner,
		videos,
		requestedAt: candidate.requestedAt,
		expiresAt: candidate.expiresAt,
	};
}

/**
 * Read-for-display: filter the pending-deleted identities out of the raw queue. Every
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
	return removePendingRemovalTargets(raw, state.videos.map(toPendingRemovalTarget));
}

/** How many items the current pending slot hides. Drives the honest toast count
 * (G6 absorbed): `1 ? 'Video removed' : '{n} videos removed'`. */
export function pendingCount(state: PendingRemovalState): number {
	return state ? state.videos.length : 0;
}
