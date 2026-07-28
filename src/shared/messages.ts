/**
 * Extension message type constants — the single source of truth shared by the
 * background service worker, the popup, the side panel, and the content
 * script. Keeping them here (instead of string literals sprinkled across
 * entrypoints) makes the messaging contract grep-able and type-safe-ish.
 *
 * Convention: every message carries `{ type: MSG.X, ... }`. Mutations that
 * change the queue respond with a `QueueState` (`{ queue, capacity }`) so the
 * caller can update its view in one round-trip.
 */
export const MSG = {
	/** Content script / popup → background: park one video. Responds with ParkResult. */
	PARK_VIDEO_REQUEST: "PARK_VIDEO_REQUEST",
	/** Background → content script: a context-menu link park was requested. */
	CONTEXT_MENU_PARK: "CONTEXT_MENU_PARK",
	/** Panel → background: start a grace-period removal for 1 or N videos. */
	PENDING_REMOVE: "PENDING_REMOVE",
	/** Panel → background: undo — cancel the current grace-period removal. */
	CANCEL_REMOVE: "CANCEL_REMOVE",
	/** Panel → background: toggle an item's pinned flag (read-modify-write on raw). */
	TOGGLE_PINNED: "TOGGLE_PINNED",
	/** Panel → background: collection assignment/rename or pinned reorder. */
	MUTATE_QUEUE: "MUTATE_QUEUE",
	/** Popup → background: immediate single (or bulk) delete, no grace period. */
	REMOVE_NOW: "REMOVE_NOW",
	/** Popup → background: commit the current pending slot immediately. */
	COMMIT_PENDING: "COMMIT_PENDING",
	/** Popup / panel → background: read-for-display queue + capacity (filters pending). */
	GET_VISIBLE_QUEUE: "GET_VISIBLE_QUEUE",
	/** Content script → background: alias for its parked-id Set snapshot. */
	GET_QUEUE: "GET_QUEUE",
	/** Background → all extension pages + YouTube content scripts: the pending
	 * removal set changed. `pendingIds` is the list of videoIds currently hidden
	 * by a grace-period deletion (empty after commit or undo). */
	PENDING_REMOVAL_CHANGED: "PENDING_REMOVAL_CHANGED",
	/** Popup → content script on a YouTube watch tab: read channel + currentTime
	 * from the live DOM (G4+F4). Responds with `{ channel, currentTime }`. */
	GET_TAB_META: "GET_TAB_META",
	/** Content script → background: park one video AND close the sender's tab.
	 * Responds with ParkResult. The background closes `sender.tab.id` only on
	 * success/duplicate (full → no close, so the video is not lost); the content
	 * script is destroyed with the tab, so it only acts on `full` (toast). F10. */
	PARK_AND_CLOSE_TAB: "PARK_AND_CLOSE_TAB",
} as const;

/** Response shape for MSG.GET_TAB_META (content script → popup). */
export interface TabMeta {
	channel: string;
	/** Floored seconds from the main HTML5 <video>. 0 when player not ready. */
	currentTime: number;
}
