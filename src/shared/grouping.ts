import type { ParkedVideo } from "./types";

export type Grouping = { kind: "time" } | { kind: "channel" };
export interface GroupedItems {
	label: string;
	items: ParkedVideo[];
	kind: "up-next" | "new" | "older" | "channel" | "unknown";
}

const UNKNOWN_CHANNELS = new Set(["YouTube", "YouTube Channel"]);

/** Bucket label for items whose channel capture fell back to a placeholder. Used
 * as both the map key and the `kind` discriminant, so it must be one constant. */
const UNKNOWN_LABEL = "Unknown channel";

function pinnedOrder(a: ParkedVideo, b: ParkedVideo): number {
	const aOrder = a.order ?? Number.MAX_SAFE_INTEGER;
	const bOrder = b.order ?? Number.MAX_SAFE_INTEGER;
	return aOrder - bOrder || b.addedAt - a.addedAt;
}

export function groupAndSortVideos(
	queue: ParkedVideo[],
	grouping: Grouping = { kind: "time" },
	now: number = Date.now(),
): GroupedItems[] {
	const upNext = queue.filter((item) => item.pinned).sort(pinnedOrder);
	const unpinned = queue.filter((item) => !item.pinned).sort((a, b) => b.addedAt - a.addedAt);
	const groups: GroupedItems[] = [];
	if (upNext.length) groups.push({ label: "Up next", items: upNext, kind: "up-next" });

	if (grouping.kind === "time") {
		const sevenDays = 7 * 86400000;
		const recent = unpinned.filter((item) => now - item.addedAt <= sevenDays);
		const older = unpinned.filter((item) => now - item.addedAt > sevenDays);
		if (recent.length) groups.push({ label: "Recent", items: recent, kind: "new" });
		if (older.length) groups.push({ label: "Older", items: older, kind: "older" });
		return groups;
	}

	const buckets = new Map<string, ParkedVideo[]>();
	for (const item of unpinned) {
		const channel = UNKNOWN_CHANNELS.has(item.channel) ? UNKNOWN_LABEL : item.channel;
		const bucket = buckets.get(channel) ?? [];
		bucket.push(item);
		buckets.set(channel, bucket);
	}
	for (const [label, items] of [...buckets].sort((a, b) => b[1][0].addedAt - a[1][0].addedAt)) {
		groups.push({ label, items, kind: label === UNKNOWN_LABEL ? "unknown" : "channel" });
	}
	return groups;
}

export function formatAgeBadge(video: ParkedVideo, now: number = Date.now()): string {
	const ageDays = Math.floor((now - video.addedAt) / 86400000);
	if (ageDays < 1) return "Today";
	if (ageDays < 30) return `${ageDays}d`;
	return `${Math.floor(ageDays / 30)}mo`;
}
