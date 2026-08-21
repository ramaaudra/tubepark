import { defineBackground } from "wxt/utils/define-background";
import {
	getRawQueue,
	saveQueue,
	tryParkWithPending,
	togglePinnedPure,
	reorderPinnedPure,
	assignCollectionPure,
	renameCollectionPure,
	removeManyPure,
	deriveCapacityState,
	MAX_QUEUE_SIZE,
	STORAGE_KEYS,
	type QueueState,
} from "../shared/storage";
import type { ParkedVideo } from "../shared/types";
import { getUiState } from "../shared/storage";
import {
	type PendingRemovalState,
	type PendingRemovalOwner,
	type PendingRemovalTarget,
	commitPendingRemoval,
	isPendingExpired,
	normalizePendingRemoval,
	pendingSummary,
	startPendingRemoval,
	visibleQueue,
} from "../shared/pending-removal";
import { MSG } from "../shared/messages";
import {
	extractYouTubeVideoId,
	cleanYouTubeTitle,
} from "../shared/capture-predicates";
import { MutationQueue } from "../shared/mutation-queue";
import { tabOps } from "../shared/tab-operations";
import { pendingRemovalOwnerFromMessage } from "../shared/pending-removal-message";

const CONTEXT_MENU_ID = "tubepark-park-context-menu";

/** The user-facing grace period. The deadline is persisted; the timer is only
 * an accelerator while the worker remains alive. A chrome.alarms safety-net
 * and startup reconciliation cover worker/browser lifecycle gaps. */
const PENDING_ALARM_NAME = "tubepark-pending-removal";
const mutations = new MutationQueue();

async function loadPending(): Promise<PendingRemovalState> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
	const data = await chrome.storage.local.get(STORAGE_KEYS.PENDING_REMOVAL);
	return normalizePendingRemoval(data[STORAGE_KEYS.PENDING_REMOVAL]);
}

async function loadQueueAndPending(): Promise<{
	raw: ParkedVideo[];
	pending: PendingRemovalState;
}> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) {
		return { raw: [], pending: null };
	}
	const data = await chrome.storage.local.get([
		STORAGE_KEYS.QUEUE,
		STORAGE_KEYS.PENDING_REMOVAL,
	]);
	return {
		raw: Array.isArray(data[STORAGE_KEYS.QUEUE]) ? data[STORAGE_KEYS.QUEUE] as ParkedVideo[] : [],
		pending: normalizePendingRemoval(data[STORAGE_KEYS.PENDING_REMOVAL]),
	};
}

async function savePending(state: PendingRemovalState): Promise<void> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) return;
	if (state) {
		await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_REMOVAL]: state });
	} else {
		await chrome.storage.local.remove(STORAGE_KEYS.PENDING_REMOVAL);
	}
}

/** Persist queue + pending together when a new request supersedes an older
 * request. The pending record is written in the same storage operation as the
 * queue snapshot so a worker interruption cannot expose half a transition. */
async function saveQueueAndPending(
	queue: ParkedVideo[],
	state: NonNullable<PendingRemovalState>,
): Promise<void> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) return;
	await chrome.storage.local.set({
		[STORAGE_KEYS.QUEUE]: queue,
		[STORAGE_KEYS.PENDING_REMOVAL]: state,
	});
}

async function saveQueueAndClearPending(queue: ParkedVideo[]): Promise<void> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) return;
	await chrome.storage.local.set({
		[STORAGE_KEYS.QUEUE]: queue,
		[STORAGE_KEYS.PENDING_REMOVAL]: null,
	});
}

async function clearAlarm(): Promise<void> {
	if (!chrome.alarms?.clear) return;
	try {
		await chrome.alarms.clear(PENDING_ALARM_NAME);
	} catch {
		/* alarms are a recovery aid; storage reconciliation remains authoritative */
	}
}

async function schedulePending(state: NonNullable<PendingRemovalState>): Promise<void> {
	await clearAlarm();
	if (chrome.alarms?.create) {
		try {
			await chrome.alarms.create(PENDING_ALARM_NAME, { when: state.expiresAt });
		} catch {
			/* timer + startup reconciliation still provide a safe fallback */
		}
	}
	setTimeout(() => {
		void commitPendingForOperation(state.operationId, true, state.owner);
	}, Math.max(0, state.expiresAt - Date.now()));
}

async function removeIdsFromStorage(ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	const raw = await getRawQueue();
	await saveQueue(removeManyPure(raw, ids));
}

/** Remove the given ids from storage (the commit write). */
async function applyRemoval(ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	await mutations.run(() => removeIdsFromStorage(ids));
}

async function commitPendingState(state: NonNullable<PendingRemovalState>): Promise<void> {
	const { raw } = await loadQueueAndPending();
	await saveQueueAndClearPending(commitPendingRemoval(raw, state));
	await clearAlarm();
}

/** Recover an expired transaction while already inside MutationQueue. */
async function recoverExpiredPendingUnsafe(): Promise<boolean> {
	const state = await loadPending();
	if (!state || !isPendingExpired(state)) return false;
	await commitPendingState(state);
	return true;
}

async function reconcileExpiredPending(): Promise<boolean> {
	const recovered = await mutations.run(recoverExpiredPendingUnsafe);
	if (recovered) await broadcastPendingChanged();
	return recovered;
}

async function commitPendingForOperation(
	operationId: string,
	requireExpired: boolean,
	owner: PendingRemovalOwner,
): Promise<boolean> {
	const committed = await mutations.run(async () => {
		const state = await loadPending();
		if (!state || state.operationId !== operationId || state.owner !== owner) return false;
		if (requireExpired && !isPendingExpired(state)) return false;
		await commitPendingState(state);
		return true;
	});
	if (committed) await broadcastPendingChanged();
	return committed;
}

async function cancelPendingForOperation(
	operationId: string,
	owner: PendingRemovalOwner,
): Promise<boolean> {
	const cancelled = await mutations.run(async () => {
		const state = await loadPending();
		if (!state || state.operationId !== operationId || state.owner !== owner) return false;
		await savePending(null);
		await clearAlarm();
		return true;
	});
	if (cancelled) await broadcastPendingChanged();
	return cancelled;
}

/** Snapshot the display view: raw queue with pending filtered out + capacity
 * from the filtered count. Every read-for-display goes through this. */
async function visibleState(owner?: PendingRemovalOwner): Promise<QueueState> {
	const { raw, pending } = await loadQueueAndPending();
	const queue = visibleQueue(raw, pending);
	return {
		queue,
		capacity: deriveCapacityState(queue.length, MAX_QUEUE_SIZE),
		pending: pendingSummary(pending, owner ?? null),
	};
}

/** Start a grace-period removal for 1 or N videos. If a slot was already
 * pending, it is committed first (D2 — rapid A-then-B commits A permanently,
 * not silently cancels A). The transaction is persisted before the timer is
 * armed so a worker restart can recover it. */
async function startPending(
	targets: PendingRemovalTarget[],
	owner: PendingRemovalOwner,
): Promise<QueueState> {
	if (targets.length === 0) return visibleState(owner);
	await mutations.run(async () => {
		await recoverExpiredPendingUnsafe();
		const { raw, pending: current } = await loadQueueAndPending();
		const transition = startPendingRemoval(
			raw,
			current,
			targets,
			Date.now(),
			undefined,
			owner,
		);
		if (transition.pending === current && transition.rawQueue === raw) return;
		if (!transition.pending) return;
		await saveQueueAndPending(transition.rawQueue, transition.pending);
		await schedulePending(transition.pending);
	});
	await broadcastPendingChanged();
	return visibleState(owner);
}

/** Recreate the best-effort timer/alarm after a worker restart and immediately
 * commit a transaction whose absolute deadline already passed. */
async function restorePendingLifecycle(): Promise<void> {
	let recovered = false;
	await mutations.run(async () => {
		recovered = await recoverExpiredPendingUnsafe();
		if (!recovered) {
			const state = await loadPending();
			if (state) await schedulePending(state);
		}
	});
	if (recovered) await broadcastPendingChanged();
}

/** Broadcast the current pending set to extension pages (popup, side panel)
 * and YouTube content scripts. storage.onChanged does not fire during the
 * grace window (storage has not changed), so the content script's Set<videoId>
 * (F1) and the panel's undo toast both need this separate channel (D3). */
async function broadcastPendingChanged(): Promise<void> {
	if (typeof chrome === "undefined" || !chrome.runtime) return;
	const pending = await loadPending();
	const pendingIds = pending ? pending.videos.map((v) => v.id) : [];
	const payload = {
		type: MSG.PENDING_REMOVAL_CHANGED,
		pendingIds,
		owner: pending?.owner ?? null,
		pendingCount: pendingIds.length,
	};

	// Extension pages (popup, side panel) — ignore "no receiver" errors.
	try {
		await chrome.runtime.sendMessage(payload);
	} catch {
		/* sender may be unavailable in some contexts */
	}

	// Content scripts in YouTube tabs (forward-compat for F1's parked-state Set;
	// they currently ignore unknown messages, so this is safe to emit now).
	try {
		const tabs = await tabOps.getYouTubeTabs();
		for (const tab of tabs) {
			if (typeof tab.id !== "number") continue;
			await tabOps.sendMessage(tab.id, payload);
		}
	} catch {
		/* query failed — non-fatal */
	}
}

async function updateBadge(): Promise<void> {
	if (!chrome.action?.setBadgeText) return;
	await reconcileExpiredPending();
	const state = await visibleState();
	const color = state.capacity.status === "full" ? "#dc2626" : state.capacity.status === "warning" ? "#a16207" : "#15803d";
	await chrome.action.setBadgeText({ text: state.queue.length ? String(state.queue.length) : "" });
	await chrome.action.setBadgeBackgroundColor({ color });
}

/** Park one video through the mutation queue, attaching the active collection
 * lens (F8-7) orthogonally — no filing-at-capture prompt (ADR-0005). Shared by
 * PARK_VIDEO_REQUEST (hover / context-menu / popup park) and PARK_AND_CLOSE_TAB
 * (watch-page park+close) so the capture→storage path is one block, not two
 * drifted copies. Returns the ParkResult plus the collection the item was
 * filed under (the caller uses it for toast copy). */
async function parkOne(payload: ParkedVideo) {
	await reconcileExpiredPending();
	return mutations.run(async () => {
		const { raw, pending } = await loadQueueAndPending();
		const ui = await getUiState();
		const filed: ParkedVideo = ui.activeCollection
			? { ...payload, collection: ui.activeCollection }
			: payload;
		const result = tryParkWithPending(raw, pending, filed);
		if (result.success) await saveQueue([...raw, filed]);
		return { ...result, collection: ui.activeCollection };
	});
}

/** Fetch channel + currentTime from a YouTube tab's content script.
 * Falls back to defaults when the CS is not loaded yet. */
async function fetchTabMeta(tabId: number): Promise<{ channel: string; currentTime: number }> {
	const FALLBACK_META = { channel: "YouTube", currentTime: 0 };
	const response = await tabOps.sendMessage<{ channel?: unknown; currentTime?: unknown }>(
		tabId,
		{ type: MSG.GET_TAB_META },
	);
	if (!response || typeof response !== "object") return FALLBACK_META;
	const channel = typeof response.channel === "string" && response.channel
		? response.channel
		: FALLBACK_META.channel;
	const currentTime = typeof response.currentTime === "number"
		? Math.floor(response.currentTime)
		: 0;
	return { channel, currentTime };
}

/** Build a ParkedVideo for tab-park: title from the tab, channel + optional
 * resumeAt from GET_TAB_META. Omits resumeAt when currentTime is 0 (F4). */
function parkedFromTab(
	videoId: string,
	tabTitle: string | undefined,
	meta: { channel: string; currentTime: number },
): ParkedVideo {
	const payload: ParkedVideo = {
		id: videoId,
		title: cleanYouTubeTitle(tabTitle || "YouTube Video"),
		channel: meta.channel,
		addedAt: Date.now(),
	};
	if (meta.currentTime > 0) payload.resumeAt = meta.currentTime;
	return payload;
}

function parsePendingRemovalTargets(message: unknown): PendingRemovalTarget[] {
	if (!message || typeof message !== "object") return [];
	const videos = (message as { videos?: unknown }).videos;
	if (!Array.isArray(videos)) return [];
	const seen = new Set<string>();
	const targets: PendingRemovalTarget[] = [];
	for (const value of videos) {
		if (!value || typeof value !== "object") continue;
		const candidate = value as { id?: unknown; addedAt?: unknown };
		if (typeof candidate.id !== "string" || !Number.isFinite(candidate.addedAt)) continue;
		const target = { id: candidate.id, addedAt: candidate.addedAt as number };
		const key = `${target.id}\u0000${target.addedAt}`;
		if (seen.has(key)) continue;
		seen.add(key);
		targets.push(target);
	}
	return targets;
}

export default defineBackground(() => {
	console.log("[TubePark] Background Service Worker initialized");

	if (typeof chrome !== "undefined" && chrome.runtime) {
		chrome.runtime.onInstalled.addListener(() => {
			if (chrome.contextMenus) {
				chrome.contextMenus.create({
					id: CONTEXT_MENU_ID,
					title: "Park this video",
					contexts: ["link"],
					// G3: targetUrlPatterns filters the right-clicked LINK's URL.
					// /watch* is the primary path; youtu.be/* and /shorts* are
					// first-class video URLs (G2 — Shorts are first-class), so
					// short-URL and Shorts-URL captures are scoped here too.
					targetUrlPatterns: [
						"*://*.youtube.com/watch*",
						"*://youtu.be/*",
						"*://*.youtube.com/shorts*",
					],
					// G3: documentUrlPatterns filters the PAGE the right-click
					// happens on. Without it the menu appeared for YouTube links
					// on Reddit/Discord/etc., where no content script is loaded
					// → silent fail. Scope to YouTube pages so the menu only
					// appears where it can actually park (ADR-0001 amended).
					documentUrlPatterns: ["*://*.youtube.com/*", "*://youtu.be/*"],
				});
			}
		});

		if (chrome.contextMenus) {
			chrome.contextMenus.onClicked.addListener(async (info, tab) => {
				if (info.menuItemId === CONTEXT_MENU_ID && info.linkUrl) {
					const videoId = extractYouTubeVideoId(info.linkUrl);
					if (!videoId) return;

					// Route through content script for metadata + feedback
					if (tab?.id) {
						void tabOps.sendMessage(tab.id, {
							type: MSG.CONTEXT_MENU_PARK,
							videoId,
							linkUrl: info.linkUrl,
						});
					}
				}
			});
		}

		if (chrome.alarms?.onAlarm) {
			chrome.alarms.onAlarm.addListener((alarm) => {
				if (alarm.name === PENDING_ALARM_NAME) void reconcileExpiredPending();
			});
		}
		void restorePendingLifecycle();

		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
			if (message?.type === MSG.PARK_VIDEO_REQUEST) {
				(async () => {
					const response = await parkOne(message.payload);
					await updateBadge();
					sendResponse(response);
				})();
				return true;
			}

			if (message?.type === MSG.PARK_AND_CLOSE_TAB) {
				(async () => {
					const result = await parkOne(message.payload);
					await updateBadge();
					// Respond first so the content script can toast on `full`. On
					// success/duplicate the tab is about to be closed by the line below;
					// the response is harmless there (the callback sees success and does
					// nothing — the tab dies). Close ONLY on success/duplicate: a `full`
					// park must NOT close the tab, or the video is lost with no queue
					// entry to recover it from (F10-1, F10-8).
					sendResponse(result);
					const tabId = sender.tab?.id;
					if ((result.success || result.duplicate) && typeof tabId === "number") {
						try {
							await tabOps.closeTab(tabId);
						} catch {
							// The tab may have been closed or navigated away after capture.
						}
					}
				})();
				return true;
			}

			// Park all other YouTube tabs — runs in background so the process
			// survives popup close. Popup sends a single message; background
			// handles the entire loop.
			if (message?.type === MSG.PARK_ALL_OTHER_TABS) {
				(async () => {
					try {
						const watchTabs = await tabOps.getWatchTabs();
						const activeTab = await tabOps.getActiveTab();

						let parked = 0;
						let reachedCapacity = false;

						for (const tab of watchTabs) {
							if (activeTab && tab.id === activeTab.id) continue;
							if (!tab.url) continue;
							const videoId = extractYouTubeVideoId(tab.url);
							if (!videoId) continue;

							const meta = tab.id ? await fetchTabMeta(tab.id) : { channel: "YouTube", currentTime: 0 };
							const result = await parkOne(parkedFromTab(videoId, tab.title, meta));

							if (result.success || result.duplicate) {
								parked += 1;
								if (tab.id) {
									try {
										await tabOps.closeTab(tab.id);
									} catch {
										// A tab can disappear while the background is processing the batch.
									}
								}
							} else if (result.full) {
								reachedCapacity = true;
								break;
							}
						}

						await updateBadge();
						sendResponse({ parked, reachedCapacity });
					} catch {
						sendResponse({ parked: 0, reachedCapacity: false, error: true });
					}
				})();
				return true;
			}

			if (message?.type === MSG.PENDING_REMOVE) {
				const owner = pendingRemovalOwnerFromMessage(message.owner, sender);
				(async () => {
					if (!owner) {
						sendResponse(await visibleState());
						return;
					}
					const state = await startPending(parsePendingRemovalTargets(message), owner);
					sendResponse(state);
				})();
				return true;
			}

			if (message?.type === MSG.COMMIT_PENDING) {
				const owner = pendingRemovalOwnerFromMessage(message.owner, sender);
				(async () => {
					if (!owner || typeof message.operationId !== "string") {
						sendResponse(await visibleState());
						return;
					}
					await commitPendingForOperation(message.operationId, false, owner);
					await reconcileExpiredPending();
					sendResponse(await visibleState(owner));
				})();
				return true;
			}

			if (message?.type === MSG.CANCEL_REMOVE) {
				const owner = pendingRemovalOwnerFromMessage(message.owner, sender);
				(async () => {
					if (!owner || typeof message.operationId !== "string") {
						sendResponse(await visibleState());
						return;
					}
					await cancelPendingForOperation(message.operationId, owner);
					await reconcileExpiredPending();
					sendResponse(await visibleState(owner));
				})();
				return true;
			}

			if (message?.type === MSG.TOGGLE_PINNED) {
				(async () => {
					await reconcileExpiredPending();
					// Read-modify-write on RAW so a pending deletion is not dropped.
					await mutations.run(async () => {
						const raw = await getRawQueue();
						await saveQueue(togglePinnedPure(raw, message.id));
					});
					sendResponse(await visibleState());
				})();
				return true;
			}

			if (message?.type === MSG.MUTATE_QUEUE) {
				(async () => {
					await reconcileExpiredPending();
					await mutations.run(async () => {
						const raw = await getRawQueue();
						let next = raw;
						if (message.action === "assignCollection") next = assignCollectionPure(raw, message.ids ?? [], message.collection);
						if (message.action === "renameCollection") next = renameCollectionPure(raw, message.from, message.to);
						if (message.action === "reorderPinned") next = reorderPinnedPure(raw, message.ids ?? []);
						await saveQueue(next);
					});
					sendResponse(await visibleState());
				})();
				return true;
			}

			if (message?.type === MSG.REMOVE_NOW) {
				(async () => {
					await reconcileExpiredPending();
					// Immediate commit, no grace period (popup path). `ids` for bulk,
					// `id` for single. Serialized with pending commits by the single
					// writer — no cross-context write races.
					const ids: string[] = Array.isArray(message.ids)
						? message.ids
						: message.id
							? [message.id]
							: [];
					if (ids.length > 0) await applyRemoval(ids);
					sendResponse(await visibleState());
				})();
				return true;
			}

			if (
				message?.type === MSG.GET_VISIBLE_QUEUE ||
				message?.type === MSG.GET_QUEUE
			) {
				const owner = message.owner === undefined
					? undefined
					: pendingRemovalOwnerFromMessage(message.owner, sender) ?? undefined;
				(async () => {
					await reconcileExpiredPending();
					sendResponse(await visibleState(owner));
				})();
				return true;
			}

			return false;
		});

		chrome.storage?.onChanged.addListener(() => void updateBadge());
		void updateBadge();
	}
});
