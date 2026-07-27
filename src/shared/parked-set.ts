import type { ParkedVideo } from "./types";

/** Build the content-script lookup from the background's visible queue. */
export function parkedVideoIds(queue: readonly ParkedVideo[]): Set<string> {
	return new Set(queue.map((video) => video.id));
}

/** Pending removals are optimistically absent until undo restores the queue. */
export function withoutPendingIds(
	parkedIds: ReadonlySet<string>,
	pendingIds: readonly string[],
): Set<string> {
	const next = new Set(parkedIds);
	for (const id of pendingIds) next.delete(id);
	return next;
}

export function parkToastMessage(title: string, collection?: string | null): string {
	return collection ? `Diparkir ke ${collection}` : `Diparkir: "${title}"`;
}
