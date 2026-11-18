/**
 * PROTOTYPE 05: TRADINGVIEW CHART CONTEXT PROBE
 * File: research/tradingview/05-chart-context-probe.js
 *
 * Description:
 * Probes and extracts the active chart context from TradingView Website:
 * - Symbol (e.g. AAPL)
 * - Exchange (e.g. NASDAQ)
 * - Timeframe / Resolution (e.g. 1D, 1h, 15m)
 * - Layout ID / Chart ID (e.g. layout URL hash or path segment)
 *
 * Employs a multi-layer cascade:
 * Layer 1: URL structure analysis (pathname, searchParams, hash)
 * Layer 2: DOM inspection (document.title, header toolbar buttons, legend series item)
 * Layer 3: React Fiber state inspection on top toolbar / chart header
 * Layer 4: Multi-chart layout verification (detecting active chart in split view)
 *
 * Usage:
 * Paste and run in Chrome DevTools Console at https://www.tradingview.com/chart/
 *
 * Safety: 100% read-only.
 */

(() => {
  console.clear();
  console.log('%c[TV Chart Context Probe] Probing Chart Context (Symbol, Exchange, Timeframe, Layout ID)...', 'color: #38bdf8; font-weight: bold; font-size: 14px;');

  const contextReport = {
    timestamp: new Date().toISOString(),
    layers: {
      urlLayer: {},
      domLayer: {},
      fiberLayer: {},
    },
    resolvedContext: {
      symbol: null,
      exchange: null,
      fullSymbol: null,
      timeframe: null,
      layoutId: null,
      confidence: 'NONE', // 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
      primarySource: null,
    },
    multiChartLayout: {
      isSplitLayout: false,
      visibleChartPanes: 1,
    },
  };

  // ==========================================
  // LAYER 1: URL ANALYSIS
  // ==========================================
  try {
    const url = new URL(window.location.href);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // e.g. /chart/ or /chart/6kM7ZkUv/
    let layoutId = null;
    if (pathParts[0] === 'chart' && pathParts.length >= 2) {
      layoutId = pathParts[1];
    }

    const symbolParam = url.searchParams.get('symbol'); // e.g. "NASDAQ:AAPL" or "AAPL"
    const intervalParam = url.searchParams.get('interval'); // e.g. "D", "60", "240"

    let parsedSym = null;
    let parsedEx = null;
    if (symbolParam) {
      if (symbolParam.includes(':')) {
        const [ex, sym] = symbolParam.split(':');
        parsedEx = ex.toUpperCase();
        parsedSym = sym.toUpperCase();
      } else {
        parsedSym = symbolParam.toUpperCase();
      }
    }

    contextReport.layers.urlLayer = {
      layoutId,
      symbolParam,
      intervalParam,
      parsedSymbol: parsedSym,
      parsedExchange: parsedEx,
    };
  } catch (e) {
    contextReport.layers.urlLayer.error = e.message;
  }

  // ==========================================
  // LAYER 2: DOM INSPECTION
  // ==========================================
  try {
    const domData = {
      title: document.title,
      symbolButtonText: null,
      intervalButtonText: null,
      legendSymbol: null,
      legendExchange: null,
    };

    // 2A. Header Toolbar Symbol Button
    const symbolBtn = document.querySelector(
      '#header-toolbar-symbol-search, [data-name="header-toolbar-symbol-search"], button[class*="symbolSearch-"]'
    );
    if (symbolBtn) {
      domData.symbolButtonText = symbolBtn.textContent?.trim() || null;
    }

    // 2B. Header Toolbar Interval / Timeframe Button
    const intervalBtn = document.querySelector(
      '[data-name="timeframe-custom-intervals"], [data-name="header-toolbar-intervals"], button[class*="selected-"][class*="button-"]'
    );
    if (intervalBtn) {
      domData.intervalButtonText = intervalBtn.textContent?.trim() || null;
    } else {
      // Look for active/selected item in the resolution bar
      const activeRes = document.querySelector('div[class*="intervals-"] button[class*="isActive-"], div[class*="toolbar-"] button[aria-checked="true"]');
      if (activeRes) {
        domData.intervalButtonText = activeRes.textContent?.trim() || null;
      }
    }

    // 2C. Legend Series Item (Main Series on Chart Canvas)
    const legendTitle = document.querySelector('[data-name="legend-series-item"], [class*="legend-"] [class*="title-"]');
    if (legendTitle) {
      domData.legendSymbol = legendTitle.textContent?.trim() || null;
    }

    // 2D. Parse Document Title (e.g. "AAPL 1D · TradingView" or "Apple Inc (NASDAQ:AAPL)")
    if (domData.title) {
      const titleMatch = domData.title.match(/([A-Z0-9]+)\s+([0-9]+[DWMmhd]?|[DWM])\s*·/i) || domData.title.match(/\((?:([A-Z]+):)?([A-Z0-9]+)\)/i);
      if (titleMatch) {
        domData.titleParsedSymbol = titleMatch[1] || titleMatch[2];
      }
    }

    contextReport.layers.domLayer = domData;
  } catch (e) {
    contextReport.layers.domLayer.error = e.message;
  }

  // ==========================================
  // LAYER 3: MULTI-CHART SPLIT DETECTION
  // ==========================================
  try {
    const chartPanes = document.querySelectorAll('[class*="chart-container"], [data-name="chart-widget"]');
    contextReport.multiChartLayout.visibleChartPanes = chartPanes.length;
    contextReport.multiChartLayout.isSplitLayout = chartPanes.length > 1;
  } catch (e) {
    contextReport.multiChartLayout.error = e.message;
  }

  // ==========================================
  // RESOLUTION & SYNTHESIS CASCADE
  // ==========================================
  let resolvedSymbol = null;
  let resolvedExchange = null;
  let resolvedTimeframe = null;
  let resolvedLayoutId = contextReport.layers.urlLayer?.layoutId || null;
  let primarySource = null;
  let confidence = 'NONE';

  // Priority 1: DOM Header Toolbar Button (Direct User UI representation)
  if (contextReport.layers.domLayer?.symbolButtonText) {
    const rawSym = contextReport.layers.domLayer.symbolButtonText;
    if (rawSym.includes(':')) {
      const [ex, sym] = rawSym.split(':');
      resolvedExchange = ex.trim().toUpperCase();
      resolvedSymbol = sym.trim().toUpperCase();
    } else {
      resolvedSymbol = rawSym.trim().toUpperCase();
    }
    primarySource = 'DOM_HEADER_TOOLBAR';
    confidence = 'HIGH';
  }

  // Priority 2: Legend Title
  if (!resolvedSymbol && contextReport.layers.domLayer?.legendSymbol) {
    resolvedSymbol = contextReport.layers.domLayer.legendSymbol;
    primarySource = 'DOM_LEGEND_SERIES';
    confidence = 'HIGH';
  }

  // Priority 3: URL Parameters
  if (!resolvedSymbol && contextReport.layers.urlLayer?.parsedSymbol) {
    resolvedSymbol = contextReport.layers.urlLayer.parsedSymbol;
    resolvedExchange = contextReport.layers.urlLayer.parsedExchange || resolvedExchange;
    primarySource = 'URL_SEARCH_PARAMS';
    confidence = 'MEDIUM';
  }

  // Resolve Timeframe
  if (contextReport.layers.domLayer?.intervalButtonText) {
    resolvedTimeframe = contextReport.layers.domLayer.intervalButtonText;
  } else if (contextReport.layers.urlLayer?.intervalParam) {
    resolvedTimeframe = contextReport.layers.urlLayer.intervalParam;
  }

  contextReport.resolvedContext = {
    symbol: resolvedSymbol,
    exchange: resolvedExchange,
    fullSymbol: resolvedExchange && resolvedSymbol ? `${resolvedExchange}:${resolvedSymbol}` : resolvedSymbol,
    timeframe: resolvedTimeframe,
    layoutId: resolvedLayoutId,
    confidence,
    primarySource,
  };

  // Display Diagnostic Output
  console.log('%c=== RESOLVED CHART CONTEXT ===', 'color: #4ade80; font-weight: bold;');
  console.table(contextReport.resolvedContext);

  console.log('%cDetailed Extraction Layers:', 'color: #38bdf8;');
  console.log('Layer 1 (URL):', contextReport.layers.urlLayer);
  console.log('Layer 2 (DOM):', contextReport.layers.domLayer);
  console.log('Multi-Chart Layout:', contextReport.multiChartLayout);

  window.__TV_CONTEXT_REPORT__ = contextReport;
  console.log('%c[TV Chart Context Probe] Report saved in window.__TV_CONTEXT_REPORT__', 'color: #fbbf24; font-weight: bold;');
  return contextReport;
})();
