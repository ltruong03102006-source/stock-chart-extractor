import { ExtensionMessageSchema } from '@/src/messaging/message.schemas';
import {
  createInitialRegistryState,
  upsertFromFireAnt,
  upsertFromTradingView,
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

  // Purge any stale phantom snapshots on startup
  browser.storage.local.get(['latestSnapshot']).then((data: Record<string, any>) => {
    const snap = data?.latestSnapshot;
    const sym = snap?.chart?.symbol;
    const isTv = snap?.platform === 'tradingview';
    const minLen = isTv ? 1 : 3;
    if (sym === 'BI' || sym === 'UNKNOWN' || (sym && sym.length < minLen)) {
      browser.storage.local.remove('latestSnapshot').catch(() => {});
    }
  }).catch(() => {});

  // Configure side panel to open on action click if supported by Chrome MV3
  const chromeObj = (globalThis as any).chrome;
  if (chromeObj?.sidePanel?.setPanelBehavior) {
    chromeObj.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err: any) => {
      console.warn('[Stock Chart Extractor] Failed to set side panel behavior:', err);
    });
  }

  // Synchronize active stock when user switches tabs in Chrome
  browser.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await browser.tabs.get(activeInfo.tabId);
      if (!tab?.url) return;
      if (tab.url.includes('tradingview') || tab.url.includes('fireant')) {
        browser.tabs.sendMessage(activeInfo.tabId, {
          source: 'STOCK_CHART_EXTRACTOR',
          type: 'REQUEST_SYNC',
          timestamp: Date.now(),
        }).catch(() => {});
      }
    } catch {}
  });

  function sanitizeRegistry(registry: StockRegistryState): StockRegistryState {
    if (!registry || !registry.items) return registry;
    let changed = false;
    const nextItems = { ...registry.items };
    for (const key of Object.keys(nextItems)) {
      const item = nextItems[key];
      const isTv = item?.platform === 'tradingview' || item?.sources?.includes('TRADINGVIEW');
      const minLen = isTv ? 1 : 3;
      if (key === 'BI' || key === 'UNKNOWN' || key.length < minLen) {
        delete nextItems[key];
        changed = true;
      }
    }
    let activeSymbol = registry.activeSymbol;
    let activeCompositeKey = registry.activeCompositeKey;
    if (activeSymbol === 'BI' || (activeSymbol && !nextItems[activeSymbol])) {
      const remaining = Object.values(nextItems);
      const nextActive = remaining.find((i) => i.isActive) || remaining.find((i) => i.isOpened) || remaining[0] || null;
      activeSymbol = nextActive ? nextActive.symbol : null;
      activeCompositeKey = nextActive?.chartContexts[0]?.compositeKey || null;
      changed = true;
    }
    return changed ? { ...registry, activeSymbol, activeCompositeKey, items: nextItems, updatedAt: Date.now() } : registry;
  }

  async function getStoredRegistry(): Promise<StockRegistryState> {
    try {
      const data = await browser.storage.local.get('stockRegistry');
      if (data?.stockRegistry && typeof data.stockRegistry === 'object' && (data.stockRegistry as any).version === '2.0') {
        const sanitized = sanitizeRegistry(data.stockRegistry as StockRegistryState);
        if (sanitized !== data.stockRegistry) {
          await browser.storage.local.set({ stockRegistry: sanitized });
        }
        return sanitized;
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
      const sanitized = sanitizeRegistry(registry);
      await browser.storage.local.set({ stockRegistry: sanitized });
      browser.runtime.sendMessage({
        source: 'STOCK_CHART_EXTRACTOR',
        type: 'STOCK_REGISTRY_UPDATED',
        payload: sanitized,
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

    // 1. Chart Context Changed (Discovered from FireAnt or TradingView Main World)
    if (type === 'CHART_CONTEXT_CHANGED') {
      const ctx = payload as ChartContextPayload;
      const minLength = ctx?.platform === 'tradingview' ? 1 : 3;
      if (ctx?.symbol && ctx.symbol !== 'BI' && ctx.symbol.length >= minLength) {
        const reg = await getStoredRegistry();
        const updated = ctx.platform === 'tradingview'
          ? upsertFromTradingView(reg, ctx)
          : upsertFromFireAnt(reg, ctx);
        await saveAndBroadcastRegistry(updated);
      }
    }

    // 2. Add manual stock by user
    else if (type === 'ADD_MANUAL_STOCK') {
      const data = payload as { symbol: string; exchange?: string };
      if (data?.symbol && data.symbol.length >= 3) {
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
        // Also force delete from items map
        if (updated.items[data.symbol.toUpperCase()]) {
          delete updated.items[data.symbol.toUpperCase()];
        }
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

    // 6. Drawings snapshot (legacy compatibility & live chart sync)
    else if (type === 'DRAWINGS_SNAPSHOT') {
      const snap = payload as any;
      const symbol = snap?.chart?.symbol;
      const timeframe = snap?.chart?.timeframe || 'D';
      const exchange = snap?.chart?.exchange || 'VN';
      const drawingsCount = snap?.drawings?.length ?? 0;

      // GUARD: Never cache or process phantom ticker 'BI' or invalid symbols
      const minLength = snap?.platform === 'tradingview' ? 1 : 3;
      if (!symbol || symbol === 'UNKNOWN' || symbol === 'BI' || symbol.length < minLength) {
        return;
      }

      // Cache latest snapshot in storage for backwards compatibility and immediate display
      browser.storage.local.set({ latestSnapshot: payload }).catch(() => {});

      const reg = await getStoredRegistry();
      const ctxPayload: ChartContextPayload = {
        symbol: symbol.toUpperCase(),
        exchange: exchange.toUpperCase(),
        timeframe: timeframe.toUpperCase(),
        chartId: 'chart-0',
        compositeKey: `${symbol.toUpperCase()}_${exchange.toUpperCase()}_${timeframe.toUpperCase()}`,
        platform: snap?.platform || 'fireant',
      };

      let updated = ctxPayload.platform === 'tradingview'
        ? upsertFromTradingView(reg, ctxPayload)
        : upsertFromFireAnt(reg, ctxPayload);

      updated = updateChartContextSummary(updated, ctxPayload.compositeKey, drawingsCount, 0);
      await saveAndBroadcastRegistry(updated);
    }

    // 7. Isolated Multi-Stock Chart Snapshot (v2.0)
    else if (type === 'ISOLATED_CHART_SNAPSHOT') {
      const snap = payload as IsolatedChartSnapshot;
      const symbol = snap?.context?.symbol;
      const minLength = snap?.context?.platform === 'tradingview' ? 1 : 3;
      if (snap?.compositeKey && symbol && symbol !== 'BI' && symbol !== 'UNKNOWN' && symbol.length >= minLength) {
        await StorageRepository.saveChartSnapshot(snap);
        const reg = await getStoredRegistry();
        let updated = snap.context.platform === 'tradingview'
          ? upsertFromTradingView(reg, snap.context)
          : upsertFromFireAnt(reg, snap.context);
        updated = updateChartContextSummary(updated, snap.compositeKey, snap.drawingsCount, snap.indicatorsCount);
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

      // Query all FireAnt and TradingView tabs and forward REQUEST_SYNC to refresh live data
      browser.tabs.query({}).then((tabs) => {
        const chartTabs = tabs.filter(
          (t) => t.url && (t.url.includes('fireant') || t.url.includes('tradingview.com'))
        );
        chartTabs.forEach((tab) => {
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
