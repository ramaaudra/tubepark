export interface ParkedVideo {
	id: string;
	title: string;
	channel: string;
	addedAt: number;
	pinned?: boolean;
}

export type CapacityStatus = "safe" | "warning" | "full";

export interface CapacityState {
	status: CapacityStatus;
	count: number;
	max: number;
	percentage: number;
}

export const MAX_QUEUE_SIZE = 200;
