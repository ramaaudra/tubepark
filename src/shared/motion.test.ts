import { describe, it, expect } from "vitest";
import { resolveMotion, staggerDelay, flyChipPath } from "./motion";

describe("resolveMotion", () => {
	it("returns spring presets when motion is not reduced", () => {
		const motion = resolveMotion(false);
		expect(motion.snappy).toEqual({
			type: "spring",
			stiffness: 400,
			damping: 28,
		});
		expect(motion.gentle).toEqual({
			type: "spring",
			stiffness: 170,
			damping: 22,
		});
	});

	it("collapses every preset to a 150ms fade tween when reduced", () => {
		const motion = resolveMotion(true);
		expect(motion.snappy).toEqual({ type: "tween", duration: 150 });
		expect(motion.gentle).toEqual({ type: "tween", duration: 150 });
	});
});

describe("staggerDelay", () => {
	it("is zero for the first item", () => {
		expect(staggerDelay(0)).toBe(0);
	});

	it("multiplies index by the base delay", () => {
		expect(staggerDelay(2)).toBe(80);
	});

	it("caps the delay at the fifth step", () => {
		expect(staggerDelay(10)).toBe(200);
	});

	it("honours a custom base and cap", () => {
		expect(staggerDelay(2, { base: 30, cap: 3 })).toBe(60);
		expect(staggerDelay(9, { base: 30, cap: 3 })).toBe(90);
	});

	it("is always zero when motion is reduced", () => {
		expect(staggerDelay(3, { reduced: true })).toBe(0);
	});
});

describe("flyChipPath", () => {
	it("reports the straight delta and a quarter-distance arc", () => {
		expect(flyChipPath({ x: 0, y: 0 }, { x: 0, y: 200 })).toEqual({
			dx: 0,
			dy: 200,
			arc: 50,
		});
	});

	it("floors the arc at 24px for short hops", () => {
		expect(flyChipPath({ x: 0, y: 0 }, { x: 0, y: 96 }).arc).toBe(24);
		expect(flyChipPath({ x: 50, y: 50 }, { x: 10, y: 50 })).toEqual({
			dx: -40,
			dy: 0,
			arc: 24,
		});
	});

	it("caps the arc at 64px for long flights", () => {
		expect(flyChipPath({ x: 0, y: 0 }, { x: 0, y: 1000 }).arc).toBe(64);
	});

	it("degenerates to zero when origin equals destination", () => {
		expect(flyChipPath({ x: 30, y: 30 }, { x: 30, y: 30 })).toEqual({
			dx: 0,
			dy: 0,
			arc: 0,
		});
	});
});
