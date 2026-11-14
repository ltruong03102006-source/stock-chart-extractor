/**
 * Stock Chart Extractor - Main World <-> Isolated World Bridge Architecture
 *
 * Execution Contexts in Manifest V3:
 * 1. Isolated World (Content Script):
 *    - Has access to Chrome Extension APIs (browser.runtime, browser.storage).
 *    - Has DOM access to the page.
 *    - CANNOT access global JavaScript variables of the page (e.g. window.chartWidget).
 *
 * 2. Main World (Injected Script / Main Content Script):
 *    - Has direct access to window.chartWidget and FireAnt TradingView internals.
 *      E.g., window.chartWidget.model().m_model.allLineTools()
 *    - Has NO access to Chrome Extension APIs.
 *
 * Communication Architecture:
 * - Content Script (Isolated) <---> window.postMessage <---> Bridge Script (Main World)
 * - Safe message format tagged with BRIDGE_SOURCE to filter out unrelated page messages.
 */

export const BRIDGE_SOURCE = 'STOCK_CHART_EXTRACTOR_BRIDGE' as const;

export type BridgeAction =
  | 'PING'
  | 'GET_CHART_STATUS'
  | 'GET_LINE_TOOLS'
  | 'EXTRACT_DRAWING_DATA';

export interface BridgeMessage<T = unknown> {
  source: typeof BRIDGE_SOURCE;
  id: string;
  action: BridgeAction;
  direction: 'TO_MAIN_WORLD' | 'TO_ISOLATED_WORLD';
  payload?: T;
  success?: boolean;
  error?: string;
}
