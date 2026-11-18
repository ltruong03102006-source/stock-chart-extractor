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
    let lastBroadcastSignature = '';
    let lastBroadcastContextKey = '';
    let activeChartId = '';

    /**
     * Unwraps TradingView Property values (e.g. property.value() or raw value) safely
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
     * Detects active chart context directly from TradingView runtime / DOM / URL / React Fiber
     */
    function detectAndBroadcastTradingViewContext(force = false) {
      try {
        let symbol = '';
        let exchange = 'US';
        let timeframe = 'D';
        let chartId = 'chart-0';

        // 1. URL Path & Query Parameters
        try {
          const u = new URL(window.location.href);
          const pathParts = u.pathname.split('/').filter(Boolean);
          if (pathParts[0] === 'chart' && pathParts.length >= 2 && pathParts[1]) {
            chartId = pathParts[1];
          }

          const sParam = u.searchParams.get('symbol');
          if (sParam) {
            if (sParam.includes(':')) {
              const parts = sParam.split(':');
              if (parts[0]) exchange = parts[0].trim().toUpperCase();
              if (parts[1]) symbol = parts[1].trim().toUpperCase();
            } else {
              symbol = sParam.trim().toUpperCase();
            }
          }

          const intv = u.searchParams.get('interval');
          if (intv) timeframe = intv.trim().toUpperCase();
        } catch {}

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
                while (curr && depth < 20) {
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

        // 4. Fallback: Document Title Regex
        if (!symbol && document.title) {
          try {
            const title = document.title.trim();
            const m1 = title.match(/^([A-Z0-9.\-_]{1,10})\s+([0-9]+[DWMmhd]?|[DWM])\s*[·—\-]/i);
            if (m1 && m1[1]) {
              symbol = m1[1];
              if (m1[2]) timeframe = m1[2].toUpperCase();
            } else {
              const m2 = title.match(/^([A-Z0-9.\-_]{1,10})\s+[\d,.]+(?:\s+([A-Z]{2,10}))?\s*(?:[▲▼+\-−].*?)?\s*[·—\-]/i);
              if (m2 && m2[1]) {
                symbol = m2[1];
                if (m2[2]) exchange = m2[2].toUpperCase();
              }
            }
          } catch {}
        }

        // 5. Refine Exchange from URL or Title if still default 'US'
        if (exchange === 'US') {
          try {
            const u = new URL(window.location.href);
            const sParam = u.searchParams.get('symbol');
            if (sParam && sParam.includes(':')) {
              const p = sParam.split(':');
              if (p[0]) exchange = p[0].trim().toUpperCase();
            } else if (document.title) {
              const titleMatch = document.title.match(/[\d,.]+\s+([A-Z]{2,10})\s*[·—\-]/i);
              if (titleMatch && titleMatch[1]) {
                exchange = titleMatch[1].trim().toUpperCase();
              }
            }
          } catch {}
        }

        // Normalize
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
          console.log(`[Stock Chart Extractor][TradingView Bridge] 📍 Context Broadcast: ${compositeKey} (forced: ${force})`);
          lastBroadcastContextKey = compositeKey;

          if (chartId !== activeChartId) {
            activeChartId = chartId;
            cachedDrawings = [];
            lastBroadcastSignature = '';
          }

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

        return { symbol: cleanSymbol, exchange: cleanExchange, timeframe: cleanTf, chartId, compositeKey };
      } catch {
        return null;
      }
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
        if (src.points && (Array.isArray(src.points) || typeof src.points === 'function')) {
          if (src.properties || typeof src.properties === 'function' || src.state || src.id) {
            return true;
          }
        }
        // Check if points array has price/time properties
        if (Array.isArray(src.points) && src.points.length > 0) {
          const pt = src.points[0];
          if (pt && (pt.price !== undefined || pt.time !== undefined || pt.time_t !== undefined)) {
            return true;
          }
        }
      } catch {}
      return false;
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
          try { id = String(tool.id()); } catch {}
        }
        if (!id) {
          id = String(tool.id || tool._id || tool.linkKey || `tv_${Math.random().toString(36).substr(2, 9)}`);
        }

        // 2. Resolve Name & Type
        let name = '';
        if (typeof tool.name === 'function') {
          try { name = String(tool.name()); } catch {}
        }
        if (!name) {
          name = String(tool.name || tool.type || 'LineToolTrendLine');
        }
        const type = name.replace(/^LineTool/, '').toLowerCase() || 'trend_line';

        // 3. Resolve Points (Coordinates)
        let rawPoints: any[] = [];
        if (typeof tool.points === 'function') {
          try { rawPoints = tool.points() || []; } catch {}
        } else if (Array.isArray(tool.points)) {
          rawPoints = tool.points;
        } else if (Array.isArray(tool.state?.points)) {
          rawPoints = tool.state.points;
        } else if (typeof tool.getPoint === 'function') {
          try {
            for (let i = 0; i < 6; i++) {
              const pt = tool.getPoint(i);
              if (pt) rawPoints.push(pt);
              else break;
            }
          } catch {}
        }

        const points: DrawingPoint[] = [];
        if (Array.isArray(rawPoints)) {
          for (const pt of rawPoints) {
            if (!pt || typeof pt !== 'object') continue;
            let timeMs: number | undefined;
            const timeVal = unwrapValue(pt.time_t ?? pt.time);
            if (typeof timeVal === 'number' && !isNaN(timeVal)) {
              timeMs = timeVal > 1e11 ? timeVal : timeVal * 1000;
            }

            const priceVal = unwrapValue(pt.price);
            const numPrice = Number(priceVal);

            points.push({
              price: !isNaN(numPrice) ? numPrice : 0,
              time: timeMs,
              index: typeof pt.index === 'number' ? pt.index : undefined,
            });
          }
        }

        // 4. Resolve Visual Properties & Style
        let rawState: any = {};
        if (typeof tool.properties === 'function') {
          try { rawState = tool.properties() || {}; } catch {}
        } else if (tool.properties && typeof tool.properties === 'object') {
          rawState = tool.properties;
        } else if (tool.state && typeof tool.state === 'object') {
          rawState = tool.state;
        }

        const linecolor = unwrapValue(rawState.linecolor || rawState.color || rawState.lineColor || '#2962ff');
        const linewidth = unwrapValue(rawState.linewidth || rawState.width || rawState.lineWidth || 2);
        const linestyle = unwrapValue(rawState.linestyle || rawState.lineStyle || 0);
        const fillBackground = unwrapValue(rawState.fillBackground ?? false);
        const backgroundColor = unwrapValue(rawState.backgroundColor || null);
        const text = unwrapValue(rawState.text || null);

        const style: Record<string, unknown> = {
          linecolor: typeof linecolor === 'string' ? linecolor : '#2962ff',
          linewidth: typeof linewidth === 'number' ? linewidth : (Number(linewidth) || 2),
          linestyle: typeof linestyle === 'number' ? linestyle : 0,
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
      } catch {
        return null;
      }
    }

    /**
     * Compute drawing signature for change detection
     */
    function computeDrawingsSignature(drawings: DrawingObject[]): string {
      try {
        return drawings.map((d) => {
          if (!d) return '';
          const pts = (d.points || []).map((p) => {
            const pr = typeof p?.price === 'number' ? p.price.toFixed(2) : '0.00';
            return `${pr}@${p?.index ?? p?.time ?? ''}`;
          }).join(',');
          const st = `${d.style?.linecolor ?? ''}_${d.style?.linewidth ?? ''}_${d.style?.backgroundColor ?? ''}`;
          return `${d.id}:${pts}:${st}:${d.visible}:${d.locked}`;
        }).join(';');
      } catch {
        return '';
      }
    }

    /**
     * Broadcast drawings snapshot to Isolated World Content Script
     */
    function broadcastDrawings(drawings: DrawingObject[], force = false) {
      try {
        const sig = computeDrawingsSignature(drawings);
        if (!force && sig === lastBroadcastSignature) return;

        lastBroadcastSignature = sig;
        cachedDrawings = drawings;

        const currentCtx = detectAndBroadcastTradingViewContext() || {
          symbol: 'TRADINGVIEW',
          exchange: 'US',
          timeframe: 'D',
        };

        console.log(`[Stock Chart Extractor][TradingView Bridge] 📡 Broadcasting ${drawings.length} drawing(s) for ${currentCtx.symbol}`);

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
      } catch {}
    }

    /**
     * Merges newly discovered drawings into cache without losing previously detected ones
     */
    function mergeAndBroadcastDrawings(newDrawings: DrawingObject[], force = false) {
      if (!newDrawings || newDrawings.length === 0) return;

      const drawingMap = new Map<string, DrawingObject>();

      // Preserve existing cache
      for (const d of cachedDrawings) {
        if (d && d.id) drawingMap.set(d.id, d);
      }

      // Merge newly discovered items
      for (const d of newDrawings) {
        if (d && d.id) drawingMap.set(d.id, d);
      }

      const merged = Array.from(drawingMap.values());
      broadcastDrawings(merged, force);
    }

    /**
     * Recursively extracts drawings from any complex object, payload, or layout tree
     */
    function extractDrawingsFromAnyObject(obj: any, visited = new Set(), depth = 0): any[] {
      if (!obj || typeof obj !== 'object' || depth > 8 || visited.has(obj)) return [];
      visited.add(obj);

      const found: any[] = [];

      try {
        // Direct line tool candidate
        if (isCandidateLineTool(obj)) {
          found.push(obj);
          return found;
        }

        // Check lineToolsAndGroupsState
        if (obj.lineToolsAndGroupsState?.lineTools && Array.isArray(obj.lineToolsAndGroupsState.lineTools)) {
          for (const t of obj.lineToolsAndGroupsState.lineTools) {
            if (isCandidateLineTool(t)) found.push(t);
          }
        }

        // Check sources array
        if (Array.isArray(obj.sources)) {
          for (const s of obj.sources) {
            if (isCandidateLineTool(s)) found.push(s);
          }
        }

        // Check lineTools array
        if (Array.isArray(obj.lineTools)) {
          for (const t of obj.lineTools) {
            if (isCandidateLineTool(t)) found.push(t);
          }
        }

        // Check panes
        if (Array.isArray(obj.panes)) {
          for (const p of obj.panes) {
            found.push(...extractDrawingsFromAnyObject(p, visited, depth + 1));
          }
        }

        // Check charts
        if (Array.isArray(obj.charts)) {
          for (const c of obj.charts) {
            found.push(...extractDrawingsFromAnyObject(c, visited, depth + 1));
          }
        }

        // Check nested content string (JSON or Base64)
        if (typeof obj.content === 'string') {
          try {
            const parsed = JSON.parse(obj.content);
            found.push(...extractDrawingsFromAnyObject(parsed, visited, depth + 1));
          } catch {
            try {
              const parsed = JSON.parse(atob(obj.content));
              found.push(...extractDrawingsFromAnyObject(parsed, visited, depth + 1));
            } catch {}
          }
        }

        // Check data property
        if (obj.data && typeof obj.data === 'object') {
          found.push(...extractDrawingsFromAnyObject(obj.data, visited, depth + 1));
        }
      } catch {}

      return found;
    }

    /**
     * Process parsed layout JSON payload (from LocalStorage, Fetch, etc.)
     */
    function processLayoutData(data: any) {
      if (!data || typeof data !== 'object') return;
      try {
        const rawTools = extractDrawingsFromAnyObject(data);
        if (rawTools.length > 0) {
          const normalized = rawTools.map(normalizeTradingViewLineTool).filter((d): d is DrawingObject => Boolean(d));
          if (normalized.length > 0) {
            mergeAndBroadcastDrawings(normalized);
          }
        }
      } catch {}
    }

    /**
     * LocalStorage Layout Scanner
     */
    function scanLocalStorage() {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          if (/chart|layout|linetool|drawing|storage|state/i.test(key)) {
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
     * Inspects a candidate object (such as a chart engine model, pane, or tool instance) safely
     */
    function inspectCandidate(obj: any, visited = new Set(), depth = 0): any[] {
      if (!obj || typeof obj !== 'object' || depth > 4 || visited.has(obj)) return [];
      visited.add(obj);

      const tools: any[] = [];

      try {
        // Direct line tool
        if (isCandidateLineTool(obj)) {
          tools.push(obj);
          return tools;
        }

        // 1. Check allLineTools()
        if (typeof obj.allLineTools === 'function') {
          try {
            const res = obj.allLineTools();
            if (Array.isArray(res) && res.length > 0) return res;
          } catch {}
        }

        // 2. Check lineTools()
        if (typeof obj.lineTools === 'function') {
          try {
            const res = obj.lineTools();
            if (Array.isArray(res) && res.length > 0) return res;
          } catch {}
        } else if (Array.isArray(obj.lineTools) && obj.lineTools.length > 0) {
          return obj.lineTools;
        }

        // 3. Check m_model
        if (obj.m_model && typeof obj.m_model === 'object') {
          const sub = inspectCandidate(obj.m_model, visited, depth + 1);
          if (sub.length > 0) return sub;
        }

        // 4. Check model()
        if (typeof obj.model === 'function') {
          try {
            const m = obj.model();
            if (m && typeof m === 'object') {
              const sub = inspectCandidate(m, visited, depth + 1);
              if (sub.length > 0) return sub;
            }
          } catch {}
        }

        // 5. Check panes()
        if (typeof obj.panes === 'function') {
          try {
            const panes = obj.panes();
            if (Array.isArray(panes)) {
              for (const p of panes) {
                if (!p) continue;
                if (typeof p.sources === 'function') {
                  try {
                    const s = p.sources();
                    if (Array.isArray(s)) {
                      for (const item of s) {
                        if (isCandidateLineTool(item)) tools.push(item);
                      }
                    }
                  } catch {}
                }
                if (Array.isArray(p.sources)) {
                  for (const item of p.sources) {
                    if (isCandidateLineTool(item)) tools.push(item);
                  }
                }
                if (Array.isArray(p._sources)) {
                  for (const item of p._sources) {
                    if (isCandidateLineTool(item)) tools.push(item);
                  }
                }
              }
            }
          } catch {}
        }

        // 6. Check _panes array
        if (Array.isArray(obj._panes)) {
          for (const p of obj._panes) {
            if (!p) continue;
            if (Array.isArray(p.sources)) {
              for (const item of p.sources) {
                if (isCandidateLineTool(item)) tools.push(item);
              }
            }
            if (Array.isArray(p._sources)) {
              for (const item of p._sources) {
                if (isCandidateLineTool(item)) tools.push(item);
              }
            }
          }
        }

        // 7. Check lineToolsAndGroupsState
        if (typeof obj.lineToolsAndGroupsState === 'function') {
          try {
            const st = obj.lineToolsAndGroupsState();
            if (Array.isArray(st?.lineTools)) return st.lineTools;
          } catch {}
        } else if (Array.isArray(obj.lineToolsAndGroupsState?.lineTools)) {
          return obj.lineToolsAndGroupsState.lineTools;
        }

        // 8. Check direct sources array
        if (Array.isArray(obj.sources)) {
          for (const item of obj.sources) {
            if (isCandidateLineTool(item)) tools.push(item);
          }
        }
      } catch {}

      return tools;
    }

    /**
     * Inspects React Fiber on an element safely looking for active chart model, panes, or tool instances
     */
    function scanReactFiberTree(): any[] {
      const candidates: Element[] = [];

      // Priority elements
      document.querySelectorAll(
        '.chart-gui-wrapper, .chart-container, [class*="chart-gui-wrapper"], [class*="chart-container-border"], [class*="floating-toolbar"], [data-name="drawing-toolbar"], #overlap-manager-root, .chart-page'
      ).forEach((el) => candidates.push(el));

      const foundTools: any[] = [];

      for (const el of candidates) {
        try {
          const keys = Object.keys(el);
          const fiberKey = keys.find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
          if (!fiberKey) continue;

          let curr = (el as any)[fiberKey];
          let depth = 0;
          while (curr && depth < 25) {
            depth++;

            // 1. Check class component instance (stateNode)
            if (curr.stateNode && typeof curr.stateNode === 'object') {
              const res = inspectCandidate(curr.stateNode);
              if (res.length > 0) return res;
            }

            // 2. Check function component hooks (useRef, useState)
            let hook = curr.memoizedState;
            let hookCount = 0;
            while (hook && hookCount < 20) {
              hookCount++;
              if (hook.memoizedState && typeof hook.memoizedState === 'object') {
                if (hook.memoizedState.current) {
                  const res = inspectCandidate(hook.memoizedState.current);
                  if (res.length > 0) return res;
                }
                const res = inspectCandidate(hook.memoizedState);
                if (res.length > 0) return res;
              }
              hook = hook.next;
            }

            // 3. Check memoizedProps
            if (curr.memoizedProps && typeof curr.memoizedProps === 'object') {
              const p = curr.memoizedProps;
              const propNames = ['tool', 'source', 'lineTool', 'item', 'activeTool', 'drawing', 'model', 'chart', 'chartModel', 'panes'];
              for (const name of propNames) {
                if (p[name]) {
                  const res = inspectCandidate(p[name]);
                  if (res.length > 0) return res;
                }
              }
            }

            curr = curr.return;
          }
        } catch {}
      }

      return foundTools;
    }

    /**
     * Full Sync Cycle across all runtime paths
     */
    function syncDrawingsFromRuntime(force = false) {
      try {
        // 1. Detect context first
        detectAndBroadcastTradingViewContext(force);

        const collected: any[] = [];

        // 2. Scan React Fiber Tree (Comprehensive search covering chart container, useRef hooks, and floating toolbar)
        try {
          const fiberTools = scanReactFiberTree();
          if (fiberTools.length > 0) {
            collected.push(...fiberTools);
          }
        } catch {}

        // 3. Scan LocalStorage for cached layouts
        try {
          scanLocalStorage();
        } catch {}

        // 4. Merge any collected tools into cache
        if (collected.length > 0) {
          const normalized = collected.map(normalizeTradingViewLineTool).filter((d): d is DrawingObject => Boolean(d));
          if (normalized.length > 0) {
            mergeAndBroadcastDrawings(normalized, force);
          }
        }
      } catch {}
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
    // PASSIVE NETWORK INTERCEPTION: window.fetch (Safe, Non-Destructive)
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
          if (/charts|layout|drawings/i.test(url) && !url.includes('layout.tradingview.com')) {
            response.clone().json().then((json) => {
              if (json) processLayoutData(json);
            }).catch(() => {});
          }
        } catch {}
        return response;
      };
    } catch {}

    // ====================================================
    // DOM OBSERVERS AND EVENT LISTENERS
    // ====================================================
    function initDomListeners() {
      if (!document.body) {
        document.addEventListener('DOMContentLoaded', initDomListeners);
        return;
      }

      // Safe MutationObserver on body for floating toolbar appearances (drawing selected/drawn)
      try {
        const toolbarObserver = new MutationObserver((mutations) => {
          for (const m of mutations) {
            m.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                if (el.matches?.('[class*="floating-toolbar"], [data-name="drawing-toolbar"]') ||
                    el.querySelector?.('[class*="floating-toolbar"], [data-name="drawing-toolbar"]')) {
                  setTimeout(() => syncDrawingsFromRuntime(true), 60);
                  setTimeout(() => syncDrawingsFromRuntime(true), 300);
                }
              }
            });
          }
        });
        toolbarObserver.observe(document.body, { childList: true, subtree: true });
      } catch {}

      // User interaction listeners on chart canvas (drawing finished, point dragged, etc.)
      window.addEventListener('mouseup', () => {
        setTimeout(() => syncDrawingsFromRuntime(), 120);
        setTimeout(() => syncDrawingsFromRuntime(), 500);
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

    // Periodic sync ensures that drawing edits & context switches are picked up reliably
    setInterval(() => {
      detectAndBroadcastTradingViewContext();
      syncDrawingsFromRuntime();
    }, 1500);

    // Expose global diagnosis helper for Chrome DevTools Console
    (window as any).__STOCK_CHART_EXTRACTOR_TV__ = {
      getDrawings: () => cachedDrawings,
      getContext: () => detectAndBroadcastTradingViewContext(true),
      scan: () => syncDrawingsFromRuntime(true),
      processLayout: (data: any) => processLayoutData(data),
      normalize: normalizeTradingViewLineTool,
    };

    console.log('[Stock Chart Extractor][TradingView Bridge] Multi-path bridge initialized successfully.');
  },
});
