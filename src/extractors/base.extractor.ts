import type { DrawingObject, DrawingPoint } from '@/src/messaging/message.types';

export interface DrawingExtractor {
  canHandle(tool: any): boolean;
  extract(tool: any): DrawingObject;
}

/**
 * Universal point extractor handling single-point, two-point, and multi-point tools.
 * Safely converts Date objects to Unix epoch ms.
 */
export function extractSafePoints(tool: any): DrawingPoint[] {
  const points: DrawingPoint[] = [];
  try {
    let rawList: any[] = [];

    // 1. Try tool.points()
    if (typeof tool.points === 'function') {
      const res = tool.points();
      if (Array.isArray(res) && res.length > 0) {
        rawList = res;
      }
    }

    // 2. Try tool.getPoint(i) with tool.pointsCount()
    if (rawList.length === 0 && typeof tool.getPoint === 'function') {
      const count = typeof tool.pointsCount === 'function' ? tool.pointsCount() : 10;
      for (let i = 0; i < count; i++) {
        const pt = tool.getPoint(i);
        if (pt) {
          rawList.push(pt);
        } else {
          break;
        }
      }
    }

    // 3. Fallback to tool._points
    if (rawList.length === 0 && Array.isArray(tool._points) && tool._points.length > 0) {
      rawList = tool._points;
    }

    // Normalize each point
    for (const pt of rawList) {
      if (!pt || typeof pt !== 'object') continue;

      let timeMs: number | undefined;
      if (typeof pt.time?.getTime === 'function') {
        timeMs = pt.time.getTime();
      } else if (typeof pt.time === 'number') {
        timeMs = pt.time;
      } else if (pt.time) {
        const parsed = new Date(pt.time).getTime();
        if (!isNaN(parsed)) timeMs = parsed;
      }

      points.push({
        index: typeof pt.index === 'number' ? pt.index : undefined,
        price: typeof pt.price === 'number' ? pt.price : Number(pt.price) || 0,
        time: timeMs,
      });
    }
  } catch (err) {
    console.warn('[Stock Chart Extractor] Failed to extract points:', err);
  }
  return points;
}

/**
 * Safely unpacks primitive values from TradingView property objects.
 */
export function unwrapPropertyValue(val: any): unknown {
  if (val === null || val === undefined) return undefined;
  if (typeof val?.value === 'function') return val.value();
  if (typeof val === 'function') return undefined;
  return val;
}

/**
 * Extract properties and style safely avoiding circular reference errors.
 */
export function extractSafePropertiesAndStyle(
  tool: any,
  styleKeys: string[] = []
): { properties: Record<string, unknown>; style: Record<string, unknown>; visible: boolean; locked: boolean } {
  const properties: Record<string, unknown> = {};
  const style: Record<string, unknown> = {};
  let visible = true;
  let locked = false;

  try {
    const p = typeof tool.properties === 'function' ? tool.properties() : tool._properties;
    if (p) {
      if (typeof p.state === 'function') {
        try {
          const rawState = p.state();
          if (rawState && typeof rawState === 'object') {
            Object.assign(properties, rawState);
          }
        } catch {
          // ignore state error
        }
      }

      // Check visibility & lock
      if (p.visible !== undefined) {
        visible = Boolean(unwrapPropertyValue(p.visible));
      }
      if (p.frozen !== undefined) {
        locked = Boolean(unwrapPropertyValue(p.frozen));
      }

      const allStyleKeys = [
        'linecolor', 'color', 'linewidth', 'width', 'linestyle',
        'transparency', 'fillBackground', 'backgroundColor',
        'extendLeft', 'extendRight', 'leftEnd', 'rightEnd',
        'text', 'fontsize', 'bold', 'italic', 'showLabel',
        ...styleKeys,
      ];

      for (const key of allStyleKeys) {
        if (p[key] !== undefined) {
          const unwrapped = unwrapPropertyValue(p[key]);
          if (unwrapped !== undefined) {
            style[key] = unwrapped;
          }
        }
      }
    }

    if (typeof tool.isLocked === 'function') {
      locked = tool.isLocked();
    }
  } catch (err) {
    console.warn('[Stock Chart Extractor] Failed to extract properties/style:', err);
  }

  return { properties, style, visible, locked };
}
