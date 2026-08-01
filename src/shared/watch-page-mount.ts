export type WatchButtonMode = "full" | "icon" | "hidden";

export interface WatchPageMountTarget {
	container: HTMLElement;
	before: Element | null;
}

export interface WatchButtonSpace {
	availableWidth: number;
	fullWidth: number;
	iconWidth: number;
	availableHeight?: number;
	requiredHeight?: number;
}

export interface WatchButtonRect {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

const TUBEPARK_BUTTON_SELECTOR = "[data-tubepark-watch-button]";

function hasLayout(element: Element): boolean {
	const rect = element.getBoundingClientRect();
	return rect.width > 0 || rect.height > 0;
}

function firstVisible<T extends HTMLElement>(elements: Iterable<T>): T | null {
	let first: T | null = null;
	for (const element of elements) {
		first ??= element;
		if (hasLayout(element)) return element;
	}
	return first;
}

function findInsertionPoint(container: HTMLElement): Element | null {
	const children = Array.from(container.children);
	let fallback: Element | null = null;

	for (let index = children.length - 1; index >= 0; index -= 1) {
		const child = children[index];
		if (child.matches(TUBEPARK_BUTTON_SELECTOR)) continue;
		fallback ??= child;
		if (hasLayout(child)) return child;
	}

	return fallback;
}

export function resolveWatchActionRow(document: Document): WatchPageMountTarget | null {
	const renderer = firstVisible(
		document.querySelectorAll<HTMLElement>("ytd-watch-metadata ytd-menu-renderer"),
	);
	if (!renderer) return null;
	return { container: renderer, before: findInsertionPoint(renderer) };
}

export function resolveShortsActionRail(document: Document): WatchPageMountTarget | null {
	const rail = firstVisible(document.querySelectorAll<HTMLElement>("reel-action-bar-view-model"));
	if (!rail) return null;
	return { container: rail, before: findInsertionPoint(rail) };
}

export function chooseWatchButtonMode(space: WatchButtonSpace): WatchButtonMode {
	if (
		space.availableHeight !== undefined &&
		space.requiredHeight !== undefined &&
		space.availableHeight < space.requiredHeight
	) {
		return "hidden";
	}
	if (space.availableWidth >= space.fullWidth) return "full";
	if (space.availableWidth >= space.iconWidth) return "icon";
	return "hidden";
}

function rectsOverlap(a: WatchButtonRect, b: WatchButtonRect): boolean {
	return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

export function fitsWatchButtonInActionRow(
	button: WatchButtonRect,
	container: WatchButtonRect,
	siblings: WatchButtonRect[],
): boolean {
	if (
		button.left < container.left - 1
		|| button.right > container.right + 1
	) {
		return false;
	}
	return siblings.every((sibling) => !rectsOverlap(button, sibling));
}

export function resolveWatchButtonTextColor(inheritedColor: string | null | undefined): string {
	return inheritedColor?.trim() || "#fff";
}
