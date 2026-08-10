import { describe, expect, it } from "vitest";
import { BRAND_MARK_SVG, brandMarkSvg } from "./brand-mark";

describe("TubePark brand mark", () => {
	it("keeps the selected Park Loop construction in one shared SVG source", () => {
		expect(BRAND_MARK_SVG).toContain('fill="#192c20"');
		expect(BRAND_MARK_SVG).toContain('stroke="#d9f27c"');
		expect(BRAND_MARK_SVG).toContain('stroke="#f7efe4"');
		expect(BRAND_MARK_SVG).toContain('fill="#ff715b"');
		expect(BRAND_MARK_SVG).toContain('d="M78 53v108');
	});

	it("scales the same mark for small and large production surfaces", () => {
		const mark = brandMarkSvg(16);

		expect(mark).toContain('width="16" height="16"');
		expect(mark.match(/<path /g)).toHaveLength(2);
		expect(mark.match(/<circle /g)).toHaveLength(1);
	});
});
