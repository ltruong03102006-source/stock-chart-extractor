import { EXTENSION_SOURCE } from '@/src/messaging/message.types';
import { ExtensionMessageSchema } from '@/src/messaging/message.schemas';
import { buildChartCompositeKey, normalizeSymbol } from '@/src/registry/stock-registry.types';
import type { ChartContextPayload } from '@/src/registry/stock-registry.types';
import type { IsolatedChartSnapshot } from '@/src/models/chart-snapshot.types';

export default defineContentScript({
  matches: [
    'https://tradingview.com/*',
    'https://*.tradingview.com/*',
  ],
  runAt: 'document_idle',

  main() {
    try {
      console.log(`[Stock Chart Extractor][TradingView Isolated] Content script active on ${window.location.href}`);

      let currentContext: ChartContextPayload | null = null;
      let lastCompositeKey = '';
      let lastSnapshotSignature = '';

      /**
       * Checks whether the extension context is still active and valid.
       * When extension is reloaded in chrome://extensions/, orphaned content scripts
       * will have an invalidated runtime context and must not make runtime calls.
       */
      function isExtensionValid(): boolean {
        try {
          const chromeObj = (globalThis as any).chrome;
          if (chromeObj?.runtime?.id) return true;
          if (typeof browser !== 'undefined' && browser.runtime?.id) return true;
          return Boolean(typeof browser !== 'undefined' && browser.runtime);
        } catch {
          return false;
        }
      }

      /**
       * Safely dispatches messages to Extension Runtime (Background / Side Panel)
       * completely guarded against "Extension context invalidated" and "Receiving end does not exist".
       */
      function safeSendMessage(message: unknown): void {
        try {
          if (!isExtensionValid()) return;

          const chromeObj = (globalThis as any).chrome;
          if (chromeObj?.runtime?.sendMessage) {
            chromeObj.runtime.sendMessage(message, () => {
              // Accessing lastError silences "Unchecked runtime.lastError" in Chrome DevTools
              const _ = chromeObj.runtime?.lastError;
            });
            return;
          }

          if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
            browser.runtime.sendMessage(message).catch(() => {});
          }
        } catch {
          // Suppress any extension context invalidated or connection errors safely
        }
      }

      /**
       * Multi-layer Cascade for Chart Context Extraction
       * Layer 1: DOM Header Button (#header-toolbar-symbol-search)
       * Layer 2: Document Title Regex Cascade (Timeframe, Live Price, Parentheses, Dash)
       * Layer 3: URL Search Parameters (?symbol=)
       * Layer 4: Legend Series Element
       */
      function extractTradingViewContext(): ChartContextPayload | null {
        try {
          let symbol = '';
          let exchange = 'US';
          let timeframe = 'D';
          let chartId = 'chart-0';

          // 1. URL Path Layout ID
          const url = new URL(window.location.href);
          const pathSegments = url.pathname.split('/').filter(Boolean);
          if (pathSegments[0] === 'chart' && pathSegments.length >= 2 && pathSegments[1]) {
            chartId = pathSegments[1];
          }

          const urlInterval = url.searchParams.get('interval');
          if (urlInterval) timeframe = urlInterval;

          // ----------------------------------------------------
          // LAYER 1: DOM Header Toolbar Symbol Button
          // ----------------------------------------------------
          const symbolBtn = document.querySelector(
            '#header-toolbar-symbol-search, [data-name="header-toolbar-symbol-search"], button[class*="symbolSearch-"], div[class*="symbolSearch-"]'
          );
          if (symbolBtn) {
            // Check data-symbol attribute if present
            const attrSymbol = symbolBtn.getAttribute('data-symbol') || symbolBtn.getAttribute('data-ticker');
            if (attrSymbol) symbol = normalizeSymbol(attrSymbol);

            if (!symbol) {
              const textChild = symbolBtn.querySelector('[class*="text-"], [class*="js-button-text"], [class*="title-"]');
              const raw = (textChild?.textContent || symbolBtn.textContent || '').trim();
              if (raw) {
                const firstToken = raw.split(/[\s·\n\r\t]+/)[0];
                if (firstToken && firstToken.length <= 12) {
                  if (firstToken.includes(':')) {
                    const parts = firstToken.split(':');
                    if (parts[0]) exchange = parts[0].trim().toUpperCase();
                    if (parts[1]) symbol = normalizeSymbol(parts[1]);
                  } else {
                    symbol = normalizeSymbol(firstToken);
                  }
                }
              }
            }
          }

          // ----------------------------------------------------
          // LAYER 2: Document Title Multi-Pattern Cascade
          // ----------------------------------------------------
          if (!symbol && document.title) {
            const title = document.title.trim();

            // P1: Ticker with timeframe (e.g. "AAPL 1D · TradingView")
            const m1 = title.match(/^([A-Z0-9.\-_]{1,10})\s+([0-9]+[DWMmhd]?|[DWM])\s*[·—\-]/i);
            if (m1 && m1[1]) {
              symbol = normalizeSymbol(m1[1]);
              if (m1[2]) timeframe = m1[2].toUpperCase();
            }

            // P2: Ticker with live price (e.g. "AAPL 225.50 · TradingView" or "RUT 2,701.87 FTSE · TradingView")
            if (!symbol) {
              const m2 = title.match(/^([A-Z0-9.\-_]{1,10})\s+[\d,.]+(?:\s+([A-Z]{2,10}))?\s*(?:[▲▼+\-−].*?)?\s*[·—\-]/i);
              if (m2 && m2[1]) {
                symbol = normalizeSymbol(m2[1]);
                if (m2[2]) exchange = m2[2].toUpperCase();
              }
            }

            // P3: Parenthesized ticker (e.g. "Apple Inc (NASDAQ:AAPL)" or "Tesla Inc (TSLA)")
            if (!symbol) {
              const m3 = title.match(/\((?:([A-Z]+):)?([A-Z0-9]+)\)/i);
              if (m3) {
                if (m3[1] && m3[2]) {
                  exchange = m3[1].trim().toUpperCase();
                  symbol = normalizeSymbol(m3[2]);
                } else if (m3[2] || m3[1]) {
                  symbol = normalizeSymbol(m3[2] || m3[1] || '');
                }
              }
            }

            // P4: Dash separated (e.g. "AAPL — 1D — NASDAQ · TradingView" or "AAPL - Apple Inc")
            if (!symbol) {
              const m4 = title.match(/^([A-Z0-9.\-_]{1,10})\s+[-—]\s+/i);
              if (m4 && m4[1]) {
                symbol = normalizeSymbol(m4[1]);
              }
            }

            // P5: Generic TradingView ending
            if (!symbol && /TradingView/i.test(title)) {
              const m5 = title.match(/^([A-Z0-9]{1,10})\b/i);
              if (m5 && m5[1]) {
                symbol = normalizeSymbol(m5[1]);
              }
            }
          }

          // ----------------------------------------------------
          // LAYER 3: URL Search Parameter (?symbol=)
          // ----------------------------------------------------
          const urlSymbol = url.searchParams.get('symbol');
          if (!symbol && urlSymbol) {
            if (urlSymbol.includes(':')) {
              const parts = urlSymbol.split(':');
              if (parts[0]) exchange = parts[0].trim().toUpperCase();
              if (parts[1]) symbol = normalizeSymbol(parts[1]);
            } else {
              symbol = normalizeSymbol(urlSymbol);
            }
          }

          // ----------------------------------------------------
          // LAYER 4: Legend Series Title
          // ----------------------------------------------------
          if (!symbol) {
            const legendTitle = document.querySelector('[data-name="legend-series-item"], [class*="legend-"] [class*="title-"]');
            if (legendTitle && legendTitle.textContent) {
              const firstToken = legendTitle.textContent.trim().split(/[\s·\n\r\t]+/)[0];
              if (firstToken && firstToken.length <= 10) {
                symbol = normalizeSymbol(firstToken);
              }
            }
          }

          // Refine Exchange if still default 'US'
          if (exchange === 'US') {
            if (urlSymbol && urlSymbol.includes(':')) {
              const parts = urlSymbol.split(':');
              if (parts[0]) exchange = parts[0].trim().toUpperCase();
            } else if (document.title) {
              const titleMatch = document.title.match(/[\d,.]+\s+([A-Z]{2,10})\s*[·—\-]/i);
              if (titleMatch && titleMatch[1]) {
                exchange = titleMatch[1].trim().toUpperCase();
              }
            }
          }

          if (!symbol || symbol === 'UNKNOWN' || symbol === 'BI' || symbol.length < 1) {
            return null;
          }

          // Resolve Timeframe from DOM Interval Bar if not yet resolved
          if (timeframe === 'D') {
            const activeIntervalBtn = document.querySelector(
              '[data-name="timeframe-custom-intervals"] button[class*="isActive-"], [data-name="header-toolbar-intervals"] button[aria-checked="true"], div[class*="intervals-"] button[class*="isActive-"], div[class*="intervals-"] button[class*="selected-"]'
            );
            if (activeIntervalBtn && activeIntervalBtn.textContent) {
              timeframe = activeIntervalBtn.textContent.trim().toUpperCase();
            }
          }

          const compositeKey = buildChartCompositeKey(symbol, timeframe, exchange);

          return {
            symbol,
            exchange,
            timeframe,
            chartId,
            compositeKey,
            platform: 'tradingview',
          };
        } catch (err) {
          console.warn('[Stock Chart Extractor][TradingView Isolated] Context extraction error:', err);
          return null;
        }
      }

      /**
       * Check and broadcast context changes
       */
      function checkContext(force = false) {
        if (!isExtensionValid()) return;

        const ctx = extractTradingViewContext();
        if (!ctx) return;

        if (force || ctx.compositeKey !== lastCompositeKey) {
          lastCompositeKey = ctx.compositeKey;
          currentContext = ctx;
          console.log(`[Stock Chart Extractor][TradingView Isolated] 📍 Context Changed: ${ctx.compositeKey} (forced: ${force})`);

          // Safely send to background service worker
          safeSendMessage({
            source: EXTENSION_SOURCE,
            type: 'CHART_CONTEXT_CHANGED',
            payload: ctx,
            timestamp: Date.now(),
          });

          // Request Main World bridge to refresh drawings for new symbol
          window.postMessage({
            source: EXTENSION_SOURCE,
            type: 'REFRESH_TRADINGVIEW_DRAWINGS',
            timestamp: Date.now(),
          }, '*');
        }
      }

      // Initial context check and polling loop
      setTimeout(() => checkContext(true), 400);
      setTimeout(() => checkContext(), 1200);
      setTimeout(() => checkContext(), 3000);

      const pollingInterval = setInterval(() => {
        if (!isExtensionValid()) {
          clearInterval(pollingInterval);
          return;
        }
        checkContext();
      }, 1500);

      // Listen for URL changes and user interactions
      window.addEventListener('popstate', () => setTimeout(() => checkContext(true), 150));
      window.addEventListener('click', () => [100, 350, 800].forEach((d) => setTimeout(() => checkContext(), d)), true);

      // Title mutation observer for instant context notification
      const titleEl = document.querySelector('title');
      if (titleEl) {
        const titleObs = new MutationObserver(() => checkContext());
        titleObs.observe(titleEl, { childList: true, characterData: true, subtree: true });
      }

      /**
       * Lifecycle Observer: Detect drawing selection via Floating Toolbar
       */
      const bodyObs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          m.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              if (el.matches?.('[class*="floating-toolbar"], [data-name="drawing-toolbar"]') || el.querySelector?.('[class*="floating-toolbar"], [data-name="drawing-toolbar"]')) {
                // Drawing selected by user -> ask Main World bridge to refresh drawings snapshot
                window.postMessage({
                  source: EXTENSION_SOURCE,
                  type: 'REFRESH_TRADINGVIEW_DRAWINGS',
                  timestamp: Date.now(),
                }, '*');
              }
            }
          });
        }
      });

      function initBodyObserver() {
        if (!document.body) {
          document.addEventListener('DOMContentLoaded', initBodyObserver);
          return;
        }
        try {
          bodyObs.observe(document.body, { childList: true, subtree: true });
        } catch {}
      }
      initBodyObserver();

      /**
       * Listen for messages from Main World Bridge -> forward to Extension Runtime
       */
      window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data || event.data.source !== EXTENSION_SOURCE) {
          return;
        }

        const parseResult = ExtensionMessageSchema.safeParse(event.data);
        if (!parseResult.success) return;

        const message = parseResult.data;

        // 1. Context Changed message from Main World Bridge
        if (message.type === 'CHART_CONTEXT_CHANGED') {
          const ctx = message.payload as ChartContextPayload;
          if (ctx?.symbol && ctx.symbol !== 'BI' && ctx.symbol !== 'UNKNOWN') {
            currentContext = ctx;
            lastCompositeKey = ctx.compositeKey;
            console.log(`[Stock Chart Extractor][TradingView Isolated] Relaying Main World context: ${ctx.compositeKey}`);
            safeSendMessage(message);
          }
        }

        // 2. Drawings Snapshot message from Main World Bridge
        else if (message.type === 'DRAWINGS_SNAPSHOT') {
          const snapshot = message.payload as any;
          const drawings = snapshot?.drawings || [];

          // Bind current chart context to snapshot
          const activeCtx = currentContext || extractTradingViewContext() || {
            symbol: snapshot.chart?.symbol || 'AAPL',
            exchange: snapshot.chart?.exchange || 'US',
            timeframe: snapshot.chart?.timeframe || 'D',
            chartId: 'chart-0',
            compositeKey: `${snapshot.chart?.symbol || 'AAPL'}_${snapshot.chart?.exchange || 'US'}_${snapshot.chart?.timeframe || 'D'}`,
            platform: 'tradingview',
          };

          snapshot.chart = {
            symbol: activeCtx.symbol,
            exchange: activeCtx.exchange,
            timeframe: activeCtx.timeframe,
            totalDrawings: drawings.length,
          };
          snapshot.platform = 'tradingview';

          // High-fidelity signature check covering coordinates and style
          const ptsSignature = drawings.map((d: any) => {
            const pts = (d.points || []).map((p: any) => `${p.price !== undefined ? Number(p.price).toFixed(2) : ''}@${p.index ?? p.time ?? ''}`).join(',');
            const st = `${d.style?.linecolor ?? d.style?.color ?? ''}_${d.style?.linewidth ?? ''}_${d.style?.backgroundColor ?? ''}`;
            return `${d.id}:${pts}:${st}:${d.visible}:${d.locked}`;
          }).join(';');
          const signature = `${activeCtx.compositeKey}:${drawings.length}:${ptsSignature}`;

          if (signature !== lastSnapshotSignature) {
            lastSnapshotSignature = signature;
            console.log(`[Stock Chart Extractor][TradingView Isolated] Relaying ${drawings.length} drawing(s) for ${activeCtx.compositeKey}`);

            // 1. Send legacy DRAWINGS_SNAPSHOT
            safeSendMessage({
              source: EXTENSION_SOURCE,
              type: 'DRAWINGS_SNAPSHOT',
              payload: snapshot,
              timestamp: Date.now(),
            });

            // 2. Send v2.0 ISOLATED_CHART_SNAPSHOT
            const isolatedSnapshot: IsolatedChartSnapshot = {
              version: '2.0',
              context: activeCtx,
              compositeKey: activeCtx.compositeKey,
              generationId: Date.now(),
              drawings,
              indicators: [],
              drawingsCount: drawings.length,
              indicatorsCount: 0,
              extractedAt: Date.now(),
            };

            safeSendMessage({
              source: EXTENSION_SOURCE,
              type: 'ISOLATED_CHART_SNAPSHOT',
              payload: isolatedSnapshot,
              timestamp: Date.now(),
            });
          }
        }
      });

      /**
       * Listen for messages from Extension Runtime (Side Panel / Background)
       */
      try {
        if (isExtensionValid() && typeof browser !== 'undefined' && browser.runtime?.onMessage) {
          browser.runtime.onMessage.addListener((message: unknown) => {
            const parsed = ExtensionMessageSchema.safeParse(message);
            if (!parsed.success) return;

            if (parsed.data.type === 'REQUEST_SYNC' || parsed.data.type === 'PING') {
              lastSnapshotSignature = '';
              checkContext(true);
              window.postMessage(parsed.data, '*');
            }
          });
        }
      } catch {}
    } catch (err) {
      console.error('[Stock Chart Extractor][TradingView Isolated] Initialization error:', err);
    }
  },
});
