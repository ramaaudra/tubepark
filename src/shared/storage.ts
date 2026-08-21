import {
	type ParkedVideo,
	type CapacityState,
	type UiState,
	DEFAULT_UI_STATE,
	MAX_QUEUE_SIZE,
} from "./types";

export { MAX_QUEUE_SIZE };
import {
	type PendingRemovalState,
	type PendingRemovalOwner,
	type PendingRemovalSummary,
	visibleQueue,
} from "./pending-removal";
import { MSG } from "./messages";

export const STORAGE_KEYS = {
	QUEUE: "tubepark_queue",
	UI_STATE: "tubepark_ui_state",
	PENDING_REMOVAL: "tubepark_pending_removal",
} as const;

/** A snapshot of the display view: the queue with pending removals filtered
 * out, plus the capacity derived from that filtered count. Every UI surface
 * reads through this so "stored" vs "visible" is consistent everywhere (D4). */
export interface QueueState {
	queue: ParkedVideo[];
	capacity: CapacityState;
	pending?: PendingRemovalSummary | null;
}

export function deriveCapacityState(
	count: number,
	max: number = MAX_QUEUE_SIZE,
): CapacityState {
	const percentage = (count / max) * 100;
	const warningThreshold = Math.ceil(max * 0.8);

	let status: CapacityState["status"] = "safe";
	if (count >= max) {
		status = "full";
	} else if (count >= warningThreshold) {
		status = "warning";
	}

	return {
		status,
		count,
		max,
		percentage,
	};
}

export interface ParkResult {
	success: boolean;
	duplicate: boolean;
	full: boolean;
	queue: ParkedVideo[];
}

export function parkVideoPure(
	queue: ParkedVideo[],
	newVideo: ParkedVideo,
	maxSize: number = MAX_QUEUE_SIZE,
): ParkResult {
	if (queue.some((item) => item.id === newVideo.id)) {
		return { success: false, duplicate: true, full: false, queue };
	}

	if (queue.length >= maxSize) {
		return { success: false, duplicate: false, full: true, queue };
	}

	const updatedQueue = [...queue, newVideo];
	return { success: true, duplicate: false, full: false, queue: updatedQueue };
}

/**
 * Pending-aware park (G5 D4/D5). The duplicate check runs against the **raw**
 * queue (storage truth) so a re-park of a pending-deleted id cannot create a
 * duplicate id in storage. The capacity check runs against the **display**
 * queue (pending filtered) so a pending deletion frees a slot for a new park.
 * The write base is always raw, so a pending-deleted item is never dropped.
 *
 * Pure — unit-tested without a browser. The background is the only writer and
 * calls this; the result.queue is the display view it returns to callers.
 */
export function tryParkWithPending(
	raw: ParkedVideo[],
	pending: PendingRemovalState,
	video: ParkedVideo,
	maxSize: number = MAX_QUEUE_SIZE,
): ParkResult {
	// Duplicate check against raw: a pending-deleted id is still in storage,
	// so re-parking it must be reported as a duplicate (not a second copy).
	if (raw.some((item) => item.id === video.id)) {
		return {
			success: false,
			duplicate: true,
			full: false,
			queue: visibleQueue(raw, pending),
		};
	}

	// Capacity check against display: a pending deletion frees a slot (D4).
	const display = visibleQueue(raw, pending);
	if (display.length >= maxSize) {
		return { success: false, duplicate: false, full: true, queue: display };
	}

	// Write base is raw — the pending-deleted item is preserved in storage.
	const newRaw = [...raw, video];
	return {
		success: true,
		duplicate: false,
		full: false,
		queue: visibleQueue(newRaw, pending),
	};
}

export function removeVideoPure(
	queue: ParkedVideo[],
	id: string,
): ParkedVideo[] {
	return queue.filter((item) => item.id !== id);
}

/** Remove many ids from a queue (used by the background's commit + REMOVE_NOW). */
export function removeManyPure(
	queue: ParkedVideo[],
	ids: string[],
): ParkedVideo[] {
	const idSet = new Set(ids);
	return queue.filter((item) => !idSet.has(item.id));
}

export function togglePinnedPure(queue: ParkedVideo[], id: string): ParkedVideo[] {
	const maxOrder = Math.max(0, ...queue.filter((item) => item.pinned).map((item) => item.order ?? 0));
	return queue.map((item) => {
		if (item.id !== id) return item;
		if (item.pinned) {
			const { pinned: _pinned, order: _order, ...unpinned } = item;
			return unpinned;
		}
		return { ...item, pinned: true, order: maxOrder + 1 };
	});
}

export function reorderPinnedPure(queue: ParkedVideo[], orderedIds: string[]): ParkedVideo[] {
	const orders = new Map(orderedIds.map((id, index) => [id, index + 1]));
	return queue.map((item) => item.pinned && orders.has(item.id)
		? { ...item, order: orders.get(item.id) }
		: item);
}

export function assignCollectionPure(queue: ParkedVideo[], ids: string[], collection?: string): ParkedVideo[] {
	const selected = new Set(ids);
	return queue.map((item) => selected.has(item.id) ? { ...item, collection: collection || undefined } : item);
}

export function renameCollectionPure(queue: ParkedVideo[], from: string, to: string): ParkedVideo[] {
	return queue.map((item) => item.collection === from ? { ...item, collection: to || undefined } : item);
}

/* -------------------------------------------------------------------------- */
/* chrome.storage.local helpers                                              */
/* -------------------------------------------------------------------------- */

/**
 * Read-for-write: the raw storage queue, **including** pending-deleted items.
 * Every read-modify-write (park, togglePin, commit, remove-now) MUST use this
 * as its base so a pending deletion is never silently dropped from storage
 * (the D4 jebakan). Only the background calls this — it is the single writer.
 */
export async function getRawQueue(): Promise<ParkedVideo[]> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) {
		return [];
	}
	const data = await chrome.storage.local.get(STORAGE_KEYS.QUEUE);
	return (data[STORAGE_KEYS.QUEUE] as ParkedVideo[]) || [];
}

/**
 * Read-for-display: the queue with pending removals filtered out, plus
 * capacity. This is the global "visible" view — popup, side panel, and the
 * capacity meter all read through it. Round-trips to the background, which owns
 * the pending set (D3/D4). Without chrome (tests), falls back to raw.
 */
export async function getQueueState(owner?: PendingRemovalOwner): Promise<QueueState> {
	if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
		const queue = await getRawQueue();
		return { queue, capacity: deriveCapacityState(queue.length), pending: null };
	}
	return new Promise((resolve) => {
		const message = owner ? { type: MSG.GET_VISIBLE_QUEUE, owner } : { type: MSG.GET_VISIBLE_QUEUE };
		chrome.runtime.sendMessage(message, (res) => {
			if (res && Array.isArray(res.queue)) {
				resolve({
					queue: res.queue,
					capacity: res.capacity ?? deriveCapacityState(res.queue.length),
					pending: res.pending ?? null,
				});
			} else {
				resolve({ queue: [], capacity: deriveCapacityState(0), pending: null });
			}
		});
	});
}

/** Convenience: the display queue alone (pending filtered). */
export async function getQueue(): Promise<ParkedVideo[]> {
	return (await getQueueState()).queue;
}

/** Convenience: the capacity derived from the display (pending-filtered) count. */
export async function getCapacity(): Promise<CapacityState> {
	return (await getQueueState()).capacity;
}

export async function saveQueue(queue: ParkedVideo[]): Promise<void> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) return;
	await chrome.storage.local.set({ [STORAGE_KEYS.QUEUE]: queue });
}

export function normalizeUiState(value: unknown): UiState {
	if (!value || typeof value !== "object") return { ...DEFAULT_UI_STATE };
	const candidate = value as Partial<UiState>;
	return {
		activeCollection:
			typeof candidate.activeCollection === "string" && candidate.activeCollection.trim()
				? candidate.activeCollection
				: null,
		grouping: candidate.grouping === "channel" ? "channel" : "time",
	};
}

export interface CollectionCount {
	name: string | null;
	count: number;
}

/** A complete partition of the queue by collection, including unassigned. Named collections are A→Z stable. */
export function deriveCollections(queue: ParkedVideo[]): CollectionCount[] {
	const counts = new Map<string, number>();
	let unassigned = 0;
	for (const video of queue) {
		if (video.collection) counts.set(video.collection, (counts.get(video.collection) ?? 0) + 1);
		else unassigned += 1;
	}
	const named = [...counts]
		.map(([name, count]) => ({ name, count }))
		.sort(
			(a, b) =>
				a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
				a.name.localeCompare(b.name),
		);
	return [
		...(unassigned ? [{ name: null, count: unassigned }] : []),
		...named,
	];
}

export async function getUiState(): Promise<UiState> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) return { ...DEFAULT_UI_STATE };
	const data = await chrome.storage.local.get(STORAGE_KEYS.UI_STATE);
	return normalizeUiState(data[STORAGE_KEYS.UI_STATE]);
}

export async function saveUiState(state: UiState): Promise<void> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) return;
	await chrome.storage.local.set({ [STORAGE_KEYS.UI_STATE]: state });
}

/* -------------------------------------------------------------------------- */
/* Mutation wrappers — route through the background (single writer, no races) */
/* -------------------------------------------------------------------------- */

function send<T>(
	message: unknown,
	fallback: T,
	validate: (res: unknown) => T,
): Promise<T> {
	if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
		return Promise.resolve(fallback);
	}
	return new Promise((resolve) => {
		chrome.runtime.sendMessage(message, (res) => {
			resolve(validate(res));
		});
	});
}

/** Park one video. The background enforces the cap against the display queue
 * (so a pending deletion frees a slot) and the duplicate check against raw.
 * Responds with a ParkResult — the content script and popup branch on it. */
export function parkVideo(video: ParkedVideo): Promise<ParkResult> {
	return send(
		{ type: MSG.PARK_VIDEO_REQUEST, payload: video },
		{ success: false, duplicate: false, full: false, queue: [] },
		(res) =>
			res && typeof res === "object" && "success" in res
				? (res as ParkResult)
				: { success: false, duplicate: false, full: false, queue: [] },
	);
}

/** Toggle an item's pinned flag. Read-modify-write on **raw** in the background
 * — a pending deletion is preserved (D4 jebakan avoided). Responds with the
 * display QueueState. */
export function togglePinned(id: string): Promise<QueueState> {
	return send(
		{ type: MSG.TOGGLE_PINNED, id },
		{ queue: [], capacity: deriveCapacityState(0) },
		(res) => asQueueState(res),
	);
}

/** Immediate single delete for callers that intentionally bypass the Undo
 * grace period. The popup's user-facing delete path uses `requestRemoval`.
 * Serialized with pending commits by the background. */
export function removeVideo(id: string): Promise<QueueState> {
	return send(
		{ type: MSG.REMOVE_NOW, id },
		{ queue: [], capacity: deriveCapacityState(0) },
		(res) => asQueueState(res),
	);
}

/** Immediate bulk delete (no grace period). Kept for callers that want a
 * commit-now bulk; the panel's "Remove all" now uses `requestRemoval` (grace). */
export function removeManyVideos(ids: string[]): Promise<QueueState> {
	return send(
		{ type: MSG.REMOVE_NOW, ids },
		{ queue: [], capacity: deriveCapacityState(0) },
		(res) => asQueueState(res),
	);
}

/** Start a grace-period removal for 1 or N videos. `owner` scopes the Undo
 * summary to the initiating surface while the pending filter remains global.
 * The background commits any previous pending slot first, then holds this one
 * for 5s. */
export function requestRemoval(
	videos: ParkedVideo[],
	owner: PendingRemovalOwner,
): Promise<QueueState> {
	return send(
		{ type: MSG.PENDING_REMOVE, videos, owner },
		{ queue: [], capacity: deriveCapacityState(0), pending: null },
		(res) => asQueueState(res),
	);
}

/** Undo the current grace-period removal. The background clears the pending
 * slot only when both operation and owner match (nothing was ever written —
 * restore never fails, D1/D5). */
export function mutateQueue(
	action: "assignCollection" | "renameCollection" | "reorderPinned",
	payload: Record<string, unknown>,
): Promise<QueueState> {
	return send(
		{ type: MSG.MUTATE_QUEUE, action, ...payload },
		{ queue: [], capacity: deriveCapacityState(0) },
		(res) => asQueueState(res),
	);
}

export function cancelRemoval(
	operationId: string | null,
	owner: PendingRemovalOwner,
): Promise<QueueState> {
	return send(
		{ type: MSG.CANCEL_REMOVE, operationId, owner },
		{ queue: [], capacity: deriveCapacityState(0), pending: null },
		(res) => asQueueState(res),
	);
}

/** Commit a pending removal when its owning surface closes. The operation id
 * prevents an old popup instance from committing a newer request. */
export function commitPending(
	operationId: string | null,
	owner: PendingRemovalOwner,
): Promise<QueueState> {
	return send(
		{ type: MSG.COMMIT_PENDING, operationId, owner },
		{ queue: [], capacity: deriveCapacityState(0), pending: null },
		(res) => asQueueState(res),
	);
}

function asQueueState(res: unknown): QueueState {
	if (res && typeof res === "object" && Array.isArray((res as QueueState).queue)) {
		const q = (res as QueueState).queue;
		return {
			queue: q,
			capacity: (res as QueueState).capacity ?? deriveCapacityState(q.length),
			pending: (res as QueueState).pending ?? null,
		};
	}
	return { queue: [], capacity: deriveCapacityState(0), pending: null };
}
