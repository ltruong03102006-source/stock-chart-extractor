import { z } from 'zod';
import {
  DrawingPointSchema,
  DrawingObjectSchema,
  ChartInfoSchema,
  SyncStatusSchema,
  ChartSnapshotSchema,
  ExtensionMessageSchema,
} from './message.schemas';

export type DrawingPoint = z.infer<typeof DrawingPointSchema>;
export type DrawingObject = z.infer<typeof DrawingObjectSchema>;
export type ChartInfo = z.infer<typeof ChartInfoSchema>;
export type SyncStatus = z.infer<typeof SyncStatusSchema>;
export type ChartSnapshot = z.infer<typeof ChartSnapshotSchema>;
export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;

export const EXTENSION_SOURCE = 'STOCK_CHART_EXTRACTOR' as const;
