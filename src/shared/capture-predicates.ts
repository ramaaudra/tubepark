export const YOUTUBE_VIDEO_CARD_SELECTORS = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-reel-item-renderer',
];

export function extractYouTubeVideoId(urlStr: string): string | null {
  if (!urlStr) return null;

  try {
    // Handle relative watch URLs (e.g., /watch?v=123)
    const url = new URL(urlStr, 'https://www.youtube.com');

    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.slice(1);
      return id ? id.split('?')[0] : null;
    }

    if (url.pathname === '/watch' || url.pathname.startsWith('/watch')) {
      return url.searchParams.get('v');
    }

    return null;
  } catch {
    return null;
  }
}

export function isYouTubeWatchUrl(urlStr: string): boolean {
  return extractYouTubeVideoId(urlStr) !== null;
}

export function isInputFocused(
  targetTagName: string,
  isContentEditable: boolean = false
): boolean {
  if (isContentEditable) return true;
  const tag = targetTagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export interface ModifierState {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

export function hasModifierKey(event: ModifierState): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

export function isMatchingVideoCardSelector(tagNameOrSelector: string): boolean {
  const normalized = tagNameOrSelector.toLowerCase();
  return YOUTUBE_VIDEO_CARD_SELECTORS.some(
    (selector) => selector === normalized || normalized.includes(selector)
  );
}
