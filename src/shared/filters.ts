import type { ParkedVideo } from "./types";

export type DurationFilter = "all" | "short" | "medium" | "long";

export function matchesSearch(video: ParkedVideo, query: string): boolean {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return true;
	return `${video.title}\n${video.channel}`.toLocaleLowerCase().includes(needle);
}

export function parseDurationSec(text: string): number | undefined {
	const value = text.trim();
	if (!/^\d{1,2}(?:[.:]\d{2}){1,2}$/.test(value)) return undefined;
	const parts = value.split(/[.:]/).map(Number);
	if (parts.some((part) => !Number.isFinite(part)) || parts.slice(1).some((part) => part >= 60)) {
		return undefined;
	}
	return parts.reduce((total, part) => total * 60 + part, 0);
}

export function matchesDuration(video: ParkedVideo, filter: DurationFilter): boolean {
	if (filter === "all") return true;
	if (video.durationSec === undefined) return false;
	if (filter === "short") return video.durationSec < 5 * 60;
	if (filter === "medium") return video.durationSec >= 5 * 60 && video.durationSec <= 20 * 60;
	return video.durationSec > 20 * 60;
}

export function formatDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
		: `${minutes}:${String(secs).padStart(2, "0")}`;
}
