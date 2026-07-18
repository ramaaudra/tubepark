import type { ParkedVideo } from "./types";

export interface GroupedVideos {
	upNext: ParkedVideo[];
	baru: ParkedVideo[];
	lebihLama: ParkedVideo[];
}

export function groupAndSortVideos(
	queue: ParkedVideo[],
	now: number = Date.now(),
): GroupedVideos {
	const ONE_DAY_MS = 86400000;
	const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

	const upNext: ParkedVideo[] = [];
	const baru: ParkedVideo[] = [];
	const lebihLama: ParkedVideo[] = [];

	const sorted = [...queue].sort((a, b) => b.addedAt - a.addedAt);

	for (const item of sorted) {
		if (item.pinned) {
			upNext.push(item);
		} else {
			const age = now - item.addedAt;
			if (age <= SEVEN_DAYS_MS) {
				baru.push(item);
			} else {
				lebihLama.push(item);
			}
		}
	}

	return { upNext, baru, lebihLama };
}

export function formatAgeBadge(
	video: ParkedVideo,
	now: number = Date.now(),
): string {
	const ONE_DAY_MS = 86400000;
	const ageMs = now - video.addedAt;
	const ageDays = Math.floor(ageMs / ONE_DAY_MS);

	if (ageDays < 1) return "hari ini";
	if (ageDays < 30) return `${ageDays} hari`;

	const months = Math.floor(ageDays / 30);
	return `${months} bulan`;
}
