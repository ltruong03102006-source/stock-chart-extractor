import type { DrawingObject } from '@/src/messaging/message.types';
import { type DrawingExtractor } from './base.extractor';
import { TrendLineExtractor } from './trend-line.extractor';
import { HorizontalLineExtractor } from './horizontal-line.extractor';
import { RectangleExtractor } from './rectangle.extractor';
import { FallbackExtractor } from './fallback.extractor';

export class ExtractorFactory {
  private static extractors: DrawingExtractor[] = [
    new TrendLineExtractor(),
    new HorizontalLineExtractor(),
    new RectangleExtractor(),
    new FallbackExtractor(),
  ];

  public static getExtractor(tool: any): DrawingExtractor {
    for (const extractor of this.extractors) {
      if (extractor.canHandle(tool)) {
        return extractor;
      }
    }
    return new FallbackExtractor();
  }

  public static extract(tool: any): DrawingObject {
    const extractor = this.getExtractor(tool);
    return extractor.extract(tool);
  }
}

export function extractDrawing(tool: any): DrawingObject {
  return ExtractorFactory.extract(tool);
}
