import { describe, it, expect } from 'vitest';
import { filterIdleWatchTabs, isWatchTabUrl } from './tab-helpers';

describe('Tab Helpers', () => {
  const tabs = [
    { id: 1, url: 'https://www.youtube.com/', active: true },
    { id: 2, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', active: false },
    { id: 3, url: 'https://www.youtube.com/watch?v=abc12345678', active: false },
    { id: 4, url: 'https://www.youtube.com/feed/subscriptions', active: false },
    { id: 5, url: 'https://www.google.com', active: false },
  ];

  it('identifies watch tab URLs correctly', () => {
    expect(isWatchTabUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(isWatchTabUrl('https://www.youtube.com/')).toBe(false);
    expect(isWatchTabUrl(undefined)).toBe(false);
  });

  it('filters idle watch tabs, leaving active homepage tab untouched', () => {
    const idleWatchTabs = filterIdleWatchTabs(tabs, 1);
    expect(idleWatchTabs).toHaveLength(2);
    expect(idleWatchTabs.map((t) => t.id)).toEqual([2, 3]);
  });
});
