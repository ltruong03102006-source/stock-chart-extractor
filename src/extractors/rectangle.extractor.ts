import type { DrawingObject } from '@/src/messaging/message.types';
import { type DrawingExtractor, extractSafePoints, extractSafePropertiesAndStyle } from './base.extractor';

export class RectangleExtractor implements DrawingExtractor {
  canHandle(tool: any): boolean {
    const rawName = typeof tool?.name === 'function' ? tool.name() : (tool?.toolname || '');
    const clean = String(rawName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanToolname = String(tool?.toolname || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    return (
      clean.includes('rectangle') ||
      clean.includes('rotatedrectangle') ||
      clean.includes('hinhchunhat') ||
      clean.includes('box') ||
      cleanToolname.includes('rectangle') ||
      cleanToolname.includes('box')
    );
  }

  extract(tool: any): DrawingObject {
    const id = typeof tool.id === 'function' ? String(tool.id()) : String(tool._id || `rect-${Date.now()}`);
    const rawName = typeof tool.name === 'function' ? tool.name() : 'Rectangle';
    const isRotated = rawName.includes('Rotated');
    const name = isRotated ? 'Rotated Rectangle' : 'Rectangle';
    const points = extractSafePoints(tool);
    const { properties, style, visible, locked } = extractSafePropertiesAndStyle(tool, [
      'fillBackground',
      'backgroundColor',
      'transparency',
      'extendLeft',
      'extendRight',
    ]);

    return {
      id,
      platformId: id,
      type: isRotated ? 'rotated_rectangle' : 'rectangle',
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
