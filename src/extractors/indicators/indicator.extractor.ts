import type { IndicatorItem, IndicatorsSnapshot } from './indicator.types';

/**
 * Extracts a single indicator/study from TradingView Study object
 */
export function extractIndicator(study: any): IndicatorItem {
  const id = typeof study.id === 'function' ? String(study.id()) : String(study._id || `ind-${Date.now()}`);
  
  let metaInfo: any = null;
  try {
    metaInfo = typeof study.metaInfo === 'function' ? study.metaInfo() : study._metaInfo;
  } catch {}

  const rawTitle = typeof study.title === 'function' ? study.title() : (study.name?.() || metaInfo?.description || 'Unknown Indicator');
  const name = String(rawTitle);

  // Extract short name and type
  const shortName = metaInfo?.shortDescription || metaInfo?.shortId || name.split(' - ')[0] || name;
  const type = (metaInfo?.id || metaInfo?.name || shortName).replace(/[^a-zA-Z0-9]/g, '_');

  // Extract inputs
  let inputs: Record<string, unknown> = {};
  try {
    const props = typeof study.properties === 'function' ? study.properties() : study._properties;
    if (props?.inputs) {
      const raw = typeof props.inputs.state === 'function' ? props.inputs.state() : props.inputs;
      if (raw && typeof raw === 'object') {
        inputs = JSON.parse(JSON.stringify(raw));
      }
    }
  } catch (err) {
    console.warn('[Stock Chart Extractor] Failed to extract indicator inputs:', err);
  }

  // Extract styles
  let style: Record<string, unknown> = {};
  try {
    const props = typeof study.properties === 'function' ? study.properties() : study._properties;
    if (props?.styles) {
      const raw = typeof props.styles.state === 'function' ? props.styles.state() : props.styles;
      if (raw && typeof raw === 'object') {
        style = JSON.parse(JSON.stringify(raw));
      }
    }
  } catch (err) {
    console.warn('[Stock Chart Extractor] Failed to extract indicator styles:', err);
  }

  // Extract pane configuration
  let isPriceStudy = false;
  try {
    isPriceStudy = typeof study.isPriceStudy === 'function' ? study.isPriceStudy() : Boolean(metaInfo?.is_price_study);
  } catch {}

  const pane: { type: 'main' | 'separate' } = {
    type: isPriceStudy ? 'main' : 'separate',
  };

  // Extract latest value if accessible
  let latestValue: number | Record<string, number> | null = null;
  try {
    if (typeof study.data === 'function') {
      const d = study.data();
      if (d) {
        if (typeof d.last === 'function') {
          const l = d.last();
          if (typeof l === 'number') latestValue = l;
        } else if (typeof d.valueAt === 'function' && typeof d.size === 'function') {
          const size = d.size();
          if (size > 0) {
            const l = d.valueAt(size - 1);
            if (typeof l === 'number') latestValue = l;
          }
        }
      }
    }
  } catch {}

  return {
    id,
    name,
    type,
    shortName,
    inputs,
    style,
    pane,
    values: {
      latest: latestValue,
    },
    metadata: {
      source: 'fireant',
      extractionStatus: 'VERIFIED',
    },
  };
}

/**
 * Extracts all indicators from a TradingView Chart Model
 */
export function extractAllIndicators(model: any): IndicatorsSnapshot {
  const items: IndicatorItem[] = [];
  if (!model) {
    return { totalIndicators: 0, items: [], timestamp: Date.now() };
  }

  try {
    let rawStudies: any[] = [];
    if (typeof model.allStudies === 'function') {
      rawStudies = model.allStudies() || [];
    } else if (typeof model.panes === 'function') {
      const panes = model.panes() || [];
      panes.forEach((pane: any) => {
        const sources = typeof pane.sources === 'function' ? pane.sources() : (pane._sources || []);
        sources.forEach((src: any) => {
          if (src && (src.metaInfo || src._metaInfo || src.isPriceStudy)) {
            rawStudies.push(src);
          }
        });
      });
    }

    for (const study of rawStudies) {
      if (!study) continue;
      items.push(extractIndicator(study));
    }
  } catch (err) {
    console.error('[Stock Chart Extractor] Error extracting all indicators:', err);
  }

  return {
    totalIndicators: items.length,
    items,
    timestamp: Date.now(),
  };
}
