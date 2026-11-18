import { EXTENSION_SOURCE } from '@/src/messaging/message.types';
import type { DrawingObject, DrawingPoint } from '@/src/messaging/message.types';

export default defineContentScript({
  matches: [
    'https://tradingview.com/*',
    'https://*.tradingview.com/*',
  ],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    console.log('[Stock Chart Extractor][TradingView Bridge] Main World Bridge initializing...');

    let cachedDrawings: DrawingObject[] = [];
    let cachedChartModel: any = null;
    let lastBroadcastSignature = '';
    let lastBroadcastContextKey = '';
    let webpackRequire: any = null;

    /**
     * Unwraps TradingView Property values (e.g. property.value() or raw value)
     */
    function unwrapValue(val: any): any {
      if (val === null || val === undefined) return val;
      if (typeof val === 'object' && typeof val.value === 'function') {
        try {
          return val.value();
        } catch {
          return val;
        }
      }
      return val;
    }

    /**
     * Detects active chart context directly from TradingView runtime / DOM / React Fiber
     */
    function detectAndBroadcastTradingViewContext(force = false) {
      try {
        let symbol = '';
        let exchange = 'US';
        let timeframe = 'D';
        let chartId = 'chart-0';

        // 1. Direct Chart Model Inspection (Most authoritative runtime data)
        if (cachedChartModel) {
          try {
            const ms = typeof cachedChartModel.mainSeries === 'function' ? cachedChartModel.mainSeries() : cachedChartModel.mainSeries;
            if (ms) {
              const rawSym = typeof ms.symbol === 'function' ? ms.symbol() : ms.symbol;
              if (rawSym && typeof rawSym === 'string') symbol = rawSym;

              const rawInt = typeof ms.interval === 'function' ? ms.interval() : ms.interval;
              if (rawInt && typeof rawInt === 'string') timeframe = rawInt;

              const si = typeof ms.symbolInfo === 'function' ? ms.symbolInfo() : ms.symbolInfo;
              if (si) {
                if (si.ticker) symbol = String(si.ticker);
                else if (si.name) symbol = String(si.name);
                if (si.exchange) exchange = String(si.exchange);
              }
            }
          } catch {}
        }

        // 2. React Fiber Inspection on Header Toolbar Symbol Search Button
        if (!symbol) {
          try {
            const btn = document.querySelector('#header-toolbar-symbol-search, [data-name="header-toolbar-symbol-search"]');
            if (btn) {
              const keys = Object.keys(btn);
              const fiberKey = keys.find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
              if (fiberKey) {
                let curr = (btn as any)[fiberKey];
                let depth = 0;
                while (curr && depth < 25) {
                  depth++;
                  const p = curr.memoizedProps;
                  if (p) {
                    if (p.symbol && typeof p.symbol === 'string') symbol = p.symbol;
                    if (p.exchange && typeof p.exchange === 'string') exchange = p.exchange;
                    if (p.interval || p.timeframe) timeframe = String(p.interval || p.timeframe);
                    if (symbol) break;
                  }
                  curr = curr.return;
                }
              }
            }
          } catch {}
        }

        // 3. Fallback: DOM Header Button Text
        if (!symbol) {
          try {
            const btn = document.querySelector('#header-toolbar-symbol-search, [data-name="header-toolbar-symbol-search"]');
            if (btn) {
              const raw = (btn.textContent || '').trim();
              if (raw) {
                const token = raw.split(/[\s·\n\r\t]+/)[0];
                if (token && token.length <= 12) {
                  if (token.includes(':')) {
                    const parts = token.split(':');
                    if (parts[0]) exchange = parts[0];
                    if (parts[1]) symbol = parts[1];
                  } else {
                    symbol = token;
                  }
                }
              }
            }
          } catch {}
        }

        // 4. Fallback: URL Search Parameters
        if (!symbol) {
          try {
            const u = new URL(window.location.href);
            const pathParts = u.pathname.split('/').filter(Boolean);
            if (pathParts[0] === 'chart' && pathParts.length >= 2 && pathParts[1]) {
              chartId = pathParts[1];
            }
            const s = u.searchParams.get('symbol');
            if (s) {
              if (s.includes(':')) {
                const parts = s.split(':');
                if (parts[0]) exchange = parts[0];
                if (parts[1]) symbol = parts[1];
              } else {
                symbol = s;
              }
            }
            const intv = u.searchParams.get('interval');
            if (intv) timeframe = intv;
          } catch {}
        }

        // Clean & Normalize
        if (symbol.includes(':')) {
          const parts = symbol.split(':');
          if (parts[0]) exchange = parts[0];
          if (parts[1]) symbol = parts[1];
        }

        const cleanSymbol = symbol.trim().toUpperCase().replace(/[^A-Z0-9.\-_]/g, '');
        const cleanExchange = (exchange || 'US').trim().toUpperCase();
        const cleanTf = (timeframe || 'D').trim().toUpperCase();

        if (!cleanSymbol || cleanSymbol === 'UNKNOWN' || cleanSymbol === 'BI' || cleanSymbol.length < 1) {
          return null;
        }

        const compositeKey = `${cleanSymbol}_${cleanExchange}_${cleanTf}`;

        if (force || compositeKey !== lastBroadcastContextKey) {
          lastBroadcastContextKey = compositeKey;
          console.log(`[Stock Chart Extractor][TradingView Bridge] 📍 Context Broadcast: ${compositeKey} (forced: ${force})`);

          window.postMessage({
            source: EXTENSION_SOURCE,
            type: 'CHART_CONTEXT_CHANGED',
            payload: {
              symbol: cleanSymbol,
              exchange: cleanExchange,
              timeframe: cleanTf,
              chartId,
              compositeKey,
              platform: 'tradingview',
            },
            timestamp: Date.now(),
          }, '*');
        }

        return { symbol: cleanSymbol, exchange: cleanExchange, timeframe: cleanTf, compositeKey };
      } catch (err) {
        console.warn('[Stock Chart Extractor][TradingView Bridge] Context detection warning:', err);
        return null;
      }
    }

    /**
     * Safely normalizes raw TradingView serialized line tool into DrawingObject format
     */
    function normalizeTradingViewLineTool(tool: any): DrawingObject | null {
      if (!tool || typeof tool !== 'object') return null;

      try {
        // 1. Resolve Identifier
        let id = '';
        if (typeof tool.id === 'function') {
          id = String(tool.id());
        } else {
          id = String(tool.id || tool._id || `tv_${Math.random().toString(36).substr(2, 9)}`);
        }

        // 2. Resolve Name & Type
        let name = '';
        if (typeof tool.name === 'function') {
          name = String(tool.name());
        } else {
          name = String(tool.name || tool.type || 'LineToolUnknown');
        }
        const type = name.replace(/^LineTool/, '').toLowerCase();

        // 3. Resolve Points (Coordinates)
        let rawPoints: any[] = [];
        if (typeof tool.points === 'function') {
          rawPoints = tool.points() || [];
        } else if (Array.isArray(tool.points)) {
          rawPoints = tool.points;
        } else if (Array.isArray(tool.state?.points)) {
          rawPoints = tool.state.points;
        } else if (typeof tool.getPoint === 'function') {
          for (let i = 0; i < 10; i++) {
            const pt = tool.getPoint(i);
            if (pt) rawPoints.push(pt);
            else break;
          }
        }

        const points: DrawingPoint[] = [];
        if (Array.isArray(rawPoints)) {
          for (const pt of rawPoints) {
            if (!pt || typeof pt !== 'object') continue;
            let timeMs: number | undefined;
            const timeVal = unwrapValue(pt.time_t ?? pt.time);
            if (typeof timeVal === 'number') {
              timeMs = timeVal > 1e11 ? timeVal : timeVal * 1000;
            }

            const priceVal = unwrapValue(pt.price);
            const indexVal = unwrapValue(pt.index);

            points.push({
              price: typeof priceVal === 'number' ? priceVal : (Number(priceVal) || 0),
              time: timeMs,
              index: typeof indexVal === 'number' ? indexVal : undefined,
            });
          }
        }

        // 4. Resolve Visual Properties & Style
        let rawState: any = {};
        if (typeof tool.properties === 'function') {
          rawState = tool.properties() || {};
        } else if (tool.properties && typeof tool.properties === 'object') {
          rawState = tool.properties;
        } else if (tool.state && typeof tool.state === 'object') {
          rawState = tool.state;
        }

        const linecolor = unwrapValue(rawState.linecolor || rawState.color || rawState.lineColor || null);
        const linewidth = unwrapValue(rawState.linewidth || rawState.width || rawState.lineWidth || null);
        const linestyle = unwrapValue(rawState.linestyle || rawState.lineStyle || null);
        const transparency = unwrapValue(rawState.transparency ?? null);
        const fillBackground = unwrapValue(rawState.fillBackground ?? false);
        const backgroundColor = unwrapValue(rawState.backgroundColor || null);
        const text = unwrapValue(rawState.text || null);

        const style: Record<string, unknown> = {
          linecolor: typeof linecolor === 'string' ? linecolor : null,
          linewidth: typeof linewidth === 'number' ? linewidth : (Number(linewidth) || null),
          linestyle: typeof linestyle === 'number' ? linestyle : null,
          transparency: typeof transparency === 'number' ? transparency : null,
          fillBackground: Boolean(fillBackground),
          backgroundColor: typeof backgroundColor === 'string' ? backgroundColor : null,
          text: typeof text === 'string' ? text : null,
        };

        const visibleVal = unwrapValue(rawState.visible);
        const visible = visibleVal !== undefined ? Boolean(visibleVal) : true;
        const frozenVal = unwrapValue(rawState.frozen ?? rawState.locked);
        const locked = frozenVal !== undefined ? Boolean(frozenVal) : false;

        return {
          id,
          platformId: 'tradingview',
          type,
          name,
          points,
          properties: rawState,
          style,
          visible,
          locked,
          updatedAt: Date.now(),
        };
      } catch (err) {
        console.warn('[Stock Chart Extractor][TradingView Bridge] Normalization error:', err);
        return null;
      }
    }

    /**
     * Compute drawing signature for change detection
     */
    function computeDrawingsSignature(drawings: DrawingObject[]): string {
      return drawings.map((d) => {
        const pts = (d.points || []).map((p) => `${Number(p.price).toFixed(2)}@${p.index ?? p.time ?? ''}`).join(',');
        const st = `${d.style.linecolor ?? ''}_${d.style.linewidth ?? ''}_${d.style.backgroundColor ?? ''}`;
        return `${d.id}:${pts}:${st}:${d.visible}:${d.locked}`;
      }).join(';');
    }

    /**
     * Broadcast drawings snapshot to Isolated World Content Script
     */
    function broadcastDrawings(drawings: DrawingObject[], force = false) {
      const sig = computeDrawingsSignature(drawings);
      if (!force && sig === lastBroadcastSignature) return;

      lastBroadcastSignature = sig;
      cachedDrawings = drawings;

      const currentCtx = detectAndBroadcastTradingViewContext() || {
        symbol: 'TRADINGVIEW',
        exchange: 'US',
        timeframe: 'D',
      };

      console.log(`[Stock Chart Extractor][TradingView Bridge] Broadcasting ${drawings.length} drawing(s) for ${currentCtx.symbol}`);

      window.postMessage({
        source: EXTENSION_SOURCE,
        type: 'DRAWINGS_SNAPSHOT',
        payload: {
          schemaVersion: '1.0',
          platform: 'tradingview',
          chart: {
            symbol: currentCtx.symbol,
            exchange: currentCtx.exchange,
            timeframe: currentCtx.timeframe,
            totalDrawings: drawings.length,
          },
          drawings,
          sync: {
            status: 'synced',
            lastUpdated: Date.now(),
            totalDrawings: drawings.length,
          },
        },
        timestamp: Date.now(),
      }, '*');
    }

    /**
     * Checks if a candidate object qualifies as a LineTool / Drawing
     */
    function isCandidateLineTool(src: any): boolean {
      if (!src || typeof src !== 'object') return false;
      try {
        const name = typeof src.name === 'function' ? src.name() : (src.name || src.type || '');
        if (typeof name === 'string' && (name.startsWith('LineTool') || name.startsWith('linetool') || name.includes('LineTool'))) {
          return true;
        }
        if (typeof src.isLineTool === 'function' && src.isLineTool()) {
          return true;
        }
        if (typeof src.points === 'function' || Array.isArray(src.points) || src.timeAxisPoints || src.priceAxisPoints) {
          if (src.properties || typeof src.properties === 'function' || src.state) {
            return true;
          }
        }
      } catch {}
      return false;
    }

    /**
     * Extracts drawings from a verified ChartModel instance
     */
    function extractDrawingsFromModel(model: any): DrawingObject[] {
      if (!model) return [];
      const rawTools: any[] = [];

      try {
        // 1. Direct allLineTools()
        if (typeof model.allLineTools === 'function') {
          const res = model.allLineTools();
          if (Array.isArray(res) && res.length > 0) rawTools.push(...res);
        }
      } catch {}

      try {
        // 2. Direct lineTools()
        if (rawTools.length === 0 && typeof model.lineTools === 'function') {
          const res = model.lineTools();
          if (Array.isArray(res) && res.length > 0) rawTools.push(...res);
        }
      } catch {}

      try {
        // 3. Panes sources
        if (rawTools.length === 0 && typeof model.panes === 'function') {
          const panes = model.panes() || [];
          for (const p of panes) {
            if (!p) continue;
            const sources = typeof p.sources === 'function' ? p.sources() : (Array.isArray(p.sources) ? p.sources : []);
            for (const s of sources) {
              if (isCandidateLineTool(s)) rawTools.push(s);
            }
            const ordered = typeof p.orderedSources === 'function' ? p.orderedSources() : [];
            for (const s of ordered) {
              if (isCandidateLineTool(s) && !rawTools.includes(s)) rawTools.push(s);
            }
          }
        }
      } catch {}

      try {
        // 4. m_model nested (FireAnt / Charting Library pattern)
        if (rawTools.length === 0 && model.m_model) {
          return extractDrawingsFromModel(model.m_model);
        }
      } catch {}

      try {
        // 5. lineToolsAndGroupsState
        if (rawTools.length === 0 && typeof model.lineToolsAndGroupsState === 'function') {
          const state = model.lineToolsAndGroupsState();
          if (Array.isArray(state?.lineTools)) rawTools.push(...state.lineTools);
        }
      } catch {}

      return rawTools.map(normalizeTradingViewLineTool).filter((d): d is DrawingObject => Boolean(d));
    }

    /**
     * Inspects an object to find ChartModel or LineTool instances
     */
    function findModelOrToolsFromObject(obj: any, visited = new Set(), depth = 0): { model: any | null; tools: any[] } {
      const result = { model: null as any, tools: [] as any[] };
      if (!obj || typeof obj !== 'object' || depth > 5 || visited.has(obj)) return result;
      visited.add(obj);

      try {
        // Check if obj itself is a ChartModel
        if (typeof obj.allLineTools === 'function' || typeof obj.panes === 'function') {
          result.model = obj;
          return result;
        }

        if (typeof obj.model === 'function') {
          const m = obj.model();
          if (m && (typeof m.allLineTools === 'function' || typeof m.panes === 'function' || m.m_model)) {
            result.model = m.m_model || m;
            return result;
          }
        }

        if (obj.m_model && (typeof obj.m_model.allLineTools === 'function' || typeof obj.m_model.panes === 'function')) {
          result.model = obj.m_model;
          return result;
        }

        if (obj.chartModel && (typeof obj.chartModel.allLineTools === 'function' || typeof obj.chartModel.panes === 'function')) {
          result.model = obj.chartModel;
          return result;
        }

        // Check if obj is a LineTool
        if (isCandidateLineTool(obj)) {
          result.tools.push(obj);
          if (typeof obj.model === 'function') {
            const m = obj.model();
            if (m) {
              result.model = m.m_model || m;
              return result;
            }
          }
        }

        // Check relevant properties
        const candidateKeys = [
          'chartWidget', 'chartModel', 'model', 'activeChart', 'chart', '_chart',
          'source', 'sources', 'lineTool', 'lineTools', 'activeTool', 'tool',
          'pane', 'panes', 'lineToolsModel'
        ];

        for (const k of candidateKeys) {
          if (obj[k]) {
            if (Array.isArray(obj[k])) {
              for (const item of obj[k]) {
                const sub = findModelOrToolsFromObject(item, visited, depth + 1);
                if (sub.model) {
                  result.model = sub.model;
                  return result;
                }
                if (sub.tools.length > 0) result.tools.push(...sub.tools);
              }
            } else {
              const sub = findModelOrToolsFromObject(obj[k], visited, depth + 1);
              if (sub.model) {
                result.model = sub.model;
                return result;
              }
              if (sub.tools.length > 0) result.tools.push(...sub.tools);
            }
          }
        }
      } catch {}

      return result;
    }

    /**
     * Scans React Fiber tree from candidate DOM elements
     */
    function scanReactFiber(): DrawingObject[] {
      const candidates: Element[] = [];

      // 1. Chart containers and canvas wrappers
      document.querySelectorAll(
        '.chart-gui-wrapper, .chart-container, [class*="chart-gui-wrapper"], [class*="chart-container-border"], canvas'
      ).forEach((el) => candidates.push(el));

      // 2. Floating toolbars and overlap manager root (portal container)
      document.querySelectorAll(
        '#overlap-manager-root, [class*="floating-toolbar"], [data-name="drawing-toolbar"], div[class*="toolbar-"]'
      ).forEach((el) => candidates.push(el));

      const foundTools: any[] = [];

      for (const el of candidates) {
        try {
          const keys = Object.keys(el);
          const fiberKey = keys.find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
          if (!fiberKey) continue;

          let curr = (el as any)[fiberKey];
          let depth = 0;
          while (curr && depth < 35) {
            depth++;

            // Check stateNode
            if (curr.stateNode) {
              const res = findModelOrToolsFromObject(curr.stateNode);
              if (res.model) {
                cachedChartModel = res.model;
                const drawings = extractDrawingsFromModel(res.model);
                if (drawings.length > 0) return drawings;
              }
              if (res.tools.length > 0) foundTools.push(...res.tools);
            }

            // Check memoizedProps
            if (curr.memoizedProps) {
              const res = findModelOrToolsFromObject(curr.memoizedProps);
              if (res.model) {
                cachedChartModel = res.model;
                const drawings = extractDrawingsFromModel(res.model);
                if (drawings.length > 0) return drawings;
              }
              if (res.tools.length > 0) foundTools.push(...res.tools);
            }

            // Check memoizedState
            if (curr.memoizedState) {
              const res = findModelOrToolsFromObject(curr.memoizedState);
              if (res.model) {
                cachedChartModel = res.model;
                const drawings = extractDrawingsFromModel(res.model);
                if (drawings.length > 0) return drawings;
              }
              if (res.tools.length > 0) foundTools.push(...res.tools);
            }

            curr = curr.return;
          }
        } catch {}
      }

      if (foundTools.length > 0) {
        return foundTools.map(normalizeTradingViewLineTool).filter((d): d is DrawingObject => Boolean(d));
      }

      return [];
    }

    /**
     * Webpack Module Cache Inspection
     */
    function tryHookWebpack(): any {
      if (webpackRequire) return webpackRequire;
      try {
        const wnd = window as any;
        if (Array.isArray(wnd.webpackChunktradingview) && typeof wnd.webpackChunktradingview.push === 'function') {
          wnd.webpackChunktradingview.push([
            [Symbol('sce_probe')],
            {},
            (req: any) => { webpackRequire = req; }
          ]);
        }
      } catch {}
      return webpackRequire;
    }

    function scanWebpackModules(): DrawingObject[] {
      try {
        const req = tryHookWebpack();
        if (req && req.c && typeof req.c === 'object') {
          for (const id in req.c) {
            const mod = req.c[id];
            if (!mod || !mod.exports) continue;
            const exp = mod.exports;
            const res = findModelOrToolsFromObject(exp);
            if (res.model) {
              cachedChartModel = res.model;
              const drawings = extractDrawingsFromModel(res.model);
              if (drawings.length > 0) return drawings;
            }
          }
        }
      } catch {}
      return [];
    }

    /**
     * Process parsed layout JSON payload (from LocalStorage, Fetch, or WebSocket)
     */
    function processLayoutData(data: any) {
      if (!data || typeof data !== 'object') return;

      let target = data;
      // Unwrap content string if present
      if (data.content && typeof data.content === 'string') {
        try {
          target = JSON.parse(data.content);
        } catch {
          try {
            target = JSON.parse(atob(data.content));
          } catch {}
        }
      }

      const collectedTools: any[] = [];

      // Check LineToolsAndGroupsState
      if (target.lineToolsAndGroupsState?.lineTools && Array.isArray(target.lineToolsAndGroupsState.lineTools)) {
        collectedTools.push(...target.lineToolsAndGroupsState.lineTools);
      }

      // Check panes and sources
      if (Array.isArray(target.panes)) {
        for (const pane of target.panes) {
          if (Array.isArray(pane?.sources)) {
            for (const src of pane.sources) {
              if (src?.type === 'LineTool' || (src?.name && String(src.name).startsWith('LineTool'))) {
                collectedTools.push(src);
              }
            }
          }
        }
      }

      // Check direct sources
      if (Array.isArray(target.sources)) {
        for (const src of target.sources) {
          if (src?.type === 'LineTool' || (src?.name && String(src.name).startsWith('LineTool'))) {
            collectedTools.push(src);
          }
        }
      }

      // Check charts in multi-chart layout
      if (Array.isArray(target.charts)) {
        for (const chart of target.charts) {
          if (Array.isArray(chart?.panes)) {
            for (const pane of chart.panes) {
              if (Array.isArray(pane?.sources)) {
                for (const src of pane.sources) {
                  if (src?.type === 'LineTool' || (src?.name && String(src.name).startsWith('LineTool'))) {
                    collectedTools.push(src);
                  }
                }
              }
            }
          }
        }
      }

      if (collectedTools.length > 0) {
        const normalized = collectedTools.map(normalizeTradingViewLineTool).filter((d): d is DrawingObject => Boolean(d));
        if (normalized.length > 0) {
          broadcastDrawings(normalized);
        }
      }
    }

    /**
     * LocalStorage Layout Scanner
     */
    function scanLocalStorage() {
      try {
        const keys = Object.keys(localStorage);
        for (const key of keys) {
          if (/chart|layout|linetool|drawing/i.test(key)) {
            const val = localStorage.getItem(key);
            if (val && (val.startsWith('{') || val.startsWith('['))) {
              try {
                const parsed = JSON.parse(val);
                processLayoutData(parsed);
              } catch {}
            }
          }
        }
      } catch {}
    }

    /**
     * Full Sync Cycle across all runtime paths
     */
    function syncDrawingsFromRuntime(force = false) {
      try {
        // Detect context first so drawings are attributed to the correct symbol
        detectAndBroadcastTradingViewContext(force);

        // 1. If we already hold a verified chart model, read from it
        if (cachedChartModel) {
          const drawings = extractDrawingsFromModel(cachedChartModel);
          if (drawings.length > 0) {
            broadcastDrawings(drawings, force);
            return;
          }
        }

        // 2. React Fiber Scan
        const fiberDrawings = scanReactFiber();
        if (fiberDrawings.length > 0) {
          broadcastDrawings(fiberDrawings, force);
          return;
        }

        // 3. Webpack Modules Scan
        const webpackDrawings = scanWebpackModules();
        if (webpackDrawings.length > 0) {
          broadcastDrawings(webpackDrawings, force);
          return;
        }

        // 4. LocalStorage Scan
        scanLocalStorage();
      } catch (err) {
        console.warn('[Stock Chart Extractor][TradingView Bridge] Sync error:', err);
      }
    }

    // ====================================================
    // MESSAGE LISTENER - REGISTER FIRST (BEFORE ANY DOM CALLS)
    // ====================================================
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.source !== EXTENSION_SOURCE) {
        return;
      }

      if (event.data.type === 'REQUEST_SYNC' || event.data.type === 'REFRESH_TRADINGVIEW_DRAWINGS') {
        detectAndBroadcastTradingViewContext(true);
        syncDrawingsFromRuntime(true);
      }
    });

    // ====================================================
    // PASSIVE NETWORK INTERCEPTION: window.fetch & window.WebSocket
    // ====================================================
    try {
      const originalFetch = window.fetch;
      window.fetch = async function (...args) {
        try {
          if (args[1]?.body && typeof args[1].body === 'string') {
            const bodyStr = args[1].body;
            if (bodyStr.includes('LineTool') || bodyStr.includes('lineTools') || bodyStr.includes('sources')) {
              try {
                processLayoutData(JSON.parse(bodyStr));
              } catch {}
            }
          }
        } catch {}

        const response = await originalFetch.apply(this, args);
        try {
          const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
          if (/layout\.tradingview\.com|\/v1\/charts\/|charts-storage|api\/v1\/charts/i.test(url)) {
            response.clone().json().then((json) => {
              if (json) processLayoutData(json);
            }).catch(() => {});
          }
        } catch {}
        return response;
      };
    } catch {}

    try {
      const OriginalWebSocket = window.WebSocket;
      window.WebSocket = function (...args: any[]) {
        const ws = new (OriginalWebSocket as any)(...args);
        try {
          const parseWs = (dataStr: string) => {
            const jsonMatch = dataStr.match(/(\{.*\}|\[.*\])/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (Array.isArray(parsed)) {
                parsed.forEach((item) => { if (item && typeof item === 'object') processLayoutData(item); });
              } else {
                processLayoutData(parsed);
              }
            }
          };

          const origSend = ws.send;
          ws.send = function (data: any) {
            try {
              if (typeof data === 'string' && (data.includes('LineTool') || data.includes('linetool') || data.includes('lineTools'))) {
                parseWs(data);
              }
            } catch {}
            return origSend.apply(this, arguments as any);
          };

          ws.addEventListener('message', (event: MessageEvent) => {
            try {
              if (typeof event.data === 'string' && (event.data.includes('LineTool') || event.data.includes('linetool') || event.data.includes('lineTools'))) {
                parseWs(event.data);
              }
            } catch {}
          });
        } catch {}
        return ws;
      } as any;
      window.WebSocket.prototype = OriginalWebSocket.prototype;
    } catch {}

    // ====================================================
    // DOM OBSERVERS AND EVENT LISTENERS (SAFELY INITIALIZED)
    // ====================================================
    function initDomListeners() {
      if (!document.body) {
        document.addEventListener('DOMContentLoaded', initDomListeners);
        return;
      }

      // Safe MutationObserver on body for floating toolbar appearances
      try {
        const toolbarObserver = new MutationObserver((mutations) => {
          for (const m of mutations) {
            m.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                if (el.matches?.('[class*="floating-toolbar"], [data-name="drawing-toolbar"]') ||
                    el.querySelector?.('[class*="floating-toolbar"], [data-name="drawing-toolbar"]')) {
                  setTimeout(() => syncDrawingsFromRuntime(), 50);
                }
              }
            });
          }
        });
        toolbarObserver.observe(document.body, { childList: true, subtree: true });
      } catch (err) {
        console.warn('[Stock Chart Extractor][TradingView Bridge] MutationObserver setup warning:', err);
      }

      // User interaction listeners on chart canvas (drawing finished, point dragged, etc.)
      window.addEventListener('mouseup', () => {
        setTimeout(() => syncDrawingsFromRuntime(), 100);
        setTimeout(() => syncDrawingsFromRuntime(), 400);
      }, true);

      window.addEventListener('click', () => {
        setTimeout(() => {
          detectAndBroadcastTradingViewContext();
          syncDrawingsFromRuntime();
        }, 150);
        setTimeout(() => {
          detectAndBroadcastTradingViewContext();
          syncDrawingsFromRuntime();
        }, 600);
      }, true);
    }

    initDomListeners();

    // ====================================================
    // TIMED INITIALIZATION & PERIODIC SYNC LOOP
    // ====================================================
    setTimeout(() => {
      detectAndBroadcastTradingViewContext(true);
      syncDrawingsFromRuntime(true);
    }, 600);
    setTimeout(() => {
      detectAndBroadcastTradingViewContext();
      syncDrawingsFromRuntime();
    }, 1800);
    setTimeout(() => {
      detectAndBroadcastTradingViewContext();
      syncDrawingsFromRuntime();
    }, 4500);

    // Periodic sync ensures that drawing edits & context switches are picked up reliably within 1.2s
    setInterval(() => {
      detectAndBroadcastTradingViewContext();
      syncDrawingsFromRuntime();
    }, 1200);

    // Expose global diagnosis helper for Chrome DevTools Console
    (window as any).__STOCK_CHART_EXTRACTOR_TV__ = {
      getModel: () => cachedChartModel,
      getDrawings: () => cachedDrawings,
      getContext: () => detectAndBroadcastTradingViewContext(true),
      scan: () => syncDrawingsFromRuntime(true),
      getWebpackRequire: () => webpackRequire,
      normalize: normalizeTradingViewLineTool,
    };

    console.log('[Stock Chart Extractor][TradingView Bridge] Multi-path bridge initialized successfully.');
  },
});
