import { describe, it, expect } from "vitest";
import { groupAndSortVideos, formatAgeBadge } from "./grouping";
import type { ParkedVideo } from "./types";

describe("Video Grouping (3-section: Up Next / Baru / Lebih Lama)", () => {
	const now = 1700000000000; // Reference time
	const ONE_DAY_MS = 86400000;

	const freshVideo: ParkedVideo = {
		id: "fresh_1",
		title: "Fresh Video",
		channel: "Channel 1",
		addedAt: now - ONE_DAY_MS * 0.5, // 12 hours ago
	};

	const weekOldVideo: ParkedVideo = {
		id: "week_1",
		title: "Week Old Video",
		channel: "Channel 2",
		addedAt: now - ONE_DAY_MS * 3, // 3 days ago
	};

	const oldVideo: ParkedVideo = {
		id: "old_1",
		title: "Old Video",
		channel: "Channel 3",
		addedAt: now - ONE_DAY_MS * 14, // 14 days ago
	};

	const pinnedVideo: ParkedVideo = {
		id: "pinned_1",
		title: "Pinned Video",
		channel: "Channel 4",
		addedAt: now - ONE_DAY_MS * 20, // old but pinned
		pinned: true,
	};

	describe("groupAndSortVideos", () => {
		it("separates pinned videos into upNext section", () => {
			const result = groupAndSortVideos([freshVideo, pinnedVideo], now);
			expect(result.upNext).toEqual([pinnedVideo]);
			expect(result.baru).toEqual([freshVideo]);
			expect(result.lebihLama).toEqual([]);
		});

		it("puts videos <7 days into baru section", () => {
			const result = groupAndSortVideos([freshVideo, weekOldVideo], now);
			expect(result.baru).toHaveLength(2);
			expect(result.lebihLama).toEqual([]);
		});

		it("puts videos >7 days into lebihLama section", () => {
			const result = groupAndSortVideos([oldVideo], now);
			expect(result.lebihLama).toEqual([oldVideo]);
			expect(result.baru).toEqual([]);
		});

		it("pinned video goes to upNext regardless of age", () => {
			const result = groupAndSortVideos([pinnedVideo], now);
			expect(result.upNext).toEqual([pinnedVideo]);
			expect(result.lebihLama).toEqual([]);
		});

		it("sorts baru section newest first", () => {
			const result = groupAndSortVideos([weekOldVideo, freshVideo], now);
			expect(result.baru[0].id).toBe("fresh_1");
			expect(result.baru[1].id).toBe("week_1");
		});

		it("sorts lebihLama section newest first", () => {
			const veryOld: ParkedVideo = {
				id: "very_old",
				title: "Very Old",
				channel: "Ch",
				addedAt: now - ONE_DAY_MS * 30,
			};
			const result = groupAndSortVideos([veryOld, oldVideo], now);
			expect(result.lebihLama[0].id).toBe("old_1");
			expect(result.lebihLama[1].id).toBe("very_old");
		});

		it("returns all empty arrays for empty queue", () => {
			const result = groupAndSortVideos([], now);
			expect(result.upNext).toEqual([]);
			expect(result.baru).toEqual([]);
			expect(result.lebihLama).toEqual([]);
		});

		it("boundary: exactly 7 days goes to baru, not lebihLama", () => {
			const exactlySevenDays: ParkedVideo = {
				id: "boundary",
				title: "Boundary",
				channel: "Ch",
				addedAt: now - ONE_DAY_MS * 7,
			};
			const result = groupAndSortVideos([exactlySevenDays], now);
			expect(result.baru).toEqual([exactlySevenDays]);
			expect(result.lebihLama).toEqual([]);
		});

		it("boundary: 7 days + 1ms goes to lebihLama", () => {
			const justOverSeven: ParkedVideo = {
				id: "just_over",
				title: "Just Over",
				channel: "Ch",
				addedAt: now - ONE_DAY_MS * 7 - 1,
			};
			const result = groupAndSortVideos([justOverSeven], now);
			expect(result.lebihLama).toEqual([justOverSeven]);
			expect(result.baru).toEqual([]);
		});
	});

	describe("formatAgeBadge", () => {
		it('returns "hari ini" for same day', () => {
			const video: ParkedVideo = {
				id: "v1",
				title: "T",
				channel: "C",
				addedAt: now - 1000,
			};
			expect(formatAgeBadge(video, now)).toBe("hari ini");
		});

		it('returns "1 hari" for 1 day old', () => {
			const video: ParkedVideo = {
				id: "v1",
				title: "T",
				channel: "C",
				addedAt: now - ONE_DAY_MS,
			};
			expect(formatAgeBadge(video, now)).toBe("1 hari");
		});

		it('returns "N hari" for N days old', () => {
			const video: ParkedVideo = {
				id: "v1",
				title: "T",
				channel: "C",
				addedAt: now - ONE_DAY_MS * 14,
			};
			expect(formatAgeBadge(video, now)).toBe("14 hari");
		});

		it('returns "1 bulan" for 30+ days', () => {
			const video: ParkedVideo = {
				id: "v1",
				title: "T",
				channel: "C",
				addedAt: now - ONE_DAY_MS * 35,
			};
			expect(formatAgeBadge(video, now)).toBe("1 bulan");
		});

		it('returns "2 bulan" for 60+ days', () => {
			const video: ParkedVideo = {
				id: "v1",
				title: "T",
				channel: "C",
				addedAt: now - ONE_DAY_MS * 65,
			};
			expect(formatAgeBadge(video, now)).toBe("2 bulan");
		});
	});
});
