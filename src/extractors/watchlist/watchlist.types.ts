export interface WatchlistItem {
  id: string;
  symbol: string;
  name?: string;
  exchange?: string;
  price?: number | null;
  referencePrice?: number | null;
  change?: number | null;
  changePercent?: number | null;
  volume?: number | null;
  position: number;
  metadata: {
    source: 'fireant';
    extractionStatus: 'VERIFIED' | 'PARTIALLY VERIFIED';
  };
}

export interface WatchlistGroup {
  id: string;
  name: string;
  isDefault: boolean;
  displayIndex: number;
  totalSymbols: number;
  items: WatchlistItem[];
}

export interface WatchlistSnapshot {
  activeWatchlistId: string;
  totalWatchlists: number;
  watchlists: WatchlistGroup[];
  activeItems: WatchlistItem[];
  timestamp: number;
}
