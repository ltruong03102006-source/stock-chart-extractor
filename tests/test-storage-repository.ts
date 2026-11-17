import { buildSnapshotStorageKey } from '../src/storage/storage-repository';
import { buildChartCompositeKey } from '../src/registry/stock-registry';
import { IsolatedChartSnapshotSchema } from '../src/messaging/message.schemas';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('=== SPRINT 2 & 3 TEST SUITE: STORAGE REPOSITORY & ISOLATED SNAPSHOT ===\n');

// TC 2.1: Composite key & Storage key formatting
const compositeKey1 = buildChartCompositeKey('fpt', '15', 'hose');
assert(compositeKey1 === 'FPT_HOSE_15', 'TC2.1: Composite key normalized: FPT_HOSE_15');
const storageKey1 = buildSnapshotStorageKey(compositeKey1);
assert(storageKey1 === 'chartSnapshots:FPT_HOSE_15', 'TC2.1: Storage partition key formatted correctly');

const compositeKey2 = buildChartCompositeKey('  vic  ', 'D');
assert(compositeKey2 === 'VIC_VN_D', 'TC2.1: Default exchange applied: VIC_VN_D');

// TC 2.2: Isolated Snapshot Schema Validation
const mockSnapshot = {
  version: '2.0' as const,
  context: {
    symbol: 'FPT',
    exchange: 'HOSE',
    timeframe: '15',
    chartId: 'chart-0',
    compositeKey: 'FPT_HOSE_15',
  },
  compositeKey: 'FPT_HOSE_15',
  generationId: 4,
  drawings: [
    {
      id: 'd-1',
      type: 'horizontal_line',
      name: 'Horizontal Line',
      points: [{ price: 125.5, time: 1700000000 }],
      properties: {},
      style: { linecolor: '#2962FF' },
      visible: true,
      locked: false,
      updatedAt: 1700000000,
    },
  ],
  indicators: [
    {
      id: 'ind-1',
      name: 'Moving Average',
      type: 'MA',
      shortName: 'MA 20',
      inputs: { length: 20 },
      style: {},
      pane: { type: 'main' as const },
      values: { latest: 124.8 },
      metadata: { source: 'fireant' as const, extractionStatus: 'VERIFIED' as const },
    },
  ],
  drawingsCount: 1,
  indicatorsCount: 1,
  extractedAt: Date.now(),
};

const validation = IsolatedChartSnapshotSchema.safeParse(mockSnapshot);
assert(validation.success, 'TC2.2: Mock IsolatedChartSnapshot validates with IsolatedChartSnapshotSchema');

// TC 2.3: Context isolation check
const mockSnapshotVic = {
  ...mockSnapshot,
  context: {
    symbol: 'VIC',
    exchange: 'HOSE',
    timeframe: 'D',
    chartId: 'chart-0',
    compositeKey: 'VIC_HOSE_D',
  },
  compositeKey: 'VIC_HOSE_D',
  generationId: 5,
};
assert(mockSnapshot.compositeKey !== mockSnapshotVic.compositeKey, 'TC2.3: FPT and VIC snapshots maintain distinct composite keys');
assert(
  buildSnapshotStorageKey(mockSnapshot.compositeKey) !== buildSnapshotStorageKey(mockSnapshotVic.compositeKey),
  'TC2.3: Storage partitions are completely isolated'
);

console.log('\n🎉 ALL SPRINT 2 & 3 TESTS PASSED SUCCESSFULLY!');
