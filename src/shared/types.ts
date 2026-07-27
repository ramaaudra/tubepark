export interface ParkedVideo {
	id: string;
	title: string;
	channel: string;
	addedAt: number;
	pinned?: boolean;
	/** User-defined collection label. A lens, not a container. */
	collection?: string;
	/** Order within Up Next; meaningful only while pinned. */
	order?: number;
	/** Captured duration in seconds when YouTube exposes a duration badge. */
	durationSec?: number;
	/** Seconds into the video to resume at on play. Only set for tab-park
	 * (user was mid-watch). Hover/context-menu park leave this undefined.
	 * Omit 0 — `t=0` is redundant and would still scrub the player. */
	resumeAt?: number;
}

export type CapacityStatus = "safe" | "warning" | "full";

export interface CapacityState {
	status: CapacityStatus;
	count: number;
	max: number;
	percentage: number;
}

export const MAX_QUEUE_SIZE = 200;

export type GroupingPreference = "time" | "channel";

export interface UiState {
	activeCollection: string | null;
	grouping: GroupingPreference;
}

export const DEFAULT_UI_STATE: UiState = {
	activeCollection: null,
	grouping: "time",
};
