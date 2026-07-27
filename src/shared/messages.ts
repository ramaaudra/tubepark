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
	/** Popup → background: immediate single (or bulk) delete, no grace period. */
	REMOVE_NOW: "REMOVE_NOW",
	/** Popup / panel → background: read-for-display queue + capacity (filters pending). */
	GET_VISIBLE_QUEUE: "GET_VISIBLE_QUEUE",
	/** Background → all extension pages + YouTube content scripts: the pending
	 * removal set changed. `pendingIds` is the list of videoIds currently hidden
	 * by a grace-period deletion (empty after commit or undo). */
	PENDING_REMOVAL_CHANGED: "PENDING_REMOVAL_CHANGED",
} as const;