import { ParkedVideo } from './types';
import { getQueue, getSettings, saveQueue } from './storage';

export const EXPIRE_ALARM_NAME = 'tubepark-expire-sweep';
export const EXPIRE_ALARM_PERIOD_MINUTES = 60;

export interface SweepResult {
  queue: ParkedVideo[];
  expiredCount: number;
}

export function sweepExpiredVideosPure(
  queue: ParkedVideo[],
  autoExpireDays: number,
  now: number = Date.now()
): SweepResult {
  const maxAgeMs = autoExpireDays * 86400000;

  const validItems: ParkedVideo[] = [];
  let expiredCount = 0;

  for (const item of queue) {
    if (now - item.addedAt > maxAgeMs) {
      expiredCount++;
    } else {
      validItems.push(item);
    }
  }

  if (expiredCount === 0) {
    return { queue, expiredCount: 0 };
  }

  return { queue: validItems, expiredCount };
}

export async function sweepExpiredVideos(): Promise<SweepResult> {
  const [queue, settings] = await Promise.all([getQueue(), getSettings()]);
  const result = sweepExpiredVideosPure(queue, settings.autoExpireDays);

  if (result.expiredCount > 0) {
    await saveQueue(result.queue);
  }

  return result;
}
