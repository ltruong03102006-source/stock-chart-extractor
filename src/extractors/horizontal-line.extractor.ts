import type { DrawingObject } from '@/src/messaging/message.types';
import { type DrawingExtractor, extractSafePoints, extractSafePropertiesAndStyle } from './base.extractor';

export class HorizontalLineExtractor implements DrawingExtractor {
  canHandle(tool: any): boolean {
    const rawName = typeof tool?.name === 'function' ? tool.name() : (tool?.toolname || '');
    const clean = String(rawName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanToolname = String(tool?.toolname || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    return (
      clean.includes('horzline') ||
      clean.includes('horizontalline') ||
      clean.includes('horzray') ||
      clean.includes('horizontalray') ||
      clean.includes('horz') ||
      clean.includes('duongnamngang') ||
      clean.includes('tianamngang') ||
      cleanToolname.includes('horzline') ||
      cleanToolname.includes('horizontalline') ||
      cleanToolname.includes('horzray') ||
      cleanToolname.includes('horz')
    );
  }

  extract(tool: any): DrawingObject {
    const id = typeof tool.id === 'function' ? String(tool.id()) : String(tool._id || `hl-${Date.now()}`);
    const rawName = typeof tool.name === 'function' ? tool.name() : 'Horizontal Line';
    const isRay = rawName.includes('Ray');
    const name = isRay ? 'Horizontal Ray' : 'Horizontal Line';
    const points = extractSafePoints(tool);
    const { properties, style, visible, locked } = extractSafePropertiesAndStyle(tool, [
      'showPrice',
      'showPriceLabels',
      'showLabel',
      'text',
    ]);

    return {
      id,
      platformId: id,
      type: isRay ? 'horizontal_ray' : 'horizontal_line',
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
