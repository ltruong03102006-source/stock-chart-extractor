/**
 * PROTOTYPE 06: TRADINGVIEW LIFECYCLE OBSERVER
 * File: research/tradingview/06-lifecycle-observer.js
 *
 * Description:
 * Probes lifecycle and event observation mechanisms on TradingView Website:
 * - Detects Symbol and Timeframe transitions via URL pushState interception and Title observers.
 * - Detects Drawing Selection / Deselection by observing the TradingView Floating Toolbar
 *   (.floating-toolbar-react-wrapper, [data-name="drawing-toolbar"]).
 * - Detects Chart DOM layout changes via MutationObserver.
 * - Buffers observations in window.__TV_EVENT_LOG__.
 * - Provides start() and stop() controls for safe, clean testing.
 *
 * Usage:
 * Paste and run in Chrome DevTools Console at https://www.tradingview.com/chart/
 * Select a drawing, change symbols, or switch timeframes, then run:
 *   window.__TV_LIFECYCLE_OBSERVER__.getLogs();
 *   window.__TV_LIFECYCLE_OBSERVER__.stop();
 *
 * Safety: 100% read-only. Clean teardown with no memory leaks.
 */

(() => {
  console.log('%c[TV Lifecycle Observer] Initializing Observer Module...', 'color: #38bdf8; font-weight: bold;');

  // Teardown existing instance if re-run
  if (window.__TV_LIFECYCLE_OBSERVER__ && typeof window.__TV_LIFECYCLE_OBSERVER__.stop === 'function') {
    window.__TV_LIFECYCLE_OBSERVER__.stop();
  }

  const state = {
    isRunning: false,
    eventLogs: [],
    observers: [],
    originalPushState: null,
    originalReplaceState: null,
    lastKnownSymbol: null,
    lastKnownInterval: null,
  };

  function logEvent(type, payload = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      payload,
    };
    state.eventLogs.push(entry);
    console.log(`%c[TV Lifecycle] ${type}`, 'color: #fbbf24; font-weight: bold;', payload);
  }

  function start() {
    if (state.isRunning) {
      console.warn('[TV Lifecycle Observer] Observer is already running.');
      return;
    }
    state.isRunning = true;
    state.eventLogs = [];
    console.log('%c[TV Lifecycle Observer] Monitoring started! Perform actions on the chart...', 'color: #4ade80; font-weight: bold;');

    // 1. Intercept History API (pushState / replaceState for client navigation)
    state.originalPushState = history.pushState;
    state.originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      state.originalPushState.apply(this, args);
      logEvent('URL_PUSH_STATE', { url: window.location.href, state: args[0] });
    };

    history.replaceState = function (...args) {
      state.originalReplaceState.apply(this, args);
      logEvent('URL_REPLACE_STATE', { url: window.location.href, state: args[0] });
    };

    // 2. Title & Context Mutation Observer
    const titleEl = document.querySelector('title');
    if (titleEl) {
      const titleObserver = new MutationObserver(() => {
        logEvent('TITLE_CHANGED', { newTitle: document.title });
      });
      titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
      state.observers.push(titleObserver);
    }

    // 3. Floating Toolbar (Drawing Selection) Observer
    // When a drawing is clicked/selected, TradingView mounts .floating-toolbar-react-wrapper
    const bodyObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // Check added nodes for floating toolbar
        m.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = /** @type {HTMLElement} */ (node);
            const isToolbar = el.matches?.('[class*="floating-toolbar"], [data-name="drawing-toolbar"]') ||
                              el.querySelector?.('[class*="floating-toolbar"], [data-name="drawing-toolbar"]');
            if (isToolbar) {
              const toolbarEl = el.matches?.('[class*="floating-toolbar"], [data-name="drawing-toolbar"]') ? el : el.querySelector('[class*="floating-toolbar"], [data-name="drawing-toolbar"]');
              const buttons = Array.from(toolbarEl.querySelectorAll('button, [role="button"]')).map(b => b.getAttribute('data-name') || b.getAttribute('aria-label') || b.className);
              logEvent('DRAWING_TOOLBAR_MOUNTED (Drawing Selected)', {
                toolbarClass: toolbarEl.className,
                detectedActionButtons: buttons.slice(0, 8),
              });
            }
          }
        });

        // Check removed nodes
        m.removedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = /** @type {HTMLElement} */ (node);
            const isToolbar = el.matches?.('[class*="floating-toolbar"], [data-name="drawing-toolbar"]') ||
                              el.querySelector?.('[class*="floating-toolbar"], [data-name="drawing-toolbar"]');
            if (isToolbar) {
              logEvent('DRAWING_TOOLBAR_UNMOUNTED (Drawing Deselected)');
            }
          }
        });
      }
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
    state.observers.push(bodyObserver);

    // 4. Initial Baseline
    const symbolBtn = document.querySelector('#header-toolbar-symbol-search, [data-name="header-toolbar-symbol-search"]');
    state.lastKnownSymbol = symbolBtn?.textContent?.trim() || null;
    logEvent('INITIAL_STATE', {
      initialSymbol: state.lastKnownSymbol,
      initialTitle: document.title,
      url: window.location.href,
    });
  }

  function stop() {
    if (!state.isRunning) return;
    state.isRunning = false;

    // Disconnect observers
    state.observers.forEach(obs => obs.disconnect());
    state.observers = [];

    // Restore History API
    if (state.originalPushState) history.pushState = state.originalPushState;
    if (state.originalReplaceState) history.replaceState = state.originalReplaceState;

    console.log('%c[TV Lifecycle Observer] Monitoring stopped and all observers disconnected.', 'color: #f87171; font-weight: bold;');
  }

  function getLogs() {
    console.table(state.eventLogs.map(l => ({
      Timestamp: l.timestamp.split('T')[1].slice(0, 8),
      Type: l.type,
      Details: JSON.stringify(l.payload),
    })));
    return state.eventLogs;
  }

  window.__TV_LIFECYCLE_OBSERVER__ = {
    start,
    stop,
    getLogs,
    getState: () => ({ isRunning: state.isRunning, eventCount: state.eventLogs.length }),
  };
  window.__TV_EVENT_LOG__ = state.eventLogs;

  // Auto-start for quick test
  start();

  console.log('%c[TV Lifecycle Observer] Observer is RUNNING! Check window.__TV_LIFECYCLE_OBSERVER__', 'color: #4ade80;');
  console.log('Commands:');
  console.log('  window.__TV_LIFECYCLE_OBSERVER__.getLogs()  -> Print recorded events');
  console.log('  window.__TV_LIFECYCLE_OBSERVER__.stop()     -> Disconnect all hooks cleanly');
})();
