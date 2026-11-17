import { z } from 'zod';
import {
  DrawingPointSchema,
  DrawingObjectSchema,
  ChartInfoSchema,
  SyncStatusSchema,
  ChartSnapshotSchema,
  ExtensionMessageSchema,
  IndicatorItemSchema,
  IndicatorsSnapshotSchema,
  WatchlistItemSchema,
  WatchlistGroupSchema,
  WatchlistSnapshotSchema,
  ChartContextSummarySchema,
  StockRegistryItemSchema,
  StockRegistryStateSchema,
  ChartContextPayloadSchema,
  IsolatedChartSnapshotSchema,
} from './message.schemas';

export type DrawingPoint = z.infer<typeof DrawingPointSchema>;
export type DrawingObject = z.infer<typeof DrawingObjectSchema>;
export type ChartInfo = z.infer<typeof ChartInfoSchema>;
export type SyncStatus = z.infer<typeof SyncStatusSchema>;
export type ChartSnapshot = z.infer<typeof ChartSnapshotSchema>;
export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;

export type IndicatorItem = z.infer<typeof IndicatorItemSchema>;
export type IndicatorsSnapshot = z.infer<typeof IndicatorsSnapshotSchema>;
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>;
export type WatchlistGroup = z.infer<typeof WatchlistGroupSchema>;
export type WatchlistSnapshot = z.infer<typeof WatchlistSnapshotSchema>;

export type ChartContextSummary = z.infer<typeof ChartContextSummarySchema>;
export type StockRegistryItem = z.infer<typeof StockRegistryItemSchema>;
export type StockRegistryState = z.infer<typeof StockRegistryStateSchema>;
export type ChartContextPayload = z.infer<typeof ChartContextPayloadSchema>;
export type IsolatedChartSnapshot = z.infer<typeof IsolatedChartSnapshotSchema>;

export const EXTENSION_SOURCE = 'STOCK_CHART_EXTRACTOR' as const;
