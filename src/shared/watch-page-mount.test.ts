import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import {
	chooseWatchButtonMode,
	fitsWatchButtonInActionRow,
	resolveShortsActionRail,
	resolveWatchActionRow,
	resolveWatchButtonTextColor,
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
