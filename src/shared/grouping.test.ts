import { describe, it, expect } from 'vitest';
import { groupAndSortVideos } from './grouping';
import { ParkedVideo } from './types';

describe('Video Grouping and Sticky Watching Sorting', () => {
  const now = 1700000000000; // Reference time
  const ONE_DAY_MS = 86400000;

  const normalToday: ParkedVideo = {
    id: 'normal_today',
    title: 'Today Video',
    channel: 'Channel 1',
    addedAt: now - ONE_DAY_MS * 0.5,
  };

  const watchingOlder: ParkedVideo = {
    id: 'watching_older',
    title: 'Watching Video (Older)',
    channel: 'Channel 2',
    addedAt: now - ONE_DAY_MS * 10,
    watching: true,
  };

  const normalOlder: ParkedVideo = {
    id: 'normal_older',
    title: 'Older Video',
    channel: 'Channel 3',
    addedAt: now - ONE_DAY_MS * 8,
  };

  it('sticky-sorts watching items to the top regardless of age', () => {
    const queue = [normalToday, normalOlder, watchingOlder];
    const { watchingSection, todaySection, olderSection } = groupAndSortVideos(queue, now);

    expect(watchingSection).toHaveLength(1);
    expect(watchingSection[0]).toEqual(watchingOlder);

    expect(todaySection).toHaveLength(1);
    expect(todaySection[0]).toEqual(normalToday);

    expect(olderSection).toHaveLength(1);
    expect(olderSection[0]).toEqual(normalOlder);
  });
});
