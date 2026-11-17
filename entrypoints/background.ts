import { ExtensionMessageSchema } from '@/src/messaging/message.schemas';

export default defineBackground(() => {
  console.log('[Stock Chart Extractor] Background service worker initialized.');

  // Helper to dynamically inject scripts into already-open FireAnt tabs if detached
  async function ensureInjected(tabId: number) {
    try {
      await browser.tabs.sendMessage(tabId, {
        source: 'STOCK_CHART_EXTRACTOR',
        type: 'PING',
        timestamp: Date.now(),
      });
    } catch {
      const chromeObj = (globalThis as any).chrome;
      if (chromeObj?.scripting?.executeScript) {
        try {
          await chromeObj.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: ['content-scripts/fireant-bridge.js'],
            world: 'MAIN',
          });
          await chromeObj.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: ['content-scripts/fireant.js'],
          });
          console.log(`[Stock Chart Extractor] Dynamically injected scripts into tab ${tabId}`);
        } catch (err) {
          console.warn(`[Stock Chart Extractor] Failed to inject scripts into tab ${tabId}:`, err);
        }
      }
    }
  }

  // Scan and auto-inject into existing FireAnt tabs on background startup
  browser.tabs.query({ url: ['*://fireant.vn/*', '*://*.fireant.vn/*'] }).then((tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) ensureInjected(tab.id);
    });
  }).catch(() => {});

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
      browser.tabs.query({ url: ['*://fireant.vn/*', '*://*.fireant.vn/*'] }).then((tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            ensureInjected(tab.id).then(() => {
              browser.tabs.sendMessage(tab.id!, {
                source: 'STOCK_CHART_EXTRACTOR',
                type: 'REQUEST_SYNC',
                timestamp: Date.now(),
              }).catch(() => {});
            });
          }
        });
      });
    }
  });
});
