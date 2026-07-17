import {
  ParkedVideo,
  TubeParkSettings,
  CapacityState,
  DEFAULT_SETTINGS,
} from './types';

export const STORAGE_KEYS = {
  QUEUE: 'tubepark_queue',
  SETTINGS: 'tubepark_settings',
} as const;

export function deriveCapacityState(
  count: number,
  max: number = DEFAULT_SETTINGS.maxQueueSize
): CapacityState {
  const percentage = (count / max) * 100;
  const warningThreshold = Math.ceil(max * 0.8);

  let status: CapacityState['status'] = 'safe';
  if (count >= max) {
    status = 'full';
  } else if (count >= warningThreshold) {
    status = 'warning';
  }

  return {
    status,
    count,
    max,
    percentage,
  };
}

export interface ParkResult {
  success: boolean;
  duplicate: boolean;
  full: boolean;
  queue: ParkedVideo[];
}

export function parkVideoPure(
  queue: ParkedVideo[],
  newVideo: ParkedVideo,
  settings: TubeParkSettings = DEFAULT_SETTINGS
): ParkResult {
  if (queue.some((item) => item.id === newVideo.id)) {
    return { success: false, duplicate: true, full: false, queue };
  }

  if (queue.length >= settings.maxQueueSize) {
    return { success: false, duplicate: false, full: true, queue };
  }

  const updatedQueue = [...queue, newVideo];
  return { success: true, duplicate: false, full: false, queue: updatedQueue };
}

export function removeVideoPure(queue: ParkedVideo[], id: string): ParkedVideo[] {
  return queue.filter((item) => item.id !== id);
}

export function toggleWatchingPure(queue: ParkedVideo[], id: string): ParkedVideo[] {
  return queue.map((item) => {
    if (item.id === id) {
      return { ...item, watching: !item.watching };
    }
    return item;
  });
}

/* chrome.storage.local helper methods */

export async function getQueue(): Promise<ParkedVideo[]> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return [];
  }
  const data = await chrome.storage.local.get(STORAGE_KEYS.QUEUE);
  return (data[STORAGE_KEYS.QUEUE] as ParkedVideo[]) || [];
}

export async function getSettings(): Promise<TubeParkSettings> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return DEFAULT_SETTINGS;
  }
  const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEYS.SETTINGS] || {}) };
}

export async function saveQueue(queue: ParkedVideo[]): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.set({ [STORAGE_KEYS.QUEUE]: queue });
}

export async function parkVideo(video: ParkedVideo): Promise<ParkResult> {
  const [queue, settings] = await Promise.all([getQueue(), getSettings()]);
  const result = parkVideoPure(queue, video, settings);

  if (result.success) {
    await saveQueue(result.queue);
  }

  return result;
}

export async function removeVideo(id: string): Promise<ParkedVideo[]> {
  const queue = await getQueue();
  const updated = removeVideoPure(queue, id);
  await saveQueue(updated);
  return updated;
}

export async function toggleWatching(id: string): Promise<ParkedVideo[]> {
  const queue = await getQueue();
  const updated = toggleWatchingPure(queue, id);
  await saveQueue(updated);
  return updated;
}

export async function getCapacity(): Promise<CapacityState> {
  const [queue, settings] = await Promise.all([getQueue(), getSettings()]);
  return deriveCapacityState(queue.length, settings.maxQueueSize);
}
