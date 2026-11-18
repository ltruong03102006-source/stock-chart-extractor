/**
 * TRADINGVIEW LIVE RUNTIME SURVEY & DIAGNOSTIC SCRIPT
 * File: research/tradingview/07-live-diagnostic-survey.js
 * 
 * Purpose:
 * Runs directly in Chrome DevTools Console on https://www.tradingview.com/chart/
 * while a drawing (e.g. Trend Line) is visible/selected on the chart.
 * 
 * Safely inspects:
 * 1. Extension Bridge Status: window.__STOCK_CHART_EXTRACTOR_TV__
 * 2. Active Selected Drawing via Floating Toolbar React Fiber
 * 3. Price & Time Axis highlighted labels (e.g. 3,161.70 / 3,021.60)
 * 4. Chart Container React Fiber & useRef hooks
 * 5. LocalStorage drawing entries
 * 
 * 100% Read-Only & Safe. Does NOT mutate DOM, chart, or data.
 */

(function () {
  console.clear();
  console.log('%c🔍 [Stock Chart Extractor] TRADINGVIEW RUNTIME SURVEY', 'background: #2563eb; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 14px;');

  const survey = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    title: document.title,
    bridge: {
      exists: typeof (window as any).__STOCK_CHART_EXTRACTOR_TV__ !== 'undefined',
      context: null as any,
      cachedDrawingsCount: 0,
    },
    floatingToolbar: {
      found: false,
      elementClass: null as string | null,
      buttons: [] as string[],
      fiberPropsKeys: [] as string[],
      candidateToolFound: null as any,
    },
    axisLabels: {
      priceLabels: [] as string[],
      timeLabels: [] as string[],
    },
    chartContainerFiber: {
      chartGuiWrapperFound: false,
      fiberKeys: [] as string[],
      useRefCandidates: [] as string[],
      candidateModelKeys: [] as string[],
    },
    localStorage: {
      relevantKeys: [] as string[],
      sampleLayoutFound: false,
    },
  };

  // 1. Check Extension Bridge
  try {
    const bridge = (window as any).__STOCK_CHART_EXTRACTOR_TV__;
    if (bridge) {
      if (typeof bridge.getContext === 'function') survey.bridge.context = bridge.getContext();
      if (typeof bridge.getDrawings === 'function') survey.bridge.cachedDrawingsCount = bridge.getDrawings()?.length || 0;
    }
  } catch (e: any) {
    survey.bridge.context = { error: e.message };
  }

  // 2. Inspect Floating Toolbar & Active Tool
  try {
    const toolbar = document.querySelector('[class*="floating-toolbar"], [data-name="drawing-toolbar"], #overlap-manager-root div[class*="toolbar-"]');
    if (toolbar) {
      survey.floatingToolbar.found = true;
      survey.floatingToolbar.elementClass = toolbar.className;
      survey.floatingToolbar.buttons = Array.from(toolbar.querySelectorAll('button, [role="button"]')).map(
        (b) => b.getAttribute('data-name') || b.getAttribute('aria-label') || b.textContent?.trim() || b.className
      ).slice(0, 10);

      // Inspect React Fiber
      const keys = Object.keys(toolbar);
      const fiberKey = keys.find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (fiberKey) {
        let curr = (toolbar as any)[fiberKey];
        let depth = 0;
        while (curr && depth < 25) {
          depth++;
          if (curr.memoizedProps && typeof curr.memoizedProps === 'object') {
            const pKeys = Object.keys(curr.memoizedProps);
            for (const k of pKeys) {
              if (!survey.floatingToolbar.fiberPropsKeys.includes(k)) {
                survey.floatingToolbar.fiberPropsKeys.push(k);
              }
              const val = curr.memoizedProps[k];
              if (val && typeof val === 'object') {
                if (val.points || val.properties || val.state || val.id || val.priceAxisPoints) {
                  survey.floatingToolbar.candidateToolFound = {
                    key: k,
                    id: val.id || (typeof val.id === 'function' ? val.id() : null),
                    name: val.name || (typeof val.name === 'function' ? val.name() : null),
                    hasPoints: Boolean(val.points || (typeof val.points === 'function')),
                    hasProperties: Boolean(val.properties || val.state),
                  };
                  break;
                }
              }
            }
          }
          if (survey.floatingToolbar.candidateToolFound) break;
          curr = curr.return;
        }
      }
    }
  } catch (e: any) {
    survey.floatingToolbar.candidateToolFound = { error: e.message };
  }

  // 3. Inspect Price & Time Axis Highlighted Badges
  try {
    // Price axis badges (e.g. blue badges for anchor prices)
    const priceBadges = document.querySelectorAll(
      '[class*="price-axis"] [class*="badge"], [class*="price-axis"] [class*="highlight"], [class*="axis-"] [class*="item"], div[class*="value-"][class*="selected"], div[class*="badge-"]'
    );
    priceBadges.forEach((b) => {
      const txt = b.textContent?.trim();
      if (txt && /[\d,.]+/.test(txt) && !survey.axisLabels.priceLabels.includes(txt)) {
        survey.axisLabels.priceLabels.push(txt);
      }
    });

    // Time axis badges (e.g. blue badges for anchor dates)
    const timeBadges = document.querySelectorAll(
      '[class*="time-axis"] [class*="badge"], [class*="time-axis"] [class*="highlight"], [class*="timeline"] [class*="selected"]'
    );
    timeBadges.forEach((b) => {
      const txt = b.textContent?.trim();
      if (txt && !survey.axisLabels.timeLabels.includes(txt)) {
        survey.axisLabels.timeLabels.push(txt);
      }
    });
  } catch {}

  // 4. Inspect Chart Container Fiber & useRef
  try {
    const chartWrapper = document.querySelector('.chart-gui-wrapper, .chart-container, [class*="chart-gui-wrapper"]');
    if (chartWrapper) {
      survey.chartContainerFiber.chartGuiWrapperFound = true;
      const keys = Object.keys(chartWrapper);
      const fiberKey = keys.find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (fiberKey) {
        let curr = (chartWrapper as any)[fiberKey];
        let depth = 0;
        while (curr && depth < 20) {
          depth++;
          if (curr.memoizedState) {
            let hook = curr.memoizedState;
            let hCount = 0;
            while (hook && hCount < 15) {
              hCount++;
              if (hook.memoizedState?.current && typeof hook.memoizedState.current === 'object') {
                const cKeys = Object.keys(hook.memoizedState.current);
                const relevant = cKeys.filter((k) => /chart|model|line|source|pane|tool|draw/i.test(k));
                if (relevant.length > 0) {
                  survey.chartContainerFiber.useRefCandidates.push(`depth${depth}_hook${hCount}: [${relevant.join(', ')}]`);
                }
              }
              hook = hook.next;
            }
          }
          if (curr.memoizedProps && typeof curr.memoizedProps === 'object') {
            const relevant = Object.keys(curr.memoizedProps).filter((k) => /chart|model|line|source|pane|tool|draw/i.test(k));
            if (relevant.length > 0) {
              survey.chartContainerFiber.candidateModelKeys.push(`depth${depth}: [${relevant.join(', ')}]`);
            }
          }
          curr = curr.return;
        }
      }
    }
  } catch {}

  // 5. Inspect LocalStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /chart|layout|drawing|linetool/i.test(k)) {
        survey.localStorage.relevantKeys.push(k);
      }
    }
  } catch {}

  // Summary Output
  console.log('%c📊 SURVEY REPORT:', 'color: #38bdf8; font-weight: bold; font-size: 13px;');
  console.dir(survey);
  console.log('%c------------------------------------------------', 'color: #64748b;');
  console.log('%c👉 HÃY COPY TOÀN BỘ KẾT QUẢ DƯỚI ĐÂY VÀ GỬI CHO TÔI:', 'color: #4ade80; font-weight: bold;');
  console.log(JSON.stringify(survey, null, 2));

  return survey;
})();
