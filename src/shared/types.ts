export interface ParkedVideo {
	id: string;
	title: string;
	channel: string;
	addedAt: number;
	pinned?: boolean;
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
