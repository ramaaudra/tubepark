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
	type QueueState,
} from "../shared/storage";
import type { ParkedVideo } from "../shared/types";
import { getUiState } from "../shared/storage";
import {
	type PendingRemovalState,
	requestRemoval,
	cancelRemoval,
	commitRemoval,
	visibleQueue,
} from "../shared/pending-removal";
import { MSG } from "../shared/messages";
import { extractYouTubeVideoId } from "../shared/capture-predicates";
import { MutationQueue } from "../shared/mutation-queue";

const CONTEXT_MENU_ID = "tubepark-park-context-menu";

/** Grace-period window before a pending deletion commits to storage. Kept
 * short (5s, inherited) so undo is reachable but the shadow-state window is
 * narrow. chrome.alarms is not an option — its minimum granularity is 30s+, far
 * above this window — so a service-worker setTimeout is used instead. The SW
 * idles out after ~30s, so a 5s timer completes before idle under normal
 * conditions; if the SW is killed early (memory pressure) the pending slot is
 * lost but the items remain in storage (no data loss — the deletion just does
 * not commit, which is the safe failure mode for a grace-period model). */
const GRACE_MS = 5000;

/** The sole pending removal slot, owned by the background (D3). In-memory only:
 * not persisted, so an SW restart clears it (items stay in storage — safe). */
let pending: PendingRemovalState = null;
let commitTimer: ReturnType<typeof setTimeout> | null = null;
const mutations = new MutationQueue();

function clearTimer() {
	if (commitTimer) {
		clearTimeout(commitTimer);
		commitTimer = null;
	}
}

/** Remove the given ids from storage (the commit write). */
async function updateBadge(): Promise<void> {
	if (!chrome.action?.setBadgeText) return;
	const state = await visibleState();
	const color = state.capacity.status === "full" ? "#dc2626" : state.capacity.status === "warning" ? "#a16207" : "#15803d";
	await chrome.action.setBadgeText({ text: state.queue.length ? String(state.queue.length) : "" });
	await chrome.action.setBadgeBackgroundColor({ color });
}

async function applyRemoval(ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	await mutations.run(async () => {
		const raw = await getRawQueue();
		await saveQueue(removeManyPure(raw, ids));
	});
}

/** Snapshot the display view: raw queue with pending filtered out + capacity
 * from the filtered count. Every read-for-display goes through this. */
async function visibleState(): Promise<QueueState> {
	const raw = await getRawQueue();
	const queue = visibleQueue(raw, pending);
	return { queue, capacity: deriveCapacityState(queue.length, MAX_QUEUE_SIZE) };
}

/** Start a grace-period removal for 1 or N videos. If a slot was already
 * pending, it is committed first (D2 — rapid A-then-B commits A permanently,
 * not silently cancels A). Then the new slot becomes pending and a 5s timer
 * is armed. Broadcasts PENDING_REMOVAL_CHANGED so every surface re-syncs. */
async function startPending(videos: ParkedVideo[]): Promise<QueueState> {
	const { commitNow: supersededIds, state } = requestRemoval(pending, videos);
	if (supersededIds.length > 0) {
		await applyRemoval(supersededIds);
	}
	pending = state;
	clearTimer();
	commitTimer = setTimeout(async () => {
		const ids = commitRemoval(pending);
		if (ids.length > 0) await applyRemoval(ids);
		pending = null;
		commitTimer = null;
		broadcastPendingChanged();
	}, GRACE_MS);
	broadcastPendingChanged();
	return visibleState();
}

/** Undo: clear the pending slot. Nothing was ever written to storage, so
 * restoring can never fail and never hits the cap (D1/D5). */
function cancelPending(): void {
	pending = cancelRemoval();
	clearTimer();
	broadcastPendingChanged();
}

/** Broadcast the current pending set to extension pages (popup, side panel)
 * and YouTube content scripts. storage.onChanged does not fire during the
 * grace window (storage has not changed), so the content script's Set<videoId>
 * (F1) and the panel's undo toast both need this separate channel (D3). */
function broadcastPendingChanged(): void {
	if (typeof chrome === "undefined" || !chrome.runtime) return;
	const pendingIds = pending ? pending.videos.map((v) => v.id) : [];
	const payload = { type: MSG.PENDING_REMOVAL_CHANGED, pendingIds };

	// Extension pages (popup, side panel) — ignore "no receiver" errors.
	try {
		chrome.runtime.sendMessage(payload, () => {
			void chrome.runtime.lastError;
		});
	} catch {
		/* sender may be unavailable in some contexts */
	}

	// Content scripts in YouTube tabs (forward-compat for F1's parked-state Set;
	// they currently ignore unknown messages, so this is safe to emit now).
	if (chrome.tabs?.query) {
		chrome.tabs
			.query({ url: "*://*.youtube.com/*" })
			.then((tabs) => {
				for (const tab of tabs) {
					if (!tab.id) continue;
					try {
						chrome.tabs.sendMessage(tab.id, payload, () => {
							void chrome.runtime.lastError;
						});
					} catch {
						/* tab may be gone */
					}
				}
			})
			.catch(() => {
				/* query failed — non-fatal */
			});
	}
}

export default defineBackground(() => {
	console.log("[TubePark] Background Service Worker initialized");

	if (typeof chrome !== "undefined" && chrome.runtime) {
		chrome.runtime.onInstalled.addListener(() => {
			if (chrome.contextMenus) {
				chrome.contextMenus.create({
					id: CONTEXT_MENU_ID,
					title: "Park This Video",
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
					documentUrlPatterns: ["*://*.youtube.com/*"],
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
						chrome.tabs.sendMessage(tab.id, {
							type: MSG.CONTEXT_MENU_PARK,
							videoId,
							linkUrl: info.linkUrl,
						});
					}
				}
			});
		}

		chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
			if (message?.type === MSG.PARK_VIDEO_REQUEST) {
				(async () => {
					const response = await mutations.run(async () => {
						const raw = await getRawQueue();
						const ui = await getUiState();
						const payload: ParkedVideo = ui.activeCollection
							? { ...message.payload, collection: ui.activeCollection }
							: message.payload;
						const result = tryParkWithPending(raw, pending, payload);
						if (result.success) await saveQueue([...raw, payload]);
						return { ...result, collection: ui.activeCollection };
					});
					await updateBadge();
					sendResponse(response);
				})();
				return true;
			}

			if (message?.type === MSG.PENDING_REMOVE) {
				(async () => {
					const requestedIds: string[] = Array.isArray(message.ids)
						? message.ids.filter((id: unknown): id is string => typeof id === "string")
						: [];
					const videos: ParkedVideo[] = requestedIds.length > 0
						? (await getRawQueue()).filter((video) => requestedIds.includes(video.id))
						: Array.isArray(message.videos) ? message.videos : [];
					const state = await startPending(videos);
					sendResponse(state);
				})();
				return true;
			}

			if (message?.type === MSG.COMMIT_PENDING) {
				(async () => {
					const ids = commitRemoval(pending);
					clearTimer();
					pending = null;
					if (ids.length > 0) await applyRemoval(ids);
					broadcastPendingChanged();
					sendResponse(await visibleState());
				})();
				return true;
			}

			if (message?.type === MSG.CANCEL_REMOVE) {
				(async () => {
					cancelPending();
					sendResponse(await visibleState());
				})();
				return true;
			}

			if (message?.type === MSG.TOGGLE_PINNED) {
				(async () => {
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
				(async () => {
					sendResponse(await visibleState());
				})();
				return true;
			}

			return false;
		});

		chrome.storage?.onChanged.addListener(() => void updateBadge());
		void updateBadge();
	}
});