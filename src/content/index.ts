import {
  isInputFocused,
  hasModifierKey,
  extractYouTubeVideoId,
  YOUTUBE_VIDEO_CARD_SELECTORS,
} from '../shared/capture-predicates';

console.log('[TubePark] Content script loaded on YouTube');

let hoveredElement: HTMLElement | null = null;

document.addEventListener(
  'mouseover',
  (e) => {
    if (e.target instanceof HTMLElement) {
      hoveredElement = e.target;
    }
  },
  { passive: true }
);

document.addEventListener('keydown', async (e: KeyboardEvent) => {
  if (e.key.toLowerCase() !== 'p') return;

  // Guard (a): Ignore if focus is in an input field
  const activeEl = document.activeElement;
  if (
    activeEl &&
    isInputFocused(
      activeEl.tagName,
      (activeEl as HTMLElement).isContentEditable
    )
  ) {
    return;
  }

  // Guard (b): Ignore if modifier keys are held (Cmd/Ctrl/Alt)
  if (hasModifierKey(e)) {
    return;
  }

  // Guard (c): Verify `:hover` resolves inside a YouTube video card wrapper
  if (!hoveredElement) return;

  const cardWrapper = hoveredElement.closest<HTMLElement>(
    YOUTUBE_VIDEO_CARD_SELECTORS.join(',')
  );

  if (!cardWrapper) return;

  // Extract video link (e.g., #thumbnail or title link)
  const linkAnchor = cardWrapper.querySelector<HTMLAnchorElement>(
    'a#thumbnail, a#video-title-link, a#video-title'
  );
  if (!linkAnchor) return;

  const href = linkAnchor.getAttribute('href') || linkAnchor.href;
  const videoId = extractYouTubeVideoId(href);

  if (!videoId) return;

  // Extract title & channel
  const titleEl = cardWrapper.querySelector('#video-title, #video-title-link');
  const channelEl = cardWrapper.querySelector('#channel-name, ytd-channel-name');

  const title = (titleEl?.textContent || 'YouTube Video').trim();
  const channel = (channelEl?.textContent || 'YouTube Channel').trim();

  // Prevent default action (e.g. typing or browser shortcuts if any)
  e.preventDefault();

  console.log('[TubePark] Shortcut capture triggered:', { videoId, title, channel });

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: 'PARK_VIDEO_REQUEST',
      payload: {
        id: videoId,
        title,
        channel,
        addedAt: Date.now(),
      },
    });
  }
});
