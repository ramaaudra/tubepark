import { parseDurationSec } from "./filters";
import type { ParkedVideo } from "./types";

/** URL patterns used for all cross-tab reads. Keep this list aligned with the
 * manifest host permissions so removing broad `tabs` access does not remove
 * YouTube tab discovery. */
export const YOUTUBE_TAB_URL_PATTERNS = [
	"*://*.youtube.com/*",
	"*://youtu.be/*",
];

export function isYouTubeHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return normalized === "youtube.com" || normalized.endsWith(".youtube.com") || normalized === "youtu.be";
}

export const YOUTUBE_VIDEO_CARD_SELECTORS = [
	"ytd-rich-item-renderer",
	"ytd-video-renderer",
	"ytd-grid-video-renderer",
	"ytd-compact-video-renderer",
	"ytd-reel-item-renderer",
	// YouTube's newer view-model card (channel /videos grid + channel-home
	// shelves). Bare on shelves, wrapped by ytd-rich-item-renderer on the grid.
	// Non-video lockups (playlists/channels) carry no /watch?v= anchor, so
	// resolveCardMeta() returns null for them and no park button is shown.
	"yt-lockup-view-model",
];

/**
 * Ordered thumbnail selectors, newest-first. YouTube churned the thumbnail DOM
 * the same way it churned the card DOM (see resolveVideoId): the view-model era
 * (`yt-thumbnail-view-model`, channel grid + home shelves) supersedes the legacy
 * `ytd-thumbnail` / `a#thumbnail` (search, watch sidebar). The park button is
 * positioned against whichever matches so it sits on the thumbnail — not the
 * title/metadata text below the full card.
 */
const THUMBNAIL_SELECTORS = [
	"yt-thumbnail-view-model",
	".ytThumbnailViewModelHost",
	"ytd-thumbnail",
	"a#thumbnail",
];

/**
 * Anchor selector shared by resolveVideoId + resolveTitle's durable fallback
 * loops. /watch?v= covers watch-page + view-model lockups; /shorts/ covers
 * reel-item cards (Shorts, G2). Kept as one constant so a future capture path
 * is a one-site edit, not two — the two loops already drifted once.
 */
const VIDEO_ANCHOR_SELECTOR = 'a[href*="/watch?v="], a[href*="/shorts/"]';

export function extractYouTubeVideoId(urlStr: string): string | null {
	if (!urlStr) return null;

	try {
		const url = new URL(urlStr, "https://www.youtube.com");

		if (!isYouTubeHostname(url.hostname)) return null;

		if (url.hostname === "youtu.be") {
			const id = url.pathname.slice(1).split("/")[0];
			return id || null;
		}

		if (url.pathname === "/watch" || url.pathname.startsWith("/watch")) {
			return url.searchParams.get("v");
		}

		// Shorts are first-class videos (G2): /shorts/{id} carries an ordinary
		// video id in the path. Park/queue/play all use /watch?v={id} downstream.
		if (url.pathname.startsWith("/shorts/")) {
			const id = url.pathname.slice("/shorts/".length).split("/")[0];
			return id ? id.split("?")[0] : null;
		}

		return null;
	} catch {
		return null;
	}
}

export function isYouTubeWatchUrl(urlStr: string): boolean {
	return extractYouTubeVideoId(urlStr) !== null;
}

/** Strip YouTube's ` - YouTube` title suffix from a browser tab / document
 * title and trim whitespace. Pure string transform — returns "" for empty
 * input, never throws. Used by the now-playing display, park-from-tab, and
 * the content-script context-menu fallback so the strip rule lives in one
 * place (the suffix has already drifted once between call sites). */
export function cleanYouTubeTitle(title: string | undefined | null): string {
	return (title ?? "").replace("- YouTube", "").trim();
}

export function isMatchingVideoCardSelector(
	tagNameOrSelector: string,
): boolean {
	const normalized = tagNameOrSelector.toLowerCase();
	return YOUTUBE_VIDEO_CARD_SELECTORS.some(
		(selector) => selector === normalized || normalized.includes(selector),
	);
}

export type CardMeta = { videoId: string; title: string; channel: string; durationSec?: number };

/**
 * Extract a Parked-Video's metadata from a resolved video card, or null if the
 * card is not a watchable video (playlist/channel lockups, ads).
 *
 * Layout-agnostic on purpose: YouTube has churned this DOM twice (legacy
 * `ytd-video-renderer` with id-based anchors → the newer `yt-lockup-view-model`
 * with class-based anchors and NO id nodes). The one invariant across every
 * revision is "a video card contains an <a> to /watch?v=…", so id-based lookups
 * are only a fast-path and the anchor href is the source of truth for the id.
 *
 * `pathname` (e.g. location.pathname) lets us recover the channel on channel
 * pages, where the card omits the channel field because every card shares one
 * channel. Title + thumbnail carry the visual context; channel is secondary.
 */
export function resolveCardMeta(
	card: {
		querySelector: (sel: string) => Element | null;
		querySelectorAll: (sel: string) => ArrayLike<Element>;
	},
	pathname?: string,
): CardMeta | null {
	const videoId = resolveVideoId(card);
	if (!videoId) return null;

	return {
		videoId,
		title: resolveTitle(card),
		channel: resolveChannel(card, pathname),
		durationSec: resolveDuration(card),
	};
}

function resolveVideoId(card: {
	querySelector: (sel: string) => Element | null;
	querySelectorAll: (sel: string) => ArrayLike<Element>;
}): string | null {
	// Fast-path: legacy id-based anchors (search / watch-page sidebar cards).
	const idAnchor = card.querySelector(
		"a#thumbnail, a#video-title-link, a#video-title",
	);
	const fromId = extractYouTubeVideoId(anchorHref(idAnchor));
	if (fromId) return fromId;

	// Durable path: any /watch?v= or /shorts/ anchor in the card.
	// /shorts/ covers reel-item cards (Shorts) whose anchor is /shorts/{id};
	// no live Shorts fixture could be captured, so this selector is the
	// defensive fallback per spec G2 rather than a confirmed fast-path.
	const anchors = card.querySelectorAll(VIDEO_ANCHOR_SELECTOR);
	for (const anchor of Array.from(anchors)) {
		const id = extractYouTubeVideoId(anchorHref(anchor));
		if (id) return id;
	}
	return null;
}

function resolveTitle(card: {
	querySelector: (sel: string) => Element | null;
	querySelectorAll: (sel: string) => ArrayLike<Element>;
}): string {
	// Legacy id node → semantic heading → the watch anchor that has visible text.
	const idTitle = text(card.querySelector("#video-title, #video-title-link"));
	if (idTitle) return idTitle;

	const heading = text(card.querySelector("h3"));
	if (heading) return heading;

	const anchors = card.querySelectorAll(VIDEO_ANCHOR_SELECTOR);
	for (const anchor of Array.from(anchors)) {
		const t = text(anchor);
		if (t) return t;
	}
	return "YouTube Video";
}

function resolveDuration(card: { querySelectorAll: (sel: string) => ArrayLike<Element> }): number | undefined {
	const badges = card.querySelectorAll(
		"ytd-thumbnail-overlay-time-status-renderer, .yt-badge-shape__text, #text",
	);
	for (const badge of Array.from(badges)) {
		const duration = parseDurationSec(badge.textContent || "");
		if (duration !== undefined) return duration;
	}
	return undefined;
}

function resolveChannel(
	card: { querySelector: (sel: string) => Element | null },
	pathname?: string,
): string {
	// In-card channel (search / home feed cards).
	const inCard = text(card.querySelector("#channel-name, ytd-channel-name"));
	if (inCard) return inCard;

	// Channel pages omit the per-card channel — recover the @handle from the URL.
	const handle = channelHandleFromPath(pathname);
	if (handle) return handle;

	return "YouTube Channel";
}

/**
 * Ordered watch-page channel selectors, newest-first. The watch page puts the
 * channel under `#owner` / `ytd-watch-metadata` — not inside a video card — so
 * `resolveChannel` cannot see it. Fallback chain mirrors THUMBNAIL_SELECTORS:
 * YouTube churns the watch-page owner block the same way it churns cards.
 * Used by GET_TAB_META (G4 tab-park) and the CONTEXT_MENU_PARK card-miss path.
 */
const WATCH_PAGE_CHANNEL_SELECTORS = [
	"#owner ytd-channel-name",
	"#owner #channel-name",
	"ytd-watch-metadata ytd-channel-name",
];

/**
 * Read the channel name from a YouTube watch page document. Returns the
 * product fallback `'YouTube'` (F9-3 "Unknown channel" bucket) when no selector
 * matches — park still succeeds; only grouping/placeholder quality degrades.
 */
export function resolveWatchPageChannel(doc: {
	querySelector: (sel: string) => Element | null;
}): string {
	for (const selector of WATCH_PAGE_CHANNEL_SELECTORS) {
		const name = text(doc.querySelector(selector));
		if (name) return name;
	}
	return "YouTube";
}

/**
 * Read the main player position (floored seconds) from a watch-page document.
 * YouTube may mount an ad pre-roll `<video>` alongside the content player;
 * pick the largest by client area so mid-watch park captures content time,
 * not a 0s ad stub. Returns 0 when no player is ready (caller treats 0 as
 * "no resumeAt" — see F4: never store t=0).
 */
export function readMainVideoCurrentTime(doc: {
	querySelectorAll: (sel: string) => ArrayLike<Element>;
}): number {
	const videos = Array.from(doc.querySelectorAll("video")) as HTMLVideoElement[];
	if (videos.length === 0) return 0;

	let best: HTMLVideoElement | null = null;
	let bestArea = -1;
	for (const v of videos) {
		const area = (v.clientWidth || 0) * (v.clientHeight || 0);
		if (area >= bestArea) {
			best = v;
			bestArea = area;
		}
	}
	return Math.floor(best?.currentTime ?? 0);
}

/**
 * Build a ParkedVideo for a watch-page "park & close" straight from the page
 * URL + DOM — the content script IS the reader, so there is no GET_TAB_META
 * round-trip (unlike the popup path, which messages the content script).
 *
 * Composes the four capture predicates above: `extractYouTubeVideoId` for the
 * id, `cleanYouTubeTitle` for the title, `resolveWatchPageChannel` for the
 * channel, `readMainVideoCurrentTime` for an optional `resumeAt` (only when
 * the user is mid-watch — F4: never store t=0). Returns null for non-watch
 * URLs so the caller can hide the button off-watch. Pure so the capture seam
 * is unit-testable without a browser (F10-9).
 */
export function buildWatchPagePayload(
	url: string,
	doc: {
		title: string;
		querySelector: (sel: string) => Element | null;
		querySelectorAll: (sel: string) => ArrayLike<Element>;
	},
	now: number = Date.now(),
): ParkedVideo | null {
	const videoId = extractYouTubeVideoId(url);
	if (!videoId) return null;
	const payload: ParkedVideo = {
		id: videoId,
		title: cleanYouTubeTitle(doc.title) || "YouTube Video",
		channel: resolveWatchPageChannel(doc),
		addedAt: now,
	};
	const currentTime = readMainVideoCurrentTime(doc);
	if (currentTime > 0) payload.resumeAt = currentTime;
	return payload;
}

function channelHandleFromPath(pathname?: string): string | null {
	if (!pathname) return null;
	const match = pathname.match(/\/(@[^/?#]+)/);
	return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Resolve the thumbnail sub-element of a video card, or null if none is present.
 * The park button anchors to this (not the whole card) so it lands on the
 * thumbnail's bottom-left corner instead of the title/metadata text beneath it.
 * Ordered fallbacks mirror resolveVideoId — durable against YouTube DOM churn.
 */
export function resolveThumbnail(card: {
	querySelector: (sel: string) => Element | null;
}): Element | null {
	for (const selector of THUMBNAIL_SELECTORS) {
		const el = card.querySelector(selector);
		if (el) return el;
	}
	return null;
}

/**
 * Bottom-left inset position for the floating park button over a given rect
 * (the thumbnail's). Pure geometry so it is unit-testable without a layout
 * engine — the whole button height sits above `rect.bottom`, keeping it on the
 * thumbnail rather than the text below.
 */
export function computeButtonPosition(
	rect: { left: number; bottom: number },
	size: number,
): { left: number; top: number } {
	return {
		left: Math.round(rect.left + 4),
		top: Math.round(rect.bottom - 4 - size),
	};
}

function anchorHref(anchor: Element | null): string {
	if (!anchor) return "";
	return (
		anchor.getAttribute("href") || (anchor as HTMLAnchorElement).href || ""
	);
}

function text(el: Element | null): string {
	return (el?.textContent || "").trim();
}
