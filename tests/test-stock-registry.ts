import {
  createInitialRegistryState,
  upsertFromFireAnt,
  addManualStock,
  removeManualStock,
  setActiveStock,
  getAllStocks,
  getActiveStock,
} from '../src/registry/stock-registry';
import { StockRegistryStateSchema } from '../src/messaging/message.schemas';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('=== SPRINT 1 TEST SUITE: STOCK REGISTRY ===\n');

// TC 1.0: Initial State
let state = createInitialRegistryState();
assert(state.version === '2.0', 'TC1.0: Version is 2.0');
assert(Object.keys(state.items).length === 0, 'TC1.0: Items initially empty');
assert(state.activeSymbol === null, 'TC1.0: activeSymbol is null');

// TC 1.1: FireAnt opens FPT
state = upsertFromFireAnt(state, {
  symbol: 'FPT',
  exchange: 'HOSE',
  timeframe: '15',
  chartId: 'chart-0',
  compositeKey: 'FPT_HOSE_15',
});

assert(state.items['FPT'] !== undefined, 'TC1.1: FPT exists in registry');
assert(state.items['FPT']!.sources.includes('FIREANT'), 'TC1.1: FPT has source FIREANT');
assert(state.items['FPT']!.isOpened === true, 'TC1.1: FPT isOpened is true');
assert(state.items['FPT']!.isActive === true, 'TC1.1: FPT isActive is true');
assert(state.activeSymbol === 'FPT', 'TC1.1: activeSymbol is FPT');
assert(state.activeCompositeKey === 'FPT_HOSE_15', 'TC1.1: activeCompositeKey is FPT_HOSE_15');
assert(state.items['FPT']!.chartContexts.length === 1, 'TC1.1: FPT has 1 chartContext');

// TC 1.2: User enters VIC manually
state = addManualStock(state, 'vic', 'HOSE');
assert(state.items['VIC'] !== undefined, 'TC1.2: VIC added to registry');
assert(state.items['VIC']!.sources.includes('EXTENSION'), 'TC1.2: VIC has source EXTENSION');
assert(state.items['VIC']!.isOpened === false, 'TC1.2: VIC is not opened on FireAnt yet');
assert(state.items['VIC']!.isActive === false, 'TC1.2: VIC isActive is false');
assert(state.activeSymbol === 'FPT', 'TC1.2: FPT remains activeSymbol');

// TC 1.3: FireAnt switches to VIC (Auto-Linking)
state = upsertFromFireAnt(state, {
  symbol: 'VIC',
  exchange: 'HOSE',
  timeframe: 'D',
  chartId: 'chart-0',
  compositeKey: 'VIC_HOSE_D',
});

assert(state.items['VIC']!.sources.includes('EXTENSION'), 'TC1.3: Auto-link preserves EXTENSION source');
assert(state.items['VIC']!.sources.includes('FIREANT'), 'TC1.3: Auto-link adds FIREANT source');
assert(state.items['VIC']!.isOpened === true, 'TC1.3: VIC isOpened becomes true');
assert(state.items['VIC']!.isActive === true, 'TC1.3: VIC isActive becomes true');
assert(state.items['FPT']!.isActive === false, 'TC1.3: FPT isActive becomes false');
assert(state.activeSymbol === 'VIC', 'TC1.3: activeSymbol switched to VIC');

// TC 1.4: User removes VIC (Source Ownership Preservation)
state = removeManualStock(state, 'VIC');
assert(state.items['VIC'] !== undefined, 'TC1.4: VIC NOT deleted because it is still open on FireAnt');
assert(!state.items['VIC']!.sources.includes('EXTENSION'), 'TC1.4: EXTENSION source removed');
assert(state.items['VIC']!.sources.includes('FIREANT'), 'TC1.4: FIREANT source preserved');

// TC 1.5: User adds and removes MWG (Unopened manual stock)
state = addManualStock(state, 'MWG');
assert(state.items['MWG'] !== undefined, 'TC1.5: MWG added');
state = removeManualStock(state, 'MWG');
assert(state.items['MWG'] === undefined, 'TC1.5: MWG completely removed from registry');

// TC 1.6: Priority sorting in getAllStocks
const stocks = getAllStocks(state);
assert(stocks[0]!.symbol === 'VIC', 'TC1.6: Active stock (VIC) is first in list');
assert(stocks[1]!.symbol === 'FPT', 'TC1.6: Opened stock (FPT) is second');

// TC 1.7: Schema validation check
const validation = StockRegistryStateSchema.safeParse(state);
assert(validation.success, 'TC1.7: State strictly conforms to StockRegistryStateSchema');

console.log('\n🎉 ALL SPRINT 1 TESTS PASSED SUCCESSFULLY!');
