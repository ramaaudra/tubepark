import { describe, it, expect } from 'vitest';
import {
  deriveCapacityState,
  parkVideoPure,
  removeVideoPure,
  toggleWatchingPure,
} from './storage';
import { ParkedVideo, DEFAULT_SETTINGS } from './types';

describe('Storage Pure Functions & Capacity Logic', () => {
  const sampleVideo1: ParkedVideo = {
    id: 'abc12345678',
    title: 'Test Video 1',
    channel: 'Test Channel',
    addedAt: 1700000000000,
  };

  const sampleVideo2: ParkedVideo = {
    id: 'xyz98765432',
    title: 'Test Video 2',
    channel: 'Test Channel 2',
    addedAt: 1700000005000,
  };

  describe('deriveCapacityState', () => {
    it('returns safe status when below 80% capacity', () => {
      const state = deriveCapacityState(159, 200);
      expect(state.status).toBe('safe');
      expect(state.count).toBe(159);
      expect(state.max).toBe(200);
      expect(state.percentage).toBe(79.5);
    });

    it('returns warning status at 80% capacity (160 items)', () => {
      const state = deriveCapacityState(160, 200);
      expect(state.status).toBe('warning');
      expect(state.percentage).toBe(80);
    });

    it('returns warning status between 80% and 99% capacity', () => {
      const state = deriveCapacityState(199, 200);
      expect(state.status).toBe('warning');
    });

    it('returns full status at 100% capacity (200 items)', () => {
      const state = deriveCapacityState(200, 200);
      expect(state.status).toBe('full');
      expect(state.percentage).toBe(100);
    });
  });

  describe('parkVideoPure', () => {
    it('appends a new video when queue is empty', () => {
      const result = parkVideoPure([], sampleVideo1, DEFAULT_SETTINGS);
      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(false);
      expect(result.full).toBe(false);
      expect(result.queue).toHaveLength(1);
      expect(result.queue[0]).toEqual(sampleVideo1);
    });

    it('ignores parking a video if id already exists in queue (dedupe)', () => {
      const initialQueue = [sampleVideo1];
      const duplicateVideo: ParkedVideo = {
        ...sampleVideo1,
        title: 'Updated Title Should Be Ignored',
      };
      const result = parkVideoPure(initialQueue, duplicateVideo, DEFAULT_SETTINGS);
      expect(result.success).toBe(false);
      expect(result.duplicate).toBe(true);
      expect(result.full).toBe(false);
      expect(result.queue).toEqual(initialQueue);
    });

    it('rejects parking when queue is at max capacity (200 items)', () => {
      const fullQueue: ParkedVideo[] = Array.from({ length: 200 }, (_, i) => ({
        id: `video_${i}`,
        title: `Video ${i}`,
        channel: 'Channel',
        addedAt: 1700000000000 + i,
      }));

      const result = parkVideoPure(fullQueue, sampleVideo1, DEFAULT_SETTINGS);
      expect(result.success).toBe(false);
      expect(result.full).toBe(true);
      expect(result.duplicate).toBe(false);
      expect(result.queue).toHaveLength(200);
    });
  });

  describe('removeVideoPure', () => {
    it('removes video by id from queue', () => {
      const initialQueue = [sampleVideo1, sampleVideo2];
      const updatedQueue = removeVideoPure(initialQueue, sampleVideo1.id);
      expect(updatedQueue).toHaveLength(1);
      expect(updatedQueue[0]).toEqual(sampleVideo2);
    });

    it('returns unchanged queue if id does not exist', () => {
      const initialQueue = [sampleVideo1];
      const updatedQueue = removeVideoPure(initialQueue, 'nonexistent');
      expect(updatedQueue).toEqual(initialQueue);
    });
  });

  describe('toggleWatchingPure', () => {
    it('sets watching to true if omitted or false', () => {
      const initialQueue = [sampleVideo1];
      const updatedQueue = toggleWatchingPure(initialQueue, sampleVideo1.id);
      expect(updatedQueue[0].watching).toBe(true);
    });

    it('sets watching to false if currently true', () => {
      const initialQueue: ParkedVideo[] = [{ ...sampleVideo1, watching: true }];
      const updatedQueue = toggleWatchingPure(initialQueue, sampleVideo1.id);
      expect(updatedQueue[0].watching).toBe(false);
    });
  });
});
