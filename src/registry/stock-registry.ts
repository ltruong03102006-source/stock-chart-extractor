import {
  type StockRegistryState,
  type StockRegistryItem,
  type ChartContextPayload,
  type ChartContextSummary,
  normalizeSymbol,
  buildChartCompositeKey,
} from './stock-registry.types';

export { normalizeSymbol, buildChartCompositeKey };

/**
 * Creates a clean initial StockRegistryState v2.0
 */
export function createInitialRegistryState(): StockRegistryState {
  return {
    version: '2.0',
    activeSymbol: null,
    activeCompositeKey: null,
    items: {},
    updatedAt: Date.now(),
  };
}

/**
 * Pure function: Merges or updates stock information discovered automatically from FireAnt runtime.
 * Implements auto-linking if the stock was previously registered manually.
 */
export function upsertFromFireAnt(
  state: StockRegistryState,
  context: ChartContextPayload
): StockRegistryState {
  const symbol = normalizeSymbol(context.symbol);
  if (!symbol) return state;

  const now = Date.now();
  const exchange = (context.exchange || 'VN').toUpperCase();
  const timeframe = context.timeframe || 'D';
  const compositeKey = context.compositeKey || buildChartCompositeKey(symbol, timeframe, exchange);

  const nextItems: Record<string, StockRegistryItem> = {};

  // Update existing items: only the newly reported stock is marked isActive: true
  for (const [key, item] of Object.entries(state.items)) {
    if (key === symbol) {
      // Current active stock
      const sources = item.sources.includes('FIREANT')
        ? item.sources
        : [...item.sources, 'FIREANT' as const];

      // Update or insert context summary
      const existingContexts = [...(item.chartContexts || [])];
      const ctxIndex = existingContexts.findIndex((c) => c.timeframe === timeframe || c.compositeKey === compositeKey);
      const existingCtx = ctxIndex >= 0 ? existingContexts[ctxIndex] : undefined;

      const updatedContext: ChartContextSummary = {
        chartId: context.chartId || 'chart-0',
        timeframe,
        compositeKey,
        lastSyncAt: now,
        drawingsCount: existingCtx ? existingCtx.drawingsCount : 0,
        indicatorsCount: existingCtx ? existingCtx.indicatorsCount : 0,
      };

      if (ctxIndex >= 0) {
        existingContexts[ctxIndex] = updatedContext;
      } else {
        existingContexts.push(updatedContext);
      }

      nextItems[key] = {
        ...item,
        exchange: item.exchange || exchange,
        sources,
        isOpened: true,
        isActive: true,
        chartContexts: existingContexts,
        lastDetectedAt: now,
      };
    } else {
      // Other stocks: keep them, but deactivate active flag
      nextItems[key] = {
        ...item,
        isActive: false,
      };
    }
  }

  // If stock is brand new to registry
  if (!nextItems[symbol]) {
    nextItems[symbol] = {
      symbol,
      exchange,
      sources: ['FIREANT'],
      isOpened: true,
      isActive: true,
      chartContexts: [
        {
          chartId: context.chartId || 'chart-0',
          timeframe,
          compositeKey,
          lastSyncAt: now,
          drawingsCount: 0,
          indicatorsCount: 0,
        },
      ],
      lastDetectedAt: now,
      createdAt: now,
    };
  }

  return {
    ...state,
    activeSymbol: symbol,
    activeCompositeKey: compositeKey,
    items: nextItems,
    updatedAt: now,
  };
}

/**
 * Pure function: Adds or claims a stock manually by user from Extension UI.
 * If already discovered on FireAnt, merges 'EXTENSION' into sources.
 */
export function addManualStock(
  state: StockRegistryState,
  rawSymbol: string,
  exchange = 'VN'
): StockRegistryState {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) return state;

  const now = Date.now();
  const existing = state.items[symbol];

  let updatedItem: StockRegistryItem;
  if (existing) {
    const sources = existing.sources.includes('EXTENSION')
      ? existing.sources
      : [...existing.sources, 'EXTENSION' as const];

    updatedItem = {
      ...existing,
      sources,
      lastDetectedAt: now,
    };
  } else {
    updatedItem = {
      symbol,
      exchange: exchange.toUpperCase(),
      sources: ['EXTENSION'],
      isOpened: false,
      isActive: false,
      chartContexts: [],
      lastDetectedAt: now,
      createdAt: now,
    };
  }

  return {
    ...state,
    items: {
      ...state.items,
      [symbol]: updatedItem,
    },
    updatedAt: now,
  };
}

/**
 * Pure function: Removes manual ownership of a stock.
 * Follows Source Ownership Preservation: if stock is currently opened on FireAnt,
 * it retains the record with sources=['FIREANT'].
 */
export function removeManualStock(
  state: StockRegistryState,
  rawSymbol: string
): StockRegistryState {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol || !state.items[symbol]) return state;

  const item = state.items[symbol];
  const nextSources = item.sources.filter((s) => s !== 'EXTENSION');

  const nextItems = { ...state.items };

  if (nextSources.includes('FIREANT') && item.isOpened) {
    // Retain in registry since it is open on FireAnt
    nextItems[symbol] = {
      ...item,
      sources: nextSources,
    };
  } else {
    // Completely remove from registry
    delete nextItems[symbol];
  }

  let activeSymbol = state.activeSymbol;
  let activeCompositeKey = state.activeCompositeKey;
  if (activeSymbol === symbol && !nextItems[symbol]) {
    activeSymbol = null;
    activeCompositeKey = null;
  }

  return {
    ...state,
    activeSymbol,
    activeCompositeKey,
    items: nextItems,
    updatedAt: Date.now(),
  };
}

/**
 * Pure function: Updates summary drawing & indicator counts for a chart context
 */
export function updateChartContextSummary(
  state: StockRegistryState,
  compositeKey: string,
  drawingsCount: number,
  indicatorsCount: number
): StockRegistryState {
  const parts = compositeKey.split('_');
  if (parts.length < 3 || !parts[0]) return state;
  const symbol = parts[0];
  const item = state.items[symbol];
  if (!item) return state;

  const now = Date.now();
  const nextContexts = (item.chartContexts || []).map((ctx: ChartContextSummary) => {
    if (ctx.compositeKey === compositeKey) {
      return {
        ...ctx,
        drawingsCount,
        indicatorsCount,
        lastSyncAt: now,
      };
    }
    return ctx;
  });

  return {
    ...state,
    items: {
      ...state.items,
      [symbol]: {
        ...item,
        chartContexts: nextContexts,
      },
    },
    updatedAt: now,
  };
}

/**
 * Pure function: Sets the active selected stock (for Side Panel focus)
 */
export function setActiveStock(
  state: StockRegistryState,
  rawSymbol: string | null
): StockRegistryState {
  if (!rawSymbol) {
    return {
      ...state,
      activeSymbol: null,
      activeCompositeKey: null,
      updatedAt: Date.now(),
    };
  }

  const symbol = normalizeSymbol(rawSymbol);
  const item = state.items[symbol];
  if (!item) return state;

  const defaultContext = item.chartContexts[0];
  const activeCompositeKey = defaultContext ? defaultContext.compositeKey : null;

  return {
    ...state,
    activeSymbol: symbol,
    activeCompositeKey,
    updatedAt: Date.now(),
  };
}

/**
 * Returns a prioritized list of stocks (Active first, then Opened, then alphabetical)
 */
export function getAllStocks(
  state: StockRegistryState,
  filter?: 'all' | 'opened' | 'manual'
): StockRegistryItem[] {
  let list = Object.values(state.items);

  if (filter === 'opened') {
    list = list.filter((item) => item.isOpened);
  } else if (filter === 'manual') {
    list = list.filter((item) => item.sources.includes('EXTENSION'));
  }

  return list.sort((a, b) => {
    // 1. Active chart first
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;

    // 2. Opened on FireAnt next
    if (a.isOpened && !b.isOpened) return -1;
    if (!a.isOpened && b.isOpened) return 1;

    // 3. Alphabetical by symbol
    return a.symbol.localeCompare(b.symbol);
  });
}

/**
 * Returns the currently active stock item or null
 */
export function getActiveStock(state: StockRegistryState): StockRegistryItem | null {
  if (!state.activeSymbol) return null;
  return state.items[state.activeSymbol] || null;
}
