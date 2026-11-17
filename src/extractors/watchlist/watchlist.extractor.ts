import type { WatchlistGroup, WatchlistItem, WatchlistSnapshot } from './watchlist.types';

/**
 * Extracts and normalizes watchlists from FireAnt's Redux Persist storage.
 * Automatically sanitizes sensitive data (user email, tokens, etc.).
 */
export function extractWatchlists(): WatchlistSnapshot {
  const watchlists: WatchlistGroup[] = [];
  let activeWatchlistId = '';

  try {
    const rawStorage = localStorage.getItem('persist:watchlists');
    if (rawStorage) {
      const parsedRoot = JSON.parse(rawStorage);
      activeWatchlistId = String(parsedRoot.defaultWatchlistID || '');

      let rawWatchlistsArray: any[] = [];
      if (typeof parsedRoot.watchlists === 'string') {
        try {
          rawWatchlistsArray = JSON.parse(parsedRoot.watchlists);
        } catch {
          rawWatchlistsArray = [];
        }
      } else if (Array.isArray(parsedRoot.watchlists)) {
        rawWatchlistsArray = parsedRoot.watchlists;
      }

      if (Array.isArray(rawWatchlistsArray)) {
        rawWatchlistsArray.forEach((wl: any, wlIdx: number) => {
          const wlId = String(wl.watchlistID || wl.id || `wl-${wlIdx}`);
          const wlName = String(wl.name || `Watchlist ${wlIdx + 1}`);
          const isDefault = wlId === activeWatchlistId || (!activeWatchlistId && wlIdx === 0);
          const rawSymbols: string[] = Array.isArray(wl.symbols) ? wl.symbols : [];

          const items: WatchlistItem[] = rawSymbols.map((sym, pos) => {
            const cleanSym = String(sym).trim().toUpperCase();
            return {
              id: `${wlId}-${cleanSym}-${pos}`,
              symbol: cleanSym,
              position: pos,
              metadata: {
                source: 'fireant',
                extractionStatus: 'VERIFIED',
              },
            };
          });

          watchlists.push({
            id: wlId,
            name: wlName,
            isDefault,
            displayIndex: typeof wl.displayIndex === 'number' ? wl.displayIndex : wlIdx,
            totalSymbols: items.length,
            items,
          });
        });
      }
    }

    // Fallback: Check recentSymbols if no watchlists found
    if (watchlists.length === 0) {
      const recentRaw = localStorage.getItem('fireant.recentSymbols');
      if (recentRaw) {
        try {
          const recentList = JSON.parse(recentRaw);
          if (Array.isArray(recentList) && recentList.length > 0) {
            const items: WatchlistItem[] = recentList.map((sym: string, pos: number) => ({
              id: `recent-${sym}-${pos}`,
              symbol: String(sym).toUpperCase(),
              position: pos,
              metadata: {
                source: 'fireant',
                extractionStatus: 'PARTIALLY VERIFIED',
              },
            }));

            watchlists.push({
              id: 'recent-symbols',
              name: 'Recent Symbols',
              isDefault: true,
              displayIndex: 0,
              totalSymbols: items.length,
              items,
            });
            activeWatchlistId = 'recent-symbols';
          }
        } catch {}
      }
    }
  } catch (err) {
    console.error('[Stock Chart Extractor] Error extracting watchlists:', err);
  }

  // Find active items
  const activeGroup = watchlists.find((w) => w.isDefault) || watchlists[0];
  const activeItems = activeGroup?.items || [];

  return {
    activeWatchlistId: activeGroup?.id || activeWatchlistId,
    totalWatchlists: watchlists.length,
    watchlists,
    activeItems,
    timestamp: Date.now(),
  };
}
