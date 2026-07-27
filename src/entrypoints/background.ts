import { defineBackground } from "wxt/utils/define-background";
import {
	getRawQueue,
	saveQueue,
	tryParkWithPending,
	togglePinnedPure,
	removeManyPure,
	deriveCapacityState,
	MAX_QUEUE_SIZE,
	type QueueState,
} from "../shared/storage";
import type { ParkedVideo } from "../shared/types";
import {
	type PendingRemovalState,
	requestRemoval,
	cancelRemoval,
	commitRemoval,
	visibleQueue,
} from "../shared/pending-removal";
import { MSG } from "../shared/messages";
import { extractYouTubeVideoId } from "../shared/capture-predicates";

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

function clearTimer() {
	if (commitTimer) {
		clearTimeout(commitTimer);
		commitTimer = null;
	}
}

/** Remove the given ids from storage (the commit write). */
async function applyRemoval(ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	const raw = await getRawQueue();
	await saveQueue(removeManyPure(raw, ids));
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
					const raw = await getRawQueue();
					const result = tryParkWithPending(raw, pending, message.payload);
					if (result.success) {
						// Write base is raw — pending-deleted items are preserved.
						await saveQueue([...raw, message.payload]);
					}
					sendResponse(result);
				})();
				return true;
			}

			if (message?.type === MSG.PENDING_REMOVE) {
				(async () => {
					const videos: ParkedVideo[] = Array.isArray(message.videos)
						? message.videos
						: [];
					const state = await startPending(videos);
					sendResponse(state);
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
					const raw = await getRawQueue();
					await saveQueue(togglePinnedPure(raw, message.id));
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

			if (message?.type === MSG.GET_VISIBLE_QUEUE) {
				(async () => {
					sendResponse(await visibleState());
				})();
				return true;
			}

			return false;
		});
	}
});