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

const PARK_BTN_CLASS = "tubepark-park-btn";
const PARK_BTN_ATTR = "data-tubepark-video-id";
const TOAST_ID = "tubepark-toast";
const PARK_ICON_SIZE = 16;

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
		const state = await chrome.runtime.sendMessage({ type: MSG.GET_QUEUE });
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

	private onClick = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const meta = this.activeMeta;
		if (!meta) return;
		if (typeof chrome === "undefined" || !chrome.runtime) return;

		if (this.parkedIds.has(meta.videoId)) {
			this.parkedIds.delete(meta.videoId);
			this.renderState();
			chrome.runtime.sendMessage(
				{ type: MSG.PENDING_REMOVE, ids: [meta.videoId] },
				() => showToast("Removed", "success", () => {
					chrome.runtime.sendMessage({ type: MSG.CANCEL_REMOVE }, () => void this.syncParkedIds());
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
		chrome.runtime.sendMessage(
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

/**
 * An always-visible "Park & close" button for the YouTube watch page (and
 * Shorts), portaled to <body> and fixed to the top-right of the viewport.
 *
 * Sibling to `FloatingParkButton` (which park-onlys hovered sidebar cards). This
 * one captures the MAIN video — including a `resumeAt` from the live <video> at
 * click time — and closes the tab via a background relay (content scripts
 * cannot call chrome.tabs.*). One click, no confirm, no undo: the queue +
 * resumeAt is the safety net (CONTEXT.md "zero-decision park").
 *
 * Nol DOM coupling: viewport-fixed, so it survives YouTube's DOM churn the same
 * way FloatingParkButton does. SPA navigation is watched via `onLocationChange`
 * so the button re-resolves its videoId + parked-indicator without a reload.
 */
class WatchPageParkButton {
	private readonly btn: HTMLButtonElement;
	private parkedIds = new Set<string>();
	private currentVideoId: string | null = null;

	constructor() {
		const btn = document.createElement("button");
		btn.className = WATCH_BTN_CLASS;
		btn.type = "button";
		btn.innerHTML = `${svgMarkup("pin")}<span class="tubepark-watch-park-label">Park &amp; close</span>`;
		btn.addEventListener("click", this.onClick);
		document.body.appendChild(btn);
		this.btn = btn;
		void this.syncParkedIds();
		this.refresh();
		onLocationChange(() => this.refresh());
	}

	setParkedIds(ids: Set<string>) {
		this.parkedIds = ids;
		this.renderState();
	}

	private syncParkedIds = async () => {
		const state = await chrome.runtime.sendMessage({ type: MSG.GET_QUEUE });
		this.setParkedIds(parkedVideoIds(state?.queue ?? []));
	};

	private refresh = () => {
		const videoId = extractYouTubeVideoId(location.href);
		if (!videoId) {
			this.currentVideoId = null;
			this.hide();
			return;
		}
		this.currentVideoId = videoId;
		this.btn.setAttribute(PARK_BTN_ATTR, videoId);
		this.renderState();
		this.show();
	};

	private renderState() {
		const parked = this.currentVideoId !== null && this.parkedIds.has(this.currentVideoId);
		this.btn.classList.toggle("tubepark-watch-park-btn-parked", parked);
		this.btn.title = parked
			? "Already in TubePark — click to park & close this tab"
			: "Park to TubePark & close this tab";
	}

	private show() {
		this.btn.style.display = "inline-flex";
	}

	private hide() {
		this.btn.style.display = "none";
	}

	private onClick = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!this.currentVideoId) return;
		if (typeof chrome === "undefined" || !chrome.runtime) return;
		// Build the payload at click time so `resumeAt` reflects the current
		// playback position (the user may have been watching since the last
		// refresh). Pure helper — unit-tested in capture-predicates.
		const payload = buildWatchPagePayload(location.href, document);
		if (!payload) return;
		chrome.runtime.sendMessage(
			{ type: MSG.PARK_AND_CLOSE_TAB, payload },
			(result) => {
				// The tab is about to be closed on success/duplicate (background
				// calls chrome.tabs.remove). Only `full` keeps the tab alive —
				// surface it so the user knows the park was rejected. Intentionally
				// NOT showParkResult: success/duplicate toasts would never render
				// (the content script dies with the tab) — see showParkResult doc.
				if (chrome.runtime.lastError) return;
				if (result?.full) showToast(QUEUE_FULL_MSG, "full");
			},
		);
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
     * Watch-page "Park & close" pill — portaled to <body>, fixed top-right of
     * the viewport, below YouTube's topbar. Always-visible on /watch + /shorts
     * (WatchPageParkButton toggles display). Same max z-index as the floating
     * button so it escapes YouTube's stacking contexts. A subtle yellow dot
     * (::after) marks already-parked videos — a cosmetic indicator, NOT a
     * toggle (click always park+close; F10-5).
     */
    .${WATCH_BTN_CLASS} {
      position: fixed;
      top: 70px;
      right: 16px;
      z-index: 2147483647;
      display: none;
      align-items: center;
      gap: 6px;
      padding: 7px 12px 7px 9px;
      border: 1px solid #2f9e44;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.78);
      backdrop-filter: blur(6px);
      color: #fff;
      font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      transition: transform 150ms ease, background 150ms ease, border-color 150ms ease, opacity 160ms cubic-bezier(0.22, 1, 0.36, 1);
      opacity: 1;
    }
    .${WATCH_BTN_CLASS}:hover {
      background: rgba(0, 0, 0, 0.9);
    }
    .${WATCH_BTN_CLASS}:active {
      transform: scale(0.97);
    }
    .${WATCH_BTN_CLASS} .tubepark-watch-park-label {
      white-space: nowrap;
    }
    /* Identity-green border mirrors --tp-accent (tokens.css): #2f9e44 light,
     * #51c86c dark — so the pill reads against YouTube's dark bg instead of
     * camouflaging, and stays on-brand with the popup/side-panel accent. */
    @media (prefers-color-scheme: dark) {
      .${WATCH_BTN_CLASS} { border-color: #51c86c; }
    }
    .${WATCH_BTN_CLASS}.tubepark-watch-park-btn-parked::after {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #facc15;
      margin-left: 2px;
    }

    /* Fade the pill in on first show (display:none -> inline-flex). Exit is
     * instant — the pill vanishes on SPA nav off /watch. */
    @starting-style {
      .${WATCH_BTN_CLASS} { opacity: 0; }
    }

    /* Hover motion is pointer-gated so a touch tap can't fire a false scale. */
    @media (hover: hover) and (pointer: fine) {
      .${PARK_BTN_CLASS}:hover { transform: scale(1.05); }
      .${WATCH_BTN_CLASS}:hover { transform: scale(1.04); }
    }

    /* Reduced motion: keep opacity/color, drop all transform movement. */
    @media (prefers-reduced-motion: reduce) {
      .tubepark-toast { transform: none; transition: opacity 150ms ease; }
      .${PARK_BTN_CLASS}, .${WATCH_BTN_CLASS} {
        transition: background 150ms ease, border-color 150ms ease, opacity 160ms ease;
      }
      .${PARK_BTN_CLASS}:active,
      .${WATCH_BTN_CLASS}:active { transform: none; }
    }
  `;

	document.head.appendChild(style);
}

export default defineContentScript({
	matches: ["*://*.youtube.com/*"],
	main() {
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
		chrome.storage?.onChanged.addListener(() => {
			chrome.runtime.sendMessage({ type: MSG.GET_QUEUE }, (state) => {
				syncAllButtons(parkedVideoIds(state?.queue ?? []));
			});
		});

		// Handle popup tab-meta reads (G4+F4) and context-menu park requests.
		chrome.runtime?.onMessage.addListener((message, _sender, sendResponse) => {
			if (message?.type === MSG.PENDING_REMOVAL_CHANGED) {
				const pendingIds = Array.isArray(message.pendingIds) ? message.pendingIds : [];
				syncAllButtons(withoutPendingIds(floatingButton.getParkedIds(), pendingIds));
				if (pendingIds.length === 0) {
					chrome.runtime.sendMessage({ type: MSG.GET_QUEUE }, (state) => {
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

					chrome.runtime.sendMessage(
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
		});
	},
});
