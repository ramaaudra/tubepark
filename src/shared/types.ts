export interface ParkedVideo {
  id: string;
  title: string;
  channel: string;
  addedAt: number;
  watching?: boolean;
}

export interface TubeParkSettings {
  autoExpireDays: number;
  closeTabsOnPark: boolean;
  maxQueueSize: number;
}

export type CapacityStatus = 'safe' | 'warning' | 'full';

export interface CapacityState {
  status: CapacityStatus;
  count: number;
  max: number;
  percentage: number;
}

export const DEFAULT_SETTINGS: TubeParkSettings = {
  autoExpireDays: 7,
  closeTabsOnPark: true,
  maxQueueSize: 200,
};
