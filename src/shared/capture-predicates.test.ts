import { describe, it, expect } from "vitest";
import {
	extractYouTubeVideoId,
	isYouTubeWatchUrl,
	isMatchingVideoCardSelector,
} from "./capture-predicates";

describe("Capture Predicates", () => {
	describe("extractYouTubeVideoId", () => {
		it("extracts video id from full watch URL", () => {
			expect(
				extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
			).toBe("dQw4w9WgXcQ");
			expect(
				extractYouTubeVideoId("https://youtube.com/watch?v=abc123_XYZ8&t=42s"),
			).toBe("abc123_XYZ8");
		});

		it("extracts video id from relative watch URL", () => {
			expect(extractYouTubeVideoId("/watch?v=abc123")).toBe("abc123");
		});

		it("extracts video id from youtu.be short URL", () => {
			expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(
				"dQw4w9WgXcQ",
			);
		});

		it("extracts video id from youtu.be short URL with query params", () => {
			expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe(
				"dQw4w9WgXcQ",
			);
		});

		it("returns null for non-watch URLs", () => {
			expect(
				extractYouTubeVideoId("https://youtube.com/feed/subscriptions"),
			).toBeNull();
			expect(
				extractYouTubeVideoId("https://youtube.com/channel/UC123"),
			).toBeNull();
			expect(extractYouTubeVideoId("https://google.com")).toBeNull();
		});

		it("returns null for empty or undefined input", () => {
			expect(extractYouTubeVideoId("")).toBeNull();
			expect(extractYouTubeVideoId(undefined as any)).toBeNull();
		});

		it("returns null for malformed URL", () => {
			expect(extractYouTubeVideoId("not-a-url-at-all")).toBeNull();
		});
	});

	describe("isYouTubeWatchUrl", () => {
		it("returns true for YouTube watch URLs", () => {
			expect(isYouTubeWatchUrl("https://youtube.com/watch?v=abc")).toBe(true);
		});

		it("returns false for non-YouTube URLs", () => {
			expect(isYouTubeWatchUrl("https://google.com")).toBe(false);
		});
	});

	describe("isMatchingVideoCardSelector", () => {
		it("matches ytd-rich-item-renderer", () => {
			expect(isMatchingVideoCardSelector("ytd-rich-item-renderer")).toBe(true);
		});

		it("matches ytd-compact-video-renderer", () => {
			expect(isMatchingVideoCardSelector("ytd-compact-video-renderer")).toBe(
				true,
			);
		});

		it("does not match arbitrary tag names", () => {
			expect(isMatchingVideoCardSelector("div")).toBe(false);
			expect(isMatchingVideoCardSelector("a")).toBe(false);
		});
	});
});
