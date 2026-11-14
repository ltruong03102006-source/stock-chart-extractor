export default defineContentScript({
  matches: [
    'https://fireant.vn/*',
    'https://*.fireant.vn/*',
  ],

  runAt: 'document_idle',

  main() {
    try {
      // Guard against duplicate execution in the same browsing context
      const INJECTION_GUARD = '__STOCK_CHART_EXTRACTOR_CONTENT_SCRIPT_INITIALIZED__';
      if ((window as unknown as Record<string, boolean>)[INJECTION_GUARD]) {
        return;
      }
      (window as unknown as Record<string, boolean>)[INJECTION_GUARD] = true;

      // Required verification logs
      console.log('[Stock Chart Extractor] Content Script is running!');
      console.log('[Stock Chart Extractor] Current URL:', window.location.href);

      /**
       * Architectural Note: Main World vs Isolated World
       * 
       * This Content Script runs in Chrome's ISOLATED world by default.
       * Variables attached to the page's global window (such as `window.chartWidget`
       * on FireAnt) are NOT accessible from this context directly.
       * 
       * To interact with `window.chartWidget.model().m_model.allLineTools()`,
       * the extension will use a Main World Bridge script (communicating via
       * window.postMessage with utils/bridge.ts protocols) in the subsequent phase.
       */
    } catch (error) {
      console.error('[Stock Chart Extractor] Error initializing content script:', error);
    }
  },
});
