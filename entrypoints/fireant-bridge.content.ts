import { EXTENSION_SOURCE, type ChartSnapshot, type DrawingObject } from '@/src/messaging/message.types';
import { extractDrawing } from '@/src/extractors/extractor.factory';
import { extractSafePoints } from '@/src/extractors/base.extractor';
import { extractAllIndicators } from '@/src/extractors/indicators/indicator.extractor';
import { extractWatchlists } from '@/src/extractors/watchlist/watchlist.extractor';

export default defineContentScript({
  matches: [
    '*://fireant.vn/*',
    '*://*.fireant.vn/*',
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
      try {
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
      } catch (err) {
        console.warn('[Stock Chart Extractor] broadcastSnapshot error:', err);
      }
    }

    /**
     * Broadcast indicators snapshot
     */
    function broadcastIndicators() {
      try {
        const found = locateChartWidget();
        const widget = found?.widget || activeChartWidget;
        const model = widget?.model()?.m_model;
        if (!model) return;

        const indicatorsSnapshot = extractAllIndicators(model);
        window.postMessage(
          {
            source: EXTENSION_SOURCE,
            type: 'INDICATORS_SNAPSHOT',
            payload: indicatorsSnapshot,
            timestamp: Date.now(),
          },
          '*'
        );
      } catch (err) {
        console.warn('[Stock Chart Extractor] broadcastIndicators error:', err);
      }
    }

    /**
     * Broadcast watchlist snapshot
     */
    function broadcastWatchlist() {
      try {
        if (!isTopFrame) return;

        const watchlistSnapshot = extractWatchlists();
        window.postMessage(
          {
            source: EXTENSION_SOURCE,
            type: 'WATCHLIST_SNAPSHOT',
            payload: watchlistSnapshot,
            timestamp: Date.now(),
          },
          '*'
        );
      } catch (err) {
        console.warn('[Stock Chart Extractor] broadcastWatchlist error:', err);
      }
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
      surveyIndicators: () => {
        const w = activeChartWidget || locateChartWidget()?.widget;
        if (!w) {
          console.warn('[Stock Chart Extractor] No chart widget found!');
          return { error: 'No chart widget found' };
        }
        const model = w.model()?.m_model;
        if (!model) {
          console.warn('[Stock Chart Extractor] No chart model found!');
          return { error: 'No chart model found' };
        }

        const protoMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(model));
        const surveyResult: Record<string, any> = {
          hasAllStudies: typeof model.allStudies === 'function',
          hasPanes: typeof model.panes === 'function',
          panesCount: typeof model.panes === 'function' ? model.panes().length : 0,
          studiesFound: [],
          rawStudiesCount: 0,
          modelStudyMethods: protoMethods.filter((m) => /study|pane|source/i.test(m)),
        };

        let rawStudies: any[] = [];
        if (typeof model.allStudies === 'function') {
          rawStudies = model.allStudies() || [];
        } else if (typeof model.panes === 'function') {
          const panes = model.panes() || [];
          panes.forEach((pane: any) => {
            const sources = typeof pane.sources === 'function' ? pane.sources() : (pane._sources || []);
            sources.forEach((src: any) => {
              if (src && (src.metaInfo || src._metaInfo || src.isPriceStudy)) {
                rawStudies.push(src);
              }
            });
          });
        }

        surveyResult.rawStudiesCount = rawStudies.length;

        surveyResult.studiesFound = rawStudies.map((s: any, idx: number) => {
          const id = typeof s.id === 'function' ? s.id() : s._id;
          const metaInfo = typeof s.metaInfo === 'function' ? s.metaInfo() : s._metaInfo;
          const name = typeof s.title === 'function' ? s.title() : (metaInfo?.description || metaInfo?.name || (typeof s.name === 'function' ? s.name() : 'Unknown'));
          const isPriceStudy = typeof s.isPriceStudy === 'function' ? s.isPriceStudy() : metaInfo?.is_price_study;
          const sProto = Object.getOwnPropertyNames(Object.getPrototypeOf(s) || {});

          // Try extract inputs
          let inputs: any = null;
          try {
            const props = typeof s.properties === 'function' ? s.properties() : s._properties;
            if (props && props.inputs) {
              inputs = typeof props.inputs.state === 'function' ? props.inputs.state() : props.inputs;
            }
          } catch (e) {
            inputs = { error: String(e) };
          }

          // Try extract styles
          let styles: any = null;
          try {
            const props = typeof s.properties === 'function' ? s.properties() : s._properties;
            if (props && props.styles) {
              styles = typeof props.styles.state === 'function' ? props.styles.state() : props.styles;
            }
          } catch (e) {
            styles = { error: String(e) };
          }

          // Check if latest values or data series are accessible
          const dataMethods = sProto.filter((m) => /data|value|last|plot/i.test(m));
          let latestValuesSample: any = null;
          try {
            if (typeof s.data === 'function') {
              const d = s.data();
              latestValuesSample = d ? { hasData: true, length: d.size?.() ?? d.length } : null;
            }
          } catch {}

          return {
            '#': idx + 1,
            id,
            name,
            shortName: metaInfo?.shortDescription || metaInfo?.shortId || name,
            isPriceStudy: Boolean(isPriceStudy),
            paneType: isPriceStudy ? 'main' : 'separate',
            inputs,
            styles: styles ? Object.keys(styles) : [],
            protoMethods: sProto.slice(0, 20),
            dataMethods,
            latestValuesSample,
          };
        });

        console.log(`[Stock Chart Extractor] === SURVEY INDICATORS RESULT (${surveyResult.rawStudiesCount} studies) ===`);
        console.table(surveyResult.studiesFound.map((s: any) => ({
          '#': s['#'],
          id: s.id,
          name: s.name,
          paneType: s.paneType,
          inputs: JSON.stringify(s.inputs || {}),
        })));
        return surveyResult;
      },
      surveyWatchlist: () => {
        const result: Record<string, any> = {
          localStorageKeys: [],
          sessionStorageKeys: [],
          matchingStorageData: {},
          windowStateCandidates: [],
          domWatchlistElements: 0,
        };

        // 1. Scan localStorage safely
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            // Ignore sensitive keys
            if (/token|auth|jwt|password|secret|credential|session/i.test(key)) continue;

            result.localStorageKeys.push(key);
            if (/watch|list|symbol|favorite|danh.?muc|quote|stock|market|portfolio|banggia|fav/i.test(key)) {
              try {
                const val = localStorage.getItem(key);
                result.matchingStorageData[key] = val ? JSON.parse(val) : null;
              } catch {
                result.matchingStorageData[key] = localStorage.getItem(key);
              }
            }
          }
        } catch (e) {
          result.storageError = String(e);
        }

        // 2. Scan sessionStorage safely
        try {
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (!key) continue;
            if (/token|auth|jwt|password|secret|credential|session/i.test(key)) continue;
            result.sessionStorageKeys.push(key);
            if (/watch|list|symbol|favorite|danh.?muc|quote|stock/i.test(key)) {
              try {
                const val = sessionStorage.getItem(key);
                result.matchingStorageData[`session:${key}`] = val ? JSON.parse(val) : null;
              } catch {
                result.matchingStorageData[`session:${key}`] = sessionStorage.getItem(key);
              }
            }
          }
        } catch {}

        // 3. Scan window for stores/state
        const win = window as any;
        const candidateProps = [
          '__PRELOADED_STATE__', '__REDUX_STATE__', '__INITIAL_STATE__',
          'store', 'appStore', 'watchlistStore', 'fireant', 'FireAnt',
          'signalR', 'connection', 'quoteService', 'symbols',
        ];
        candidateProps.forEach((prop) => {
          if (win[prop]) {
            result.windowStateCandidates.push({
              prop,
              type: typeof win[prop],
              keys: typeof win[prop] === 'object' && win[prop] ? Object.keys(win[prop]).slice(0, 10) : [],
            });
          }
        });

        // 4. Check DOM for watchlist components
        try {
          const elCount = document.querySelectorAll('[class*="watchlist"], [class*="watch-list"], [id*="watchlist"], [class*="favorite"]').length;
          result.domWatchlistElements = elCount;
        } catch {}

        console.log('[Stock Chart Extractor] === SURVEY WATCHLIST RESULT ===');
        console.log('Matching Storage Data:', result.matchingStorageData);
        console.log('Window State Candidates:', result.windowStateCandidates);
        return result;
      },
      getIndicators: () => {
        const w = activeChartWidget || locateChartWidget()?.widget;
        return extractAllIndicators(w?.model()?.m_model);
      },
      getWatchlists: () => extractWatchlists(),
      status: () => {
        const found = locateChartWidget();
        const w = activeChartWidget || found?.widget;
        const model = w?.model()?.m_model;
        return {
          connected: Boolean(w && model),
          location: found?.location || (activeChartWidget ? 'cached_widget' : 'none'),
          drawingsCount: model?.allLineTools?.()?.length ?? 0,
          studiesCount: model?.allStudies?.()?.length ?? 0,
          isTopFrame,
          url: window.location.href,
        };
      },
      syncNow: () => {
        broadcastSnapshot();
        broadcastIndicators();
        broadcastWatchlist();
      },
    };

    /**
     * Immediate Watchlist extraction for Top Frame
     * Watchlist is stored in localStorage (persist:watchlists) and does NOT depend on chartWidget!
     */
    if (isTopFrame) {
      broadcastWatchlist();
      setTimeout(broadcastWatchlist, 300);
      setTimeout(broadcastWatchlist, 1000);
      setTimeout(broadcastWatchlist, 2500);

      window.addEventListener('storage', (e) => {
        if (!e.key || /watch|symbol|persist|fireant/i.test(e.key)) {
          broadcastWatchlist();
        }
      });
    }

    /**
     * Resilient polling detector for chartWidget across window and child iframes.
     * Continues polling even after initial 30s to handle SPA page transitions.
     */
    let attempts = 0;
    let syncIntervalStarted = false;

    function startPeriodicSync() {
      if (syncIntervalStarted) return;
      syncIntervalStarted = true;
      setInterval(() => {
        broadcastSnapshot();
        broadcastIndicators();
        if (isTopFrame) broadcastWatchlist();
      }, 1000);
    }

    const timer = setInterval(() => {
      attempts++;

      const found = locateChartWidget();
      if (found) {
        activeChartWidget = found.widget;
        const model = activeChartWidget.model();
        if (model && model.m_model && typeof model.m_model.allLineTools === 'function') {
          const tools = model.m_model.allLineTools();

          clearInterval(timer);
          console.log(`[Stock Chart Extractor][Main World] ✅ SUCCESS: Connected to chart widget at [${found.location}]!`);
          logToolsInventory(tools);

          // Broadcast initial snapshots
          broadcastSnapshot();
          broadcastIndicators();
          if (isTopFrame) broadcastWatchlist();

          // Continuously sync every 1 second
          startPeriodicSync();
          return;
        }
      }

      // In top frame, broadcast watchlist on early ticks even while chart is loading
      if (isTopFrame && attempts % 4 === 0) {
        broadcastWatchlist();
      }

      // Progress log every 10 attempts (5s) in top frame
      if (isTopFrame && attempts % 10 === 0) {
        console.log(`[Stock Chart Extractor][Main World] Still locating chart widget... (${attempts * 0.5}s elapsed)`);
      }

      // After 60 attempts (30s), relax polling to every 2s rather than giving up completely
      if (attempts >= 60) {
        clearInterval(timer);
        setInterval(() => {
          if (!activeChartWidget) {
            const retryFound = locateChartWidget();
            if (retryFound?.widget?.model?.()?.m_model?.allLineTools) {
              activeChartWidget = retryFound.widget;
              console.log(`[Stock Chart Extractor][Main World] ✅ Late connection to chart widget at [${retryFound.location}]!`);
              startPeriodicSync();
            }
          }
          if (isTopFrame) broadcastWatchlist();
        }, 2000);
      }
    }, 500);

    // Listen for requests from Isolated World
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.source !== EXTENSION_SOURCE) {
        return;
      }

      if (event.data.type === 'REQUEST_SYNC' || event.data.type === 'PING') {
        if (!activeChartWidget) {
          const lateFound = locateChartWidget();
          if (lateFound?.widget?.model?.()?.m_model) {
            activeChartWidget = lateFound.widget;
          }
        }
        broadcastSnapshot();
        broadcastIndicators();
        if (isTopFrame) broadcastWatchlist();
      } else if (event.data.type === 'REQUEST_INDICATORS_SYNC') {
        broadcastIndicators();
      } else if (event.data.type === 'REQUEST_WATCHLIST_SYNC') {
        if (isTopFrame) broadcastWatchlist();
      }
    });
  },
});
