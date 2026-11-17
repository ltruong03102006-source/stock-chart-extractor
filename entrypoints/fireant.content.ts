import { EXTENSION_SOURCE } from '@/src/messaging/message.types';
import { ExtensionMessageSchema } from '@/src/messaging/message.schemas';

export default defineContentScript({
  matches: [
    'https://fireant.vn/*',
    'https://*.fireant.vn/*',
  ],
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_idle',

  main() {
    try {
      const GUARD_KEY = '__STOCK_CHART_EXTRACTOR_CONTENT_SCRIPT_INITIALIZED__';
      if ((window as unknown as Record<string, boolean>)[GUARD_KEY]) {
        return;
      }
      (window as unknown as Record<string, boolean>)[GUARD_KEY] = true;

      const isTopFrame = window === window.top;
      console.log(`[Stock Chart Extractor] Content Script is running! (frame: ${isTopFrame ? 'TOP' : 'IFRAME'})`);
      console.log('[Stock Chart Extractor] Current URL:', window.location.href);

      let lastSnapshotSignature = '';
      let lastIndicatorsSignature = '';
      let lastWatchlistSignature = '';

      // 1. Listen for messages from Main World Bridge -> forward to Extension Runtime (Side Panel / Background)
      window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data || event.data.source !== EXTENSION_SOURCE) {
          return;
        }

        const parseResult = ExtensionMessageSchema.safeParse(event.data);
        if (!parseResult.success) {
          return;
        }

        const message = parseResult.data;
        if (message.type === 'DRAWINGS_SNAPSHOT') {
          const snapshot = message.payload as any;
          const drawings = snapshot?.drawings || [];

          // Compute a high-fidelity signature covering ID, points coordinates, and styles
          // This accurately detects CREATE, UPDATE (Move Anchor / Style change), and DELETE
          const currentSignature = drawings.map((d: any) => {
            const pts = (d.points || []).map((p: any) => `${p.price !== undefined ? Number(p.price).toFixed(2) : ''}@${p.index ?? p.time ?? ''}`).join(',');
            const st = `${d.style?.linecolor ?? d.style?.color ?? ''}_${d.style?.linewidth ?? ''}_${d.style?.backgroundColor ?? ''}`;
            return `${d.id}:${pts}:${st}:${d.visible}:${d.locked}`;
          }).join('|');

          if (currentSignature !== lastSnapshotSignature) {
            const isInitial = lastSnapshotSignature === '';
            lastSnapshotSignature = currentSignature;

            console.log(`[Stock Chart Extractor][Isolated World] ${isInitial ? '✅ Initial' : '🔄 Lifecycle Update'}: Total ${drawings.length} drawing(s)`);
            if (Array.isArray(drawings) && drawings.length > 0 && !isInitial) {
              console.log(`[Stock Chart Extractor][Isolated World] Updated snapshot signature:`, currentSignature.slice(0, 100) + '...');
            }

            // Relay to background service worker and side panel on actual change
            try {
              browser.runtime.sendMessage(message).catch(() => {
                // Ignore if no active listener
              });
            } catch {
              // Ignore if context is invalidated
            }
          }
        }

        if (message.type === 'INDICATORS_SNAPSHOT') {
          const snapshot = message.payload as any;
          const items = snapshot?.items || [];
          const currentSignature = items.map((i: any) => `${i.id}:${JSON.stringify(i.inputs)}:${JSON.stringify(i.style)}`).join('|');
          if (currentSignature !== lastIndicatorsSignature) {
            lastIndicatorsSignature = currentSignature;
            console.log(`[Stock Chart Extractor][Isolated World] 📊 Indicators Updated: ${items.length} item(s)`);
            try {
              browser.runtime.sendMessage(message).catch(() => {});
            } catch {}
          }
        }

        if (message.type === 'WATCHLIST_SNAPSHOT') {
          const snapshot = message.payload as any;
          const currentSignature = JSON.stringify(snapshot?.watchlists || []);
          if (currentSignature !== lastWatchlistSignature) {
            lastWatchlistSignature = currentSignature;
            console.log(`[Stock Chart Extractor][Isolated World] 📋 Watchlist Updated: ${snapshot?.activeItems?.length || 0} symbol(s)`);
            try {
              browser.runtime.sendMessage(message).catch(() => {});
            } catch {}
          }
        }
      });

      // 2. Listen for messages from Extension Runtime (Side Panel) -> forward to Main World Bridge
      browser.runtime.onMessage.addListener((message: unknown) => {
        const parseResult = ExtensionMessageSchema.safeParse(message);
        if (!parseResult.success) {
          return;
        }

        if (
          parseResult.data.type === 'REQUEST_SYNC' ||
          parseResult.data.type === 'REQUEST_INDICATORS_SYNC' ||
          parseResult.data.type === 'REQUEST_WATCHLIST_SYNC' ||
          parseResult.data.type === 'PING'
        ) {
          window.postMessage(parseResult.data, '*');
        }
      });
    } catch (error) {
      console.error('[Stock Chart Extractor] Error initializing content script:', error);
    }
  },
});
