import type { DrawingObject } from '@/src/messaging/message.types';
import { type DrawingExtractor, extractSafePoints, extractSafePropertiesAndStyle } from './base.extractor';

export class TrendLineExtractor implements DrawingExtractor {
  canHandle(tool: any): boolean {
    const rawName = typeof tool?.name === 'function' ? tool.name() : (tool?.toolname || '');
    const clean = String(rawName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanToolname = String(tool?.toolname || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    return (
      clean.includes('trendline') ||
      clean.includes('duongxuhuong') ||
      cleanToolname.includes('trendline')
    );
  }

  extract(tool: any): DrawingObject {
    const id = typeof tool.id === 'function' ? String(tool.id()) : String(tool._id || `tl-${Date.now()}`);
    const name = 'Trend Line';
    const points = extractSafePoints(tool);
    const { properties, style, visible, locked } = extractSafePropertiesAndStyle(tool, [
      'extendLeft',
      'extendRight',
      'leftEnd',
      'rightEnd',
      'showPriceLabels',
    ]);

    return {
      id,
      platformId: id,
      type: 'trend_line',
      name,
      points,
      properties,
      style,
      visible,
      locked,
      updatedAt: Date.now(),
    };
  }
}
