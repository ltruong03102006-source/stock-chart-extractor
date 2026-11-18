/**
 * PROTOTYPE 01: TRADINGVIEW RUNTIME DISCOVERY
 * File: research/tradingview/01-runtime-discovery.js
 *
 * Description:
 * Scans the JavaScript execution environment of https://www.tradingview.com/chart/
 * to discover exposed global objects, iframe structures, canvas containers,
 * React Fiber nodes, and Webpack module loaders.
 *
 * Usage:
 * Open https://www.tradingview.com/chart/ in Google Chrome.
 * Open Chrome DevTools (F12) -> Console.
 * Paste and run this script.
 * 
 * Safety: 100% read-only. Does not mutate DOM, state, or network requests.
 */

(() => {
  console.clear();
  console.log('%c[TV Discovery] Starting TradingView Website Runtime Discovery...', 'color: #38bdf8; font-weight: bold; font-size: 14px;');

  const report = {
    timestamp: new Date().toISOString(),
    page: {
      url: window.location.href,
      origin: window.location.origin,
      pathname: window.location.pathname,
      title: document.title,
    },
    iframes: [],
    canvases: [],
    reactFibers: [],
    webpackChunks: [],
    windowGlobals: [],
    candidateChartObjects: [],
  };

  // 1. Inspect iframes (TradingView standalone vs embedded)
  const iframes = Array.from(document.querySelectorAll('iframe'));
  report.iframes = iframes.map((iframe, index) => {
    let accessible = false;
    let childGlobals = [];
    try {
      if (iframe.contentWindow) {
        accessible = true;
        childGlobals = Object.keys(iframe.contentWindow).filter(k => 
          /chart|tv|tradingview|widget|model/i.test(k)
        );
      }
    } catch (e) {
      accessible = false; // Cross-origin blocked
    }
    return {
      index,
      id: iframe.id || null,
      name: iframe.name || null,
      src: iframe.src || null,
      isAccessible: accessible,
      relevantGlobalsFound: childGlobals,
    };
  });

  // 2. Inspect Canvas elements (TradingView uses canvas for chart rendering)
  const canvases = Array.from(document.querySelectorAll('canvas'));
  report.canvases = canvases.map((c, idx) => ({
    index: idx,
    id: c.id || null,
    className: c.className || null,
    width: c.width,
    height: c.height,
    parentClass: c.parentElement ? c.parentElement.className : null,
    parentId: c.parentElement ? c.parentElement.id : null,
  }));

  // 3. Inspect React Fiber on chart container elements
  const chartContainers = Array.from(document.querySelectorAll('[class*="chart-container"], [class*="chart-gui-wrapper"], [class*="layout__area"]'));
  chartContainers.forEach((el, idx) => {
    const keys = Object.keys(el);
    const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    const propsKey = keys.find(k => k.startsWith('__reactProps$'));
    if (fiberKey || propsKey) {
      report.reactFibers.push({
        elementIndex: idx,
        tagName: el.tagName,
        className: el.className,
        hasFiber: Boolean(fiberKey),
        fiberKey: fiberKey || null,
        hasProps: Boolean(propsKey),
      });
    }
  });

  // 4. Inspect Webpack Chunks
  const win = window;
  const webpackProps = Object.keys(win).filter(k => /webpackChunk/i.test(k));
  report.webpackChunks = webpackProps.map(prop => ({
    name: prop,
    type: typeof win[prop],
    isArray: Array.isArray(win[prop]),
    length: win[prop]?.length || 0,
  }));

  // 5. Scan Window Globals matching relevant financial & charting keywords
  const KEYWORDS = [
    'chart',
    'tv',
    'tradingview',
    'widget',
    'model',
    'drawing',
    'line',
    'shape',
    'tool',
    'study',
    'pane',
    'series',
    'symbol',
    'interval',
    'view',
  ];

  const allWindowKeys = Object.getOwnPropertyNames(window);
  const matchedKeys = allWindowKeys.filter(key => {
    // Exclude common browser built-ins
    if (/webkit|on[a-z]+|scroll|client|screen|speech/i.test(key)) return false;
    return KEYWORDS.some(kw => key.toLowerCase().includes(kw));
  });

  matchedKeys.forEach(key => {
    try {
      const val = win[key];
      const type = typeof val;
      const isNull = val === null;
      const constructorName = val?.constructor?.name || null;
      report.windowGlobals.push({
        key,
        type,
        constructorName,
        isCallable: type === 'function',
      });

      // Check if it qualifies as candidate chart object
      if (type === 'object' && val !== null) {
        const propKeys = Object.getOwnPropertyNames(val).slice(0, 15);
        report.candidateChartObjects.push({
          key,
          constructorName,
          sampleOwnProperties: propKeys,
        });
      }
    } catch (e) {
      report.windowGlobals.push({
        key,
        type: 'restricted-access',
        error: e.message,
      });
    }
  });

  // 6. Summary Logging
  console.log('%c=== [1] PAGE & ENVIRONMENT ===', 'color: #4ade80; font-weight: bold;');
  console.table(report.page);

  console.log('%c=== [2] IFRAMES FOUND (' + report.iframes.length + ') ===', 'color: #4ade80; font-weight: bold;');
  console.table(report.iframes);

  console.log('%c=== [3] CANVAS ELEMENTS FOUND (' + report.canvases.length + ') ===', 'color: #4ade80; font-weight: bold;');
  console.table(report.canvases.slice(0, 10));

  console.log('%c=== [4] WEBPACK CHUNK GLOBAL OBJECTS (' + report.webpackChunks.length + ') ===', 'color: #4ade80; font-weight: bold;');
  console.table(report.webpackChunks);

  console.log('%c=== [5] MATCHED WINDOW GLOBALS (' + report.windowGlobals.length + ') ===', 'color: #4ade80; font-weight: bold;');
  console.table(report.windowGlobals);

  console.log('%c=== [6] CANDIDATE CHART OBJECTS (' + report.candidateChartObjects.length + ') ===', 'color: #4ade80; font-weight: bold;');
  console.dir(report.candidateChartObjects);

  // Expose global diagnosis helper for further probes
  window.__TV_DISCOVERY_RESULT__ = report;
  console.log('%c[TV Discovery] Result saved to global variable: window.__TV_DISCOVERY_RESULT__', 'color: #fbbf24; font-weight: bold;');
  return report;
})();
