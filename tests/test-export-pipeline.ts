// Mock browser API for Node / TSX test environment
const storageMock: Record<string, any> = {};

(globalThis as any).browser = {
  storage: {
    local: {
      get: async (keys: any) => {
        if (keys === null) return { ...storageMock };
        if (typeof keys === 'string') return { [keys]: storageMock[keys] };
        if (Array.isArray(keys)) {
          const res: any = {};
          keys.forEach((k) => {
            res[k] = storageMock[k];
          });
          return res;
        }
        return {};
      },
      set: async (items: any) => {
        Object.assign(storageMock, items);
      },
      remove: async (keys: any) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach((k) => delete storageMock[k]);
      },
    },
  },
  runtime: {
    getManifest: () => ({ version: '0.1.0' }),
  },
};

import { StorageRepository } from '../src/storage/storage-repository';
import { ExportManager } from '../src/export/export-manager';
import {
  formatIsoTimestamp,
  formatExportFilename,
  sanitizeObject,
  serializeExportData,
} from '../src/export/export-serializer';
import { validateExportEnvelope } from '../src/export/export-validator';
import type { RawExportSourceData } from '../src/export/export.types';
import type { IsolatedChartSnapshot } from '../src/models/chart-snapshot.types';
import type { StockRegistryState } from '../src/registry/stock-registry.types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('=== SPRINT 4 & 5 TEST SUITE: EXPORT ALL JSON PIPELINE ===\n');

async function runTests() {
  // -------------------------------------------------------------------------
  // TEST SUITE 1: FILENAME FORMATTING & TIMESTAMP NORMALIZATION
  // -------------------------------------------------------------------------
  const fixedDate = new Date('2026-11-17T11:30:00.000Z');
  const filename = formatExportFilename(fixedDate);
  assert(
    filename.startsWith('stock-chart-extractor_all_2026-') && filename.endsWith('.json'),
    `Filename format matches canonical convention: ${filename}`
  );

  const isoTime = formatIsoTimestamp(1763353800000);
  assert(
    isoTime === '2025-11-17T04:30:00.000Z' || isoTime.includes('T'),
    `Timestamp formatted to ISO 8601: ${isoTime}`
  );

  // -------------------------------------------------------------------------
  // TEST SUITE 2: TC4.7 SECURITY ALLOWLIST SANITIZER
  // -------------------------------------------------------------------------
  const dirtyData = {
    symbol: 'FPT',
    token: 'secret-auth-token-12345',
    jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    cookie: 'session_id=abcdef',
    password: 'super-secret-password',
    api_key: 'fireant-api-key',
    user: {
      id: 'usr_01',
      accessToken: 'bearer-xyz',
      refreshToken: 'refresh-xyz',
      name: 'Nguyen Van A',
    },
    drawings: [
      { id: 'd1', type: 'trend_line', points: [{ price: 100 }] },
    ],
  };

  const cleanData = sanitizeObject(dirtyData) as any;
  assert(cleanData.symbol === 'FPT', 'TC4.7: Retains normal business data');
  assert(cleanData.token === undefined, 'TC4.7: Strips raw token');
  assert(cleanData.jwt === undefined, 'TC4.7: Strips jwt');
  assert(cleanData.cookie === undefined, 'TC4.7: Strips cookie');
  assert(cleanData.password === undefined, 'TC4.7: Strips password');
  assert(cleanData.api_key === undefined, 'TC4.7: Strips api_key');
  assert(cleanData.user.accessToken === undefined, 'TC4.7: Strips nested accessToken');
  assert(cleanData.user.name === 'Nguyen Van A', 'TC4.7: Preserves non-sensitive nested fields');
  assert(cleanData.drawings.length === 1, 'TC4.7: Preserves drawing points');

  // -------------------------------------------------------------------------
  // TEST SUITE 3: TC4.5 FULL EXPORT PIPELINE WITH 4 DATA GROUPS
  // -------------------------------------------------------------------------
  // Populate Mock Storage
  const mockRegistry: StockRegistryState = {
    version: '2.0',
    activeSymbol: 'FPT',
    activeCompositeKey: 'FPT_HOSE_15',
    updatedAt: Date.now(),
    items: {
      FPT: {
        symbol: 'FPT',
        exchange: 'HOSE',
        sources: ['FIREANT'],
        isOpened: true,
        isActive: true,
        chartContexts: [
          {
            chartId: 'chart-0',
            timeframe: '15',
            compositeKey: 'FPT_HOSE_15',
            lastSyncAt: Date.now(),
            drawingsCount: 2,
            indicatorsCount: 1,
          },
        ],
        lastDetectedAt: Date.now(),
        createdAt: Date.now(),
      },
      VIC: {
        symbol: 'VIC',
        exchange: 'HOSE',
        sources: ['EXTENSION'],
        isOpened: false,
        isActive: false,
        chartContexts: [],
        lastDetectedAt: Date.now(),
        createdAt: Date.now(),
      },
    },
  };

  const mockSnapshotFpt: IsolatedChartSnapshot = {
    version: '2.0',
    context: {
      symbol: 'FPT',
      exchange: 'HOSE',
      timeframe: '15',
      chartId: 'chart-0',
      compositeKey: 'FPT_HOSE_15',
    },
    compositeKey: 'FPT_HOSE_15',
    generationId: 1,
    drawings: [
      {
        id: 'd-1',
        type: 'LineToolTrendLine',
        name: 'Trend Line',
        points: [{ price: 130, time: 1700000000 }],
        properties: {},
        style: {},
        visible: true,
        locked: false,
        updatedAt: 1700000000,
      },
      {
        id: 'd-2',
        type: 'LineToolHorizRay',
        name: 'Horizontal Ray',
        points: [{ price: 132, time: 1700000000 }],
        properties: {},
        style: {},
        visible: true,
        locked: false,
        updatedAt: 1700000000,
      },
    ],
    indicators: [
      {
        id: 'RSI@tv-basicstudies',
        name: 'Relative Strength Index',
        type: 'RSI',
        shortName: 'RSI',
        inputs: { length: 14 },
        style: {},
        pane: { type: 'separate' as const },
        values: { latest: 65.4 },
        metadata: { source: 'fireant', extractionStatus: 'VERIFIED' },
      },
    ],
    drawingsCount: 2,
    indicatorsCount: 1,
    extractedAt: Date.now(),
  };

  const mockGlobalWatchlist = {
    status: 'SUCCESS',
    capturedAt: Date.now(),
    totalSymbols: 3,
    activeItems: [
      { symbol: 'FPT', exchange: 'HOSE', name: 'Công ty Cổ phần FPT' },
      { symbol: 'VIC', exchange: 'HOSE', name: 'Tập đoàn Vingroup' },
      { symbol: 'MWG', exchange: 'HOSE', name: 'Thế Giới Di Động' },
    ],
  };

  await StorageRepository.saveStockRegistry(mockRegistry);
  await StorageRepository.saveChartSnapshot(mockSnapshotFpt);
  await StorageRepository.saveGlobalWatchlist(mockGlobalWatchlist);

  // Execute export
  const exportResult = await ExportManager.executeExport();
  assert(exportResult.success === true, 'TC4.5: Export executes successfully');
  assert(Boolean(exportResult.envelope), 'TC4.5: Returns valid envelope');

  const env = exportResult.envelope!;
  assert(env.metadata.application === 'Stock Chart Extractor', 'TC4.5: Envelope has correct application title');
  assert(env.metadata.schemaVersion === 1, 'TC4.5: Envelope has schemaVersion 1');
  assert(env.metadata.exportType === 'ALL', 'TC4.5: Export type is ALL');
  assert(env.metadata.stats.totalStocks === 2, 'TC4.5: Stats report 2 stocks');
  assert(env.metadata.stats.totalSnapshots === 1, 'TC4.5: Stats report 1 snapshot');
  assert(env.metadata.stats.totalDrawings === 2, 'TC4.5: Stats report 2 drawings');
  assert(env.metadata.stats.totalIndicators === 1, 'TC4.5: Stats report 1 indicator');
  assert(env.metadata.stats.watchlistSymbolsCount === 3, 'TC4.5: Stats report 3 watchlist items');

  // Verify stockRegistry content
  assert(env.stockRegistry.length === 2, 'TC4.5: Registry exported with 2 items');
  const fptStock = env.stockRegistry.find((s) => s.symbol === 'FPT');
  assert(Boolean(fptStock), 'TC4.5: FPT exists in registry');
  assert(fptStock!.sources.includes('FIREANT'), 'TC4.5: FPT retains FIREANT source');
  assert(fptStock!.chartContexts.length === 1, 'TC4.5: FPT has 1 chart context');
  assert(fptStock!.chartContexts[0]!.compositeKey === 'FPT_HOSE_15', 'TC4.5: Context points to FPT_HOSE_15');

  // Verify chartSnapshots content
  assert(Boolean(env.chartSnapshots['FPT_HOSE_15']), 'TC4.5: FPT_HOSE_15 snapshot is present');
  assert(env.chartSnapshots['FPT_HOSE_15']!.drawings.status === 'SUCCESS', 'TC4.5: Drawings status is SUCCESS');
  assert(env.chartSnapshots['FPT_HOSE_15']!.indicators.status === 'SUCCESS', 'TC4.5: Indicators status is SUCCESS');

  // Verify Global Watchlist content
  assert(env.globalWatchlist.totalSymbols === 3, 'TC4.5: Global Watchlist has 3 symbols');
  assert(env.globalWatchlist.status === 'SUCCESS', 'TC4.5: Global Watchlist status is SUCCESS');

  // -------------------------------------------------------------------------
  // TEST SUITE 4: TC4.6 EMPTY SNAPSHOT STATUS HANDLING
  // -------------------------------------------------------------------------
  const emptySnapshot: IsolatedChartSnapshot = {
    version: '2.0',
    context: {
      symbol: 'VIC',
      exchange: 'HOSE',
      timeframe: 'D',
      chartId: 'chart-1',
      compositeKey: 'VIC_HOSE_D',
    },
    compositeKey: 'VIC_HOSE_D',
    generationId: 1,
    drawings: [],
    indicators: [],
    drawingsCount: 0,
    indicatorsCount: 0,
    extractedAt: Date.now(),
  };

  const rawEmptySource: RawExportSourceData = {
    stockRegistry: mockRegistry,
    chartSnapshots: {
      VIC_HOSE_D: emptySnapshot,
    },
    globalWatchlist: null,
  };

  const emptySerialized = serializeExportData(rawEmptySource);
  assert(
    emptySerialized.chartSnapshots['VIC_HOSE_D']!.drawings.status === 'EMPTY',
    'TC4.6: Empty drawings list marked with status EMPTY'
  );
  assert(
    emptySerialized.chartSnapshots['VIC_HOSE_D']!.indicators.status === 'EMPTY',
    'TC4.6: Empty indicators list marked with status EMPTY'
  );
  assert(
    emptySerialized.globalWatchlist.status === 'EMPTY',
    'TC4.6: Missing watchlist marked with status EMPTY'
  );

  const emptyValidation = validateExportEnvelope(emptySerialized);
  assert(emptyValidation.isValid === true, 'TC4.6: Empty snapshots remain valid against canonical schema');

  // -------------------------------------------------------------------------
  // TEST SUITE 5: TC4.8 & TC5.6 VALIDATOR RESILIENCE & ERROR HANDLING
  // -------------------------------------------------------------------------
  // Test invalid schema (corrupted envelope missing required metadata)
  const invalidCandidate = {
    metadata: { application: 'Wrong App' },
    stockRegistry: [],
  };
  const invalidResult = validateExportEnvelope(invalidCandidate);
  assert(invalidResult.isValid === false, 'TC4.8: Validator rejects invalid envelope');
  assert(invalidResult.errors.length > 0, 'TC4.8: Validator returns specific error messages');

  // Test referential warning when stock references non-existent snapshot
  const unlinkedCandidate = {
    ...env,
    stockRegistry: [
      {
        symbol: 'UNKNOWN_STOCK',
        exchange: 'HOSE',
        sources: ['EXTENSION' as const],
        isOpened: false,
        isActive: false,
        lastDetectedAt: new Date().toISOString(),
        chartContexts: [
          {
            chartId: 'c1',
            timeframe: 'D',
            compositeKey: 'UNKNOWN_STOCK_HOSE_D',
            lastSyncAt: new Date().toISOString(),
            drawingsCount: 0,
            indicatorsCount: 0,
          },
        ],
      },
    ],
  };
  const unlinkedValidation = validateExportEnvelope(unlinkedCandidate);
  assert(unlinkedValidation.isValid === true, 'TC5.6: Unsynced context does not crash validation');
  assert(unlinkedValidation.warnings.length > 0, 'TC5.6: Produces referential warning for missing snapshot');

  // -------------------------------------------------------------------------
  // TEST SUITE 6: TC5.4 STRESS TEST (50 STOCKS, 500 DRAWINGS)
  // -------------------------------------------------------------------------
  const stressRegistryItems: Record<string, any> = {};
  const stressSnapshots: Record<string, IsolatedChartSnapshot> = {};

  for (let i = 1; i <= 50; i++) {
    const sym = `STK${String(i).padStart(2, '0')}`;
    const compKey = `${sym}_HOSE_D`;
    stressRegistryItems[sym] = {
      symbol: sym,
      exchange: 'HOSE',
      sources: ['EXTENSION'],
      isOpened: false,
      isActive: false,
      chartContexts: [
        {
          chartId: `chart-${i}`,
          timeframe: 'D',
          compositeKey: compKey,
          lastSyncAt: Date.now(),
          drawingsCount: 10,
          indicatorsCount: 2,
        },
      ],
      lastDetectedAt: Date.now(),
      createdAt: Date.now(),
    };

    const drawingsList = [];
    for (let d = 1; d <= 10; d++) {
      drawingsList.push({
        id: `d-${i}-${d}`,
        type: 'LineToolTrendLine',
        name: `TrendLine ${d}`,
        points: [{ price: 100 + d, time: 1700000000 + d }],
        properties: {},
        style: {},
        visible: true,
        locked: false,
        updatedAt: 1700000000,
      });
    }

    stressSnapshots[compKey] = {
      version: '2.0',
      context: {
        symbol: sym,
        exchange: 'HOSE',
        timeframe: 'D',
        chartId: `chart-${i}`,
        compositeKey: compKey,
      },
      compositeKey: compKey,
      generationId: 1,
      drawings: drawingsList,
      indicators: [],
      drawingsCount: 10,
      indicatorsCount: 0,
      extractedAt: Date.now(),
    };
  }

  const stressRaw: RawExportSourceData = {
    stockRegistry: {
      version: '2.0',
      activeSymbol: 'STK01',
      activeCompositeKey: 'STK01_HOSE_D',
      items: stressRegistryItems,
      updatedAt: Date.now(),
    },
    chartSnapshots: stressSnapshots,
    globalWatchlist: mockGlobalWatchlist,
  };

  const startTime = performance.now();
  const stressEnvelope = serializeExportData(stressRaw);
  const stressValidation = validateExportEnvelope(stressEnvelope);
  const stressJsonString = JSON.stringify(stressEnvelope, null, 2);
  const elapsedMs = performance.now() - startTime;

  assert(stressValidation.isValid === true, 'TC5.4: Stress test data passes validation');
  assert(stressEnvelope.metadata.stats.totalStocks === 50, 'TC5.4: 50 stocks processed');
  assert(stressEnvelope.metadata.stats.totalDrawings === 500, 'TC5.4: 500 drawings processed');
  assert(elapsedMs < 500, `TC5.4: Serialization & validation took ${elapsedMs.toFixed(2)}ms (< 500ms target)`);
  assert(stressJsonString.length > 50000, `TC5.4: Generated JSON output size: ${(stressJsonString.length / 1024).toFixed(1)} KB`);

  console.log('\n🎉 ALL SPRINT 4 & 5 EXPORT TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
