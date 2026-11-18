/**
 * PROTOTYPE 04: TRADINGVIEW DRAWING SNAPSHOT
 * File: research/tradingview/04-drawing-snapshot.js
 *
 * Description:
 * Attempts to capture and normalize Drawing Objects from TradingView Website
 * into the standardized NormalizedDrawing format used by Stock Chart Extractor.
 *
 * Normalization Schema Target:
 * {
 *   id: string,
 *   name: string,             // e.g. "LineToolTrendLine", "LineToolHorzLine"
 *   type: string,             // e.g. "trend_line", "horizontal_line"
 *   points: [
 *     { time: number, price: number, index?: number }
 *   ],
 *   properties: {
 *     linecolor?: string,
 *     linewidth?: number,
 *     linestyle?: number,
 *     text?: string,
 *     visible?: boolean
 *   },
 *   raw: object | null
 * }
 *
 * Multi-layer Strategy:
 * Layer 1: JS Runtime Probe (window.chartWidget / React Fiber candidates)
 * Layer 2: LocalStorage layout cache inspection (LineToolsAndGroupsState)
 * Layer 3: IndexedDB offline storage check
 * Layer 4: Diagnostic reporting if encapsulated (NO mock data generated!)
 *
 * Usage:
 * Paste and run in Chrome DevTools Console at https://www.tradingview.com/chart/
 *
 * Safety: 100% read-only.
 */

(async () => {
  console.clear();
  console.log('%c[TV Drawing Snapshot] Initializing Drawing Snapshot Extractor...', 'color: #38bdf8; font-weight: bold; font-size: 14px;');

  const snapshotResult = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    extractionMethodUsed: null,
    drawingsCount: 0,
    normalizedDrawings: [],
    rawSourcesFound: [],
    storageInspection: {
      localStorageDrawingsFound: false,
      indexedDbDatabases: [],
    },
    status: 'INITIALIZING',
    limitations: [],
  };

  /**
   * Helper to normalize a generic line tool / shape object
   */
  function normalizeShape(rawShape, sourceName = 'runtime') {
    if (!rawShape) return null;

    let id = '';
    let name = '';
    let points = [];
    let properties = {};

    try {
      // Check method accessors (FireAnt / standard Charting Library pattern)
      id = typeof rawShape.id === 'function' ? rawShape.id() : (rawShape.id || rawShape._id || `gen_${Math.random().toString(36).substr(2, 9)}`);
      name = typeof rawShape.name === 'function' ? rawShape.name() : (rawShape.name || rawShape.type || 'UnknownTool');

      if (typeof rawShape.points === 'function') {
        const rawPoints = rawShape.points();
        if (Array.isArray(rawPoints)) {
          points = rawPoints.map(p => ({
            time: p.time_t || p.time || null,
            price: p.price || null,
            index: typeof p.index === 'number' ? p.index : null,
          }));
        }
      } else if (Array.isArray(rawShape.points)) {
        points = rawShape.points.map(p => ({
          time: p.time || p.time_t || null,
          price: p.price || null,
          index: p.index || null,
        }));
      }

      // Extract style / properties
      if (typeof rawShape.properties === 'function') {
        properties = rawShape.properties();
      } else if (rawShape.properties && typeof rawShape.properties === 'object') {
        properties = rawShape.properties;
      } else if (rawShape.state) {
        properties = rawShape.state;
      }

      return {
        id: String(id),
        name: String(name),
        source: sourceName,
        points,
        properties: {
          linecolor: properties?.linecolor || properties?.color || properties?.lineColor || null,
          linewidth: properties?.linewidth || properties?.width || properties?.lineWidth || null,
          linestyle: properties?.linestyle || properties?.lineStyle || null,
          visible: properties?.visible !== undefined ? properties?.visible : true,
          text: properties?.text || properties?.textString || null,
        },
        raw: rawShape,
      };
    } catch (err) {
      console.warn('[TV Drawing Snapshot] Error normalizing individual shape:', err);
      return null;
    }
  }

  // --- LAYER 1: Runtime Object Probing ---
  try {
    let rawTools = [];

    // 1A. FireAnt runtime check
    if (window.chartWidget && typeof window.chartWidget.model === 'function') {
      const model = window.chartWidget.model();
      if (model?.m_model && typeof model.m_model.allLineTools === 'function') {
        rawTools = model.m_model.allLineTools() || [];
        snapshotResult.extractionMethodUsed = 'window.chartWidget.model().m_model.allLineTools()';
      }
    }

    // 1B. Standard tvWidget check
    if (rawTools.length === 0 && window.tvWidget && typeof window.tvWidget.activeChart === 'function') {
      const chart = window.tvWidget.activeChart();
      if (chart && typeof chart.getAllShapes === 'function') {
        rawTools = chart.getAllShapes() || [];
        snapshotResult.extractionMethodUsed = 'window.tvWidget.activeChart().getAllShapes()';
      }
    }

    if (rawTools.length > 0) {
      snapshotResult.drawingsCount = rawTools.length;
      snapshotResult.normalizedDrawings = rawTools.map(t => normalizeShape(t, 'runtime')).filter(Boolean);
      snapshotResult.status = 'SUCCESS_RUNTIME';
    }
  } catch (e) {
    snapshotResult.limitations.push(`Layer 1 runtime probe error: ${e.message}`);
  }

  // --- LAYER 2: LocalStorage Layout & Cache Inspection ---
  try {
    const lsKeys = Object.keys(localStorage);
    for (const key of lsKeys) {
      if (/layout|chart|drawing|linetool/i.test(key)) {
        try {
          const rawVal = localStorage.getItem(key);
          if (!rawVal || rawVal.length < 2) continue;

          // Attempt JSON parse
          if (rawVal.startsWith('{') || rawVal.startsWith('[')) {
            const parsed = JSON.parse(rawVal);
            // Check for TradingView LineToolsAndGroupsState structure
            if (parsed.lineToolsAndGroupsState || parsed.sources || parsed.panes) {
              snapshotResult.storageInspection.localStorageDrawingsFound = true;
              snapshotResult.rawSourcesFound.push({
                storageKey: key,
                dataStructure: Object.keys(parsed),
                lineToolsCount: parsed.lineToolsAndGroupsState?.lineTools?.length || 0,
              });

              // If runtime was empty, try to normalize from parsed storage
              if (snapshotResult.drawingsCount === 0 && parsed.lineToolsAndGroupsState?.lineTools) {
                const tools = parsed.lineToolsAndGroupsState.lineTools;
                snapshotResult.normalizedDrawings = tools.map(t => normalizeShape(t, `localStorage:${key}`)).filter(Boolean);
                snapshotResult.drawingsCount = snapshotResult.normalizedDrawings.length;
                snapshotResult.extractionMethodUsed = `localStorage:${key}`;
                snapshotResult.status = 'SUCCESS_LOCAL_STORAGE';
              }
            }
          }
        } catch (parseErr) {
          // not JSON, ignore
        }
      }
    }
  } catch (e) {
    snapshotResult.limitations.push(`Layer 2 localStorage check error: ${e.message}`);
  }

  // --- LAYER 3: IndexedDB Inspection ---
  try {
    if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
      const dbs = await window.indexedDB.databases();
      snapshotResult.storageInspection.indexedDbDatabases = dbs.map(d => ({
        name: d.name,
        version: d.version,
      }));
    }
  } catch (e) {
    snapshotResult.limitations.push(`Layer 3 IndexedDB check error: ${e.message}`);
  }

  // --- LAYER 4: Final Status and Diagnostic Assessment ---
  if (snapshotResult.drawingsCount === 0) {
    snapshotResult.status = 'CAPABILITY_NOT_DIRECTLY_EXPOSED';
    snapshotResult.limitations.push(
      'TradingView Website (commercial production) encapsulates the chart model, Panes, and LineTools inside private closures within Webpack bundles.',
      'Unlike FireAnt, window.chartWidget and window.tvWidget are not registered as global variables.',
      'Drawing objects are not maintained as plain accessible DOM elements or unencrypted localStorage objects.',
      'Drawings are rendered onto HTML5 WebGL / 2D Canvas contexts directly from in-memory state and synchronized via WebSocket (wss://data.tradingview.com/socket.io/) or layout REST APIs.'
    );
  }

  // Display Output
  console.log('%c=== TRADINGVIEW DRAWING SNAPSHOT RESULT ===', 'color: #4ade80; font-weight: bold;');
  console.log('Status:', snapshotResult.status);
  console.log('Extraction Method:', snapshotResult.extractionMethodUsed || 'NONE');
  console.log('Drawings Extracted Count:', snapshotResult.drawingsCount);

  if (snapshotResult.drawingsCount > 0) {
    console.table(snapshotResult.normalizedDrawings.map(d => ({
      ID: d.id,
      Name: d.name,
      Points: d.points.length,
      Source: d.source,
      Color: d.properties.linecolor,
      Visible: d.properties.visible,
    })));
  } else {
    console.warn('%c[DIAGNOSIS REPORT] No drawing objects could be extracted via global runtime access.', 'color: #f87171; font-weight: bold;');
    console.log('Diagnostic details:', snapshotResult.limitations);
  }

  window.__TV_DRAWING_SNAPSHOT__ = snapshotResult;
  console.log('%cSnapshot stored at window.__TV_DRAWING_SNAPSHOT__', 'color: #fbbf24; font-weight: bold;');
  return snapshotResult;
})();
