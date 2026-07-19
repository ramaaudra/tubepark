import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { describe, it, expect } from "vitest";
import {
	extractYouTubeVideoId,
	isYouTubeWatchUrl,
	isMatchingVideoCardSelector,
	resolveCardMeta,
	YOUTUBE_VIDEO_CARD_SELECTORS,
} from "./capture-predicates";

/**
 * Load a real captured YouTube card fixture and return the element that the
 * content script's `.closest(CARD_SELECTOR)` would resolve to when hovering it.
 * Fixtures are verbatim outerHTML captured from live YouTube (see
 * __fixtures__/), so these tests guard against YouTube's DOM churn — the exact
 * regression that broke the park button on channel pages.
 */
function cardFromFixture(name: string): Element {
	const path = fileURLToPath(
		new URL(`./__fixtures__/${name}`, import.meta.url),
	);
	const { document } = parseHTML(`<body>${readFileSync(path, "utf8")}</body>`);
	const selector = YOUTUBE_VIDEO_CARD_SELECTORS.join(",");
	const card =
		(document.querySelector(selector) as Element | null) ??
		document.body.firstElementChild;
	if (!card) throw new Error(`no card element in fixture ${name}`);
	return card;
}

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

		it("includes the yt-lockup-view-model channel-page card", () => {
			expect(YOUTUBE_VIDEO_CARD_SELECTORS).toContain("yt-lockup-view-model");
		});
	});

	// Regression: YouTube migrated channel-page cards to yt-lockup-view-model
	// (class-based anchors, no id nodes). The park button vanished on channel
	// /videos grid + channel-home shelves while search still worked. These
	// assert meta resolves across ALL three real layouts.
	describe("resolveCardMeta (real captured fixtures)", () => {
		it("resolves search-page card (legacy ytd-video-renderer)", () => {
			const meta = resolveCardMeta(cardFromFixture("card-search.html"));
			expect(meta).not.toBeNull();
			expect(meta?.videoId).toBe("X4VbdwhkE10");
			expect(meta?.title.length).toBeGreaterThan(0);
			expect(meta?.title).not.toBe("YouTube Video");
		});

		it("resolves channel /videos grid card (yt-lockup-view-model)", () => {
			const meta = resolveCardMeta(
				cardFromFixture("card-channel-grid.html"),
				"/@mkbhd/videos",
			);
			expect(meta).not.toBeNull();
			expect(meta?.videoId).toBe("_oRgdlJUD18");
			expect(meta?.title).toBe("iOS 27 Hands-On: Top 5 New Features!");
			// Card omits channel on channel pages → recovered from the URL handle.
			expect(meta?.channel).toBe("@mkbhd");
		});

		it("resolves channel-home shelf card (bare yt-lockup-view-model)", () => {
			const meta = resolveCardMeta(
				cardFromFixture("card-channel-home.html"),
				"/@mkbhd",
			);
			expect(meta).not.toBeNull();
			expect(meta?.videoId).toBe("_oRgdlJUD18");
			expect(meta?.title).toBe("iOS 27 Hands-On: Top 5 New Features!");
			expect(meta?.channel).toBe("@mkbhd");
		});

		it("returns null for a card with no /watch?v= anchor", () => {
			const { document } = parseHTML(
				`<body><yt-lockup-view-model><a href="/playlist?list=PL123">Mix</a></yt-lockup-view-model></body>`,
			);
			const card = document.querySelector("yt-lockup-view-model")!;
			expect(resolveCardMeta(card, "/@mkbhd")).toBeNull();
		});
	});
});
