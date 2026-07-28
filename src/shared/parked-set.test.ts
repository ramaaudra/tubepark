import { describe, expect, it } from "vitest";
import { parkedVideoIds, parkToastMessage, withoutPendingIds } from "./parked-set";

const video = (id: string) => ({ id, title: id, channel: "Channel", addedAt: 1 });

describe("parked content-script state", () => {
	it("derives parked ids from the visible queue", () => {
		expect([...parkedVideoIds([video("a"), video("b")])]).toEqual(["a", "b"]);
	});

	it("optimistically removes pending ids without mutating the prior set", () => {
		const current = new Set(["a", "b"]);
		expect([...withoutPendingIds(current, ["a"])]).toEqual(["b"]);
		expect([...current]).toEqual(["a", "b"]);
	});

	it("names an auto-assigned collection in the park toast", () => {
		expect(parkToastMessage("Video", "Belajar")).toBe("Parked to Belajar");
		expect(parkToastMessage("Video", null)).toBe('Parked: "Video"');
	});
});
