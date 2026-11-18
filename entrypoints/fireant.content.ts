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
      const isTopFrame = window === window.top;
      console.log(`[Stock Chart Extractor] Content Script is running! (frame: ${isTopFrame ? 'TOP' : 'IFRAME'}, URL: ${window.location.href})`);
      console.log('[Stock Chart Extractor] Current URL:', window.location.href);

      let lastSnapshotSignature = '';
      let lastIndicatorsSignature = '';
      let lastWatchlistSignature = '';
      let forceNextRelay = true;

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

          // Compute a high-fidelity signature covering symbol, timeframe, ID, points coordinates, and styles
          const symTf = `${snapshot?.chart?.symbol || ''}_${snapshot?.chart?.timeframe || ''}:`;
          const currentSignature = symTf + drawings.map((d: any) => {
            const pts = (d.points || []).map((p: any) => `${p.price !== undefined ? Number(p.price).toFixed(2) : ''}@${p.index ?? p.time ?? ''}`).join(',');
            const st = `${d.style?.linecolor ?? d.style?.color ?? ''}_${d.style?.linewidth ?? ''}_${d.style?.backgroundColor ?? ''}`;
            return `${d.id}:${pts}:${st}:${d.visible}:${d.locked}`;
          }).join('|');

          const hasChanged = currentSignature !== lastSnapshotSignature;
          if (hasChanged || forceNextRelay) {
            const isInitial = lastSnapshotSignature === '';
            lastSnapshotSignature = currentSignature;

            if (hasChanged) {
              console.log(`[Stock Chart Extractor][Isolated World] ${isInitial ? '✅ Initial' : '🔄 Lifecycle Update'}: Total ${drawings.length} drawing(s)`);
            }

            try {
              browser.runtime.sendMessage(message).catch(() => {});
            } catch {}
          }
        }

        if (message.type === 'INDICATORS_SNAPSHOT') {
          const snapshot = message.payload as any;
          const items = snapshot?.items || [];
          const currentSignature = items.map((i: any) => `${i.id}:${JSON.stringify(i.inputs)}:${JSON.stringify(i.style)}`).join('|');
          const hasChanged = currentSignature !== lastIndicatorsSignature;
          if (hasChanged || forceNextRelay) {
            lastIndicatorsSignature = currentSignature;
            if (hasChanged) {
              console.log(`[Stock Chart Extractor][Isolated World] 📊 Indicators Updated: ${items.length} item(s)`);
            }
            try {
              browser.runtime.sendMessage(message).catch(() => {});
            } catch {}
          }
        }

        if (message.type === 'WATCHLIST_SNAPSHOT') {
          const snapshot = message.payload as any;
          const currentSignature = JSON.stringify(snapshot?.watchlists || []);
          const hasChanged = currentSignature !== lastWatchlistSignature;
          if (hasChanged || forceNextRelay) {
            lastWatchlistSignature = currentSignature;
            if (hasChanged) {
              console.log(`[Stock Chart Extractor][Isolated World] 📋 Watchlist Updated: ${snapshot?.activeItems?.length || 0} symbol(s)`);
            }
            try {
              browser.runtime.sendMessage(message).catch(() => {});
            } catch {}
          }
        }

        if (message.type === 'CHART_CONTEXT_CHANGED') {
          console.log(`[Stock Chart Extractor][Isolated World] 📍 Relaying Chart Context: ${(message.payload as any)?.compositeKey}`);
          try {
            browser.runtime.sendMessage(message).catch(() => {});
          } catch {}
        }

        if (message.type === 'ISOLATED_CHART_SNAPSHOT') {
          try {
            browser.runtime.sendMessage(message).catch(() => {});
          } catch {}
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
          // Reset signatures so fresh updates can be logged and delivered
          lastSnapshotSignature = '';
          lastIndicatorsSignature = '';
          lastWatchlistSignature = '';
          forceNextRelay = true;
          window.postMessage(parseResult.data, '*');
        }
      });
    } catch (error) {
      console.error('[Stock Chart Extractor] Error initializing content script:', error);
    }
  },
});
