import { z } from 'zod';

export const DrawingPointSchema = z.object({
  index: z.number().optional(),
  price: z.number(),
  time: z.number().optional(),
});

export const DrawingObjectSchema = z.object({
  id: z.string(),
  platformId: z.string().optional(),
  type: z.string(),
  name: z.string(),
  points: z.array(DrawingPointSchema),
  properties: z.record(z.string(), z.unknown()).default({}),
  style: z.record(z.string(), z.unknown()).default({}),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  updatedAt: z.number().default(() => Date.now()),
});

export const ChartInfoSchema = z.object({
  symbol: z.string().default('UNKNOWN'),
  exchange: z.string().optional(),
  timeframe: z.string().optional(),
  totalDrawings: z.number().default(0),
});

export const SyncStatusSchema = z.enum([
  'disconnected',
  'initializing',
  'syncing',
  'synced',
  'error',
]);

export const ChartSnapshotSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'),
  platform: z.literal('fireant').default('fireant'),
  chart: ChartInfoSchema,
  drawings: z.array(DrawingObjectSchema),
  sync: z.object({
    status: SyncStatusSchema,
    lastUpdated: z.number(),
    totalDrawings: z.number(),
  }),
});

export const IndicatorItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  shortName: z.string(),
  inputs: z.record(z.string(), z.unknown()).default({}),
  style: z.record(z.string(), z.unknown()).default({}),
  pane: z.object({
    type: z.enum(['main', 'separate']),
  }),
  values: z.object({
    latest: z.union([z.number(), z.record(z.string(), z.number())]).nullable().default(null),
  }).default({ latest: null }),
  metadata: z.object({
    source: z.literal('fireant').default('fireant'),
    extractionStatus: z.enum(['VERIFIED', 'PARTIALLY VERIFIED', 'NOT AVAILABLE']).default('VERIFIED'),
  }),
});

export const IndicatorsSnapshotSchema = z.object({
  totalIndicators: z.number().default(0),
  items: z.array(IndicatorItemSchema),
  timestamp: z.number().default(() => Date.now()),
});

export const WatchlistItemSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string().optional(),
  exchange: z.string().optional(),
  price: z.number().nullable().optional(),
  referencePrice: z.number().nullable().optional(),
  change: z.number().nullable().optional(),
  changePercent: z.number().nullable().optional(),
  volume: z.number().nullable().optional(),
  position: z.number().default(0),
  metadata: z.object({
    source: z.literal('fireant').default('fireant'),
    extractionStatus: z.enum(['VERIFIED', 'PARTIALLY VERIFIED']).default('VERIFIED'),
  }),
});

export const WatchlistGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean().default(false),
  displayIndex: z.number().default(0),
  totalSymbols: z.number().default(0),
  items: z.array(WatchlistItemSchema),
});

export const WatchlistSnapshotSchema = z.object({
  activeWatchlistId: z.string().default(''),
  totalWatchlists: z.number().default(0),
  watchlists: z.array(WatchlistGroupSchema),
  activeItems: z.array(WatchlistItemSchema),
  timestamp: z.number().default(() => Date.now()),
});

export const ChartContextSummarySchema = z.object({
  chartId: z.string(),
  timeframe: z.string(),
  compositeKey: z.string(),
  lastSyncAt: z.number(),
  drawingsCount: z.number().default(0),
  indicatorsCount: z.number().default(0),
});

export const StockRegistryItemSchema = z.object({
  symbol: z.string().min(1),
  exchange: z.string().optional(),
  sources: z.array(z.enum(['FIREANT', 'EXTENSION'])),
  isOpened: z.boolean().default(false),
  isActive: z.boolean().default(false),
  chartContexts: z.array(ChartContextSummarySchema).default([]),
  lastDetectedAt: z.number().default(() => Date.now()),
  createdAt: z.number().default(() => Date.now()),
});

export const StockRegistryStateSchema = z.object({
  version: z.literal('2.0').default('2.0'),
  activeSymbol: z.string().nullable().default(null),
  activeCompositeKey: z.string().nullable().default(null),
  items: z.record(z.string(), StockRegistryItemSchema).default({}),
  updatedAt: z.number().default(() => Date.now()),
});

export const ChartContextPayloadSchema = z.object({
  symbol: z.string().min(1),
  exchange: z.string().optional(),
  timeframe: z.string().default('D'),
  chartId: z.string().default('chart-0'),
  compositeKey: z.string(),
  chartsCount: z.number().optional(),
});

export const IsolatedChartSnapshotSchema = z.object({
  version: z.literal('2.0').default('2.0'),
  context: ChartContextPayloadSchema,
  compositeKey: z.string(),
  generationId: z.number().default(0),
  drawings: z.array(DrawingObjectSchema).default([]),
  indicators: z.array(IndicatorItemSchema).default([]),
  drawingsCount: z.number().default(0),
  indicatorsCount: z.number().default(0),
  extractedAt: z.number().default(() => Date.now()),
});

export const ExtensionMessageSchema = z.object({
  source: z.literal('STOCK_CHART_EXTRACTOR'),
  type: z.enum([
    'BRIDGE_INIT',
    'CHART_STATUS_UPDATE',
    'DRAWINGS_SNAPSHOT',
    'ISOLATED_CHART_SNAPSHOT',
    'DRAWING_CREATED',
    'DRAWING_UPDATED',
    'DRAWING_DELETED',
    'INDICATORS_SNAPSHOT',
    'WATCHLIST_SNAPSHOT',
    'REQUEST_SYNC',
    'REQUEST_INDICATORS_SYNC',
    'REQUEST_WATCHLIST_SYNC',
    'CHART_CONTEXT_CHANGED',
    'STOCK_REGISTRY_UPDATED',
    'ADD_MANUAL_STOCK',
    'REMOVE_MANUAL_STOCK',
    'SET_ACTIVE_STOCK',
    'REQUEST_STOCK_REGISTRY',
    'PING',
    'PONG',
  ]),
  payload: z.unknown().optional(),
  timestamp: z.number().default(() => Date.now()),
});
