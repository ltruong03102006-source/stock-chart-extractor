import { z } from 'zod';
import type { StockSource } from '@/src/registry/stock-registry.types';
import type { IsolatedChartSnapshot } from '@/src/models/chart-snapshot.types';
import type { StockRegistryState } from '@/src/registry/stock-registry.types';

export type ExtractionDataStatus =
  | 'SUCCESS'
  | 'EMPTY'
  | 'FAILED'
  | 'NOT_INVESTIGATED'
  | 'NOT_ACCESSIBLE';

export const ExtractionDataStatusSchema = z.enum([
  'SUCCESS',
  'EMPTY',
  'FAILED',
  'NOT_INVESTIGATED',
  'NOT_ACCESSIBLE',
]);

export interface ExportMetadata {
  application: 'Stock Chart Extractor';
  exportType: 'ALL';
  schemaVersion: 1;
  exportedAt: string; // ISO 8601 UTC
  extensionVersion: string;
  environment: {
    browser: string;
    manifestVersion: 3;
    storageKeysCount: number;
  };
  stats: {
    totalStocks: number;
    totalSnapshots: number;
    totalDrawings: number;
    totalIndicators: number;
    watchlistSymbolsCount: number;
  };
}

export const ExportMetadataSchema = z.object({
  application: z.literal('Stock Chart Extractor'),
  exportType: z.literal('ALL'),
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime({ offset: true }),
  extensionVersion: z.string(),
  environment: z.object({
    browser: z.string(),
    manifestVersion: z.literal(3),
    storageKeysCount: z.number().int().nonnegative(),
  }),
  stats: z.object({
    totalStocks: z.number().int().nonnegative(),
    totalSnapshots: z.number().int().nonnegative(),
    totalDrawings: z.number().int().nonnegative(),
    totalIndicators: z.number().int().nonnegative(),
    watchlistSymbolsCount: z.number().int().nonnegative(),
  }),
});

export interface ExportedChartContextRef {
  chartId: string;
  timeframe: string;
  compositeKey: string;
  lastSyncAt: string; // ISO 8601
  drawingsCount: number;
  indicatorsCount: number;
}

export const ExportedChartContextRefSchema = z.object({
  chartId: z.string(),
  timeframe: z.string(),
  compositeKey: z.string(),
  lastSyncAt: z.string(),
  drawingsCount: z.number().int().nonnegative(),
  indicatorsCount: z.number().int().nonnegative(),
});

export interface ExportedStockItem {
  symbol: string;
  exchange: string | null;
  sources: StockSource[];
  isOpened: boolean;
  isActive: boolean;
  lastDetectedAt: string; // ISO 8601
  chartContexts: ExportedChartContextRef[];
}

export const ExportedStockItemSchema = z.object({
  symbol: z.string().min(1),
  exchange: z.string().nullable(),
  sources: z.array(z.enum(['FIREANT', 'TRADINGVIEW', 'EXTENSION'])).min(1),
  isOpened: z.boolean(),
  isActive: z.boolean(),
  lastDetectedAt: z.string(),
  chartContexts: z.array(ExportedChartContextRefSchema),
});

export interface ExportedChartSnapshot {
  compositeKey: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  capturedAt: string; // ISO 8601
  drawings: {
    status: ExtractionDataStatus;
    count: number;
    items: unknown[];
  };
  indicators: {
    status: ExtractionDataStatus;
    count: number;
    items: unknown[];
  };
}

export const ExportedChartSnapshotSchema = z.object({
  compositeKey: z.string(),
  symbol: z.string(),
  exchange: z.string(),
  timeframe: z.string(),
  capturedAt: z.string(),
  drawings: z.object({
    status: ExtractionDataStatusSchema,
    count: z.number().int().nonnegative(),
    items: z.array(z.unknown()),
  }),
  indicators: z.object({
    status: ExtractionDataStatusSchema,
    count: z.number().int().nonnegative(),
    items: z.array(z.unknown()),
  }),
});

export interface ExportedWatchlistItem {
  symbol: string;
  exchange?: string;
  name?: string;
  [key: string]: unknown;
}

export interface ExportedWatchlist {
  status: ExtractionDataStatus;
  capturedAt: string; // ISO 8601
  totalSymbols: number;
  activeItems: ExportedWatchlistItem[];
}

export const ExportedWatchlistSchema = z.object({
  status: ExtractionDataStatusSchema,
  capturedAt: z.string(),
  totalSymbols: z.number().int().nonnegative(),
  activeItems: z.array(
    z.object({
      symbol: z.string(),
      exchange: z.string().optional(),
      name: z.string().optional(),
    }).passthrough()
  ),
});

export interface ExportAllDataEnvelope {
  metadata: ExportMetadata;
  stockRegistry: ExportedStockItem[];
  chartSnapshots: Record<string, ExportedChartSnapshot>;
  globalWatchlist: ExportedWatchlist;
}

export const ExportAllDataEnvelopeSchema = z.object({
  metadata: ExportMetadataSchema,
  stockRegistry: z.array(ExportedStockItemSchema),
  chartSnapshots: z.record(z.string(), ExportedChartSnapshotSchema),
  globalWatchlist: ExportedWatchlistSchema,
});

export interface RawExportSourceData {
  stockRegistry: StockRegistryState;
  chartSnapshots: Record<string, IsolatedChartSnapshot>;
  globalWatchlist: any | null;
  storageKeysCount?: number;
  extensionVersion?: string;
}
