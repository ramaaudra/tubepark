import { type ParkedVideo, type CapacityState, MAX_QUEUE_SIZE } from "./types";

export const STORAGE_KEYS = {
	QUEUE: "tubepark_queue",
} as const;

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

export function removeVideoPure(
	queue: ParkedVideo[],
	id: string,
): ParkedVideo[] {
	return queue.filter((item) => item.id !== id);
}

export function togglePinnedPure(
	queue: ParkedVideo[],
	id: string,
): ParkedVideo[] {
	return queue.map((item) => {
		if (item.id === id) {
			return { ...item, pinned: !item.pinned };
		}
		return item;
	});
}

/* chrome.storage.local helper methods */

export async function getQueue(): Promise<ParkedVideo[]> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) {
		return [];
	}
	const data = await chrome.storage.local.get(STORAGE_KEYS.QUEUE);
	return (data[STORAGE_KEYS.QUEUE] as ParkedVideo[]) || [];
}

export async function saveQueue(queue: ParkedVideo[]): Promise<void> {
	if (typeof chrome === "undefined" || !chrome.storage?.local) return;
	await chrome.storage.local.set({ [STORAGE_KEYS.QUEUE]: queue });
}

export async function parkVideo(video: ParkedVideo): Promise<ParkResult> {
	const queue = await getQueue();
	const result = parkVideoPure(queue, video);

	if (result.success) {
		await saveQueue(result.queue);
	}

	return result;
}

export async function removeVideo(id: string): Promise<ParkedVideo[]> {
	const queue = await getQueue();
	const updated = removeVideoPure(queue, id);
	await saveQueue(updated);
	return updated;
}

export async function togglePinned(id: string): Promise<ParkedVideo[]> {
	const queue = await getQueue();
	const updated = togglePinnedPure(queue, id);
	await saveQueue(updated);
	return updated;
}

export async function removeManyVideos(ids: string[]): Promise<ParkedVideo[]> {
	const queue = await getQueue();
	const idSet = new Set(ids);
	const updated = queue.filter((item) => !idSet.has(item.id));
	await saveQueue(updated);
	return updated;
}

export async function getCapacity(): Promise<CapacityState> {
	const queue = await getQueue();
	return deriveCapacityState(queue.length, MAX_QUEUE_SIZE);
}
