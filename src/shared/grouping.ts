import { ParkedVideo } from './types';
import { extractYouTubeVideoId } from './capture-predicates';

export interface GroupedVideos {
  watchingSection: ParkedVideo[];
  todaySection: ParkedVideo[];
  olderSection: ParkedVideo[];
}

export function groupAndSortVideos(
  queue: ParkedVideo[],
  now: number = Date.now()
): GroupedVideos {
  const ONE_DAY_MS = 86400000;
  const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

  const watchingSection: ParkedVideo[] = [];
  const todaySection: ParkedVideo[] = [];
  const olderSection: ParkedVideo[] = [];

  // Sort newest first
  const sorted = [...queue].sort((a, b) => b.addedAt - a.addedAt);

  for (const item of sorted) {
    if (item.watching) {
      watchingSection.push(item);
    } else {
      const age = now - item.addedAt;
      if (age < SEVEN_DAYS_MS) {
        todaySection.push(item);
      } else {
        olderSection.push(item);
      }
    }
  }

  return {
    watchingSection,
    todaySection,
    olderSection,
  };
}

export async function openOrUpdateYouTubeTab(videoId: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;

  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const allTabs = await chrome.tabs.query({ currentWindow: true });

  // Look for existing YouTube watch tab
  const existingWatchTab = allTabs.find((tab) => {
    if (!tab.url) return false;
    return extractYouTubeVideoId(tab.url) !== null;
  });

  if (existingWatchTab && existingWatchTab.id) {
    // Reuse existing tab (One-in One-out playback, RAM efficient)
    await chrome.tabs.update(existingWatchTab.id, {
      url: targetUrl,
      active: true,
    });
  } else {
    // Spawn new tab only when no YouTube watch tab exists
    await chrome.tabs.create({ url: targetUrl });
  }
}
