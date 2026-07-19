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

export function extractYouTubeVideoId(urlStr: string): string | null {
	if (!urlStr) return null;

	try {
		const url = new URL(urlStr, "https://www.youtube.com");

		if (url.hostname.includes("youtu.be")) {
			const id = url.pathname.slice(1);
			return id ? id.split("?")[0] : null;
		}

		if (url.pathname === "/watch" || url.pathname.startsWith("/watch")) {
			return url.searchParams.get("v");
		}

		return null;
	} catch {
		return null;
	}
}

export function isYouTubeWatchUrl(urlStr: string): boolean {
	return extractYouTubeVideoId(urlStr) !== null;
}

export function isMatchingVideoCardSelector(
	tagNameOrSelector: string,
): boolean {
	const normalized = tagNameOrSelector.toLowerCase();
	return YOUTUBE_VIDEO_CARD_SELECTORS.some(
		(selector) => selector === normalized || normalized.includes(selector),
	);
}

export type CardMeta = { videoId: string; title: string; channel: string };

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

	// Durable path: any /watch?v= anchor in the card (view-model lockups).
	const anchors = card.querySelectorAll('a[href*="/watch?v="]');
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

	const anchors = card.querySelectorAll('a[href*="/watch?v="]');
	for (const anchor of Array.from(anchors)) {
		const t = text(anchor);
		if (t) return t;
	}
	return "YouTube Video";
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

function channelHandleFromPath(pathname?: string): string | null {
	if (!pathname) return null;
	const match = pathname.match(/\/(@[^/?#]+)/);
	return match ? decodeURIComponent(match[1]) : null;
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
