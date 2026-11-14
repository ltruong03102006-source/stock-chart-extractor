import type { DrawingObject } from '@/src/messaging/message.types';
import { type DrawingExtractor, extractSafePoints, extractSafePropertiesAndStyle } from './base.extractor';

export class FallbackExtractor implements DrawingExtractor {
  canHandle(): boolean {
    return true; // Handles everything not caught by specialized extractors
  }

  extract(tool: any): DrawingObject {
    const id = typeof tool.id === 'function' ? String(tool.id()) : String(tool._id || `tool-${Date.now()}`);
    const name = typeof tool.name === 'function' ? String(tool.name()) : String(tool.toolname || tool?.constructor?.name || 'Unknown');
    const normalizedType = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
    const points = extractSafePoints(tool);
    const { properties, style, visible, locked } = extractSafePropertiesAndStyle(tool);

    return {
      id,
      platformId: id,
      type: normalizedType,
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
