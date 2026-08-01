import { describe, expect, it } from "vitest";
import { parkIn } from "./transitions";

describe("parkIn", () => {
	it("can skip the intro transition for already-hydrated content", () => {
		const transition = parkIn({} as Element, { skip: true });

		expect(transition.delay).toBe(0);
		expect(transition.duration).toBe(0);
		expect(transition.css?.(0.5, 0.5)).toBe("");
	});
});
