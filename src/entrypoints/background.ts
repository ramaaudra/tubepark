import { defineBackground } from 'wxt/utils/define-background';
import {
  EXPIRE_ALARM_NAME,
  EXPIRE_ALARM_PERIOD_MINUTES,
  sweepExpiredVideos,
} from '../shared/expiry';

import { parkVideo } from '../shared/storage';
import { extractYouTubeVideoId } from '../shared/capture-predicates';

const CONTEXT_MENU_ID = 'tubepark-park-context-menu';

function notifyFullQueue() {
  if (typeof chrome !== 'undefined' && chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icon-128.png',
      title: 'TubePark Full!',
      message: 'Tonton atau hapus beberapa video terlebih dahulu.',
    });
  }
}

export default defineBackground(() => {
  console.log('[TubePark] Background Service Worker initialized');

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onInstalled.addListener(() => {
      if (chrome.alarms) {
        chrome.alarms.create(EXPIRE_ALARM_NAME, {
          periodInMinutes: EXPIRE_ALARM_PERIOD_MINUTES,
        });
      }

      if (chrome.contextMenus) {
        chrome.contextMenus.create({
          id: CONTEXT_MENU_ID,
          title: 'Park This Video',
          contexts: ['link'],
          targetUrlPatterns: ['*://*.youtube.com/watch*'],
        });
      }
    });

    if (chrome.alarms) {
      chrome.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name === EXPIRE_ALARM_NAME) {
          await sweepExpiredVideos();
        }
      });
    }

    if (chrome.contextMenus) {
      chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        if (info.menuItemId === CONTEXT_MENU_ID && info.linkUrl) {
          const videoId = extractYouTubeVideoId(info.linkUrl);
          if (!videoId) return;

          const title = tab?.title?.replace('- YouTube', '').trim() || 'YouTube Video';
          const channel = 'YouTube';

          const result = await parkVideo({
            id: videoId,
            title,
            channel,
            addedAt: Date.now(),
          });

          if (result.full) {
            notifyFullQueue();
          }
        }
      });
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'PARK_VIDEO_REQUEST') {
        (async () => {
          const result = await parkVideo(message.payload);
          if (result.full) {
            notifyFullQueue();
          }
          sendResponse(result);
        })();
        return true;
      }
      return false;
    });
  }
});
