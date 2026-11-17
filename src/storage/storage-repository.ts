import type { IsolatedChartSnapshot } from '@/src/models/chart-snapshot.types';
import type { StockRegistryState, StockRegistryItem } from '@/src/registry/stock-registry.types';
import { createInitialRegistryState, buildChartCompositeKey } from '@/src/registry/stock-registry';

const SNAPSHOT_KEY_PREFIX = 'chartSnapshots:';
const REGISTRY_KEY = 'stockRegistry';
const WATCHLIST_KEY = 'globalWatchlist';

export function buildSnapshotStorageKey(compositeKey: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${compositeKey}`;
}

export class StorageRepository {
  /**
   * Saves an isolated chart snapshot under its composite key partition
   */
  static async saveChartSnapshot(snapshot: IsolatedChartSnapshot): Promise<void> {
    const key = buildSnapshotStorageKey(snapshot.compositeKey);
    await browser.storage.local.set({ [key]: snapshot });
  }

  /**
   * Retrieves a chart snapshot by its composite key
   */
  static async getChartSnapshot(compositeKey: string): Promise<IsolatedChartSnapshot | null> {
    const key = buildSnapshotStorageKey(compositeKey);
    const data = await browser.storage.local.get(key);
    return (data[key] as IsolatedChartSnapshot) || null;
  }

  /**
   * Deletes a chart snapshot partition
   */
  static async deleteChartSnapshot(compositeKey: string): Promise<void> {
    const key = buildSnapshotStorageKey(compositeKey);
    await browser.storage.local.remove(key);
  }

  /**
   * Retrieves the current StockRegistryState
   */
  static async getStockRegistry(): Promise<StockRegistryState> {
    const data = await browser.storage.local.get(REGISTRY_KEY);
    if (data[REGISTRY_KEY] && typeof data[REGISTRY_KEY] === 'object' && (data[REGISTRY_KEY] as any).version === '2.0') {
      return data[REGISTRY_KEY] as StockRegistryState;
    }
    const initial = createInitialRegistryState();
    await browser.storage.local.set({ [REGISTRY_KEY]: initial });
    return initial;
  }

  /**
   * Saves the StockRegistryState
   */
  static async saveStockRegistry(registry: StockRegistryState): Promise<void> {
    await browser.storage.local.set({ [REGISTRY_KEY]: registry });
  }

  /**
   * Retrieves the decoupled global watchlist
   */
  static async getGlobalWatchlist(): Promise<any | null> {
    const data = await browser.storage.local.get(WATCHLIST_KEY);
    return data[WATCHLIST_KEY] || null;
  }

  /**
   * Saves the decoupled global watchlist
   */
  static async saveGlobalWatchlist(watchlist: any): Promise<void> {
    await browser.storage.local.set({ [WATCHLIST_KEY]: watchlist });
  }

  /**
   * Automatically migrates legacy MVP 1.0 storage format into Multi-Stock 2.0 schema
   */
  static async migrateStorageV1toV2(): Promise<boolean> {
    try {
      const data = await browser.storage.local.get([
        REGISTRY_KEY,
        'latestSnapshot',
        'latestIndicators',
        'latestWatchlist',
      ]);

      if (data[REGISTRY_KEY]) {
        // Already on v2.0
        return false;
      }

      console.log('[StorageRepository] Migrating legacy storage to Multi-Stock 2.0...');
      const now = Date.now();
      const registryItems: Record<string, StockRegistryItem> = {};
      let activeSymbol: string | null = null;
      let activeCompositeKey: string | null = null;

      // 1. Migrate Chart Snapshot
      if (data.latestSnapshot) {
        const rawSnap = data.latestSnapshot as any;
        const symbol = String(rawSnap.chart?.symbol || rawSnap.symbol || 'UNKNOWN').trim().toUpperCase();
        const timeframe = String(rawSnap.chart?.timeframe || rawSnap.timeframe || 'D').trim().toUpperCase();
        const exchange = 'VN';
        const compositeKey = buildChartCompositeKey(symbol, timeframe, exchange);

        const drawings = Array.isArray(rawSnap.drawings) ? rawSnap.drawings : [];
        const rawIndicators = data.latestIndicators as any;
        const indicators = Array.isArray(rawIndicators?.items) ? rawIndicators.items : [];

        const migratedSnapshot: IsolatedChartSnapshot = {
          version: '2.0',
          context: {
            symbol,
            exchange,
            timeframe,
            chartId: 'chart-0',
            compositeKey,
          },
          compositeKey,
          generationId: 1,
          drawings,
          indicators,
          drawingsCount: drawings.length,
          indicatorsCount: indicators.length,
          extractedAt: rawSnap.sync?.lastUpdated || now,
        };

        await this.saveChartSnapshot(migratedSnapshot);

        registryItems[symbol] = {
          symbol,
          exchange,
          sources: ['FIREANT'],
          isOpened: true,
          isActive: true,
          chartContexts: [
            {
              chartId: 'chart-0',
              timeframe,
              compositeKey,
              lastSyncAt: migratedSnapshot.extractedAt,
              drawingsCount: drawings.length,
              indicatorsCount: indicators.length,
            },
          ],
          lastDetectedAt: now,
          createdAt: now,
        };

        activeSymbol = symbol;
        activeCompositeKey = compositeKey;
      }

      // 2. Migrate Global Watchlist
      if (data.latestWatchlist) {
        await this.saveGlobalWatchlist(data.latestWatchlist);
      }

      // 3. Save Initial Registry State
      const registry: StockRegistryState = {
        version: '2.0',
        activeSymbol,
        activeCompositeKey,
        items: registryItems,
        updatedAt: now,
      };

      await this.saveStockRegistry(registry);
      console.log('[StorageRepository] Migration completed successfully.');
      return true;
    } catch (err) {
      console.error('[StorageRepository] Migration failed:', err);
      return false;
    }
  }
}
