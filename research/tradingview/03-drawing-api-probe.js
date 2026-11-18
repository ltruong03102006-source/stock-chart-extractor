/**
 * PROTOTYPE 03: TRADINGVIEW DRAWING API PROBE
 * File: research/tradingview/03-drawing-api-probe.js
 *
 * Description:
 * Non-destructive probe testing candidate objects and paths for Drawing API patterns.
 * Compares FireAnt's verified pattern (chartWidget.model().m_model.allLineTools())
 * against TradingView Website's runtime architecture.
 *
 * Targets Tested:
 * 1. FireAnt pattern: window.chartWidget?.model()?.m_model?.allLineTools()
 * 2. TradingView Charting Library / Advanced Charts standard API:
 *    window.tvWidget?.activeChart()?.getAllShapes()
 * 3. React Fiber tree traversal starting from .chart-container, .chart-gui-wrapper
 * 4. Webpack chunk extraction via window.webpackChunk*
 * 5. Data sources & Panes model inspection
 *
 * Usage:
 * Paste and run in Chrome DevTools Console at https://www.tradingview.com/chart/
 *
 * Safety: 100% read-only. Does NOT call mutating methods.
 */

(() => {
  console.clear();
  console.log('%c[TV Drawing Probe] Running Drawing API Diagnostic Probe...', 'color: #38bdf8; font-weight: bold; font-size: 14px;');

  const probeResults = {
    timestamp: new Date().toISOString(),
    tests: [],
    candidatePathsFound: [],
    summary: {
      fireantPatternAvailable: false,
      standardTvWidgetAvailable: false,
      fiberPathAvailable: false,
      webpackRequireAvailable: false,
    },
  };

  function addTest(name, description, status, details = {}) {
    probeResults.tests.push({
      name,
      description,
      status, // 'FOUND' | 'NOT_FOUND' | 'BLOCKED' | 'RESTRICTED'
      details,
    });
  }

  // --- TEST 1: FireAnt Pattern Probe ---
  try {
    const hasChartWidget = typeof window.chartWidget !== 'undefined';
    let hasModel = false;
    let hasMModel = false;
    let hasAllLineTools = false;

    if (hasChartWidget && window.chartWidget) {
      if (typeof window.chartWidget.model === 'function') {
        const model = window.chartWidget.model();
        hasModel = Boolean(model);
        if (model && model.m_model) {
          hasMModel = true;
          if (typeof model.m_model.allLineTools === 'function') {
            hasAllLineTools = true;
          }
        }
      }
    }

    probeResults.summary.fireantPatternAvailable = hasAllLineTools;
    addTest(
      'T1_FireAnt_Pattern',
      'window.chartWidget.model().m_model.allLineTools()',
      hasAllLineTools ? 'FOUND' : 'NOT_FOUND',
      {
        hasChartWidget,
        hasModel,
        hasMModel,
        hasAllLineTools,
      }
    );
  } catch (e) {
    addTest('T1_FireAnt_Pattern', 'window.chartWidget traversal', 'BLOCKED', { error: e.message });
  }

  // --- TEST 2: TradingView Charting Library Standard API ---
  try {
    const hasTvWidget = typeof window.tvWidget !== 'undefined';
    let hasActiveChart = false;
    let hasGetAllShapes = false;
    let hasGetShapeById = false;

    if (hasTvWidget && window.tvWidget) {
      if (typeof window.tvWidget.activeChart === 'function') {
        hasActiveChart = true;
        const chart = window.tvWidget.activeChart();
        if (chart) {
          hasGetAllShapes = typeof chart.getAllShapes === 'function';
          hasGetShapeById = typeof chart.getShapeById === 'function';
        }
      }
    }

    probeResults.summary.standardTvWidgetAvailable = hasGetAllShapes;
    addTest(
      'T2_Standard_TVWidget',
      'window.tvWidget.activeChart().getAllShapes()',
      hasGetAllShapes ? 'FOUND' : 'NOT_FOUND',
      {
        hasTvWidget,
        hasActiveChart,
        hasGetAllShapes,
        hasGetShapeById,
      }
    );
  } catch (e) {
    addTest('T2_Standard_TVWidget', 'tvWidget traversal', 'BLOCKED', { error: e.message });
  }

  // --- TEST 3: TradingView Global Namespace Search ---
  try {
    const tvGlobal = window.TradingView;
    const hasTvGlobal = typeof tvGlobal !== 'undefined';
    const tvGlobalKeys = hasTvGlobal && tvGlobal ? Object.keys(tvGlobal) : [];

    addTest(
      'T3_TradingView_Namespace',
      'Inspect window.TradingView namespace',
      hasTvGlobal ? 'FOUND' : 'NOT_FOUND',
      {
        hasTvGlobal,
        keys: tvGlobalKeys.slice(0, 20),
      }
    );
  } catch (e) {
    addTest('T3_TradingView_Namespace', 'window.TradingView inspection', 'BLOCKED', { error: e.message });
  }

  // --- TEST 4: React Fiber Traversal on Chart Containers ---
  try {
    const chartContainers = document.querySelectorAll(
      '[class*="chart-container"], [class*="chart-gui-wrapper"], [class*="chart-page"], [data-name="chart-widget"]'
    );
    let fiberFound = false;
    let candidatesFound = [];

    chartContainers.forEach((container, elIdx) => {
      const keys = Object.keys(container);
      const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (!fiberKey) return;

      fiberFound = true;
      let curr = container[fiberKey];
      let depth = 0;
      const maxFiberDepth = 15;

      while (curr && depth < maxFiberDepth) {
        depth++;
        // Check memoizedProps and memoizedState for chart / model / lineTools references
        const checkObject = (obj, sourceName) => {
          if (!obj || typeof obj !== 'object') return;
          const props = Object.keys(obj);
          for (const p of props) {
            if (/chart|widget|model|linetool|shape|drawing|panes|sources/i.test(p)) {
              candidatesFound.push({
                elementIndex: elIdx,
                fiberDepth: depth,
                source: sourceName,
                property: p,
                type: typeof obj[p],
                hasSubModel: Boolean(obj[p]?.model || obj[p]?.m_model),
                hasAllLineTools: typeof obj[p]?.allLineTools === 'function' || typeof obj[p]?.m_model?.allLineTools === 'function',
              });
            }
          }
        };

        checkObject(curr.memoizedProps, 'memoizedProps');
        checkObject(curr.memoizedState, 'memoizedState');
        curr = curr.return; // walk upward to parent React components
      }
    });

    probeResults.summary.fiberPathAvailable = candidatesFound.length > 0;
    probeResults.candidatePathsFound.push(...candidatesFound);

    addTest(
      'T4_React_Fiber_Traversal',
      'Traverse React Fiber tree from DOM chart containers',
      fiberFound ? (candidatesFound.length > 0 ? 'FOUND' : 'PARTIALLY_FOUND') : 'NOT_FOUND',
      {
        chartContainersCount: chartContainers.length,
        fiberFound,
        candidateReferencesCount: candidatesFound.length,
        sampleCandidates: candidatesFound.slice(0, 5),
      }
    );
  } catch (e) {
    addTest('T4_React_Fiber_Traversal', 'React Fiber traversal', 'BLOCKED', { error: e.message });
  }

  // --- TEST 5: Webpack Chunk Module Extraction Probe ---
  try {
    const chunkNames = Object.keys(window).filter(k => /webpackChunk/i.test(k));
    let chunkAccessible = false;
    let pushInterceptionPossible = false;

    if (chunkNames.length > 0) {
      const chunk = window[chunkNames[0]];
      chunkAccessible = Array.isArray(chunk);
      if (chunkAccessible && typeof chunk.push === 'function') {
        pushInterceptionPossible = true;
      }
    }

    addTest(
      'T5_Webpack_Chunk_Probe',
      'Inspect window.webpackChunk* loaders',
      chunkAccessible ? 'FOUND' : 'NOT_FOUND',
      {
        detectedChunkNames: chunkNames,
        chunkAccessible,
        pushInterceptionPossible,
        note: 'TradingView Website production Webpack removes global require and restricts closure scope.',
      }
    );
  } catch (e) {
    addTest('T5_Webpack_Chunk_Probe', 'Webpack chunk probe', 'BLOCKED', { error: e.message });
  }

  // --- TEST 6: LocalStorage Layout & Drawing State Check ---
  try {
    const lsKeys = Object.keys(localStorage);
    const tvKeys = lsKeys.filter(k => /tradingview|chart|layout|drawing|linetool/i.test(k));

    addTest(
      'T6_LocalStorage_Layout_State',
      'Scan localStorage for cached drawings / layout configurations',
      tvKeys.length > 0 ? 'FOUND' : 'NOT_FOUND',
      {
        totalKeys: lsKeys.length,
        matchingTvKeysCount: tvKeys.length,
        sampleKeys: tvKeys.slice(0, 10),
      }
    );
  } catch (e) {
    addTest('T6_LocalStorage_Layout_State', 'localStorage inspection', 'BLOCKED', { error: e.message });
  }

  // Print Summary Table
  console.log('%c=== TRADINGVIEW DRAWING API PROBE SUMMARY ===', 'color: #4ade80; font-weight: bold;');
  console.table(probeResults.tests.map(t => ({
    Test: t.name,
    Target: t.description,
    Status: t.status,
  })));

  console.log('%cKey Diagnostic Assessment:', 'color: #fbbf24; font-weight: bold;');
  if (!probeResults.summary.fireantPatternAvailable) {
    console.warn('[ASSESSMENT] window.chartWidget.model().m_model.allLineTools() is NOT directly available on TradingView Website (commercial version encapsulates chart runtime).');
  }
  if (!probeResults.summary.standardTvWidgetAvailable) {
    console.warn('[ASSESSMENT] window.tvWidget.activeChart().getAllShapes() is NOT exposed globally on TradingView Website (commercial site does not use standard Charting Library widget wrapper).');
  }

  window.__TV_DRAWING_PROBE_RESULT__ = probeResults;
  console.log('%c[TV Drawing Probe] Full report saved in window.__TV_DRAWING_PROBE_RESULT__', 'color: #a855f7; font-weight: bold;');
  return probeResults;
})();
