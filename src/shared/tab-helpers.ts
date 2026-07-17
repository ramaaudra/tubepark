import { extractYouTubeVideoId } from './capture-predicates';

export interface SimpleTab {
  id?: number;
  url?: string;
  title?: string;
  active?: boolean;
}

export function isWatchTabUrl(url?: string): boolean {
  if (!url) return false;
  return extractYouTubeVideoId(url) !== null;
}

export function filterIdleWatchTabs(
  tabs: SimpleTab[],
  activeTabId?: number
): SimpleTab[] {
  return tabs.filter((tab) => {
    if (!tab.url || !isWatchTabUrl(tab.url)) return false;
    if (activeTabId !== undefined && tab.id === activeTabId) return false;
    if (tab.active) return false;
    return true;
  });
}
