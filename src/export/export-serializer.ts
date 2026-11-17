import type {
  ExportAllDataEnvelope,
  ExportedStockItem,
  ExportedChartSnapshot,
  ExportedWatchlist,
  ExportMetadata,
  RawExportSourceData,
  ExtractionDataStatus,
} from './export.types';

const SENSITIVE_KEY_REGEX = /^(token|jwt|cookies?|passwords?|secret|credentials?|access_?token|refresh_?token|auth_?token|api_?key)$/i;

/**
 * Normalizes any timestamp representation into a standard ISO 8601 UTC string
 */
export function formatIsoTimestamp(val: number | string | undefined | null): string {
  if (!val) {
    return new Date().toISOString();
  }
  if (typeof val === 'number') {
    return new Date(val).toISOString();
  }
  const parsed = new Date(val);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Generates the standardized export filename: stock-chart-extractor_all_YYYY-MM-DD_HH-mm-ss.json
 */
export function formatExportFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `stock-chart-extractor_all_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.json`;
}

/**
 * Recursively scrubs objects and arrays of sensitive authentication fields
 */
export function sanitizeObject<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeObject(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        continue; // Strip sensitive key
      }
      clean[key] = sanitizeObject(value);
    }
    return clean as unknown as T;
  }

  return data;
}

/**
 * Converts raw internal storage states into the canonical ExportAllDataEnvelope v1
 */
export function serializeExportData(raw: RawExportSourceData): ExportAllDataEnvelope {
  const now = new Date();
  const isoNow = now.toISOString();

  // 1. Process Stock Registry
  const rawItems = Object.values(raw.stockRegistry?.items || {});
  const stockRegistry: ExportedStockItem[] = rawItems.map((item) => {
    return {
      symbol: item.symbol,
      exchange: item.exchange || null,
      sources: [...item.sources],
      isOpened: Boolean(item.isOpened),
      isActive: Boolean(item.isActive),
      lastDetectedAt: formatIsoTimestamp(item.lastDetectedAt),
      chartContexts: (item.chartContexts || []).map((ctx) => ({
        chartId: ctx.chartId || 'chart-0',
        timeframe: ctx.timeframe || 'D',
        compositeKey: ctx.compositeKey || `${item.symbol}_${item.exchange || 'VN'}_${ctx.timeframe || 'D'}`,
        lastSyncAt: formatIsoTimestamp(ctx.lastSyncAt),
        drawingsCount: ctx.drawingsCount ?? 0,
        indicatorsCount: ctx.indicatorsCount ?? 0,
      })),
    };
  });

  // 2. Process Isolated Chart Snapshots
  const chartSnapshots: Record<string, ExportedChartSnapshot> = {};
  let totalDrawings = 0;
  let totalIndicators = 0;

  for (const [compositeKey, snap] of Object.entries(raw.chartSnapshots || {})) {
    if (!snap) continue;
    const drawingsList = Array.isArray(snap.drawings) ? snap.drawings : [];
    const indicatorsList = Array.isArray(snap.indicators) ? snap.indicators : [];

    const drawingsStatus: ExtractionDataStatus =
      drawingsList.length > 0 ? 'SUCCESS' : 'EMPTY';
    const indicatorsStatus: ExtractionDataStatus =
      indicatorsList.length > 0 ? 'SUCCESS' : 'EMPTY';

    totalDrawings += drawingsList.length;
    totalIndicators += indicatorsList.length;

    chartSnapshots[compositeKey] = {
      compositeKey,
      symbol: snap.context?.symbol || compositeKey.split('_')[0] || 'UNKNOWN',
      exchange: snap.context?.exchange || compositeKey.split('_')[1] || 'VN',
      timeframe: snap.context?.timeframe || compositeKey.split('_')[2] || 'D',
      capturedAt: formatIsoTimestamp(snap.extractedAt),
      drawings: {
        status: drawingsStatus,
        count: drawingsList.length,
        items: sanitizeObject(drawingsList),
      },
      indicators: {
        status: indicatorsStatus,
        count: indicatorsList.length,
        items: sanitizeObject(indicatorsList),
      },
    };
  }

  // 3. Process Decoupled Global Watchlist
  const rawWatchlist = raw.globalWatchlist;
  let watchlistStatus: ExtractionDataStatus = 'EMPTY';
  let activeItems: any[] = [];

  if (rawWatchlist) {
    if (Array.isArray(rawWatchlist.activeItems)) {
      activeItems = rawWatchlist.activeItems;
    } else if (Array.isArray(rawWatchlist.items)) {
      activeItems = rawWatchlist.items;
    } else if (Array.isArray(rawWatchlist.symbols)) {
      activeItems = rawWatchlist.symbols.map((s: string) => ({ symbol: s }));
    }
    watchlistStatus = activeItems.length > 0 ? 'SUCCESS' : 'EMPTY';
  }

  const globalWatchlist: ExportedWatchlist = {
    status: watchlistStatus,
    capturedAt: formatIsoTimestamp(rawWatchlist?.sync?.lastUpdated || rawWatchlist?.capturedAt),
    totalSymbols: activeItems.length,
    activeItems: sanitizeObject(activeItems),
  };

  // 4. Construct Metadata
  const metadata: ExportMetadata = {
    application: 'Stock Chart Extractor',
    exportType: 'ALL',
    schemaVersion: 1,
    exportedAt: isoNow,
    extensionVersion: raw.extensionVersion || '0.1.0',
    environment: {
      browser: 'Chrome',
      manifestVersion: 3,
      storageKeysCount: raw.storageKeysCount ?? (1 + Object.keys(chartSnapshots).length + (rawWatchlist ? 1 : 0)),
    },
    stats: {
      totalStocks: stockRegistry.length,
      totalSnapshots: Object.keys(chartSnapshots).length,
      totalDrawings,
      totalIndicators,
      watchlistSymbolsCount: globalWatchlist.totalSymbols,
    },
  };

  return {
    metadata,
    stockRegistry,
    chartSnapshots,
    globalWatchlist,
  };
}
