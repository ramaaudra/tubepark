import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import {
	chooseWatchButtonMode,
	fitsWatchButtonInActionRow,
	isWatchButtonOnFirstLine,
	pickWatchButtonModeByLayout,
	resolveShortsActionRail,
	resolveWatchActionRow,
	resolveWatchButtonTextColor,
	WATCH_BUTTON_HEIGHT,
	type WatchButtonLayoutSnapshot,
} from "./watch-page-mount";

describe("resolveWatchActionRow", () => {
	it("mounts before the rightmost native overflow control", () => {
		const { document } = parseHTML(`
			<ytd-watch-metadata>
				<ytd-menu-renderer>
					<div id="top-level-buttons"></div>
					<div id="flexible-buttons"></div>
					<yt-button-shape id="more"></yt-button-shape>
				</ytd-menu-renderer>
			</ytd-watch-metadata>
		`);

		const mount = resolveWatchActionRow(document);

		expect(mount?.container.tagName).toBe("YTD-MENU-RENDERER");
		expect(mount?.before?.id).toBe("more");
	});

	it("ignores an existing TubePark button when resolving the insertion point", () => {
		const { document } = parseHTML(`
			<ytd-watch-metadata>
				<ytd-menu-renderer>
					<div id="top-level-buttons"></div>
					<button data-tubepark-watch-button="true"></button>
					<yt-button-shape id="more"></yt-button-shape>
				</ytd-menu-renderer>
			</ytd-watch-metadata>
		`);

		const mount = resolveWatchActionRow(document);

		expect(mount?.before?.id).toBe("more");
	});
});

describe("resolveShortsActionRail", () => {
	it("mounts before the final native sound/pivot control", () => {
		const { document } = parseHTML(`
			<reel-action-bar-view-model>
				<like-button-view-model></like-button-view-model>
				<button-view-model id="comments"></button-view-model>
				<button-view-model id="share"></button-view-model>
				<button-view-model id="remix"></button-view-model>
				<pivot-button-view-model id="sound"></pivot-button-view-model>
			</reel-action-bar-view-model>
		`);

		const mount = resolveShortsActionRail(document);

		expect(mount?.before?.id).toBe("sound");
	});
});

describe("chooseWatchButtonMode", () => {
	it("keeps the labeled button when the full control fits", () => {
		expect(
			chooseWatchButtonMode({
				availableWidth: 180,
				fullWidth: 160,
				iconWidth: 48,
			}),
		).toBe("full");
	});

	it("falls back to the icon when only the compact control fits", () => {
		expect(
			chooseWatchButtonMode({
				availableWidth: 72,
				fullWidth: 160,
				iconWidth: 48,
			}),
		).toBe("icon");
	});

	it("hides the control when even the compact size would overflow", () => {
		expect(
			chooseWatchButtonMode({
				availableWidth: 40,
				fullWidth: 160,
				iconWidth: 48,
			}),
		).toBe("hidden");
	});

	it("hides a Shorts control when the available rail height is too small", () => {
		expect(
			chooseWatchButtonMode({
				availableWidth: 48,
				fullWidth: 48,
				iconWidth: 48,
				availableHeight: 32,
				requiredHeight: 48,
			}),
		).toBe("hidden");
	});
});

describe("watch button dimensions", () => {
	it("uses YouTube's native 40px action-button height", () => {
		expect(WATCH_BUTTON_HEIGHT).toBe(40);
	});
});

describe("watch action-row safety", () => {
	it("rejects a button rect that overlaps a native control", () => {
		expect(
			fitsWatchButtonInActionRow(
				{ left: 100, right: 144, top: 0, bottom: 44 },
				{ left: 0, right: 200, top: 0, bottom: 44 },
				[{ left: 120, right: 160, top: 0, bottom: 44 }],
			),
		).toBe(false);
	});

	it("uses the native row color and falls back to white when none is available", () => {
		expect(resolveWatchButtonTextColor("rgb(241, 241, 241)")).toBe("rgb(241, 241, 241)");
		expect(resolveWatchButtonTextColor("")).toBe("#fff");
	});
});

describe("isWatchButtonOnFirstLine", () => {
	const container = { left: 0, right: 400, top: 100, bottom: 144 };
	const siblings = [{ left: 0, right: 240, top: 104, bottom: 144 }];

	it("accepts a button aligned with a native sibling (small padding offset)", () => {
		expect(isWatchButtonOnFirstLine(
			{ left: 248, right: 371, top: 104, bottom: 144 },
			container,
			siblings,
		)).toBe(true);
	});

	it("rejects a button that wrapped to a second line below the row", () => {
		expect(isWatchButtonOnFirstLine(
			{ left: 0, right: 123, top: 200, bottom: 244 },
			container,
			siblings,
		)).toBe(false);
	});
});

describe("pickWatchButtonModeByLayout", () => {
	const viewport = { left: 0, right: 800, top: 0, bottom: 800 };
	const fullLayout: WatchButtonLayoutSnapshot = {
		button: { left: 248, right: 371, top: 104, bottom: 144 },
		container: { left: 0, right: 400, top: 100, bottom: 144 },
		siblings: [{ left: 0, right: 240, top: 104, bottom: 144 }],
	};
	const iconLayout: WatchButtonLayoutSnapshot = {
		button: { left: 248, right: 292, top: 104, bottom: 144 },
		container: { left: 0, right: 400, top: 100, bottom: 144 },
		siblings: [{ left: 0, right: 240, top: 104, bottom: 144 }],
	};

	it("returns full when the labeled rect fits on the first line", () => {
		expect(pickWatchButtonModeByLayout(fullLayout, iconLayout, viewport)).toBe("full");
	});

	it("falls back to icon when only the compact rect fits", () => {
		expect(pickWatchButtonModeByLayout(
			{
				...fullLayout,
				button: { left: 248, right: 500, top: 104, bottom: 144 },
			},
			iconLayout,
			viewport,
		)).toBe("icon");
	});

	it("returns hidden when neither candidate fits", () => {
		expect(pickWatchButtonModeByLayout(
			{
				...fullLayout,
				button: { left: 248, right: 500, top: 104, bottom: 144 },
			},
			{
				...iconLayout,
				// icon overlaps a native sibling
				button: { left: 200, right: 244, top: 104, bottom: 144 },
			},
			viewport,
		)).toBe("hidden");
	});

	it("returns hidden when the candidate wrapped to a second line", () => {
		expect(pickWatchButtonModeByLayout(
			{
				...fullLayout,
				// full looks fine horizontally but wrapped to line 2
				button: { left: 0, right: 123, top: 200, bottom: 244 },
			},
			{
				...iconLayout,
				button: { left: 0, right: 44, top: 200, bottom: 244 },
			},
			viewport,
		)).toBe("hidden");
	});

	it("falls back to icon when only the labeled candidate sits outside the viewport", () => {
		expect(pickWatchButtonModeByLayout(
			{
				...fullLayout,
				button: { left: -12, right: 111, top: 104, bottom: 144 },
			},
			iconLayout,
			viewport,
		)).toBe("icon");
	});
});
