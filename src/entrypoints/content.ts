import { defineContentScript } from "wxt/utils/define-content-script";
import {
	type CardMeta,
	buildWatchPagePayload,
	cleanYouTubeTitle,
	computeButtonPosition,
	extractYouTubeVideoId,
	readMainVideoCurrentTime,
	resolveCardMeta,
	resolveThumbnail,
	resolveWatchPageChannel,
	YOUTUBE_VIDEO_CARD_SELECTORS,
} from "../shared/capture-predicates";
import { type IconName, type IconPath, icons } from "../shared/icons";
import { MSG } from "../shared/messages";
import type { ParkedVideo } from "../shared/types";
import { parkedVideoIds, parkToastMessage, withoutPendingIds } from "../shared/parked-set";
import {
	runtimeAvailable,
	sendRuntimeMessage,
	sendRuntimeMessageAsync,
} from "../shared/runtime";
import {
	chooseWatchButtonMode,
	pickWatchButtonModeByLayout,
	resolveShortsActionRail,
	resolveWatchActionRow,
	resolveWatchButtonTextColor,
	type WatchButtonMode,
	type WatchButtonLayoutSnapshot,
	type WatchButtonRect,
	type WatchPageMountTarget,
} from "../shared/watch-page-mount";

const PARK_BTN_CLASS = "tubepark-park-btn";
const PARK_BTN_ATTR = "data-tubepark-video-id";
const WATCH_BTN_ATTR = "data-tubepark-watch-button";
const TOAST_ID = "tubepark-toast";
const PARK_ICON_SIZE = 16;
const WATCH_BTN_ICON_SIZE = 18;

/**
 * Render a Phosphor icon from shared `icons.ts` path data as inline SVG —
 * byte-for-byte the duotone markup `Icon.svelte` produces (secondary path at
 * 0.2 opacity), so the content-script button matches the popup/side-panel icons.
 * The content script is vanilla DOM injected into YouTube and cannot mount the
 * Svelte component, hence this string renderer over the single source of truth.
 */
function svgMarkup(name: IconName, size = PARK_ICON_SIZE): string {
	const paths = (icons[name] as readonly IconPath[])
		.map((p) => `<path d="${p.d}" opacity="${p.secondary ? 0.2 : 1}"/>`)
		.join("");
	return `<svg viewBox="0 0 256 256" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${paths}</svg>`;
}

function showToast(message: string, variant: "success" | "duplicate" | "full", onUndo?: () => void) {
	const existing = document.getElementById(TOAST_ID);
	if (existing) existing.remove();

	const toast = document.createElement("div");
	toast.id = TOAST_ID;
	toast.className = `tubepark-toast tubepark-toast-${variant}`;
	toast.textContent = message;
	if (onUndo) {
		const undo = document.createElement("button");
		undo.type = "button";
		undo.className = "tubepark-toast-undo";
		undo.textContent = "Undo";
		undo.onclick = () => { onUndo(); toast.remove(); };
		toast.append(" ", undo);
	}

	document.body.appendChild(toast);

	requestAnimationFrame(() => {
		toast.classList.add("tubepark-toast-visible");
	});

	setTimeout(() => {
		toast.classList.remove("tubepark-toast-visible");
		setTimeout(() => toast.remove(), 300);
	}, onUndo ? 5000 : 2000);
}

const QUEUE_FULL_MSG = "Queue full (200/200) — remove old videos first.";

/** Surface a park result as a toast. Shared by the hover-button and context-menu
 * park paths, which both show the full success/duplicate/full cascade. The
 * watch-page "park & close" path does NOT use this — it only toasts on `full`
 * (success/duplicate close the tab, so a toast would never render before the
 * content script dies). */
function showParkResult(
	result: { success?: boolean; duplicate?: boolean; full?: boolean; collection?: string | null },
	title: string,
): void {
	if (result?.success) showToast(parkToastMessage(title, result.collection), "success");
	else if (result?.duplicate) showToast(`Already in queue: "${title}"`, "duplicate");
	else if (result?.full) showToast(QUEUE_FULL_MSG, "full");
}

const CARD_SELECTOR = YOUTUBE_VIDEO_CARD_SELECTORS.join(",");
const PARK_BTN_SIZE = 28;
const WATCH_BTN_CLASS = "tubepark-watch-park-btn";
const WATCH_BTN_COMPACT_CLASS = "tubepark-watch-park-btn-compact";
const WATCH_BTN_HIDDEN_CLASS = "tubepark-watch-park-btn-hidden";
const WATCH_BTN_SHORTS_CLASS = "tubepark-watch-park-btn-shorts";
const WATCH_BTN_ICON_WIDTH = 44;
const WATCH_BTN_REQUIRED_HEIGHT = 44;
const WATCH_MENU_ITEM_ATTR = "data-tubepark-watch-menu-item";
/** Time after a click on the watch-page 3-dot trigger during which we treat a
 * newly opened popup as the watch actions menu (and inject our item into it). */
const WATCH_MENU_TRIGGER_WINDOW_MS = 1500;

/**
 * A single floating park button, portaled to <body> and positioned over whichever
 * video card the pointer is currently on.
 *
 * Why not a per-card button toggled by CSS `:hover` (the previous approach)?
 * YouTube's hover-preview <video> is a DOM PORTAL under <ytd-app>, not a descendant
 * of the card. Two consequences broke the old design:
 *   1. Once the pointer sits over the preview, native `card:hover` STOPS matching
 *      (the pointer's real ancestry runs through the portal, not the card), so a
 *      CSS `card:hover .btn { opacity: 1 }` rule reverts the button to opacity 0.
 *   2. The preview portal paints above the card's own stacking context, so a
 *      button nested in the card loses the z-index fight regardless of its value.
 * This module sidesteps both: pointer position → card via geometry (elementsFromPoint,
 * which surfaces the card even under the portal), and a body-level fixed button with
 * a max z-index that escapes every nested stacking context.
 */
class FloatingParkButton {
	private readonly btn: HTMLButtonElement;
	private activeCard: HTMLElement | null = null;
	private activeMeta: CardMeta | null = null;
	private rafPending = false;
	private parkedIds = new Set<string>();
	private lastX = 0;
	private lastY = 0;

	constructor() {
		const btn = document.createElement("button");
		btn.className = PARK_BTN_CLASS;
		btn.type = "button";
		btn.title = "Park to TubePark";
		btn.innerHTML = svgMarkup("pin");
		btn.addEventListener("click", this.onClick);
		document.body.appendChild(btn);
		this.btn = btn;
		void this.syncParkedIds();

		document.addEventListener("pointermove", this.onPointerMove, {
			passive: true,
		});
		// Reposition (not hide) while scrolling so the button tracks its card.
		window.addEventListener("scroll", this.onScroll, {
			passive: true,
			capture: true,
		});
	}

	setParkedIds(ids: Set<string>) {
		this.parkedIds = ids;
		this.renderState();
	}

	getParkedIds(): ReadonlySet<string> {
		return this.parkedIds;
	}

	private syncParkedIds = async () => {
		const state = await sendRuntimeMessageAsync<{ queue?: ParkedVideo[] }>({ type: MSG.GET_QUEUE });
		this.setParkedIds(parkedVideoIds(state?.queue ?? []));
	};

	private renderState() {
		const parked = !!this.activeMeta && this.parkedIds.has(this.activeMeta.videoId);
		this.btn.innerHTML = svgMarkup(parked ? "pinFill" : "pin");
		this.btn.classList.toggle("tubepark-park-btn-parked", parked);
		this.btn.title = parked ? "Remove from TubePark" : "Park to TubePark";
	}

	private onPointerMove = (e: PointerEvent) => {
		this.lastX = e.clientX;
		this.lastY = e.clientY;
		if (this.rafPending) return;
		this.rafPending = true;
		requestAnimationFrame(this.update);
	};

	private update = () => {
		this.rafPending = false;
		const card = this.locateCardAt(this.lastX, this.lastY);
		if (!card || !card.isConnected) {
			this.hide();
			return;
		}
		if (card !== this.activeCard) {
			const meta = resolveCardMeta(card, location.pathname);
			if (!meta) {
				this.hide();
				return;
			}
			this.activeCard = card;
			this.activeMeta = meta;
			this.btn.setAttribute(PARK_BTN_ATTR, meta.videoId);
			this.renderState();
		}
		this.positionOver(card);
	};

	private onScroll = () => {
		if (!this.activeCard) return;
		if (!this.activeCard.isConnected) {
			this.hide();
			return;
		}
		this.positionOver(this.activeCard);
	};

	/**
	 * Resolve the video card under a point. `elementsFromPoint` is used instead of
	 * `elementFromPoint` because YouTube's preview portal sits on top of the card;
	 * the plural form still lists the card lower in the stack. When the pointer is
	 * over our own button, keep the current card so the button doesn't self-dismiss.
	 */
	private locateCardAt(x: number, y: number): HTMLElement | null {
		const stack = document.elementsFromPoint(x, y);
		for (const el of stack) {
			if (el === this.btn) return this.activeCard;
			const card = (el as HTMLElement).closest?.<HTMLElement>(CARD_SELECTOR);
			if (card) return card;
		}
		return null;
	}

	private positionOver(card: HTMLElement) {
		// Anchor to the thumbnail, not the whole card: the card's bottom sits
		// below the title/metadata text, so a card-anchored inset landed the
		// button over the text (the bug). resolveThumbnail falls back to the card
		// only if no thumbnail sub-element is found.
		const anchor = resolveThumbnail(card) ?? card;
		const rect = anchor.getBoundingClientRect();
		const { left, top } = computeButtonPosition(rect, PARK_BTN_SIZE);
		this.btn.style.left = `${left}px`;
		this.btn.style.top = `${top}px`;
		this.btn.style.display = "flex";
	}

	private hide() {
		this.btn.style.display = "none";
		this.activeCard = null;
		this.activeMeta = null;
	}

	/** Tear down DOM + page listeners when WXT invalidates this script
	 * (extension reload / newer script started in dev). */
	dispose() {
		this.btn.remove();
		document.removeEventListener("pointermove", this.onPointerMove);
		window.removeEventListener("scroll", this.onScroll);
	}

	private onClick = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const meta = this.activeMeta;
		if (!meta) return;
		if (!runtimeAvailable()) return;

		if (this.parkedIds.has(meta.videoId)) {
			this.parkedIds.delete(meta.videoId);
			this.renderState();
			sendRuntimeMessage(
				{ type: MSG.PENDING_REMOVE, ids: [meta.videoId] },
				() => showToast("Removed", "success", () => {
					sendRuntimeMessage({ type: MSG.CANCEL_REMOVE }, () => void this.syncParkedIds());
				}),
			);
			return;
		}

		const payload: ParkedVideo = {
			id: meta.videoId,
			title: meta.title,
			channel: meta.channel,
			addedAt: Date.now(),
			durationSec: meta.durationSec,
		};

		this.btn.innerHTML = svgMarkup("clock");
		sendRuntimeMessage(
			{ type: "PARK_VIDEO_REQUEST", payload },
			(result) => {
				if (result?.success) {
					this.parkedIds.add(meta.videoId);
					this.flash("check");
				} else if (result?.duplicate) {
					this.flash("pinFill");
				} else if (result?.full) {
					this.flash("warning");
				} else {
					this.btn.innerHTML = svgMarkup("pin");
					return;
				}
				showParkResult(result, meta.title);
			},
		);
	};

	private flash(icon: IconName) {
		this.btn.innerHTML = svgMarkup(icon);
		setTimeout(() => this.renderState(), 2000);
	}
}

/**
 * Invoke `cb` whenever the YouTube SPA navigates (URL changes) without a full
 * reload. YouTube is a single-page app: clicking another video updates the URL
 * via history.pushState, so the content script keeps running but the watch-page
 * button's videoId/state go stale. Three signals, all idempotent (cb re-resolves
 * from `location.href` and only re-renders on real change):
 *   - `yt-navigate-finish` — YouTube's canonical post-navigation event.
 *   - `popstate` — browser back/forward.
 *   - a 1s `location.href` poll — safety net for any transition the events miss.
 */
function onLocationChange(cb: () => void): () => void {
	const invoke = () => cb();
	document.addEventListener("yt-navigate-finish", invoke);
	window.addEventListener("popstate", invoke);
	const poll = setInterval(invoke, 1000);
	return () => {
		document.removeEventListener("yt-navigate-finish", invoke);
		window.removeEventListener("popstate", invoke);
		clearInterval(poll);
	};
}

type WatchPagePlacement = "watch" | "shorts";

function isWatchPagePath(pathname: string): boolean {
	return pathname === "/watch" || pathname === "/watch/";
}

function isShortsPagePath(pathname: string): boolean {
	return pathname.startsWith("/shorts/");
}

/**
 * Park-and-close control for the main video. The button is mounted into
 * YouTube's own action row (or Shorts action rail) so it participates in the
 * layout instead of painting over live-chat/player controls.
 *
 * The placement resolver is deliberately isolated in `watch-page-mount.ts`:
 * YouTube's DOM is an integration seam, while capture and click semantics stay
 * independent. A MutationObserver retries the mount after SPA rerenders; when
 * no native mount exists, the button stays absent rather than becoming a
 * viewport overlay.
 */
class WatchPageParkButton {
	private readonly btn: HTMLButtonElement;
	private parkedIds = new Set<string>();
	private currentVideoId: string | null = null;
	private placement: WatchPagePlacement | null = null;
	private mountTarget: WatchPageMountTarget | null = null;
	private refreshPending = false;
	private observer: MutationObserver | null = null;
	private stopLocationWatch: (() => void) | null = null;
	/** Timestamp of the last click on the watch-page "More actions" trigger.
	 * Used to scope overflow-menu injection to the popup that click opened. */
	private overflowTriggerClickedAt = 0;
	/** Element currently listening to for overflow-trigger clicks. Re-attached
	 * if YouTube replaces the button during a re-render. */
	private overflowTriggerEl: HTMLElement | null = null;

	constructor() {
		const btn = document.createElement("button");
		btn.className = WATCH_BTN_CLASS;
		btn.type = "button";
		btn.setAttribute(WATCH_BTN_ATTR, "true");
		btn.innerHTML = `<span class="tubepark-watch-park-icon">${svgMarkup("pin", WATCH_BTN_ICON_SIZE)}</span><span class="tubepark-watch-park-label">Park &amp; close</span>`;
		btn.setAttribute("aria-label", "Park to TubePark and close this tab");
		btn.title = "Park to TubePark & close this tab";
		btn.addEventListener("click", this.onClick);
		this.btn = btn;
		void this.syncParkedIds();
		this.refresh();
		this.stopLocationWatch = onLocationChange(this.scheduleRefresh);
		window.addEventListener("resize", this.scheduleRefresh, { passive: true });

		if (document.body && typeof MutationObserver !== "undefined") {
			this.observer = new MutationObserver(this.onDomMutation);
			this.observer.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["class", "hidden", "style"],
			});
		}
	}

	setParkedIds(ids: Set<string>) {
		this.parkedIds = ids;
		this.renderState();
	}

	private syncParkedIds = async () => {
		const state = await sendRuntimeMessageAsync<{ queue?: ParkedVideo[] }>({ type: MSG.GET_QUEUE });
		this.setParkedIds(parkedVideoIds(state?.queue ?? []));
	};

	private refresh = () => {
		const videoId = extractYouTubeVideoId(location.href);
		const pathname = location.pathname;
		const placement: WatchPagePlacement | null = isShortsPagePath(pathname)
			? "shorts"
			: isWatchPagePath(pathname)
				? "watch"
				: null;

		if (!videoId || !placement) {
			this.currentVideoId = null;
			this.unmount();
			return;
		}

		this.currentVideoId = videoId;
		this.btn.setAttribute(PARK_BTN_ATTR, videoId);
		this.renderState();

		const target = placement === "shorts"
			? resolveShortsActionRail(document)
			: resolveWatchActionRow(document);
		if (!target) {
			this.unmount();
			return;
		}

		this.mount(target, placement);
		this.attachOverflowTrigger();
		this.applyMode();
	};

	private renderState() {
		const parked = this.currentVideoId !== null && this.parkedIds.has(this.currentVideoId);
		const icon = parked ? "pinFill" : "pin";
		if (this.btn.dataset.tubeparkIcon !== icon) {
			this.btn.innerHTML = `<span class="tubepark-watch-park-icon">${svgMarkup(icon, WATCH_BTN_ICON_SIZE)}</span><span class="tubepark-watch-park-label">Park &amp; close</span>`;
			this.btn.dataset.tubeparkIcon = icon;
		}
		this.btn.classList.toggle("tubepark-watch-park-btn-parked", parked);
		const label = parked
			? "Already in TubePark — click to park and close this tab"
			: "Park to TubePark and close this tab";
		this.btn.title = label;
		this.btn.setAttribute("aria-label", label);
	}

	private scheduleRefresh = () => {
		if (this.refreshPending) return;
		this.refreshPending = true;
		requestAnimationFrame(() => {
			this.refreshPending = false;
			this.refresh();
		});
	}

	private onDomMutation = (mutations: MutationRecord[]) => {
		// The mode measurement temporarily toggles this button's inline display;
		// those self-mutations must not schedule an endless refresh loop. Changes
		// whose target is inside the button are likewise local rendering work.
		if (mutations.every(({ target }) => target === this.btn || this.btn.contains(target))) return;
		this.scheduleRefresh();
	};

	private mount(target: WatchPageMountTarget, placement: WatchPagePlacement) {
		const isInTarget = this.btn.parentElement === target.container;
		const next = this.btn.nextElementSibling;
		const insertionChanged = target.before
			? next !== target.before
			: next !== null;
		if (!isInTarget || insertionChanged) {
			target.container.insertBefore(this.btn, target.before);
		}
		this.mountTarget = target;
		this.placement = placement;
		this.btn.classList.toggle(WATCH_BTN_SHORTS_CLASS, placement === "shorts");
	}

	private unmount() {
		this.detachOverflowTrigger();
		this.clearOverflowMenuItems();
		this.btn.remove();
		this.mountTarget = null;
		this.placement = null;
		this.setMode("hidden");
	}

	/** Tear down DOM, page listeners, and the MutationObserver when WXT
	 * invalidates this script (extension reload / newer script started in dev). */
	dispose() {
		this.stopLocationWatch?.();
		this.observer?.disconnect();
		window.removeEventListener("resize", this.scheduleRefresh);
		this.detachOverflowTrigger();
		this.clearOverflowMenuItems();
		this.btn.remove();
	}

	private setMode(mode: WatchButtonMode) {
		this.btn.classList.toggle(WATCH_BTN_COMPACT_CLASS, mode === "icon");
		this.btn.classList.toggle(WATCH_BTN_HIDDEN_CLASS, mode === "hidden");
		this.btn.dataset.tubeparkMode = mode;
	}

	private applyMode() {
		if (!this.mountTarget || !this.placement || !this.btn.isConnected) return;
		this.btn.style.color = resolveWatchButtonTextColor(
			getComputedStyle(this.mountTarget.container).color,
		);

		if (this.placement === "shorts") {
			this.setMode("icon");
			const rect = this.btn.getBoundingClientRect();
			const safeTop = 56;
			const safeBottom = window.innerHeight - 8;
			const fitsVertically = rect.height >= WATCH_BTN_REQUIRED_HEIGHT
				&& rect.top >= safeTop
				&& rect.bottom <= safeBottom;
			const mode = chooseWatchButtonMode({
				availableWidth: rect.width,
				// Shorts is always icon-only; make the labeled branch intentionally
				// unavailable while still using the shared fit decision for hidden.
				fullWidth: WATCH_BTN_ICON_WIDTH + 1,
				iconWidth: WATCH_BTN_ICON_WIDTH,
				availableHeight: fitsVertically ? WATCH_BTN_REQUIRED_HEIGHT : 0,
				requiredHeight: WATCH_BTN_REQUIRED_HEIGHT,
			});
			this.setMode(mode);
			this.syncOverflowMenuItem();
			return;
		}

		// Watch-page real-layout mode decision: actually insert the button at
		// each candidate mode, measure the rendered rect, and accept the largest
		// candidate that stays on the first line, doesn't overlap a sibling, fits
		// inside the container box, and is on-screen. The previous
		// containerWidth − nativeSpan arithmetic miscounted YouTube's leading
		// gap and off-screen overflow, and the overlap-only guard never caught
		// a button that wrapped to a second line (which still passed
		// fitsWatchButtonInActionRow because line-2 doesn't overlap line-1).
		this.setMode("full");
		const fullLayout = this.captureWatchLayout();
		this.setMode("icon");
		const iconLayout = this.captureWatchLayout();
		const viewport = this.getViewportRect();
		const mode = pickWatchButtonModeByLayout(fullLayout, iconLayout, viewport);
		this.setMode(mode);
		this.syncOverflowMenuItem();
	}

	private captureWatchLayout(): WatchButtonLayoutSnapshot {
		return {
			button: this.toWatchButtonRect(this.btn.getBoundingClientRect()),
			container: this.toWatchButtonRect(this.mountTarget!.container.getBoundingClientRect()),
			siblings: this.collectSiblingRects(),
		};
	}

	private collectSiblingRects(): WatchButtonRect[] {
		if (!this.mountTarget) return [];
		return Array.from(this.mountTarget.container.children)
			.filter((child) => child !== this.btn)
			.map((child) => child.getBoundingClientRect())
			.filter((rect) => rect.width > 0 && rect.height > 0)
			.map((rect) => this.toWatchButtonRect(rect));
	}

	private toWatchButtonRect(rect: DOMRect | { left: number; right: number; top: number; bottom: number }): WatchButtonRect {
		return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
	}

	private getViewportRect(): WatchButtonRect {
		return { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
	}

	private attachOverflowTrigger() {
		const next = this.placement === "watch" ? this.findOverflowTrigger() : null;
		if (next === this.overflowTriggerEl) return;
		// YouTube can replace the trigger while opening its popup. Keep the
		// click timestamp across that replacement so the newly attached listener
		// still authorizes the popup item injection.
		const preserveClick = next !== null && this.overflowTriggerClickedAt > 0;
		this.detachOverflowTrigger(!preserveClick);
		this.overflowTriggerEl = next;
		next?.addEventListener("click", this.onOverflowTriggerClick, true);
	}

	private detachOverflowTrigger(clearClick = true) {
		this.overflowTriggerEl?.removeEventListener("click", this.onOverflowTriggerClick, true);
		this.overflowTriggerEl = null;
		if (clearClick) this.overflowTriggerClickedAt = 0;
	}

	private findOverflowTrigger(): HTMLElement | null {
		if (!this.mountTarget) return null;
		return Array.from(
			this.mountTarget.container.querySelectorAll<HTMLElement>(
				'button[aria-label="More actions"], [role="button"][aria-label="More actions"]',
			),
		).find((element) => this.isVisibleElement(element)) ?? null;
	}

	private onOverflowTriggerClick = () => {
		this.overflowTriggerClickedAt = Date.now();
		requestAnimationFrame(() => {
			requestAnimationFrame(() => this.syncOverflowMenuItem());
		});
	};

	private isVisibleElement(element: HTMLElement): boolean {
		const style = getComputedStyle(element);
		if (style.display === "none" || style.visibility === "hidden") return false;
		const rect = element.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	}

	private findOverflowPopup(): HTMLElement | null {
		const popups = Array.from(
			document.querySelectorAll<HTMLElement>("ytd-menu-popup-renderer"),
		).filter((popup) => {
			const list = popup.querySelector<HTMLElement>("tp-yt-paper-listbox#items");
			return !!list && this.isVisibleElement(popup) && this.isVisibleElement(list);
		});
		if (popups.length === 0) return null;
		if (!this.overflowTriggerEl) return popups[0];

		const trigger = this.overflowTriggerEl.getBoundingClientRect();
		const triggerX = (trigger.left + trigger.right) / 2;
		const triggerY = (trigger.top + trigger.bottom) / 2;
		return popups.reduce((closest, popup) => {
			const current = popup.getBoundingClientRect();
			const currentX = (current.left + current.right) / 2;
			const currentY = (current.top + current.bottom) / 2;
			const closestRect = closest.getBoundingClientRect();
			const closestX = (closestRect.left + closestRect.right) / 2;
			const closestY = (closestRect.top + closestRect.bottom) / 2;
			const currentDistance = Math.hypot(currentX - triggerX, currentY - triggerY);
			const closestDistance = Math.hypot(closestX - triggerX, closestY - triggerY);
			return currentDistance < closestDistance ? popup : closest;
		});
	}

	private clearOverflowMenuItems() {
		document.querySelectorAll<HTMLElement>(`[${WATCH_MENU_ITEM_ATTR}]`).forEach((item) => item.remove());
	}

	private syncOverflowMenuItem() {
		const marker = `[${WATCH_MENU_ITEM_ATTR}]`;
		const eligible = this.placement === "watch" && this.btn.dataset.tubeparkMode === "hidden";
		const markedItems = Array.from(document.querySelectorAll<HTMLElement>(marker));
		for (const item of markedItems) {
			const popup = item.closest<HTMLElement>("ytd-menu-popup-renderer");
			if (!eligible || !popup || !this.isVisibleElement(popup)) item.remove();
		}

		if (!eligible || Date.now() - this.overflowTriggerClickedAt > WATCH_MENU_TRIGGER_WINDOW_MS) return;
		const popup = this.findOverflowPopup();
		const list = popup?.querySelector<HTMLElement>("tp-yt-paper-listbox#items");
		if (!list || list.querySelector(marker)) return;

		// Use a plain element inside YouTube's native listbox. YouTube's custom
		// ytd-menu-service-item-renderer rebuilds its children when upgraded,
		// which would discard a dynamically supplied label; the surrounding
		// popup still provides the native menu surface and focus context.
		const item = document.createElement("div");
		item.setAttribute(WATCH_MENU_ITEM_ATTR, "true");
		item.setAttribute("aria-label", "Park & close tab");
		item.setAttribute("role", "menuitem");
		item.setAttribute("tabindex", "0");
		const label = document.createElement("span");
		label.className = "tubepark-watch-menu-label";
		label.textContent = "Park & close tab";
		item.append(label);
		item.addEventListener("click", this.onOverflowMenuClick);
		item.addEventListener("keydown", this.onOverflowMenuKeyDown);
		list.append(item);
	}

	private onOverflowMenuClick = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		this.doParkAndClose();
	};

	private onOverflowMenuKeyDown = (e: KeyboardEvent) => {
		if (e.key !== "Enter" && e.key !== " ") return;
		e.preventDefault();
		e.stopPropagation();
		this.doParkAndClose();
	};

	private doParkAndClose() {
		if (!this.currentVideoId) return;
		if (!runtimeAvailable()) return;
		// Build the payload at click time so `resumeAt` reflects the current
		// playback position (the user may have been watching since the last
		// refresh). Pure helper — unit-tested in capture-predicates.
		const payload = buildWatchPagePayload(location.href, document);
		if (!payload) return;
		// sendRuntimeMessage swallows the "Extension context invalidated" throw a
		// stale script hits after the extension is reloaded/updated — without it
		// this click would die silently before the park message is ever sent.
		sendRuntimeMessage(
			{ type: MSG.PARK_AND_CLOSE_TAB, payload },
			(result) => {
				// The tab is about to be closed on success/duplicate (background
				// calls chrome.tabs.remove). Only `full` keeps the tab alive —
				// surface it so the user knows the park was rejected. Intentionally
				// NOT showParkResult: success/duplicate toasts would never render
				// (the content script dies with the tab) — see showParkResult doc.
				if (result?.full) showToast(QUEUE_FULL_MSG, "full");
			},
		);
	}

	private onClick = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		this.doParkAndClose();
	};
}

function injectToastStyles() {
	if (document.getElementById("tubepark-toast-styles")) return;

	const style = document.createElement("style");
	style.id = "tubepark-toast-styles";
	style.textContent = `
    .tubepark-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1), transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      max-width: 320px;
      pointer-events: auto;
    }
    .tubepark-toast-visible {
      opacity: 1;
      transform: translateY(0);
    }
    .tubepark-toast-success { background-color: #15803d; }
    .tubepark-toast-duplicate { background-color: #a16207; }
    .tubepark-toast-full { background-color: #dc2626; }
    .tubepark-toast-undo { border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit; text-decoration: underline; }

    /*
     * Floating park button — portaled to <body>, positioned via JS.
     * position:fixed + max z-index escapes YouTube's nested stacking contexts
     * (including the hover-preview portal that used to paint over an in-card button).
     * Default hidden; FloatingParkButton toggles display:flex and sets left/top.
     */
    .${PARK_BTN_CLASS} {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 2147483647;
      width: ${PARK_BTN_SIZE}px;
      height: ${PARK_BTN_SIZE}px;
      border-radius: 6px;
      border: none;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      color: #fff;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      transition: transform 150ms ease, background 150ms ease;
      line-height: 1;
    }
    .${PARK_BTN_CLASS}.tubepark-park-btn-parked { color: #facc15; }
    .${PARK_BTN_CLASS}:hover {
      background: rgba(0, 0, 0, 0.85);
    }
    .${PARK_BTN_CLASS}:active {
      transform: scale(0.95);
    }

    /*
     * Watch-page "Park & close" is an inline action-row control. It must share
     * YouTube's layout so live-chat/player controls remain clickable. The
     * resolver mounts it before YouTube's overflow menu and switches it to the
     * compact icon when the row has less space. If even the icon cannot fit,
     * the control is hidden; it never becomes a viewport overlay.
     */
    .${WATCH_BTN_CLASS} {
      position: relative;
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-width: ${WATCH_BTN_ICON_WIDTH}px;
      width: auto;
      height: ${WATCH_BTN_REQUIRED_HEIGHT}px;
      margin-inline-start: 4px;
      padding: 0 12px;
      box-sizing: border-box;
      border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
      border-radius: 18px;
      background: color-mix(in srgb, currentColor 10%, transparent);
      color: inherit;
      font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      cursor: pointer;
      white-space: nowrap;
      transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
      vertical-align: middle;
    }
    .${WATCH_BTN_CLASS}.${WATCH_BTN_COMPACT_CLASS},
    .${WATCH_BTN_CLASS}.${WATCH_BTN_SHORTS_CLASS} {
      flex: 0 0 ${WATCH_BTN_ICON_WIDTH}px;
      width: ${WATCH_BTN_ICON_WIDTH}px;
      padding: 0;
      margin-inline-start: 4px;
    }
    .${WATCH_BTN_CLASS}.${WATCH_BTN_HIDDEN_CLASS} {
      display: none !important;
    }
    .${WATCH_BTN_CLASS} .tubepark-watch-park-icon {
      display: inline-flex;
      flex: 0 0 auto;
      color: #3b9b55;
    }
    .${WATCH_BTN_CLASS}.tubepark-watch-park-btn-parked .tubepark-watch-park-icon {
      color: #d7a500;
    }
    .${WATCH_BTN_CLASS}:hover {
      background: color-mix(in srgb, currentColor 18%, transparent);
      border-color: #3b9b55;
    }
    .${WATCH_BTN_CLASS}:focus-visible {
      outline: 2px solid var(--yt-spec-call-to-action, #3b9b55);
      outline-offset: 2px;
    }
    .${WATCH_BTN_CLASS}:active {
      background: color-mix(in srgb, currentColor 26%, transparent);
    }
    .${WATCH_BTN_CLASS} .tubepark-watch-park-label {
      white-space: nowrap;
    }
    .${WATCH_BTN_CLASS}.${WATCH_BTN_COMPACT_CLASS} .tubepark-watch-park-label {
      display: none;
    }
    .${WATCH_BTN_CLASS}.${WATCH_BTN_SHORTS_CLASS} {
      margin-inline-start: 0;
      border-radius: 50%;
      background: color-mix(in srgb, currentColor 10%, transparent);
    }
    .${WATCH_BTN_CLASS}.${WATCH_BTN_SHORTS_CLASS} .tubepark-watch-park-label {
      display: none;
    }
    .${WATCH_BTN_CLASS}.${WATCH_BTN_SHORTS_CLASS}:hover {
      background: color-mix(in srgb, currentColor 18%, transparent);
    }
    .${WATCH_BTN_CLASS}.${WATCH_BTN_SHORTS_CLASS}:focus-visible {
      outline-offset: 3px;
    }
    .${WATCH_BTN_CLASS}.${WATCH_BTN_SHORTS_CLASS}.tubepark-watch-park-btn-parked {
      border-color: transparent;
    }

    [${WATCH_MENU_ITEM_ATTR}] {
      display: block;
      min-height: 40px;
      box-sizing: border-box;
      cursor: pointer;
    }
    [${WATCH_MENU_ITEM_ATTR}] > .tubepark-watch-menu-label {
      display: block;
      padding: 0 16px;
      color: var(--yt-spec-text-primary, #0f0f0f);
      font: 14px/40px Roboto, Arial, sans-serif;
      white-space: nowrap;
    }
    [${WATCH_MENU_ITEM_ATTR}]:hover {
      background: var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.1));
    }
    [${WATCH_MENU_ITEM_ATTR}]:focus-visible {
      outline: 2px solid var(--yt-spec-call-to-action, #3b9b55);
      outline-offset: -2px;
    }

    /* Hover motion is pointer-gated so a touch tap can't fire a false scale. */
    @media (hover: hover) and (pointer: fine) {
      .${PARK_BTN_CLASS}:hover { transform: scale(1.05); }
    }

    /* Reduced motion: keep opacity/color, drop all transform movement. */
    @media (prefers-reduced-motion: reduce) {
      .tubepark-toast { transform: none; transition: opacity 150ms ease; }
      .${PARK_BTN_CLASS} {
        transition: background 150ms ease, border-color 150ms ease;
      }
      .${PARK_BTN_CLASS}:active { transform: none; }
      .${WATCH_BTN_CLASS} { transition: background 150ms ease, border-color 150ms ease, color 150ms ease; }
    }
  `;

	document.head.appendChild(style);
}

export default defineContentScript({
	matches: ["*://*.youtube.com/*"],
	main(ctx) {
		console.log("[TubePark] Content script loaded on YouTube");

		injectToastStyles();

		// A single floating button tracks the hovered card by pointer geometry —
		// robust against YouTube's hover-preview portal. See FloatingParkButton.
		const floatingButton = new FloatingParkButton();
		const watchButton = new WatchPageParkButton();
		// One call site to sync both buttons' parked-id sets — a future third
		// button is one edit here, not three scattered ones.
		const syncAllButtons = (ids: Set<string>) => {
			floatingButton.setParkedIds(ids);
			watchButton.setParkedIds(ids);
		};
		const onStorageChanged = () => {
			sendRuntimeMessage({ type: MSG.GET_QUEUE }, (state) => {
				syncAllButtons(parkedVideoIds(state?.queue ?? []));
			});
		};
		chrome.storage?.onChanged.addListener(onStorageChanged);

		// Handle popup tab-meta reads (G4+F4) and context-menu park requests.
		const onMessage = (
			message: any,
			_sender: chrome.runtime.MessageSender,
			sendResponse: (response?: any) => void,
		) => {
			if (message?.type === MSG.PENDING_REMOVAL_CHANGED) {
				const pendingIds = Array.isArray(message.pendingIds) ? message.pendingIds : [];
				syncAllButtons(withoutPendingIds(floatingButton.getParkedIds(), pendingIds));
				if (pendingIds.length === 0) {
					sendRuntimeMessage({ type: MSG.GET_QUEUE }, (state) => {
						syncAllButtons(parkedVideoIds(state?.queue ?? []));
					});
				}
				return false;
			}

			// One round-trip per tab for park-from-tab: channel (G4) + currentTime (F4).
			if (message?.type === MSG.GET_TAB_META) {
				sendResponse({
					channel: resolveWatchPageChannel(document),
					currentTime: readMainVideoCurrentTime(document),
				});
				return false;
			}

			if (message?.type === MSG.CONTEXT_MENU_PARK) {
				(async () => {
					// Try to find the anchor element matching the link URL
					const anchors = document.querySelectorAll<HTMLAnchorElement>(
						'a[href*="watch"], a[href*="youtu.be"], a[href*="/shorts/"]',
					);

					let meta: CardMeta | null = null;

					for (const anchor of anchors) {
						const href = anchor.getAttribute("href") || anchor.href;
						const videoId = extractYouTubeVideoId(href);
						if (videoId === message.videoId) {
							const card = anchor.closest<HTMLElement>(CARD_SELECTOR);
							if (card) {
								meta = resolveCardMeta(card, location.pathname);
							}
							break;
						}
					}

					if (!meta) {
						// Card miss: title from document, channel from watch-page DOM
						// when available (G4). Falls back to 'YouTube' off-watch pages.
						meta = {
							videoId: message.videoId,
							title: cleanYouTubeTitle(document.title) || "YouTube Video",
							channel: resolveWatchPageChannel(document),
						};
					}

					const payload: ParkedVideo = {
						id: meta.videoId,
						title: meta.title,
						channel: meta.channel,
						addedAt: Date.now(),
						durationSec: meta.durationSec,
					};

					sendRuntimeMessage(
						{ type: MSG.PARK_VIDEO_REQUEST, payload },
						(result) => {
							showParkResult(result, meta!.title);
							sendResponse({ ok: true });
						},
					);
				})();
				return true;
			}
			return false;
		};
		chrome.runtime?.onMessage.addListener(onMessage);

		// When WXT invalidates this script (extension reloaded, or a newer script
		// started in dev), tear down everything we added to the page. A stale
		// button is worse than none: with the context dead every chrome.* call
		// throws, so a leftover "Park & close" silently does nothing on click.
		// runtimeAvailable() in every click path is the backstop for the
		// browser-level invalidation WXT cannot observe.
		ctx.onInvalidated(() => {
			try {
				floatingButton.dispose();
				watchButton.dispose();
				chrome.storage?.onChanged.removeListener(onStorageChanged);
				chrome.runtime?.onMessage.removeListener(onMessage);
			} catch {
				/* context already gone — nothing left to clean up */
			}
		});
	},
});
