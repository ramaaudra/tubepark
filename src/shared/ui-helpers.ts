export interface FloatingAnchorRect {
	top: number;
	right: number;
	bottom: number;
}

export interface FloatingMenuSize {
	width: number;
	height: number;
}

export interface ViewportSize {
	width: number;
	height: number;
}

export interface FloatingMenuPosition {
	top: number;
	left: number;
}

export function getParkableOtherTabCount(
	openWatchTabCount: number,
	currentTabIsWatch: boolean,
): number {
	return Math.max(0, openWatchTabCount - (currentTabIsWatch ? 1 : 0));
}

export function getParkAllLabel(currentTabIsWatch: boolean): string {
	return currentTabIsWatch ? "Park other YouTube tabs" : "Park all YouTube tabs";
}

/** Position a fixed popover below its trigger, flipping above and clamping
 * both axes when the available viewport space is tight. */
export function positionFloatingMenu(
	anchor: FloatingAnchorRect,
	menu: FloatingMenuSize,
	viewport: ViewportSize,
	gap: number = 4,
	padding: number = 8,
): FloatingMenuPosition {
	const maxLeft = Math.max(padding, viewport.width - menu.width - padding);
	const left = Math.max(padding, Math.min(anchor.right - menu.width, maxLeft));
	const belowTop = anchor.bottom + gap;
	const aboveTop = anchor.top - menu.height - gap;
	const maxTop = Math.max(padding, viewport.height - menu.height - padding);
	const top =
		belowTop + menu.height <= viewport.height - padding
			? belowTop
			: Math.max(padding, Math.min(aboveTop, maxTop));

	return { top, left };
}
