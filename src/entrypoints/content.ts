import { defineContentScript } from "wxt/utils/define-content-script";
import {
	type CardMeta,
	extractYouTubeVideoId,
	resolveCardMeta,
	YOUTUBE_VIDEO_CARD_SELECTORS,
} from "../shared/capture-predicates";
import type { ParkedVideo } from "../shared/types";

const PARK_BTN_CLASS = "tubepark-park-btn";
const PARK_BTN_ATTR = "data-tubepark-video-id";
const TOAST_ID = "tubepark-toast";

function showToast(message: string, variant: "success" | "duplicate" | "full") {
	const existing = document.getElementById(TOAST_ID);
	if (existing) existing.remove();

	const toast = document.createElement("div");
	toast.id = TOAST_ID;
	toast.className = `tubepark-toast tubepark-toast-${variant}`;
	toast.textContent = message;

	document.body.appendChild(toast);

	requestAnimationFrame(() => {
		toast.classList.add("tubepark-toast-visible");
	});

	setTimeout(() => {
		toast.classList.remove("tubepark-toast-visible");
		setTimeout(() => toast.remove(), 300);
	}, 2000);
}

const CARD_SELECTOR = YOUTUBE_VIDEO_CARD_SELECTORS.join(",");
const PARK_BTN_SIZE = 28;

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
	private lastX = 0;
	private lastY = 0;

	constructor() {
		const btn = document.createElement("button");
		btn.className = PARK_BTN_CLASS;
		btn.type = "button";
		btn.title = "Park to TubePark";
		btn.textContent = "📌";
		btn.addEventListener("click", this.onClick);
		document.body.appendChild(btn);
		this.btn = btn;

		document.addEventListener("pointermove", this.onPointerMove, {
			passive: true,
		});
		// Reposition (not hide) while scrolling so the button tracks its card.
		window.addEventListener("scroll", this.onScroll, {
			passive: true,
			capture: true,
		});
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
		const rect = card.getBoundingClientRect();
		this.btn.style.left = `${Math.round(rect.left + 4)}px`;
		this.btn.style.top = `${Math.round(rect.bottom - 4 - PARK_BTN_SIZE)}px`;
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

		const payload: ParkedVideo = {
			id: meta.videoId,
			title: meta.title,
			channel: meta.channel,
			addedAt: Date.now(),
		};

		this.btn.textContent = "⏳";
		chrome.runtime.sendMessage(
			{ type: "PARK_VIDEO_REQUEST", payload },
			(result) => {
				if (result?.success) {
					this.flash("✅");
					showToast(`Diparkir: "${meta.title}"`, "success");
				} else if (result?.duplicate) {
					this.flash("ℹ️");
					showToast(`Sudah ada di queue: "${meta.title}"`, "duplicate");
				} else if (result?.full) {
					this.flash("🔴");
					showToast("Queue penuh (200/200)! Hapus video lama dulu.", "full");
				} else {
					this.btn.textContent = "📌";
				}
			},
		);
	};

	private flash(icon: string) {
		this.btn.textContent = icon;
		setTimeout(() => {
			this.btn.textContent = "📌";
		}, 2000);
	}
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
      transition: opacity 200ms ease, transform 200ms ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      max-width: 320px;
      pointer-events: none;
    }
    .tubepark-toast-visible {
      opacity: 1;
      transform: translateY(0);
    }
    .tubepark-toast-success { background-color: #15803d; }
    .tubepark-toast-duplicate { background-color: #a16207; }
    .tubepark-toast-full { background-color: #dc2626; }

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
      font-size: 14px;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      transition: transform 150ms ease, background 150ms ease;
      line-height: 1;
    }
    .${PARK_BTN_CLASS}:hover {
      transform: scale(1.1);
      background: rgba(0, 0, 0, 0.85);
    }
    .${PARK_BTN_CLASS}:active {
      transform: scale(0.95);
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
		new FloatingParkButton();

		// Handle context menu park requests from background
		chrome.runtime?.onMessage.addListener((message, _sender, sendResponse) => {
			if (message?.type === "CONTEXT_MENU_PARK") {
				(async () => {
					// Try to find the anchor element matching the link URL
					const anchors = document.querySelectorAll<HTMLAnchorElement>(
						'a[href*="watch"], a[href*="youtu.be"]',
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
						// Fallback: use videoId + tab title
						meta = {
							videoId: message.videoId,
							title:
								document.title.replace("- YouTube", "").trim() ||
								"YouTube Video",
							channel: "YouTube",
						};
					}

					const payload: ParkedVideo = {
						id: meta.videoId,
						title: meta.title,
						channel: meta.channel,
						addedAt: Date.now(),
					};

					chrome.runtime.sendMessage(
						{ type: "PARK_VIDEO_REQUEST", payload },
						(result) => {
							if (result?.success) {
								showToast(`Diparkir: "${meta!.title}"`, "success");
							} else if (result?.duplicate) {
								showToast(`Sudah ada di queue: "${meta!.title}"`, "duplicate");
							} else if (result?.full) {
								showToast(
									"Queue penuh (200/200)! Hapus video lama dulu.",
									"full",
								);
							}
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
