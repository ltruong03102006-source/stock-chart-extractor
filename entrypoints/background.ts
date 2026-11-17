import { ExtensionMessageSchema } from '@/src/messaging/message.schemas';

export default defineBackground(() => {
  console.log('[Stock Chart Extractor] Background service worker initialized.');

  // Configure side panel to open on action click if supported by Chrome MV3
  const chromeObj = (globalThis as any).chrome;
  if (chromeObj?.sidePanel?.setPanelBehavior) {
    chromeObj.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err: any) => {
      console.warn('[Stock Chart Extractor] Failed to set side panel behavior:', err);
    });
  }

  // Message relay and storage caching
  browser.runtime.onMessage.addListener((message: unknown) => {
    const parsed = ExtensionMessageSchema.safeParse(message);
    if (!parsed.success) {
      return;
    }

    if (parsed.data.type === 'DRAWINGS_SNAPSHOT') {
      // Cache latest snapshot in storage so Side Panel loads immediately on open
      browser.storage.local.set({ latestSnapshot: parsed.data.payload }).catch(() => {});
    } else if (parsed.data.type === 'INDICATORS_SNAPSHOT') {
      browser.storage.local.set({ latestIndicators: parsed.data.payload }).catch(() => {});
    } else if (parsed.data.type === 'WATCHLIST_SNAPSHOT') {
      browser.storage.local.set({ latestWatchlist: parsed.data.payload }).catch(() => {});
    } else if (parsed.data.type === 'REQUEST_SYNC') {
      // 1. Reply immediately with cached snapshots to open views (e.g. Side Panel)
      browser.storage.local.get(['latestSnapshot', 'latestIndicators', 'latestWatchlist']).then((res: Record<string, unknown>) => {
        if (res.latestSnapshot) {
          browser.runtime.sendMessage({ source: 'STOCK_CHART_EXTRACTOR', type: 'DRAWINGS_SNAPSHOT', payload: res.latestSnapshot }).catch(() => {});
        }
        if (res.latestIndicators) {
          browser.runtime.sendMessage({ source: 'STOCK_CHART_EXTRACTOR', type: 'INDICATORS_SNAPSHOT', payload: res.latestIndicators }).catch(() => {});
        }
        if (res.latestWatchlist) {
          browser.runtime.sendMessage({ source: 'STOCK_CHART_EXTRACTOR', type: 'WATCHLIST_SNAPSHOT', payload: res.latestWatchlist }).catch(() => {});
        }
      });

      // 2. Query all FireAnt tabs and forward REQUEST_SYNC to refresh live data
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
