export const YOUTUBE_VIDEO_CARD_SELECTORS = [
	"ytd-rich-item-renderer",
	"ytd-video-renderer",
	"ytd-grid-video-renderer",
	"ytd-compact-video-renderer",
	"ytd-reel-item-renderer",
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
