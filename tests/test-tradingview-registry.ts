import {
  createInitialRegistryState,
  upsertFromFireAnt,
  upsertFromTradingView,
  addManualStock,
  removeManualStock,
  getAllStocks,
  getActiveStock,
} from '../src/registry/stock-registry';
import { StockRegistryStateSchema } from '../src/messaging/message.schemas';
import { ExportedStockItemSchema } from '../src/export/export.types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('=== TRADINGVIEW INTEGRATION TEST SUITE: MULTI-PLATFORM REGISTRY ===\n');

// 1. Initial State
let state = createInitialRegistryState();
assert(state.version === '2.0', 'TV1.0: Registry version is 2.0');
assert(Object.keys(state.items).length === 0, 'TV1.0: Empty initial state');

// 2. Discovered AAPL on TradingView
state = upsertFromTradingView(state, {
  symbol: 'AAPL',
  exchange: 'NASDAQ',
  timeframe: '1D',
  chartId: 'tv-layout-001',
  compositeKey: 'AAPL_NASDAQ_1D',
  platform: 'tradingview',
});

assert(state.items['AAPL'] !== undefined, 'TV1.1: AAPL exists in registry');
assert(state.items['AAPL']!.sources.includes('TRADINGVIEW'), 'TV1.1: AAPL has TRADINGVIEW source');
assert(state.items['AAPL']!.platform === 'tradingview', 'TV1.1: Platform is tradingview');
assert(state.items['AAPL']!.isOpened === true, 'TV1.1: AAPL isOpened is true');
assert(state.items['AAPL']!.isActive === true, 'TV1.1: AAPL isActive is true');
assert(state.activeSymbol === 'AAPL', 'TV1.1: activeSymbol is AAPL');
assert(state.activeCompositeKey === 'AAPL_NASDAQ_1D', 'TV1.1: activeCompositeKey is AAPL_NASDAQ_1D');

// 3. Multi-Platform Coexistence: FireAnt opens FPT
state = upsertFromFireAnt(state, {
  symbol: 'FPT',
  exchange: 'HOSE',
  timeframe: '15',
  chartId: 'fa-chart-0',
  compositeKey: 'FPT_HOSE_15',
  platform: 'fireant',
});

assert(state.items['FPT'] !== undefined, 'TV1.2: FPT exists in registry');
assert(state.items['FPT']!.sources.includes('FIREANT'), 'TV1.2: FPT has FIREANT source');
assert(state.items['FPT']!.platform === 'fireant', 'TV1.2: Platform is fireant');
assert(state.items['FPT']!.isActive === true, 'TV1.2: FPT is now active');
assert(state.items['AAPL']!.isActive === false, 'TV1.2: AAPL is no longer active, but remains opened');
assert(state.items['AAPL']!.isOpened === true, 'TV1.2: AAPL remains opened');
assert(state.activeSymbol === 'FPT', 'TV1.2: Active symbol switched to FPT');

// 4. Auto-Linking on TradingView: Manual TSLA claimed by TradingView
state = addManualStock(state, 'tsla', 'NASDAQ');
assert(state.items['TSLA'] !== undefined, 'TV1.3: TSLA added manually');
assert(state.items['TSLA']!.sources.includes('EXTENSION'), 'TV1.3: TSLA has EXTENSION source');
assert(state.items['TSLA']!.isOpened === false, 'TV1.3: TSLA not opened yet');

// Now TradingView opens TSLA
state = upsertFromTradingView(state, {
  symbol: 'TSLA',
  exchange: 'NASDAQ',
  timeframe: '4H',
  chartId: 'tv-layout-tsla',
  compositeKey: 'TSLA_NASDAQ_4H',
  platform: 'tradingview',
});

assert(state.items['TSLA']!.sources.includes('EXTENSION'), 'TV1.4: Auto-link preserves EXTENSION source');
assert(state.items['TSLA']!.sources.includes('TRADINGVIEW'), 'TV1.4: Auto-link adds TRADINGVIEW source');
assert(state.items['TSLA']!.isOpened === true, 'TV1.4: TSLA isOpened becomes true');
assert(state.items['TSLA']!.isActive === true, 'TV1.4: TSLA isActive becomes true');

// 5. Source Ownership Protection on TradingView
state = removeManualStock(state, 'TSLA');
assert(state.items['TSLA'] !== undefined, 'TV1.5: TSLA NOT deleted because opened on TradingView');
assert(!state.items['TSLA']!.sources.includes('EXTENSION'), 'TV1.5: EXTENSION source removed');
assert(state.items['TSLA']!.sources.includes('TRADINGVIEW'), 'TV1.5: TRADINGVIEW source preserved');

// 6. Schema Validation
const parsedState = StockRegistryStateSchema.safeParse(state);
assert(parsedState.success, 'TV1.6: State conforms strictly to StockRegistryStateSchema');

// 7. Export Schema Validation for TradingView Stocks
const exportedAapl = {
  symbol: state.items['AAPL']!.symbol,
  exchange: state.items['AAPL']!.exchange || null,
  sources: state.items['AAPL']!.sources,
  isOpened: state.items['AAPL']!.isOpened,
  isActive: state.items['AAPL']!.isActive,
  lastDetectedAt: new Date(state.items['AAPL']!.lastDetectedAt).toISOString(),
  chartContexts: state.items['AAPL']!.chartContexts.map(c => ({
    chartId: c.chartId,
    timeframe: c.timeframe,
    compositeKey: c.compositeKey,
    lastSyncAt: new Date(c.lastSyncAt).toISOString(),
    drawingsCount: c.drawingsCount,
    indicatorsCount: c.indicatorsCount,
  })),
};
const parsedExport = ExportedStockItemSchema.safeParse(exportedAapl);
assert(parsedExport.success, 'TV1.7: TradingView stock conforms to ExportedStockItemSchema');

// 8. Sorting Priority
const allSorted = getAllStocks(state);
assert(allSorted[0]!.symbol === 'TSLA', 'TV1.8: Active stock (TSLA) is first');
assert(allSorted.length === 3, 'TV1.8: Total 3 stocks in registry (TSLA, AAPL, FPT)');

// 9. Short Symbol Support for TradingView (1 & 2 letter US tickers)
state = upsertFromTradingView(state, {
  symbol: 'F',
  exchange: 'NYSE',
  timeframe: '1D',
  chartId: 'tv-layout-ford',
  compositeKey: 'F_NYSE_1D',
  platform: 'tradingview',
});
assert(state.items['F'] !== undefined, 'TV1.9: Single-letter symbol F (Ford) is supported');
assert(state.activeSymbol === 'F', 'TV1.9: Active symbol switched to F');
assert(state.items['F']!.isActive === true, 'TV1.9: F is active');
assert(state.items['TSLA']!.isActive === false, 'TV1.9: TSLA deactivated');

state = upsertFromTradingView(state, {
  symbol: 'BA',
  exchange: 'NYSE',
  timeframe: '1D',
  chartId: 'tv-layout-boeing',
  compositeKey: 'BA_NYSE_1D',
  platform: 'tradingview',
});
assert(state.items['BA'] !== undefined, 'TV1.10: Two-letter symbol BA (Boeing) is supported');
assert(state.activeSymbol === 'BA', 'TV1.10: Active symbol switched to BA');

// 10. Bidirectional Cross-Platform Switching (TV -> FireAnt -> TV)
// Switch back to FireAnt FPT
state = upsertFromFireAnt(state, {
  symbol: 'FPT',
  exchange: 'HOSE',
  timeframe: '1D',
  chartId: 'fa-chart-0',
  compositeKey: 'FPT_HOSE_1D',
  platform: 'fireant',
});
assert(state.activeSymbol === 'FPT', 'TV1.11: Switched back to FireAnt FPT');
assert(state.items['FPT']!.isActive === true, 'TV1.11: FPT is active');
assert(state.items['BA']!.isActive === false, 'TV1.11: BA deactivated');
assert(state.items['BA']!.isOpened === true, 'TV1.11: BA remains opened');
assert(state.items['FPT']!.platform === 'fireant', 'TV1.11: FPT platform is fireant');
assert(state.items['BA']!.platform === 'tradingview', 'TV1.11: BA platform is tradingview');

// Switch back to TradingView BA
state = upsertFromTradingView(state, {
  symbol: 'BA',
  exchange: 'NYSE',
  timeframe: '1D',
  chartId: 'tv-layout-boeing',
  compositeKey: 'BA_NYSE_1D',
  platform: 'tradingview',
});
assert(state.activeSymbol === 'BA', 'TV1.12: Switched back to TradingView BA');
assert(state.items['BA']!.isActive === true, 'TV1.12: BA is active');
assert(state.items['FPT']!.isActive === false, 'TV1.12: FPT deactivated');
assert(state.items['FPT']!.isOpened === true, 'TV1.12: FPT remains opened');

console.log('\n🎉 ALL TRADINGVIEW INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
