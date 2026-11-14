import { EXTENSION_SOURCE, type ChartSnapshot, type DrawingObject } from '@/src/messaging/message.types';
import { extractDrawing } from '@/src/extractors/extractor.factory';
import { extractSafePoints } from '@/src/extractors/base.extractor';

export default defineContentScript({
  matches: [
    'https://fireant.vn/*',
    'https://*.fireant.vn/*',
  ],
  world: 'MAIN',
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_idle',

  main() {
    const isTopFrame = window === window.top;
    console.log(`[Stock Chart Extractor][Main World] Bridge initializing... (frame: ${isTopFrame ? 'TOP' : 'IFRAME'}, URL: ${window.location.href})`);

    /**
     * Active widget reference
     */
    let activeChartWidget: any = null;

    /**
     * Comprehensive Search for chartWidget across current window and child iframes
     */
    function locateChartWidget(): { widget: any; location: string } | null {
      const win = window as any;
      const candidateNames = ['chartWidget', 'tvWidget', 'tradingViewWidget', '_chartWidget', 'chart', 'widget'];

      // 1. Check current window
      for (const name of candidateNames) {
        if (win[name] && typeof win[name].model === 'function') {
          return { widget: win[name], location: `window.${name}` };
        }
      }

      // 2. If in top frame, scan child iframes
      if (isTopFrame) {
        try {
          const iframes = Array.from(document.querySelectorAll('iframe'));
          for (let i = 0; i < iframes.length; i++) {
            const iframe = iframes[i];
            if (!iframe) continue;
            try {
              const cw = iframe.contentWindow as any;
              if (cw) {
                for (const name of candidateNames) {
                  if (cw[name] && typeof cw[name].model === 'function') {
                    return {
                      widget: cw[name],
                      location: `iframe[${i}]#${iframe.id || 'no-id'} (src: "${iframe.src}") -> contentWindow.${name}`,
                    };
                  }
                }
              }
            } catch {
              // Cross-origin iframe or restricted access
            }
          }
        } catch {
          // DOM query error
        }
      }

      return null;
    }

    /**
     * Builds a complete snapshot of all active line tools
     */
    function buildSnapshot(): ChartSnapshot {
      let symbol = 'UNKNOWN';
      let timeframe = '';
      let drawings: DrawingObject[] = [];

      try {
        const found = locateChartWidget();
        const widget = found?.widget || activeChartWidget;
        if (widget && typeof widget.model === 'function') {
          const model = widget.model()?.m_model;
          if (model) {
            if (typeof model.mainSeries === 'function' && model.mainSeries()?.symbol) {
              symbol = String(model.mainSeries().symbol());
            }

            if (typeof model.allLineTools === 'function') {
              const rawTools = model.allLineTools();
              if (Array.isArray(rawTools)) {
                drawings = rawTools.map((t) => extractDrawing(t));
              }
            }
          }
        }
      } catch (err) {
        console.error('[Stock Chart Extractor] Error reading chart model:', err);
      }

      return {
        schemaVersion: '1.0',
        platform: 'fireant',
        chart: {
          symbol,
          timeframe,
          totalDrawings: drawings.length,
        },
        drawings,
        sync: {
          status: (activeChartWidget || locateChartWidget()) ? 'synced' : 'initializing',
          lastUpdated: Date.now(),
          totalDrawings: drawings.length,
        },
      };
    }

    /**
     * Broadcast snapshot to Isolated World Content Script via window.postMessage
     */
    function broadcastSnapshot() {
      const snapshot = buildSnapshot();
      window.postMessage(
        {
          source: EXTENSION_SOURCE,
          type: 'DRAWINGS_SNAPSHOT',
          payload: snapshot,
          timestamp: Date.now(),
        },
        '*'
      );
    }

    /**
     * Log detailed inventory of all currently exposed line tools
     */
    function logToolsInventory(tools: any[]) {
      console.log(`[Stock Chart Extractor][Main World] ========================================`);
      console.log(`[Stock Chart Extractor][Main World] Total Drawing Objects Detected: ${tools.length}`);
      tools.forEach((tool: any, idx: number) => {
        const extracted = extractDrawing(tool);
        console.log(
          `[Stock Chart Extractor][Main World] #[${idx + 1}]: ID="${extracted.id}" | Type="${extracted.type}" | Name="${extracted.name}" | PointsCount=${extracted.points.length}`
        );
        if (extracted.points.length > 0) {
          console.log(`     Points:`, extracted.points);
          console.log(`     Style:`, extracted.style);
        }
      });
      console.log(`[Stock Chart Extractor][Main World] ========================================`);
    }

    /**
     * Global diagnostic helper exposed to Console
     */
    (window as any).__STOCK_CHART_EXTRACTOR__ = {
      version: '1.0.0',
      locate: locateChartWidget,
      getWidget: () => activeChartWidget || locateChartWidget()?.widget,
      getAllLineTools: () => {
        const w = activeChartWidget || locateChartWidget()?.widget;
        return w?.model()?.m_model?.allLineTools?.() ?? [];
      },
      extractDrawing,
      buildSnapshot,
      getSnapshot: () => buildSnapshot(),
      logInventory: () => {
        const tools = (activeChartWidget || locateChartWidget()?.widget)?.model()?.m_model?.allLineTools?.() ?? [];
        logToolsInventory(tools);
        broadcastSnapshot();
        return tools;
      },
      diagnose: () => {
        const w = activeChartWidget || locateChartWidget()?.widget;
        if (!w) {
          console.warn('[Stock Chart Extractor] No active chart widget found!');
          return { error: 'No chart widget found' };
        }
        const model = w.model()?.m_model;
        if (!model) {
          console.warn('[Stock Chart Extractor] No chart model found!');
          return { error: 'No chart model found' };
        }
        const rawTools = model.allLineTools?.() ?? [];
        const summary = rawTools.map((t: any, idx: number) => {
          const rawName = typeof t.name === 'function' ? t.name() : undefined;
          const toolname = t.toolname;
          const id = typeof t.id === 'function' ? t.id() : t._id;
          const constructorName = t?.constructor?.name;
          const rawPoints = typeof t.points === 'function' ? t.points() : t._points;
          const ptsCount = Array.isArray(rawPoints) ? rawPoints.length : (typeof t.pointsCount === 'function' ? t.pointsCount() : 0);
          const extracted = extractDrawing(t);
          return {
            '#': idx + 1,
            ID: id,
            RawName: rawName || 'N/A',
            Toolname: toolname || 'N/A',
            Class: constructorName || 'unknown',
            Points: ptsCount,
            ExtractedType: extracted.type,
            ExtractedName: extracted.name,
          };
        });
        console.log(`[Stock Chart Extractor] === DIAGNOSTIC SUMMARY (${summary.length} tools) ===`);
        console.table(summary);
        return summary;
      },
      getToolsByType: (typeOrName: string) => {
        const tools = (activeChartWidget || locateChartWidget()?.widget)?.model()?.m_model?.allLineTools?.() ?? [];
        const cleanQuery = typeOrName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return tools
          .map((t: any) => extractDrawing(t))
          .filter((d: DrawingObject) => {
            const cleanType = d.type.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanName = d.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return (
              cleanType.includes(cleanQuery) ||
              cleanName.includes(cleanQuery) ||
              cleanQuery.includes(cleanType) ||
              cleanQuery.includes(cleanName)
            );
          });
      },
      syncNow: () => {
        broadcastSnapshot();
      },
    };

    /**
     * Polling detector for chartWidget across window and child iframes
     */
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds
    const intervalMs = 500;

    const timer = setInterval(() => {
      attempts++;

      const found = locateChartWidget();
      if (found) {
        activeChartWidget = found.widget;
        const model = activeChartWidget.model();
        if (model && model.m_model && typeof model.m_model.allLineTools === 'function') {
          const tools = model.m_model.allLineTools();

          // Check if points have been restored by TradingView
          const hasPoints = tools.length === 0 || tools.some((t: any) => extractSafePoints(t).length > 0);

          if (!hasPoints && attempts < maxAttempts - 10) {
            // Points still restoring from layout, wait for next tick
            return;
          }

          clearInterval(timer);
          console.log(`[Stock Chart Extractor][Main World] ✅ SUCCESS: Connected to chart widget at [${found.location}]!`);
          logToolsInventory(tools);

          // Broadcast initial snapshot
          broadcastSnapshot();

          // Continuously sync every 1 second
          setInterval(broadcastSnapshot, 1000);
          return;
        }
      }

      // Progress log every 10 attempts (5s) in top frame
      if (isTopFrame && attempts % 10 === 0) {
        console.log(`[Stock Chart Extractor][Main World] Still locating chart widget... (${attempts * 0.5}s elapsed)`);
      }

      // Timeout diagnosis in top frame
      if (attempts >= maxAttempts) {
        clearInterval(timer);
        if (isTopFrame) {
          console.warn('[Stock Chart Extractor][Main World] ⚠️ Timed out locating chart widget.');
        }
      }
    }, intervalMs);

    // Listen for requests from Isolated World
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.source !== EXTENSION_SOURCE) {
        return;
      }

      if (event.data.type === 'REQUEST_SYNC' || event.data.type === 'PING') {
        broadcastSnapshot();
      }
    });
  },
});
