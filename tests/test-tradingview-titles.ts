import { normalizeSymbol } from '../src/registry/stock-registry.types';

const testTitles = [
  'AAPL 225.50 · TradingView',
  'RUT 2,701.87 FTSE · TradingView',
  'AAPL 1D · TradingView',
  'BTCUSDT 91,250.00 +1.5% · TradingView',
  'F 11.20 · TradingView',
  'TSLA 340.10 ▲ +2.34% · TradingView',
  'Apple Inc (NASDAQ:AAPL) Stock Price, News...',
  'Tesla Inc (TSLA)',
  'AAPL — 1D — NASDAQ · TradingView',
  'AAPL Stock Chart — NASDAQ:AAPL Quotes — TradingView',
  'Russell 2000 1D · FTSE · TradingView',
  'RUT 2,701.87 · TradingView',
  'NVDA 141.25 USD · TradingView',
  'FPT 130.50 · TradingView',
];

export function parseTradingViewTitle(title: string): { symbol: string | null; exchange: string | null; timeframe: string | null } {
  if (!title) return { symbol: null, exchange: null, timeframe: null };

  let symbol: string | null = null;
  let exchange: string | null = null;
  let timeframe: string | null = null;

  // Pattern 1: Title with timeframe (e.g. "AAPL 1D · TradingView")
  const tfMatch = title.match(/^([A-Z0-9.\-_]{1,10})\s+([0-9]+[DWMmhd]?|[DWM])\s*[·—\-]/i);
  if (tfMatch && tfMatch[1]) {
    symbol = normalizeSymbol(tfMatch[1]);
    if (tfMatch[2]) timeframe = tfMatch[2].toUpperCase();
  }

  // Pattern 2: Title with live price (e.g. "AAPL 225.50 · TradingView" or "RUT 2,701.87 FTSE · TradingView")
  if (!symbol) {
    const priceMatch = title.match(/^([A-Z0-9.\-_]{1,10})\s+[\d,.]+(?:\s+([A-Z]{2,10}))?\s*(?:[▲▼+\-−].*?)?\s*[·—\-]/i);
    if (priceMatch && priceMatch[1]) {
      symbol = normalizeSymbol(priceMatch[1]);
      if (priceMatch[2]) exchange = priceMatch[2].toUpperCase();
    }
  }

  // Pattern 3: Parenthesized ticker (e.g. "Apple Inc (NASDAQ:AAPL)" or "(TSLA)")
  if (!symbol) {
    const parenMatch = title.match(/\((?:([A-Z]+):)?([A-Z0-9]+)\)/i);
    if (parenMatch) {
      if (parenMatch[1] && parenMatch[2]) {
        exchange = parenMatch[1].trim().toUpperCase();
        symbol = normalizeSymbol(parenMatch[2]);
      } else if (parenMatch[2] || parenMatch[1]) {
        symbol = normalizeSymbol(parenMatch[2] || parenMatch[1] || '');
      }
    }
  }

  // Pattern 4: Dash separated (e.g. "AAPL — 1D — NASDAQ · TradingView" or "AAPL - Apple Inc")
  if (!symbol) {
    const dashMatch = title.match(/^([A-Z0-9.\-_]{1,10})\s+[-—]\s+/i);
    if (dashMatch && dashMatch[1]) {
      symbol = normalizeSymbol(dashMatch[1]);
    }
  }

  // Pattern 5: Generic TradingView ending
  if (!symbol && /TradingView/i.test(title)) {
    const genericMatch = title.match(/^([A-Z0-9]{1,10})\b/i);
    if (genericMatch && genericMatch[1]) {
      symbol = normalizeSymbol(genericMatch[1]);
    }
  }

  return { symbol, exchange, timeframe };
}

console.log('=== TESTING TRADINGVIEW TITLE EXTRACTION ===\n');
let failed = 0;
for (const t of testTitles) {
  const res = parseTradingViewTitle(t);
  if (!res.symbol) {
    console.error(`❌ FAILED to extract symbol from: "${t}"`);
    failed++;
  } else {
    console.log(`✅ "${t}" => symbol: ${res.symbol}, exchange: ${res.exchange || 'NONE'}, tf: ${res.timeframe || 'NONE'}`);
  }
}

if (failed > 0) {
  console.error(`\n❌ ${failed} tests failed!`);
  process.exit(1);
} else {
  console.log('\n🎉 ALL 14 TITLE EXTRACTION TESTS PASSED!\n');
}
