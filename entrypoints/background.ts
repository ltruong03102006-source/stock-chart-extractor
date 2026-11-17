import { ExtensionMessageSchema } from '@/src/messaging/message.schemas';
import {
  createInitialRegistryState,
  upsertFromFireAnt,
  addManualStock,
  removeManualStock,
  setActiveStock,
  updateChartContextSummary,
} from '@/src/registry/stock-registry';
import type { StockRegistryState, ChartContextPayload } from '@/src/registry/stock-registry.types';
import type { IsolatedChartSnapshot } from '@/src/models/chart-snapshot.types';
import { StorageRepository } from '@/src/storage/storage-repository';

export default defineBackground(() => {
  console.log('[Stock Chart Extractor] Background service worker initialized.');

  // Run v1 -> v2 storage migration on startup
  StorageRepository.migrateStorageV1toV2().catch((err) => {
    console.warn('[Stock Chart Extractor] Storage migration notice:', err);
  });

  // Configure side panel to open on action click if supported by Chrome MV3
  const chromeObj = (globalThis as any).chrome;
  if (chromeObj?.sidePanel?.setPanelBehavior) {
    chromeObj.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err: any) => {
      console.warn('[Stock Chart Extractor] Failed to set side panel behavior:', err);
    });
  }

  async function getStoredRegistry(): Promise<StockRegistryState> {
    try {
      const data = await browser.storage.local.get('stockRegistry');
      if (data?.stockRegistry && typeof data.stockRegistry === 'object' && (data.stockRegistry as any).version === '2.0') {
        return data.stockRegistry as StockRegistryState;
      }
    } catch (err) {
      console.warn('[Stock Chart Extractor] Error reading stockRegistry:', err);
    }
    const initial = createInitialRegistryState();
    await browser.storage.local.set({ stockRegistry: initial });
    return initial;
  }

  async function saveAndBroadcastRegistry(registry: StockRegistryState) {
    try {
      await browser.storage.local.set({ stockRegistry: registry });
      browser.runtime.sendMessage({
        source: 'STOCK_CHART_EXTRACTOR',
        type: 'STOCK_REGISTRY_UPDATED',
        payload: registry,
        timestamp: Date.now(),
      }).catch(() => {});
    } catch (err) {
      console.warn('[Stock Chart Extractor] Error saving/broadcasting registry:', err);
    }
  }

  // Message relay and storage caching
  browser.runtime.onMessage.addListener(async (message: unknown) => {
    const parsed = ExtensionMessageSchema.safeParse(message);
    if (!parsed.success) {
      return;
    }

    const { type, payload } = parsed.data;

    // 1. Chart Context Changed (Discovered from FireAnt Main World)
    if (type === 'CHART_CONTEXT_CHANGED') {
      const ctx = payload as ChartContextPayload;
      if (ctx?.symbol) {
        const reg = await getStoredRegistry();
        const updated = upsertFromFireAnt(reg, ctx);
        await saveAndBroadcastRegistry(updated);
      }
    }

    // 2. Add manual stock by user
    else if (type === 'ADD_MANUAL_STOCK') {
      const data = payload as { symbol: string; exchange?: string };
      if (data?.symbol) {
        const reg = await getStoredRegistry();
        const updated = addManualStock(reg, data.symbol, data.exchange);
        await saveAndBroadcastRegistry(updated);
      }
    }

    // 3. Remove manual stock by user
    else if (type === 'REMOVE_MANUAL_STOCK') {
      const data = payload as { symbol: string };
      if (data?.symbol) {
        const reg = await getStoredRegistry();
        const updated = removeManualStock(reg, data.symbol);
        await saveAndBroadcastRegistry(updated);
      }
    }

    // 4. Set active selected stock
    else if (type === 'SET_ACTIVE_STOCK') {
      const data = payload as { symbol: string | null };
      const reg = await getStoredRegistry();
      const updated = setActiveStock(reg, data?.symbol || null);
      await saveAndBroadcastRegistry(updated);
    }

    // 5. Request stock registry
    else if (type === 'REQUEST_STOCK_REGISTRY') {
      const reg = await getStoredRegistry();
      browser.runtime.sendMessage({
        source: 'STOCK_CHART_EXTRACTOR',
        type: 'STOCK_REGISTRY_UPDATED',
        payload: reg,
        timestamp: Date.now(),
      }).catch(() => {});
    }

    // 6. Drawings snapshot (legacy compatibility)
    else if (type === 'DRAWINGS_SNAPSHOT') {
      // Cache latest snapshot in storage for backwards compatibility and immediate display
      browser.storage.local.set({ latestSnapshot: payload }).catch(() => {});

      const snap = payload as any;
      const symbol = snap?.chart?.symbol;
      const timeframe = snap?.chart?.timeframe || 'D';
      const drawingsCount = snap?.drawings?.length ?? 0;
      if (symbol && symbol !== 'UNKNOWN') {
        const reg = await getStoredRegistry();
        const compositeKey = `${symbol.toUpperCase()}_VN_${timeframe.toUpperCase()}`;
        const updated = updateChartContextSummary(reg, compositeKey, drawingsCount, 0);
        await browser.storage.local.set({ stockRegistry: updated });
      }
    }

    // 7. Isolated Multi-Stock Chart Snapshot (v2.0)
    else if (type === 'ISOLATED_CHART_SNAPSHOT') {
      const snap = payload as IsolatedChartSnapshot;
      if (snap?.compositeKey) {
        await StorageRepository.saveChartSnapshot(snap);
        const reg = await getStoredRegistry();
        const updated = updateChartContextSummary(reg, snap.compositeKey, snap.drawingsCount, snap.indicatorsCount);
        await saveAndBroadcastRegistry(updated);
      }
    }

    // 8. Indicators snapshot
    else if (type === 'INDICATORS_SNAPSHOT') {
      browser.storage.local.set({ latestIndicators: payload }).catch(() => {});
    }

    // 9. Watchlist snapshot (Decoupled Global Storage)
    else if (type === 'WATCHLIST_SNAPSHOT') {
      browser.storage.local.set({ latestWatchlist: payload }).catch(() => {});
      StorageRepository.saveGlobalWatchlist(payload).catch(() => {});
    }

    // 9. Request Sync
    else if (type === 'REQUEST_SYNC') {
      // Reply immediately with cached registry and snapshots to open views
      const [storageData, registry] = await Promise.all([
        browser.storage.local.get(['latestSnapshot', 'latestIndicators', 'latestWatchlist']),
        getStoredRegistry(),
      ]);

      browser.runtime.sendMessage({
        source: 'STOCK_CHART_EXTRACTOR',
        type: 'STOCK_REGISTRY_UPDATED',
        payload: registry,
        timestamp: Date.now(),
      }).catch(() => {});

      if (storageData.latestSnapshot) {
        browser.runtime.sendMessage({
          source: 'STOCK_CHART_EXTRACTOR',
          type: 'DRAWINGS_SNAPSHOT',
          payload: storageData.latestSnapshot,
        }).catch(() => {});
      }
      if (storageData.latestIndicators) {
        browser.runtime.sendMessage({
          source: 'STOCK_CHART_EXTRACTOR',
          type: 'INDICATORS_SNAPSHOT',
          payload: storageData.latestIndicators,
        }).catch(() => {});
      }
      if (storageData.latestWatchlist) {
        browser.runtime.sendMessage({
          source: 'STOCK_CHART_EXTRACTOR',
          type: 'WATCHLIST_SNAPSHOT',
          payload: storageData.latestWatchlist,
        }).catch(() => {});
      }

      // Query all FireAnt tabs and forward REQUEST_SYNC to refresh live data
      browser.tabs.query({}).then((tabs) => {
        const fireantTabs = tabs.filter((t) => t.url && t.url.includes('fireant'));
        fireantTabs.forEach((tab) => {
          if (tab.id) {
            browser.tabs.sendMessage(tab.id, {
              source: 'STOCK_CHART_EXTRACTOR',
              type: 'REQUEST_SYNC',
              timestamp: Date.now(),
            }).catch(() => {});
          }
        });
      });
    }
  });
});
