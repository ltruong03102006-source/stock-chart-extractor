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

export const ExtensionMessageSchema = z.object({
  source: z.literal('STOCK_CHART_EXTRACTOR'),
  type: z.enum([
    'BRIDGE_INIT',
    'CHART_STATUS_UPDATE',
    'DRAWINGS_SNAPSHOT',
    'DRAWING_CREATED',
    'DRAWING_UPDATED',
    'DRAWING_DELETED',
    'REQUEST_SYNC',
    'PING',
    'PONG',
  ]),
  payload: z.unknown().optional(),
  timestamp: z.number().default(() => Date.now()),
});
