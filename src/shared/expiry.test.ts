import { describe, it, expect } from 'vitest';
import { sweepExpiredVideosPure } from './expiry';
import { ParkedVideo } from './types';

describe('Expiry Sweep Pure Logic', () => {
  const now = 1700000000000; // Reference timestamp
  const ONE_DAY_MS = 86400000;

  const freshVideo: ParkedVideo = {
    id: 'fresh_1',
    title: 'Fresh Video',
    channel: 'Channel 1',
    addedAt: now - ONE_DAY_MS * 2, // 2 days old
  };

  const borderVideo: ParkedVideo = {
    id: 'border_1',
    title: 'Border Video',
    channel: 'Channel 2',
    addedAt: now - ONE_DAY_MS * 7, // Exactly 7 days old
  };

  const expiredVideo: ParkedVideo = {
    id: 'expired_1',
    title: 'Expired Video',
    channel: 'Channel 3',
    addedAt: now - (ONE_DAY_MS * 7 + 1000), // 7 days + 1s old
  };

  const ancientVideo: ParkedVideo = {
    id: 'ancient_1',
    title: 'Ancient Video',
    channel: 'Channel 4',
    addedAt: now - ONE_DAY_MS * 30, // 30 days old
  };

  it('removes only items that exceed absolute age (autoExpireDays * 86400000)', () => {
    const queue = [freshVideo, borderVideo, expiredVideo, ancientVideo];
    const autoExpireDays = 7;

    const result = sweepExpiredVideosPure(queue, autoExpireDays, now);

    expect(result.expiredCount).toBe(2);
    expect(result.queue).toHaveLength(2);
    expect(result.queue).toEqual([freshVideo, borderVideo]);
  });

  it('returns count 0 and same array reference when no items are expired', () => {
    const queue = [freshVideo, borderVideo];
    const autoExpireDays = 7;

    const result = sweepExpiredVideosPure(queue, autoExpireDays, now);

    expect(result.expiredCount).toBe(0);
    expect(result.queue).toBe(queue);
  });
});
