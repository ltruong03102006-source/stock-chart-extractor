/**
 * Unified Stock Registry Types
 * Handles both automatic FireAnt chart discovery and extension manual stock management.
 */

export type StockSource = 'FIREANT' | 'TRADINGVIEW' | 'EXTENSION';

export interface ChartContextSummary {
  chartId: string;
  timeframe: string;
  compositeKey: string;
  lastSyncAt: number;
  drawingsCount: number;
  indicatorsCount: number;
}

export interface StockRegistryItem {
  /** Normalized stock symbol (UPPERCASE, trimmed) */
  symbol: string;

  /** Exchange code (HOSE, HNX, UPCOM, VN) */
  exchange?: string;

  /** Sources managing this stock: 'FIREANT', 'EXTENSION', or both */
  sources: StockSource[];

  /** Whether the chart for this stock is currently opened/active on FireAnt */
  isOpened: boolean;

  /** Whether this is the currently focused active chart on FireAnt */
  isActive: boolean;

  /** List of chart contexts (timeframes, drawings count, etc.) associated with this stock */
  chartContexts: ChartContextSummary[];

  /** Timestamp of most recent detection or interaction */
  lastDetectedAt: number;

  /** Creation timestamp */
  createdAt: number;

  /** Platform hosting this chart: 'fireant' or 'tradingview' */
  platform?: 'fireant' | 'tradingview';
}

export interface StockRegistryState {
  version: '2.0';
  activeSymbol: string | null;
  activeCompositeKey: string | null;
  items: Record<string, StockRegistryItem>;
  updatedAt: number;
}

export interface ChartContextPayload {
  symbol: string;
  exchange?: string;
  timeframe: string;
  chartId: string;
  compositeKey: string;
  chartsCount?: number;
  platform?: 'fireant' | 'tradingview';
}

/**
 * Normalizes a raw stock symbol string (uppercase, alphanumeric only, trimmed)
 */
export function normalizeSymbol(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Builds a unique composite key for a chart context: SYMBOL_EXCHANGE_TIMEFRAME
 */
export function buildChartCompositeKey(symbol: string, timeframe: string, exchange?: string): string {
  const cleanSymbol = normalizeSymbol(symbol) || 'UNKNOWN';
  const cleanTimeframe = (timeframe || 'D').trim().toUpperCase();
  const cleanExchange = (exchange || 'VN').trim().toUpperCase();
  return `${cleanSymbol}_${cleanExchange}_${cleanTimeframe}`;
}
