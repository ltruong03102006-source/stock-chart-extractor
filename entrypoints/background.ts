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
    }
  });
});
