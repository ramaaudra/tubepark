import brandMarkSource from "./brand-mark.svg?raw";

/** Canonical Park Loop mark. Keep all production brand surfaces on this source. */
export const BRAND_MARK_SVG = brandMarkSource.trim();

const CANONICAL_SIZE = 'width="256" height="256"';

export function brandMarkSvg(size: number): string {
	return BRAND_MARK_SVG.replace(
		CANONICAL_SIZE,
		`width="${size}" height="${size}"`,
	);
}
