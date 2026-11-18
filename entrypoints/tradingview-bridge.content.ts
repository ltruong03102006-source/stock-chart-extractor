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
    let webpackRequire: any = null;

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

          if (chartId !== activeChartId || (lastBroadcastContextKey && compositeKey !== lastBroadcastContextKey)) {
            activeChartId = chartId;
            cachedDrawings = [];
            lastBroadcastSignature = '';
          }
          lastBroadcastContextKey = compositeKey;

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

      // Fast path: already a normalized DrawingObject
      if (tool.platformId === 'tradingview' && tool.id && Array.isArray(tool.points) && tool.style) {
        return tool as DrawingObject;
      }

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
     * Parses TradingView date badges like "Thu 17 Sep '26" or "17 Sep '26" into epoch ms
     */
    function parseTradingViewDateBadge(text: string): number | undefined {
      if (!text) return undefined;
      try {
        const months: Record<string, number> = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
        };

        const clean = text.replace(/['’]/g, '').trim();
        const parts = clean.split(/[\s,]+/);

        let day = 0;
        let month = -1;
        let year = new Date().getFullYear();

        for (const part of parts) {
          const lower = part.toLowerCase();
          if (months[lower] !== undefined) {
            month = months[lower];
          } else if (/^\d{1,2}$/.test(part)) {
            const val = parseInt(part, 10);
            if (val >= 1 && val <= 31 && day === 0) {
              day = val;
            } else if (val >= 20 && val <= 50) {
              year = 2000 + val;
            }
          } else if (/^\d{4}$/.test(part)) {
            year = parseInt(part, 10);
          }
        }

        if (month !== -1 && day > 0) {
          return Date.UTC(year, month, day, 0, 0, 0);
        }
      } catch {}
      return undefined;
    }

    /**
     * Parses numeric price like "3,161.70" into float
     */
    function parsePrice(text: string): number | null {
      if (!text) return null;
      const clean = text.replace(/,/g, '').trim();
      const num = parseFloat(clean);
      return !isNaN(num) && isFinite(num) ? num : null;
    }

    /**
     * Helper to resolve computed background color traversing up to 3 parent levels
     */
    function getEffectiveBg(el: HTMLElement): string {
      let curr: HTMLElement | null = el;
      let depth = 0;
      while (curr && depth < 3) {
        try {
          const bg = window.getComputedStyle(curr).backgroundColor;
          if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)' && !bg.includes('255, 255, 255')) {
            return bg;
          }
        } catch {}
        curr = curr.parentElement;
        depth++;
      }
      return '';
    }

    /**
     * Extracts active drawing from DOM Selection: Floating Toolbar + Highlighted Axis Badges
     */
    function extractDrawingFromDomSelection(): DrawingObject | null {
      try {
        const toolbar = document.querySelector(
          '.tv-floating-toolbar:not(.i-closed):not(.i-hidden), [class*="floating-toolbar"]:not([class*="hidden"]), [data-name="drawing-toolbar"]'
        ) || document.querySelector('.tv-floating-toolbar');

        let linewidth = 2;
        let linecolor = '#2962ff';

        if (toolbar) {
          const pxEl = Array.from(toolbar.querySelectorAll('*')).find((el) =>
            /^[1-4]px$/i.test(el.textContent?.trim() || '')
          );
          if (pxEl && pxEl.textContent) {
            linewidth = parseInt(pxEl.textContent.trim(), 10) || 2;
          }

          toolbar.querySelectorAll('*').forEach((el) => {
            const style = (el as HTMLElement).style;
            const bg = style?.backgroundColor;
            if (bg && bg !== 'transparent' && !bg.includes('rgba(0, 0, 0') && !bg.includes('rgba(255, 255, 255')) {
              linecolor = bg;
            }
          });
        }

        const highlightedPrices: { price: number; top: number; text: string }[] = [];
        const highlightedTimes: { time: number; left: number; text: string }[] = [];

        const allLeaves = document.querySelectorAll(
          '[class*="axis-"] *, [class*="badge"] *, [class*="badge"], [class*="value-"], div, span'
        );

        allLeaves.forEach((el) => {
          if (el.children.length > 0 || !el.textContent) return;
          const text = el.textContent.trim();
          if (!text || text.length > 30) return;

          const htmlEl = el as HTMLElement;
          const rect = htmlEl.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          const bg = getEffectiveBg(htmlEl);
          const isColoredBg = Boolean(bg);

          // Check if text is a Price
          if (/^[0-9]{1,3}(,[0-9]{3})*(\.[0-9]{1,4})?$/.test(text)) {
            const numPrice = parsePrice(text);
            if (numPrice !== null && numPrice > 0) {
              const isRightSide = rect.left > window.innerWidth * 0.65;
              const parentClass = htmlEl.parentElement?.className || '';
              const isAxisRelated = /axis|price|badge|value|selected|highlight/i.test(`${htmlEl.className} ${parentClass}`);

              if (isColoredBg || (isRightSide && isAxisRelated)) {
                if (!highlightedPrices.some((x) => Math.abs(x.price - numPrice) < 0.001)) {
                  highlightedPrices.push({ price: numPrice, top: rect.top, text });
                }
              }
            }
          }

          // Check if text is a Time/Date badge
          if (/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(text)) {
            const timeVal = parseTradingViewDateBadge(text);
            if (timeVal) {
              const isBottomSide = rect.top > window.innerHeight * 0.5;
              const parentClass = htmlEl.parentElement?.className || '';
              const isAxisRelated = /axis|time|timeline|badge|value|selected|highlight/i.test(`${htmlEl.className} ${parentClass}`);

              if (isColoredBg || (isBottomSide && isAxisRelated)) {
                if (!highlightedTimes.some((x) => x.time === timeVal)) {
                  highlightedTimes.push({ time: timeVal, left: rect.left, text });
                }
              }
            }
          }
        });

        if (highlightedPrices.length === 0) return null;

        // Sort by coordinates: top-to-bottom for prices, left-to-right for times
        highlightedPrices.sort((a, b) => a.top - b.top);
        highlightedTimes.sort((a, b) => a.left - b.left);

        const p0 = highlightedPrices[0];
        const p1 = highlightedPrices[1];
        const t0 = highlightedTimes[0];
        const t1 = highlightedTimes[1];

        const points: DrawingPoint[] = [];
        if (p0 && p1 && t0 && t1) {
          points.push({ price: p0.price, time: t0.time });
          points.push({ price: p1.price, time: t1.time });
        } else if (p0 && p1) {
          points.push({ price: p0.price });
          points.push({ price: p1.price });
        } else if (p0) {
          points.push({ price: p0.price, time: t0?.time });
        }

        if (points.length === 0 || !points[0]) return null;

        const pt0 = points[0];
        const pt1 = points[1];
        const id = `tv_dom_${Math.round(pt0.price * 100)}_${pt1 ? Math.round(pt1.price * 100) : 'single'}`;
        const type = points.length >= 2 ? 'trend_line' : 'horizontal_line';
        const name = type === 'trend_line' ? 'LineToolTrendLine' : 'LineToolHorzLine';

        return {
          id,
          platformId: 'tradingview',
          type,
          name,
          points,
          properties: { linecolor, linewidth },
          style: {
            linecolor,
            linewidth,
            linestyle: 0,
            fillBackground: false,
            backgroundColor: null,
            text: null,
          },
          visible: true,
          locked: false,
          updatedAt: Date.now(),
        };
      } catch {
        return null;
      }
    }

    /**
     * Safe Webpack 5 Hook with unique random string chunk ID
     */
    function tryHookWebpack(): any {
      if (webpackRequire && webpackRequire.c) return webpackRequire;
      try {
        const wnd = window as any;
        const chunkKeys = Object.keys(wnd).filter((k) => k.startsWith('webpackChunk'));
        for (const key of chunkKeys) {
          const chunk = wnd[key];
          if (Array.isArray(chunk) && typeof chunk.push === 'function') {
            const hookId = 'sce_hook_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
            try {
              chunk.push([
                [hookId],
                {},
                (req: any) => {
                  if (req && req.c && typeof req.c === 'object') {
                    webpackRequire = req;
                  }
                }
              ]);
            } catch {}
            if (webpackRequire && webpackRequire.c) break;
          }
        }
      } catch {}
      return webpackRequire;
    }

    /**
     * Webpack Module Cache Scanner
     */
    function scanWebpackModules(): DrawingObject[] {
      try {
        const req = tryHookWebpack();
        if (!req || !req.c || typeof req.c !== 'object') return [];

        const foundTools: any[] = [];
        const moduleIds = Object.keys(req.c);

        for (const id of moduleIds) {
          try {
            const mod = req.c[id];
            if (!mod || !mod.exports) continue;
            const exp = mod.exports;

            const checkExport = (target: any) => {
              if (!target || typeof target !== 'object') return;

              if (isCandidateLineTool(target)) {
                foundTools.push(target);
                return;
              }

              if (typeof target.allLineTools === 'function') {
                try {
                  const res = target.allLineTools();
                  if (Array.isArray(res) && res.length > 0) foundTools.push(...res);
                } catch {}
              }

              if (target.m_model && typeof target.m_model === 'object') {
                if (typeof target.m_model.allLineTools === 'function') {
                  try {
                    const res = target.m_model.allLineTools();
                    if (Array.isArray(res) && res.length > 0) foundTools.push(...res);
                  } catch {}
                }
                if (typeof target.m_model.panes === 'function') {
                  try {
                    const panes = target.m_model.panes();
                    if (Array.isArray(panes)) {
                      for (const p of panes) {
                        const sources = typeof p?.sources === 'function' ? p.sources() : (p?.sources || []);
                        if (Array.isArray(sources)) {
                          for (const s of sources) {
                            if (isCandidateLineTool(s)) foundTools.push(s);
                          }
                        }
                      }
                    }
                  } catch {}
                }
              }

              if (typeof target.model === 'function') {
                try {
                  const m = target.model();
                  if (m) {
                    if (typeof m.allLineTools === 'function') {
                      const res = m.allLineTools();
                      if (Array.isArray(res) && res.length > 0) foundTools.push(...res);
                    }
                    if (m.m_model && typeof m.m_model.allLineTools === 'function') {
                      const res = m.m_model.allLineTools();
                      if (Array.isArray(res) && res.length > 0) foundTools.push(...res);
                    }
                  }
                } catch {}
              }

              if (typeof target.panes === 'function') {
                try {
                  const panes = target.panes();
                  if (Array.isArray(panes)) {
                    for (const p of panes) {
                      const sources = typeof p?.sources === 'function' ? p.sources() : (p?.sources || []);
                      if (Array.isArray(sources)) {
                        for (const s of sources) {
                          if (isCandidateLineTool(s)) foundTools.push(s);
                        }
                      }
                    }
                  }
                } catch {}
              }

              if (typeof target.activeChart === 'function') {
                try {
                  const ac = target.activeChart();
                  if (ac && typeof ac.getAllShapes === 'function') {
                    const shapes = ac.getAllShapes();
                    if (Array.isArray(shapes) && shapes.length > 0) {
                      for (const sh of shapes) {
                        if (typeof ac.getShapeById === 'function') {
                          try {
                            const tool = ac.getShapeById(sh.id);
                            if (tool) foundTools.push(tool);
                            else foundTools.push(sh);
                          } catch {
                            foundTools.push(sh);
                          }
                        } else {
                          foundTools.push(sh);
                        }
                      }
                    }
                  }
                } catch {}
              }

              if (typeof target.lineToolsAndGroupsState === 'function') {
                try {
                  const st = target.lineToolsAndGroupsState();
                  if (Array.isArray(st?.lineTools) && st.lineTools.length > 0) {
                    foundTools.push(...st.lineTools);
                  }
                } catch {}
              }

              if (Array.isArray(target.lineTools) && target.lineTools.length > 0) {
                for (const t of target.lineTools) {
                  if (isCandidateLineTool(t)) foundTools.push(t);
                }
              }
              if (Array.isArray(target.sources) && target.sources.length > 0) {
                for (const s of target.sources) {
                  if (isCandidateLineTool(s)) foundTools.push(s);
                }
              }
            };

            checkExport(exp);
            if (exp.default && typeof exp.default === 'object') {
              checkExport(exp.default);
            }
          } catch {}
        }

        if (foundTools.length > 0) {
          return foundTools.map(normalizeTradingViewLineTool).filter(Boolean) as DrawingObject[];
        }
      } catch {}
      return [];
    }

    /**
     * Recursively extracts drawings from any complex object, payload, or layout tree
     */
    function extractDrawingsFromAnyObject(obj: any, visited = new Set(), depth = 0): any[] {
      if (!obj || typeof obj !== 'object' || depth > 8 || visited.has(obj)) return [];
      visited.add(obj);

      const found: any[] = [];

      try {
        if (isCandidateLineTool(obj)) {
          found.push(obj);
          return found;
        }

        if (obj.lineToolsAndGroupsState?.lineTools && Array.isArray(obj.lineToolsAndGroupsState.lineTools)) {
          for (const t of obj.lineToolsAndGroupsState.lineTools) {
            if (isCandidateLineTool(t)) found.push(t);
          }
        }

        if (Array.isArray(obj.sources)) {
          for (const s of obj.sources) {
            if (isCandidateLineTool(s)) found.push(s);
          }
        }

        if (Array.isArray(obj.lineTools)) {
          for (const t of obj.lineTools) {
            if (isCandidateLineTool(t)) found.push(t);
          }
        }

        if (Array.isArray(obj.panes)) {
          for (const p of obj.panes) {
            found.push(...extractDrawingsFromAnyObject(p, visited, depth + 1));
          }
        }

        if (Array.isArray(obj.charts)) {
          for (const c of obj.charts) {
            found.push(...extractDrawingsFromAnyObject(c, visited, depth + 1));
          }
        }

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
        if (isCandidateLineTool(obj)) {
          tools.push(obj);
          return tools;
        }

        if (typeof obj.allLineTools === 'function') {
          try {
            const res = obj.allLineTools();
            if (Array.isArray(res) && res.length > 0) return res;
          } catch {}
        }

        if (typeof obj.lineTools === 'function') {
          try {
            const res = obj.lineTools();
            if (Array.isArray(res) && res.length > 0) return res;
          } catch {}
        } else if (Array.isArray(obj.lineTools) && obj.lineTools.length > 0) {
          return obj.lineTools;
        }

        if (obj.m_model && typeof obj.m_model === 'object') {
          const sub = inspectCandidate(obj.m_model, visited, depth + 1);
          if (sub.length > 0) return sub;
        }

        if (typeof obj.model === 'function') {
          try {
            const m = obj.model();
            if (m && typeof m === 'object') {
              const sub = inspectCandidate(m, visited, depth + 1);
              if (sub.length > 0) return sub;
            }
          } catch {}
        }

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

        if (typeof obj.lineToolsAndGroupsState === 'function') {
          try {
            const st = obj.lineToolsAndGroupsState();
            if (Array.isArray(st?.lineTools)) return st.lineTools;
          } catch {}
        } else if (Array.isArray(obj.lineToolsAndGroupsState?.lineTools)) {
          return obj.lineToolsAndGroupsState.lineTools;
        }

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

            if (curr.stateNode && typeof curr.stateNode === 'object') {
              const res = inspectCandidate(curr.stateNode);
              if (res.length > 0) return res;
            }

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
     * Scans DOM elements and canvas wrappers for directly attached chart instances
     */
    function scanDomElementsForChartInstance(): any[] {
      try {
        const candidates = document.querySelectorAll(
          '.chart-gui-wrapper, .chart-container, [class*="chart-gui-wrapper"], canvas, [data-name="chart-widget"]'
        );
        for (const el of candidates) {
          const anyEl = el as any;
          const keys = Object.keys(anyEl);
          for (const k of keys) {
            if (/chart|widget|model|panes|sources/i.test(k)) {
              const val = anyEl[k];
              if (val && typeof val === 'object') {
                const tools = inspectCandidate(val);
                if (tools.length > 0) return tools;
              }
            }
          }
        }
      } catch {}
      return [];
    }

    /**
     * Full Sync Cycle across all runtime paths
     */
    function syncDrawingsFromRuntime(force = false) {
      try {
        // 1. Detect context first
        detectAndBroadcastTradingViewContext(force);

        const collected: any[] = [];

        // 2. Scan Webpack Module Cache (Commercial runtime hook)
        try {
          const webpackTools = scanWebpackModules();
          if (webpackTools.length > 0) {
            collected.push(...webpackTools);
          }
        } catch {}

        // 3. Scan React Fiber Tree (Comprehensive search covering chart container and hooks)
        try {
          const fiberTools = scanReactFiberTree();
          if (fiberTools.length > 0) {
            collected.push(...fiberTools);
          }
        } catch {}

        // 4. Scan DOM Selection (Toolbar + Axis Badges for active drawing)
        try {
          const domDrawing = extractDrawingFromDomSelection();
          if (domDrawing) {
            collected.push(domDrawing);
          }
        } catch {}

        // 5. Scan DOM Elements directly
        try {
          const domTools = scanDomElementsForChartInstance();
          if (domTools.length > 0) {
            collected.push(...domTools);
          }
        } catch {}

        // 6. Scan LocalStorage for cached layouts
        try {
          scanLocalStorage();
        } catch {}

        // 7. Merge any collected tools into cache
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
        if (cachedDrawings.length > 0) {
          broadcastDrawings(cachedDrawings, true);
        }
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
        setTimeout(() => syncDrawingsFromRuntime(), 100);
        setTimeout(() => syncDrawingsFromRuntime(), 400);
      }, true);

      window.addEventListener('click', () => {
        setTimeout(() => {
          detectAndBroadcastTradingViewContext();
          syncDrawingsFromRuntime();
        }, 120);
        setTimeout(() => {
          detectAndBroadcastTradingViewContext();
          syncDrawingsFromRuntime();
        }, 500);
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
      getWebpackRequire: () => tryHookWebpack(),
      extractDom: () => extractDrawingFromDomSelection(),
    };

    console.log('[Stock Chart Extractor][TradingView Bridge] Multi-path bridge initialized successfully.');
  },
});
