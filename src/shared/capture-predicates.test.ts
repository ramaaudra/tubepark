import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { describe, it, expect } from "vitest";
import {
	computeButtonPosition,
	cleanYouTubeTitle,
	extractYouTubeVideoId,
	isYouTubeWatchUrl,
	isMatchingVideoCardSelector,
	readMainVideoCurrentTime,
	resolveCardMeta,
	resolveThumbnail,
	resolveWatchPageChannel,
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

		// Shorts are first-class videos (G2): /shorts/{id} is a watchable video
		// with the same id semantics as /watch?v=. Park, queue, play all work
		// against /watch?v={id}; the Shorts id is an ordinary video id.
		it("extracts video id from /shorts/ URL", () => {
			expect(
				extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
			).toBe("dQw4w9WgXcQ");
		});

		it("extracts video id from /shorts/ URL with query params", () => {
			expect(
				extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ?t=10"),
			).toBe("dQw4w9WgXcQ");
		});

		it("extracts video id from /shorts/ URL with trailing slash", () => {
			expect(
				extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ/"),
			).toBe("dQw4w9WgXcQ");
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

	describe("cleanYouTubeTitle", () => {
		it("strips the ' - YouTube' suffix and trims", () => {
			expect(cleanYouTubeTitle("My Video - YouTube")).toBe("My Video");
		});

		it("returns the title unchanged when there is no suffix", () => {
			expect(cleanYouTubeTitle("Just a title")).toBe("Just a title");
		});

		it("returns empty string for empty / undefined / null", () => {
			expect(cleanYouTubeTitle("")).toBe("");
			expect(cleanYouTubeTitle(undefined)).toBe("");
			expect(cleanYouTubeTitle(null)).toBe("");
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

		// Shorts cards (ytd-reel-item-renderer) carry a /shorts/{id} anchor
		// rather than /watch?v=. No live-captured Shorts fixture is available
		// yet (spec G2 marks card-shorts.html as WAJIB/CRITICAL — follow-up),
		// so these synthetic DOMs guard the two resolveVideoId paths a real
		// fixture would settle: (1) the a#thumbnail fast-path when the
		// thumbnail anchor IS /shorts/{id}; (2) the a[href*="/shorts/"]
		// durable fallback when there is no id-anchor at all.
		it("resolves meta via a#thumbnail fast-path when the thumbnail anchor is /shorts/{id}", () => {
			const { document } = parseHTML(
				`<body><ytd-reel-item-renderer>
					<a id="thumbnail" href="/shorts/dQw4w9WgXcQ">
						<img src="https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg" />
					</a>
					<h3><a href="/shorts/dQw4w9WgXcQ">A Short Title</a></h3>
				</ytd-reel-item-renderer></body>`,
			);
			const card = document.querySelector("ytd-reel-item-renderer")!;
			const meta = resolveCardMeta(card);
			expect(meta).not.toBeNull();
			expect(meta?.videoId).toBe("dQw4w9WgXcQ");
			expect(meta?.title.length).toBeGreaterThan(0);
		});

		it("resolves meta via the a[href*='/shorts/'] fallback when no id-anchor is present", () => {
			// Card has NO a#thumbnail / a#video-title-link / a#video-title, so the
			// fast-path returns null and the durable /shorts/ anchor loop must fire.
			const { document } = parseHTML(
				`<body><ytd-reel-item-renderer>
					<span class="thumb-no-id"><img src="https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg" /></span>
					<h3><a href="/shorts/dQw4w9WgXcQ">A Short Title</a></h3>
				</ytd-reel-item-renderer></body>`,
			);
			const card = document.querySelector("ytd-reel-item-renderer")!;
			const meta = resolveCardMeta(card);
			expect(meta).not.toBeNull();
			expect(meta?.videoId).toBe("dQw4w9WgXcQ");
			expect(meta?.title).toBe("A Short Title");
		});
	});

	// The park button was anchoring to the whole card, so its bottom-left inset
	// landed BELOW the thumbnail — over the title/metadata text (see the Videos
	// tab grid). resolveThumbnail must pick out the thumbnail sub-element across
	// both DOM eras so positionOver measures the thumbnail, not the card.
	describe("resolveThumbnail (real captured fixtures)", () => {
		it("finds the legacy ytd-thumbnail on search cards", () => {
			const card = cardFromFixture("card-search.html");
			const thumb = resolveThumbnail(card);
			expect(thumb).not.toBeNull();
			expect(thumb).not.toBe(card);
			// Legacy era: a#thumbnail nested in ytd-thumbnail.
			expect(thumb?.matches("a#thumbnail, ytd-thumbnail")).toBe(true);
		});

		it("finds the view-model thumbnail on channel /videos grid cards", () => {
			const card = cardFromFixture("card-channel-grid.html");
			const thumb = resolveThumbnail(card);
			expect(thumb).not.toBeNull();
			expect(thumb).not.toBe(card);
			expect(thumb?.matches("yt-thumbnail-view-model, .ytThumbnailViewModelHost")).toBe(
				true,
			);
		});

		it("finds the view-model thumbnail on channel-home shelf cards", () => {
			const card = cardFromFixture("card-channel-home.html");
			const thumb = resolveThumbnail(card);
			expect(thumb).not.toBeNull();
			expect(thumb).not.toBe(card);
			expect(thumb?.matches("yt-thumbnail-view-model, .ytThumbnailViewModelHost")).toBe(
				true,
			);
		});

		it("returns null when the card has no thumbnail sub-element", () => {
			const { document } = parseHTML(
				`<body><ytd-video-renderer><span>no thumb here</span></ytd-video-renderer></body>`,
			);
			const card = document.querySelector("ytd-video-renderer")!;
			expect(resolveThumbnail(card)).toBeNull();
		});
	});

	// The bug in one assertion: fed a thumbnail rect (bottom=200) sitting inside a
	// taller card (bottom=300), the button must land WITHIN the thumbnail's
	// vertical band — never in the title/meta text below it. Anchoring to the card
	// rect would put top at 300-4-28=268, well past the thumbnail's 200 bottom.
	describe("computeButtonPosition", () => {
		const SIZE = 28;
		const thumbRect = { left: 40, bottom: 200 };

		it("insets the button into the bottom-left of the given rect", () => {
			const pos = computeButtonPosition(thumbRect, SIZE);
			expect(pos.left).toBe(44); // left + 4
			expect(pos.top).toBe(168); // bottom - 4 - SIZE
		});

		it("keeps the whole button above the rect's bottom edge (over thumbnail, not text)", () => {
			const pos = computeButtonPosition(thumbRect, SIZE);
			const buttonBottom = pos.top + SIZE;
			expect(buttonBottom).toBeLessThanOrEqual(thumbRect.bottom);
		});
	});

	// G4: watch-page channel lives under #owner / ytd-channel-name — not the
	// per-card selectors resolveChannel uses. Fallback chain mirrors
	// THUMBNAIL_SELECTORS (YouTube churns watch-page DOM the same way).
	// No live-captured watch-page fixture yet (spec marks it WAJIB); these
	// synthetic DOMs pin the selector chain the fixture will later settle.
	describe("resolveWatchPageChannel", () => {
		it("reads channel from #owner ytd-channel-name (primary)", () => {
			const { document } = parseHTML(
				`<body>
					<div id="owner">
						<ytd-channel-name><a>MKBHD</a></ytd-channel-name>
					</div>
				</body>`,
			);
			expect(resolveWatchPageChannel(document)).toBe("MKBHD");
		});

		it("falls back to #owner #channel-name", () => {
			const { document } = parseHTML(
				`<body>
					<div id="owner">
						<div id="channel-name">Linus Tech Tips</div>
					</div>
				</body>`,
			);
			expect(resolveWatchPageChannel(document)).toBe("Linus Tech Tips");
		});

		it("falls back to ytd-watch-metadata ytd-channel-name", () => {
			const { document } = parseHTML(
				`<body>
					<ytd-watch-metadata>
						<ytd-channel-name>Veritasium</ytd-channel-name>
					</ytd-watch-metadata>
				</body>`,
			);
			expect(resolveWatchPageChannel(document)).toBe("Veritasium");
		});

		it("returns 'YouTube' when no channel node is present", () => {
			const { document } = parseHTML(`<body><div id="player"></div></body>`);
			expect(resolveWatchPageChannel(document)).toBe("YouTube");
		});

		it("ignores empty channel text and keeps walking the chain", () => {
			const { document } = parseHTML(
				`<body>
					<div id="owner"><ytd-channel-name>   </ytd-channel-name></div>
					<ytd-watch-metadata><ytd-channel-name>Real Channel</ytd-channel-name></ytd-watch-metadata>
				</body>`,
			);
			expect(resolveWatchPageChannel(document)).toBe("Real Channel");
		});
	});

	// F4: resume position from the main HTML5 <video>. YouTube may mount an ad
	// pre-roll <video> alongside the player; pick the largest visible one so
	// park-mid-watch captures the content position, not a 0s ad stub.
	describe("readMainVideoCurrentTime", () => {
		it("returns 0 when no <video> is present", () => {
			const { document } = parseHTML(`<body><div></div></body>`);
			expect(readMainVideoCurrentTime(document)).toBe(0);
		});

		it("floors a single video's currentTime to an integer second", () => {
			const { document } = parseHTML(
				`<body><video id="v"></video></body>`,
			);
			const v = document.querySelector("video") as HTMLVideoElement;
			Object.defineProperty(v, "currentTime", { value: 91.7, configurable: true });
			Object.defineProperty(v, "clientWidth", { value: 640, configurable: true });
			Object.defineProperty(v, "clientHeight", { value: 360, configurable: true });
			expect(readMainVideoCurrentTime(document)).toBe(91);
		});

		it("picks the largest <video> when multiple are present (ad + main)", () => {
			const { document } = parseHTML(
				`<body>
					<video id="ad"></video>
					<video id="main"></video>
				</body>`,
			);
			const ad = document.querySelector("#ad") as HTMLVideoElement;
			const main = document.querySelector("#main") as HTMLVideoElement;
			Object.defineProperty(ad, "currentTime", { value: 3, configurable: true });
			Object.defineProperty(ad, "clientWidth", { value: 1, configurable: true });
			Object.defineProperty(ad, "clientHeight", { value: 1, configurable: true });
			Object.defineProperty(main, "currentTime", {
				value: 300.2,
				configurable: true,
			});
			Object.defineProperty(main, "clientWidth", {
				value: 1280,
				configurable: true,
			});
			Object.defineProperty(main, "clientHeight", {
				value: 720,
				configurable: true,
			});
			expect(readMainVideoCurrentTime(document)).toBe(300);
		});
	});
});
