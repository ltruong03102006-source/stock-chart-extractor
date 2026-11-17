import type { DrawingObject, IndicatorItem } from '@/src/messaging/message.types';
import type { ChartContextPayload } from '@/src/registry/stock-registry.types';

export interface ChartContextId extends ChartContextPayload {}

export interface IsolatedChartSnapshot {
  version: '2.0';
  context: ChartContextId;
  compositeKey: string;
  generationId: number;
  drawings: DrawingObject[];
  indicators: IndicatorItem[];
  drawingsCount: number;
  indicatorsCount: number;
  extractedAt: number;
}
