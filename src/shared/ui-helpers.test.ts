import { describe, expect, it } from "vitest";
import {
	getParkableOtherTabCount,
	getParkAllLabel,
	positionFloatingMenu,
} from "./ui-helpers";

describe("getParkableOtherTabCount", () => {
	it("excludes the active watch tab from the bulk action", () => {
		expect(getParkableOtherTabCount(5, true)).toBe(4);
		expect(getParkableOtherTabCount(1, true)).toBe(0);
	});

	it("keeps every tab when the active tab is not a watch page", () => {
		expect(getParkableOtherTabCount(5, false)).toBe(5);
	});
});

describe("getParkAllLabel", () => {
	it("describes whether the active tab is intentionally excluded", () => {
		expect(getParkAllLabel(true)).toBe("Park other YouTube tabs");
		expect(getParkAllLabel(false)).toBe("Park all YouTube tabs");
	});
});

describe("positionFloatingMenu", () => {
	it("flips above the anchor when there is not enough room below", () => {
		expect(
			positionFloatingMenu(
				{ top: 260, right: 240, bottom: 284 },
				{ width: 120, height: 80 },
				{ width: 320, height: 320 },
			),
		).toEqual({ top: 176, left: 120 });
	});

	it("keeps the menu inside the viewport horizontally", () => {
		expect(
			positionFloatingMenu(
				{ top: 10, right: 310, bottom: 34 },
				{ width: 160, height: 80 },
				{ width: 300, height: 320 },
			),
		).toEqual({ top: 38, left: 132 });
	});
});
