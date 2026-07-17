import { defineContentScript } from 'wxt/utils/define-content-script';
import {
  isInputFocused,
  hasModifierKey,
  extractYouTubeVideoId,
  YOUTUBE_VIDEO_CARD_SELECTORS,
} from '../shared/capture-predicates';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  main() {
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

      if (hasModifierKey(e)) {
        return;
      }

      if (!hoveredElement) return;

      const cardWrapper = hoveredElement.closest<HTMLElement>(
        YOUTUBE_VIDEO_CARD_SELECTORS.join(',')
      );

      if (!cardWrapper) return;

      const linkAnchor = cardWrapper.querySelector<HTMLAnchorElement>(
        'a#thumbnail, a#video-title-link, a#video-title'
      );
      if (!linkAnchor) return;

      const href = linkAnchor.getAttribute('href') || linkAnchor.href;
      const videoId = extractYouTubeVideoId(href);

      if (!videoId) return;

      const titleEl = cardWrapper.querySelector('#video-title, #video-title-link');
      const channelEl = cardWrapper.querySelector('#channel-name, ytd-channel-name');

      const title = (titleEl?.textContent || 'YouTube Video').trim();
      const channel = (channelEl?.textContent || 'YouTube Channel').trim();

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
  },
});
